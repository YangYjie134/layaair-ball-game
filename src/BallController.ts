// 声明 Laya 全局对象，供 TypeScript 识别运行时类型
declare const Laya: any;
// 从 Laya 中取出注册脚本所需的装饰器
const { regClass } = Laya;
// 导入分数管理器，用于同步分数、胜负状态和重开逻辑
import { ScoreManager } from "./ScoreManager";
import { SfxManager } from "./SfxManager";

/**
 * 移动平台运行时状态配置
 * 负责管理 Platform_* 平台的动态移动参数，包括运动方向、速度范围等。
 * 每个需要移动的平台都对应一个 MovingConfig 实例，存储在 movingConfigs Map 中。
 */
interface MovingConfig {
    axis: 'x';               // 运动轴向，第一版仅支持水平运动
    speed: number;           // 移动速度（像素/帧），建议默认值 1.5，数值越大移动越快
    rangeMin: number;        // platform.x 能到达的最左位置（单位：像素），来自左墙内侧边界
    rangeMax: number;        // platform.x 能到达的最右位置（单位：像素），来自右墙内侧边界减去平台宽度
    direction: 1 | -1;       // 当前运动方向，1 表示向右，-1 表示向左，会在边界处自动翻转
}

/**
 * 消失平台状态类型定义
 * - idle：平台初始状态，未被踩上，保持绿色可见
 * - counting：平台已被踩上，进入倒计时阶段，颜色从绿→黄→红逐步变化（800ms）
 * - hidden：倒计时结束，平台消失不可见，停止后台移动（即使配有移动参数也不再更新位置）
 */
type DisappearState = 'idle' | 'counting' | 'hidden';
type SpikeSide = 'left' | 'right';
type DeathReconstructionPhase = 'IDLE' | 'DECONSTRUCTING' | 'BUFFERING' | 'WORLD_MATERIALIZING' | 'CORE_REASSEMBLING';

interface DeathOldWorldFragment {
    node: any;
    startX: number;
    startY: number;
    driftX: number;
    driftY: number;
    spin: number;
}

interface DeathBufferFragment {
    node: any;
    baseX: number;
    baseY: number;
    orbitX: number;
    orbitY: number;
    phase: number;
    restRotation: number;
}

interface DeathPlatformDuplicate {
    node: any;
    duplicateIndex: number;
    offsetX: number;
    offsetY: number;
    phase: number;
}

interface DeathPlatformVisual {
    platform: any;
    duplicates: DeathPlatformDuplicate[];
    rank: number;
}

interface DeathGroundCanonicalState {
    platform: any;
    visible: boolean;
    alpha: number;
}

/**
 * 消失平台单块的运行时状态配置
 * 负责追踪每个消失平台的当前生命周期状态和时间戳，仅 Level 3/4 关卡启用。
 * 每个消失平台都对应一个 DisappearConfig 实例，存储在 disappearConfigs Map 中。
 */
interface DisappearConfig {
    state: DisappearState; // 当前状态：idle（绿色待踩）→ counting（倒计时预警）→ hidden（消失隐藏）
    triggerAt: number;     // 进入 counting 状态时的时间戳（ms），仅在 counting 时有效；用于计算消失倒计时进度
}

export interface BallPhysicsInput {
    restart(): boolean;
    left(): boolean;
    right(): boolean;
    jump(): boolean;
}

export interface BallPhysicsTime {
    currTimer(): number;
}

export interface BallPhysicsEnvironment {
    isWon(): boolean;
    restartGame(): void;
    playJump(): void;
    updateMovingPlatform(platform: any): void;
    resolveVerticalCollision(platform: any, time: BallPhysicsTime): void;
    syncDisappearHighlightBar(): void;
    checkHazards(): void;
    releaseGroundIfUnsupported(): void;
    clampToCanvas(): void;
    syncBallSprite(ball: any): void;
}

// 使用 regClass 装饰器注册脚本类，使其能在 Laya 编辑器中被识别
@regClass()
// 导出 BallController 类，继承 Laya.Script 以获得生命周期回调能力
export default class BallController extends Laya.Script {

    // 当前脚本采用自定义平台物理方案：
    // 球的移动、落地判断、墙体限制和复活逻辑都由脚本自行计算。
    // 这样可以避免 Box2D 在平台顶角附近反复接触/分离造成的卡顿。

    // ── 1. 运动参数：控制球的速度、重力和跳跃表现 ──
    // 水平速度（向右为正）
    private vx: number = 0;
    // 竖直速度（向下为正）
    private vy: number = 0;
    private moveAccel: number = 0.7;     // 水平加速度，越大左右启动越快。
    private maxSpeedX: number = 5;       // 水平最大速度，限制球不要越跑越快。
    private friction: number = 0.99;     // 松开方向键后的减速系数，越接近 1 滑行越久。
    private gravity: number = 0.5;       // 每帧给 vy 增加的重力。
    private jumpStrength: number = 13;   // W 跳跃力度，数值越大跳得越高。
    private bounceY: number = 0.6;       // 碰到顶墙时的垂直反弹比例。
    private bounceX: number = 0.5;       // 撞左右墙时的水平反弹比例。
    private onGround: boolean = false;   // 当前帧是否站在地面/平台上。

    // ── 2. 碰撞计算状态：记录平台激活状态与死亡复活条件 ──
    /**
     * Platform_* 平台激活标志。初值 false。
     * 从 Ground 起跳后自动置为 true，使 Platform_* 开始参与碰撞判定。
     * 目的：避免回落 Ground 时被下面的 Platform_* 意外阻挡，保证跳跃逻辑清晰。
     */
    private platformsActive: boolean = false; // 从 Ground 起跳后激活 Platform_* 碰撞
    /**
     * Ground 死亡区启用标志。初值 false。
     * 第一次踩到任何 Platform_* 后自动置为 true，允许接触 Ground 触发复活逻辑。
     * 目的：第一跳只能在 Ground 上，不会误踩下面的 Platform_* 后立即死亡。
     */
    private deathEnabled: boolean = false;    // 第一次踩到 Platform_* 后，Ground 才算死亡区
    // 球的初始出生点X坐标
    private startX: number = 0;
    // 球的初始出生点Y坐标
    private startY: number = 0;
    // 上一帧球的Y坐标（用于判断是否穿过平台顶面）
    private previousY: number = 0;
    private centerX: number = 0;         // 这里把 ball.x 当作球心 X 使用。
    private centerY: number = 0;         // 这里把 ball.y 当作球心 Y 使用。
    private groundPlatform: any = null;  // 当前托住球的平台，走出边缘后会释放。
    private topWall: any = null;         // 顶墙节点，用来计算真实可玩区域。
    private leftWall: any = null;        // 左墙节点，用来避免球钻进白墙。
    private rightWall: any = null;       // 右墙节点，用来避免球钻进白墙。

    // ── 3. 输入控制相关变量：记录按键状态，避免连续触发跳跃与重开 ──
    // 上一帧是否按下了跳跃键（用于检测按键刚按下）
    private prevJumpKey: boolean = false;
    // 上一帧是否按下了重开键 R（用于检测按键刚按下）
    private prevRestartKey: boolean = false;

    // ── 4. 关卡状态：记录当前关卡编号与四格难度 HUD ──
    private currentLevel: number = 1;
    private readonly maxLevel: number = 4;
    private levelDifficultyHud: any = null;
    private levelDifficultyCells: any[] = [];
    private levelDifficultyNumerals: any[] = [];
    private levelDeathRollbackDisplay: { level: number; fromProgress: number } | null = null;
    private rng: () => number = Math.random;

    private platforms: any[] = [];       // Platform_ 开头的节点和 Ground 都会放进这里。
    private spikes: any[] = [];          // Level 4 静态尖刺，运行时动态创建。
    private readonly spikeWidthRatio: number = 0.45; // Level 4 尖刺占平台宽度比例，越小安全区越宽。
    private disappearHighlightBar: any = null;
    private isHandlingDeath: boolean = false; // 共享死亡锁，避免同一帧重复触发死亡流程。
    /**
     * 移动平台运行时配置映射表
     * Key: 平台节点对象
     * Value: 该平台对应的 MovingConfig 配置（包含速度、方向、rangeMin/rangeMax 等）
     * 作用：updateMovingPlatform() 每帧查询此表，按 rangeMin/rangeMax 限制范围更新平台 x 坐标。
     * 生命周期：randomizePlatforms() 时根据关卡等级随机填充，respawn() 时清空。
     */
    private movingConfigs: Map<any, MovingConfig> = new Map();
    /**
     * 消失平台延迟消失时间常数（毫秒）
     * 小球踩上消失平台后，平台进入 counting 状态，经过此延迟后进入 hidden 状态并消失。
     * 同时支持颜色预警：0-20% 绿→黄，80-100% 黄→红，视觉提示玩家平台即将消失。
     */
    private static readonly DISAPPEAR_DELAY: number = 800;
    /**
     * 消失平台状态映射表
     * Key: 平台节点对象
     * Value: 该平台对应的 DisappearConfig 配置（包含状态、触发时间戳等）
     * 作用：onUpdate() 中每帧检查计时进度，更新颜色预警，判断是否消失。
     * 启用条件：仅 Level 3/4 关卡通过 setupDisappearPlatforms() 填充；低于 Level 3 时为空。
     */
    private disappearConfigs: Map<any, DisappearConfig> = new Map();

    public setRandomSource(rng: () => number): void {
        this.rng = rng;
    }

    // 初始化时记录出生点并收集平台与墙体节点，后续碰撞逻辑将以这些节点为基准
    onAwake(): void {
        // 获取当前脚本所属的球体节点
        const ball = this.owner as any;
        if (ball) {
            // [死亡/重生系统] 只在初始化时记录出生点，不能在 onUpdate 中每帧覆盖。
            // 记录初始位置作为球心X坐标
            this.centerX = ball.x;
            // 记录初始位置作为球心Y坐标
            this.centerY = ball.y;
            // 记录出生点X坐标
            this.startX = this.centerX;
            // 记录出生点Y坐标
            this.startY = this.centerY;
        }
        // 游戏启动时先记录平台和墙体节点，后续碰撞都靠这些节点的位置计算。
        // 收集场景中的所有平台
        this.collectPlatforms();
        this.createLevelDifficultyBar();
    }

    // 每帧更新，处理输入、重力、跳跃和碰撞等逻辑
    onUpdate(): void {
        // 获取球的节点
        const ball = this.owner as any;
        if (!ball) return;

        this.stepPhysics(
            ball,
            {
                restart: () => this.isKeyDown(Laya.Keyboard.R),
                left: () => this.isKeyDown(Laya.Keyboard.LEFT, Laya.Keyboard.A),
                right: () => this.isKeyDown(Laya.Keyboard.RIGHT, Laya.Keyboard.D),
                jump: () => this.isKeyDown(Laya.Keyboard.W) || this.isKeyDown(Laya.Keyboard.UP),
            },
            {
                currTimer: () => Laya.timer.currTimer,
            },
            {
                isWon: () => ScoreManager.instance.isWon(),
                restartGame: () => this.restartGame(),
                playJump: () => SfxManager.playJump(),
                updateMovingPlatform: (platform: any) => this.updateMovingPlatform(platform),
                resolveVerticalCollision: (platform: any, time: BallPhysicsTime) => this.resolveVerticalCollision(platform, time),
                syncDisappearHighlightBar: () => this.syncDisappearHighlightBar(),
                checkHazards: () => this.checkHazards(),
                releaseGroundIfUnsupported: () => this.releaseGroundIfUnsupported(),
                clampToCanvas: () => this.clampToCanvas(),
                syncBallSprite: (target: any) => this.syncBallSprite(target),
            },
        );
    }
    public stepPhysics(ball: any, input: BallPhysicsInput, time: BallPhysicsTime, env: BallPhysicsEnvironment): void {

        // ── 步骤 0：胜利后按 R 重开本局（最先检测，命中则跳过本帧后续逻辑）──
        const restart = input.restart();// 检测重开按键 R 是否按下
        if (restart && !this.prevRestartKey && env.isWon()) {// 按下 R 且之前未按下，且游戏已胜利
            this.prevRestartKey = restart;// 记录本帧的重开按键状态，用于下帧判断是否按键刚按下
            env.restartGame();// 调用 restartGame() 方法，重开本局并切换到下一关的随机平台布局
            return;// 跳过本帧后续逻辑，避免在胜利状态下继续处理物理和碰撞
        }
        this.prevRestartKey = restart;// 记录本帧的重开按键状态，用于下帧判断是否按键刚按下

        // Laya 里这个小球的绘制圆心正好在节点坐标上，所以这里直接把 ball.x/y 当球心。
        // 更新球的当前X坐标
        this.centerX = ball.x;
        // 更新球的当前Y坐标
        this.centerY = ball.y;
        // [死亡/重生系统] 已移动到 onAwake，只能记录一次。
        // this.startX = this.centerX;
        // this.startY = this.centerY;
        // ── 步骤 1：读取输入并更新水平速度 ──
        // 只用 Laya.InputManager 轮询：每帧都重新读取真实按键状态，
        // 天然不会出现窗口失焦后"卡键"（原生 keydown/keyup 漏掉 keyup）的问题。
        // 检测左移按键（LEFT或A）
        const left = input.left();
        // 检测右移按键（RIGHT或D）
        const right = input.right();
        // 检测跳跃按键（W 或 up）
        const jump = input.jump();
        if (this.holdDeathReconstructionLock(ball, jump, env)) return;

        // 如果按下左键则向左加速
        if (left) this.vx -= this.moveAccel;
        // 如果按下右键则向右加速
        if (right) this.vx += this.moveAccel;

        // 松开方向键时施加摩擦力减速
        if (!left && !right) {
            // 水平速度乘以摩擦系数减速
            this.vx *= this.friction;
            // 如果速度非常小，则设为0（防止数值漂移）
            if (Math.abs(this.vx) < 0.05) this.vx = 0;
        }

        // 限制最大水平速度，避免长按方向键后速度无限增大。
        // 限制水平速度在最大值范围内
        this.vx = Math.max(-this.maxSpeedX, Math.min(this.maxSpeedX, this.vx));
        // ── 步骤 2：应用重力 ──
        // 每帧增加重力加速度到竖直速度
        this.vy += this.gravity;

        // ── 步骤 3：跳跃逻辑 ──
        // prevJumpKey 用来保证按住 W 时只跳一次，不会每一帧连续起跳。
        // 检测跳跃（按下W、之前未按下、且球在地面上,且游戏未胜利）
        if (jump && !this.prevJumpKey && this.onGround && !env.isWon()) {
            // 从 Ground 主动起跳后，Platform_* 才开始参与碰撞。
            // 此处 groundPlatform 反映的是上一帧落地结果（重置发生在跳跃判断之后）
            if (!this.platformsActive && this.groundPlatform?.name === "Ground") {// Ground 起跳后激活 Platform_* 碰撞
                this.platformsActive = true;// 激活平台碰撞，使 Platform_* 开始参与碰撞判定
                console.log("Platforms active");
            }
            // 设置向上的初始速度
            this.vy = -this.jumpStrength;
            env.playJump();
            // 标记不在地面
            this.onGround = false;
            // 清除平台参考
            this.groundPlatform = null;// Ground 起跳后清除 groundPlatform，避免在空中仍然引用 Ground 平台
        }
        // 记录本帧的跳跃按键状态，用于下帧判断是否按键刚按下
        this.prevJumpKey = jump;

        // 每一帧先假设球在空中；只有后面的平台判定成功，才会重新设为落地。
        // 重置落地状态
        this.onGround = false;
        // 重置平台参考
        this.groundPlatform = null;

        // ── 步骤 4：分轴移动。先 Y 后 X，可以减少平台边缘和顶角处的混乱判定。 ──
        // 先保存移动前的 Y，用"上一帧底部是否在平台上方"判断是否穿过平台顶面。
        // 记录移动前的Y坐标
        this.previousY = this.centerY;
        this.centerY += this.vy;
        // 推进消失平台计时并刷新预警颜色:counting 超过延迟则消失
        const nowMs = time.currTimer();
        for (const [p, cfg] of this.disappearConfigs) {
            if (cfg.state === 'counting') {
                const elapsedMs = nowMs - cfg.triggerAt;
                const progress = Math.max(0, Math.min(1, elapsedMs / BallController.DISAPPEAR_DELAY));
                let warningColor = "#ffff00";

                if (progress < 0.2) {
                    // 0%~20%:绿色逐步过渡到黄色
                    const rate = progress / 0.2;
                    const red = Math.round(255 * rate);
                    warningColor = "#" + ("0" + red.toString(16)).slice(-2) + "ff00";
                } else if (progress >= 0.8) {
                    // 80%~100%:黄色逐步过渡到红色
                    const rate = (progress - 0.8) / 0.2;
                    const green = Math.round(255 * (1 - rate));
                    warningColor = "#ff" + ("0" + green.toString(16)).slice(-2) + "00";
                }

                this.repaintPlatformColor(p, warningColor);

                if (elapsedMs >= BallController.DISAPPEAR_DELAY) {
                    cfg.state = 'hidden';
                    p.visible = false;
                }
            }
        }
        // 检测垂直方向的碰撞
        for (const platform of this.platforms) {
            env.updateMovingPlatform(platform);// 新增：先更新移动平台位置
            env.resolveVerticalCollision(platform, time);// 检测球是否与平台发生垂直碰撞，并处理落地逻辑
            if (this.isDeathReconstructionActive()) return;
        }
        env.syncDisappearHighlightBar();
        // 平台是单向平台：只处理从上往下落到平台顶面，不处理平台侧面和底面。
        // 应用水平速度移动
        this.centerX += this.vx;
        // 尖刺检测放在 X 位移之后，读取本帧最终球心 X（消除 ~5px 半帧滞后）；
        // 仍在 clampToCanvas 之前，保持“尖刺死亡优先于掉落死亡”的同帧判定顺序。
        env.checkHazards();
        if (this.isDeathReconstructionActive()) return;
        env.releaseGroundIfUnsupported();// 检查球是否离开平台边缘，如果离开则取消落地状态，让球自然下落。

        // 最后处理顶墙、左右墙和掉出屏幕保护，再把结果写回节点一次。
        // 检测边界碰撞
        env.clampToCanvas();// 检查球是否撞到墙体边界，并处理反弹和位置限制，同时检测是否掉出屏幕底部并触发复活逻辑
        if (this.isDeathReconstructionActive()) return;
        // 将球的位置同步回Laya节点
        env.syncBallSprite(ball);// 将计算后的球心坐标写回 Laya 节点，更新球的实际显示位置
    }

    /**
     * 单向平台垂直碰撞检测与落地处理
     *
     * 核心原理：只有"球正在下落，且球底部从平台上方穿过平台顶面"时，才把球放到平台上。
     * 这样平台侧面和底面不会产生碰撞，避开了 Box2D 顶角处的反复接触/分离卡顿。
     *
     * 流程：
     * 1. 检查平台是否已消失（hidden）或未激活（Platform_* 但 platformsActive=false）
     * 2. 计算球心、球半径、平台几何关系
     * 3. 判断"穿过判定"：上一帧在平台上方，本帧在平台下方 → 视为跨过顶面
     * 4. 若穿过且水平范围内，更新落地状态、速度、平台引用
     * 5. Ground 平台落地时检查 deathEnabled 标志决定是否复活
     * 6. Platform_* 落地时触发计分和消失平台计时
     */
    private resolveVerticalCollision(platform: any, time: BallPhysicsTime): void {
        // 已消失的平台不参与碰撞(visible=false 仅隐藏显示,必须在此显式跳过)
        const dcSkip = this.disappearConfigs.get(platform);
        if (dcSkip && dcSkip.state === 'hidden') return;

        // 平台未激活时，所有 Platform_* 都不参与碰撞（像不存在一样）。
        // 只跳过当前这一个平台，循环里后面的 Ground 仍会被检测，不会穿地。
        const name = platform?.name;
        if (!this.platformsActive && typeof name === "string" && name.indexOf("Platform_") === 0) {
            return;
        }

        // 获取球的半径用于计算碰撞判定
        const radius = this.getBallRadius();
        // 获取平台的X坐标
        const platformX = platform.x || 0;
        // 获取平台的Y坐标
        const platformY = platform.y || 0;
        // 获取平台的宽度
        const platformWidth = platform.width || 0;
        // 计算平台顶面的Y坐标
        const platformTop = platformY;
        // 上一帧球的底部Y坐标（用于判断是否穿过平台）
        const previousBottom = this.previousY + radius;
        // 当前帧球的底部Y坐标
        const currentBottom = this.centerY + radius;
        // 获取平台边缘的容差值
        const edgeGrace = this.getPlatformEdgeGrace(radius);
        // 判断球的水平位置是否在平台范围内（加上容差）
        const withinTop = this.centerX >= platformX - edgeGrace && this.centerX <= platformX + platformWidth + edgeGrace;
        // 判断球是否穿过了平台的顶面
        const crossedTop = previousBottom <= platformTop + 0.5 && currentBottom >= platformTop - 0.5;//don‘t know

        // vy >= 0 表示只在下落时落地；向上跳顶到平台底部时直接穿过。
        // crossedTop 通过上一帧和本帧底部位置判断是否跨过平台顶面，避免卡在平台边缘。
        // 只有当球正在下落且穿过平台顶面时才视为落地
        if (this.vy >= 0 && withinTop && crossedTop) {
            // 将球放在平台顶部
            this.centerY = platformTop - radius;
            // 取消竖直速度
            this.vy = 0;
            // 标记为落地
            this.onGround = true;
            this.groundPlatform = platform;

            // 获取平台名称
            const platformName = platform?.name || "";
            // 如果触碰地面且游戏已开始，则重新生成
            if (platformName === "Ground") {
                // 已胜利时不要触发死亡复活：respawn() 会调用 ScoreManager.reset()
                // 把 hasWon 一起清掉，导致胜利画面消失且 R 重开失效。
                if (this.deathEnabled && !ScoreManager.instance.isWon()) {
                    this.handleDeath();
                }
                return;
            }

            // 如果是Platform_开头的平台（此时 platformsActive 必为 true，未激活已在函数开头被拦截）
            if (typeof platformName === "string" && platformName.indexOf("Platform_") === 0) {
                this.deathEnabled = true;
                this.syncGroundVisual();
                // 按 Set 去重逻辑正常加分
                ScoreManager.instance.addPlatformScore(platform);
                // 消失平台:首次踩上时开始计时(幂等,仅 idle -> counting)
                const dc = this.disappearConfigs.get(platform);
                if (dc && dc.state === 'idle') {
                    dc.state = 'counting';
                    dc.triggerAt = time.currTimer();
                }
            }
        }
    }

