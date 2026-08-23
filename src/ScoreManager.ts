declare var Laya: any;
import { SfxManager } from "./SfxManager";

type WinAuraPoint = { x: number; y: number };

type WinGlyphLayout = {
    character: string;
    x: number;
    y: number;
    width: number;
    height: number;
    centerX: number;
    centerY: number;
    fontSize: number;
};

type WinGlyphAuraSystem = {
    character: string;
    path: WinAuraPoint[];
    segmentLengths: number[];
    totalLength: number;
    centerX: number;
    centerY: number;
    phaseOffset: number;
    rimGlow: any;
    rimCore: any;
    energyHead: any;
    particles: any[];
    spark: any;
};

// 固定标题 YOU WIN 的归一化字形轮廓模板；仅作为不可见的光效运动路径。
const WIN_GLYPH_AURA_TEMPLATES: Record<string, WinAuraPoint[]> = {
    Y: [
        { x: 0, y: 0 }, { x: 0.23, y: 0 }, { x: 0.5, y: 0.35 },
        { x: 0.77, y: 0 }, { x: 1, y: 0 }, { x: 0.62, y: 0.52 },
        { x: 0.62, y: 1 }, { x: 0.38, y: 1 }, { x: 0.38, y: 0.52 },
    ],
    O: [
        { x: 0.5, y: 0 }, { x: 0.7, y: 0.03 }, { x: 0.86, y: 0.12 },
        { x: 0.97, y: 0.28 }, { x: 1, y: 0.5 }, { x: 0.97, y: 0.72 },
        { x: 0.86, y: 0.88 }, { x: 0.7, y: 0.97 }, { x: 0.5, y: 1 },
        { x: 0.3, y: 0.97 }, { x: 0.14, y: 0.88 }, { x: 0.03, y: 0.72 },
        { x: 0, y: 0.5 }, { x: 0.03, y: 0.28 }, { x: 0.14, y: 0.12 },
        { x: 0.3, y: 0.03 },
    ],
    U: [
        { x: 0, y: 0 }, { x: 0, y: 0.68 }, { x: 0.08, y: 0.86 },
        { x: 0.24, y: 0.97 }, { x: 0.5, y: 1 }, { x: 0.76, y: 0.97 },
        { x: 0.92, y: 0.86 }, { x: 1, y: 0.68 }, { x: 1, y: 0 },
        { x: 0.76, y: 0 }, { x: 0.76, y: 0.65 }, { x: 0.7, y: 0.74 },
        { x: 0.62, y: 0.79 }, { x: 0.5, y: 0.81 }, { x: 0.38, y: 0.79 },
        { x: 0.3, y: 0.74 }, { x: 0.24, y: 0.65 }, { x: 0.24, y: 0 },
    ],
    W: [
        { x: 0, y: 0 }, { x: 0.2, y: 0 }, { x: 0.32, y: 0.66 },
        { x: 0.43, y: 0.28 }, { x: 0.57, y: 0.28 }, { x: 0.68, y: 0.66 },
        { x: 0.8, y: 0 }, { x: 1, y: 0 }, { x: 0.79, y: 1 },
        { x: 0.61, y: 1 }, { x: 0.5, y: 0.65 }, { x: 0.39, y: 1 },
        { x: 0.21, y: 1 },
    ],
    I: [
        { x: 0.18, y: 0 }, { x: 0.82, y: 0 }, { x: 0.82, y: 0.12 },
        { x: 0.62, y: 0.12 }, { x: 0.62, y: 0.88 }, { x: 0.82, y: 0.88 },
        { x: 0.82, y: 1 }, { x: 0.18, y: 1 }, { x: 0.18, y: 0.88 },
        { x: 0.38, y: 0.88 }, { x: 0.38, y: 0.12 }, { x: 0.18, y: 0.12 },
    ],
    N: [
        { x: 0, y: 0 }, { x: 0.24, y: 0 }, { x: 0.76, y: 0.66 },
        { x: 0.76, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 },
        { x: 0.76, y: 1 }, { x: 0.24, y: 0.34 }, { x: 0.24, y: 1 },
        { x: 0, y: 1 },
    ],
};

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
    private nextLevelHandler: (() => void) | null = null;
    private nextLevelButton: any = null;
    private nextLevelLabel: any = null;
    private winGoldenAura: any = null;
    private winGoldenGlyphSystems: WinGlyphAuraSystem[] = [];
    private winGoldenLoopStarted: boolean = false;
    private winGoldenPhase: number = 0;
    // 是否已经获胜
    private hasWon: boolean = false;
    // 获胜所需分数
    private readonly winScore: number = 5;
    // 已经得分过的平台集合（防止重复计分）
    private scoredPlatforms: Set<string> = new Set<string>();
    private readonly scoreFeedbackDurationMs: number = 260;

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

    public setNextLevelHandler(handler: () => void): void {
        this.nextLevelHandler = handler;
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
        const cardHeight = 300;

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
        this.createWinGoldenAura(cardWidth, cardHeight);
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

        const buttonWidth = 260;
        const buttonHeight = 48;
        const nextLevelButton = new Laya.Sprite();
        this.nextLevelButton = nextLevelButton;
        nextLevelButton.x = Math.round((cardWidth - buttonWidth) / 2);
        nextLevelButton.y = 200;
        nextLevelButton.width = buttonWidth;
        nextLevelButton.height = buttonHeight;
        nextLevelButton.mouseEnabled = true;

        const nextLevelLabel = new Laya.Text();
        this.nextLevelLabel = nextLevelLabel;
        nextLevelLabel.text = "NEXT LEVEL";
        nextLevelLabel.font = "Arial";
        nextLevelLabel.fontSize = 19;
        nextLevelLabel.color = "#DDFCFF";
        nextLevelLabel.bold = true;
        nextLevelLabel.width = buttonWidth;
        nextLevelLabel.height = buttonHeight;
        nextLevelLabel.align = "center";
        nextLevelLabel.valign = "middle";
        nextLevelLabel.mouseEnabled = false;
        nextLevelButton.addChild(nextLevelLabel);
        this.drawNextLevelButton("normal");
        nextLevelButton.on(Laya.Event.CLICK, this, this.onNextLevelClick);
        nextLevelButton.on(Laya.Event.MOUSE_OVER, this, this.onNextLevelOver);
        nextLevelButton.on(Laya.Event.MOUSE_OUT, this, this.onNextLevelOut);
        nextLevelButton.on(Laya.Event.MOUSE_DOWN, this, this.onNextLevelDown);
        nextLevelButton.on(Laya.Event.MOUSE_UP, this, this.onNextLevelUp);
        this.winCard.addChild(nextLevelButton);

        const restartHint = new Laya.Text();
        restartHint.text = "PRESS R";
        restartHint.font = "Arial";
        restartHint.fontSize = 13;
        restartHint.color = "#6FA8B5";
        restartHint.x = 68;
        restartHint.y = 255;
        restartHint.width = cardWidth - 136;
        restartHint.height = 24;
        restartHint.align = "center";
        restartHint.valign = "middle";
        restartHint.mouseEnabled = false;
        this.winCard.addChild(restartHint);

        this.positionWinCard();
        this.winCard.visible = false;
        Laya.stage.addChild(this.winCard);
    }

    private onNextLevelClick(): void {
        if (this.nextLevelHandler) {
            this.nextLevelHandler();
        }
    }

    private drawNextLevelButton(state: "normal" | "hover" | "pressed"): void {
        const button = this.nextLevelButton;
        if (!button?.graphics) return;

        const buttonWidth = button.width || 260;
        const buttonHeight = button.height || 48;
        const fill = state === "pressed" ? "#12384A" : state === "hover" ? "#0D3040" : "#0A2432";
        const border = state === "pressed" ? "#B8FBFF" : state === "hover" ? "#70FAFF" : "#39F4FF";

        button.graphics.clear();
        button.graphics.drawPoly(
            0,
            0,
            [8, 0, buttonWidth - 8, 0, buttonWidth, 8, buttonWidth, buttonHeight - 8,
                buttonWidth - 8, buttonHeight, 8, buttonHeight, 0, buttonHeight - 8, 0, 8],
            fill,
            border,
            state === "hover" ? 3 : 2
        );
        button.graphics.drawLine(18, 5, 88, 5, state === "normal" ? "#8B5CFF" : "#B69BFF", 2);
        button.graphics.drawLine(
            buttonWidth - 70,
            buttonHeight - 5,
            buttonWidth - 18,
            buttonHeight - 5,
            border,
            1
        );
        button.alpha = state === "pressed" ? 0.88 : 1;
        if (this.nextLevelLabel) {
            this.nextLevelLabel.color = state === "normal" ? "#DDFCFF" : "#FFFFFF";
        }
    }

    private onNextLevelOver(): void {
        this.drawNextLevelButton("hover");
    }

    private onNextLevelOut(): void {
        this.drawNextLevelButton("normal");
    }

    private onNextLevelDown(): void {
        this.drawNextLevelButton("pressed");
    }

    private onNextLevelUp(): void {
        this.drawNextLevelButton("hover");
    }

    private createWinGoldenAura(cardWidth: number, cardHeight: number): void {
        if (this.winGoldenAura || !this.winCard || !this.winText) return;

        const aura = new Laya.Sprite();
        aura.name = "WPB_WinGoldenAura";
        aura.width = cardWidth;
        aura.height = cardHeight;
        aura.mouseEnabled = false;
        aura.visible = false;
        // 胜利光环固定在底板之上、全部文字与交互控件之下。
        this.winCard.addChildAt(aura, Math.min(1, this.winCard.numChildren));
        this.winGoldenAura = aura;

        const glyphLayouts = this.getWinGlyphLayouts();
        this.winGoldenGlyphSystems = [];
        for (let glyphIndex = 0; glyphIndex < glyphLayouts.length; glyphIndex++) {
            const layout = glyphLayouts[glyphIndex];
            const template = WIN_GLYPH_AURA_TEMPLATES[layout.character];
            if (!template) continue;

            const path = this.buildWinGlyphAuraPath(layout, template);
            const metrics = this.getWinClosedPathMetrics(path);
            const glyphRoot = new Laya.Sprite();
            glyphRoot.name = "WPB_GlyphAura_" + layout.character;
            glyphRoot.mouseEnabled = false;
            aura.addChild(glyphRoot);

            const rimGlow = new Laya.Sprite();
            rimGlow.name = "WPB_GlyphRimGlow_" + layout.character;
            rimGlow.mouseEnabled = false;
            this.drawWinGlyphAuraPath(rimGlow, path, "#FFD700", 5.5);
            glyphRoot.addChild(rimGlow);

            const rimCore = new Laya.Sprite();
            rimCore.name = "WPB_GlyphRimCore_" + layout.character;
            rimCore.mouseEnabled = false;
            this.drawWinGlyphAuraPath(rimCore, path, "#FFE45C", 1.5);
            glyphRoot.addChild(rimCore);

            const particles: any[] = [];
            const particlePalette = ["#FFD700", "#FFE45C", "#FFE082", "#FFF7B0"];
            for (let particleIndex = 0; particleIndex < 7; particleIndex++) {
                const particle = new Laya.Sprite();
                particle.name = "WPB_GlyphParticle_" + layout.character + "_" + particleIndex;
                particle.mouseEnabled = false;
                const radius = particleIndex < 5
                    ? 0.85 + (particleIndex % 3) * 0.18
                    : 0.7 + (particleIndex % 2) * 0.14;
                particle.graphics.drawCircle(0, 0, radius, particlePalette[particleIndex % particlePalette.length]);
                glyphRoot.addChild(particle);
                particles.push(particle);
            }

            const spark = new Laya.Sprite();
            spark.name = "WPB_GlyphSpark_" + layout.character;
            spark.mouseEnabled = false;
            spark.graphics.drawLine(-3.2, 0, 3.2, 0, "#FFF7B0", 1.2);
            spark.graphics.drawLine(0, -3.2, 0, 3.2, "#FFF7B0", 1.2);
            spark.graphics.drawCircle(0, 0, 1.05, "#FFFFFF");
            glyphRoot.addChild(spark);

            // 每个 carrier 只有一个主能量头；短尾绘制在同一 Graphics 中。
            const energyHead = new Laya.Sprite();
            energyHead.name = "WPB_GlyphEnergyHead_" + layout.character;
            energyHead.mouseEnabled = false;
            glyphRoot.addChild(energyHead);

            this.winGoldenGlyphSystems.push({
                character: layout.character,
                path,
                segmentLengths: metrics.segmentLengths,
                totalLength: metrics.totalLength,
                centerX: layout.centerX,
                centerY: layout.centerY,
                phaseOffset: glyphIndex / glyphLayouts.length,
                rimGlow,
                rimCore,
                energyHead,
                particles,
                spark,
            });
        }

        this.updateWinGoldenAura();
    }

    private createWinTextMeasureContext(fontSize: number, fontName: string, bold: boolean): any {
        const globalDocument = typeof document !== "undefined" ? document : null;
        const browserDocument = Laya.Browser?.document || globalDocument;
        const canvas = browserDocument?.createElement?.("canvas");
        const context = canvas?.getContext?.("2d");
        if (!context || typeof context.measureText !== "function") return null;

        const family = fontName.includes(" ") ? '"' + fontName + '"' : fontName;
        context.font = (bold ? "bold " : "") + fontSize + "px " + family;
        context.textAlign = "left";
        context.textBaseline = "alphabetic";
        return context;
    }

    private measureWinTextSpan(
        content: string,
        context: any,
        fontSize: number,
        fontName: string,
        bold: boolean
    ): number {
        if (content.length === 0) return 0;
        if (context && typeof context.measureText === "function") {
            const measuredWidth = Number(context.measureText(content).width);
            if (Number.isFinite(measuredWidth) && measuredWidth > 0) return measuredWidth;
        }

        const probe = new Laya.Text();
        probe.font = fontName;
        probe.fontSize = fontSize;
        probe.bold = bold;
        probe.text = content;
        const layaMeasuredWidth = Number(probe.textWidth);
        if (typeof probe.destroy === "function") {
            probe.destroy(true);
        }
        if (Number.isFinite(layaMeasuredWidth) && layaMeasuredWidth > 0) return layaMeasuredWidth;

        return Array.from(content).length * fontSize * 0.6;
    }

    private getWinGlyphLayouts(): WinGlyphLayout[] {
        const textNode = this.winText;
        if (!textNode) return [];

        const content = String(textNode.text || "YOU WIN");
        const fontSize = Math.max(1, Number(textNode.fontSize) || 52);
        const fontName = String(textNode.font || "Arial");
        const bold = Boolean(textNode.bold);
        const textX = Number(textNode.x) || 0;
        const textY = Number(textNode.y) || 0;
        const textWidth = Math.max(fontSize, Number(textNode.width) || fontSize);
        const textHeight = Math.max(fontSize, Number(textNode.height) || fontSize);
        const context = this.createWinTextMeasureContext(fontSize, fontName, bold);
        const measuredTextWidth = this.measureWinTextSpan(content, context, fontSize, fontName, bold);

        let textStartX = textX;
        if (textNode.align === "center") {
            textStartX += (textWidth - measuredTextWidth) * 0.5;
        } else if (textNode.align === "right") {
            textStartX += textWidth - measuredTextWidth;
        }

        const lineBoxHeight = Math.min(textHeight, fontSize);
        let lineTop = textY;
        if (textNode.valign === "middle") {
            lineTop += (textHeight - lineBoxHeight) * 0.5;
        } else if (textNode.valign === "bottom") {
            lineTop += textHeight - lineBoxHeight;
        }

        const layouts: WinGlyphLayout[] = [];
        for (let characterIndex = 0; characterIndex < content.length; characterIndex++) {
            const character = content.charAt(characterIndex);
            if (character === " ") continue;

            const prefixWidth = this.measureWinTextSpan(
                content.slice(0, characterIndex), context, fontSize, fontName, bold
            );
            const nextPrefixWidth = this.measureWinTextSpan(
                content.slice(0, characterIndex + 1), context, fontSize, fontName, bold
            );
            const advanceWidth = Math.max(1, nextPrefixWidth - prefixWidth);
            const glyphMetrics = context?.measureText?.(character);
            const actualLeft = Math.max(0, Number(glyphMetrics?.actualBoundingBoxLeft) || 0);
            const actualRight = Math.max(0, Number(glyphMetrics?.actualBoundingBoxRight) || 0);
            const actualAscent = Math.max(0, Number(glyphMetrics?.actualBoundingBoxAscent) || 0);
            const actualDescent = Math.max(0, Number(glyphMetrics?.actualBoundingBoxDescent) || 0);
            const measuredInkWidth = actualLeft + actualRight;
            const measuredInkHeight = actualAscent + actualDescent;
            const glyphWidth = Math.max(1, measuredInkWidth || advanceWidth);
            const glyphHeight = Math.max(
                fontSize * 0.68,
                Math.min(lineBoxHeight, measuredInkHeight || lineBoxHeight * 0.82)
            );
            const glyphX = textStartX + prefixWidth - actualLeft;
            const glyphY = lineTop + (lineBoxHeight - glyphHeight) * 0.5;

            layouts.push({
                character,
                x: glyphX,
                y: glyphY,
                width: glyphWidth,
                height: glyphHeight,
                centerX: glyphX + glyphWidth * 0.5,
                centerY: glyphY + glyphHeight * 0.5,
                fontSize,
            });
        }
        return layouts;
    }

    private buildWinGlyphAuraPath(layout: WinGlyphLayout, template: WinAuraPoint[]): WinAuraPoint[] {
        const offset = Math.max(4, Math.min(6, layout.fontSize * 0.1));
        return template.map((normalizedPoint) => {
            const glyphPointX = layout.x + normalizedPoint.x * layout.width;
            const glyphPointY = layout.y + normalizedPoint.y * layout.height;
            const fromCenterX = glyphPointX - layout.centerX;
            const fromCenterY = glyphPointY - layout.centerY;
            const distance = Math.max(0.001, Math.sqrt(fromCenterX * fromCenterX + fromCenterY * fromCenterY));
            return {
                x: glyphPointX + fromCenterX / distance * offset,
                y: glyphPointY + fromCenterY / distance * offset,
            };
        });
    }

    private getWinClosedPathMetrics(path: WinAuraPoint[]): {
        segmentLengths: number[];
        totalLength: number;
    } {
        const segmentLengths: number[] = [];
        let totalLength = 0;
        for (let i = 0; i < path.length; i++) {
            const start = path[i];
            const end = path[(i + 1) % path.length];
            const deltaX = end.x - start.x;
            const deltaY = end.y - start.y;
            const segmentLength = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
            segmentLengths.push(segmentLength);
            totalLength += segmentLength;
        }
        return { segmentLengths, totalLength };
    }

    private drawWinGlyphAuraPath(node: any, path: WinAuraPoint[], color: string, lineWidth: number): void {
        if (!node?.graphics || path.length < 2) return;

        node.graphics.clear();
        for (let i = 0; i < path.length; i++) {
            const start = path[i];
            const end = path[(i + 1) % path.length];
            node.graphics.drawLine(start.x, start.y, end.x, end.y, color, lineWidth);
        }
    }

    private getWinGlyphPathPoint(system: WinGlyphAuraSystem, progress: number): WinAuraPoint {
        if (system.path.length === 0 || system.totalLength <= 0) {
            return { x: system.centerX, y: system.centerY };
        }

        const normalizedProgress = ((progress % 1) + 1) % 1;
        const targetDistance = normalizedProgress * system.totalLength;
        let traversedDistance = 0;
        for (let i = 0; i < system.path.length; i++) {
            const segmentLength = system.segmentLengths[i];
            if (targetDistance <= traversedDistance + segmentLength || i === system.path.length - 1) {
                const segmentProgress = segmentLength > 0
                    ? (targetDistance - traversedDistance) / segmentLength
                    : 0;
                const start = system.path[i];
                const end = system.path[(i + 1) % system.path.length];
                return {
                    x: start.x + (end.x - start.x) * segmentProgress,
                    y: start.y + (end.y - start.y) * segmentProgress,
                };
            }
            traversedDistance += segmentLength;
        }
        return system.path[0];
    }

    private startWinGoldenAura(): void {
        if (!this.winGoldenAura) return;

        this.stopWinGoldenAura();
        this.winGoldenPhase = 0;
        this.winGoldenAura.visible = true;
        this.updateWinGoldenAura();
        if (typeof Laya.timer?.frameLoop === "function") {
            this.winGoldenLoopStarted = true;
            Laya.timer.frameLoop(1, this, this.updateWinGoldenAura);
        }
    }

    private stopWinGoldenAura(): void {
        if (typeof Laya.timer?.clear === "function") {
            Laya.timer.clear(this, this.updateWinGoldenAura);
        }
        this.winGoldenLoopStarted = false;
        this.winGoldenPhase = 0;
        if (this.winGoldenAura) {
            this.winGoldenAura.visible = false;
        }
    }

    private updateWinGoldenAura(): void {
        const aura = this.winGoldenAura;
        if (!aura || this.winGoldenGlyphSystems.length === 0) return;

        this.winGoldenPhase = (this.winGoldenPhase + 0.003) % 1;
        const fullPhaseAngle = this.winGoldenPhase * Math.PI * 2;
        const trailPalette = ["#9A6500", "#CE8F00", "#FFD700", "#FFE45C"];

        for (let systemIndex = 0; systemIndex < this.winGoldenGlyphSystems.length; systemIndex++) {
            const system = this.winGoldenGlyphSystems[systemIndex];
            const staggeredAngle = fullPhaseAngle + system.phaseOffset * Math.PI * 2;
            const breath = (Math.sin(staggeredAngle) + 1) * 0.5;
            system.rimGlow.alpha = 0.14 + breath * 0.12;
            system.rimCore.alpha = 0.42 + breath * 0.14;

            const headPhase = (this.winGoldenPhase + system.phaseOffset) % 1;
            system.energyHead.graphics.clear();
            for (let tailIndex = 4; tailIndex >= 1; tailIndex--) {
                const tailPoint = this.getWinGlyphPathPoint(system, headPhase - tailIndex * 0.018);
                system.energyHead.graphics.drawCircle(
                    tailPoint.x,
                    tailPoint.y,
                    0.65 + (4 - tailIndex) * 0.2,
                    trailPalette[4 - tailIndex]
                );
            }
            const headPoint = this.getWinGlyphPathPoint(system, headPhase);
            system.energyHead.graphics.drawCircle(headPoint.x, headPoint.y, 3.2, "#FFD700");
            system.energyHead.graphics.drawCircle(headPoint.x, headPoint.y, 1.6, "#FFF7B0");
            system.energyHead.graphics.drawCircle(headPoint.x, headPoint.y, 0.7, "#FFFFFF");
            system.energyHead.alpha = 0.82 + breath * 0.12;

            for (let particleIndex = 0; particleIndex < system.particles.length; particleIndex++) {
                const particle = system.particles[particleIndex];
                const life = (
                    this.winGoldenPhase * 0.72
                    + particleIndex / system.particles.length
                    + systemIndex * 0.091
                ) % 1;
                const particlePathPhase = (
                    particleIndex / system.particles.length
                    + system.phaseOffset * 0.37
                    + this.winGoldenPhase * 0.11
                ) % 1;
                const pathPoint = this.getWinGlyphPathPoint(system, particlePathPhase);
                const outwardX = pathPoint.x - system.centerX;
                const outwardY = pathPoint.y - system.centerY;
                const outwardLength = Math.max(0.001, Math.sqrt(outwardX * outwardX + outwardY * outwardY));
                const isNearContour = particleIndex < 5;
                const outwardDistance = isNearContour
                    ? 0.4 + (Math.sin(staggeredAngle * 0.7 + particleIndex * 1.6) + 1) * 0.55
                    : 4 + life * 4;
                particle.x = pathPoint.x + outwardX / outwardLength * outwardDistance;
                particle.y = pathPoint.y + outwardY / outwardLength * outwardDistance;
                if (isNearContour) {
                    const twinkle = (Math.sin(staggeredAngle * 1.3 + particleIndex * 1.47) + 1) * 0.5;
                    particle.alpha = 0.3 + twinkle * 0.3;
                } else {
                    particle.alpha = 0.1 + (1 - life) * 0.26;
                }
            }

            const sparkPathPhase = (
                system.phaseOffset + 0.28 + this.winGoldenPhase * 0.16
            ) % 1;
            const sparkPoint = this.getWinGlyphPathPoint(system, sparkPathPhase);
            const sparkOutwardX = sparkPoint.x - system.centerX;
            const sparkOutwardY = sparkPoint.y - system.centerY;
            const sparkOutwardLength = Math.max(
                0.001,
                Math.sqrt(sparkOutwardX * sparkOutwardX + sparkOutwardY * sparkOutwardY)
            );
            system.spark.x = sparkPoint.x + sparkOutwardX / sparkOutwardLength * 1.5;
            system.spark.y = sparkPoint.y + sparkOutwardY / sparkOutwardLength * 1.5;
            const sparkPulse = (Math.sin(staggeredAngle * 1.7) + 1) * 0.5;
            system.spark.alpha = 0.12 + sparkPulse * 0.58;
            const sparkScale = 0.72 + sparkPulse * 0.32;
            system.spark.scaleX = sparkScale;
            system.spark.scaleY = sparkScale;
        }
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
        this.playScoreFeedback(platform);

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

    private playScoreFeedback(platform: any): void {
        SfxManager.playScore();
        this.playPlatformScoreFeedback(platform);
    }

    private playPlatformScoreFeedback(platform: any): void {
        let feedbackRoot: any = null;

        try {
            if (!platform || typeof platform.addChild !== "function") return;

            const platformWidth = Math.max(1, Number(platform.width) || 1);
            const platformHeight = Math.max(1, Number(platform.height) || 1);

            feedbackRoot = new Laya.Sprite();
            feedbackRoot.name = "WPC_ScoreFeedback";
            feedbackRoot.width = platformWidth;
            feedbackRoot.height = platformHeight;
            feedbackRoot.zOrder = 1000;
            feedbackRoot.mouseEnabled = false;
            platform.addChild(feedbackRoot);

            const flash = new Laya.Sprite();
            flash.mouseEnabled = false;
            flash.graphics.drawRect(
                -3,
                -3,
                platformWidth + 6,
                platformHeight + 6,
                "#DFFFFF",
                "#35E9FF",
                2
            );
            flash.graphics.drawLine(0, 1, platformWidth, 1, "#FFFFFF", 2);
            feedbackRoot.addChild(flash);

            const particlePalette = ["#FFFFFF", "#35E9FF", "#8B5CFF"];
            const particles: Array<{
                node: any;
                startX: number;
                startY: number;
                driftX: number;
                rise: number;
            }> = [];

            for (let index = 0; index < 6; index++) {
                const particle = new Laya.Sprite();
                const radius = index % 3 === 0 ? 2.2 : 1.5;
                particle.mouseEnabled = false;
                particle.graphics.drawCircle(0, 0, radius, particlePalette[index % particlePalette.length]);
                feedbackRoot.addChild(particle);

                particles.push({
                    node: particle,
                    startX: platformWidth * (index + 1) / 7,
                    startY: index % 2 === 0 ? 1 : platformHeight * 0.35,
                    driftX: (index - 2.5) * 3.2,
                    rise: 16 + index % 3 * 5,
                });
            }

            const readNow = (): number => {
                const timerValue = Number(Laya.timer?.currTimer);
                return Number.isFinite(timerValue) ? timerValue : Date.now();
            };
            const startedAt = readNow();
            let finished = false;

            const updateScoreFeedback = (): void => {
                if (finished) return;
                if (feedbackRoot?.destroyed) {
                    finishScoreFeedback();
                    return;
                }

                const elapsed = Math.max(0, readNow() - startedAt);
                const progress = Math.min(1, elapsed / this.scoreFeedbackDurationMs);
                const eased = 1 - Math.pow(1 - progress, 2);

                flash.alpha = 0.72 * Math.pow(1 - progress, 2);
                for (const particle of particles) {
                    particle.node.x = particle.startX + particle.driftX * eased;
                    particle.node.y = particle.startY - particle.rise * eased;
                    particle.node.alpha = progress < 0.12
                        ? progress / 0.12
                        : Math.pow(1 - progress, 1.35);
                    const scale = 0.8 + progress * 0.45;
                    particle.node.scaleX = scale;
                    particle.node.scaleY = scale;
                }

                if (progress >= 1) finishScoreFeedback();
            };

            const finishScoreFeedback = (): void => {
                if (finished) return;
                finished = true;
                if (typeof Laya.timer?.clear === "function") {
                    Laya.timer.clear(feedbackRoot, updateScoreFeedback);
                    Laya.timer.clear(feedbackRoot, finishScoreFeedback);
                }
                try {
                    if (typeof feedbackRoot?.removeSelf === "function") feedbackRoot.removeSelf();
                    if (typeof feedbackRoot?.destroy === "function") feedbackRoot.destroy(true);
                } catch (_) {
                    // Scene teardown may already have removed the temporary feedback node.
                }
            };

            updateScoreFeedback();
            if (typeof Laya.timer?.frameLoop === "function") {
                Laya.timer.frameLoop(1, feedbackRoot, updateScoreFeedback);
            } else if (typeof Laya.timer?.once === "function") {
                Laya.timer.once(this.scoreFeedbackDurationMs, feedbackRoot, finishScoreFeedback);
            } else {
                finishScoreFeedback();
            }
        } catch (_) {
            try {
                if (typeof feedbackRoot?.removeSelf === "function") feedbackRoot.removeSelf();
                if (typeof feedbackRoot?.destroy === "function") feedbackRoot.destroy(true);
            } catch (_) {
                // Visual feedback is best-effort and must never affect scoring.
            }
        }
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
        this.winCard.mouseEnabled = true;
        // 设置为可见
        this.winCard.visible = true;
        this.startWinGoldenAura();
    }

    // 隐藏获胜提示文本
    private hideWinText(): void {
        // 检查胜利卡片是否存在
        if (!this.winCard) {
            return;
        }

        // 设置为隐藏
        this.winCard.visible = false;
        this.winCard.mouseEnabled = false;
        this.drawNextLevelButton("normal");
        this.stopWinGoldenAura();
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
