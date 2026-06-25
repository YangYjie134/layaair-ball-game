// 声明Laya全局对象
declare const Laya: any;
// 解构Laya的regClass方法用于注册组件
const { regClass } = Laya;
// 导入分数管理器
import { ScoreManager } from "./ScoreManager";
// 使用regClass装饰器注册该脚本类
@regClass()
// 导出BallController类，继承Laya.Script以获得生命周期支持
export default class BallController extends Laya.Script {

    // 这个脚本现在走"自定义平台物理"路线：
    // 球的位置、速度、落地、墙体限制都由这里计算，Box2D 碰撞在运行时会被关闭。
    // 这样做的目的，是绕开 Box2D 在平台顶角处反复接触/分离导致的卡顿。

    // ── 1. 运动参数 ──
    // 水平速度（向右为正）
    private vx: number = 0;
    // 竖直速度（向下为正）
    private vy: number = 0;
    private moveAccel: number = 0.7;     // 水平加速度，越大左右启动越快。
    private maxSpeedX: number = 5;       // 水平最大速度，限制球不要越跑越快。
    private friction: number = 0.95;     // 松开方向键后的减速系数，越接近 1 滑行越久。
    private gravity: number = 0.5;       // 每帧给 vy 增加的重力。
    private jumpStrength: number = 13;   // W 跳跃力度，数值越大跳得越高。
    private bounceY: number = 0.6;       // 碰到顶墙时的垂直反弹比例。
    private bounceX: number = 0.5;       // 撞左右墙时的水平反弹比例。
    private onGround: boolean = false;   // 当前帧是否站在地面/平台上。

    // ── 2. 碰撞计算状态 ──
    // 游戏是否已开始（第一次接触Platform_平台时启动）
    private gameStarted: boolean = false;
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

    // ── 3. 输入控制相关变量 ──
    // 上一帧是否按下了跳跃键（用于检测按键刚按下）
    private prevJumpKey: boolean = false;

    private platforms: any[] = [];       // Platform_ 开头的节点和 Ground 都会放进这里。

    // 游戏初始化，在脚本被激活时调用一次
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
    }

    // 每帧更新，处理输入、物理、碰撞等逻辑
    onUpdate(): void {
        // 获取球的节点
        const ball = this.owner as any;
        if (!ball) return;

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
        // 检测跳跃按键（W）
        const jump = this.isKeyDown(Laya.Keyboard.W);

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
        // 检测跳跃（按下W、之前未按下、且在地面上）
        if (jump && !this.prevJumpKey && this.onGround) {
            // 设置向上的初始速度
            this.vy = -this.jumpStrength;
            // 标记不在地面
            this.onGround = false;
            // 清除平台参考
            this.groundPlatform = null;
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
        // 检测垂直方向的碰撞
        for (const platform of this.platforms) {
            this.resolveVerticalCollision(platform);
        }

        // 平台是单向平台：只处理从上往下落到平台顶面，不处理平台侧面和底面。
        // 应用水平速度移动
        this.centerX += this.vx;
        this.releaseGroundIfUnsupported();

        // 最后处理顶墙、左右墙和掉出屏幕保护，再把结果写回节点一次。
        // 检测边界碰撞
        this.clampToCanvas();
        // 将球的位置同步回Laya节点
        this.syncBallSprite(ball);
    }

    /**
     * 单向平台的核心判定：
     * 只有"球正在下落，并且球底部从平台上方穿过平台顶面"时，才把球放到平台上。
     * 这样平台侧面和底面不会产生碰撞，也就避开了顶角卡顿。
     */
    private resolveVerticalCollision(platform: any): void {
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
        const crossedTop = previousBottom <= platformTop + 0.5 && currentBottom >= platformTop - 0.5;

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
                if (this.gameStarted) {
                    this.respawn();
                }
                return;
            }

            // 如果是Platform_开头的平台
            if (typeof platformName === "string" && platformName.indexOf("Platform_") === 0) {
                // 只有第一次落到 Platform_1 顶部才正式开始游戏
                if (!this.gameStarted) {
                    if (platformName === "Platform_1") {
                        this.gameStarted = true;
                        console.log("Game started");
                        // Platform_1 计第一分
                        ScoreManager.instance.addPlatformScore(platform);
                    }
                    // 游戏未开始时踩到 Platform_2~5：不加分、不开始（物理落地照常）
                    return;
                }

                // 游戏已开始：所有平台按 Set 去重逻辑正常加分
                ScoreManager.instance.addPlatformScore(platform);
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

    // 检查球是否掉出屏幕
    private checkDeath(): void {
        // 如果球Y位置超出屏幕下方100像素，则重新生成
        if (this.centerY > Laya.stage.height + 100) {
            this.respawn();
        }
    }

    // 重新生成球的位置和状态
    private respawn(): void {
        console.log("Ball died, respawn");

        // 恢复到出生点位置
        this.centerX = this.startX;
        this.centerY = this.startY;

        // 重置速度
        this.vx = 0;
        this.vy = 0;

        // 重置运动状态
        this.onGround = false;
        this.groundPlatform = null;
        // 重置游戏状态
        this.gameStarted = false;

        // 重置分数管理器
        ScoreManager.instance.reset();
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
     * 边缘释放：
     * 球站在平台上时，如果水平移动到平台有效范围外，就不再算作落地。
     * 这样球能自然从平台边缘掉下去，而不是被硬卡在边缘。
     */
    // 检查球是否离开平台
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

        // 场景加载后随机一次平台位置
        this.randomizePlatforms();
    }

    // 对 Platform_* 节点做分层随机布局，只改 x / y，不改其他属性
    private randomizePlatforms(): void {
        // 只取 Platform_* 节点，按名字排序保证分层顺序稳定
        const sorted = this.platforms
            .filter((p: any) => typeof p.name === "string" && p.name.indexOf("Platform_") === 0)
            .sort((a: any, b: any) => (a.name as string).localeCompare(b.name));

        const count = sorted.length;
        if (count === 0) return;

        // 可玩区域 X 范围：左右墙内侧（与 getWallInnerBound 保持一致）
        const xMin = 30;
        const xMax = 1304;

        // Y 轴：固定基础高度 + 小幅抖动。Platform_1 最低(Y≈620)，每层向上抬约 120。
        const baseY = 620;       // Platform_1 基础高度
        const layerStep = 120;   // 每层向上抬升
        const yJitter = 20;      // ±20 抖动

        // X 轴：相邻平台中心水平距离尽量不超过 300
        const maxNeighborDX = 300;

        // 记录上一块平台的中心 X，用于约束相邻距离
        let prevCenterX = this.startX;

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
        }
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