    private levelTransitionHandler: ((level: number, resume: () => void) => void) | null = null;
    private levelTransitionPending: boolean = false;
    private visualLoopStarted: boolean = false;
    private static readonly PLATFORM_LANDING_IMPACT_DURATION_MS: number = 120;
    private static readonly PLATFORM_LANDING_IMPACT_MAX_Y: number = 3;
    private static readonly BALL_ENERGY_STAGE_COUNT: number = 5;
    private static readonly BALL_ENERGY_ABSORPTION_DURATION_MS: number = 500;
    private static readonly BALL_ENERGY_CHECKPOINT_PALETTES = [
        {
            auraOuter: [22, 77, 104],
            auraInner: [37, 139, 192],
            shellOuter: [7, 24, 36],
            shellOuterStroke: [116, 250, 255],
            shellPanel: [11, 38, 55],
            shellPanelStroke: [53, 233, 255],
            coreOuter: [25, 220, 232],
            coreOuterStroke: [216, 255, 255],
            coreInner: [244, 255, 255],
            circuitPrimary: [169, 108, 255],
            circuitSecondary: [83, 248, 255],
            circuitNode: [247, 181, 255],
            trailOuter: [20, 82, 112],
            trailStroke: [66, 245, 255],
            trailInner: [69, 241, 255],
        },
        {
            auraOuter: [24, 47, 106],
            auraInner: [82, 62, 215],
            shellOuter: [8, 20, 46],
            shellOuterStroke: [158, 132, 255],
            shellPanel: [16, 28, 73],
            shellPanelStroke: [124, 105, 255],
            coreOuter: [112, 82, 255],
            coreOuterStroke: [228, 244, 255],
            coreInner: [255, 255, 255],
            circuitPrimary: [194, 123, 255],
            circuitSecondary: [98, 183, 255],
            circuitNode: [244, 197, 255],
            trailOuter: [23, 54, 109],
            trailStroke: [132, 120, 255],
            trailInner: [158, 150, 255],
        },
        {
            auraOuter: [55, 22, 108],
            auraInner: [135, 45, 225],
            shellOuter: [24, 10, 52],
            shellOuterStroke: [215, 150, 255],
            shellPanel: [38, 16, 75],
            shellPanelStroke: [175, 80, 255],
            coreOuter: [175, 60, 255],
            coreOuterStroke: [248, 215, 255],
            coreInner: [255, 255, 255],
            circuitPrimary: [255, 105, 215],
            circuitSecondary: [180, 120, 255],
            circuitNode: [255, 205, 245],
            trailOuter: [70, 30, 112],
            trailStroke: [185, 95, 255],
            trailInner: [220, 140, 255],
        },
        {
            auraOuter: [95, 22, 75],
            auraInner: [215, 55, 145],
            shellOuter: [46, 12, 38],
            shellOuterStroke: [255, 150, 205],
            shellPanel: [70, 18, 55],
            shellPanelStroke: [255, 90, 165],
            coreOuter: [250, 55, 150],
            coreOuterStroke: [255, 220, 240],
            coreInner: [255, 255, 255],
            circuitPrimary: [255, 185, 80],
            circuitSecondary: [255, 100, 175],
            circuitNode: [255, 235, 175],
            trailOuter: [98, 28, 68],
            trailStroke: [250, 75, 150],
            trailInner: [255, 135, 185],
        },
        {
            auraOuter: [125, 28, 75],
            auraInner: [255, 185, 45],
            shellOuter: [38, 14, 32],
            shellOuterStroke: [255, 220, 115],
            shellPanel: [62, 20, 48],
            shellPanelStroke: [255, 190, 65],
            coreOuter: [255, 210, 50],
            coreOuterStroke: [255, 250, 200],
            coreInner: [255, 255, 255],
            circuitPrimary: [255, 245, 160],
            circuitSecondary: [255, 155, 45],
            circuitNode: [255, 255, 255],
            trailOuter: [115, 32, 70],
            trailStroke: [255, 165, 60],
            trailInner: [255, 225, 110],
        },
    ];
    private platformLandingImpactStarts: Map<any, number> = new Map();
    private platformLandingContact: any = null;
    private static readonly DISAPPEAR_HIDDEN_COOLDOWN_MS: number = 2000;
    private static readonly DISAPPEAR_REBUILDING_MS: number = 400;
    private disappearRecoveryStates: Map<any, {
        state: "ACTIVE" | "WARNING" | "HIDDEN_COOLDOWN" | "REBUILDING";
        enteredAt: number;
        visual: any;
    }> = new Map();
    private visualPhase: number = 0;
    private groundVisual: any = null;
    private groundEnergy: any = null;
    private ballVisualRoot: any = null;
    private ballAura: any = null;
    private ballShell: any = null;
    private ballCore: any = null;
    private ballCircuits: any = null;
    private ballVisualScaleX: number = 1;
    private ballVisualScaleY: number = 1;
    private ballVisualStateReady: boolean = false;
    private ballWasGrounded: boolean = false;
    private ballLastVy: number = 0;
    private ballEnergyObservedLevel: number = 1;
    private ballEnergyObservedScore: number = 0;
    private ballEnergyTransitionFrom: number = 0;
    private ballEnergyTransitionTo: number = 0;
    private ballEnergyTransitionStartedAt: number = 0;
    private ballEnergyTransitionActive: boolean = false;
    private ballEnergyVisualProgress: number = 0;
    private ballEnergyEvolutionStrength: number = 0;
    private ballEnergyRenderedLevel: number = 0;
    private ballEnergyRenderedProgress: number = -1;
    private ballTrailNodes: any[] = [];
    private ballTrailHistory: Array<{ x: number; y: number; scaleX: number; scaleY: number }> = [];
    private ballTrailLastX: number = 0;
    private ballTrailLastY: number = 0;
    private boundaryVisuals: Array<{ root: any; scan: any; length: number; phaseOffset: number }> = [];
    private shakeTarget: any = null;
    private shakeBaseX: number = 0;
    private shakeBaseY: number = 0;
    private shakeStartedAt: number = 0;
    private deathFlash: any = null;
    private deathFlashStartedAt: number = 0;
    private deathFragmentLayer: any = null;
    private deathFragmentStartedAt: number = 0;
    private deathFragmentOriginX: number = 0;
    private deathFragmentOriginY: number = 0;
    private deathFragments: Array<{ node: any; vx: number; vy: number; spin: number }> = [];
    private static readonly DEATH_RECONSTRUCTION_DURATION_MS: number = 3000;
    private static readonly DEATH_DECONSTRUCT_END_MS: number = 300;
    private static readonly DEATH_WORLD_MATERIALIZE_START_MS: number = 2100;
    private static readonly DEATH_CORE_REASSEMBLY_START_MS: number = 2550;
    private static readonly DEATH_PLATFORM_LOCK_THRESHOLD: number = 0.98;
    private static readonly DEATH_BALL_SHARD_COUNT: number = 8;
    private static readonly DEATH_BUFFER_FRAGMENT_COUNT: number = 24;
    private static readonly DEATH_OLD_WORLD_FRAGMENT_BUDGET: number = 24;
    private static readonly DEATH_PLATFORM_DUPLICATE_COUNT: number = 2;
    private static readonly DEATH_COUNTDOWN_BEAT_MS: number = 600;
    private static readonly DEATH_COUNTDOWN_STRUCTURAL_SEGMENT_COUNT: number = 6;
    private static readonly DEATH_COUNTDOWN_DIGIT_SCALE: number = 0.72;
    private static readonly DEATH_RETICLE_SCALE: number = 0.72;
    private static readonly DEATH_RETICLE_COLORS: Record<DeathReticleTone, string> = {
        PRIMARY: "#42D7FF",
        ENERGY: "#2F8FFF",
        SOFT: "#B9ECFF",
        DARK: "#0A3D86",
    };
    private static readonly DEATH_RETICLE_TEMPLATES: DeathReticleTemplate[] = [
        {
            id: 'TEMPLATE_A',
            animation: 'CORNER_LOCK',
            parts: [
                { x: -0.61, y: -0.72, length: 0.34, thickness: 0.022, rotation: 0, tone: 'PRIMARY' },
                { x: -0.78, y: -0.55, length: 0.28, thickness: 0.022, rotation: 90, tone: 'ENERGY' },
                { x: -0.79, y: -0.75, length: 0.19, thickness: 0.026, rotation: -45, tone: 'SOFT' },
                { x: 0.61, y: -0.72, length: 0.34, thickness: 0.022, rotation: 0, tone: 'PRIMARY' },
                { x: 0.78, y: -0.55, length: 0.28, thickness: 0.022, rotation: 90, tone: 'ENERGY' },
                { x: 0.79, y: -0.75, length: 0.19, thickness: 0.026, rotation: 45, tone: 'SOFT' },
                { x: -0.61, y: 0.72, length: 0.34, thickness: 0.022, rotation: 0, tone: 'PRIMARY' },
                { x: -0.78, y: 0.55, length: 0.28, thickness: 0.022, rotation: 90, tone: 'ENERGY' },
                { x: -0.79, y: 0.75, length: 0.19, thickness: 0.026, rotation: 45, tone: 'SOFT' },
                { x: 0.61, y: 0.72, length: 0.34, thickness: 0.022, rotation: 0, tone: 'PRIMARY' },
                { x: 0.78, y: 0.55, length: 0.28, thickness: 0.022, rotation: 90, tone: 'ENERGY' },
                { x: 0.79, y: 0.75, length: 0.19, thickness: 0.026, rotation: -45, tone: 'SOFT' },
                { x: 0, y: -0.88, length: 0.12, thickness: 0.014, rotation: 90, tone: 'DARK' },
                { x: 0, y: 0.88, length: 0.12, thickness: 0.014, rotation: 90, tone: 'DARK' },
            ],
        },
        {
            id: 'TEMPLATE_B',
            animation: 'SIDE_DEPLOY',
            parts: [
                { x: -0.82, y: 0, length: 0.48, thickness: 0.022, rotation: 90, tone: 'PRIMARY' },
                { x: -0.70, y: -0.34, length: 0.25, thickness: 0.022, rotation: 0, tone: 'ENERGY' },
                { x: -0.70, y: 0.34, length: 0.25, thickness: 0.022, rotation: 0, tone: 'ENERGY' },
                { x: 0.82, y: 0, length: 0.48, thickness: 0.022, rotation: 90, tone: 'PRIMARY' },
                { x: 0.70, y: -0.34, length: 0.25, thickness: 0.022, rotation: 0, tone: 'ENERGY' },
                { x: 0.70, y: 0.34, length: 0.25, thickness: 0.022, rotation: 0, tone: 'ENERGY' },
                { x: -0.30, y: -0.82, length: 0.16, thickness: 0.018, rotation: 90, tone: 'DARK' },
                { x: 0, y: -0.86, length: 0.21, thickness: 0.024, rotation: 90, tone: 'SOFT' },
                { x: 0.30, y: -0.82, length: 0.16, thickness: 0.018, rotation: 90, tone: 'DARK' },
                { x: -0.30, y: 0.82, length: 0.16, thickness: 0.018, rotation: 90, tone: 'DARK' },
                { x: 0, y: 0.86, length: 0.21, thickness: 0.024, rotation: 90, tone: 'SOFT' },
                { x: 0.30, y: 0.82, length: 0.16, thickness: 0.018, rotation: 90, tone: 'DARK' },
                { x: -0.94, y: 0, length: 0.10, thickness: 0.014, rotation: 0, tone: 'DARK' },
                { x: 0.94, y: 0, length: 0.10, thickness: 0.014, rotation: 0, tone: 'DARK' },
            ],
        },
        {
            id: 'TEMPLATE_C',
            animation: 'DUAL_ALIGN',
            parts: [
                { x: -0.24, y: -0.69, length: 0.28, thickness: 0.021, rotation: -45, tone: 'PRIMARY' },
                { x: -0.56, y: -0.37, length: 0.28, thickness: 0.021, rotation: -45, tone: 'ENERGY' },
                { x: 0.24, y: -0.69, length: 0.28, thickness: 0.021, rotation: 45, tone: 'PRIMARY' },
                { x: 0.56, y: -0.37, length: 0.28, thickness: 0.021, rotation: 45, tone: 'ENERGY' },
                { x: 0.56, y: 0.37, length: 0.28, thickness: 0.021, rotation: -45, tone: 'ENERGY' },
                { x: 0.24, y: 0.69, length: 0.28, thickness: 0.021, rotation: -45, tone: 'PRIMARY' },
                { x: -0.24, y: 0.69, length: 0.28, thickness: 0.021, rotation: 45, tone: 'PRIMARY' },
                { x: -0.56, y: 0.37, length: 0.28, thickness: 0.021, rotation: 45, tone: 'ENERGY' },
                { x: -0.42, y: -0.42, length: 0.20, thickness: 0.018, rotation: 0, tone: 'DARK' },
                { x: -0.50, y: -0.34, length: 0.16, thickness: 0.018, rotation: 90, tone: 'SOFT' },
                { x: 0.42, y: -0.42, length: 0.20, thickness: 0.018, rotation: 0, tone: 'DARK' },
                { x: 0.50, y: -0.34, length: 0.16, thickness: 0.018, rotation: 90, tone: 'SOFT' },
                { x: -0.42, y: 0.42, length: 0.20, thickness: 0.018, rotation: 0, tone: 'DARK' },
                { x: -0.50, y: 0.34, length: 0.16, thickness: 0.018, rotation: 90, tone: 'SOFT' },
                { x: 0.42, y: 0.42, length: 0.20, thickness: 0.018, rotation: 0, tone: 'DARK' },
                { x: 0.50, y: 0.34, length: 0.16, thickness: 0.018, rotation: 90, tone: 'SOFT' },
                { x: 0, y: -0.88, length: 0.12, thickness: 0.014, rotation: 90, tone: 'ENERGY' },
                { x: 0, y: 0.88, length: 0.12, thickness: 0.014, rotation: 90, tone: 'ENERGY' },
            ],
        },
        {
            id: 'TEMPLATE_D',
            animation: 'SEQUENTIAL_LIGHT',
            parts: [
                { x: 0, y: -0.76, length: 0.30, thickness: 0.025, rotation: 90, tone: 'SOFT' },
                { x: 0.76, y: 0, length: 0.30, thickness: 0.025, rotation: 0, tone: 'SOFT' },
                { x: 0, y: 0.76, length: 0.30, thickness: 0.025, rotation: 90, tone: 'SOFT' },
                { x: -0.76, y: 0, length: 0.30, thickness: 0.025, rotation: 0, tone: 'SOFT' },
                { x: 0.43, y: -0.69, length: 0.14, thickness: 0.018, rotation: 32, tone: 'ENERGY' },
                { x: 0.69, y: -0.43, length: 0.14, thickness: 0.018, rotation: 58, tone: 'DARK' },
                { x: 0.69, y: 0.43, length: 0.14, thickness: 0.018, rotation: -58, tone: 'ENERGY' },
                { x: 0.43, y: 0.69, length: 0.14, thickness: 0.018, rotation: -32, tone: 'DARK' },
                { x: -0.43, y: 0.69, length: 0.14, thickness: 0.018, rotation: 32, tone: 'ENERGY' },
                { x: -0.69, y: 0.43, length: 0.14, thickness: 0.018, rotation: 58, tone: 'DARK' },
                { x: -0.69, y: -0.43, length: 0.14, thickness: 0.018, rotation: -58, tone: 'ENERGY' },
                { x: -0.43, y: -0.69, length: 0.14, thickness: 0.018, rotation: -32, tone: 'DARK' },
                { x: -0.16, y: -0.92, length: 0.08, thickness: 0.013, rotation: 0, tone: 'DARK' },
                { x: 0.16, y: 0.92, length: 0.08, thickness: 0.013, rotation: 0, tone: 'DARK' },
            ],
        },
        {
            id: 'TEMPLATE_E',
            animation: 'VERTICAL_CONVERGE',
            parts: [
                { x: 0, y: -0.80, length: 0.43, thickness: 0.024, rotation: 0, tone: 'PRIMARY' },
                { x: -0.47, y: -0.76, length: 0.24, thickness: 0.018, rotation: 0, tone: 'DARK' },
                { x: 0.50, y: -0.76, length: 0.17, thickness: 0.022, rotation: 0, tone: 'SOFT' },
                { x: -0.16, y: -0.68, length: 0.17, thickness: 0.018, rotation: 90, tone: 'ENERGY' },
                { x: 0, y: 0.80, length: 0.34, thickness: 0.024, rotation: 0, tone: 'PRIMARY' },
                { x: -0.50, y: 0.76, length: 0.17, thickness: 0.022, rotation: 0, tone: 'SOFT' },
                { x: 0.45, y: 0.76, length: 0.27, thickness: 0.018, rotation: 0, tone: 'DARK' },
                { x: 0.18, y: 0.68, length: 0.17, thickness: 0.018, rotation: 90, tone: 'ENERGY' },
                { x: -0.75, y: -0.30, length: 0.24, thickness: 0.023, rotation: -42, tone: 'ENERGY' },
                { x: -0.78, y: 0.27, length: 0.20, thickness: 0.019, rotation: 42, tone: 'DARK' },
                { x: 0.75, y: -0.30, length: 0.24, thickness: 0.023, rotation: 42, tone: 'ENERGY' },
                { x: 0.78, y: 0.27, length: 0.20, thickness: 0.019, rotation: -42, tone: 'DARK' },
                { x: -0.90, y: 0, length: 0.11, thickness: 0.014, rotation: 0, tone: 'DARK' },
                { x: 0.90, y: 0, length: 0.11, thickness: 0.014, rotation: 0, tone: 'DARK' },
            ],
        },
        {
            id: 'TEMPLATE_F',
            animation: 'FRAGMENT_LOCK',
            parts: [
                { x: 0, y: -0.82, length: 0.30, thickness: 0.024, rotation: 0, tone: 'SOFT' },
                { x: 0.45, y: -0.70, length: 0.25, thickness: 0.020, rotation: 32, tone: 'PRIMARY' },
                { x: 0.73, y: -0.39, length: 0.22, thickness: 0.019, rotation: 62, tone: 'ENERGY' },
                { x: 0.80, y: 0.14, length: 0.26, thickness: 0.022, rotation: 96, tone: 'DARK' },
                { x: 0.59, y: 0.61, length: 0.28, thickness: 0.020, rotation: -45, tone: 'PRIMARY' },
                { x: 0.10, y: 0.82, length: 0.24, thickness: 0.024, rotation: -5, tone: 'SOFT' },
                { x: -0.42, y: 0.72, length: 0.25, thickness: 0.020, rotation: 30, tone: 'ENERGY' },
                { x: -0.76, y: 0.34, length: 0.24, thickness: 0.021, rotation: 70, tone: 'PRIMARY' },
                { x: -0.76, y: -0.28, length: 0.19, thickness: 0.019, rotation: -72, tone: 'DARK' },
                { x: -0.44, y: -0.70, length: 0.28, thickness: 0.021, rotation: -32, tone: 'ENERGY' },
                { x: -0.43, y: -0.36, length: 0.18, thickness: 0.018, rotation: 0, tone: 'DARK' },
                { x: 0.43, y: -0.36, length: 0.18, thickness: 0.018, rotation: 0, tone: 'DARK' },
                { x: -0.43, y: 0.36, length: 0.18, thickness: 0.018, rotation: 0, tone: 'DARK' },
                { x: 0.43, y: 0.36, length: 0.18, thickness: 0.018, rotation: 0, tone: 'DARK' },
                { x: 0.88, y: -0.12, length: 0.09, thickness: 0.014, rotation: 90, tone: 'ENERGY' },
                { x: -0.88, y: 0.12, length: 0.09, thickness: 0.014, rotation: 90, tone: 'ENERGY' },
            ],
        },
        {
            id: 'TEMPLATE_G',
            animation: 'SEQUENTIAL_LIGHT',
            parts: [
                { x: -0.43, y: -0.68, length: 0.36, thickness: 0.022, rotation: 30, tone: 'PRIMARY' },
                { x: 0.43, y: -0.68, length: 0.36, thickness: 0.022, rotation: -30, tone: 'ENERGY' },
                { x: -0.72, y: -0.34, length: 0.28, thickness: 0.020, rotation: 90, tone: 'SOFT' },
                { x: 0.72, y: -0.34, length: 0.22, thickness: 0.019, rotation: 90, tone: 'DARK' },
                { x: -0.72, y: 0.34, length: 0.22, thickness: 0.019, rotation: 90, tone: 'DARK' },
                { x: 0.72, y: 0.34, length: 0.28, thickness: 0.020, rotation: 90, tone: 'SOFT' },
                { x: -0.43, y: 0.68, length: 0.36, thickness: 0.022, rotation: -30, tone: 'ENERGY' },
                { x: 0.43, y: 0.68, length: 0.36, thickness: 0.022, rotation: 30, tone: 'PRIMARY' },
                { x: 0, y: -0.86, length: 0.11, thickness: 0.014, rotation: 90, tone: 'ENERGY' },
                { x: 0.86, y: 0, length: 0.11, thickness: 0.014, rotation: 0, tone: 'DARK' },
                { x: 0, y: 0.86, length: 0.11, thickness: 0.014, rotation: 90, tone: 'DARK' },
                { x: -0.86, y: 0, length: 0.11, thickness: 0.014, rotation: 0, tone: 'ENERGY' },
            ],
        },
        {
            id: 'TEMPLATE_H',
            animation: 'CORNER_LOCK',
            parts: [
                { x: -0.47, y: -0.52, length: 0.18, thickness: 0.022, rotation: 0, tone: 'SOFT' },
                { x: -0.58, y: -0.41, length: 0.20, thickness: 0.022, rotation: 90, tone: 'PRIMARY' },
                { x: 0.47, y: -0.52, length: 0.18, thickness: 0.022, rotation: 0, tone: 'SOFT' },
                { x: 0.58, y: -0.41, length: 0.20, thickness: 0.022, rotation: 90, tone: 'PRIMARY' },
                { x: -0.47, y: 0.52, length: 0.18, thickness: 0.022, rotation: 0, tone: 'SOFT' },
                { x: -0.58, y: 0.41, length: 0.20, thickness: 0.022, rotation: 90, tone: 'ENERGY' },
                { x: 0.47, y: 0.52, length: 0.18, thickness: 0.022, rotation: 0, tone: 'SOFT' },
                { x: 0.58, y: 0.41, length: 0.20, thickness: 0.022, rotation: 90, tone: 'ENERGY' },
                { x: -0.67, y: -0.73, length: 0.20, thickness: 0.018, rotation: 0, tone: 'DARK' },
                { x: -0.79, y: -0.61, length: 0.22, thickness: 0.018, rotation: 90, tone: 'ENERGY' },
                { x: 0.67, y: -0.73, length: 0.20, thickness: 0.018, rotation: 0, tone: 'DARK' },
                { x: 0.79, y: -0.61, length: 0.22, thickness: 0.018, rotation: 90, tone: 'ENERGY' },
                { x: -0.67, y: 0.73, length: 0.20, thickness: 0.018, rotation: 0, tone: 'DARK' },
                { x: -0.79, y: 0.61, length: 0.22, thickness: 0.018, rotation: 90, tone: 'PRIMARY' },
                { x: 0.67, y: 0.73, length: 0.20, thickness: 0.018, rotation: 0, tone: 'DARK' },
                { x: 0.79, y: 0.61, length: 0.22, thickness: 0.018, rotation: 90, tone: 'PRIMARY' },
                { x: 0.88, y: -0.20, length: 0.08, thickness: 0.013, rotation: 0, tone: 'DARK' },
                { x: 0.88, y: -0.04, length: 0.13, thickness: 0.014, rotation: 0, tone: 'ENERGY' },
                { x: 0.88, y: 0.13, length: 0.10, thickness: 0.013, rotation: 0, tone: 'DARK' },
                { x: -0.88, y: 0.24, length: 0.08, thickness: 0.013, rotation: 0, tone: 'ENERGY' },
            ],
        },
        {
            id: 'TEMPLATE_I',
            animation: 'FRAGMENT_LOCK',
            parts: [
                { x: -0.52, y: -0.61, length: 0.26, thickness: 0.021, rotation: 46, tone: 'PRIMARY' },
                { x: -0.19, y: -0.79, length: 0.22, thickness: 0.019, rotation: 12, tone: 'ENERGY' },
                { x: 0.19, y: -0.78, length: 0.16, thickness: 0.018, rotation: -12, tone: 'DARK' },
                { x: 0.51, y: -0.59, length: 0.22, thickness: 0.021, rotation: -46, tone: 'SOFT' },
                { x: 0.69, y: 0.10, length: 0.18, thickness: 0.019, rotation: 90, tone: 'PRIMARY' },
                { x: 0.52, y: 0.58, length: 0.24, thickness: 0.021, rotation: 46, tone: 'ENERGY' },
                { x: 0.14, y: 0.79, length: 0.25, thickness: 0.020, rotation: 8, tone: 'PRIMARY' },
                { x: -0.28, y: 0.74, length: 0.18, thickness: 0.018, rotation: -18, tone: 'DARK' },
                { x: -0.59, y: 0.48, length: 0.26, thickness: 0.021, rotation: -55, tone: 'SOFT' },
                { x: -0.72, y: -0.08, length: 0.18, thickness: 0.019, rotation: 90, tone: 'ENERGY' },
                { x: 0.87, y: -0.31, length: 0.08, thickness: 0.013, rotation: 0, tone: 'DARK' },
                { x: 0.90, y: -0.17, length: 0.13, thickness: 0.014, rotation: 0, tone: 'ENERGY' },
                { x: 0.87, y: -0.03, length: 0.09, thickness: 0.013, rotation: 0, tone: 'DARK' },
            ],
        },
        {
            id: 'TEMPLATE_J',
            animation: 'DUAL_ALIGN',
            parts: [
                { x: -0.20, y: -0.73, length: 0.27, thickness: 0.022, rotation: -45, tone: 'SOFT' },
                { x: -0.52, y: -0.43, length: 0.22, thickness: 0.020, rotation: -45, tone: 'PRIMARY' },
                { x: 0.20, y: -0.73, length: 0.27, thickness: 0.022, rotation: 45, tone: 'SOFT' },
                { x: 0.52, y: -0.43, length: 0.22, thickness: 0.020, rotation: 45, tone: 'ENERGY' },
                { x: 0.52, y: 0.43, length: 0.22, thickness: 0.020, rotation: -45, tone: 'PRIMARY' },
                { x: 0.20, y: 0.73, length: 0.27, thickness: 0.022, rotation: -45, tone: 'SOFT' },
                { x: -0.20, y: 0.73, length: 0.27, thickness: 0.022, rotation: 45, tone: 'SOFT' },
                { x: -0.52, y: 0.43, length: 0.22, thickness: 0.020, rotation: 45, tone: 'ENERGY' },
                { x: -0.86, y: -0.24, length: 0.09, thickness: 0.013, rotation: 0, tone: 'DARK' },
                { x: -0.88, y: 0, length: 0.14, thickness: 0.014, rotation: 0, tone: 'PRIMARY' },
                { x: -0.86, y: 0.24, length: 0.09, thickness: 0.013, rotation: 0, tone: 'DARK' },
                { x: 0.86, y: -0.24, length: 0.09, thickness: 0.013, rotation: 0, tone: 'DARK' },
                { x: 0.88, y: 0, length: 0.14, thickness: 0.014, rotation: 0, tone: 'ENERGY' },
                { x: 0.86, y: 0.24, length: 0.09, thickness: 0.013, rotation: 0, tone: 'DARK' },
            ],
        },
    ];
    private deathReconstructionPhase: DeathReconstructionPhase = 'IDLE';
    private deathReconstructionStartedAt: number = 0;
    private deathReconstructionUntilMs: number = 0;
    private deathLogicalRespawnDone: boolean = false;
    private deathWorldGenerationDone: boolean = false;
    private deathCoreReassemblyStarted: boolean = false;
    private deathReconstructionAmbience: any = null;
    private deathBufferLayer: any = null;
    private deathBufferFragments: DeathBufferFragment[] = [];
    private deathCountdownDigitLayer: any = null;
    private deathCountdownDigitSegments: any[] = [];
    private deathCountdownDigitValue: 3 | 2 | 1 | 0 | null = null;
    private deathCountdownDigitEnergyState: 'NONE' | 'RED' | 'BLUE' = 'NONE';
    private deathReticleGroup: any = null;
    private deathReticleParts: DeathReticlePartVisual[] = [];
    private deathReticleTemplateIndex: number | null = null;
    private lastDeathReticleTemplateIndex: number = -1;
    private deathReticleSequence: number = 0;
    private deathReticleVisualScale: number = 0;
    private deathCountdownColorState: 'NONE' | 'RED' | 'BLUE' = 'NONE';
    private deathOldWorldVisuals: DeathOldWorldFragment[] = [];
    private deathPlatformVisuals: DeathPlatformVisual[] = [];
    private deathPlatformFinalVisibility: Map<any, boolean> = new Map();
    private deathHazardFinalVisibility: Map<any, boolean> = new Map();
    private deathHazardOwnerPlatforms: Map<any, any> = new Map();
    private deathGroundCanonicalState: DeathGroundCanonicalState | null = null;
    private deathBallReassemblyLayer: any = null;
    private deathBallShards: Array<{ node: any; startX: number; startY: number; spin: number }> = [];
    private deathBallWasVisible: boolean = true;

    public setLevelTransitionHandler(handler: ((level: number, resume: () => void) => void) | null): void {
        this.levelTransitionHandler = handler;
    }

    private beginLevelTransition(): void {
        this.clearDeathReconstruction();
        const handler = this.levelTransitionHandler;
        if (!handler) {
            this.enabled = true;
            return;
        }
        if (this.levelTransitionPending) return;

        this.levelTransitionPending = true;
        this.enabled = false;
        let resumed = false;
        const resume = (): void => {
            if (resumed) return;
            resumed = true;
            this.levelTransitionPending = false;
            this.enabled = true;
        };

        try {
            handler(this.currentLevel, resume);
        } catch (error) {
            console.error("Level transition failed; gameplay resumed.", error);
            resume();
        }
    }

    /**
     * 墙体边界限制。
     * 因为 Box2D 碰撞被关闭了，顶墙和左右墙也需要用脚本手动挡住。
     */
    private clampToCanvas(): void {
        // 获取球的半径
        const radius = this.getBallRadius();
        // 墙是有厚度的矩形，不能只用 0 和 stage.width。
        // 用墙体真正面向场内、会挡住球的那一侧作为可玩区域边界。
        // 获取左墙的内侧边界X坐标
        const leftWallInner = this.getWallInnerBound(this.leftWall, "left");
        // 获取右墙的内侧边界X坐标
        const rightWallInner = this.getWallInnerBound(this.rightWall, "right");
        // 获取顶墙的内侧边界Y坐标（顶墙下方）
        const topWallBottom = this.getWallInnerBound(this.topWall, "top");

        // 计算水平方向的有效范围
        const minX = leftWallInner + radius;
        const maxX = rightWallInner - radius;
        // 检测左墙碰撞
        if (this.centerX < minX) {
            // 撞到左墙时反弹并限制位置。
            this.centerX = minX;
            // 水平速度反向并按反弹系数衰减
            this.vx = -this.vx * this.bounceX;
        }
        // 检测右墙碰撞
        if (this.centerX > maxX) {
            // 撞到右墙时反弹并限制位置。
            this.centerX = maxX;
            // 水平速度反向并按反弹系数衰减
            this.vx = -this.vx * this.bounceX;
        }

        // 计算顶部边界
        const minY = topWallBottom + radius;
        // 检测顶墙碰撞
        if (this.centerY < minY) {
            // 触顶时把球顶出可玩区域上方，并按反弹系数反弹。
            this.centerY = minY;
            // 如果向上运动，则进行反弹
            if (this.vy < 0) this.vy = -this.vy * this.bounceY;
        }

        // 额外保护：如果掉出屏幕底端，自动在空中复活
        // [死亡/重生系统] 掉出屏幕底部后自动重生。
        // 检测是否死亡
        this.checkDeath();
    }

