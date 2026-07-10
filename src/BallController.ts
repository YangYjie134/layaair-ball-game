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

        // ── 步骤 0：胜利后按 R 重开本局（最先检测，命中则跳过本帧后续逻辑）──
        const restart = this.isKeyDown(Laya.Keyboard.R);// 检测重开按键 R 是否按下
        if (restart && !this.prevRestartKey && ScoreManager.instance.isWon()) {// 按下 R 且之前未按下，且游戏已胜利
            this.prevRestartKey = restart;// 记录本帧的重开按键状态，用于下帧判断是否按键刚按下
            this.restartGame();// 调用 restartGame() 方法，重开本局并切换到下一关的随机平台布局
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
        const left = this.isKeyDown(Laya.Keyboard.LEFT, Laya.Keyboard.A);
        // 检测右移按键（RIGHT或D）
        const right = this.isKeyDown(Laya.Keyboard.RIGHT, Laya.Keyboard.D);
        // 检测跳跃按键（W 或 up）
        const jump =
            this.isKeyDown(Laya.Keyboard.W)||
            this.isKeyDown(Laya.Keyboard.UP);

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
        if (jump && !this.prevJumpKey && this.onGround && !ScoreManager.instance.isWon()) {
            // 从 Ground 主动起跳后，Platform_* 才开始参与碰撞。
            // 此处 groundPlatform 反映的是上一帧落地结果（重置发生在跳跃判断之后）
            if (!this.platformsActive && this.groundPlatform?.name === "Ground") {// Ground 起跳后激活 Platform_* 碰撞
                this.platformsActive = true;// 激活平台碰撞，使 Platform_* 开始参与碰撞判定
                console.log("Platforms active");
            }
            // 设置向上的初始速度
            this.vy = -this.jumpStrength;
            SfxManager.playJump();
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
        const nowMs = Laya.timer.currTimer;
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
            this.updateMovingPlatform(platform);// 新增：先更新移动平台位置
            this.resolveVerticalCollision(platform);// 检测球是否与平台发生垂直碰撞，并处理落地逻辑
        }
        this.syncDisappearHighlightBar();
        // 平台是单向平台：只处理从上往下落到平台顶面，不处理平台侧面和底面。
        // 应用水平速度移动
        this.centerX += this.vx;
        // 尖刺检测放在 X 位移之后，读取本帧最终球心 X（消除 ~5px 半帧滞后）；
        // 仍在 clampToCanvas 之前，保持“尖刺死亡优先于掉落死亡”的同帧判定顺序。
        this.checkHazards();
        this.releaseGroundIfUnsupported();// 检查球是否离开平台边缘，如果离开则取消落地状态，让球自然下落。

        // 最后处理顶墙、左右墙和掉出屏幕保护，再把结果写回节点一次。
        // 检测边界碰撞
        this.clampToCanvas();// 检查球是否撞到墙体边界，并处理反弹和位置限制，同时检测是否掉出屏幕底部并触发复活逻辑
        // 将球的位置同步回Laya节点
        this.syncBallSprite(ball);// 将计算后的球心坐标写回 Laya 节点，更新球的实际显示位置
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
    private resolveVerticalCollision(platform: any): void {
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
                // 按 Set 去重逻辑正常加分
                ScoreManager.instance.addPlatformScore(platform);
                // 消失平台:首次踩上时开始计时(幂等,仅 idle -> counting)
                const dc = this.disappearConfigs.get(platform);
                if (dc && dc.state === 'idle') {
                    dc.state = 'counting';
                    dc.triggerAt = Laya.timer.currTimer;
                }
            }
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
        if (!bar) return;

        const entry = this.disappearConfigs.entries().next();
        if (entry.done) {
            bar.visible = false;
            return;
        }

        const [target, cfg] = entry.value as [any, DisappearConfig];
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
        if (!graphics || !Array.isArray(cmds) || !Laya.DrawRectCmd) return;

        const drawRectCmd = cmds.find((cmd: any) => cmd instanceof Laya.DrawRectCmd);
        if (!drawRectCmd) return;

        drawRectCmd.fillColor = color;
        if (typeof graphics.repaint === "function") {
            graphics.repaint();
        }
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

        try {
            this.randomizePlatforms();
            this.randomizeHazards();
            this.respawn();
        } finally {
            this.isHandlingDeath = false;
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

        // 重置分数管理器
        ScoreManager.instance.reset();

        // 同关死亡重来:消失平台全部复原
        for (const [p, cfg] of this.disappearConfigs) {
            cfg.state = 'idle';
            cfg.triggerAt = 0;
            p.visible = true;
            this.repaintPlatformColor(p, "#00cc00");
        }
    }

    // 胜利后进入下一关：复用 respawn() 的全部重置，再重新随机平台布局
    // 胜利后按 R 重开本局，并切换到下一关的随机平台布局
    private restartGame(): void {
        console.log("Restart game");

        this.currentLevel++;
        if (this.currentLevel > this.maxLevel) {
            this.currentLevel = 1;
        }

        this.respawn();
        this.randomizePlatforms();
        this.randomizeHazards();
        this.updateLevelText();
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
            this.spikes.push(existingSpike);
            return;
        }

        const spike = new Laya.Sprite();
        spike.name = "Spike_1";
        spike.visible = false;
        spike.width = 80;
        spike.height = 8;
        spike.zOrder = ((platform as any).zOrder || 0) + 1;
        spike.graphics.clear();
        spike.graphics.drawRect(0, 0, spike.width, spike.height, "#ff0000");

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

        const placement = candidates[Math.floor(Math.random() * candidates.length)];
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
        spike.graphics.clear();
        spike.graphics.drawRect(0, 0, spike.width, spike.height, "#ff0000");
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
        if (!this.disappearConfigs.has(targetPlatform)) return true;

        const requiredX = this.getWorstCaseRequiredX(sourcePlatform, targetPlatform, hostPlatform, spikeSide, spikeWidth);
        if (requiredX === null) return false;

        const reach = this.estimateJumpReachBySimulation(sourcePlatform.y || 0, targetPlatform.y || 0);
        const safetyFrameMargin = 2;
        const horizontalSafetyMargin = this.maxSpeedX * safetyFrameMargin;

        return requiredX <= reach - horizontalSafetyMargin;
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
            movingIndices.add(Math.floor(Math.random() * count));
        }
        let movingIndex = 0;

        for (let i = 0; i < count; i++) {
            const platform = sorted[i];
            const platformWidth = platform.width || 200;
            const halfWidth = platformWidth / 2;

            // ── Y：基础高度向上分层 + 抖动 ──
            const layerBaseY = baseY - i * layerStep;
            const jitter = (Math.random() * 2 - 1) * yJitter;
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
                centerX = lo + Math.random() * (hi - lo);
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
        this.disappearConfigs.clear();
        if (this.currentLevel !== 3 && this.currentLevel !== 4) return;

        const candidates = sorted.slice(0, -1);
        if (candidates.length === 0) return; // 无平台,放弃注册

        const target = candidates[Math.floor(Math.random() * candidates.length)];
        this.disappearConfigs.set(target, { state: 'idle', triggerAt: 0 });
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
            const [lo, hi] = ranges[Math.floor(Math.random() * ranges.length)];
            return lo + Math.random() * (hi - lo);
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
}
