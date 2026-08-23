declare var Laya: any;

interface StardustConfig {
    motionLayer: 1 | 2 | 3;
    x: number;
    y: number;
    radius: number;
    color: string;
    alpha: number;
    driftRange: number;
    phase: number;
}

// 背景管理器：负责深空渐变、确定性星尘与背景层级。
export class BackgroundManager {
    private static readonly width: number = 1334;
    private static readonly height: number = 750;
    private static readonly backgroundZOrder: number = -100;
    private static readonly gradientStepsPerSegment: number = 128;
    private static readonly farDriftPeriodMs: number = 5000;
    private static readonly nearDriftPeriodMs: number = 3500;
    private static readonly energyBreathPeriodMs: number = 4000;
    private static readonly energyMinAlpha: number = 0.10;
    private static readonly energyMaxAlpha: number = 0.45;
    private static readonly twoPi: number = Math.PI * 2;

    // 固定配置：3 层 × 6 个星尘，不使用运行时随机数。
    private static readonly stardustConfigs: ReadonlyArray<StardustConfig> = [
        // Layer 1：远景慢漂，6 个，±8px / 5000ms。
        { motionLayer: 1, x: 64, y: 76, radius: 1.0, color: "#DDF8FF", alpha: 0.12, driftRange: 8, phase: 0.20 },
        { motionLayer: 1, x: 152, y: 184, radius: 1.4, color: "#8FEAFF", alpha: 0.16, driftRange: 8, phase: 1.25 },
        { motionLayer: 1, x: 238, y: 42, radius: 0.9, color: "#D7DEFF", alpha: 0.21, driftRange: 8, phase: 2.30 },
        { motionLayer: 1, x: 334, y: 292, radius: 1.2, color: "#A9D8FF", alpha: 0.25, driftRange: 8, phase: 3.35 },
        { motionLayer: 1, x: 426, y: 118, radius: 1.6, color: "#C9F7FF", alpha: 0.30, driftRange: 8, phase: 4.40 },
        { motionLayer: 1, x: 518, y: 386, radius: 1.0, color: "#A9B8FF", alpha: 0.35, driftRange: 8, phase: 5.45 },

        // Layer 2：近层漂移，6 个，±8~13px / 3500ms。
        { motionLayer: 2, x: 612, y: 206, radius: 1.3, color: "#9CEFFF", alpha: 0.15, driftRange: 8, phase: 0.55 },
        { motionLayer: 2, x: 704, y: 64, radius: 0.8, color: "#E7F5FF", alpha: 0.20, driftRange: 9, phase: 1.60 },
        { motionLayer: 2, x: 798, y: 338, radius: 1.5, color: "#B8A9FF", alpha: 0.26, driftRange: 10, phase: 2.65 },
        { motionLayer: 2, x: 886, y: 166, radius: 1.1, color: "#BDEEFF", alpha: 0.31, driftRange: 11, phase: 3.70 },
        { motionLayer: 2, x: 978, y: 438, radius: 1.3, color: "#91DFFF", alpha: 0.37, driftRange: 12, phase: 4.75 },
        { motionLayer: 2, x: 1072, y: 92, radius: 1.0, color: "#D8E4FF", alpha: 0.38, driftRange: 13, phase: 5.80 },

        // Layer 3：固定能量节点，6 个，仅作 0.10→0.45→0.10 / 4000ms 呼吸。
        { motionLayer: 3, x: 1164, y: 276, radius: 1.6, color: "#B5F4FF", alpha: 0.10, driftRange: 0, phase: 0.00 },
        { motionLayer: 3, x: 1262, y: 144, radius: 0.9, color: "#C6CFFF", alpha: 0.10, driftRange: 0, phase: 1.05 },
        { motionLayer: 3, x: 118, y: 526, radius: 1.2, color: "#8DDFFF", alpha: 0.10, driftRange: 0, phase: 2.10 },
        { motionLayer: 3, x: 388, y: 646, radius: 1.0, color: "#BAC7FF", alpha: 0.10, driftRange: 0, phase: 3.15 },
        { motionLayer: 3, x: 746, y: 574, radius: 1.4, color: "#A1E9FF", alpha: 0.10, driftRange: 0, phase: 4.20 },
        { motionLayer: 3, x: 1128, y: 662, radius: 1.1, color: "#D9F8FF", alpha: 0.10, driftRange: 0, phase: 5.25 },
    ];

    private static stardustLayer: any = null;
    private static readonly stardustSprites: any[] = [];
    private static elapsedMilliseconds: number = 0;

    public static draw(sceneRoot: any): void {
        const scene2D = BackgroundManager.findScene2D(sceneRoot);

        if (!scene2D) {
            console.warn("BackgroundManager: Scene2D node not found.");
            return;
        }

        const background = scene2D.getChildByName("Background");
        if (!background) {
            console.warn("BackgroundManager: Background node not found under Scene2D.");
            return;
        }

        background.zOrder = BackgroundManager.backgroundZOrder;
        background.x = 0;
        background.y = 0;
        background.width = BackgroundManager.width;
        background.height = BackgroundManager.height;
        background.mouseEnabled = false;

        if (!background.graphics) {
            console.warn("BackgroundManager: Background node has no graphics object.");
            return;
        }

        background.graphics.clear();
        BackgroundManager.drawDeepSpaceGradient(background.graphics);
        BackgroundManager.ensureStardustLayer(background);
        BackgroundManager.startStardustAnimation();
    }