    /**
     * 更新移动平台的水平位置
     * 每帧对所有激活的 Platform_* 调用一次，按照 MovingConfig 参数更新其 x 坐标。
     * 移动范围由 rangeMin 和 rangeMax 约束，触及边界时自动翻转方向。
     *
     * 特殊处理：消失平台消失后（state === 'hidden'）停止后台移动，
     * 冻结平台在消失瞬间的 x 位置，避免隐形移动导致诡异行为。
     *
     * @param platform - 待更新的平台节点
     */
    private updateMovingPlatform(platform: any): void {
        const config = this.movingConfigs.get(platform);
        if (!config) return;
        // [第3轮] hidden 的消失平台停止移动:冻结在消失瞬间的 x
        const dc = this.disappearConfigs.get(platform);
        if (dc && dc.state === 'hidden') return;
        platform.x += config.speed * config.direction;
        if (platform.x >= config.rangeMax) {
            platform.x = config.rangeMax;
            config.direction = -1;
        } else if (platform.x <= config.rangeMin) {
            platform.x = config.rangeMin;
            config.direction = 1;
        }
    }

    private readDisappearRecoveryTime(): number {
        const timerValue = Number(Laya.timer?.currTimer);
        return Number.isFinite(timerValue) ? timerValue : Date.now();
    }

    private getOrCreateDisappearRecoveryState(platform: any): {
        state: "ACTIVE" | "WARNING" | "HIDDEN_COOLDOWN" | "REBUILDING";
        enteredAt: number;
        visual: any;
    } {
        let recovery = this.disappearRecoveryStates.get(platform);
        if (!recovery) {
            recovery = { state: "ACTIVE", enteredAt: this.readDisappearRecoveryTime(), visual: null };
            this.disappearRecoveryStates.set(platform, recovery);
        }
        return recovery;
    }

    private hideDisappearRecoveryVisual(recovery: { visual: any }): void {
        if (recovery.visual && !recovery.visual.destroyed) {
            recovery.visual.visible = false;
        }
    }

    private resetDisappearRecoveryState(platform: any): void {
        const recovery = this.disappearRecoveryStates.get(platform);
        if (recovery?.visual) {
            this.destroyVisualNode(recovery.visual);
        }
        this.disappearRecoveryStates.set(platform, {
            state: "ACTIVE",
            enteredAt: this.readDisappearRecoveryTime(),
            visual: null,
        });
    }

    private clearDisappearRecoveryStates(): void {
        for (const recovery of this.disappearRecoveryStates.values()) {
            if (recovery.visual) {
                this.destroyVisualNode(recovery.visual);
            }
        }
        this.disappearRecoveryStates.clear();
    }

    private updateDisappearRecoveryLifecycle(platform: any, cfg: DisappearConfig): void {
        const nowMs = this.readDisappearRecoveryTime();
        const recovery = this.getOrCreateDisappearRecoveryState(platform);

        if (cfg.state === "counting") {
            if (recovery.state !== "WARNING") {
                recovery.state = "WARNING";
                recovery.enteredAt = cfg.triggerAt || nowMs;
            }
            this.hideDisappearRecoveryVisual(recovery);
            return;
        }

        if (cfg.state === "hidden") {
            // The physical carrier remains hidden and collision-gated throughout cooldown and rebuilding.
            platform.visible = false;
            if (recovery.state === "ACTIVE" || recovery.state === "WARNING") {
                recovery.state = "HIDDEN_COOLDOWN";
                recovery.enteredAt = nowMs;
            }

            if (recovery.state === "HIDDEN_COOLDOWN") {
                this.hideDisappearRecoveryVisual(recovery);
                const hiddenElapsed = Math.max(0, nowMs - recovery.enteredAt);
                if (hiddenElapsed >= BallController.DISAPPEAR_HIDDEN_COOLDOWN_MS) {
                    recovery.state = "REBUILDING";
                    recovery.enteredAt += BallController.DISAPPEAR_HIDDEN_COOLDOWN_MS;
                }
            }

            if (recovery.state === "REBUILDING") {
                const rebuildElapsed = Math.max(0, nowMs - recovery.enteredAt);
                if (rebuildElapsed >= BallController.DISAPPEAR_REBUILDING_MS) {
                    cfg.state = "idle";
                    cfg.triggerAt = 0;
                    recovery.state = "ACTIVE";
                    recovery.enteredAt = nowMs;
                    this.hideDisappearRecoveryVisual(recovery);
                    this.repaintPlatformColor(platform, "#00ff00");
                    platform.visible = true;
                    return;
                }
                this.drawDisappearRecoveryVisual(
                    platform,
                    recovery,
                    rebuildElapsed / BallController.DISAPPEAR_REBUILDING_MS,
                );
            }
            return;
        }

        if (recovery.state !== "ACTIVE") {
            recovery.state = "ACTIVE";
            recovery.enteredAt = nowMs;
            this.hideDisappearRecoveryVisual(recovery);
        }
    }

    private drawDisappearRecoveryVisual(
        platform: any,
        recovery: { visual: any },
        rawProgress: number,
    ): void {
        const parent = platform?.parent;
        if (!parent || typeof parent.addChild !== "function") return;

        let visual = recovery.visual;
        if (!visual || visual.destroyed || visual.parent !== parent) {
            if (visual) this.destroyVisualNode(visual);
            visual = new Laya.Sprite();
            visual.name = "WPE2_DisappearRecovery";
            visual.mouseEnabled = false;
            visual.mouseThrough = true;
            visual.blendMode = "lighter";
            parent.addChild(visual);
            recovery.visual = visual;
        }

        const progress = Math.max(0, Math.min(1, rawProgress));
        const eased = 1 - Math.pow(1 - progress, 2);
        const width = Math.max(1, Number(platform.width) || 1);
        const depth = Math.max(8, Math.min(16, Number(platform.height) || 10));
        const graphics = visual.graphics;
        if (!graphics) return;

        visual.x = Number(platform.x) || 0;
        visual.y = (Number(platform.y) || 0) - 6;
        visual.width = width;
        visual.height = depth + 12;
        visual.zOrder = (Number(platform.zOrder) || 0) + 3;
        visual.alpha = 0.34 + 0.58 * eased;
        visual.visible = true;
        graphics.clear();

        const top = 6;
        const bottom = top + depth;
        const scanY = top + depth * progress;
        if (typeof graphics.drawLine === "function") {
            graphics.drawLine(0, top, width, top, "#BFFFFF", 2);
            graphics.drawLine(0, bottom, width, bottom, "#35E9FF", 1.5);
            graphics.drawLine(0, top, 0, bottom, "#8B5CFF", 1.5);
            graphics.drawLine(width, top, width, bottom, "#8B5CFF", 1.5);
            for (let y = top + 3; y < bottom; y += 4) {
                graphics.drawLine(2, y, width - 2, y, "#16758D", 1);
            }
        }
        if (typeof graphics.drawRect === "function") {
            graphics.drawRect(0, scanY - 1, width, 2, "#E8FFFF");
            graphics.drawRect(width * 0.12, top + 2, width * 0.76 * eased, 1, "#35E9FF");
        }

        for (let index = 0; index < 12; index++) {
            const targetX = width * (index + 0.5) / 12;
            const startX = width * (((index * 37) % 23) + 0.5) / 23;
            const targetY = index % 2 === 0 ? top : bottom;
            const startY = index % 2 === 0 ? top - 20 - (index % 3) * 5 : bottom + 18 + (index % 3) * 5;
            const particleX = startX + (targetX - startX) * eased;
            const particleY = startY + (targetY - startY) * eased;
            const color = index % 3 === 0 ? "#FFFFFF" : index % 2 === 0 ? "#35E9FF" : "#8B5CFF";
            if (typeof graphics.drawCircle === "function") {
                graphics.drawCircle(particleX, particleY, index % 4 === 0 ? 2 : 1.3, color);
            } else if (typeof graphics.drawRect === "function") {
                graphics.drawRect(particleX - 1, particleY - 1, 2, 2, color);
            }
        }
    }

    private createDisappearHighlightBarIfNeeded(): void {
        if (this.disappearHighlightBar) return;

        const platform = this.platforms.find((p: any) => typeof p?.name === "string" && p.name.indexOf("Platform_") === 0);
        const platformParent = platform?.parent;
        if (!platformParent) return;

        const bar = new Laya.Sprite();
        bar.name = "DisappearHighlightBar";
        bar.visible = false;
        bar.width = 0;
        bar.height = 4;
        bar.zOrder = ((platform as any).zOrder || 0) + 1;

        platformParent.addChild(bar);
        this.disappearHighlightBar = bar;
    }

    private syncDisappearHighlightBar(): void {
        this.createDisappearHighlightBarIfNeeded();

        const bar = this.disappearHighlightBar;
        const entry = this.disappearConfigs.entries().next();
        if (entry.done) {
            if (bar) bar.visible = false;
            return;
        }

        const [target, cfg] = entry.value as [any, DisappearConfig];
        if (target && cfg) {
            this.updateDisappearRecoveryLifecycle(target, cfg);
        }
        if (!bar) return;
        if (!target || !cfg || cfg.state === 'hidden') {
            bar.visible = false;
            return;
        }

        let color = "#00ff00";
        const cmds = target?.graphics?.cmds;
        if (Array.isArray(cmds)) {
            const drawRectCmd = Laya.DrawRectCmd
                ? cmds.find((cmd: any) => cmd instanceof Laya.DrawRectCmd)
                : cmds.find((cmd: any) => typeof cmd?.fillColor === "string");
            if (typeof drawRectCmd?.fillColor === "string") {
                color = drawRectCmd.fillColor;
            }
        }

        bar.x = target.x;
        bar.y = target.y;
        bar.width = target.width || 0;
        bar.height = 4;
        bar.zOrder = (target.zOrder || 0) + 1;
        bar.graphics.clear();
        bar.graphics.drawRect(0, 0, bar.width, bar.height, color);
        bar.visible = true;
    }

    // 按颜色重绘平台矩形填充,不重建绘制命令
    private repaintPlatformColor(platform: any, color: string): void {
        const graphics = platform?.graphics;
        const cmds = graphics?.cmds;
        if (graphics && Array.isArray(cmds) && Laya.DrawRectCmd) {
            const drawRectCmd = cmds.find((cmd: any) => cmd instanceof Laya.DrawRectCmd);
            if (drawRectCmd) {
                drawRectCmd.fillColor = color;
                if (typeof graphics.repaint === "function") {
                    graphics.repaint();
                }
            }
        }
        this.paintPlatformVisual(platform, color);
    }

    // 检查球是否掉出屏幕
    private checkDeath(): void {
        // 如果球Y位置超出屏幕下方100像素，则重新生成
        if (this.centerY > Laya.stage.height + 100 && !ScoreManager.instance.isWon()) {
            this.handleDeath();
        }
    }

    // 检查小球是否碰到可见尖刺。只触发统一死亡流程，不改平台落地状态。
    private checkHazards(): void {
        if (ScoreManager.instance.isWon()) return;

        const radius = this.getBallRadius();
        const inset = Math.min(3, radius * 0.3);

        for (const spike of this.spikes) {
            if (!spike?.visible) continue;

            const rectLeft = (spike.x || 0) + inset;
            const rectRight = (spike.x || 0) + (spike.width || 0) - inset;
            const rectTop = (spike.y || 0) + inset;
            const rectBottom = (spike.y || 0) + (spike.height || 0) - inset;
            if (rectLeft >= rectRight || rectTop >= rectBottom) continue;

            const nearestX = Math.max(rectLeft, Math.min(this.centerX, rectRight));
            const nearestY = Math.max(rectTop, Math.min(this.centerY, rectBottom));
            const dx = this.centerX - nearestX;
            const dy = this.centerY - nearestY;

            if (dx * dx + dy * dy <= radius * radius) {
                this.handleDeath();
                return;
            }
        }
    }

    private isDeathReconstructionActive(): boolean {
        return this.deathReconstructionPhase !== 'IDLE';
    }

    private holdDeathReconstructionLock(ball: any, jump: boolean, env: BallPhysicsEnvironment): boolean {
        if (this.deathReconstructionUntilMs <= 0) return false;

        const now = this.getWpBNow();
        this.updateDeathReconstruction(now);

        // Consume edge-triggered input throughout the lock without accumulating motion.
        this.prevJumpKey = jump;
        this.vx = 0;
        this.vy = 0;
        if (this.deathReconstructionPhase === 'IDLE') return false;

        if (this.deathReconstructionPhase !== 'DECONSTRUCTING') {
            this.centerX = this.startX;
            this.centerY = this.startY;
            this.previousY = this.startY;
            env.syncBallSprite(ball);
        }
        return true;
    }

    private startDeathReconstruction(): void {
        this.clearDeathReconstruction();
        const ball = this.owner as any;
        const now = this.getWpBNow();

        // Capture only the derived HUD display. Authoritative Ball growth still resets in respawn().
        this.levelDeathRollbackDisplay = {
            level: this.currentLevel,
            fromProgress: Math.max(0, Math.min(1, this.ballEnergyVisualProgress)),
        };

        // Persistent Ground state must be sampled before any reconstruction writer suppresses it.
        this.captureDeathGroundCanonicalState();

        this.deathReconstructionPhase = 'DECONSTRUCTING';
        this.deathReconstructionStartedAt = now;
        this.deathReconstructionUntilMs = now + BallController.DEATH_RECONSTRUCTION_DURATION_MS;
        this.deathLogicalRespawnDone = false;
        this.deathWorldGenerationDone = false;
        this.deathCoreReassemblyStarted = false;
        this.deathBallWasVisible = ball?.visible !== false;
        this.deathHazardOwnerPlatforms.clear();
        this.selectDeathReticleTemplate();

        this.mountDeathReconstructionAmbience();
        this.createOldWorldDeconstructionVisuals();
        if (ball) ball.visible = true;
        if (this.ballVisualRoot) {
            this.ballVisualRoot.visible = true;
            this.ballVisualRoot.alpha = 1;
        }
        for (const trail of this.ballTrailNodes) {
            trail.visible = false;
            trail.alpha = 0;
        }
    }

    private captureDeathGroundCanonicalState(): void {
        const ground = this.platforms.find((platform: any) => platform?.name === "Ground") ?? null;
        if (!ground) {
            this.deathGroundCanonicalState = null;
            return;
        }
        const alpha = Number(ground.alpha);
        this.deathGroundCanonicalState = {
            platform: ground,
            visible: ground.visible !== false,
            alpha: Number.isFinite(alpha) ? alpha : 1,
        };
    }

    private restoreDeathGroundCanonicalState(): void {
        const canonical = this.deathGroundCanonicalState;
        if (!canonical?.platform) return;
        canonical.platform.visible = canonical.visible;
        canonical.platform.alpha = canonical.alpha;
    }

    private mountDeathReconstructionAmbience(): void {
        if (this.deathReconstructionAmbience || !Laya.stage) return;

        const stageWidth = Math.max(1, Number(Laya.stage.width) || 1280);
        const stageHeight = Math.max(1, Number(Laya.stage.height) || 720);
        const layer = new Laya.Sprite();
        layer.name = "WPV3_ReassemblyBuffer";
        layer.width = stageWidth;
        layer.height = stageHeight;
        layer.zOrder = 9988;
        layer.alpha = 0;
        layer.mouseEnabled = false;
        layer.mouseThrough = true;

        const dim = new Laya.Sprite();
        dim.name = "WPV3_GlobalDim";
        dim.alpha = 0.72;
        if (typeof dim.graphics?.drawRect === "function") {
            dim.graphics.drawRect(0, 0, stageWidth, stageHeight, "#030711");
        }
        layer.addChild(dim);

        Laya.stage.addChild(layer);
        this.deathReconstructionAmbience = layer;
        this.createDeathReticle(layer);
        this.createDeathBufferFragments(layer);
        this.setDeathCountdownColorState('RED');
    }

    private getDeathVisualUnit(index: number, salt: number): number {
        let value = Math.imul(index + 1 + salt * 31, 0x45d9f3b)
            ^ Math.imul(this.currentLevel + 17 + salt, 0x27d4eb2d);
        value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
        return ((value ^ (value >>> 16)) >>> 0) / 0xFFFFFFFF;
    }

    private getDeathCountdownGeometry(): {
        stageWidth: number;
        stageHeight: number;
        digitCenterY: number;
        digitWidth: number;
        digitHeight: number;
        reticleScale: number;
    } {
        const stageWidth = Math.max(1, Number(Laya.stage?.width) || 1280);
        const stageHeight = Math.max(1, Number(Laya.stage?.height) || 720);
        const referenceDigitHeight = Math.max(96, Math.min(144, stageHeight * 0.18));
        const digitHeight = referenceDigitHeight * BallController.DEATH_COUNTDOWN_DIGIT_SCALE;
        const compositionCenterY = stageHeight * 0.48;
        return {
            stageWidth,
            stageHeight,
            digitCenterY: compositionCenterY,
            digitWidth: digitHeight * 0.72,
            digitHeight,
            reticleScale: referenceDigitHeight * BallController.DEATH_RETICLE_SCALE,
        };
    }

    private selectDeathReticleTemplate(): void {
        const templateCount = BallController.DEATH_RETICLE_TEMPLATES.length;
        if (templateCount <= 0) {
            this.deathReticleTemplateIndex = null;
            return;
        }

        this.deathReticleSequence = (this.deathReticleSequence + 1) >>> 0;
        let value = Math.imul(this.deathReticleSequence ^ 0x6D2B79F5, 0x45D9F3B)
            ^ Math.imul(this.currentLevel + 0x165667B1, 0x27D4EB2D);
        value = Math.imul(value ^ (value >>> 16), 0x7FEB352D);
        value ^= value >>> 15;
        let templateIndex = (value >>> 0) % templateCount;
        if (templateCount > 1 && templateIndex === this.lastDeathReticleTemplateIndex) {
            templateIndex = (templateIndex + 1) % templateCount;
        }
        this.deathReticleTemplateIndex = templateIndex;
        this.lastDeathReticleTemplateIndex = templateIndex;
    }

    private createDeathReticle(parent: any): void {
        if (!parent || typeof parent.addChild !== "function") return;
        const templateIndex = this.deathReticleTemplateIndex;
        if (templateIndex === null) return;
        const template = BallController.DEATH_RETICLE_TEMPLATES[templateIndex];
        if (!template) return;

        if (this.deathReticleGroup) this.destroyVisualNode(this.deathReticleGroup);
        this.deathReticleParts = [];
        const geometry = this.getDeathCountdownGeometry();
        const group = new Laya.Sprite();
        group.name = "WPV31F_CentralReticle_" + template.id;
        group.x = geometry.stageWidth * 0.5;
        group.y = geometry.digitCenterY;
        group.zOrder = 2;
        group.blendMode = "lighter";
        group.mouseEnabled = false;
        group.mouseThrough = true;
        group.alpha = 0;

        for (let i = 0; i < template.parts.length; i++) {
            const partTemplate = template.parts[i];
            const node = new Laya.Sprite();
            node.name = "WPV31F_ReticlePart_" + template.id + "_" + i;
            node.mouseEnabled = false;
            node.mouseThrough = true;
            node.alpha = 0;
            group.addChild(node);
            const visual = { node, template: partTemplate };
            this.deathReticleParts.push(visual);
            this.paintDeathReticlePart(visual, geometry.reticleScale);
        }

        parent.addChild(group);
        this.deathReticleGroup = group;
        this.deathReticleVisualScale = geometry.reticleScale;
    }

    private paintDeathReticlePart(visual: DeathReticlePartVisual, visualScale: number): void {
        const graphics = visual.node?.graphics;
        if (!graphics) return;
        graphics.clear();
        const part = visual.template;
        const length = Math.max(4, part.length * visualScale);
        const weightScale = part.tone === 'DARK' ? 0.7 : (part.tone === 'ENERGY' ? 0.82 : 0.9);
        const thickness = Math.max(0.8, part.thickness * visualScale * weightScale);
        const toneColor = BallController.DEATH_RETICLE_COLORS[part.tone];
        const coreColor = part.tone === 'DARK'
            ? BallController.DEATH_RETICLE_COLORS.DARK
            : (part.tone === 'SOFT' ? "#F3FCFF" : toneColor);
        this.drawDeathCountdownStructuralBar(
            graphics,
            length + thickness * 1.1,
            thickness * 1.65,
            BallController.DEATH_RETICLE_COLORS.DARK,
        );
        this.drawDeathCountdownStructuralBar(
            graphics,
            length + thickness * 0.42,
            thickness * 1.05,
            part.tone === 'DARK' ? BallController.DEATH_RETICLE_COLORS.ENERGY : toneColor,
        );
        this.drawDeathCountdownStructuralBar(
            graphics,
            length,
            thickness * 0.48,
            coreColor,
        );
    }

    private updateDeathReticle(elapsed: number): void {
        const group = this.deathReticleGroup;
        const templateIndex = this.deathReticleTemplateIndex;
        if (!group || templateIndex === null) return;
        const template = BallController.DEATH_RETICLE_TEMPLATES[templateIndex];
        if (!template) return;

        const geometry = this.getDeathCountdownGeometry();
        group.x = geometry.stageWidth * 0.5;
        group.y = geometry.digitCenterY;
        if (this.deathReticleVisualScale !== geometry.reticleScale) {
            for (const visual of this.deathReticleParts) {
                this.paintDeathReticlePart(visual, geometry.reticleScale);
            }
            this.deathReticleVisualScale = geometry.reticleScale;
        }

        const entranceProgress = Math.max(0, Math.min(1, elapsed / 460));
        const entrance = 1 - Math.pow(1 - entranceProgress, 3);
        const remaining = 1 - entrance;
        const completionProgress = Math.max(0, Math.min(
            1,
            (elapsed - BallController.DEATH_CORE_REASSEMBLY_START_MS)
                / (BallController.DEATH_RECONSTRUCTION_DURATION_MS - BallController.DEATH_CORE_REASSEMBLY_START_MS),
        ));
        group.scaleX = 1 + completionProgress * 0.012;
        group.scaleY = 1 + completionProgress * 0.012;
        group.alpha = Math.min(1, 0.72 + entrance * 0.18 + completionProgress * 0.1);

        const visualScale = geometry.reticleScale;
        for (let i = 0; i < this.deathReticleParts.length; i++) {
            const visual = this.deathReticleParts[i];
            const part = visual.template;
            const node = visual.node;
            const baseX = part.x * visualScale;
            const baseY = part.y * visualScale;
            let x = baseX;
            let y = baseY;
            let rotation = part.rotation;
            let localEntrance = entrance;
            let scale = 1;

            switch (template.animation) {
                case 'CORNER_LOCK': {
                    const xDirection = baseX < 0 ? -1 : 1;
                    const yDirection = baseY < 0 ? -1 : 1;
                    x += xDirection * remaining * 14;
                    y += yDirection * remaining * 14;
                    break;
                }
                case 'SIDE_DEPLOY':
                    x = baseX * (0.55 + entrance * 0.45);
                    break;
                case 'DUAL_ALIGN':
                    x += (i % 2 === 0 ? -1 : 1) * remaining * 10;
                    y += (i % 4 < 2 ? -1 : 1) * remaining * 4;
                    break;
                case 'SEQUENTIAL_LIGHT': {
                    const stagger = i / Math.max(1, this.deathReticleParts.length - 1) * 0.46;
                    localEntrance = Math.max(0, Math.min(1, (entranceProgress - stagger) / 0.54));
                    localEntrance = 1 - Math.pow(1 - localEntrance, 2);
                    break;
                }
                case 'VERTICAL_CONVERGE': {
                    const direction = baseY < 0 ? -1 : 1;
                    y += direction * remaining * 16;
                    break;
                }
                case 'FRAGMENT_LOCK': {
                    const radialLength = Math.max(1, Math.sqrt(baseX * baseX + baseY * baseY));
                    x += baseX / radialLength * remaining * 11;
                    y += baseY / radialLength * remaining * 11;
                    rotation += (i % 2 === 0 ? -1 : 1) * remaining * 12;
                    scale = 0.84 + entrance * 0.16;
                    break;
                }
            }

            const toneAlpha = part.tone === 'DARK' ? 0.48 : (part.tone === 'SOFT' ? 0.94 : 0.78);
            const restrainedPulse = (Math.sin(elapsed * 0.004 + i * 0.73) + 1) * 0.025;
            node.x = x;
            node.y = y;
            node.rotation = rotation;
            node.scaleX = scale;
            node.scaleY = scale;
            node.alpha = Math.min(1, localEntrance * (toneAlpha + restrainedPulse + completionProgress * 0.08));
        }
    }

    private destroyDeathReticle(): void {
        if (this.deathReticleGroup) this.destroyVisualNode(this.deathReticleGroup);
        this.deathReticleGroup = null;
        this.deathReticleParts = [];
        this.deathReticleTemplateIndex = null;
        this.deathReticleVisualScale = 0;
    }

    private getDeathCountdownPalette(state: 'RED' | 'BLUE'): {
        main: string;
        highlight: string;
        glow: string;
        outline: string;
    } {
        return state === 'RED'
            ? { main: "#FF5267", highlight: "#FF8794", glow: "#FF173B", outline: "#72051B" }
            : { main: "#42D7FF", highlight: "#B9ECFF", glow: "#2F8FFF", outline: "#0A3D86" };
    }

    private drawDeathReconstructionFragment(
        graphics: any,
        length: number,
        thickness: number,
        color: string,
    ): void {
        if (typeof graphics?.drawPoly === "function") {
            graphics.drawPoly(
                -length * 0.5,
                -thickness * 0.5,
                [0, 0, length, thickness * 0.18, length * 0.78, thickness, length * 0.12, thickness * 0.82],
                color,
            );
        } else if (typeof graphics?.drawRect === "function") {
            graphics.drawRect(-length * 0.5, -thickness * 0.5, length, thickness, color);
        }
    }

    private paintDeathBufferFragment(node: any, index: number, state: 'RED' | 'BLUE'): void {
        const graphics = node?.graphics;
        if (!graphics) return;
        graphics.clear();
        const palette = this.getDeathCountdownPalette(state);
        const colors = [palette.main, palette.highlight, palette.glow, palette.outline];
        const visualScale = this.getDeathCountdownGeometry().digitHeight / 86;
        const length = (7 + (index % 4) * 1.25) * visualScale;
        const thickness = (2 + (index % 3) * 0.48) * visualScale;
        this.drawDeathReconstructionFragment(graphics, length, thickness, colors[index % colors.length]);
    }

