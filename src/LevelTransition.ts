declare const Laya: any;

type LevelTransitionMode = "READY" | "CLEAR";

export class LevelTransition {
    private static active: LevelTransition | null = null;
    private overlay: any = null;
    private card: any = null;
    private completion: (() => void) | null;
    private startedAt: number = 0;
    private completed: boolean = false;

    private constructor(
        private readonly mode: LevelTransitionMode,
        private readonly level: number,
        private readonly score: number,
        private readonly nextLevel: number,
        completion: () => void,
    ) {
        this.completion = completion;
    }

    public static show(level: number, completion: () => void): void {
        LevelTransition.start(new LevelTransition("READY", level, 0, 0, completion));
    }

    public static showClear(level: number, score: number, nextLevel: number, completion: () => void): void {
        LevelTransition.start(new LevelTransition("CLEAR", level, score, nextLevel, completion));
    }

    public static cancel(): void {
        LevelTransition.active?.finish(false);
    }

    private static start(transition: LevelTransition): void {
        if (LevelTransition.active) LevelTransition.active.finish(false);
        LevelTransition.active = transition;
        try {
            transition.mount();
        } catch (error) {
            console.error("Level transition presentation failed.", error);
            transition.finish(true);
        }
    }

    private get durationMs(): number {
        return this.mode === "CLEAR" ? 1400 : 960;
    }

    private mount(): void {
        const stageWidth = Math.max(1, Number(Laya.stage?.width) || 1334);
        const stageHeight = Math.max(1, Number(Laya.stage?.height) || 750);
        const overlay = new Laya.Sprite();
        overlay.name = this.mode === "CLEAR" ? "WPH_LevelClearTransition" : "WPH_LevelReadyTransition";
        overlay.width = stageWidth;
        overlay.height = stageHeight;
        overlay.zOrder = 10005;
        overlay.mouseEnabled = true;
        overlay.mouseThrough = false;
        this.overlay = overlay;

        this.drawBackdrop(overlay, stageWidth, stageHeight);
        this.card = this.createCard(overlay, stageWidth, stageHeight);
        overlay.on(Laya.Event.MOUSE_DOWN, this, this.blockInput);
        overlay.on(Laya.Event.MOUSE_UP, this, this.blockInput);
        overlay.on(Laya.Event.CLICK, this, this.blockInput);
        Laya.stage.addChild(overlay);

        this.startedAt = this.readNow();
        this.update();
        Laya.timer.frameLoop(1, this, this.update);
    }

    private drawBackdrop(overlay: any, width: number, height: number): void {
        const graphics = overlay.graphics;
        graphics.drawRect(0, 0, width, height, "#030711");
        graphics.drawRect(0, 0, width, height, "#071426", "#35E9FF", 2);
        const gridSize = Math.max(54, Math.round(width / 18));
        for (let x = 0; x <= width; x += gridSize) graphics.drawLine(x, 0, x, height, "#0B2637", 1);
        for (let y = 0; y <= height; y += gridSize) graphics.drawLine(0, y, width, y, "#0B2034", 1);
        graphics.drawLine(width * 0.08, height * 0.17, width * 0.42, height * 0.17, "#35E9FF", 2);
        graphics.drawLine(width * 0.58, height * 0.83, width * 0.92, height * 0.83, "#715CFF", 2);
    }