    private static findScene2D(sceneRoot: any): any {
        if (sceneRoot && sceneRoot.name === "Scene2D") {
            return sceneRoot;
        }

        if (sceneRoot && sceneRoot.getChildByName) {
            const scene2D = sceneRoot.getChildByName("Scene2D");
            if (scene2D) {
                return scene2D;
            }
        }

        if (sceneRoot && sceneRoot.scene && sceneRoot.scene.name === "Scene2D") {
            return sceneRoot.scene;
        }

        if (Laya.stage && Laya.stage.getChildByName) {
            return Laya.stage.getChildByName("Scene2D");
        }

        return null;
    }

    private static drawDeepSpaceGradient(graphics: any): void {
        const middleY = BackgroundManager.height * 0.5;

        // 每段用 128 个带 alpha 的窄条插值，避免少量纯色条带造成明显断层。
        graphics.drawRect(0, 0, BackgroundManager.width, BackgroundManager.height, "#030712");
        BackgroundManager.drawGradientSegment(graphics, 0, middleY, "#061324", 6, 19, 36);

        graphics.drawRect(0, middleY, BackgroundManager.width, BackgroundManager.height - middleY, "#061324");
        BackgroundManager.drawGradientSegment(graphics, middleY, BackgroundManager.height, "#091C30", 9, 28, 48);
    }

    private static drawGradientSegment(
        graphics: any,
        startY: number,
        endY: number,
        targetColor: string,
        targetRed: number,
        targetGreen: number,
        targetBlue: number,
    ): void {
        const steps = BackgroundManager.gradientStepsPerSegment;
        const segmentHeight = endY - startY;

        for (let index = 0; index < steps; index++) {
            const progress = index / (steps - 1);
            const y = startY + segmentHeight * index / steps;
            const nextY = startY + segmentHeight * (index + 1) / steps;
            const fill = index === steps - 1
                ? targetColor
                : `rgba(${targetRed},${targetGreen},${targetBlue},${progress.toFixed(4)})`;
            graphics.drawRect(0, y, BackgroundManager.width, nextY - y + 0.5, fill);
        }
    }

    private static ensureStardustLayer(background: any): void {
        if (!BackgroundManager.stardustLayer) {
            const layer = new Laya.Sprite();
            layer.name = "WP_F_StardustLayer";
            layer.width = BackgroundManager.width;
            layer.height = BackgroundManager.height;
            layer.zOrder = 1;
            layer.mouseEnabled = false;

            for (let index = 0; index < BackgroundManager.stardustConfigs.length; index++) {
                const config = BackgroundManager.stardustConfigs[index];
                const star = new Laya.Sprite();
                star.name = `WP_F_Stardust_${index + 1}`;
                star.mouseEnabled = false;
                star.graphics.drawCircle(0, 0, config.radius * 2.2, "#164A68");
                star.graphics.drawCircle(0, 0, config.radius, config.color);
                layer.addChild(star);
                BackgroundManager.stardustSprites.push(star);
            }

            BackgroundManager.stardustLayer = layer;
        }

        const layer = BackgroundManager.stardustLayer;
        layer.zOrder = 1;
        if (layer.parent !== background) {
            if (layer.parent && typeof layer.removeSelf === "function") {
                layer.removeSelf();
            }
            background.addChild(layer);
        }
    }

    private static startStardustAnimation(): void {
        BackgroundManager.elapsedMilliseconds = 0;
        BackgroundManager.applyStardustFrame();
        Laya.timer.clear(BackgroundManager, BackgroundManager.updateStardust);
        Laya.timer.frameLoop(1, BackgroundManager, BackgroundManager.updateStardust);
    }

    private static updateStardust(): void {
        if (!BackgroundManager.stardustLayer || !BackgroundManager.stardustLayer.parent) {
            Laya.timer.clear(BackgroundManager, BackgroundManager.updateStardust);
            return;
        }

        const rawDelta = Number(Laya.timer.delta);
        const deltaMilliseconds = Number.isFinite(rawDelta) && rawDelta > 0
            ? Math.min(rawDelta, 50)
            : 16.6667;
        BackgroundManager.elapsedMilliseconds += deltaMilliseconds;
        BackgroundManager.applyStardustFrame();
    }

    private static applyStardustFrame(): void {
        const time = BackgroundManager.elapsedMilliseconds;

        for (let index = 0; index < BackgroundManager.stardustConfigs.length; index++) {
            const config = BackgroundManager.stardustConfigs[index];
            const star = BackgroundManager.stardustSprites[index];

            star.x = config.x;
            if (config.motionLayer === 3) {
                const breathProgress = (time / BackgroundManager.energyBreathPeriodMs) * BackgroundManager.twoPi;
                const breathWave = 0.5 - 0.5 * Math.cos(config.phase + breathProgress);
                star.y = config.y;
                star.alpha = BackgroundManager.energyMinAlpha
                    + (BackgroundManager.energyMaxAlpha - BackgroundManager.energyMinAlpha) * breathWave;
                continue;
            }

            const driftPeriod = config.motionLayer === 1
                ? BackgroundManager.farDriftPeriodMs
                : BackgroundManager.nearDriftPeriodMs;
            const driftProgress = (time / driftPeriod) * BackgroundManager.twoPi;
            star.y = config.y + Math.sin(config.phase + driftProgress) * config.driftRange;
            star.alpha = config.alpha;
        }
    }
}