    private setDeathCountdownColorState(state: 'RED' | 'BLUE'): void {
        if (this.deathCountdownColorState === state) return;
        this.deathCountdownColorState = state;
        for (let i = 0; i < this.deathBufferFragments.length; i++) {
            this.paintDeathBufferFragment(this.deathBufferFragments[i].node, i, state);
        }
    }

    private createDeathBufferFragments(parent: any): void {
        this.destroyDeathBufferFragments();
        if (!parent || typeof parent.addChild !== "function") return;

        const layer = new Laya.Sprite();
        layer.name = "WPV31_ActiveFragmentBuffer";
        layer.blendMode = "lighter";
        layer.zOrder = 3;
        layer.mouseEnabled = false;
        layer.mouseThrough = true;
        parent.addChild(layer);
        this.deathBufferLayer = layer;
        this.createDeathCountdownDigitSegments(layer);

        const ball = this.owner as any;
        const spawn = this.getVisualStagePoint(ball?.parent, this.startX, this.startY);
        for (let i = 0; i < BallController.DEATH_BUFFER_FRAGMENT_COUNT; i++) {
            const node = new Laya.Sprite();
            node.name = "WPV31_BufferFragment_" + i;
            node.mouseEnabled = false;
            node.mouseThrough = true;
            const angle = this.getDeathVisualUnit(i, 1) * Math.PI * 2;
            const radius = 48 + this.getDeathVisualUnit(i, 2) * 64;
            const baseX = spawn.x + Math.cos(angle) * radius;
            const baseY = spawn.y - 44 + Math.sin(angle) * radius * 0.56;
            const phase = this.getDeathVisualUnit(i, 3) * Math.PI * 2;
            const restRotation = -68 + this.getDeathVisualUnit(i, 4) * 136;
            node.x = baseX;
            node.y = baseY;
            node.rotation = restRotation;
            node.visible = false;
            node.alpha = 0;
            node.zOrder = 2;
            layer.addChild(node);
            this.deathBufferFragments.push({
                node,
                baseX,
                baseY,
                orbitX: 5 + this.getDeathVisualUnit(i, 5) * 9,
                orbitY: 4 + this.getDeathVisualUnit(i, 6) * 7,
                phase,
                restRotation,
            });
            this.paintDeathBufferFragment(node, i, 'RED');
        }
    }

    private createDeathCountdownDigitSegments(parent: any): void {
        if (!parent || typeof parent.addChild !== "function") return;
        const layer = new Laya.Sprite();
        layer.name = "WPV31D_WhiteCoreCyberDigit";
        layer.zOrder = 1;
        layer.mouseEnabled = false;
        layer.mouseThrough = true;
        layer.visible = false;
        parent.addChild(layer);
        this.deathCountdownDigitLayer = layer;

        for (let i = 0; i < BallController.DEATH_COUNTDOWN_STRUCTURAL_SEGMENT_COUNT; i++) {
            const segment = new Laya.Sprite();
            segment.name = "WPV31D_StructuralDigitSegment_" + i;
            segment.mouseEnabled = false;
            segment.mouseThrough = true;
            segment.visible = false;
            layer.addChild(segment);
            this.deathCountdownDigitSegments.push(segment);
        }
    }

    private getDeathBufferDriftPosition(fragment: DeathBufferFragment, index: number, elapsed: number): { x: number; y: number } {
        const seconds = Math.max(0, elapsed - BallController.DEATH_DECONSTRUCT_END_MS) * 0.001;
        const x = fragment.baseX
            + Math.sin(seconds * (0.82 + (index % 4) * 0.13) + fragment.phase) * fragment.orbitX
            + Math.cos(seconds * 1.37 + fragment.phase * 0.7) * 2.5;
        const y = fragment.baseY
            + Math.cos(seconds * (0.7 + (index % 5) * 0.11) + fragment.phase) * fragment.orbitY
            + Math.sin(seconds * 1.11 + fragment.phase * 1.3) * 2;
        return { x, y };
    }

    private getDeathCountdownSegmentTemplate(digit: 3 | 2 | 1 | 0): Array<[number, number, number, number]> {
        const segmentsByDigit: Record<3 | 2 | 1 | 0, Array<[number, number, number, number]>> = {
            3: [
                [-0.36, -0.5, 0.36, -0.5],
                [-0.36, 0, 0.36, 0],
                [-0.36, 0.5, 0.36, 0.5],
                [0.4, -0.46, 0.4, -0.04],
                [0.4, 0.04, 0.4, 0.46],
            ],
            2: [
                [-0.36, -0.5, 0.36, -0.5],
                [0.4, -0.44, 0.4, -0.05],
                [-0.36, 0, 0.36, 0],
                [-0.4, 0.05, -0.4, 0.44],
                [-0.36, 0.5, 0.36, 0.5],
            ],
            1: [
                [-0.36, -0.28, 0.05, -0.5],
                [0.05, -0.46, 0.05, 0.46],
                [-0.36, 0.5, 0.34, 0.5],
            ],
            0: [
                [-0.36, -0.5, 0.36, -0.5],
                [-0.36, 0.5, 0.36, 0.5],
                [-0.4, -0.44, -0.4, -0.04],
                [-0.4, 0.04, -0.4, 0.44],
                [0.4, -0.44, 0.4, -0.04],
                [0.4, 0.04, 0.4, 0.44],
            ],
        };
        return segmentsByDigit[digit];
    }

    private getDeathCountdownTarget(index: number, digit: 3 | 2 | 1 | 0): { x: number; y: number; rotation: number } {
        const segments = this.getDeathCountdownSegmentTemplate(digit);
        const segmentIndex = index % segments.length;
        const lane = Math.floor(index / segments.length);
        const laneCount = Math.ceil(BallController.DEATH_BUFFER_FRAGMENT_COUNT / segments.length);
        const t = Math.min(0.94, (lane + 0.45) / laneCount);
        const [x0, y0, x1, y1] = segments[segmentIndex];
        const geometry = this.getDeathCountdownGeometry();
        const anchorX = geometry.stageWidth * 0.5;
        const anchorY = geometry.digitCenterY;
        return {
            x: anchorX + (x0 + (x1 - x0) * t) * geometry.digitWidth,
            y: anchorY + (y0 + (y1 - y0) * t) * geometry.digitHeight,
            rotation: Math.atan2(
                (y1 - y0) * geometry.digitHeight,
                (x1 - x0) * geometry.digitWidth,
            ) * 180 / Math.PI,
        };
    }

    private drawDeathCountdownStructuralBar(graphics: any, length: number, thickness: number, color: string): void {
        if (typeof graphics?.drawPoly === "function") {
            const halfLength = length * 0.5;
            const halfThickness = thickness * 0.5;
            const cut = Math.min(thickness * 0.38, length * 0.14);
            graphics.drawPoly(0, 0, [
                -halfLength + cut, -halfThickness,
                halfLength - cut, -halfThickness,
                halfLength, -halfThickness + cut,
                halfLength, halfThickness - cut,
                halfLength - cut, halfThickness,
                -halfLength + cut, halfThickness,
                -halfLength, halfThickness - cut,
                -halfLength, -halfThickness + cut,
            ], color);
        } else if (typeof graphics?.drawRect === "function") {
            graphics.drawRect(-length * 0.5, -thickness * 0.5, length, thickness, color);
        }
    }

    private paintDeathCountdownStructuralSegment(
        node: any,
        length: number,
        thickness: number,
        index: number,
        state: 'RED' | 'BLUE',
    ): void {
        const graphics = node?.graphics;
        if (!graphics) return;
        graphics.clear();
        const energy = this.getDeathCountdownPalette(state);
        const coreHighlight = index % 3 === 0 ? "#FFFFFF" : (index % 3 === 1 ? "#F4FAFF" : "#DDEEFF");
        this.drawDeathCountdownStructuralBar(graphics, length + thickness * 0.34, thickness, energy.outline);
        this.drawDeathCountdownStructuralBar(graphics, length + thickness * 0.22, thickness * 0.86, energy.glow);
        this.drawDeathCountdownStructuralBar(graphics, length + thickness * 0.1, thickness * 0.74, "#42D7FF");
        this.drawDeathCountdownStructuralBar(graphics, length, thickness * 0.62, "#F4FAFF");
        this.drawDeathCountdownStructuralBar(
            graphics,
            Math.max(thickness, length - thickness * 0.58),
            thickness * 0.17,
            coreHighlight,
        );
    }

    private updateDeathCountdownStructuralDigit(elapsed: number, worldTransition: boolean): void {
        const layer = this.deathCountdownDigitLayer;
        if (!layer) return;
        if (elapsed < BallController.DEATH_DECONSTRUCT_END_MS
            || worldTransition
            || (elapsed >= BallController.DEATH_WORLD_MATERIALIZE_START_MS
                && elapsed < BallController.DEATH_CORE_REASSEMBLY_START_MS)) {
            layer.visible = false;
            return;
        }

        let digit: 3 | 2 | 1 | 0;
        let energyState: 'RED' | 'BLUE';
        let formation: number;
        let visibility = 1;
        if (elapsed >= BallController.DEATH_CORE_REASSEMBLY_START_MS) {
            digit = 0;
            energyState = 'BLUE';
            const coreProgress = Math.max(0, Math.min(
                1,
                (elapsed - BallController.DEATH_CORE_REASSEMBLY_START_MS)
                    / (BallController.DEATH_RECONSTRUCTION_DURATION_MS - BallController.DEATH_CORE_REASSEMBLY_START_MS),
            ));
            const formationProgress = Math.min(1, coreProgress / 0.34);
            formation = 1 - Math.pow(1 - formationProgress, 3);
            visibility = Math.min(1, coreProgress / 0.18);
        } else {
            energyState = 'RED';
            const countdownElapsed = Math.min(
                BallController.DEATH_WORLD_MATERIALIZE_START_MS - BallController.DEATH_DECONSTRUCT_END_MS - 0.001,
                Math.max(0, elapsed - BallController.DEATH_DECONSTRUCT_END_MS),
            );
            const beatIndex = Math.min(2, Math.floor(countdownElapsed / BallController.DEATH_COUNTDOWN_BEAT_MS));
            const beatProgress = (countdownElapsed - beatIndex * BallController.DEATH_COUNTDOWN_BEAT_MS)
                / BallController.DEATH_COUNTDOWN_BEAT_MS;
            digit = ([3, 2, 1] as const)[beatIndex];
            formation = 1;
            if (beatProgress < 0.3) {
                const local = beatProgress / 0.3;
                formation = 1 - Math.pow(1 - local, 2);
            } else if (beatProgress > 0.72) {
                const local = (beatProgress - 0.72) / 0.28;
                formation = 1 - (1 - Math.pow(1 - local, 2));
            }
        }

        const geometry = this.getDeathCountdownGeometry();
        const templates = this.getDeathCountdownSegmentTemplate(digit);
        const thickness = geometry.digitHeight * 0.15;
        const repaint = this.deathCountdownDigitValue !== digit
            || this.deathCountdownDigitEnergyState !== energyState;
        layer.visible = true;
        for (let i = 0; i < this.deathCountdownDigitSegments.length; i++) {
            const node = this.deathCountdownDigitSegments[i];
            const template = templates[i];
            if (!template) {
                node.visible = false;
                continue;
            }
            const [x0, y0, x1, y1] = template;
            const dx = (x1 - x0) * geometry.digitWidth;
            const dy = (y1 - y0) * geometry.digitHeight;
            const length = Math.max(thickness * 1.4, Math.sqrt(dx * dx + dy * dy));
            if (repaint) this.paintDeathCountdownStructuralSegment(node, length, thickness, i, energyState);

            const stagger = i * 0.035;
            const localFormation = Math.max(0, Math.min(1, (formation - stagger) / Math.max(0.001, 1 - stagger)));
            const lock = 1 - Math.pow(1 - localFormation, 3);
            node.visible = true;
            node.x = geometry.stageWidth * 0.5 + (x0 + x1) * 0.5 * geometry.digitWidth
                + (1 - lock) * (i % 2 === 0 ? -10 - i : 10 + i);
            node.y = geometry.digitCenterY + (y0 + y1) * 0.5 * geometry.digitHeight
                + (1 - lock) * ((i % 3) - 1) * 7;
            node.rotation = Math.atan2(dy, dx) * 180 / Math.PI
                + (1 - lock) * (i % 2 === 0 ? -8 : 8);
            node.scaleX = 0.68 + lock * 0.32;
            node.scaleY = 0.82 + lock * 0.18;
            node.alpha = visibility * Math.min(1, localFormation * 1.45) * (0.72 + lock * 0.28);
        }
        this.deathCountdownDigitValue = digit;
        this.deathCountdownDigitEnergyState = energyState;
    }

    private updateDeathBufferFragments(elapsed: number, worldTransition: boolean = false): void {
        this.updateDeathCountdownStructuralDigit(elapsed, worldTransition);
        for (const fragment of this.deathBufferFragments) {
            fragment.node.visible = false;
            fragment.node.alpha = 0;
        }
    }

    private destroyDeathBufferFragments(): void {
        if (this.deathCountdownDigitLayer) this.destroyVisualNode(this.deathCountdownDigitLayer);
        this.deathCountdownDigitLayer = null;
        this.deathCountdownDigitSegments = [];
        this.deathCountdownDigitValue = null;
        this.deathCountdownDigitEnergyState = 'NONE';
        if (this.deathBufferLayer) this.destroyVisualNode(this.deathBufferLayer);
        this.deathBufferLayer = null;
        this.deathBufferFragments = [];
        this.deathCountdownColorState = 'NONE';
    }

    private createOldWorldDeconstructionVisuals(): void {
        this.destroyDeathOldWorldVisuals();
        this.deathPlatformFinalVisibility.clear();
        this.deathHazardFinalVisibility.clear();

        for (const platform of this.platforms) {
            const wasVisible = platform?.visible !== false;
            this.deathPlatformFinalVisibility.set(platform, wasVisible);
            if (wasVisible && this.deathOldWorldVisuals.length < BallController.DEATH_OLD_WORLD_FRAGMENT_BUDGET) {
                const parent = platform?.parent;
                if (parent && typeof parent.addChild === "function") {
                    const platformWidth = Math.max(1, Number(platform.width) || 1);
                    const platformHeight = Math.max(6, Number(platform.height) || 10);
                    for (let piece = 0; piece < 3
                        && this.deathOldWorldVisuals.length < BallController.DEATH_OLD_WORLD_FRAGMENT_BUDGET; piece++) {
                        const fragment = new Laya.Sprite();
                        fragment.name = "WPV31_OldWorldFragment_" + String(platform?.name || "Platform") + "_" + piece;
                        const fragmentWidth = Math.max(8, Math.min(48, platformWidth * (0.2 + piece * 0.035)));
                        const fragmentHeight = Math.max(2, Math.min(6, platformHeight * (0.32 + piece * 0.08)));
                        const startX = (Number(platform.x) || 0)
                            + Math.max(0, platformWidth - fragmentWidth) * (0.08 + piece * 0.42);
                        const startY = (Number(platform.y) || 0) + platformHeight * (0.18 + piece * 0.22);
                        fragment.x = startX;
                        fragment.y = startY;
                        fragment.zOrder = (Number(platform.zOrder) || 0) + 4;
                        fragment.mouseEnabled = false;
                        fragment.mouseThrough = true;
                        fragment.blendMode = "lighter";
                        const color = piece % 2 === 0 ? "#35E9FF" : "#8B6CFF";
                        if (typeof fragment.graphics?.drawPoly === "function") {
                            fragment.graphics.drawPoly(
                                0,
                                0,
                                [0, 0, fragmentWidth, fragmentHeight * 0.16, fragmentWidth * 0.83, fragmentHeight, fragmentWidth * 0.08, fragmentHeight * 0.78],
                                color,
                            );
                        } else if (typeof fragment.graphics?.drawRect === "function") {
                            fragment.graphics.drawRect(0, 0, fragmentWidth, fragmentHeight, color);
                        }
                        parent.addChild(fragment);
                        const direction = piece - 1;
                        this.deathOldWorldVisuals.push({
                            node: fragment,
                            startX,
                            startY,
                            driftX: direction * (10 + this.deathOldWorldVisuals.length % 5 * 2),
                            driftY: 8 + piece * 5 + this.deathOldWorldVisuals.length % 4,
                            spin: direction === 0 ? 7 : direction * (11 + piece * 3),
                        });
                    }
                }
            }
            if (platform) platform.visible = false;
        }

        for (const spike of this.spikes) {
            this.deathHazardFinalVisibility.set(spike, spike?.visible !== false);
            if (spike) spike.visible = false;
        }
        if (this.disappearHighlightBar) this.disappearHighlightBar.visible = false;
    }

    private updateDeathDeconstruction(elapsed: number): void {
        const progress = Math.max(0, Math.min(1, elapsed / BallController.DEATH_DECONSTRUCT_END_MS));
        if (this.deathReconstructionAmbience) {
            this.deathReconstructionAmbience.alpha = 0.16 + progress * 0.84;
        }
        this.updateDeathBufferFragments(elapsed);
        this.updateDeathReticle(elapsed);
        const eased = 1 - Math.pow(1 - progress, 2);
        for (let i = 0; i < this.deathOldWorldVisuals.length; i++) {
            const fragment = this.deathOldWorldVisuals[i];
            fragment.node.x = fragment.startX + fragment.driftX * eased;
            fragment.node.y = fragment.startY + fragment.driftY * eased;
            fragment.node.rotation = fragment.spin * eased;
            fragment.node.alpha = Math.max(0, 1 - progress * (0.88 + (i % 3) * 0.04));
        }

        const ball = this.owner as any;
        if (ball) ball.visible = true;
        if (this.ballVisualRoot) {
            this.ballVisualRoot.visible = true;
            this.ballVisualRoot.alpha = Math.max(0, 1 - progress);
            const pulse = 1 + Math.sin(progress * Math.PI) * 0.16;
            this.ballVisualRoot.scaleX = this.ballVisualScaleX * pulse;
            this.ballVisualRoot.scaleY = this.ballVisualScaleY * pulse;
        }
    }

    private beginDeathReassemblyBuffer(): void {
        if (this.deathLogicalRespawnDone) return;
        this.deathLogicalRespawnDone = true;
        this.respawn();

        const ball = this.owner as any;
        if (ball) ball.visible = false;
        if (this.ballVisualRoot) {
            this.ballVisualRoot.visible = false;
            this.ballVisualRoot.alpha = 0;
        }
        this.destroyDeathOldWorldVisuals();
        this.suppressWorldForDeathReconstruction();
        this.deathReconstructionPhase = 'BUFFERING';
    }

    private suppressWorldForDeathReconstruction(): void {
        for (const platform of this.platforms) {
            if (platform) platform.visible = false;
        }
        for (const spike of this.spikes) {
            if (spike) spike.visible = false;
        }
        if (this.disappearHighlightBar) this.disappearHighlightBar.visible = false;
    }

    private updateDeathReassemblyBuffer(elapsed: number): void {
        if (!this.deathReconstructionAmbience) return;
        this.deathReconstructionAmbience.alpha = 1;
        this.updateDeathBufferFragments(elapsed);
        this.updateDeathReticle(elapsed);
    }

    private beginDeathWorldMaterialization(): void {
        if (this.deathWorldGenerationDone) return;
        this.deathWorldGenerationDone = true;

        // This synchronous one-shot owns the reroll and the immediate visual suppression.
        this.randomizePlatforms();
        this.randomizeHazards();

        this.deathPlatformFinalVisibility.clear();
        const canonicalGround = this.deathGroundCanonicalState?.platform ?? null;
        for (const platform of this.platforms) {
            const finalVisibility = platform === canonicalGround
                ? this.deathGroundCanonicalState?.visible !== false
                : platform?.visible !== false;
            this.deathPlatformFinalVisibility.set(platform, finalVisibility);
            if (platform) platform.visible = false;
        }
        this.deathHazardFinalVisibility.clear();
        for (const spike of this.spikes) {
            this.deathHazardFinalVisibility.set(spike, spike?.visible !== false);
            if (spike) spike.visible = false;
        }

        this.createDeathPlatformMaterializationVisuals();
        this.deathReconstructionPhase = 'WORLD_MATERIALIZING';
    }

    private getDeathMaterializationPlatforms(): any[] {
        const ground = this.platforms.find((platform: any) => platform?.name === "Ground") ?? null;
        const gameplayPlatforms = this.getSortedGamePlatforms();
        return ground ? [ground, ...gameplayPlatforms] : gameplayPlatforms;
    }

    private createDeathPlatformMaterializationVisuals(): void {
        this.destroyDeathPlatformVisuals();
        const sorted = this.getDeathMaterializationPlatforms();
        const ranked = sorted
            .map((platform: any, index: number) => ({
                platform,
                index,
                key: this.getDeathPlatformRevealKey(index),
            }))
            .sort((a, b) => a.key - b.key || a.index - b.index);
        const rankByPlatform = new Map<any, number>();
        ranked.forEach((entry, rank) => rankByPlatform.set(entry.platform, rank));

        for (const platform of sorted) {
            const parent = platform?.parent;
            if (!parent || typeof parent.addChild !== "function") continue;
            const platformIndex = sorted.indexOf(platform);
            const duplicates: DeathPlatformDuplicate[] = [];
            for (let duplicateIndex = 0;
                duplicateIndex < BallController.DEATH_PLATFORM_DUPLICATE_COUNT;
                duplicateIndex++) {
                const proxy = new Laya.Sprite();
                proxy.name = "WPV31_PlatformDuplicate_" + String(platform?.name || "Platform") + "_" + duplicateIndex;
                proxy.width = Math.max(1, Number(platform.width) || 1);
                proxy.height = Math.max(6, Number(platform.height) || 10);
                proxy.zOrder = (Number(platform.zOrder) || 0) + 4 + duplicateIndex;
                proxy.mouseEnabled = false;
                proxy.mouseThrough = true;
                proxy.blendMode = "lighter";
                const direction = duplicateIndex === 0 ? -1 : 1;
                const offsetX = direction * (6 + this.getDeathVisualUnit(platformIndex, 20 + duplicateIndex) * 5);
                const offsetY = direction * (2.5 + this.getDeathVisualUnit(platformIndex, 24 + duplicateIndex) * 3.5);
                const phase = this.getDeathVisualUnit(platformIndex, 28 + duplicateIndex) * Math.PI * 2;
                proxy.x = (Number(platform.x) || 0) + offsetX;
                proxy.y = (Number(platform.y) || 0) + offsetY;
                parent.addChild(proxy);
                this.paintDeathPlatformMaterializationVisual(proxy, 0, duplicateIndex);
                duplicates.push({ node: proxy, duplicateIndex, offsetX, offsetY, phase });
            }
            this.deathPlatformVisuals.push({
                platform,
                duplicates,
                rank: rankByPlatform.get(platform) ?? 0,
            });
        }
    }

    private getDeathPlatformRevealKey(index: number): number {
        let value = Math.imul(index + 1, 0x45d9f3b) ^ Math.imul(this.currentLevel + 17, 0x27d4eb2d);
        value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
        return (value ^ (value >>> 16)) >>> 0;
    }

    private getDeathPlatformMaterializationProgress(
        visual: { rank: number },
        elapsed: number,
    ): number {
        const count = Math.max(1, this.deathPlatformVisuals.length);
        const stagger = count <= 1 ? 0 : visual.rank * 90 / (count - 1);
        const localElapsed = elapsed - BallController.DEATH_WORLD_MATERIALIZE_START_MS - stagger;
        return Math.max(0, Math.min(1, localElapsed / 330));
    }

    private updateDeathWorldMaterialization(elapsed: number): void {
        const phaseProgress = Math.max(0, Math.min(
            1,
            (elapsed - BallController.DEATH_WORLD_MATERIALIZE_START_MS)
                / (BallController.DEATH_CORE_REASSEMBLY_START_MS - BallController.DEATH_WORLD_MATERIALIZE_START_MS),
        ));
        if (this.deathReconstructionAmbience) {
            this.deathReconstructionAmbience.alpha = 1 - phaseProgress * 0.26;
        }
        this.updateDeathBufferFragments(elapsed, true);
        this.updateDeathReticle(elapsed);

        for (const visual of this.deathPlatformVisuals) {
            const progress = this.getDeathPlatformMaterializationProgress(visual, elapsed);
            const eased = 1 - Math.pow(1 - progress, 3);
            const remaining = 1 - eased;
            for (const duplicate of visual.duplicates) {
                const jitterScale = remaining * (3.2 + duplicate.duplicateIndex * 1.4);
                duplicate.node.x = (Number(visual.platform.x) || 0)
                    + duplicate.offsetX * remaining
                    + Math.sin(elapsed * (0.034 + duplicate.duplicateIndex * 0.006) + duplicate.phase) * jitterScale;
                duplicate.node.y = (Number(visual.platform.y) || 0)
                    + duplicate.offsetY * remaining
                    + Math.cos(elapsed * (0.03 + duplicate.duplicateIndex * 0.005) + duplicate.phase) * jitterScale * 0.68;
                duplicate.node.rotation = (duplicate.duplicateIndex === 0 ? -2.4 : 2.4) * remaining
                    + Math.sin(elapsed * 0.026 + duplicate.phase) * remaining;
                this.paintDeathPlatformMaterializationVisual(
                    duplicate.node,
                    progress,
                    duplicate.duplicateIndex,
                );
            }
            visual.platform.visible = progress >= BallController.DEATH_PLATFORM_LOCK_THRESHOLD
                && this.deathPlatformFinalVisibility.get(visual.platform) !== false;
        }

        for (const spike of this.spikes) {
            const shouldExist = this.deathHazardFinalVisibility.get(spike) === true;
            const owner = this.deathHazardOwnerPlatforms.get(spike);
            const ownerVisual = this.deathPlatformVisuals.find((visual) => visual.platform === owner);
            const ownerProgress = ownerVisual
                ? this.getDeathPlatformMaterializationProgress(ownerVisual, elapsed)
                : 0;
            spike.visible = shouldExist
                && !!ownerVisual
                && ownerProgress >= BallController.DEATH_PLATFORM_LOCK_THRESHOLD;
        }
    }

    private paintDeathPlatformMaterializationVisual(node: any, progress: number, duplicateIndex: number): void {
        const graphics = node?.graphics;
        if (!graphics) return;
        const width = Math.max(1, Number(node.width) || 1);
        const height = Math.max(6, Number(node.height) || 8);
        const eased = 1 - Math.pow(1 - progress, 3);
        graphics.clear();
        node.visible = progress < 1;
        const convergenceFade = Math.max(0, Math.min(1, (1 - progress) / 0.26));
        node.alpha = (0.18 + eased * 0.34) * convergenceFade;
        const color = duplicateIndex === 0 ? "#42F5FF" : "#8B6CFF";

        if (typeof graphics.drawLine === "function") {
            const sliceCount = 4;
            for (let slice = 0; slice < sliceCount; slice++) {
                const x0 = width * slice / sliceCount + (slice % 2 === 0 ? 0 : 2 * (1 - eased));
                const x1 = width * (slice + 0.72 + eased * 0.22) / sliceCount;
                const y = height * (0.25 + (slice % 2) * 0.42);
                graphics.drawLine(x0, y, Math.min(width, x1), y, color, slice === 0 ? 2 : 1);
            }
            graphics.drawLine(0, height * 0.5, width, height * 0.5, color, 1);
        } else if (typeof graphics.drawRect === "function") {
            graphics.drawRect(0, height * 0.2, width, Math.max(2, height * 0.6), color);
        }
    }

