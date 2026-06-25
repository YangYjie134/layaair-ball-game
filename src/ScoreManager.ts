declare var Laya: any;

// 分数管理器类：负责游戏分数的计算、显示和获胜判定
export class ScoreManager {
    // 单例实例
    private static _instance: ScoreManager | null = null;

    // 获取分数管理器的单例实例
    public static get instance(): ScoreManager {
        if (!ScoreManager._instance) {
            ScoreManager._instance = new ScoreManager();
        }

        return ScoreManager._instance;
    }

    // 当前分数
    private score: number = 0;
    // 分数显示文本对象
    private scoreText: any = null;
    // 获胜提示文本对象
    private winText: any = null;
    // 是否已经获胜
    private hasWon: boolean = false;
    // 获胜所需分数
    private readonly winScore: number = 5;
    // 已经得分过的平台集合（防止重复计分）
    private scoredPlatforms: Set<string> = new Set<string>();

    // 初始化分数管理器
    public init(): void {
        // 重置分数
        this.score = 0;
        // 重置获胜状态
        this.hasWon = false;
        // 清空已得分平台记录
        this.scoredPlatforms.clear();

        // 创建分数显示文本（如果还未创建）
        if (!this.scoreText) {
            this.createScoreText();
        }

        // 创建获胜提示文本（如果还未创建）
        if (!this.winText) {
            this.createWinText();
        }

        // 更新分数显示
        this.updateScoreText();
        // 隐藏获胜文本
        this.hideWinText();

        console.log("ScoreManager: Score UI created");
    }

    // 创建分数显示文本
    private createScoreText(): void {
        // 新建文本对象
        this.scoreText = new Laya.Text();

        // 设置文本内容和样式
        this.scoreText.text = "Score: 0";
        this.scoreText.fontSize = 28;
        this.scoreText.color = "#FFD700";
        this.scoreText.bold = true;

        // 设置文本位置和大小
        this.scoreText.x = 20;
        this.scoreText.y = 20;
        this.scoreText.width = 300;
        this.scoreText.height = 50;
        // 设置z层级为最前面
        this.scoreText.zOrder = 9999;

        // 添加到舞台
        Laya.stage.addChild(this.scoreText);
    }

    // 创建获胜提示文本
    private createWinText(): void {
        // 新建文本对象
        this.winText = new Laya.Text();

        // 设置文本内容和样式
        this.winText.text = "You Win!";
        this.winText.fontSize = 48;
        this.winText.color = "#FFD700";
        this.winText.bold = true;
        // 居中对齐
        this.winText.align = "center";
        this.winText.valign = "middle";

        // 设置文本覆盖整个屏幕
        this.winText.x = 0;
        this.winText.y = 0;
        this.winText.width = Laya.stage.width;
        this.winText.height = Laya.stage.height;
        // 设置z层级最高
        this.winText.zOrder = 10000;
        // 默认隐藏
        this.winText.visible = false;

        // 添加到舞台
        Laya.stage.addChild(this.winText);
    }

    // 当球接触到平台时添加分数
    public addPlatformScore(platform: any): void {
        // 检查平台是否存在
        if (!platform) {
            return;
        }

        // 获取平台名称
        const platformName = platform.name;

        // 检查平台名称是否为字符串
        if (typeof platformName !== "string") {
            return;
        }

        // 地面不计分
        if (platformName === "Ground") {
            return;
        }

        // 只有Platform_开头的平台才计分
        if (!platformName.startsWith("Platform_")) {
            return;
        }

        // 防止重复计分
        if (this.scoredPlatforms.has(platformName)) {
            return;
        }

        // 记录该平台已经得分
        this.scoredPlatforms.add(platformName);
        // 增加分数
        this.score++;

        // 更新分数显示
        this.updateScoreText();
        // 检查是否获胜
        this.checkWin();

        console.log(
            "ScoreManager: add score from",
            platformName,
            "score =",
            this.score
        );
    }

    // 更新分数显示文本
    private updateScoreText(): void {
        // 检查文本对象是否存在
        if (!this.scoreText) {
            return;
        }

        // 更新文本内容为当前分数
        this.scoreText.text = "Score: " + this.score;
    }

    // 检查是否满足获胜条件（分数达到5分）
    private checkWin(): void {
        // 如果已经获胜或分数不足5，则不处理
        if (this.hasWon || this.score < this.winScore) {
            return;
        }

        // 标记为已获胜
        this.hasWon = true;
        // 显示获胜文本
        this.showWinText();

        console.log("Game clear");
    }

    // 显示获胜提示文本
    private showWinText(): void {
        // 检查文本对象是否存在
        if (!this.winText) {
            return;
        }

        // 确保文本覆盖整个屏幕
        this.winText.width = Laya.stage.width;
        this.winText.height = Laya.stage.height;
        // 设置为可见
        this.winText.visible = true;
    }

    // 隐藏获胜提示文本
    private hideWinText(): void {
        // 检查文本对象是否存在
        if (!this.winText) {
            return;
        }

        // 设置为隐藏
        this.winText.visible = false;
    }

    // 重置分数管理器状态
    public reset(): void {
        // 重置分数
        this.score = 0;
        // 重置获胜状态
        this.hasWon = false;
        // 清空已得分平台记录
        this.scoredPlatforms.clear();

        // 更新分数显示
        this.updateScoreText();
        // 隐藏获胜文本
        this.hideWinText();

        console.log("ScoreManager: reset score");
    }

    // 获取当前分数
    public getScore(): number {
        // 返回当前分数
        return this.score;
    }

    // 是否已经胜利（供外部判断是否允许按 R 重开）
    public isWon(): boolean {
        return this.hasWon;
    }
}
