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

    // ── 4. 关卡状态：记录当前关卡编号与界面显示内容 ──
    private currentLevel: number = 1;
    private readonly maxLevel: number = 4;
    private levelText: any = null;
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
        this.createLevelText();
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
        }
        env.syncDisappearHighlightBar();
        // 平台是单向平台：只处理从上往下落到平台顶面，不处理平台侧面和底面。
        // 应用水平速度移动
        this.centerX += this.vx;
        // 尖刺检测放在 X 位移之后，读取本帧最终球心 X（消除 ~5px 半帧滞后）；
        // 仍在 clampToCanvas 之前，保持“尖刺死亡优先于掉落死亡”的同帧判定顺序。
        env.checkHazards();
        env.releaseGroundIfUnsupported();// 检查球是否离开平台边缘，如果离开则取消落地状态，让球自然下落。

        // 最后处理顶墙、左右墙和掉出屏幕保护，再把结果写回节点一次。
        // 检测边界碰撞
        env.clampToCanvas();// 检查球是否撞到墙体边界，并处理反弹和位置限制，同时检测是否掉出屏幕底部并触发复活逻辑
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
    private ballCore: any = null;
    private ballVisualScaleX: number = 1;
    private ballVisualScaleY: number = 1;
    private ballVisualStateReady: boolean = false;
    private ballWasGrounded: boolean = false;
    private ballLastVy: number = 0;
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
    private deathParticleLayer: any = null;
    private deathParticleStartedAt: number = 0;
    private deathParticleOriginX: number = 0;
    private deathParticleOriginY: number = 0;
    private deathParticles: Array<{ node: any; vx: number; vy: number; spin: number }> = [];

    public setLevelTransitionHandler(handler: ((level: number, resume: () => void) => void) | null): void {
        this.levelTransitionHandler = handler;
    }

    private beginLevelTransition(): void {
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

    // 死亡代表当前随机挑战失败：先换同关布局，再复活到出生点。
    private handleDeath(): void {
        if (this.isHandlingDeath) return;
        if (ScoreManager.instance.isWon()) return;

        this.isHandlingDeath = true;
        SfxManager.playDeath();
        this.startDeathFeedback();
        this.triggerDeathHaptics();

        try {
            this.randomizePlatforms();
            this.randomizeHazards();
            this.respawn();
        } finally {
            this.isHandlingDeath = false;
        }
    }

    private startDeathFeedback(): void {
        this.clearDeathFeedback();
        const deathPoint = this.getVisualStagePoint(this.owner as any, 0, 0);
        this.startScreenShake();
        this.showDeathFlash();
        this.spawnDeathParticles(deathPoint.x, deathPoint.y);
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

    private spawnDeathParticles(stageX: number, stageY: number): void {
        this.removeDeathParticles();
        if (!Laya.stage) return;

        const layer = new Laya.Sprite();
        layer.name = "WPB_DeathParticles";
        layer.zOrder = 9991;
        layer.mouseEnabled = false;
        layer.mouseThrough = true;
        Laya.stage.addChild(layer);

        this.deathParticleLayer = layer;
        this.deathParticleStartedAt = this.getWpBNow();
        this.deathParticleOriginX = stageX;
        this.deathParticleOriginY = stageY;
        this.deathParticles = [];

        const particleCount = 14;
        const colors = ["#42F5FF", "#9B6CFF", "#FF3B7C", "#D65CFF"];
        for (let i = 0; i < particleCount; i++) {
            const particle = new Laya.Sprite();
            particle.name = "WPB_DeathFragment_" + i;
            particle.mouseEnabled = false;
            const size = 2 + (i % 3);
            const color = colors[i % colors.length];
            if (typeof particle.graphics?.drawPoly === "function") {
                particle.graphics.drawPoly(-size, -size, [0, 0, size * 2, size * 0.4, size * 1.4, size * 2, size * 0.2, size * 1.5], color);
            } else if (typeof particle.graphics?.drawRect === "function") {
                particle.graphics.drawRect(-size * 0.5, -size * 0.5, size, size, color);
            }
            particle.x = stageX;
            particle.y = stageY;
            layer.addChild(particle);

            const angle = i * Math.PI * 2 / particleCount + (i % 3) * 0.19;
            const speed = 72 + (i % 5) * 18;
            this.deathParticles.push({
                node: particle,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 28,
                spin: i % 2 === 0 ? 210 + i * 9 : -210 - i * 7,
            });
        }
    }

    private updateDeathParticles(now: number): void {
        if (!this.deathParticleLayer) return;

        const elapsedMs = Math.max(0, now - this.deathParticleStartedAt);
        if (elapsedMs >= 420) {
            this.removeDeathParticles();
            return;
        }

        const elapsed = elapsedMs / 1000;
        const life = 1 - elapsedMs / 420;
        for (const particle of this.deathParticles) {
            particle.node.x = this.deathParticleOriginX + particle.vx * elapsed;
            particle.node.y = this.deathParticleOriginY + particle.vy * elapsed + 120 * elapsed * elapsed;
            particle.node.rotation = particle.spin * elapsed;
            particle.node.alpha = life;
        }
    }

    private removeDeathParticles(): void {
        if (this.deathParticleLayer) {
            this.destroyVisualNode(this.deathParticleLayer);
        }
        this.deathParticleLayer = null;
        this.deathParticleStartedAt = 0;
        this.deathParticles = [];
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
        this.updateDeathParticles(now);
    }

    private clearDeathFeedback(): void {
        this.stopScreenShake();
        this.removeDeathFlash();
        this.removeDeathParticles();
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

        // 重置速度
        this.vx = 0;
        this.vy = 0;

        // 重置运动状态
        this.onGround = false;
        this.groundPlatform = null;
        // 重置游戏状态
        this.platformsActive = false;
        this.deathEnabled = false;
        this.syncGroundVisual();

        // 重置分数管理器
        ScoreManager.instance.reset();

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
        this.clearDeathFeedback();

        this.currentLevel++;
        if (this.currentLevel > this.maxLevel) {
            this.currentLevel = 1;
        }

        this.respawn();
        this.randomizePlatforms();
        this.randomizeHazards();
        this.updateLevelText();
        this.beginLevelTransition();
    }

    public advanceAfterWin(): void {
        if (!ScoreManager.instance.isWon()) {
            return;
        }

        this.restartGame();
    }

    // 创建关卡显示文本，用于在界面上展示当前关卡编号
    private createLevelText(): void {
        if (this.levelText) return;

        this.levelText = new Laya.Text();
        this.levelText.fontSize = 28;
        this.levelText.color = "#FFD700";
        this.levelText.bold = true;
        this.levelText.x = 40;
        this.levelText.y = 80;
        this.levelText.width = 300;
        this.levelText.height = 50;
        this.levelText.zOrder = 9999;

        Laya.stage.addChild(this.levelText);
        this.updateLevelText();
    }

    // 根据当前关卡状态刷新关卡显示文本
    private updateLevelText(): void {
        if (!this.levelText) return;
        this.levelText.text = "Level: " + this.currentLevel;
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

        // 记录上一块平台的中心 X，用于约束相邻距离
        let prevCenterX = this.startX;
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

            // 相邻平台中心距离约束在 ±maxNeighborDX 内
            let lo = Math.max(centerMin, prevCenterX - maxNeighborDX);
            let hi = Math.min(centerMax, prevCenterX + maxNeighborDX);

            let centerX: number;
            if (i === 0) {
                // Platform_1 特殊处理：避开出生点正下方，但留在可跳范围内
                centerX = this.pickPlatform1CenterX(centerMin, centerMax, halfWidth);
            } else {
                if (lo > hi) { lo = centerMin; hi = centerMax; } // 兜底，避免空区间
                centerX = lo + this.rng() * (hi - lo);
            }

            platform.x = Math.round(centerX - halfWidth);
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
    private pickPlatform1CenterX(centerMin: number, centerMax: number, halfWidth: number): number {
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

        // 正常情况：在左右候选区间里随机挑一段
        if (ranges.length > 0) {
            const [lo, hi] = ranges[Math.floor(this.rng() * ranges.length)];
            return lo + this.rng() * (hi - lo);
        }

        // 兜底：直接放到出生点右侧最小错开处（仍夹在墙内），保证不在正下方
        let fallback = this.startX + minOffset;
        if (fallback > centerMax) fallback = this.startX - minOffset;
        return Math.min(centerMax, Math.max(centerMin, fallback));
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
        holoSide.y = 0;
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
            platform.addChild(thruster);
        }

        const width = Math.max(1, platform.width || 1);
        thruster.width = 30;
        thruster.height = 46;
        thruster.x = isLeft ? 4 : Math.max(4, width - 34);
        thruster.y = Math.max(6, (platform.height || 10) * 0.55);
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

    private updatePlatformThrusters(platform: any, platformIndex: number): void {
        const left = typeof platform.getChildByName === "function"
            ? platform.getChildByName("WPB_LeftThruster")
            : null;
        const right = typeof platform.getChildByName === "function"
            ? platform.getChildByName("WPB_RightThruster")
            : null;
        if (!left || !right) return;

        const width = Math.max(1, platform.width || 1);
        const baseY = Math.max(6, (platform.height || 10) * 0.55);
        const hoverY = this.getPlatformVisualHover(platformIndex);
        const leftPulse = (Math.sin(this.visualPhase * 1.65 + platformIndex * 0.73) + 1) * 0.5;
        const rightPulse = (Math.sin(this.visualPhase * 1.65 + platformIndex * 0.73 + 1.35) + 1) * 0.5;

        left.x = 4;
        right.x = Math.max(4, width - 34);
        left.y = baseY + hoverY;
        right.y = baseY + hoverY;
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
        const shell = this.ensureCyberBallPart(this.ballVisualRoot, "WPD_BallShell");
        this.ballCore = this.ensureCyberBallPart(this.ballVisualRoot, "WPD_BallCore");
        const circuits = this.ensureCyberBallPart(this.ballVisualRoot, "WPD_BallCircuits");

        this.ballAura.zOrder = 0;
        shell.zOrder = 1;
        this.ballCore.zOrder = 2;
        circuits.zOrder = 3;

        this.ballAura.graphics.clear();
        this.ballAura.graphics.drawCircle(0, 0, 9.5, "#164D68");
        this.ballAura.graphics.drawCircle(0, 0, 7.3, "#258BC0");
        this.ballAura.alpha = 0.22;

        shell.graphics.clear();
        shell.graphics.drawCircle(0, 0, 5.4, "#071824", "#74FAFF", 1.2);
        shell.graphics.drawPoly(
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

        circuits.graphics.clear();
        circuits.graphics.drawLine(-4.2, -1.8, -2.3, -1.1, "#A96CFF", 0.8);
        circuits.graphics.drawLine(2.3, 1.1, 4.2, 1.8, "#A96CFF", 0.8);
        circuits.graphics.drawLine(-1.1, 3.4, 0, 5.1, "#53F8FF", 0.8);
        circuits.graphics.drawLine(1.1, -3.4, 0, -5.1, "#53F8FF", 0.8);
        circuits.graphics.drawCircle(-3.9, -1.7, 0.65, "#F7B5FF");
        circuits.graphics.drawCircle(3.9, 1.7, 0.65, "#F7B5FF");

        this.initializeBallTrail(parent, ball);
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

    private updateBallVisualEffects(pulse: number): void {
        const ball = this.owner as any;
        const visual = this.ballVisualRoot;
        if (!ball || !visual) return;

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
            const auraScale = 0.94 + pulse * 0.14;
            this.ballAura.scaleX = auraScale;
            this.ballAura.scaleY = auraScale;
            this.ballAura.alpha = 0.14 + pulse * 0.13;
        }
        if (this.ballCore) {
            const coreScale = 0.9 + pulse * 0.18;
            this.ballCore.scaleX = coreScale;
            this.ballCore.scaleY = coreScale;
            this.ballCore.alpha = 0.84 + pulse * 0.16;
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
            trail.alpha = motionAlpha * 0.24 * Math.pow(0.55, i);
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
        this.groundEnergy.visible = this.deathEnabled;

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
                graphics.drawRect(0, 0, width, height, "#102A40", "#35E9FF", 1);
            }
            if (typeof graphics.drawLine === "function") {
                graphics.drawLine(0, 1, width, 1, "#8FFBFF", 2);
                for (let x = 16; x < width; x += 48) {
                    graphics.drawLine(x, 5, Math.min(width, x + 22), 5, "#245D73", 1);
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

        let platformVisualIndex = 0;
        for (const platform of this.platforms) {
            if (typeof platform?.name !== "string" || platform.name.indexOf("Platform_") !== 0) continue;
            const holoSide = typeof platform.getChildByName === "function"
                ? platform.getChildByName("WPA_HoloSide")
                : null;
            if (holoSide) {
                holoSide.y = this.getPlatformVisualHover(platformVisualIndex);
                const disappear = this.disappearConfigs.get(platform);
                holoSide.alpha = this.movingConfigs.has(platform) || disappear?.state === "counting"
                    ? 0.58 + pulse * 0.34
                    : 0.78;
            }
            this.updatePlatformThrusters(platform, platformVisualIndex);
            platformVisualIndex++;
        }

        if (this.groundVisual) {
            this.groundVisual.alpha = this.deathEnabled ? 0.78 + pulse * 0.2 : 0.82;
        }
        if (this.groundEnergy) {
            this.groundEnergy.alpha = 0.35 + pulse * 0.65;
            this.groundEnergy.y = Math.round(Math.sin(this.visualPhase * 1.7) * 2);
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
    }

    onDestroy(): void {
        this.clearDeathFeedback();
        this.clearDisappearRecoveryStates();
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
        this.ballCore = null;
        this.boundaryVisuals = [];
    }
}