    private finishDeathWorldMaterialization(): void {
        for (const [platform, visible] of this.deathPlatformFinalVisibility) {
            if (platform) platform.visible = visible;
        }
        for (const [spike, visible] of this.deathHazardFinalVisibility) {
            if (spike) spike.visible = visible;
        }
        this.restoreDeathGroundCanonicalState();
        this.destroyDeathPlatformVisuals();
    }

    private beginDeathCoreReassembly(): void {
        if (this.deathCoreReassemblyStarted) return;
        this.deathCoreReassemblyStarted = true;
        this.finishDeathWorldMaterialization();
        this.deathReconstructionPhase = 'CORE_REASSEMBLING';

        const ball = this.owner as any;
        this.centerX = this.startX;
        this.centerY = this.startY;
        this.previousY = this.startY;
        if (ball) {
            this.syncBallSprite(ball);
            ball.visible = true;
        }
        if (this.ballVisualRoot) {
            this.ballVisualRoot.visible = true;
            this.ballVisualRoot.alpha = 0;
        }
        if (this.ballAura) this.ballAura.visible = false;
        if (this.ballShell) this.ballShell.visible = false;
        if (this.ballCore) this.ballCore.visible = false;
        if (this.ballCircuits) this.ballCircuits.visible = false;
        this.createDeathBallReassemblyShards();
    }

    private createDeathBallReassemblyShards(): void {
        this.destroyDeathBallReassembly();
        const ball = this.owner as any;
        const parent = ball?.parent;
        if (!parent || typeof parent.addChild !== "function") return;

        const layer = new Laya.Sprite();
        layer.name = "WPV3_CyberCoreReassembly";
        layer.x = this.startX;
        layer.y = this.startY;
        layer.zOrder = (Number(ball.zOrder) || 5) + 1;
        layer.mouseEnabled = false;
        layer.mouseThrough = true;
        layer.blendMode = "lighter";
        parent.addChild(layer);
        this.deathBallReassemblyLayer = layer;

        const colors = ["#42F5FF", "#8B6CFF", "#FFFFFF", "#35E9FF"];
        for (let i = 0; i < BallController.DEATH_BALL_SHARD_COUNT; i++) {
            const shard = new Laya.Sprite();
            shard.name = "WPV3_CoreShard_" + i;
            shard.mouseEnabled = false;
            const size = 2.4 + (i % 3) * 0.7;
            const color = colors[i % colors.length];
            if (typeof shard.graphics?.drawPoly === "function") {
                shard.graphics.drawPoly(
                    -size,
                    -size,
                    [0, 0, size * 2.2, size * 0.35, size * 1.35, size * 2.1, size * 0.2, size * 1.45],
                    color,
                );
            } else if (typeof shard.graphics?.drawRect === "function") {
                shard.graphics.drawRect(-size * 0.5, -size * 0.5, size, size, color);
            }
            const angle = i * Math.PI * 2 / BallController.DEATH_BALL_SHARD_COUNT + (i % 2) * 0.17;
            const distance = 23 + (i % 3) * 7;
            const startX = Math.cos(angle) * distance;
            const startY = Math.sin(angle) * distance;
            shard.x = startX;
            shard.y = startY;
            layer.addChild(shard);
            this.deathBallShards.push({
                node: shard,
                startX,
                startY,
                spin: i % 2 === 0 ? 150 + i * 11 : -155 - i * 9,
            });
        }
    }

    private updateDeathCoreReassembly(elapsed: number): void {
        const progress = Math.max(0, Math.min(
            1,
            (elapsed - BallController.DEATH_CORE_REASSEMBLY_START_MS)
                / (BallController.DEATH_RECONSTRUCTION_DURATION_MS - BallController.DEATH_CORE_REASSEMBLY_START_MS),
        ));
        const eased = 1 - Math.pow(1 - progress, 2);

        if (this.deathReconstructionAmbience) {
            this.deathReconstructionAmbience.alpha = 1;
            const dim = typeof this.deathReconstructionAmbience.getChildByName === "function"
                ? this.deathReconstructionAmbience.getChildByName("WPV3_GlobalDim")
                : null;
            if (dim) dim.alpha = 0.53 * (1 - eased);
        }
        this.updateDeathBufferFragments(elapsed);
        this.updateDeathReticle(elapsed);
        for (const shard of this.deathBallShards) {
            const remaining = 1 - eased;
            shard.node.x = shard.startX * remaining;
            shard.node.y = shard.startY * remaining;
            shard.node.rotation = shard.spin * progress;
            shard.node.alpha = Math.max(0, 1 - Math.max(0, progress - 0.58) / 0.34);
        }

        if (this.ballVisualRoot) {
            this.ballVisualRoot.visible = true;
            this.ballVisualRoot.alpha = Math.max(0, Math.min(1, (progress - 0.2) / 0.42));
            const scale = 0.78 + eased * 0.22;
            this.ballVisualRoot.scaleX = scale;
            this.ballVisualRoot.scaleY = scale;
        }
        if (this.ballCore) {
            this.ballCore.visible = progress >= 0.28;
            this.ballCore.alpha = Math.max(0, Math.min(1, (progress - 0.28) / 0.2));
        }
        if (this.ballShell) {
            this.ballShell.visible = progress >= 0.48;
            this.ballShell.alpha = Math.max(0, Math.min(1, (progress - 0.48) / 0.24));
        }
        if (this.ballCircuits) {
            this.ballCircuits.visible = progress >= 0.66;
            this.ballCircuits.alpha = Math.max(0, Math.min(1, (progress - 0.66) / 0.2));
        }
        if (this.ballAura) {
            this.ballAura.visible = progress >= 0.78;
            this.ballAura.alpha = Math.max(0, Math.min(0.28, (progress - 0.78) / 0.22 * 0.28));
        }
    }

    private updateDeathReconstruction(now: number = this.getWpBNow()): void {
        if (this.deathReconstructionPhase === 'IDLE') return;
        const elapsed = Math.max(0, now - this.deathReconstructionStartedAt);

        if (elapsed >= BallController.DEATH_DECONSTRUCT_END_MS && !this.deathLogicalRespawnDone) {
            this.beginDeathReassemblyBuffer();
        }
        if (elapsed >= BallController.DEATH_WORLD_MATERIALIZE_START_MS && !this.deathWorldGenerationDone) {
            this.beginDeathWorldMaterialization();
        }
        if (elapsed >= BallController.DEATH_CORE_REASSEMBLY_START_MS && !this.deathCoreReassemblyStarted) {
            this.beginDeathCoreReassembly();
        }
        if (elapsed >= BallController.DEATH_RECONSTRUCTION_DURATION_MS) {
            this.completeDeathReconstruction();
            return;
        }

        // Existing reconstruction time drives the active cell fade; no independent timer is created.
        this.updateLevelDifficultyBar();

        switch (this.deathReconstructionPhase) {
            case 'DECONSTRUCTING':
                this.updateDeathDeconstruction(elapsed);
                break;
            case 'BUFFERING':
                this.updateDeathReassemblyBuffer(elapsed);
                break;
            case 'WORLD_MATERIALIZING':
                this.updateDeathWorldMaterialization(elapsed);
                break;
            case 'CORE_REASSEMBLING':
                this.updateDeathCoreReassembly(elapsed);
                break;
        }
    }

    private completeDeathReconstruction(): void {
        this.finishDeathWorldMaterialization();
        this.restoreCanonicalBallAfterReconstruction();
        this.clearDeathReconstruction();
    }

    private restoreCanonicalBallAfterReconstruction(): void {
        const ball = this.owner as any;
        if (ball) {
            ball.visible = true;
            this.centerX = this.startX;
            this.centerY = this.startY;
            this.previousY = this.startY;
            this.syncBallSprite(ball);
        }
        this.vx = 0;
        this.vy = 0;
        this.ballVisualScaleX = 1;
        this.ballVisualScaleY = 1;
        if (this.ballVisualRoot) {
            this.ballVisualRoot.visible = true;
            this.ballVisualRoot.alpha = 1;
            this.ballVisualRoot.scaleX = 1;
            this.ballVisualRoot.scaleY = 1;
        }
        if (this.ballAura) {
            this.ballAura.visible = true;
            this.ballAura.alpha = 0.22;
        }
        if (this.ballShell) {
            this.ballShell.visible = true;
            this.ballShell.alpha = 1;
        }
        if (this.ballCore) {
            this.ballCore.visible = true;
            this.ballCore.alpha = 1;
        }
        if (this.ballCircuits) {
            this.ballCircuits.visible = true;
            this.ballCircuits.alpha = 1;
        }
        this.ballTrailHistory = [];
        for (const trail of this.ballTrailNodes) {
            trail.visible = true;
            trail.alpha = 0;
        }
    }

    private destroyDeathOldWorldVisuals(): void {
        for (const fragment of this.deathOldWorldVisuals) {
            this.destroyVisualNode(fragment.node);
        }
        this.deathOldWorldVisuals = [];
    }

    private destroyDeathPlatformVisuals(): void {
        for (const visual of this.deathPlatformVisuals) {
            for (const duplicate of visual.duplicates) {
                this.destroyVisualNode(duplicate.node);
            }
        }
        this.deathPlatformVisuals = [];
    }

    private destroyDeathBallReassembly(): void {
        if (this.deathBallReassemblyLayer) {
            this.destroyVisualNode(this.deathBallReassemblyLayer);
        }
        this.deathBallReassemblyLayer = null;
        this.deathBallShards = [];
    }

    private clearDeathReconstruction(): void {
        const wasActive = this.deathReconstructionPhase !== 'IDLE'
            || this.deathReconstructionUntilMs > 0
            || !!this.deathReconstructionAmbience;

        this.destroyDeathBufferFragments();
        this.destroyDeathReticle();
        if (this.deathReconstructionAmbience) {
            this.destroyVisualNode(this.deathReconstructionAmbience);
        }
        this.deathReconstructionAmbience = null;
        this.destroyDeathOldWorldVisuals();
        this.destroyDeathPlatformVisuals();
        this.destroyDeathBallReassembly();

        for (const [platform, visible] of this.deathPlatformFinalVisibility) {
            if (platform) platform.visible = visible;
        }
        for (const [spike, visible] of this.deathHazardFinalVisibility) {
            if (spike) spike.visible = visible;
        }
        // Ground restoration wins over any temporary visibility map sampled during reconstruction.
        this.restoreDeathGroundCanonicalState();
        if (wasActive) {
            const ball = this.owner as any;
            if (ball) ball.visible = this.deathBallWasVisible;
            if (this.ballVisualRoot) {
                this.ballVisualRoot.visible = true;
                this.ballVisualRoot.alpha = 1;
                this.ballVisualRoot.scaleX = this.ballVisualScaleX;
                this.ballVisualRoot.scaleY = this.ballVisualScaleY;
            }
            if (this.ballAura) this.ballAura.visible = true;
            if (this.ballShell) this.ballShell.visible = true;
            if (this.ballCore) this.ballCore.visible = true;
            if (this.ballCircuits) this.ballCircuits.visible = true;
            for (const trail of this.ballTrailNodes) {
                trail.visible = true;
            }
        }

        this.deathPlatformFinalVisibility.clear();
        this.deathHazardFinalVisibility.clear();
        this.deathHazardOwnerPlatforms.clear();
        this.deathGroundCanonicalState = null;
        this.deathReconstructionPhase = 'IDLE';
        this.deathReconstructionStartedAt = 0;
        this.deathReconstructionUntilMs = 0;
        this.deathLogicalRespawnDone = false;
        this.deathWorldGenerationDone = false;
        this.deathCoreReassemblyStarted = false;
        this.deathBallWasVisible = true;
        this.levelDeathRollbackDisplay = null;
        if (wasActive) {
            // Converge exactly to the authoritative initial growth state at reconstruction completion.
            this.updateLevelDifficultyBar();
        }
    }
    private captureFatalVisualPosition(): void {
        const ball = this.owner as any;
        if (!ball) return;
        ball.x = this.centerX;
        ball.y = this.centerY;
    }

    // Normal death enters the locked V3 world reconstruction lifecycle.
    private handleDeath(): void {
        if (this.isHandlingDeath) return;
        if (this.deathReconstructionPhase !== 'IDLE') return;
        if (ScoreManager.instance.isWon()) return;

        this.isHandlingDeath = true;
        // This is V3 death-visual initialization, not ordinary post-death gameplay sync.
        this.captureFatalVisualPosition();
        SfxManager.playDeath();
        this.startDeathFeedback();
        this.triggerDeathHaptics();

        try {
            this.startDeathReconstruction();
        } finally {
            this.isHandlingDeath = false;
        }
    }

    private startDeathFeedback(): void {
        this.clearDeathFeedback();
        const ball = this.owner as any;
        this.startScreenShake();
        this.showDeathFlash();
        this.spawnDeathFragments(Number(ball?.x) || this.centerX, Number(ball?.y) || this.centerY);
    }

    private startScreenShake(): void {
        this.stopScreenShake();
        const target = (this.owner as any)?.parent;
        if (!target || target === Laya.stage) return;

        this.shakeTarget = target;
        this.shakeBaseX = Number(target.x) || 0;
        this.shakeBaseY = Number(target.y) || 0;
        this.shakeStartedAt = this.getWpBNow();
    }

    private updateScreenShake(now: number): void {
        const target = this.shakeTarget;
        if (!target) return;

        const elapsed = Math.max(0, now - this.shakeStartedAt);
        if (elapsed >= 125) {
            this.stopScreenShake();
            return;
        }

        const frame = Math.floor(elapsed / 16);
        const strength = 3.2 * (1 - elapsed / 125);
        target.x = this.shakeBaseX + Math.sin((frame + 1) * 2.17) * strength;
        target.y = this.shakeBaseY + Math.cos((frame + 1) * 2.83) * strength * 0.7;
    }

    private stopScreenShake(): void {
        const target = this.shakeTarget;
        if (target) {
            try {
                target.x = this.shakeBaseX;
                target.y = this.shakeBaseY;
            } catch (_) {
                // A destroyed scene cannot be restored, but must not retain local state.
            }
        }
        this.shakeTarget = null;
        this.shakeStartedAt = 0;
    }

    private showDeathFlash(): void {
        this.removeDeathFlash();
        if (!Laya.stage) return;

        const flash = new Laya.Sprite();
        flash.name = "WPB_DeathFlash";
        flash.zOrder = 9990;
        flash.mouseEnabled = false;
        flash.mouseThrough = true;
        flash.width = Math.max(1, Laya.stage.width || 1);
        flash.height = Math.max(1, Laya.stage.height || 1);
        flash.alpha = 0.34;
        if (typeof flash.graphics?.drawRect === "function") {
            flash.graphics.drawRect(0, 0, flash.width, flash.height, "#FF1744");
        }
        Laya.stage.addChild(flash);
        this.deathFlash = flash;
        this.deathFlashStartedAt = this.getWpBNow();
    }

    private updateDeathFlash(now: number): void {
        if (!this.deathFlash) return;

        const elapsed = Math.max(0, now - this.deathFlashStartedAt);
        if (elapsed >= 110) {
            this.removeDeathFlash();
            return;
        }
        this.deathFlash.alpha = 0.34 * (1 - elapsed / 110);
    }

    private removeDeathFlash(): void {
        if (this.deathFlash) {
            this.destroyVisualNode(this.deathFlash);
        }
        this.deathFlash = null;
        this.deathFlashStartedAt = 0;
    }

    private spawnDeathFragments(worldX: number, worldY: number): void {
        this.removeDeathFragments();
        const ball = this.owner as any;
        const parent = ball?.parent;
        if (!parent || typeof parent.addChild !== "function") return;

        const layer = new Laya.Sprite();
        layer.name = "WPV3_DeathCoreFragments";
        layer.zOrder = (Number(ball.zOrder) || 5) + 2;
        layer.mouseEnabled = false;
        layer.mouseThrough = true;
        parent.addChild(layer);

        this.deathFragmentLayer = layer;
        this.deathFragmentStartedAt = this.getWpBNow();
        this.deathFragmentOriginX = worldX;
        this.deathFragmentOriginY = worldY;
        this.deathFragments = [];

        const colors = ["#42F5FF", "#9B6CFF", "#FFFFFF", "#35E9FF"];
        for (let i = 0; i < BallController.DEATH_BALL_SHARD_COUNT; i++) {
            const fragment = new Laya.Sprite();
            fragment.name = "WPV3_DeathCoreFragment_" + i;
            fragment.mouseEnabled = false;
            const size = 2.3 + (i % 3) * 0.8;
            const color = colors[i % colors.length];
            if (typeof fragment.graphics?.drawPoly === "function") {
                fragment.graphics.drawPoly(
                    -size,
                    -size,
                    [0, 0, size * 2.2, size * 0.35, size * 1.35, size * 2.1, size * 0.2, size * 1.45],
                    color,
                );
            } else if (typeof fragment.graphics?.drawRect === "function") {
                fragment.graphics.drawRect(-size * 0.5, -size * 0.5, size, size, color);
            }
            fragment.x = worldX;
            fragment.y = worldY;
            layer.addChild(fragment);

            const angle = i * Math.PI * 2 / BallController.DEATH_BALL_SHARD_COUNT + (i % 2) * 0.16;
            const speed = 58 + (i % 4) * 14;
            this.deathFragments.push({
                node: fragment,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                spin: i % 2 === 0 ? 190 + i * 9 : -195 - i * 7,
            });
        }
    }

    private updateDeathFragments(now: number): void {
        if (!this.deathFragmentLayer) return;

        const elapsedMs = Math.max(0, now - this.deathFragmentStartedAt);
        if (elapsedMs >= BallController.DEATH_DECONSTRUCT_END_MS) {
            this.removeDeathFragments();
            return;
        }

        const elapsed = elapsedMs / 1000;
        const life = 1 - elapsedMs / BallController.DEATH_DECONSTRUCT_END_MS;
        for (const fragment of this.deathFragments) {
            fragment.node.x = this.deathFragmentOriginX + fragment.vx * elapsed;
            fragment.node.y = this.deathFragmentOriginY + fragment.vy * elapsed;
            fragment.node.rotation = fragment.spin * elapsed;
            fragment.node.alpha = life;
        }
    }

    private removeDeathFragments(): void {
        if (this.deathFragmentLayer) {
            this.destroyVisualNode(this.deathFragmentLayer);
        }
        this.deathFragmentLayer = null;
        this.deathFragmentStartedAt = 0;
        this.deathFragments = [];
    }
    private triggerDeathHaptics(): void {
        try {
            const browserGlobal: any = typeof globalThis !== "undefined" ? globalThis : null;
            const navigatorObject = browserGlobal?.navigator;
            if (typeof navigatorObject?.vibrate === "function") {
                navigatorObject.vibrate(40);
            }
        } catch (_) {
            // Haptics are best-effort and never participate in death semantics.
        }
    }

    private updateDeathFeedback(): void {
        const now = this.getWpBNow();
        this.updateScreenShake(now);
        this.updateDeathFlash(now);
        this.updateDeathFragments(now);
    }

    private clearDeathFeedback(): void {
        this.stopScreenShake();
        this.removeDeathFlash();
        this.removeDeathFragments();
    }

    private getWpBNow(): number {
        const timerValue = Number(Laya.timer?.currTimer);
        return Number.isFinite(timerValue) ? timerValue : Date.now();
    }

    private getVisualStagePoint(node: any, localX: number, localY: number): { x: number; y: number } {
        if (node && typeof node.localToGlobal === "function" && Laya.Point) {
            try {
                const converted = node.localToGlobal(new Laya.Point(localX, localY), true);
                if (converted && Number.isFinite(converted.x) && Number.isFinite(converted.y)) {
                    return { x: converted.x, y: converted.y };
                }
            } catch (_) {
                // Fall back to the unscaled parent chain below.
            }
        }

        let x = localX;
        let y = localY;
        let current = node;
        while (current && current !== Laya.stage) {
            x += Number(current.x) || 0;
            y += Number(current.y) || 0;
            current = current.parent;
        }
        return { x, y };
    }

    private destroyVisualNode(node: any): void {
        if (!node) return;
        try {
            if (typeof node.removeSelf === "function") node.removeSelf();
        } catch (_) {
            // Ignore removal races during scene teardown.
        }
        try {
            if (typeof node.destroy === "function") node.destroy(true);
        } catch (_) {
            // Ignore destruction races during scene teardown.
        }
    }

    /**
     * 复活逻辑：重置小球位置、速度、平台状态和消失平台配置
     *
     * 复活时刻：
     * 1. 小球掉出屏幕底部（checkDeath()）
     * 2. 小球落到 Ground 平台且 deathEnabled=true（resolveVerticalCollision()）
     *
     * 复活操作：
     * - 小球位置/速度：恢复到出生点，清空速度向量
     * - 平台碰撞状态：platformsActive=false（需重新从 Ground 起跳激活）
     * - 死亡判定：deathEnabled=false（需重新踩 Platform_* 才启用 Ground 死亡）
     * - 分数系统：调用 ScoreManager.reset()，清空本关分数和已踩平台记录
     * - 消失平台：全部复原为 idle 状态（绿色可见），重置计时器，允许再次触发倒计时
     *
     * 此方法不修改 currentLevel，仅复活当前关卡。下一关切换由 restartGame() 负责。
     */
    private respawn(): void {
        console.log("Ball died, respawn");

        // 恢复到出生点位置
        this.centerX = this.startX;
        this.centerY = this.startY;
        this.previousY = this.startY;
        this.syncBallSprite(this.owner as any);

        // 重置速度
        this.vx = 0;
        this.vy = 0;

        // 重置运动状态
        this.onGround = false;
        this.groundPlatform = null;
        this.resetPlatformLandingImpacts();
        // 重置游戏状态
        this.platformsActive = false;
        this.deathEnabled = false;
        this.syncGroundVisual();

        // 重置分数管理器
        ScoreManager.instance.reset();
        // WP-E1.5 只重置派生视觉：同关死亡回到本关起始形态，换关使用新关卡检查点形态。
        this.resetBallEnergyVisual(this.currentLevel, 0);

        // 同关死亡重来:消失平台全部复原
        this.clearDisappearRecoveryStates();
        for (const [p, cfg] of this.disappearConfigs) {
            cfg.state = 'idle';
            cfg.triggerAt = 0;
            p.visible = true;
            this.repaintPlatformColor(p, "#00cc00");
            this.resetDisappearRecoveryState(p);
        }
    }

    // 胜利后进入下一关：复用 respawn() 的全部重置，再重新随机平台布局
    // 胜利后按 R 重开本局，并切换到下一关的随机平台布局
    private restartGame(): void {
        console.log("Restart game");
        this.clearDeathReconstruction();
        this.clearDeathFeedback();

        this.currentLevel++;
        if (this.currentLevel > this.maxLevel) {
            this.currentLevel = 1;
        }

        this.respawn();
        this.randomizePlatforms();
        this.randomizeHazards();
        this.updateLevelDifficultyBar();
        this.beginLevelTransition();
    }

    public advanceAfterWin(): void {
        if (!ScoreManager.instance.isWon()) {
            return;
        }

        this.restartGame();
    }

    // 复用 SCORE HUD 的切角框与分段格语言，只展示四格成长进度。
    private createLevelDifficultyBar(): void {
        if (this.levelDifficultyHud) return;

        const hudWidth = 202;
        const hudHeight = 40;
        this.levelDifficultyHud = new Laya.Sprite();
        this.levelDifficultyHud.x = 40;
        this.levelDifficultyHud.y = 82;
        this.levelDifficultyHud.width = hudWidth;
        this.levelDifficultyHud.height = hudHeight;
        this.levelDifficultyHud.zOrder = 9999;
        this.levelDifficultyHud.mouseEnabled = false;

        const background = new Laya.Sprite();
        background.alpha = 0.9;
        background.graphics.drawPoly(
            0,
            0,
            [8, 0, hudWidth - 8, 0, hudWidth, 8, hudWidth, hudHeight - 8,
                hudWidth - 8, hudHeight, 8, hudHeight, 0, hudHeight - 8, 0, 8],
            "#06111F",
            "#1A7188",
            1
        );
        this.levelDifficultyHud.addChild(background);

        const frame = new Laya.Sprite();
        frame.graphics.drawLine(14, 0, 92, 0, "#35E9FF", 1.5);
        frame.graphics.drawLine(8, hudHeight - 1, 42, hudHeight - 1, "#7C4DFF", 1);
        frame.graphics.drawLine(hudWidth - 10, 4, hudWidth - 5, 9, "#35E9FF", 1);
        frame.graphics.drawLine(58, 7, 58, hudHeight - 7, "#164B5A", 1);
        this.levelDifficultyHud.addChild(frame);

        const levelLabel = new Laya.Text();
        levelLabel.name = "WPH_LevelLabel";
        levelLabel.text = "LEVEL";
        levelLabel.font = "Arial";
        levelLabel.fontSize = 14;
        levelLabel.color = "#78D7E8";
        levelLabel.bold = true;
        levelLabel.x = 14;
        levelLabel.y = 5;
        levelLabel.width = 42;
        levelLabel.height = 30;
        levelLabel.align = "left";
        levelLabel.valign = "middle";
        levelLabel.mouseEnabled = false;
        this.levelDifficultyHud.addChild(levelLabel);

        this.levelDifficultyCells = [];
        this.levelDifficultyNumerals = [];
        const cellStartX = 67;
        const cellWidth = 28;
        const cellHeight = 20;
        const cellGap = 4;
        for (let i = 0; i < this.maxLevel; i++) {
            const cell = new Laya.Sprite();
            cell.name = "WPH_LevelCell_" + (i + 1);
            cell.x = cellStartX + i * (cellWidth + cellGap);
            cell.y = 10;
            cell.width = cellWidth;
            cell.height = cellHeight;
            cell.mouseEnabled = false;

            const numeral = new Laya.Text();
            numeral.name = "WPH_LevelRoman_" + (i + 1);
            numeral.font = "Arial";
            numeral.fontSize = 14;
            numeral.bold = true;
            numeral.stroke = 1;
            numeral.strokeColor = "#031019";
            numeral.width = cellWidth;
            numeral.height = cellHeight;
            numeral.align = "center";
            numeral.valign = "middle";
            numeral.mouseEnabled = false;
            cell.addChild(numeral);

            this.levelDifficultyHud.addChild(cell);
            this.levelDifficultyCells.push(cell);
            this.levelDifficultyNumerals.push(numeral);
        }

        Laya.stage.addChild(this.levelDifficultyHud);
        this.updateLevelDifficultyBar();
    }