    private createCard(overlay: any, width: number, height: number): any {
        const cardWidth = this.mode === "CLEAR" ? 620 : 520;
        const cardHeight = this.mode === "CLEAR" ? 350 : 240;
        const card = new Laya.Sprite();
        card.name = this.mode === "CLEAR" ? "WPH_LevelClearCard" : "WPH_LevelReadyCard";
        card.x = Math.round((width - cardWidth) / 2);
        card.y = Math.round((height - cardHeight) / 2);
        card.width = cardWidth;
        card.height = cardHeight;
        card.mouseEnabled = false;
        card.alpha = 0;
        card.scaleX = 0.92;
        card.scaleY = 0.92;
        card.graphics.drawPoly(
            0,
            0,
            [18, 0, cardWidth - 42, 0, cardWidth, 42, cardWidth, cardHeight - 18,
                cardWidth - 18, cardHeight, 42, cardHeight, 0, cardHeight - 42, 0, 18],
            "#06101E",
            "#35E9FF",
            2,
        );
        card.graphics.drawLine(42, 7, cardWidth * 0.5, 7, "#83F7FF", 3);
        card.graphics.drawLine(cardWidth * 0.5, 7, cardWidth - 88, 7, "#8B5CFF", 3);
        card.graphics.drawLine(42, cardHeight - 8, 190, cardHeight - 8, "#8B5CFF", 2);
        card.graphics.drawLine(cardWidth - 190, cardHeight - 8, cardWidth - 42, cardHeight - 8, "#35E9FF", 2);
        overlay.addChild(card);

        if (this.mode === "CLEAR") {
            this.addText(card, "LEVEL " + this.level + " CLEAR!", 45, "#F4FFFF", true, 28, 46, cardWidth - 56, 64);
            this.addText(card, "SCORE", 16, "#78D7E8", true, 28, 126, cardWidth - 56, 28);
            this.addText(card, this.score + " / 5", 38, "#83F7FF", true, 28, 153, cardWidth - 56, 55);
            this.addText(card, "NEXT: LEVEL " + this.nextLevel, 22, "#DCCFFF", true, 28, 242, cardWidth - 56, 40);
        } else {
            this.addText(card, "LEVEL " + this.level, 46, "#F4FFFF", true, 28, 48, cardWidth - 56, 64);
            this.addText(card, "GET READY", 23, "#83F7FF", true, 28, 132, cardWidth - 56, 40);
        }
        return card;
    }

    private addText(
        parent: any,
        text: string,
        fontSize: number,
        color: string,
        bold: boolean,
        x: number,
        y: number,
        width: number,
        height: number,
    ): void {
        const label = new Laya.Text();
        label.text = text;
        label.font = "Arial";
        label.fontSize = fontSize;
        label.color = color;
        label.bold = bold;
        label.x = x;
        label.y = y;
        label.width = width;
        label.height = height;
        label.align = "center";
        label.valign = "middle";
        label.mouseEnabled = false;
        parent.addChild(label);
    }

    private update(): void {
        const elapsed = Math.max(0, this.readNow() - this.startedAt);
        const entrance = Math.min(1, elapsed / 220);
        const eased = 1 - Math.pow(1 - entrance, 3);
        if (this.card) {
            this.card.alpha = eased;
            this.card.scaleX = 0.92 + eased * 0.08;
            this.card.scaleY = 0.92 + eased * 0.08;
        }

        const fadeStart = this.durationMs - 220;
        if (elapsed >= fadeStart && this.overlay) {
            this.overlay.alpha = Math.max(0, 1 - (elapsed - fadeStart) / 220);
        }
        if (elapsed >= this.durationMs) this.finish(true);
    }

    private readNow(): number {
        const timerValue = Number(Laya.timer?.currTimer);
        return Number.isFinite(timerValue) ? timerValue : Date.now();
    }

    private blockInput(event: any): void {
        if (event && typeof event.stopPropagation === "function") event.stopPropagation();
    }

    private finish(invokeCompletion: boolean): void {
        if (this.completed) return;
        this.completed = true;
        if (typeof Laya.timer?.clear === "function") Laya.timer.clear(this, this.update);
        if (this.overlay) {
            this.overlay.off(Laya.Event.MOUSE_DOWN, this, this.blockInput);
            this.overlay.off(Laya.Event.MOUSE_UP, this, this.blockInput);
            this.overlay.off(Laya.Event.CLICK, this, this.blockInput);
            this.overlay.removeSelf?.();
            this.overlay.destroy(true);
            this.overlay = null;
            this.card = null;
        }
        if (LevelTransition.active === this) LevelTransition.active = null;
        const completion = this.completion;
        this.completion = null;
        if (invokeCompletion && completion) completion();
    }
}
