declare const Laya: any;

export class LevelTransition {
    private static active: LevelTransition | null = null;
    private readonly durationMs: number = 960;
    private readonly progressMs: number = 700;
    private readonly readyHoldMs: number = 140;
    private overlay: any = null;
    private progressRing: any = null;
    private scanner: any = null;
    private percentText: any = null;
    private statusText: any = null;
    private completion: (() => void) | null;
    private startedAt: number = 0;
    private completed: boolean = false;

    private constructor(private readonly level: number, completion: () => void) {
        this.completion = completion;
    }

    public static show(level: number, completion: () => void): void {
        if (LevelTransition.active) {
            LevelTransition.active.finish();
        }

        const transition = new LevelTransition(level, completion);
        LevelTransition.active = transition;
        try {
            transition.mount();
        } catch (error) {
            console.error("Level transition presentation failed.", error);
            transition.finish();
        }
    }

    private mount(): void {
        const stageWidth = Math.max(1, Laya.stage.width || 1280);
        const stageHeight = Math.max(1, Laya.stage.height || 720);
        const overlay = new Laya.Sprite();
        overlay.name = "WPALevelTransition";
        overlay.width = stageWidth;
        overlay.height = stageHeight;
        overlay.zOrder = 10005;
        overlay.mouseEnabled = true;
        overlay.mouseThrough = false;
        this.overlay = overlay;

        this.drawBackdrop(overlay, stageWidth, stageHeight);
        this.createTitle(overlay, stageWidth, stageHeight);
        this.createSystemRing(overlay, stageWidth, stageHeight);

        overlay.on(Laya.Event.MOUSE_DOWN, this, this.blockInput);
        overlay.on(Laya.Event.MOUSE_UP, this, this.blockInput);
        overlay.on(Laya.Event.CLICK, this, this.blockInput);
        Laya.stage.addChild(overlay);

        this.startedAt = typeof Laya.timer?.currTimer === "number" ? Laya.timer.currTimer : Date.now();
        this.renderProgress(0, 0);
        Laya.timer.frameLoop(1, this, this.update);
    }

    private drawBackdrop(overlay: any, width: number, height: number): void {
        const graphics = overlay.graphics;
        graphics.drawRect(0, 0, width, height, "#030711");
        graphics.drawRect(0, 0, width, height, "#071426", "#35E9FF", 2);

        const gridSize = Math.max(48, Math.round(width / 18));
        for (let x = 0; x <= width; x += gridSize) {
            graphics.drawLine(x, 0, x, height, "#0B2637", 1);
        }
        for (let y = 0; y <= height; y += gridSize) {
            graphics.drawLine(0, y, width, y, "#0B2034", 1);
        }

        graphics.drawLine(width * 0.08, height * 0.17, width * 0.46, height * 0.17, "#35E9FF", 2);
        graphics.drawLine(width * 0.54, height * 0.83, width * 0.92, height * 0.83, "#715CFF", 2);
        graphics.drawLine(width * 0.08, height * 0.19, width * 0.26, height * 0.19, "#183F56", 1);
        graphics.drawLine(width * 0.74, height * 0.81, width * 0.92, height * 0.81, "#183F56", 1);
        graphics.drawPoly(width * 0.06, height * 0.11, [0, 0, 120, 0, 104, 12, 0, 12], "#0A3248", "#35E9FF", 1);
        graphics.drawPoly(width * 0.82, height * 0.88, [16, 0, 120, 0, 120, 12, 0, 12], "#211A4C", "#715CFF", 1);

        for (let i = 0; i < 7; i++) {
            const lineY = height * 0.3 + i * 22;
            const length = 28 + ((i * 31) % 84);
            graphics.drawLine(width * 0.08, lineY, width * 0.08 + length, lineY, i % 2 ? "#17405C" : "#206B7B", 2);
        }
    }

    private createTitle(overlay: any, width: number, height: number): void {
        const levelText = new Laya.Text();
        levelText.text = "LEVEL " + ("0" + this.level).slice(-2);
        levelText.fontSize = Math.max(42, Math.round(height * 0.075));
        levelText.bold = true;
        levelText.color = "#DFFFFF";
        levelText.width = width * 0.6;
        levelText.height = 80;
        levelText.x = width * 0.12;
        levelText.y = height * 0.28;
        levelText.align = "left";
        overlay.addChild(levelText);

        const subtitle = new Laya.Text();
        subtitle.text = "SYSTEM INITIALIZING";
        subtitle.fontSize = Math.max(18, Math.round(height * 0.03));
        subtitle.bold = true;
        subtitle.color = "#6DEEFF";
        subtitle.width = width * 0.58;
        subtitle.height = 42;
        subtitle.x = width * 0.12;
        subtitle.y = height * 0.42;
        subtitle.align = "left";
        overlay.addChild(subtitle);

        const protocol = new Laya.Text();
        protocol.text = "// SYNCHRONIZING PLAYFIELD VISUAL MATRIX";
        protocol.fontSize = 13;
        protocol.color = "#476C82";
        protocol.width = width * 0.56;
        protocol.height = 28;
        protocol.x = width * 0.12;
        protocol.y = height * 0.49;
        overlay.addChild(protocol);
    }