    // 当前格与 Cyber Ball 共用调色板和成长进度；已完成格只取该关终态色。
    private updateLevelDifficultyBar(): void {
        const palettes = BallController.BALL_ENERGY_CHECKPOINT_PALETTES;
        const romanNumerals = ["I", "II", "III", "IV"];

        for (let i = 0; i < this.levelDifficultyCells.length; i++) {
            const cell = this.levelDifficultyCells[i];
            const numeral = this.levelDifficultyNumerals[i];
            const cellWidth = Math.max(1, Number(cell?.width) || 28);
            const cellHeight = Math.max(1, Number(cell?.height) || 20);
            const level = i + 1;
            const isCompleted = level < this.currentLevel;
            const isCurrent = level === this.currentLevel;
            const startIndex = Math.max(0, Math.min(palettes.length - 2, level - 1));
            const start = palettes[startIndex];
            const target = palettes[startIndex + 1];
            const currentDisplayProgress = this.resolveLevelDeathRollbackDisplayProgress(level);
            const growthProgress = isCompleted
                ? 1
                : isCurrent
                    ? currentDisplayProgress
                    : 0;
            const fillFrom = start.coreOuter.map((channel: number) => Math.round(channel * 0.44));
            const fillTo = target.coreOuter.map((channel: number) => Math.round(channel * 0.44));
            const strokeFrom = start.coreOuterStroke.map((channel: number) => Math.round(channel * 0.76));
            const strokeTo = target.coreOuterStroke.map((channel: number) => Math.round(channel * 0.76));

            cell.graphics.clear();
            cell.alpha = isCurrent ? 1 : isCompleted ? 0.88 : 0.68;
            cell.graphics.drawPoly(
                0,
                0,
                [0, 0, cellWidth - 4, 0, cellWidth, 4, cellWidth, cellHeight, 0, cellHeight],
                isCompleted || isCurrent
                    ? this.mixBallEnergyColor(fillFrom, fillTo, growthProgress)
                    : "#081822",
                isCompleted || isCurrent
                    ? this.mixBallEnergyColor(strokeFrom, strokeTo, growthProgress)
                    : "#244956",
                isCurrent ? 1.6 : 1
            );

            if (isCompleted || isCurrent) {
                const growthWidth = isCompleted
                    ? cellWidth - 6
                    : Math.max(2, Math.round((cellWidth - 6) * growthProgress));
                cell.graphics.drawLine(
                    3,
                    cellHeight - 3,
                    3 + growthWidth,
                    cellHeight - 3,
                    this.mixBallEnergyColor(start.circuitPrimary, target.circuitPrimary, growthProgress),
                    1
                );
            }

            if (numeral) {
                numeral.text = isCurrent ? romanNumerals[i] : "";
                numeral.color = this.mixBallEnergyColor(
                    start.circuitNode,
                    target.circuitNode,
                    growthProgress
                );
            }
        }
    }

    private resolveLevelDeathRollbackDisplayProgress(level: number): number {
        const authoritativeProgress = Math.max(0, Math.min(1, this.ballEnergyVisualProgress));
        const rollback = this.levelDeathRollbackDisplay;
        if (
            !rollback
            || rollback.level !== level
            || this.deathReconstructionPhase === 'IDLE'
            || this.deathReconstructionStartedAt <= 0
        ) {
            return authoritativeProgress;
        }

        const elapsed = Math.max(0, this.getWpBNow() - this.deathReconstructionStartedAt);
        const timelineProgress = Math.max(
            0,
            Math.min(1, elapsed / BallController.DEATH_RECONSTRUCTION_DURATION_MS)
        );
        const easedProgress = timelineProgress * timelineProgress * (3 - 2 * timelineProgress);
        return rollback.fromProgress * (1 - easedProgress);
    }
    /**
     * 统一计算墙体内侧边界。
     * 当前左右墙是一个横向矩形旋转 90 度得到的竖墙：
     * - width 是墙的长度，不是厚度
     * - height 才是墙的厚度
     * 所以左墙内侧是 wall.x，右墙内侧是 wall.x - wall.height。
     */
    private getWallInnerBound(wall: any, side: "left" | "right" | "top"): number {
        // 如果墙体不存在，返回默认值
        if (!wall) {
            // 右墙默认为舞台宽度，左墙默认为0
            return side === "right" ? Laya.stage.width : 0;
        }

        // 获取墙体的X坐标
        const x = wall.x || 0;
        // 获取墙体的Y坐标
        const y = wall.y || 0;
        // 获取墙体的宽度
        const width = wall.width || 0;
        // 获取墙体的高度（厚度）
        const height = wall.height || 0;
        // 获取墙体的旋转角度（取绝对值并模180）
        const rotation = Math.abs(wall.rotation || 0) % 180;
        // 判断墙体是否通过旋转变成竖墙（45-135度之间视为竖墙）
        const isVerticalByRotation = rotation > 45 && rotation < 135;

        // 如果查询的是左墙内侧，根据旋转状态返回相应坐标
        if (side === "left") return isVerticalByRotation ? x : x + width;
        // 如果查询的是右墙内侧，根据旋转状态返回相应坐标
        if (side === "right") return isVerticalByRotation ? x - height : x;
        // 返回顶墙的下方边界（内侧）
        return y + height; // top
    }

    // 同步球的位置到Laya节点
    private syncBallSprite(ball: any): void {
        // 计算结束后，把脚本里的球心坐标写回 Laya 节点。
        // 将计算后的X坐标写回
        ball.x = this.centerX;
        // 将计算后的Y坐标写回
        ball.y = this.centerY;
    }

    /**
     * 检测球是否离开平台边缘并释放落地状态
     *
     * 边缘释放机制：球站在平台上时，如果水平移动到平台有效范围外（考虑容差），
     * 立即清除落地状态，让球自然下落，避免被硬卡在平台边缘。
     *
     * 这个机制确保玩家能顺利跨越平台间的小间隙，同时保持单向平台的视觉直观性。
     * 容差值（edgeGrace）为 2 像素或半径的 40%，防止过于敏感或不够敏感。
     */
    private releaseGroundIfUnsupported(): void {
        // 如果不在地面上或没有平台，则返回
        if (!this.onGround || !this.groundPlatform) return;

        // 获取当前平台信息
        const platform = this.groundPlatform;
        // 获取球的半径
        const radius = this.getBallRadius();
        // 获取平台边缘容差
        const edgeGrace = this.getPlatformEdgeGrace(radius);
        // 计算平台左右边界
        const leftBound = (platform.x || 0) - edgeGrace;
        const rightBound = (platform.x || 0) + (platform.width || 0) + edgeGrace;

        // 如果球水平离开当前平台有效范围，则取消落地状态，让它自然下落。
        if (this.centerX < leftBound || this.centerX > rightBound) {
            // 取消落地状态
            this.onGround = false;
            // 清除平台参考
            this.groundPlatform = null;
        }
    }

    // 计算平台边缘容差值
    private getPlatformEdgeGrace(radius: number): number {
        // 给平台边缘 1~2 像素容差，减少刚好落在边缘时的视觉穿模。
        // 不要调太大，否则球会像被平台边缘吸住。
        // 返回半径的40%或2像素，取较小值
        return Math.min(2, radius * 0.4);
    }

    // 获取球的半径
    private getBallRadius(): number {
        // 获取球节点
        const ball = this.owner as any;
        // 当前小球是 10x10，所以半径是 5；这里写成通用计算，方便以后改大小。
        // 返回球的宽高较大值的一半
        return Math.max(ball.width || 30, ball.height || 30) * 0.5;
    }

    // 收集场景中所有的平台和墙体
    private collectPlatforms(): void {
        // 获取球的父节点
        const parent: any = (this.owner as any).parent;
        // 获取所有子节点
        const children: any[] = parent?._children ?? parent?._childs ?? [];

        // 这些墙体仍然留在场景里用于显示；运行时碰撞由脚本手动计算。
        // 查找各个墙体节点
        this.topWall = children.find((child) => child?.name === "top wall") ?? null;
        this.leftWall = children.find((child) => child?.name === "left wall") ?? null;
        this.rightWall = children.find((child) => child?.name === "right wall") ?? null;

        // 单向平台和地面都作为"可以从上方落地"的平台处理。
        // 过滤出所有平台节点
        this.platforms = children.filter((child) => {
            return typeof child?.name === "string" && (child.name.indexOf("Platform_") === 0 || child.name === "Ground");
        });

        this.initializeVisualLayer();

        // 如果没有找到任何平台，输出警告
        if (this.platforms.length === 0) {
            console.warn("⚠️ 场景中未找到任何以 Platform_ 开头的节点！");
        }

        this.createHazardsIfNeeded();
        // 场景加载后随机一次平台位置
        this.randomizePlatforms();
        this.randomizeHazards();
    }

    // 动态创建 Level 4 尖刺，挂到 Platform_* 相同的 parent，避免坐标系不一致。
    private createHazardsIfNeeded(): void {
        if (this.spikes.length > 0) return;

        const platform = this.platforms.find((p: any) => {
            return typeof p?.name === "string" && p.name.indexOf("Platform_") === 0;
        });
        const platformParent = platform?.parent;
        if (!platformParent) return;

        const children: any[] = platformParent?._children ?? platformParent?._childs ?? [];
        const existingSpike = typeof platformParent.getChildByName === "function"
            ? platformParent.getChildByName("Spike_1")
            : children.find((child: any) => child?.name === "Spike_1");
        if (existingSpike) {
            existingSpike.visible = false;
            existingSpike.mouseEnabled = false;
            this.paintSpikeVisual(existingSpike);
            this.spikes.push(existingSpike);
            return;
        }

        const spike = new Laya.Sprite();
        spike.name = "Spike_1";
        spike.visible = false;
        spike.width = 80;
        spike.height = 8;
        spike.zOrder = ((platform as any).zOrder || 0) + 1;
        spike.mouseEnabled = false;
        this.paintSpikeVisual(spike);

        platformParent.addChild(spike);
        this.spikes.push(spike);
    }

    // Level 4 尖刺随机化：只放在非移动、非消失的 Platform_1~Platform_5 上。
    private randomizeHazards(): void {
        this.createHazardsIfNeeded();
        this.deathHazardOwnerPlatforms.clear();

        if (this.currentLevel !== 4) {
            for (const spike of this.spikes) {
                spike.visible = false;
            }
            return;
        }

        const spike = this.spikes[0];
        if (!spike) return;

        const radius = this.getBallRadius();
        const spikeHeight = Math.max(8, Math.round(radius * 1.6));
        const minSafeWidth = radius * 2 + 12;
        const leftInner = this.getWallInnerBound(this.leftWall, "left");
        const rightInner = this.getWallInnerBound(this.rightWall, "right");
        const topWallBottom = this.getWallInnerBound(this.topWall, "top");

        const sorted = this.getSortedGamePlatforms();
        const candidates: Array<{ platform: any; side: SpikeSide; spikeWidth: number }> = [];
        const spikeSides: SpikeSide[] = ['left', 'right'];

        for (const platform of sorted) {
            const name = platform?.name;
            if (typeof name !== "string" || !/^Platform_[1-5]$/.test(name)) continue;
            if (this.movingConfigs.has(platform)) continue;
            if (this.disappearConfigs.has(platform)) continue;

            const platformX = platform.x || 0;
            const platformY = platform.y || 0;
            const platformWidth = platform.width || 0;
            const spikeWidth = Math.floor(platformWidth * this.spikeWidthRatio);
            const safeWidth = platformWidth - spikeWidth;

            if (spikeWidth <= 0 || safeWidth < minSafeWidth) continue;
            if (platformX < leftInner || platformX + platformWidth > rightInner) continue;
            if (platformY - spikeHeight < topWallBottom) continue;

            for (const side of spikeSides) {
                if (this.isSpikePlacementFair(platform, side, sorted, spikeWidth)) {
                    candidates.push({ platform, side, spikeWidth });
                }
            }
        }

        if (candidates.length === 0) {
            spike.visible = false;
            return;
        }

        const placement = candidates[Math.floor(this.rng() * candidates.length)];
        const target = placement.platform;
        const targetWidth = target.width || 0;
        const spikeWidth = placement.spikeWidth;
        const spikeX = placement.side === 'left' ? target.x : target.x + targetWidth - spikeWidth;
        const spikeY = target.y - spikeHeight;

        if (spikeX < leftInner || spikeX + spikeWidth > rightInner || spikeY < topWallBottom) {
            spike.visible = false;
            return;
        }

        spike.x = Math.round(spikeX);
        spike.y = Math.round(spikeY);
        spike.width = spikeWidth;
        spike.height = spikeHeight;
        spike.zOrder = (target.zOrder || 0) + 1;
        // Record the exact placement relationship for V3 visual reveal ownership.
        this.deathHazardOwnerPlatforms.set(spike, target);
        spike.visible = true;
        this.paintSpikeVisual(spike);
    }

    private getSortedGamePlatforms(): any[] {
        return this.platforms
            .filter((p: any) => typeof p.name === "string" && p.name.indexOf("Platform_") === 0)
            .sort((a: any, b: any) => (a.name as string).localeCompare(b.name));
    }

    private isSpikePlacementFair(hostPlatform: any, spikeSide: SpikeSide, sorted: any[], spikeWidth: number): boolean {
        const hostIndex = sorted.indexOf(hostPlatform);
        if (hostIndex < 0) return true;

        const ground = this.platforms.find((p: any) => p?.name === "Ground") ?? null;
        const prevNeighbor = hostIndex > 0 ? sorted[hostIndex - 1] : ground;
        const nextNeighbor = hostIndex < sorted.length - 1 ? sorted[hostIndex + 1] : null;

        if (prevNeighbor && this.isNeighborOnSide(hostPlatform, prevNeighbor, spikeSide)) {
            if (!this.isAffectedJumpFair(prevNeighbor, hostPlatform, hostPlatform, spikeSide, spikeWidth)) {
                return false;
            }
        }

        if (nextNeighbor && this.isNeighborOnSide(hostPlatform, nextNeighbor, spikeSide)) {
            if (!this.isAffectedJumpFair(hostPlatform, nextNeighbor, hostPlatform, spikeSide, spikeWidth)) {
                return false;
            }
        }

        return true;
    }

    private isAffectedJumpFair(sourcePlatform: any, targetPlatform: any, hostPlatform: any, spikeSide: SpikeSide, spikeWidth: number): boolean {
        const reach = this.estimateJumpReachBySimulation(sourcePlatform.y || 0, targetPlatform.y || 0);

        if (this.disappearConfigs.has(targetPlatform)) {
            const requiredX = this.getWorstCaseRequiredX(sourcePlatform, targetPlatform, hostPlatform, spikeSide, spikeWidth);
            if (requiredX === null) return false;

            const safetyFrameMargin = 2;
            const horizontalSafetyMargin = this.maxSpeedX * safetyFrameMargin;
            return requiredX <= reach - horizontalSafetyMargin;
        }

        if (this.movingConfigs.has(targetPlatform)) {
            const bestCaseRequiredX = this.getBestCaseRequiredX(sourcePlatform, targetPlatform, hostPlatform, spikeSide, spikeWidth);
            if (bestCaseRequiredX === null) return false;

            return bestCaseRequiredX <= reach;
        }

        const requiredX = this.getWorstCaseRequiredX(sourcePlatform, targetPlatform, hostPlatform, spikeSide, spikeWidth);
        if (requiredX === null) return false;

        return requiredX <= reach;
    }

    private getWorstCaseRequiredX(sourcePlatform: any, targetPlatform: any, hostPlatform: any, spikeSide: SpikeSide, spikeWidth: number): number | null {
        const sourceXs = this.getPlatformXOptions(sourcePlatform);
        const targetXs = this.getPlatformXOptions(targetPlatform);
        let worstRequiredX = 0;

        for (const sourceX of sourceXs) {
            const sourceInterval = this.getPlatformSafeCenterInterval(
                sourcePlatform,
                sourcePlatform === hostPlatform ? spikeSide : undefined,
                sourcePlatform === hostPlatform ? spikeWidth : undefined,
                sourceX
            );
            if (!sourceInterval) return null;

            for (const targetX of targetXs) {
                const targetInterval = this.getPlatformSafeCenterInterval(
                    targetPlatform,
                    targetPlatform === hostPlatform ? spikeSide : undefined,
                    targetPlatform === hostPlatform ? spikeWidth : undefined,
                    targetX
                );
                if (!targetInterval) return null;

                worstRequiredX = Math.max(worstRequiredX, this.getCenterIntervalGap(sourceInterval, targetInterval));
            }
        }

        return worstRequiredX;
    }

    private getBestCaseRequiredX(sourcePlatform: any, targetPlatform: any, hostPlatform: any, spikeSide: SpikeSide, spikeWidth: number): number | null {
        const sourceXs = this.getPlatformXOptions(sourcePlatform);
        const targetXs = this.getPlatformXOptions(targetPlatform);
        let bestRequiredX: number | null = null;

        for (const sourceX of sourceXs) {
            const sourceInterval = this.getPlatformSafeCenterInterval(
                sourcePlatform,
                sourcePlatform === hostPlatform ? spikeSide : undefined,
                sourcePlatform === hostPlatform ? spikeWidth : undefined,
                sourceX
            );
            if (!sourceInterval) continue;

            for (const targetX of targetXs) {
                const targetInterval = this.getPlatformSafeCenterInterval(
                    targetPlatform,
                    targetPlatform === hostPlatform ? spikeSide : undefined,
                    targetPlatform === hostPlatform ? spikeWidth : undefined,
                    targetX
                );
                if (!targetInterval) continue;

                const requiredX = this.getCenterIntervalGap(sourceInterval, targetInterval);
                bestRequiredX = bestRequiredX === null ? requiredX : Math.min(bestRequiredX, requiredX);
            }
        }

        return bestRequiredX;
    }

    private getPlatformXOptions(platform: any): number[] {
        const config = this.movingConfigs.get(platform);
        if (!config) return [platform.x || 0];

        const options: number[] = [];
        for (const x of [config.rangeMin, config.rangeMax]) {
            if (typeof x === "number" && isFinite(x) && options.indexOf(x) < 0) {
                options.push(x);
            }
        }

        return options.length > 0 ? options : [platform.x || 0];
    }

    private getPlatformSafeCenterInterval(platform: any, spikeSide?: SpikeSide, spikeWidth?: number, xOverride?: number): [number, number] | null {
        const radius = this.getBallRadius();
        const platformX = xOverride !== undefined ? xOverride : platform.x || 0;
        const platformWidth = platform.width || 0;
        const spikeBlockWidth = spikeWidth || 0;

        let left = platformX + radius;
        let right = platformX + platformWidth - radius;

        if (spikeSide === 'left') {
            left = platformX + spikeBlockWidth + radius;
        } else if (spikeSide === 'right') {
            right = platformX + platformWidth - spikeBlockWidth - radius;
        }

        if (left >= right) return null;
        return [left, right];
    }

    private getCenterIntervalGap(sourceInterval: [number, number], targetInterval: [number, number]): number {
        if (targetInterval[0] > sourceInterval[1]) {
            return targetInterval[0] - sourceInterval[1];
        }
        if (sourceInterval[0] > targetInterval[1]) {
            return sourceInterval[0] - targetInterval[1];
        }
        return 0;
    }

    private isNeighborOnSide(hostPlatform: any, neighborPlatform: any, side: SpikeSide): boolean {
        const radius = this.getBallRadius();
        const hostCenter = (hostPlatform.x || 0) + (hostPlatform.width || 0) / 2;
        const neighborCenter = (neighborPlatform.x || 0) + (neighborPlatform.width || 0) / 2;
        const delta = neighborCenter - hostCenter;

        if (Math.abs(delta) < radius) return false;
        return side === 'left' ? delta <= -radius : delta >= radius;
    }

    private estimateJumpReachBySimulation(sourceY: number, targetY: number): number {
        const radius = this.getBallRadius();
        let centerY = sourceY - radius;
        let vy = -this.jumpStrength;
        let horizontalSteps = 0;
        const maxFrames = 120;

        // This mirrors onUpdate(): jump sets vy, then vertical landing is checked
        // before the frame's horizontal movement is counted.
        for (let frame = 0; frame < maxFrames; frame++) {
            const previousY = centerY;
            centerY += vy;

            const previousBottom = previousY + radius;
            const currentBottom = centerY + radius;
            const crossedTop = previousBottom <= targetY + 0.5 && currentBottom >= targetY - 0.5;

            if (vy >= 0 && crossedTop) {
                return horizontalSteps * this.maxSpeedX;
            }

            horizontalSteps++;
            vy += this.gravity;
        }

        return -1;
    }

    /**
     * 对 Platform_* 平台做分层随机布局，生成关卡的随机平台配置
     *
     * 逻辑流程：
     * 1. 过滤并按名字排序 Platform_* 节点，保证分层顺序稳定
     * 2. 分配 Platform_1 ~ Platform_N 分别对应从低到高的 N 层
     * 3. 对每层平台：
     *    - Y 坐标：基础高度向上分层（Platform_1 最低 ≈620px），每层相隔 120px
     *    - X 坐标：在合法范围内随机（保证整体在左右墙内），相邻平台中心距离限制在 ±300px
     *    - Platform_1 特殊处理：避开出生点正下方，但留在可跳范围内
     * 4. 按关卡等级随机分配移动平台（Level 2 选 1 个，Level 3/4 选 2 个）
     *    - rangeMin 来自左墙内侧边界，rangeMax 来自右墙内侧边界减去平台宽度
     *    - 填充 movingConfigs Map 以供 updateMovingPlatform() 使用
     * 5. 调用 setupDisappearPlatforms() 注册消失平台配置（仅 Level 3/4 启用）
     *
     * 此方法仅改动平台节点的 x / y 坐标，不改其他属性（width/height/显示等）。
     * 由 collectPlatforms()（初始化）和 restartGame()（下一关）调用。
     */
    private randomizePlatforms(): void {
        // 只取 Platform_* 节点，按名字排序保证分层顺序稳定
        const sorted = this.platforms
            .filter((p: any) => typeof p.name === "string" && p.name.indexOf("Platform_") === 0)
            .sort((a: any, b: any) => (a.name as string).localeCompare(b.name));

        const count = sorted.length;
        this.movingConfigs.clear();  // 每次重新布局时清除旧配置
        if (count === 0) return;

        // 可玩区域 X 范围：左右墙内侧（与 getWallInnerBound 保持一致）
        const xMin = this.getWallInnerBound(this.leftWall, "left");
        const xMax = this.getWallInnerBound(this.rightWall, "right");

        // Y 轴：固定基础高度 + 小幅抖动。Platform_1 最低(Y≈620)，每层向上抬约 120。
        const baseY = 620;       // Platform_1 基础高度
        const layerStep = 120;   // 每层向上抬升
        const yJitter = 20;      // ±20 抖动

        // X 轴：相邻平台中心水平距离尽量不超过 300
        const maxNeighborDX = 300;

        // 平台生成带只收窄 spawn X；墙体、球的活动范围和移动平台运行区间保持原状。
        // 当前 200px 平台得到 75px 边缘留白：保留抗贴墙收益，同时给整体构图释放横向空间。
        const widestPlatform = sorted.reduce(
            (width: number, platform: any) => Math.max(width, Number(platform?.width) || 200),
            0
        );
        const playfieldWidth = Math.max(0, xMax - xMin);
        const desiredGenerationMargin = Math.min(
            widestPlatform * 0.375,
            Math.max(0, maxNeighborDX - widestPlatform)
        );
        const maximumGenerationMargin = Math.max(0, (playfieldWidth - widestPlatform) * 0.5);
        const platformGenerationMargin = Math.min(desiredGenerationMargin, maximumGenerationMargin);
        const generationBandMin = xMin + platformGenerationMargin;
        const generationBandMax = xMax - platformGenerationMargin;

        const compositionCenterX = (generationBandMin + generationBandMax) * 0.5;
        const compositionHalfSpan = Math.max(
            1,
            (generationBandMax - generationBandMin - widestPlatform) * 0.5
        );

        // 连续单样本重映射：用累计横向偏移平衡左右负载，用中心外扩减少窄带堆叠。
        // 节奏压力只在连续同向或连续换向已经出现后介入，不会主动制造阶梯或乒乓节奏。
        const compositionBalanceGain = 6;
        const sideOccupancyBalanceGain = 2;
        const compositionOutwardGain = 0.55;
        const staticStreakPressure = 3.6;
        const movingStreakPressure = 2.6;
        const staticAntiAlternationPressure = 0.9;
        const movingAntiAlternationPressure = 0.65;
        const maximumCompositionPressure = 5;

        // 记录上一块平台的中心 X，用于约束相邻距离
        let prevCenterX = this.startX;
        let lastHorizontalDirection = 0;
        let sameDirectionStreak = 0;
        let alternatingDirectionStreak = 0;
        let normalizedCompositionOffset = 0;
        let leftRightOccupancyBalance = 0;
        let sampledPlatformCount = 0;
        const movingCount = this.currentLevel === 3 || this.currentLevel === 4 ? 2 : this.currentLevel === 2 ? 1 : 0;
        const movingIndices = new Set<number>();
        const targetMovingCount = Math.min(movingCount, count);
        while (movingIndices.size < targetMovingCount) {
            movingIndices.add(Math.floor(this.rng() * count));
        }
        let movingIndex = 0;

        for (let i = 0; i < count; i++) {
            const platform = sorted[i];
            const platformWidth = platform.width || 200;
            const halfWidth = platformWidth / 2;

            // ── Y：基础高度向上分层 + 抖动 ──
            const layerBaseY = baseY - i * layerStep;
            const jitter = (this.rng() * 2 - 1) * yJitter;
            platform.y = Math.round(layerBaseY + jitter);

            // ── X：中心坐标的合法范围（保证平台整体在墙内）──
            const centerMin = xMin + halfWidth;
            const centerMax = xMax - halfWidth;
            const generationCenterMin = generationBandMin + halfWidth;
            const generationCenterMax = generationBandMax - halfWidth;

            // 相邻平台中心距离约束在 ±maxNeighborDX 内
            let lo = Math.max(centerMin, prevCenterX - maxNeighborDX);
            let hi = Math.min(centerMax, prevCenterX + maxNeighborDX);

            let centerX: number;
            if (i === 0) {
                // Platform_1 特殊处理：避开出生点正下方，但留在可跳范围内
                centerX = this.pickPlatform1CenterX(
                    centerMin,
                    centerMax,
                    halfWidth,
                    generationCenterMin,
                    generationCenterMax
                );
            } else {
                if (lo > hi) { lo = centerMin; hi = centerMax; } // 兜底，避免空区间
                const bandLo = Math.max(lo, generationCenterMin);
                const bandHi = Math.min(hi, generationCenterMax);
                // 生成带交集为空时，回退到原有墙内 + neighbor 合法区间，玩法约束优先。
                const sampleLo = bandLo <= bandHi ? bandLo : lo;
                const sampleHi = bandLo <= bandHi ? bandHi : hi;
                const randomSample = this.spreadPlatformSample(this.rng());
                const movingComposition = movingIndices.has(i);
                const streakPressure = movingComposition
                    ? movingStreakPressure
                    : staticStreakPressure;
                const antiAlternationPressure = movingComposition
                    ? movingAntiAlternationPressure
                    : staticAntiAlternationPressure;
                const meanCompositionOffset = sampledPlatformCount > 0
                    ? normalizedCompositionOffset / sampledPlatformCount
                    : 0;
                const compositionPressure = -meanCompositionOffset * compositionBalanceGain
                    - leftRightOccupancyBalance * sideOccupancyBalanceGain;
                const rhythmPressure = lastHorizontalDirection === 0
                    ? 0
                    : sameDirectionStreak >= 2
                        ? -lastHorizontalDirection * streakPressure
                        : alternatingDirectionStreak >= 1
                            ? lastHorizontalDirection * antiAlternationPressure
                            : 0;
                const combinedPressure = Math.max(
                    -maximumCompositionPressure,
                    Math.min(maximumCompositionPressure, compositionPressure + rhythmPressure)
                );
                const biasedSample = this.biasPlatformSample(randomSample, combinedPressure);
                const sampledCenterX = sampleLo + biasedSample * (sampleHi - sampleLo);
                const normalizedSampleOffset = Math.max(
                    -1,
                    Math.min(1, (sampledCenterX - compositionCenterX) / compositionHalfSpan)
                );
                const outwardDirection = normalizedSampleOffset === 0
                    ? (biasedSample < 0.5 ? -1 : 1)
                    : Math.sign(normalizedSampleOffset);
                const outwardRoom = outwardDirection < 0
                    ? sampledCenterX - sampleLo
                    : sampleHi - sampledCenterX;
                const balanceDamping = Math.max(0.15, 1 - Math.abs(meanCompositionOffset));
                centerX = sampledCenterX
                    + outwardDirection
                    * outwardRoom
                    * compositionOutwardGain
                    * (1 - Math.abs(normalizedSampleOffset))
                    * balanceDamping;
            }

            platform.x = Math.round(centerX - halfWidth);
            const horizontalDirection = Math.sign(centerX - prevCenterX);
            if (horizontalDirection !== 0) {
                if (horizontalDirection === lastHorizontalDirection) {
                    sameDirectionStreak++;
                    alternatingDirectionStreak = 0;
                } else {
                    alternatingDirectionStreak = lastHorizontalDirection === 0
                        ? 0
                        : alternatingDirectionStreak + 1;
                    lastHorizontalDirection = horizontalDirection;
                    sameDirectionStreak = 1;
                }
            }
            const normalizedCenterOffset = Math.max(
                -1,
                Math.min(1, (centerX - compositionCenterX) / compositionHalfSpan)
            );
            normalizedCompositionOffset += normalizedCenterOffset;
            leftRightOccupancyBalance += Math.sign(normalizedCenterOffset);
            sampledPlatformCount++;
            prevCenterX = centerX;

            // 移动平台分配（Level 2: 1个, Level 3/4: 2个）
            // 由 movingIndices 在本轮随机抽样决定
            if (movingIndices.has(i)) {
                const leftInner = this.getWallInnerBound(this.leftWall, "left");
                const rightInner = this.getWallInnerBound(this.rightWall, "right");
                const rangeMin = Math.max(leftInner, platform.x - 300);
                const rangeMax = Math.min(rightInner - platform.width, platform.x + 300);
                const safeRangeMin = rangeMin <= rangeMax ? rangeMin : platform.x;
                const safeRangeMax = rangeMin <= rangeMax ? rangeMax : platform.x;
                this.movingConfigs.set(platform, {
                    axis: 'x',
                    speed: 1.5,
                    rangeMin: safeRangeMin,
                    rangeMax: safeRangeMax,
                    direction: movingIndex === 0 ? 1 : -1,
                });
                movingIndex++;
            }
        }

        // 先恢复所有 Platform_* 可见(节点复用,上一轮可能残留 hidden)
        for (const p of sorted) {
            p.visible = true;
            this.repaintPlatformColor(p, "#ffffff");
        }
        // 再按当前关卡注册消失平台(此时 movingConfigs 已填充完毕)
        this.setupDisappearPlatforms(sorted, movingIndices);
        this.refreshPlatformVisuals();
    }

