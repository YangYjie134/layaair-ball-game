declare var Laya: any;
import { SfxManager } from "./SfxManager";

// 分数管理器：负责游戏分数的计算、显示和获胜判定
export class ScoreManager {
    // 单例实例，确保全局只存在一个分数管理器
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
    // 分数 HUD 与显示对象（仅负责展示，不参与计分）
    private scoreHud: any = null;
    private scoreText: any = null;
    private scoreSegments: any[] = [];
    // 获胜卡片与提示文本对象
    private winCard: any = null;
    private winText: any = null;
    // 是否已经获胜
    private hasWon: boolean = false;
    // 获胜所需分数
    private readonly winScore: number = 5;
    // 已经得分过的平台集合（防止重复计分）
    private scoredPlatforms: Set<string> = new Set<string>();

    // 初始化分数管理器，重置分数状态并创建界面文本
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

        // 初始化完成后输出日志，方便确认分数界面已成功创建
        console.log("ScoreManager: Score UI created");
    }

    // 创建分数显示文本
    private createScoreText(): void {
        const hudWidth = 392;
        const hudHeight = 44;

        this.scoreHud = new Laya.Sprite();
        this.scoreHud.x = 40;
        this.scoreHud.y = 32;
        this.scoreHud.width = hudWidth;
        this.scoreHud.height = hudHeight;
        this.scoreHud.zOrder = 9999;
        this.scoreHud.mouseEnabled = false;

        // 深色半透明切角底板。
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
        this.scoreHud.addChild(background);

        // FUI 顶部强调线与切角端点。
        const frame = new Laya.Sprite();
        frame.graphics.drawLine(16, 0, 150, 0, "#35E9FF", 2);
        frame.graphics.drawLine(8, 43, 58, 43, "#7C4DFF", 1);
        frame.graphics.drawLine(382, 5, 387, 10, "#35E9FF", 1);
        this.scoreHud.addChild(frame);

        const scoreLabel = new Laya.Text();
        scoreLabel.text = "SCORE";
        scoreLabel.font = "Arial";
        scoreLabel.fontSize = 15;
        scoreLabel.color = "#78D7E8";
        scoreLabel.bold = true;
        scoreLabel.x = 16;
        scoreLabel.y = 6;
        scoreLabel.width = 66;
        scoreLabel.height = 32;
        scoreLabel.align = "left";
        scoreLabel.valign = "middle";
        this.scoreHud.addChild(scoreLabel);

        this.scoreSegments = [];
        const segmentStartX = 90;
        const segmentWidth = 24;
        const segmentGap = 5;
        for (let i = 0; i < this.winScore; i++) {
            const segment = new Laya.Sprite();
            segment.x = segmentStartX + i * (segmentWidth + segmentGap);
            segment.y = 15;
            segment.width = segmentWidth;
            segment.height = 14;
            this.scoreHud.addChild(segment);
            this.scoreSegments.push(segment);
        }

        this.scoreText = new Laya.Text();
        this.scoreText.text = "00 / 05";
        this.scoreText.font = "Arial";
        this.scoreText.fontSize = 19;
        this.scoreText.color = "#E8FCFF";
        this.scoreText.bold = true;
        this.scoreText.x = 252;
        this.scoreText.y = 5;
        this.scoreText.width = 122;
        this.scoreText.height = 34;
        this.scoreText.align = "right";
        this.scoreText.valign = "middle";
        this.scoreHud.addChild(this.scoreText);

        Laya.stage.addChild(this.scoreHud);
    }

    // 创建获胜提示文本
    private createWinText(): void {
        const cardWidth = 540;
        const cardHeight = 220;

        this.winCard = new Laya.Sprite();
        this.winCard.width = cardWidth;
        this.winCard.height = cardHeight;
        this.winCard.zOrder = 10000;
        this.winCard.mouseEnabled = false;

        const background = new Laya.Sprite();
        background.alpha = 0.94;
        background.graphics.drawPoly(
            0,
            0,
            [20, 0, cardWidth - 44, 0, cardWidth, 44, cardWidth, cardHeight - 20,
                cardWidth - 20, cardHeight, 44, cardHeight, 0, cardHeight - 44, 0, 20],
            "#050D1A",
            "#17677B",
            1
        );
        this.winCard.addChild(background);

        // 轻量 FUI 框线、角标与瞄准器式装饰。
        const frame = new Laya.Sprite();
        frame.graphics.drawLine(42, 0, 312, 0, "#39F4FF", 2);
        frame.graphics.drawLine(312, 0, 346, 0, "#8B5CFF", 2);
        frame.graphics.drawLine(44, cardHeight, 214, cardHeight, "#39F4FF", 1);
        frame.graphics.drawLine(16, 16, 58, 16, "#39F4FF", 2);
        frame.graphics.drawLine(16, 16, 16, 58, "#39F4FF", 2);
        frame.graphics.drawLine(cardWidth - 16, 58, cardWidth - 16, 88, "#39F4FF", 2);
        frame.graphics.drawLine(cardWidth - 46, 16, cardWidth - 16, 46, "#39F4FF", 2);
        frame.graphics.drawLine(16, cardHeight - 58, 16, cardHeight - 22, "#8B5CFF", 2);
        frame.graphics.drawLine(16, cardHeight - 16, 58, cardHeight - 16, "#8B5CFF", 2);
        frame.graphics.drawLine(cardWidth - 58, cardHeight - 16, cardWidth - 16, cardHeight - 16, "#39F4FF", 2);
        frame.graphics.drawLine(cardWidth - 16, cardHeight - 58, cardWidth - 16, cardHeight - 16, "#39F4FF", 2);
        frame.graphics.drawLine(68, 55, cardWidth - 68, 55, "#164C5B", 1);
        frame.graphics.drawLine(68, 157, cardWidth - 68, 157, "#164C5B", 1);
        this.winCard.addChild(frame);

        const statusText = new Laya.Text();
        statusText.text = "MISSION STATUS // COMPLETE";
        statusText.font = "Arial";
        statusText.fontSize = 14;
        statusText.color = "#66DFF1";
        statusText.bold = true;
        statusText.x = 68;
        statusText.y = 20;
        statusText.width = cardWidth - 136;
        statusText.height = 28;
        statusText.align = "center";
        statusText.valign = "middle";
        this.winCard.addChild(statusText);

        this.winText = new Laya.Text();
        this.winText.text = "YOU WIN";
        this.winText.font = "Arial";
        this.winText.fontSize = 52;
        this.winText.color = "#F0FDFF";
        this.winText.bold = true;
        this.winText.stroke = 2;
        this.winText.strokeColor = "#08788F";
        this.winText.align = "center";
        this.winText.valign = "middle";
        this.winText.x = 56;
        this.winText.y = 62;
        this.winText.width = cardWidth - 112;
        this.winText.height = 82;
        this.winCard.addChild(this.winText);

        const scoreStatus = new Laya.Text();
        scoreStatus.text = "SCORE  05 / 05";
        scoreStatus.font = "Arial";
        scoreStatus.fontSize = 16;
        scoreStatus.color = "#9CEAF5";
        scoreStatus.bold = true;
        scoreStatus.x = 68;
        scoreStatus.y = 169;
        scoreStatus.width = cardWidth - 136;
        scoreStatus.height = 28;
        scoreStatus.align = "center";
        scoreStatus.valign = "middle";
        this.winCard.addChild(scoreStatus);

        this.positionWinCard();
        this.winCard.visible = false;
        Laya.stage.addChild(this.winCard);
    }

    // 根据当前舞台尺寸保持胜利卡片居中。
    private positionWinCard(): void {
        if (!this.winCard) {
            return;
        }

        this.winCard.x = Math.round((Laya.stage.width - this.winCard.width) / 2);
        this.winCard.y = Math.round((Laya.stage.height - this.winCard.height) / 2);
    }

    // 刷新五段进度格的明暗状态。
    private updateScoreSegments(): void {
        const litCount = Math.min(this.score, this.winScore);

        for (let i = 0; i < this.scoreSegments.length; i++) {
            const segment = this.scoreSegments[i];
            const isLit = i < litCount;

            segment.graphics.clear();
            segment.alpha = isLit ? 1 : 0.72;
            segment.graphics.drawPoly(
                0,
                0,
                [0, 0, 20, 0, 24, 4, 24, 14, 0, 14],
                isLit ? "#2DEBFF" : "#0D2938",
                isLit ? "#B8FBFF" : "#2B6272",
                1
            );

            if (isLit) {
                segment.graphics.drawLine(3, 2, 19, 2, "#E4FFFF", 1);
            }
        }
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

        // 使用两位数字展示当前分数，并同步五段进度格。
        const currentScore = this.score < 10 ? "0" + this.score : String(this.score);
        const targetScore = this.winScore < 10 ? "0" + this.winScore : String(this.winScore);
        this.scoreText.text = currentScore + " / " + targetScore;
        this.updateScoreSegments();
    }

    // 检查是否满足获胜条件（分数达到5分）
    private checkWin(): void {
        // 如果已经获胜或分数不足5，则不处理
        if (this.hasWon || this.score < this.winScore) {
            return;
        }

        // 标记为已获胜
        this.hasWon = true;
        SfxManager.playClear();
        // 显示获胜文本
        this.showWinText();

        console.log("Game clear");
    }

    // 显示获胜提示文本
    private showWinText(): void {
        // 检查胜利卡片是否存在
        if (!this.winCard || !this.winText) {
            return;
        }

        this.positionWinCard();
        // 设置为可见
        this.winCard.visible = true;
    }

    // 隐藏获胜提示文本
    private hideWinText(): void {
        // 检查胜利卡片是否存在
        if (!this.winCard) {
            return;
        }

        // 设置为隐藏
        this.winCard.visible = false;
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