    private createSystemRing(overlay: any, width: number, height: number): void {
        const ringX = width * 0.76;
        const ringY = height * 0.63;
        const radius = Math.max(64, Math.min(104, height * 0.13));

        const ringBase = new Laya.Sprite();
        ringBase.x = ringX;
        ringBase.y = ringY;
        ringBase.mouseEnabled = false;
        ringBase.graphics.drawCircle(0, 0, radius, "#071826", "#225168", 2);
        ringBase.graphics.drawCircle(0, 0, radius - 12, "#050D19", "#715CFF", 1);
        ringBase.graphics.drawLine(-radius - 20, 0, -radius + 2, 0, "#35E9FF", 2);
        ringBase.graphics.drawLine(radius - 2, 0, radius + 20, 0, "#35E9FF", 2);
        ringBase.graphics.drawLine(0, -radius - 20, 0, -radius + 2, "#715CFF", 2);
        ringBase.graphics.drawLine(0, radius - 2, 0, radius + 20, "#715CFF", 2);
        overlay.addChild(ringBase);

        this.progressRing = new Laya.Sprite();
        this.progressRing.x = ringX;
        this.progressRing.y = ringY;
        this.progressRing.mouseEnabled = false;
        overlay.addChild(this.progressRing);

        this.scanner = new Laya.Sprite();
        this.scanner.x = ringX;
        this.scanner.y = ringY;
        this.scanner.mouseEnabled = false;
        this.scanner.graphics.drawLine(0, 0, 0, -radius + 18, "#8FFBFF", 2);
        this.scanner.graphics.drawCircle(0, -radius + 18, 4, "#E8FFFF");
        overlay.addChild(this.scanner);

        this.percentText = new Laya.Text();
        this.percentText.fontSize = 30;
        this.percentText.bold = true;
        this.percentText.color = "#E4FFFF";
        this.percentText.width = radius * 2;
        this.percentText.height = 44;
        this.percentText.x = ringX - radius;
        this.percentText.y = ringY - 25;
        this.percentText.align = "center";
        overlay.addChild(this.percentText);

        this.statusText = new Laya.Text();
        this.statusText.fontSize = 15;
        this.statusText.bold = true;
        this.statusText.color = "#6DEEFF";
        this.statusText.width = radius * 2.6;
        this.statusText.height = 30;
        this.statusText.x = ringX - radius * 1.3;
        this.statusText.y = ringY + radius + 28;
        this.statusText.align = "center";
        overlay.addChild(this.statusText);
    }

    private update(): void {
        const now = typeof Laya.timer?.currTimer === "number" ? Laya.timer.currTimer : Date.now();
        const elapsed = Math.max(0, now - this.startedAt);
        const progress = Math.min(1, elapsed / this.progressMs);
        this.renderProgress(progress, elapsed);

        const fadeStart = this.progressMs + this.readyHoldMs;
        if (elapsed >= fadeStart && this.overlay) {
            this.overlay.alpha = Math.max(0, 1 - (elapsed - fadeStart) / (this.durationMs - fadeStart));
        }
        if (elapsed >= this.durationMs) {
            this.finish();
        }
    }

    private renderProgress(progress: number, elapsed: number): void {
        if (!this.progressRing || !this.percentText || !this.statusText || !this.scanner) return;

        const percent = Math.min(100, Math.floor(progress * 100));
        const radius = Math.max(64, Math.min(104, (Laya.stage.height || 720) * 0.13));
        const segments = 40;
        const activeSegments = Math.round(progress * segments);
        const graphics = this.progressRing.graphics;
        graphics.clear();
        for (let i = 0; i < segments; i++) {
            const angle = -Math.PI / 2 + i / segments * Math.PI * 2;
            const inner = radius - 7;
            const outer = radius + (i % 5 === 0 ? 5 : 1);
            const color = i < activeSegments ? (i % 3 === 0 ? "#A878FF" : "#35E9FF") : "#16364A";
            graphics.drawLine(
                Math.cos(angle) * inner,
                Math.sin(angle) * inner,
                Math.cos(angle) * outer,
                Math.sin(angle) * outer,
                color,
                i < activeSegments ? 3 : 1,
            );
        }

        this.scanner.rotation = (elapsed * 0.42) % 360;
        this.percentText.text = (percent < 10 ? "0" : "") + percent + "%";
        const ready = percent >= 100;
        this.percentText.color = ready ? "#FFFFFF" : "#E4FFFF";
        this.statusText.text = ready ? "SYSTEM READY" : "SYSTEM";
        this.statusText.color = ready ? "#FF5FB2" : "#6DEEFF";
    }

    private blockInput(event: any): void {
        if (event && typeof event.stopPropagation === "function") {
            event.stopPropagation();
        }
    }

    private finish(): void {
        if (this.completed) return;
        this.completed = true;
        if (typeof Laya.timer?.clear === "function") {
            Laya.timer.clear(this, this.update);
        }

        if (this.overlay) {
            this.overlay.off(Laya.Event.MOUSE_DOWN, this, this.blockInput);
            this.overlay.off(Laya.Event.MOUSE_UP, this, this.blockInput);
            this.overlay.off(Laya.Event.CLICK, this, this.blockInput);
            if (typeof this.overlay.removeSelf === "function") {
                this.overlay.removeSelf();
            }
            this.overlay.destroy(true);
            this.overlay = null;
        }

        if (LevelTransition.active === this) {
            LevelTransition.active = null;
        }
        const completion = this.completion;
        this.completion = null;
        if (completion) {
            completion();
        }
    }
}