    /**
     * 按当前关卡等级注册消失平台，并允许与移动平台重合
     *
     * 启用条件：仅 Level 3/4 关卡有消失平台，Level 1 和 Level 2 返回空配置。
     *
     * 消失平台的来源和规则：
     * - 从除最后一块外的 Platform_* 中随机选取 1 块平台
     * - 可与移动平台重合（同一块平台既能移动，又能消失）
     * - 消失平台不额外生成，复用现有的 Platform_* 节点
     *
     * 初始化操作：
     * - 清空 disappearConfigs 旧配置
     * - 随机选中的平台初始化为 { state: 'idle', triggerAt: 0 }
     * - 平台颜色设为绿色（#00cc00），表示待踩可用状态
     *
     * 参数说明：
     * @param sorted - 已排序的 Platform_* 节点数组（仅含 Platform_*，不含 Ground）
     * @param movingIndices - 本轮被分配为移动平台的平台索引集合（仅用于展示，消失平台可与其重合）
     */
    private setupDisappearPlatforms(sorted: any[], movingIndices: Set<number>): void {
        this.clearDisappearRecoveryStates();
        this.disappearConfigs.clear();
        if (this.currentLevel !== 3 && this.currentLevel !== 4) return;

        const candidates = sorted.slice(0, -1);
        if (candidates.length === 0) return; // 无平台,放弃注册

        const target = candidates[Math.floor(this.rng() * candidates.length)];
        this.disappearConfigs.set(target, { state: 'idle', triggerAt: 0 });
        this.resetDisappearRecoveryState(target);
        this.repaintPlatformColor(target, "#00ff00");
    }

    // 为 Platform_1 选一个中心 X：避开出生点正下方，且不离出生点太远
    private pickPlatform1CenterX(
        centerMin: number,
        centerMax: number,
        halfWidth: number,
        generationCenterMin: number = centerMin,
        generationCenterMax: number = centerMax
    ): number {
        const ballHalf = this.getBallRadius();
        // 出生点正下方的“禁放”区间：球的水平投影与平台重叠则视为正下方
        const forbidLo = this.startX - halfWidth - ballHalf;
        const forbidHi = this.startX + halfWidth + ballHalf;
        // 希望 Platform_1 落在出生点左右一个可跳偏移内
        const minOffset = halfWidth + ballHalf + 20; // 至少错开，不在正下方
        const maxOffset = 280;                       // 不要离出生点太远

        // 候选：出生点左侧和右侧各一段，取墙内有效部分
        const rightLo = Math.max(centerMin, this.startX + minOffset);
        const rightHi = Math.min(centerMax, this.startX + maxOffset);
        const leftHi  = Math.min(centerMax, this.startX - minOffset);
        const leftLo  = Math.max(centerMin, this.startX - maxOffset);

        const ranges: Array<[number, number]> = [];
        if (rightLo <= rightHi) ranges.push([rightLo, rightHi]);
        if (leftLo <= leftHi) ranges.push([leftLo, leftHi]);

        const bandRanges = ranges
            .map(([lo, hi]): [number, number] => [
                Math.max(lo, generationCenterMin),
                Math.min(hi, generationCenterMax),
            ])
            .filter(([lo, hi]) => lo <= hi);
        // 生成带过窄或无交集时保留原有可跳候选，且不增加 RNG draw。
        const sampledRanges = bandRanges.length > 0 ? bandRanges : ranges;

        // 正常情况：在左右候选区间里随机挑一段
        if (sampledRanges.length > 0) {
            const [lo, hi] = sampledRanges[Math.floor(this.rng() * sampledRanges.length)];
            const randomSample = this.spreadPlatformSample(this.rng());
            return lo + randomSample * (hi - lo);
        }

        // 兜底：直接放到出生点右侧最小错开处（仍夹在墙内），保证不在正下方
        let fallback = this.startX + minOffset;
        if (fallback > centerMax) fallback = this.startX - minOffset;
        return Math.min(centerMax, Math.max(centerMin, fallback));
    }

    // 对单次均匀样本做对称、连续、单调的中心外扩，保留完整区间与唯一布局多样性。
    private spreadPlatformSample(sample: number): number {
        const value = Math.max(0, Math.min(1, sample));
        const exponent = 1.8;
        return value < 0.5
            ? 0.5 * Math.pow(value * 2, exponent)
            : 1 - 0.5 * Math.pow((1 - value) * 2, exponent);
    }

    // 正值向区间右侧、负值向左侧软偏移；指数映射始终单调且不新增 RNG draw。
    private biasPlatformSample(sample: number, pressure: number): number {
        const value = Math.max(0, Math.min(1, sample));
        const boundedPressure = Math.max(-5, Math.min(5, pressure));
        return boundedPressure >= 0
            ? 1 - Math.pow(1 - value, 1 + boundedPressure)
            : Math.pow(value, 1 - boundedPressure);
    }

    // 检查一个或多个按键是否被按下
    private isKeyDown(...keys: Array<string | number>): boolean {
        // 判断传入的多个按键中是否有任何一个被按下
        // 如果任意一个按键被按下则返回true
        return keys.some((key) => Laya.InputManager.hasKeyDown(key));
    }

    private initializeVisualLayer(): void {
        this.refreshPlatformVisuals();
        this.syncGroundVisual();
        this.initializeBallVisual();
        this.initializeBoundaryVisuals();
        if (!this.visualLoopStarted && typeof Laya.timer?.frameLoop === "function") {
            this.visualLoopStarted = true;
            Laya.timer.frameLoop(1, this, this.updateVisualEffects);
        }
    }

    private refreshPlatformVisuals(): void {
        for (const platform of this.platforms) {
            if (typeof platform?.name !== "string" || platform.name.indexOf("Platform_") !== 0) continue;
            const disappear = this.disappearConfigs.get(platform);
            this.paintPlatformVisual(platform, disappear ? "#00ff00" : "#ffffff");
        }
    }

    private paintPlatformVisual(platform: any, bodyColor: string): void {
        if (!platform || typeof platform.addChild !== "function") return;

        let holoSide = typeof platform.getChildByName === "function"
            ? platform.getChildByName("WPA_HoloSide")
            : null;
        if (!holoSide) {
            const children: any[] = platform?._children ?? platform?._childs ?? [];
            holoSide = children.find((child: any) => child?.name === "WPA_HoloSide") ?? null;
        }
        if (!holoSide) {
            holoSide = new Laya.Sprite();
            holoSide.name = "WPA_HoloSide";
            holoSide.mouseEnabled = false;
            holoSide.y = 0;
            platform.addChild(holoSide);
        }

        const width = Math.max(1, platform.width || 1);
        const depth = Math.max(6, Math.min(12, Math.round((platform.height || 10) * 0.7)));
        const isMoving = this.movingConfigs.has(platform);
        const disappear = this.disappearConfigs.get(platform);
        const warning = bodyColor !== "#ffffff";
        const graphics = holoSide.graphics;
        if (!graphics) return;

        holoSide.x = 0;
        holoSide.width = width;
        holoSide.height = depth + 4;
        holoSide.zOrder = 1;
        holoSide.alpha = 0.78;
        graphics.clear();

        const sideFill = warning ? bodyColor : "#082A46";
        if (typeof graphics.drawPoly === "function") {
            graphics.drawPoly(0, 3, [0, 0, width, 0, width - 8, depth, 8, depth], sideFill, "#35E9FF", 1);
        }
        if (typeof graphics.drawLine === "function") {
            graphics.drawLine(0, 0, width, 0, warning ? bodyColor : "#8FFBFF", 2);
            graphics.drawLine(8, depth, width - 8, depth, "#715CFF", 1);
            graphics.drawLine(width * 0.2, 5, width * 0.8, 5, "#16758D", 1);

            if (isMoving) {
                const center = width * 0.5;
                graphics.drawLine(center - 24, 7, center - 14, 3, "#A7FFFF", 2);
                graphics.drawLine(center - 24, 7, center - 14, 11, "#A7FFFF", 2);
                graphics.drawLine(center + 24, 7, center + 14, 3, "#A7FFFF", 2);
                graphics.drawLine(center + 24, 7, center + 14, 11, "#A7FFFF", 2);
            }
            if (disappear) {
                for (let x = 12; x < width - 8; x += 22) {
                    graphics.drawLine(x, 3, Math.min(width - 4, x + 8), depth, warning ? bodyColor : "#F9FF70", 1);
                }
            }
        }
        this.ensurePlatformThrusters(platform);
    }

    private ensurePlatformThrusters(platform: any): void {
        if (!platform || typeof platform.addChild !== "function") return;

        this.ensurePlatformThruster(platform, "WPB_LeftThruster", true);
        this.ensurePlatformThruster(platform, "WPB_RightThruster", false);
    }

    private ensurePlatformThruster(platform: any, name: string, isLeft: boolean): any {
        let thruster = typeof platform.getChildByName === "function"
            ? platform.getChildByName(name)
            : null;
        if (!thruster) {
            const children: any[] = platform?._children ?? platform?._childs ?? [];
            thruster = children.find((child: any) => child?.name === name) ?? null;
        }
        if (!thruster) {
            thruster = new Laya.Sprite();
            thruster.name = name;
            thruster.mouseEnabled = false;
            thruster.y = Math.max(6, (platform.height || 10) * 0.55);
            platform.addChild(thruster);
        }

        const width = Math.max(1, platform.width || 1);
        thruster.width = 30;
        thruster.height = 46;
        thruster.x = isLeft ? 4 : Math.max(4, width - 34);
        thruster.zOrder = 2;
        thruster.alpha = 0.88;
        thruster.graphics.clear();

        if (typeof thruster.graphics?.drawPoly === "function") {
            thruster.graphics.drawPoly(
                2,
                1,
                [3, 0, 23, 0, 27, 5, 23, 13, 7, 13, 0, 5],
                "#10283D",
                "#7DF9FF",
                1.5
            );
            thruster.graphics.drawPoly(
                5,
                9,
                [3, 0, 17, 0, 21, 7, 0, 7],
                "#263454",
                "#BBA2FF",
                1
            );
        }
        if (typeof thruster.graphics?.drawRect === "function") {
            thruster.graphics.drawRect(8, 0, 14, 4, "#274D62", "#C5FCFF", 1);
            thruster.graphics.drawRect(10, 12, 10, 4, "#071926", "#42F5FF", 1);
        }
        if (typeof thruster.graphics?.drawLine === "function") {
            thruster.graphics.drawLine(6, 5, 24, 5, "#466D88", 1);
            thruster.graphics.drawLine(9, 8, 21, 8, "#8B6CFF", 1);
        }

        let glow = typeof thruster.getChildByName === "function"
            ? thruster.getChildByName("WPB_NozzleGlow")
            : null;
        let plume = typeof thruster.getChildByName === "function"
            ? thruster.getChildByName("WPB_ThrusterPlume")
            : null;
        if (!glow) {
            glow = new Laya.Sprite();
            glow.name = "WPB_NozzleGlow";
            glow.mouseEnabled = false;
            thruster.addChild(glow);
        }
        if (!plume) {
            plume = new Laya.Sprite();
            plume.name = "WPB_ThrusterPlume";
            plume.mouseEnabled = false;
            thruster.addChild(plume);
        }

        glow.x = 15;
        glow.y = 16;
        glow.zOrder = 2;
        glow.graphics.clear();
        if (typeof glow.graphics?.drawCircle === "function") {
            glow.graphics.drawCircle(0, 0, 4.2, "#DFFFFF", "#42F5FF", 1);
            glow.graphics.drawCircle(0, 0, 2.1, "#FFFFFF");
        }

        plume.x = 0;
        plume.y = 16;
        plume.width = 30;
        plume.height = 30;
        plume.zOrder = 1;
        return thruster;
    }

    private updatePlatformThrusters(platform: any, platformIndex: number, impactOffsetY: number): void {
        const left = typeof platform.getChildByName === "function"
            ? platform.getChildByName("WPB_LeftThruster")
            : null;
        const right = typeof platform.getChildByName === "function"
            ? platform.getChildByName("WPB_RightThruster")
            : null;
        if (!left || !right) return;

        const width = Math.max(1, platform.width || 1);
        const baseY = Math.max(6, (platform.height || 10) * 0.55);
        const visualOffsetY = this.getPlatformVisualHover(platformIndex) + impactOffsetY;
        const leftPulse = (Math.sin(this.visualPhase * 1.65 + platformIndex * 0.73) + 1) * 0.5;
        const rightPulse = (Math.sin(this.visualPhase * 1.65 + platformIndex * 0.73 + 1.35) + 1) * 0.5;

        left.x = 4;
        right.x = Math.max(4, width - 34);
        left.y = baseY + visualOffsetY;
        right.y = baseY + visualOffsetY;
        left.scaleX = 1;
        left.scaleY = 1;
        right.scaleX = 1;
        right.scaleY = 1;
        this.updateThrusterPlume(left, this.visualPhase + platformIndex * 0.47, 0, leftPulse);
        this.updateThrusterPlume(right, this.visualPhase + platformIndex * 0.47 + 1.37, 1, rightPulse);

        const ballPoint = this.getVisualStagePoint(this.owner as any, 0, 0);
        const radius = this.getBallRadius();
        left.alpha = this.isBallNearThruster(ballPoint, radius, left) ? 0.27 : 0.88;
        right.alpha = this.isBallNearThruster(ballPoint, radius, right) ? 0.27 : 0.88;
    }

    private updateThrusterPlume(thruster: any, phase: number, sideIndex: number, pulse: number): void {
        const glow = typeof thruster.getChildByName === "function"
            ? thruster.getChildByName("WPB_NozzleGlow")
            : null;
        const plume = typeof thruster.getChildByName === "function"
            ? thruster.getChildByName("WPB_ThrusterPlume")
            : null;
        if (!glow || !plume?.graphics) return;

        glow.alpha = 0.72 + pulse * 0.28;
        const glowScale = 0.88 + pulse * 0.2;
        glow.scaleX = glowScale;
        glow.scaleY = glowScale;
        plume.alpha = 0.82 + pulse * 0.18;
        plume.graphics.clear();

        if (typeof plume.graphics.drawRect === "function") {
            plume.graphics.drawRect(12, 1, 6, 4, "#EFFFFF");
            plume.graphics.drawRect(11, 7, 8, 3, "#72F6FF");
            plume.graphics.drawRect(12, 12, 6, 2, "#5AA8FF");
        }

        const particleCount = 18;
        for (let i = 0; i < particleCount; i++) {
            const progress = (phase * 0.18 + i / particleCount + sideIndex * 0.11) % 1;
            const lane = ((i * 7 + sideIndex * 3) % 5) - 2;
            const spread = 2 + progress * 6.5;
            const x = 15 + lane * spread * 0.38 + Math.sin(phase * 1.8 + i * 1.7) * 0.9;
            const y = 3 + progress * 26;
            const radius = progress < 0.24 ? 1.8 : progress < 0.62 ? 1.35 : 0.95;
            const color = progress < 0.2
                ? (i % 3 === 0 ? "#FFFFFF" : "#BFFFFF")
                : progress < 0.55
                    ? (i % 2 === 0 ? "#42F5FF" : "#4CA8FF")
                    : (i % 2 === 0 ? "#6F7CFF" : "#A45CFF");
            if (typeof plume.graphics.drawCircle === "function") {
                plume.graphics.drawCircle(x, y, radius, color);
            } else if (typeof plume.graphics.drawRect === "function") {
                plume.graphics.drawRect(x - radius, y - radius, radius * 2, radius * 2, color);
            }
        }
    }

    private isBallNearThruster(ballPoint: { x: number; y: number }, ballRadius: number, thruster: any): boolean {
        const width = thruster.width || 30;
        const height = thruster.height || 46;
        const center = this.getVisualStagePoint(thruster, width * 0.5, height * 0.5);
        return Math.abs(ballPoint.x - center.x) <= ballRadius + width * 0.6
            && Math.abs(ballPoint.y - center.y) <= ballRadius + height * 0.75;
    }

    private getPlatformVisualHover(platformIndex: number): number {
        return Math.sin(this.visualPhase * 0.82 + platformIndex * 0.9) * 1.5;
    }

    private getPlatformLandingImpactNow(): number {
        const timerValue = Number(Laya.timer?.currTimer);
        return Number.isFinite(timerValue) ? timerValue : Date.now();
    }

    private updatePlatformLandingImpactTrigger(nowMs: number): void {
        const platform = this.onGround ? this.groundPlatform : null;
        const platformName = platform?.name;
        const disappear = platform ? this.disappearConfigs.get(platform) : null;
        const isValidPlatformLanding = typeof platformName === "string"
            && platformName.indexOf("Platform_") === 0
            && platform.visible !== false
            && disappear?.state !== "hidden";

        if (!isValidPlatformLanding) {
            this.platformLandingContact = null;
            return;
        }

        if (this.platformLandingContact !== platform) {
            this.platformLandingImpactStarts.set(platform, nowMs);
        }
        this.platformLandingContact = platform;
    }

    private getPlatformLandingImpactOffset(platform: any, nowMs: number): number {
        const startedAt = this.platformLandingImpactStarts.get(platform);
        if (startedAt === undefined) return 0;

        const duration = BallController.PLATFORM_LANDING_IMPACT_DURATION_MS;
        const elapsed = Math.max(0, nowMs - startedAt);
        if (elapsed >= duration) {
            this.platformLandingImpactStarts.delete(platform);
            return 0;
        }

        const halfDuration = duration * 0.5;
        const normalized = elapsed <= halfDuration
            ? elapsed / halfDuration
            : (duration - elapsed) / halfDuration;
        return BallController.PLATFORM_LANDING_IMPACT_MAX_Y * Math.max(0, Math.min(1, normalized));
    }

    private resetPlatformLandingImpacts(): void {
        this.platformLandingImpactStarts.clear();
        this.platformLandingContact = null;
    }

    private initializeBallVisual(): void {
        const ball = this.owner as any;
        const parent = ball?.parent;
        if (!ball || !parent || typeof ball.addChild !== "function") return;

        this.ballVisualRoot = typeof ball.getChildByName === "function"
            ? ball.getChildByName("WPD_CyberBall")
            : null;
        if (!this.ballVisualRoot) {
            this.ballVisualRoot = new Laya.Sprite();
            this.ballVisualRoot.name = "WPD_CyberBall";
            this.ballVisualRoot.mouseEnabled = false;
            ball.addChild(this.ballVisualRoot);
        }

        if (ball.graphics && typeof ball.graphics.clear === "function") {
            ball.graphics.clear();
        }
        ball.zOrder = Math.max(Number(ball.zOrder) || 0, 5);

        this.ballVisualRoot.x = 0;
        this.ballVisualRoot.y = 0;
        this.ballVisualRoot.zOrder = 1;
        this.ballVisualRoot.scaleX = 1;
        this.ballVisualRoot.scaleY = 1;

        this.ballAura = this.ensureCyberBallPart(this.ballVisualRoot, "WPD_BallAura");
        this.ballShell = this.ensureCyberBallPart(this.ballVisualRoot, "WPD_BallShell");
        this.ballCore = this.ensureCyberBallPart(this.ballVisualRoot, "WPD_BallCore");
        this.ballCircuits = this.ensureCyberBallPart(this.ballVisualRoot, "WPD_BallCircuits");

        this.ballAura.zOrder = 0;
        this.ballShell.zOrder = 1;
        this.ballCore.zOrder = 2;
        this.ballCircuits.zOrder = 3;

        this.ballAura.graphics.clear();
        this.ballAura.graphics.drawCircle(0, 0, 9.5, "#164D68");
        this.ballAura.graphics.drawCircle(0, 0, 7.3, "#258BC0");
        this.ballAura.alpha = 0.22;

        this.ballShell.graphics.clear();
        this.ballShell.graphics.drawCircle(0, 0, 5.4, "#071824", "#74FAFF", 1.2);
        this.ballShell.graphics.drawPoly(
            0,
            0,
            [0, -5.8, 4.8, -2.7, 4.8, 2.7, 0, 5.8, -4.8, 2.7, -4.8, -2.7],
            "#0B2637",
            "#35E9FF",
            0.8
        );

        this.ballCore.graphics.clear();
        this.ballCore.graphics.drawCircle(0, 0, 3.25, "#19DCE8", "#D8FFFF", 0.8);
        this.ballCore.graphics.drawCircle(0, 0, 1.65, "#F4FFFF");

        this.ballCircuits.graphics.clear();
        this.ballCircuits.graphics.drawLine(-4.2, -1.8, -2.3, -1.1, "#A96CFF", 0.8);
        this.ballCircuits.graphics.drawLine(2.3, 1.1, 4.2, 1.8, "#A96CFF", 0.8);
        this.ballCircuits.graphics.drawLine(-1.1, 3.4, 0, 5.1, "#53F8FF", 0.8);
        this.ballCircuits.graphics.drawLine(1.1, -3.4, 0, -5.1, "#53F8FF", 0.8);
        this.ballCircuits.graphics.drawCircle(-3.9, -1.7, 0.65, "#F7B5FF");
        this.ballCircuits.graphics.drawCircle(3.9, 1.7, 0.65, "#F7B5FF");

        this.initializeBallTrail(parent, ball);
        this.resetBallEnergyVisual(this.currentLevel, ScoreManager.instance.getScore());
    }

    private ensureCyberBallPart(parent: any, name: string): any {
        let part = typeof parent.getChildByName === "function" ? parent.getChildByName(name) : null;
        if (!part) {
            part = new Laya.Sprite();
            part.name = name;
            part.mouseEnabled = false;
            parent.addChild(part);
        }
        part.x = 0;
        part.y = 0;
        return part;
    }

    private initializeBallTrail(parent: any, ball: any): void {
        for (const node of this.ballTrailNodes) {
            this.destroyVisualNode(node);
        }
        this.ballTrailNodes = [];
        this.ballTrailHistory = [];

        const trailCount = 5;
        for (let i = 0; i < trailCount; i++) {
            const trail = new Laya.Sprite();
            trail.name = "WPD_BallTrail_" + i;
            trail.mouseEnabled = false;
            trail.zOrder = Math.max(1, (Number(ball.zOrder) || 5) - 1);
            trail.alpha = 0;
            trail.graphics.drawCircle(0, 0, 5.2, "#145270", "#42F5FF", 0.8);
            trail.graphics.drawCircle(0, 0, 2.4, "#45F1FF");
            parent.addChild(trail);
            this.ballTrailNodes.push(trail);
        }

        this.ballTrailLastX = Number(ball.x) || 0;
        this.ballTrailLastY = Number(ball.y) || 0;
    }

    private resetBallEnergyVisual(level: number, score: number): void {
        const normalizedLevel = Math.max(1, Math.min(this.maxLevel, Math.floor(level)));
        const normalizedScore = Math.max(
            0,
            Math.min(BallController.BALL_ENERGY_STAGE_COUNT, Math.floor(score))
        );
        const progress = Math.pow(normalizedScore / BallController.BALL_ENERGY_STAGE_COUNT, 1.2);

        this.ballEnergyObservedLevel = normalizedLevel;
        this.ballEnergyObservedScore = normalizedScore;
        this.ballEnergyTransitionFrom = progress;
        this.ballEnergyTransitionTo = progress;
        this.ballEnergyTransitionStartedAt = 0;
        this.ballEnergyTransitionActive = false;
        this.ballEnergyVisualProgress = progress;
        this.applyBallEnergyVisual(normalizedLevel, progress, true);
    }

    private updateBallEnergyEvolution(): void {
        const level = Math.max(1, Math.min(this.maxLevel, Math.floor(this.currentLevel)));
        const score = Math.max(
            0,
            Math.min(BallController.BALL_ENERGY_STAGE_COUNT, Math.floor(ScoreManager.instance.getScore()))
        );
        const now = this.readBallEnergyTime();

        if (level !== this.ballEnergyObservedLevel || score < this.ballEnergyObservedScore) {
            this.resetBallEnergyVisual(level, score);
            return;
        }

        if (score > this.ballEnergyObservedScore) {
            const currentProgress = this.resolveBallEnergyTransition(now);
            const targetProgress = Math.pow(score / BallController.BALL_ENERGY_STAGE_COUNT, 1.2);
            this.ballEnergyObservedScore = score;
            this.ballEnergyTransitionFrom = currentProgress;
            this.ballEnergyTransitionTo = targetProgress;
            this.ballEnergyTransitionStartedAt = now;
            this.ballEnergyTransitionActive = targetProgress > currentProgress;
        }

        this.ballEnergyVisualProgress = this.resolveBallEnergyTransition(now);
        this.applyBallEnergyVisual(level, this.ballEnergyVisualProgress, false);
    }

    private resolveBallEnergyTransition(now: number): number {
        if (!this.ballEnergyTransitionActive) {
            return this.ballEnergyTransitionTo;
        }

        const elapsed = Math.max(0, now - this.ballEnergyTransitionStartedAt);
        const progress = Math.min(1, elapsed / BallController.BALL_ENERGY_ABSORPTION_DURATION_MS);
        const eased = 1 - Math.pow(1 - progress, 2);
        const visualProgress = this.ballEnergyTransitionFrom
            + (this.ballEnergyTransitionTo - this.ballEnergyTransitionFrom) * eased;

        if (progress >= 1) {
            this.ballEnergyTransitionActive = false;
            return this.ballEnergyTransitionTo;
        }
        return visualProgress;
    }

    private readBallEnergyTime(): number {
        const timerValue = Number(Laya.timer?.currTimer);
        return Number.isFinite(timerValue) ? timerValue : Date.now();
    }

    private applyBallEnergyVisual(level: number, progress: number, force: boolean): void {
        const normalizedProgress = Math.max(0, Math.min(1, progress));
        // LEVEL is a derived consumer of the same effective Ball progress and must sync even when repaint is cached.
        this.ballEnergyVisualProgress = normalizedProgress;
        this.updateLevelDifficultyBar();
        if (
            !force
            && this.ballEnergyRenderedLevel === level
            && Math.abs(this.ballEnergyRenderedProgress - normalizedProgress) < 0.001
        ) {
            return;
        }

        const palettes = BallController.BALL_ENERGY_CHECKPOINT_PALETTES;
        const startIndex = Math.max(0, Math.min(palettes.length - 2, level - 1));
        const start = palettes[startIndex];
        const target = palettes[startIndex + 1];
        const mix = (from: number[], to: number[]): string => {
            return this.mixBallEnergyColor(from, to, normalizedProgress);
        };
        const evolutionStrength = Math.max(
            0,
            Math.min(1, (startIndex + normalizedProgress) / Math.max(1, palettes.length - 1))
        );

        if (this.ballAura) {
            this.ballAura.graphics.clear();
            this.ballAura.graphics.drawCircle(0, 0, 9.5, mix(start.auraOuter, target.auraOuter));
            this.ballAura.graphics.drawCircle(0, 0, 7.3, mix(start.auraInner, target.auraInner));
        }

        if (this.ballShell) {
            this.ballShell.graphics.clear();
            this.ballShell.graphics.drawCircle(
                0,
                0,
                5.4,
                mix(start.shellOuter, target.shellOuter),
                mix(start.shellOuterStroke, target.shellOuterStroke),
                1.2
            );
            this.ballShell.graphics.drawPoly(
                0,
                0,
                [0, -5.8, 4.8, -2.7, 4.8, 2.7, 0, 5.8, -4.8, 2.7, -4.8, -2.7],
                mix(start.shellPanel, target.shellPanel),
                mix(start.shellPanelStroke, target.shellPanelStroke),
                0.8
            );
        }

        if (this.ballCore) {
            this.ballCore.graphics.clear();
            this.ballCore.graphics.drawCircle(
                0,
                0,
                3.25,
                mix(start.coreOuter, target.coreOuter),
                mix(start.coreOuterStroke, target.coreOuterStroke),
                0.8 + evolutionStrength * 0.7
            );
            this.ballCore.graphics.drawCircle(0, 0, 1.65, mix(start.coreInner, target.coreInner));
        }

        if (this.ballCircuits) {
            const primary = mix(start.circuitPrimary, target.circuitPrimary);
            const secondary = mix(start.circuitSecondary, target.circuitSecondary);
            const node = mix(start.circuitNode, target.circuitNode);
            const lineWidth = 0.8 + evolutionStrength * 0.35;
            this.ballCircuits.graphics.clear();
            this.ballCircuits.graphics.drawLine(-4.2, -1.8, -2.3, -1.1, primary, lineWidth);
            this.ballCircuits.graphics.drawLine(2.3, 1.1, 4.2, 1.8, primary, lineWidth);
            this.ballCircuits.graphics.drawLine(-1.1, 3.4, 0, 5.1, secondary, lineWidth);
            this.ballCircuits.graphics.drawLine(1.1, -3.4, 0, -5.1, secondary, lineWidth);
            this.ballCircuits.graphics.drawCircle(-3.9, -1.7, 0.65, node);
            this.ballCircuits.graphics.drawCircle(3.9, 1.7, 0.65, node);
        }

        const trailOuter = mix(start.trailOuter, target.trailOuter);
        const trailStroke = mix(start.trailStroke, target.trailStroke);
        const trailInner = mix(start.trailInner, target.trailInner);
        for (const trail of this.ballTrailNodes) {
            trail.graphics.clear();
            trail.graphics.drawCircle(0, 0, 5.2, trailOuter, trailStroke, 0.8);
            trail.graphics.drawCircle(0, 0, 2.4, trailInner);
        }

        this.ballEnergyEvolutionStrength = evolutionStrength;
        this.ballEnergyRenderedLevel = level;
        this.ballEnergyRenderedProgress = normalizedProgress;
    }

    private mixBallEnergyColor(from: number[], to: number[], progress: number): string {
        const red = Math.round(from[0] + (to[0] - from[0]) * progress);
        const green = Math.round(from[1] + (to[1] - from[1]) * progress);
        const blue = Math.round(from[2] + (to[2] - from[2]) * progress);
        return "#" + this.ballEnergyHex(red) + this.ballEnergyHex(green) + this.ballEnergyHex(blue);
    }

    private ballEnergyHex(value: number): string {
        const hex = Math.max(0, Math.min(255, value)).toString(16).toUpperCase();
        return hex.length < 2 ? "0" + hex : hex;
    }

    private updateBallVisualEffects(pulse: number): void {
        const ball = this.owner as any;
        const visual = this.ballVisualRoot;
        if (!ball || !visual) return;

        this.updateBallEnergyEvolution();

        if (!this.ballVisualStateReady) {
            this.ballVisualStateReady = true;
            this.ballWasGrounded = this.onGround;
            this.ballLastVy = this.vy;
        }

        const landedThisFrame = this.onGround && !this.ballWasGrounded && this.ballLastVy > 1;
        let targetScaleX = 1;
        let targetScaleY = 1;
        let recovery = 0.2;

        if (landedThisFrame) {
            const impact = Math.min(1, this.ballLastVy / Math.max(1, this.jumpStrength));
            this.ballVisualScaleX = 1.14 + impact * 0.16;
            this.ballVisualScaleY = 0.82 - impact * 0.12;
            recovery = 0.16;
        } else if (!this.onGround && this.vy < -1.2) {
            const lift = Math.min(1, Math.abs(this.vy) / Math.max(1, this.jumpStrength));
            targetScaleX = 1 - lift * 0.16;
            targetScaleY = 1 + lift * 0.26;
            recovery = 0.28;
        } else if (!this.onGround && this.vy > 2) {
            const fall = Math.min(1, this.vy / Math.max(1, this.jumpStrength));
            targetScaleX = 1 - fall * 0.07;
            targetScaleY = 1 + fall * 0.11;
        }

        this.ballVisualScaleX += (targetScaleX - this.ballVisualScaleX) * recovery;
        this.ballVisualScaleY += (targetScaleY - this.ballVisualScaleY) * recovery;
        visual.scaleX = this.ballVisualScaleX;
        visual.scaleY = this.ballVisualScaleY;

        if (this.ballAura) {
            const auraScale = 1.08 + pulse * 0.16;
            this.ballAura.scaleX = auraScale;
            this.ballAura.scaleY = auraScale;
            this.ballAura.alpha = 0.2
                + this.ballEnergyEvolutionStrength * 0.08
                + pulse * (0.15 + this.ballEnergyEvolutionStrength * 0.04);
        }
        if (this.ballCore) {
            const coreScale = 0.9 + pulse * 0.18;
            this.ballCore.scaleX = coreScale;
            this.ballCore.scaleY = coreScale;
            this.ballCore.alpha = 0.84
                + this.ballEnergyEvolutionStrength * 0.04
                + pulse * (0.16 - this.ballEnergyEvolutionStrength * 0.04);
        }

        this.updateBallTrail(ball);
        this.ballWasGrounded = this.onGround;
        this.ballLastVy = this.vy;
    }

    private updateBallTrail(ball: any): void {
        if (this.ballTrailNodes.length === 0) return;

        const x = Number(ball.x) || 0;
        const y = Number(ball.y) || 0;
        const teleportDistance = Math.abs(x - this.ballTrailLastX) + Math.abs(y - this.ballTrailLastY);
        if (teleportDistance > 90) {
            this.ballTrailHistory = [];
        }
        this.ballTrailLastX = x;
        this.ballTrailLastY = y;

        this.ballTrailHistory.unshift({
            x,
            y,
            scaleX: this.ballVisualScaleX,
            scaleY: this.ballVisualScaleY,
        });
        const maxHistory = this.ballTrailNodes.length * 2 + 1;
        if (this.ballTrailHistory.length > maxHistory) {
            this.ballTrailHistory.length = maxHistory;
        }

        const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
        const motionAlpha = Math.max(0, Math.min(1, (speed - 0.35) / 6));
        for (let i = 0; i < this.ballTrailNodes.length; i++) {
            const trail = this.ballTrailNodes[i];
            const sample = this.ballTrailHistory[Math.min(this.ballTrailHistory.length - 1, (i + 1) * 2)];
            if (!sample || motionAlpha <= 0) {
                trail.alpha = 0;
                continue;
            }
            trail.x = sample.x;
            trail.y = sample.y;
            trail.scaleX = sample.scaleX * (1 - i * 0.045);
            trail.scaleY = sample.scaleY * (1 - i * 0.045);
            trail.alpha = motionAlpha
                * (0.24 + this.ballEnergyEvolutionStrength * 0.04)
                * Math.pow(0.55, i);
        }
    }

    private initializeBoundaryVisuals(): void {
        this.boundaryVisuals = [];
        const walls = [this.topWall, this.leftWall, this.rightWall];
        for (let index = 0; index < walls.length; index++) {
            const wall = walls[index];
            if (!wall || typeof wall.addChild !== "function") continue;

            let root = typeof wall.getChildByName === "function"
                ? wall.getChildByName("WPD_CyberBoundary")
                : null;
            if (!root) {
                root = new Laya.Sprite();
                root.name = "WPD_CyberBoundary";
                root.mouseEnabled = false;
                wall.addChild(root);
            }
            let scan = typeof root.getChildByName === "function"
                ? root.getChildByName("WPD_BoundaryScan")
                : null;
            if (!scan) {
                scan = new Laya.Sprite();
                scan.name = "WPD_BoundaryScan";
                scan.mouseEnabled = false;
                root.addChild(scan);
            }

            const length = Math.max(1, Number(wall.width) || 1);
            const thickness = Math.max(4, Number(wall.height) || 4);
            root.x = 0;
            root.y = 0;
            root.width = length;
            root.height = thickness;
            root.zOrder = 2;
            root.graphics.clear();
            root.graphics.drawRect(0, 0, length, thickness, "#071521", "#35E9FF", 1.2);
            root.graphics.drawLine(0, 2, length, 2, "#9C70FF", 1);
            root.graphics.drawLine(0, thickness - 2, length, thickness - 2, "#45F6FF", 1.4);
            for (let x = 18; x < length; x += 58) {
                const segmentEnd = Math.min(length, x + 24);
                root.graphics.drawLine(x, thickness * 0.5, segmentEnd, thickness * 0.5, "#1A708A", 1);
                root.graphics.drawCircle(x - 5, thickness * 0.5, 1.25, index === 0 ? "#72F8FF" : "#B887FF");
            }

            scan.y = 4;
            scan.zOrder = 1;
            scan.graphics.clear();
            scan.graphics.drawRect(0, 0, 42, Math.max(2, thickness - 8), "#59F7FF");
            scan.alpha = 0.18;
            this.boundaryVisuals.push({ root, scan, length, phaseOffset: index * 0.31 });
        }
    }

    private updateBoundaryVisuals(pulse: number): void {
        for (const visual of this.boundaryVisuals) {
            const travel = visual.length + 42;
            const progress = (this.visualPhase * 0.018 + visual.phaseOffset) % 1;
            visual.scan.x = progress * travel - 42;
            visual.scan.alpha = 0.08 + pulse * 0.13;
            visual.root.alpha = 0.9 + pulse * 0.08;
        }
    }

    private syncGroundVisual(): void {
        const ground = this.platforms.find((platform: any) => platform?.name === "Ground") ?? null;
        if (!ground || typeof ground.addChild !== "function") return;

        if (!this.groundVisual || this.groundVisual.parent !== ground) {
            this.groundVisual = typeof ground.getChildByName === "function"
                ? ground.getChildByName("WPA_GroundVisual")
                : null;
            if (!this.groundVisual) {
                this.groundVisual = new Laya.Sprite();
                this.groundVisual.name = "WPA_GroundVisual";
                this.groundVisual.mouseEnabled = false;
                ground.addChild(this.groundVisual);
            }
        }

        if (!this.groundEnergy || this.groundEnergy.parent !== this.groundVisual) {
            this.groundEnergy = typeof this.groundVisual.getChildByName === "function"
                ? this.groundVisual.getChildByName("WPA_GroundEnergy")
                : null;
            if (!this.groundEnergy) {
                this.groundEnergy = new Laya.Sprite();
                this.groundEnergy.name = "WPA_GroundEnergy";
                this.groundEnergy.mouseEnabled = false;
                this.groundVisual.addChild(this.groundEnergy);
            }
        }

        const width = Math.max(1, ground.width || Laya.stage.width || 1);
        const height = Math.max(8, ground.height || 20);
        const graphics = this.groundVisual.graphics;
        const energyGraphics = this.groundEnergy.graphics;
        if (!graphics || !energyGraphics) return;

        this.groundVisual.x = 0;
        this.groundVisual.y = 0;
        this.groundVisual.width = width;
        this.groundVisual.height = height;
        this.groundVisual.zOrder = 2;
        this.groundEnergy.width = width;
        this.groundEnergy.height = height;
        this.groundEnergy.x = 0;
        this.groundEnergy.y = 0;
        this.groundEnergy.visible = true;

        graphics.clear();
        energyGraphics.clear();
        if (this.deathEnabled) {
            if (typeof graphics.drawRect === "function") {
                graphics.drawRect(0, 0, width, height, "#3A092C", "#FF2E8A", 2);
            }
            if (typeof graphics.drawLine === "function") {
                const gridStep = Math.max(24, Math.round(width / 14));
                for (let x = 0; x <= width; x += gridStep) {
                    graphics.drawLine(x, 0, x, height, "#8D174F", 1);
                }
                for (let y = 5; y < height; y += 7) {
                    graphics.drawLine(0, y, width, y, "#641044", 1);
                }
            }
            if (typeof graphics.drawPoly === "function") {
                const toothWidth = Math.max(12, Math.round(width / 32));
                for (let x = 0; x < width; x += toothWidth) {
                    graphics.drawPoly(x, 0, [0, height, toothWidth * 0.5, 1, toothWidth, height], "#D41468", "#FF73BE", 1);
                }
            }
            if (typeof energyGraphics.drawLine === "function") {
                for (let i = 0; i < 12; i++) {
                    const x = (i * 83 + 19) % width;
                    const y = 2 + ((i * 11) % Math.max(3, height - 4));
                    energyGraphics.drawLine(x, y, Math.min(width, x + 9), Math.max(0, y - 4), i % 2 ? "#FF4DA6" : "#B95CFF", 2);
                }
            }
        } else {
            if (typeof graphics.drawRect === "function") {
                graphics.drawRect(0, 0, width, height, "#0C2836", "#2D6572", 1);
            }
            if (typeof graphics.drawPoly === "function") {
                const panelWidth = 112;
                const panelBottom = Math.max(8, height - 4);
                for (let x = 0, panelIndex = 0; x < width; x += panelWidth, panelIndex++) {
                    const panelX = x + 3;
                    const availableWidth = Math.max(0, Math.min(panelWidth - 6, width - panelX));
                    if (availableWidth < 12) continue;
                    graphics.drawPoly(
                        panelX,
                        0,
                        [0, 5, 7, 2, availableWidth - 8, 2, availableWidth, 6,
                            availableWidth - 5, panelBottom, 5, panelBottom],
                        panelIndex % 2 === 0 ? "#123B49" : "#0F3442",
                        "#28606D",
                        0.7
                    );
                }
            }
            if (typeof graphics.drawLine === "function") {
                // 比背景亮、但弱于平台主高光的 floor surface edge。
                graphics.drawLine(0, 1, width, 1, "#73C9D6", 1.5);
                graphics.drawLine(0, 3, width, 3, "#285C69", 1);
                graphics.drawLine(0, height - 2, width, height - 2, "#20505D", 1);
                for (let x = 0; x < width; x += 112) {
                    graphics.drawLine(x, 3, x, height - 3, "#397684", 1);
                    graphics.drawLine(
                        x + 18,
                        Math.max(7, height - 7),
                        Math.min(width, x + 42),
                        6,
                        "#397583",
                        1
                    );
                }
                for (let x = 22; x < width; x += 168) {
                    graphics.drawLine(x, 8, Math.min(width, x + 28), 8, "#4E98A5", 1);
                    graphics.drawLine(x + 38, height - 7, Math.min(width, x + 54), height - 7, "#34717F", 1);
                }
                for (let x = 72; x < width; x += 224) {
                    graphics.drawLine(x, 4, Math.min(width, x + 10), 4, "#82DAE3", 1);
                }
            }
            // 复用 Ground 自身能量层：少量固定节点 + 低亮漂移，不引入第二粒子系统或 RNG。
            if (typeof energyGraphics.drawCircle === "function") {
                const moteCount = Math.max(7, Math.min(11, Math.round(width / 128)));
                for (let i = 0; i < moteCount; i++) {
                    const x = (i * 127 + 43) % width;
                    const y = 5 + ((i * 9) % Math.max(3, height - 10));
                    const outer = i % 3 === 0 ? 2 : 1.4;
                    energyGraphics.drawCircle(x, y, outer, i % 2 === 0 ? "#238CA3" : "#316FB5");
                    energyGraphics.drawCircle(x, y, 0.75, i % 2 === 0 ? "#B6FAFF" : "#B7D5FF");
                }
            }
            if (typeof energyGraphics.drawLine === "function") {
                for (let x = 46; x < width; x += 224) {
                    energyGraphics.drawLine(x - 5, 5, x + 7, 5, "#69D7E5", 1);
                    energyGraphics.drawLine(x + 18, height - 8, x + 28, height - 8, "#5A8FDF", 0.8);
                }
            }
        }
    }

    private paintSpikeVisual(spike: any): void {
        const graphics = spike?.graphics;
        if (!graphics) return;

        const width = Math.max(1, spike.width || 1);
        const height = Math.max(1, spike.height || 1);
        graphics.clear();
        if (typeof graphics.drawRect === "function") {
            graphics.drawRect(0, 0, width, height, "#3E092E", "#FF2E8A", 2);
        }
        if (typeof graphics.drawPoly === "function") {
            const toothCount = Math.max(3, Math.floor(width / 14));
            const toothWidth = width / toothCount;
            for (let i = 0; i < toothCount; i++) {
                const x = i * toothWidth;
                graphics.drawPoly(x, 0, [0, height, toothWidth * 0.5, 0, toothWidth, height], i % 2 ? "#7C2CFF" : "#FF267E", "#FF9BD1", 1);
            }
        }
        if (typeof graphics.drawLine === "function") {
            graphics.drawLine(0, height - 1, width, height - 1, "#FF4DA6", 2);
            graphics.drawLine(0, 1, width, 1, "#FFF0FA", 1);
        }

        this.ensureSpikeEnergy(spike);
    }

    private ensureSpikeEnergy(spike: any): void {
        if (!spike || typeof spike.addChild !== "function") return;

        let energy = typeof spike.getChildByName === "function"
            ? spike.getChildByName("WPA_HazardEnergy")
            : null;
        if (!energy) {
            const children: any[] = spike?._children ?? spike?._childs ?? [];
            energy = children.find((child: any) => child?.name === "WPA_HazardEnergy") ?? null;
        }
        if (!energy) {
            energy = new Laya.Sprite();
            energy.name = "WPA_HazardEnergy";
            energy.mouseEnabled = false;
            spike.addChild(energy);
        }

        const width = Math.max(1, spike.width || 1);
        const height = Math.max(1, spike.height || 1);
        energy.width = width;
        energy.height = height;
        energy.graphics.clear();
        if (typeof energy.graphics.drawLine === "function") {
            for (let i = 0; i < 6; i++) {
                const x = (i + 0.5) * width / 6;
                energy.graphics.drawLine(x - 4, height * 0.75, x + 4, height * 0.25, i % 2 ? "#44F6FF" : "#FFB4E1", 1);
            }
        }
    }

    private updateVisualEffects(): void {
        this.visualPhase += 0.055;
        const pulse = (Math.sin(this.visualPhase) + 1) * 0.5;
        const landingImpactNow = this.getPlatformLandingImpactNow();
        this.updatePlatformLandingImpactTrigger(landingImpactNow);

        let platformVisualIndex = 0;
        for (const platform of this.platforms) {
            if (typeof platform?.name !== "string" || platform.name.indexOf("Platform_") !== 0) continue;
            const hoverY = this.getPlatformVisualHover(platformVisualIndex);
            const impactOffsetY = this.getPlatformLandingImpactOffset(platform, landingImpactNow);
            const holoSide = typeof platform.getChildByName === "function"
                ? platform.getChildByName("WPA_HoloSide")
                : null;
            if (holoSide) {
                holoSide.y = hoverY + impactOffsetY;
                const disappear = this.disappearConfigs.get(platform);
                holoSide.alpha = this.movingConfigs.has(platform) || disappear?.state === "counting"
                    ? 0.58 + pulse * 0.34
                    : 0.78;
            }
            this.updatePlatformThrusters(platform, platformVisualIndex, impactOffsetY);
            platformVisualIndex++;
        }

        if (this.groundVisual) {
            this.groundVisual.alpha = this.deathEnabled ? 0.78 + pulse * 0.2 : 0.98 + pulse * 0.02;
        }
        if (this.groundEnergy) {
            if (this.deathEnabled) {
                this.groundEnergy.alpha = 0.35 + pulse * 0.65;
                this.groundEnergy.x = 0;
                this.groundEnergy.y = Math.round(Math.sin(this.visualPhase * 1.7) * 2);
            } else {
                this.groundEnergy.alpha = 0.34 + pulse * 0.2;
                this.groundEnergy.x = Math.round(Math.sin(this.visualPhase * 0.43) * 3);
                this.groundEnergy.y = Math.round(Math.sin(this.visualPhase * 0.71));
            }
        }
        for (const spike of this.spikes) {
            const energy = typeof spike?.getChildByName === "function"
                ? spike.getChildByName("WPA_HazardEnergy")
                : null;
            if (energy) {
                energy.alpha = 0.35 + pulse * 0.65;
            }
        }
        this.updateBallVisualEffects(pulse);
        this.updateBoundaryVisuals(pulse);
        this.updateDeathFeedback();
        this.updateDeathReconstruction();
    }

    onDestroy(): void {
        this.clearDeathReconstruction();
        this.clearDeathFeedback();
        this.clearDisappearRecoveryStates();
        this.resetPlatformLandingImpacts();
        if (this.visualLoopStarted && typeof Laya.timer?.clear === "function") {
            Laya.timer.clear(this, this.updateVisualEffects);
        }
        this.visualLoopStarted = false;
        this.levelTransitionHandler = null;
        this.levelTransitionPending = false;
        this.groundVisual = null;
        this.groundEnergy = null;
        for (const trail of this.ballTrailNodes) {
            this.destroyVisualNode(trail);
        }
        this.ballTrailNodes = [];
        this.ballTrailHistory = [];
        this.ballVisualRoot = null;
        this.ballAura = null;
        this.ballShell = null;
        this.ballCore = null;
        this.ballCircuits = null;
        this.ballEnergyTransitionActive = false;
        this.ballEnergyRenderedLevel = 0;
        this.ballEnergyRenderedProgress = -1;
        this.boundaryVisuals = [];
    }
}

type DeathReticleTemplateId = 'TEMPLATE_A' | 'TEMPLATE_B' | 'TEMPLATE_C' | 'TEMPLATE_D' | 'TEMPLATE_E' | 'TEMPLATE_F' | 'TEMPLATE_G' | 'TEMPLATE_H' | 'TEMPLATE_I' | 'TEMPLATE_J';
type DeathReticleAnimation = 'CORNER_LOCK' | 'SIDE_DEPLOY' | 'DUAL_ALIGN' | 'SEQUENTIAL_LIGHT' | 'VERTICAL_CONVERGE' | 'FRAGMENT_LOCK';
type DeathReticleTone = 'PRIMARY' | 'ENERGY' | 'SOFT' | 'DARK';

interface DeathReticlePartTemplate {
    x: number;
    y: number;
    length: number;
    thickness: number;
    rotation: number;
    tone: DeathReticleTone;
}

interface DeathReticleTemplate {
    id: DeathReticleTemplateId;
    animation: DeathReticleAnimation;
    parts: DeathReticlePartTemplate[];
}

interface DeathReticlePartVisual {
    node: any;
    template: DeathReticlePartTemplate;
}
