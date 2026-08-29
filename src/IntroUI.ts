declare var Laya: any;

interface IntroKeycapVisual {
    root: any;
    face: any;
    glow: any;
    label: any;
    tier: "PRIMARY" | "ALTERNATE" | "UTILITY";
    pressed: boolean;
    releaseUntil: number;
}

interface IntroCoverParticle {
    node: any;
    kind: "DUST" | "FRAGMENT" | "MOTE";
    x: number;
    y: number;
    velocityX: number;
    velocityY: number;
    phase: number;
    orbitRadius: number;
    orbitSpeed: number;
}

interface IntroCoverTrackingMarker {
    node: any;
    originX: number;
    originY: number;
    axis: "X" | "Y";
    amplitude: number;
    phase: number;
    speed: number;
}

export class IntroUI {
    private static readonly COVER: "COVER" = "COVER";
    private static readonly MAIN_MENU: "MAIN_MENU" = "MAIN_MENU";
    private static readonly HOW_TO_PLAY: "HOW_TO_PLAY" = "HOW_TO_PLAY";
    private static readonly PANEL_WIDTH: number = 900;
    private static readonly PANEL_HEIGHT: number = 580;
    private static readonly KEY_RELEASE_DECAY_MS: number = 190;
    private static readonly COVER_MENU_GUARD_MS: number = 450;

    private static view: "COVER" | "MAIN_MENU" | "HOW_TO_PLAY" = IntroUI.COVER;
    private static selectedIndex: 0 | 1 = 0;
    private static started: boolean = false;
    private static mobileTouchSession: boolean = false;
    private static keyboardBound: boolean = false;
    private static startHandler: (() => void) | null = null;
    private static container: any = null;
    private static overlay: any = null;
    private static panel: any = null;
    private static coverRoot: any = null;
    private static coverDismissed: boolean = false;
    private static coverEnterReleaseRequired: boolean = false;
    private static mainMenuActivationGuarded: boolean = false;
    private static coverParticleRoot: any = null;
    private static coverParticles: IntroCoverParticle[] = [];
    private static coverCoreRoot: any = null;
    private static coverHeroBallRoot: any = null;
    private static coverOuterTickRing: any = null;
    private static coverInnerArcRing: any = null;
    private static coverTrackingRoot: any = null;
    private static coverTrackingMarkers: IntroCoverTrackingMarker[] = [];
    private static coverMotionElapsedSeconds: number = 0;
    private static coverMotionLoopActive: boolean = false;
    private static viewRoot: any = null;
    private static menuItems: any[] = [];
    private static boundItems: any[] = [];
    private static keycaps: { [key: string]: IntroKeycapVisual } = {};
    private static keyFeedbackLoopActive: boolean = false;

    public static show(onStart: () => void, mobileTouchSession: boolean = false): void {
        if (IntroUI.started || IntroUI.container) {
            return;
        }

        IntroUI.startHandler = onStart;
        IntroUI.mobileTouchSession = mobileTouchSession;
        IntroUI.view = IntroUI.COVER;
        IntroUI.selectedIndex = 0;
        IntroUI.resetCoverState();
        IntroUI.createShell();
        IntroUI.renderCover();
        IntroUI.bindKeyboard();
    }

    private static createShell(): void {
        const container = new Laya.Sprite();
        const panelWidth = IntroUI.PANEL_WIDTH;
        const panelHeight = IntroUI.PANEL_HEIGHT;

        container.zOrder = 10001;

        const overlay = new Laya.Sprite();
        overlay.mouseEnabled = false;
        overlay.graphics.drawRect(
            0,
            0,
            Laya.stage.width,
            Laya.stage.height,
            "#02050C"
        );
        overlay.alpha = 0.78;
        container.addChild(overlay);

        const panel = new Laya.Sprite();
        panel.width = panelWidth;
        panel.height = panelHeight;
        panel.x = (Laya.stage.width - panelWidth) / 2;
        panel.y = (Laya.stage.height - panelHeight) / 2;

        const backing = new Laya.Sprite();
        backing.alpha = 0.92;
        backing.graphics.drawPoly(
            0,
            0,
            IntroUI.cutCornerPoints(panelWidth, panelHeight, 18),
            "#07101F",
            "#0EA5E9",
            2
        );
        panel.addChild(backing);

        const innerFrame = new Laya.Sprite();
        innerFrame.graphics.drawPoly(
            0,
            0,
            IntroUI.cutCornerPoints(panelWidth - 20, panelHeight - 20, 13),
            null,
            "#1E3A5F",
            1
        );
        innerFrame.x = 10;
        innerFrame.y = 10;
        panel.addChild(innerFrame);

        const topRail = new Laya.Sprite();
        topRail.graphics.drawRect(28, 0, panelWidth - 56, 5, "#22D3EE");
        topRail.graphics.drawRect(350, 5, 200, 2, "#8B5CF6");
        topRail.alpha = 0.9;
        panel.addChild(topRail);

        const cornerMarks = new Laya.Sprite();
        cornerMarks.graphics.drawLine(22, 24, 66, 24, "#38BDF8", 2);
        cornerMarks.graphics.drawLine(22, 24, 22, 55, "#38BDF8", 2);
        cornerMarks.graphics.drawLine(panelWidth - 22, panelHeight - 24, panelWidth - 66, panelHeight - 24, "#8B5CF6", 2);
        cornerMarks.graphics.drawLine(panelWidth - 22, panelHeight - 24, panelWidth - 22, panelHeight - 55, "#8B5CF6", 2);
        cornerMarks.alpha = 0.75;
        panel.addChild(cornerMarks);

        container.addChild(panel);
        Laya.stage.addChild(container);

        IntroUI.container = container;
        IntroUI.overlay = overlay;
        IntroUI.panel = panel;
    }

    private static renderCover(): void {
        IntroUI.clearView();
        IntroUI.clearCoverRoot();

        IntroUI.view = IntroUI.COVER;
        IntroUI.coverDismissed = false;
        IntroUI.coverEnterReleaseRequired = false;
        IntroUI.mainMenuActivationGuarded = false;
        if (IntroUI.overlay) {
            IntroUI.overlay.alpha = 0.84;
        }
        if (IntroUI.panel) {
            IntroUI.panel.visible = false;
        }

        const stageWidth = Laya.stage.width;
        const stageHeight = Laya.stage.height;
        const coverRoot = new Laya.Sprite();
        coverRoot.width = stageWidth;
        coverRoot.height = stageHeight;
        coverRoot.mouseEnabled = true;
        coverRoot.mouseThrough = false;
        coverRoot.graphics.drawRect(0, 0, stageWidth, stageHeight, "#020713");

        const atmosphere = new Laya.Sprite();
        atmosphere.mouseEnabled = false;

        const coreGlow = new Laya.Sprite();
        coreGlow.graphics.drawCircle(stageWidth / 2, 390, 238, "#07162A");
        coreGlow.graphics.drawCircle(stageWidth / 2, 390, 178, "#0A2039");
        coreGlow.alpha = 0.58;
        atmosphere.addChild(coreGlow);

        const grid = new Laya.Sprite();
        for (let x = 82; x < stageWidth; x += 84) {
            grid.graphics.drawLine(x, 0, x, stageHeight, "#0B1B2D", 1);
        }
        for (let y = 75; y < stageHeight; y += 75) {
            grid.graphics.drawLine(0, y, stageWidth, y, "#0B1B2D", 1);
        }
        grid.alpha = 0.32;
        atmosphere.addChild(grid);

        const vignette = new Laya.Sprite();
        vignette.graphics.drawRect(0, 0, stageWidth, 30, "#01040B");
        vignette.graphics.drawRect(0, stageHeight - 30, stageWidth, 30, "#01040B");
        vignette.graphics.drawRect(0, 30, 34, stageHeight - 60, "#01040B");
        vignette.graphics.drawRect(stageWidth - 34, 30, 34, stageHeight - 60, "#01040B");
        vignette.alpha = 0.82;
        atmosphere.addChild(vignette);

        coverRoot.addChild(atmosphere);

        const particleRoot = IntroUI.createCoverParticleField(stageWidth, stageHeight);
        coverRoot.addChild(particleRoot);

        const trackingFrame = IntroUI.createCoverTrackingFrame(stageWidth, stageHeight);
        coverRoot.addChild(trackingFrame);

        const topRail = new Laya.Sprite();
        topRail.graphics.drawRect(120, 54, stageWidth - 240, 1, "#164E63");
        topRail.graphics.drawRect(stageWidth / 2 - 88, 52, 176, 3, "#22D3EE");
        topRail.alpha = 0.72;
        coverRoot.addChild(topRail);

        const leftReadout = IntroUI.createText("SYS://TITLE_INTERFACE", 12, "#35627A", true);
        leftReadout.x = 126;
        leftReadout.y = 70;
        leftReadout.width = 300;
        leftReadout.height = 18;
        coverRoot.addChild(leftReadout);

        const rightReadout = IntroUI.createText("SIMULATION NODE 01", 12, "#4C3F78", true);
        rightReadout.align = "right";
        rightReadout.x = stageWidth - 426;
        rightReadout.y = 70;
        rightReadout.width = 300;
        rightReadout.height = 18;
        coverRoot.addChild(rightReadout);

        const titleGlow = IntroUI.createText("BALL GAME", 82, "#22D3EE", true);
        titleGlow.align = "center";
        titleGlow.valign = "middle";
        titleGlow.x = 0;
        titleGlow.y = 104;
        titleGlow.width = stageWidth;
        titleGlow.height = 104;
        titleGlow.alpha = 0.2;
        coverRoot.addChild(titleGlow);

        const title = IntroUI.createText("BALL GAME", 82, "#F8FAFC", true);
        title.align = "center";
        title.valign = "middle";
        title.x = 0;
        title.y = 99;
        title.width = stageWidth;
        title.height = 104;
        coverRoot.addChild(title);

        const subtitle = IntroUI.createText("CYBER CORE TRIAL", 22, "#A78BFA", true);
        subtitle.align = "center";
        subtitle.valign = "middle";
        subtitle.x = 0;
        subtitle.y = 205;
        subtitle.width = stageWidth;
        subtitle.height = 32;
        coverRoot.addChild(subtitle);

        const core = IntroUI.createCoverCore();
        core.x = stageWidth / 2;
        core.y = 390;
        coverRoot.addChild(core);

        const status = IntroUI.createText("SYSTEM READY", 15, "#22D3EE", true);
        status.align = "center";
        status.x = 0;
        status.y = 574;
        status.width = stageWidth;
        status.height = 22;
        coverRoot.addChild(status);

        const prompt = IntroUI.createText(
            IntroUI.mobileTouchSession
                ? "TAP ANYWHERE TO CONTINUE"
                : "CLICK / TAP ANYWHERE OR PRESS [ ENTER ] TO CONTINUE",
            18,
            "#E2E8F0",
            true
        );
        prompt.align = "center";
        prompt.valign = "middle";
        prompt.x = 120;
        prompt.y = 605;
        prompt.width = stageWidth - 240;
        prompt.height = 30;
        coverRoot.addChild(prompt);

        const bottomRail = new Laya.Sprite();
        bottomRail.graphics.drawRect(210, 0, stageWidth - 420, 1, "#1E3A5F");
        bottomRail.graphics.drawRect(stageWidth / 2 - 48, -1, 96, 3, "#8B5CF6");
        bottomRail.y = 660;
        bottomRail.alpha = 0.68;
        coverRoot.addChild(bottomRail);

        coverRoot.on(Laya.Event.CLICK, IntroUI, IntroUI.onCoverClick);
        IntroUI.container.addChild(coverRoot);
        IntroUI.coverRoot = coverRoot;
        IntroUI.startCoverMotionLoop();
    }

    private static createCoverParticleField(stageWidth: number, stageHeight: number): any {
        const root = new Laya.Sprite();
        root.mouseEnabled = false;
        IntroUI.coverParticles = [];

        for (let index = 0; index < 20; index++) {
            const node = new Laya.Sprite();
            const radius = 1.5 + (index % 3) * 0.5;
            node.graphics.drawCircle(0, 0, radius, index % 5 === 0 ? "#8B5CF6" : "#38BDF8");
            node.alpha = 0.22 + (index % 5) * 0.045;
            const x = 42 + ((index * 181) % (stageWidth - 84));
            const y = 36 + ((index * 109) % (stageHeight - 72));
            node.x = x;
            node.y = y;
            root.addChild(node);
            IntroUI.coverParticles.push({
                node,
                kind: "DUST",
                x,
                y,
                velocityX: -2.4 + (index % 5) * 1.2,
                velocityY: 4 + (index % 4),
                phase: 0,
                orbitRadius: 0,
                orbitSpeed: 0
            });
        }

        for (let index = 0; index < 8; index++) {
            const node = new Laya.Sprite();
            const width = 4 + (index % 3) * 2;
            node.graphics.drawRect(0, 0, width, 2, index % 3 === 0 ? "#7C3AED" : "#0EA5E9");
            node.alpha = 0.28 + (index % 3) * 0.09;
            const x = 78 + ((index * 257) % (stageWidth - 156));
            const y = 58 + ((index * 137) % (stageHeight - 116));
            node.x = x;
            node.y = y;
            root.addChild(node);
            IntroUI.coverParticles.push({
                node,
                kind: "FRAGMENT",
                x,
                y,
                velocityX: 3 + (index % 4),
                velocityY: 5.5 + (index % 3) * 1.5,
                phase: 0,
                orbitRadius: 0,
                orbitSpeed: 0
            });
        }

        for (let index = 0; index < 4; index++) {
            const node = new Laya.Sprite();
            const radius = 2.5 + index * 0.5;
            const color = index % 2 === 0 ? "#67E8F9" : "#A78BFA";
            node.graphics.drawCircle(0, 0, radius + 2, null, color, 1);
            node.graphics.drawCircle(0, 0, radius, color);
            node.alpha = 0.52 + index * 0.06;
            const phase = (Math.PI * 2 * index) / 4;
            const orbitRadius = 128 + (index % 2) * 22;
            const x = stageWidth / 2 + Math.cos(phase) * orbitRadius;
            const y = 390 + Math.sin(phase) * orbitRadius * 0.62;
            node.x = x;
            node.y = y;
            root.addChild(node);
            IntroUI.coverParticles.push({
                node,
                kind: "MOTE",
                x,
                y,
                velocityX: 0,
                velocityY: 0,
                phase,
                orbitRadius,
                orbitSpeed: 0.075 + index * 0.012
            });
        }

        IntroUI.coverParticleRoot = root;
        return root;
    }

    private static createCoverTrackingFrame(stageWidth: number, stageHeight: number): any {
        const root = new Laya.Sprite();
        root.mouseEnabled = false;
        IntroUI.coverTrackingMarkers = [];

        const addMarker = (
            x: number,
            y: number,
            horizontalDirection: number,
            verticalDirection: number,
            color: string,
            axis: "X" | "Y",
            phase: number,
            speed: number
        ): void => {
            const node = new Laya.Sprite();
            node.mouseEnabled = false;
            node.graphics.drawLine(0, 0, horizontalDirection * 11, 0, color, 1.5);
            node.graphics.drawLine(horizontalDirection * 17, 0, horizontalDirection * 34, 0, color, 1.5);
            node.graphics.drawLine(0, 0, 0, verticalDirection * 13, color, 1.5);
            node.graphics.drawCircle(horizontalDirection * 40, 0, 1.5, color);
            node.alpha = 0.42;
            node.x = x;
            node.y = y;
            root.addChild(node);
            IntroUI.coverTrackingMarkers.push({
                node,
                originX: x,
                originY: y,
                axis,
                amplitude: 2.5,
                phase,
                speed
            });
        };

        addMarker(88, 142, 1, 1, "#38BDF8", "X", 0.2, 0.34);
        addMarker(stageWidth - 88, 142, -1, 1, "#8B5CF6", "Y", 1.7, 0.29);
        addMarker(88, stageHeight - 116, 1, -1, "#8B5CF6", "Y", 3.1, 0.31);
        addMarker(stageWidth - 88, stageHeight - 116, -1, -1, "#38BDF8", "X", 4.6, 0.27);

        IntroUI.coverTrackingRoot = root;
        return root;
    }

    private static startCoverMotionLoop(): void {
        if (
            IntroUI.coverMotionLoopActive ||
            !IntroUI.coverParticleRoot ||
            !IntroUI.coverCoreRoot
        ) {
            return;
        }
        Laya.timer.frameLoop(1, IntroUI, IntroUI.updateCoverMotion);
        IntroUI.coverMotionLoopActive = true;
    }

    private static updateCoverMotion(): void {
        if (
            IntroUI.view !== IntroUI.COVER ||
            !IntroUI.coverParticleRoot ||
            !IntroUI.coverCoreRoot
        ) {
            IntroUI.stopCoverMotionLoop();
            return;
        }

        const rawDelta = Number(Laya.timer?.delta);
        const deltaSeconds = (Number.isFinite(rawDelta) ? Math.min(Math.max(rawDelta, 0), 50) : 16.67) / 1000;
        const stageWidth = Laya.stage.width;
        const stageHeight = Laya.stage.height;
        IntroUI.coverMotionElapsedSeconds += deltaSeconds;

        for (const particle of IntroUI.coverParticles) {
            if (particle.kind === "MOTE") {
                particle.phase += particle.orbitSpeed * deltaSeconds;
                particle.x = stageWidth / 2 + Math.cos(particle.phase) * particle.orbitRadius;
                particle.y = 390 + Math.sin(particle.phase) * particle.orbitRadius * 0.62;
            } else {
                particle.x += particle.velocityX * deltaSeconds;
                particle.y += particle.velocityY * deltaSeconds;
                if (particle.y > stageHeight + 8) particle.y = -8;
                if (particle.x > stageWidth + 8) particle.x = -8;
                if (particle.x < -8) particle.x = stageWidth + 8;
            }
            particle.node.x = particle.x;
            particle.node.y = particle.y;
        }

        if (IntroUI.coverOuterTickRing) {
            IntroUI.coverOuterTickRing.rotation =
                (IntroUI.coverOuterTickRing.rotation + 2.4 * deltaSeconds) % 360;
        }
        if (IntroUI.coverInnerArcRing) {
            IntroUI.coverInnerArcRing.rotation =
                (IntroUI.coverInnerArcRing.rotation - 1.25 * deltaSeconds + 360) % 360;
        }

        for (const marker of IntroUI.coverTrackingMarkers) {
            const offset = Math.sin(
                IntroUI.coverMotionElapsedSeconds * marker.speed + marker.phase
            ) * marker.amplitude;
            marker.node.x = marker.originX + (marker.axis === "X" ? offset : 0);
            marker.node.y = marker.originY + (marker.axis === "Y" ? offset : 0);
        }
    }

    private static stopCoverMotionLoop(): void {
        if (!IntroUI.coverMotionLoopActive) {
            return;
        }
        Laya.timer.clear(IntroUI, IntroUI.updateCoverMotion);
        IntroUI.coverMotionLoopActive = false;
    }

    private static clearCoverParticles(): void {
        IntroUI.coverParticles = [];
        if (IntroUI.coverParticleRoot) {
            IntroUI.coverParticleRoot.removeSelf();
            IntroUI.coverParticleRoot.destroy(true);
            IntroUI.coverParticleRoot = null;
        }
    }

    private static clearCoverMotionVisuals(): void {
        IntroUI.stopCoverMotionLoop();
        IntroUI.clearCoverParticles();

        if (IntroUI.coverCoreRoot) {
            IntroUI.coverCoreRoot.removeSelf();
            IntroUI.coverCoreRoot.destroy(true);
        }
        if (IntroUI.coverTrackingRoot) {
            IntroUI.coverTrackingRoot.removeSelf();
            IntroUI.coverTrackingRoot.destroy(true);
        }

        IntroUI.coverCoreRoot = null;
        IntroUI.coverHeroBallRoot = null;
        IntroUI.coverOuterTickRing = null;
        IntroUI.coverInnerArcRing = null;
        IntroUI.coverTrackingRoot = null;
        IntroUI.coverTrackingMarkers = [];
        IntroUI.coverMotionElapsedSeconds = 0;
    }

    private static createCoverCore(): any {
        const core = new Laya.Sprite();
        core.mouseEnabled = false;

        const outerTickRing = new Laya.Sprite();
        outerTickRing.mouseEnabled = false;
        const tickCount = 24;
        for (let index = 0; index < tickCount; index++) {
            const angle = (Math.PI * 2 * index) / tickCount;
            const innerRadius = index % 3 === 0 ? 101 : 106;
            const outerRadius = index % 3 === 0 ? 121 : 116;
            const color = index % 6 === 0 ? "#A78BFA" : "#38BDF8";
            outerTickRing.graphics.drawLine(
                Math.cos(angle) * innerRadius,
                Math.sin(angle) * innerRadius,
                Math.cos(angle) * outerRadius,
                Math.sin(angle) * outerRadius,
                color,
                index % 3 === 0 ? 2 : 1.5
            );
        }
        core.addChild(outerTickRing);

        const innerArcRing = new Laya.Sprite();
        innerArcRing.mouseEnabled = false;
        IntroUI.drawCoverArc(innerArcRing.graphics, 76, 14, 68, "#38BDF8", 1.5, 8);
        IntroUI.drawCoverArc(innerArcRing.graphics, 76, 104, 146, "#6D5AA8", 2, 7);
        IntroUI.drawCoverArc(innerArcRing.graphics, 76, 205, 284, "#8B5CF6", 2, 11);
        IntroUI.drawCoverArc(innerArcRing.graphics, 76, 319, 346, "#38BDF8", 1.5, 5);
        innerArcRing.alpha = 0.78;
        core.addChild(innerArcRing);

        const rings = new Laya.Sprite();
        rings.mouseEnabled = false;
        rings.graphics.drawCircle(0, 0, 116, null, "#164E63", 1);
        rings.graphics.drawCircle(0, 0, 92, null, "#0EA5E9", 2);
        rings.graphics.drawCircle(0, 0, 67, null, "#6D5AA8", 2);
        rings.graphics.drawCircle(0, 0, 39, "#071B2E", "#67E8F9", 2);
        rings.graphics.drawLine(-150, 0, -126, 0, "#22D3EE", 2);
        rings.graphics.drawLine(126, 0, 150, 0, "#22D3EE", 2);
        rings.graphics.drawLine(0, -150, 0, -126, "#8B5CF6", 2);
        rings.graphics.drawLine(0, 126, 0, 150, "#8B5CF6", 2);
        core.addChild(rings);

        const heroBall = IntroUI.createCoverHeroBall();
        core.addChild(heroBall);

        IntroUI.coverCoreRoot = core;
        IntroUI.coverHeroBallRoot = heroBall;
        IntroUI.coverOuterTickRing = outerTickRing;
        IntroUI.coverInnerArcRing = innerArcRing;
        return core;
    }

    private static createCoverHeroBall(): any {
        const root = new Laya.Sprite();
        root.mouseEnabled = false;

        const aura = new Laya.Sprite();
        aura.mouseEnabled = false;
        aura.graphics.drawCircle(0, 0, 30, "#123D5C");
        aura.graphics.drawCircle(0, 0, 25, "#176E92");
        aura.alpha = 0.2;
        root.addChild(aura);

        const shell = new Laya.Sprite();
        shell.mouseEnabled = false;
        shell.graphics.drawCircle(0, 0, 20.5, "#071824", "#74FAFF", 2);
        shell.graphics.drawPoly(
            0,
            0,
            [0, -19, 16.2, -9.5, 16.2, 9.5, 0, 19, -16.2, 9.5, -16.2, -9.5],
            "#0B2637",
            "#35E9FF",
            1.5
        );
        root.addChild(shell);

        const plasmaCore = new Laya.Sprite();
        plasmaCore.mouseEnabled = false;
        plasmaCore.graphics.drawCircle(0, 0, 10.5, "#19DCE8", "#D8FFFF", 1.5);
        plasmaCore.graphics.drawCircle(0, 0, 5.2, "#F4FFFF");
        plasmaCore.graphics.drawCircle(-2.2, -2.4, 1.7, "#FFFFFF");
        root.addChild(plasmaCore);

        const circuits = new Laya.Sprite();
        circuits.mouseEnabled = false;
        circuits.graphics.drawLine(-15.4, -6.4, -10.3, -4.2, "#A96CFF", 1.5);
        circuits.graphics.drawLine(-10.3, -4.2, -8.1, -1.2, "#A96CFF", 1.5);
        circuits.graphics.drawLine(8.1, 1.2, 10.3, 4.2, "#A96CFF", 1.5);
        circuits.graphics.drawLine(10.3, 4.2, 15.4, 6.4, "#A96CFF", 1.5);
        circuits.graphics.drawLine(-4.1, 12.4, 0, 17.6, "#53F8FF", 1.5);
        circuits.graphics.drawLine(4.1, -12.4, 0, -17.6, "#53F8FF", 1.5);
        circuits.graphics.drawCircle(-14.8, -6.2, 1.4, "#F7B5FF");
        circuits.graphics.drawCircle(14.8, 6.2, 1.4, "#F7B5FF");
        root.addChild(circuits);

        return root;
    }

    private static drawCoverArc(
        graphics: any,
        radius: number,
        startDegrees: number,
        endDegrees: number,
        color: string,
        lineWidth: number,
        segmentCount: number
    ): void {
        const degreeToRadian = Math.PI / 180;
        for (let index = 0; index < segmentCount; index++) {
            const start = startDegrees + (endDegrees - startDegrees) * (index / segmentCount);
            const end = startDegrees + (endDegrees - startDegrees) * ((index + 1) / segmentCount);
            graphics.drawLine(
                Math.cos(start * degreeToRadian) * radius,
                Math.sin(start * degreeToRadian) * radius,
                Math.cos(end * degreeToRadian) * radius,
                Math.sin(end * degreeToRadian) * radius,
                color,
                lineWidth
            );
        }
    }

    private static renderMainMenu(): void {
        IntroUI.clearView();
        IntroUI.viewRoot = new Laya.Sprite();
        IntroUI.panel.addChild(IntroUI.viewRoot);

        const systemLabel = IntroUI.createText(
            "SYS://CORE_BOOT    SIMULATION NODE 01    STATUS: READY",
            13,
            "#38BDF8",
            true
        );
        systemLabel.align = "center";
        systemLabel.x = 40;
        systemLabel.y = 28;
        systemLabel.width = 820;
        systemLabel.height = 22;
        IntroUI.viewRoot.addChild(systemLabel);

        const title = IntroUI.createText("BALL GAME", 48, "#F8FAFC", true);
        title.align = "center";
        title.valign = "middle";
        title.x = 40;
        title.y = 51;
        title.width = 820;
        title.height = 60;
        IntroUI.viewRoot.addChild(title);

        const subtitle = IntroUI.createText("CYBER CORE TRIAL", 18, "#A78BFA", true);
        subtitle.align = "center";
        subtitle.valign = "middle";
        subtitle.x = 40;
        subtitle.y = 108;
        subtitle.width = 820;
        subtitle.height = 28;
        IntroUI.viewRoot.addChild(subtitle);

        const mission = IntroUI.createText(
            "Ascend four sectors. Absorb energy. Survive the simulation.",
            18,
            "#B8C7DA",
            false
        );
        mission.align = "center";
        mission.valign = "middle";
        mission.x = 70;
        mission.y = 145;
        mission.width = 760;
        mission.height = 30;
        IntroUI.viewRoot.addChild(mission);

        const divider = new Laya.Sprite();
        divider.graphics.drawRect(188, 0, 524, 1, "#1E3A5F");
        divider.graphics.drawRect(410, -1, 80, 3, "#0EA5E9");
        divider.y = 190;
        IntroUI.viewRoot.addChild(divider);

        const startButton = IntroUI.createButton("START GAME", 640, 78, "PRIMARY");
        startButton.x = 130;
        startButton.y = 220;

        const helpLabel = IntroUI.mobileTouchSession
            ? "TOUCH CONTROLS  /  HOW TO PLAY"
            : "CONTROL TEST  /  HOW TO PLAY";
        const howToPlayButton = IntroUI.createButton(helpLabel, 640, 64, "SECONDARY");
        howToPlayButton.x = 130;
        howToPlayButton.y = 326;

        IntroUI.viewRoot.addChild(startButton);
        IntroUI.viewRoot.addChild(howToPlayButton);

        IntroUI.menuItems = [startButton, howToPlayButton];
        for (const item of IntroUI.menuItems) {
            item.on(Laya.Event.MOUSE_OVER, IntroUI, IntroUI.onMenuHover);
            item.on(Laya.Event.CLICK, IntroUI, IntroUI.onMenuClick);
            IntroUI.boundItems.push(item);
        }
        IntroUI.updateMainSelection();

        const hint = IntroUI.createText(
            IntroUI.mobileTouchSession
                ? "TAP AN OPTION TO SELECT"
                : "W / ↑  PREVIOUS      S / ↓  NEXT      ENTER  CONFIRM",
            15,
            "#94A3B8",
            false
        );
        hint.align = "center";
        hint.valign = "middle";
        hint.x = 40;
        hint.y = 420;
        hint.width = 820;
        hint.height = 28;
        IntroUI.viewRoot.addChild(hint);

        if (!IntroUI.mobileTouchSession) {
            const touchHint = IntroUI.createText(
                "Mouse or touch an item to select and confirm",
                15,
                "#64748B",
                false
            );
            touchHint.align = "center";
            touchHint.valign = "middle";
            touchHint.x = 40;
            touchHint.y = 454;
            touchHint.width = 820;
            touchHint.height = 26;
            IntroUI.viewRoot.addChild(touchHint);
        }

        const footer = IntroUI.createText(
            "CORE LINK: STANDBY    //    INPUT CHANNEL: AVAILABLE",
            12,
            "#35627A",
            true
        );
        footer.align = "center";
        footer.x = 40;
        footer.y = 526;
        footer.width = 820;
        footer.height = 18;
        IntroUI.viewRoot.addChild(footer);
    }

    private static renderHowToPlay(): void {
        if (IntroUI.mobileTouchSession) {
            IntroUI.renderMobileHowToPlay();
            return;
        }

        IntroUI.clearView();
        IntroUI.viewRoot = new Laya.Sprite();
        IntroUI.panel.addChild(IntroUI.viewRoot);

        const title = IntroUI.createText("CONTROL TEST", 32, "#F8FAFC", true);
        title.align = "center";
        title.valign = "middle";
        title.x = 40;
        title.y = 24;
        title.width = 820;
        title.height = 42;
        IntroUI.viewRoot.addChild(title);

        const inputLabel = IntroUI.createText("INPUT TEST", 14, "#22D3EE", true);
        inputLabel.align = "center";
        inputLabel.x = 40;
        inputLabel.y = 68;
        inputLabel.width = 820;
        inputLabel.height = 20;
        IntroUI.viewRoot.addChild(inputLabel);

        const instruction = IntroUI.createText(
            "Press the keys below to verify input.",
            16,
            "#B8C7DA",
            false
        );
        instruction.align = "center";
        instruction.x = 40;
        instruction.y = 91;
        instruction.width = 820;
        instruction.height = 24;
        IntroUI.viewRoot.addChild(instruction);

        const testMode = IntroUI.createText(
            "TEST MODE  ·  GAME ACTIONS DISABLED",
            13,
            "#C4B5FD",
            true
        );
        testMode.align = "center";
        testMode.x = 248;
        testMode.y = 119;
        testMode.width = 404;
        testMode.height = 22;
        testMode.graphics.drawRect(0, 0, 404, 22, "#17142F", "#6D5AA8", 1);
        IntroUI.viewRoot.addChild(testMode);

        IntroUI.addSectionLabel("PRIMARY", 78, 158, 248, "#38BDF8");
        IntroUI.addSectionLabel("ALTERNATE", 328, 158, 248, "#64748B");
        IntroUI.addSectionLabel("UTILITY", 602, 158, 220, "#64748B");

        IntroUI.createKeycap("W", "W", 160, 190, 74, 54, "PRIMARY");
        IntroUI.createKeycap("A", "A", 111, 254, 74, 54, "PRIMARY");
        IntroUI.createKeycap("D", "D", 209, 254, 74, 54, "PRIMARY");

        IntroUI.createKeycap("UP", "↑", 417, 193, 64, 48, "ALTERNATE");
        IntroUI.createKeycap("LEFT", "←", 375, 253, 64, 48, "ALTERNATE");
        IntroUI.createKeycap("RIGHT", "→", 459, 253, 64, 48, "ALTERNATE");

        IntroUI.createUtilityKey("R", "RESTART", 626, 184);
        IntroUI.createUtilityKey("M", "MUTE", 626, 242);
        IntroUI.createUtilityKey("P", "PAUSE", 626, 300);

        const note = IntroUI.createText(
            "PHYSICAL KEYBOARD TEST  ·  Use a keyboard to test key input.",
            13,
            "#718096",
            false
        );
        note.align = "center";
        note.x = 80;
        note.y = 359;
        note.width = 740;
        note.height = 22;
        IntroUI.viewRoot.addChild(note);

        const reference = IntroUI.createText(
            "MOVE  A / D or ← / →    JUMP  W or ↑    R  RESTART    M  MUTE    P  PAUSE / TOP-RIGHT ICON",
            14,
            "#94A3B8",
            false
        );
        reference.align = "center";
        reference.x = 55;
        reference.y = 386;
        reference.width = 790;
        reference.height = 22;
        IntroUI.viewRoot.addChild(reference);

        const backButton = IntroUI.createButton("BACK", 640, 60, "BACK");
        backButton.x = 130;
        backButton.y = 422;
        IntroUI.viewRoot.addChild(backButton);
        IntroUI.updateButton(backButton, true);
        backButton.on(Laya.Event.CLICK, IntroUI, IntroUI.onBackClick);
        IntroUI.boundItems.push(backButton);

        const hint = IntroUI.createText("ENTER or ESC  ·  BACK", 14, "#64748B", false);
        hint.align = "center";
        hint.valign = "middle";
        hint.x = 40;
        hint.y = 494;
        hint.width = 820;
        hint.height = 24;
        IntroUI.viewRoot.addChild(hint);

        const footer = IntroUI.createText(
            "OBSERVER ONLY    //    NO GAMEPLAY ACTIONS    //    MULTIKEY READY",
            12,
            "#35627A",
            true
        );
        footer.align = "center";
        footer.x = 40;
        footer.y = 532;
        footer.width = 820;
        footer.height = 18;
        IntroUI.viewRoot.addChild(footer);

        IntroUI.startKeyFeedbackLoop();
    }

    private static renderMobileHowToPlay(): void {
        IntroUI.clearView();
        IntroUI.viewRoot = new Laya.Sprite();
        IntroUI.panel.addChild(IntroUI.viewRoot);

        const title = IntroUI.createText("TOUCH CONTROLS", 32, "#F8FAFC", true);
        title.align = "center";
        title.valign = "middle";
        title.x = 40;
        title.y = 24;
        title.width = 820;
        title.height = 42;
        IntroUI.viewRoot.addChild(title);

        const inputLabel = IntroUI.createText("MOBILE INPUT GUIDE", 14, "#22D3EE", true);
        inputLabel.align = "center";
        inputLabel.x = 40;
        inputLabel.y = 68;
        inputLabel.width = 820;
        inputLabel.height = 20;
        IntroUI.viewRoot.addChild(inputLabel);

        const instruction = IntroUI.createText(
            "Use the on-screen controls during play.",
            16,
            "#B8C7DA",
            false
        );
        instruction.align = "center";
        instruction.x = 40;
        instruction.y = 94;
        instruction.width = 820;
        instruction.height = 24;
        IntroUI.viewRoot.addChild(instruction);

        const guideMode = IntroUI.createText(
            "GUIDE MODE  ·  GAME ACTIONS DISABLED",
            13,
            "#C4B5FD",
            true
        );
        guideMode.align = "center";
        guideMode.x = 248;
        guideMode.y = 124;
        guideMode.width = 404;
        guideMode.height = 22;
        guideMode.graphics.drawRect(0, 0, 404, 22, "#17142F", "#6D5AA8", 1);
        IntroUI.viewRoot.addChild(guideMode);

        IntroUI.createTouchGuideCard(
            "MOVE",
            "LEFT   /   RIGHT",
            "Use LEFT and RIGHT to move.",
            80,
            168,
            470,
            "DIRECTION"
        );
        IntroUI.createTouchGuideCard(
            "JUMP",
            "JUMP",
            "Tap JUMP to jump.",
            574,
            168,
            246,
            "JUMP"
        );

        const backButton = IntroUI.createButton("BACK", 640, 60, "BACK");
        backButton.x = 130;
        backButton.y = 422;
        IntroUI.viewRoot.addChild(backButton);
        IntroUI.updateButton(backButton, true);
        backButton.on(Laya.Event.CLICK, IntroUI, IntroUI.onBackClick);
        IntroUI.boundItems.push(backButton);

        const hint = IntroUI.createText("TAP BACK TO RETURN", 14, "#64748B", false);
        hint.align = "center";
        hint.valign = "middle";
        hint.x = 40;
        hint.y = 494;
        hint.width = 820;
        hint.height = 24;
        IntroUI.viewRoot.addChild(hint);

        const footer = IntroUI.createText(
            "TOUCH LINK READY    //    MOVE + JUMP",
            12,
            "#35627A",
            true
        );
        footer.align = "center";
        footer.x = 40;
        footer.y = 532;
        footer.width = 820;
        footer.height = 18;
        IntroUI.viewRoot.addChild(footer);
    }

    private static createTouchGuideCard(
        action: string,
        controls: string,
        detail: string,
        x: number,
        y: number,
        width: number,
        glyph: "DIRECTION" | "JUMP"
    ): void {
        const height = 202;
        const card = new Laya.Sprite();
        card.x = x;
        card.y = y;
        card.width = width;
        card.height = height;
        card.mouseEnabled = false;
        card.graphics.drawPoly(
            0,
            0,
            IntroUI.cutCornerPoints(width, height, 12),
            "#06111F",
            glyph === "DIRECTION" ? "#22D3EE" : "#8B5CF6",
            2
        );
        card.graphics.drawRect(18, 18, width - 36, 2, glyph === "DIRECTION" ? "#155E75" : "#5B4A96");
        IntroUI.viewRoot.addChild(card);

        const actionLabel = IntroUI.createText(action, 16, "#E8FAFF", true);
        actionLabel.x = 22;
        actionLabel.y = 28;
        actionLabel.width = width - 44;
        actionLabel.height = 24;
        actionLabel.align = "center";
        card.addChild(actionLabel);

        const glyphRoot = new Laya.Sprite();
        glyphRoot.mouseEnabled = false;
        card.addChild(glyphRoot);
        if (glyph === "DIRECTION") {
            IntroUI.drawTouchGuideButton(glyphRoot, 119, 66, 64, "LEFT");
            IntroUI.drawTouchGuideButton(glyphRoot, 287, 66, 64, "RIGHT");
        } else {
            IntroUI.drawTouchGuideButton(glyphRoot, 91, 66, 64, "JUMP");
        }

        const controlsLabel = IntroUI.createText(controls, 14, "#67E8F9", true);
        controlsLabel.x = 18;
        controlsLabel.y = 137;
        controlsLabel.width = width - 36;
        controlsLabel.height = 20;
        controlsLabel.align = "center";
        card.addChild(controlsLabel);

        const detailLabel = IntroUI.createText(detail, 13, "#94A3B8", false);
        detailLabel.x = 18;
        detailLabel.y = 166;
        detailLabel.width = width - 36;
        detailLabel.height = 20;
        detailLabel.align = "center";
        card.addChild(detailLabel);
    }

    private static drawTouchGuideButton(
        root: any,
        x: number,
        y: number,
        size: number,
        control: "LEFT" | "RIGHT" | "JUMP"
    ): void {
        const button = new Laya.Sprite();
        button.x = x;
        button.y = y;
        button.width = size;
        button.height = size;
        button.mouseEnabled = false;
        button.graphics.drawPoly(
            0,
            0,
            IntroUI.cutCornerPoints(size, size, 9),
            "#0A2638",
            "#6AF7FF",
            2
        );

        const center = size / 2;
        if (control === "LEFT") {
            button.graphics.drawPoly(center - 16, center, [16, -15, 16, -5, 28, -5, 28, 5, 16, 5, 16, 15], "#E8FDFF");
        } else if (control === "RIGHT") {
            button.graphics.drawPoly(center + 16, center, [-16, -15, -16, -5, -28, -5, -28, 5, -16, 5, -16, 15], "#E8FDFF");
        } else {
            button.graphics.drawPoly(center, center - 16, [-15, 16, -5, 16, -5, 28, 5, 28, 5, 16, 15, 16], "#E8FDFF");
        }
        root.addChild(button);
    }

    private static addSectionLabel(text: string, x: number, y: number, width: number, color: string): void {
        const label = IntroUI.createText(text, 12, color, true);
        label.x = x;
        label.y = y;
        label.width = width;
        label.height = 18;
        label.align = "center";
        IntroUI.viewRoot.addChild(label);
    }

    private static createUtilityKey(keyId: string, action: string, x: number, y: number): void {
        IntroUI.createKeycap(keyId, keyId, x, y, 58, 46, "UTILITY");

        const label = IntroUI.createText(action, 13, "#94A3B8", true);
        label.x = x + 72;
        label.y = y + 11;
        label.width = 104;
        label.height = 22;
        IntroUI.viewRoot.addChild(label);
    }

    private static createKeycap(
        keyId: string,
        glyph: string,
        x: number,
        y: number,
        width: number,
        height: number,
        tier: "PRIMARY" | "ALTERNATE" | "UTILITY"
    ): void {
        const root = new Laya.Sprite();
        root.x = x;
        root.y = y;
        root.width = width;
        root.height = height + 5;
        root.mouseEnabled = false;
        root.graphics.drawPoly(
            0,
            5,
            IntroUI.cutCornerPoints(width, height, tier === "PRIMARY" ? 8 : 6),
            "#020617",
            "#17324D",
            1
        );

        const face = new Laya.Sprite();
        face.width = width;
        face.height = height;

        const glow = new Laya.Sprite();
        glow.width = width;
        glow.height = height;
        glow.graphics.drawPoly(
            0,
            0,
            IntroUI.cutCornerPoints(width, height, tier === "PRIMARY" ? 8 : 6),
            "#0EA5E9",
            "#BAE6FD",
            2
        );
        glow.alpha = 0;
        face.addChild(glow);

        const label = IntroUI.createText(glyph, tier === "PRIMARY" ? 23 : 20, "#BAE6FD", true);
        label.align = "center";
        label.valign = "middle";
        label.width = width;
        label.height = height;
        face.addChild(label);

        root.addChild(face);
        IntroUI.viewRoot.addChild(root);

        IntroUI.keycaps[keyId] = {
            root,
            face,
            glow,
            label,
            tier,
            pressed: false,
            releaseUntil: 0
        };
        IntroUI.drawKeycapFace(IntroUI.keycaps[keyId], 0);
    }

    private static drawKeycapFace(keycap: IntroKeycapVisual, intensity: number): void {
        const width = keycap.face.width;
        const height = keycap.face.height;
        const cut = keycap.tier === "PRIMARY" ? 8 : 6;
        const fill = keycap.tier === "PRIMARY" ? "#0B172A" : "#08111F";
        const border = keycap.tier === "PRIMARY" ? "#2B7894" : "#334155";
        const idleGlyph = keycap.tier === "PRIMARY" ? "#BAE6FD" : "#718096";

        keycap.face.graphics.clear();
        keycap.face.graphics.drawPoly(
            0,
            0,
            IntroUI.cutCornerPoints(width, height, cut),
            fill,
            intensity > 0 ? "#67E8F9" : border,
            intensity > 0 ? 2 : 1
        );
        keycap.face.y = Math.round(intensity * 3);
        keycap.glow.alpha = intensity * 0.62;
        keycap.label.color = intensity > 0 ? "#FFFFFF" : idleGlyph;
    }

    private static cutCornerPoints(width: number, height: number, cut: number): number[] {
        return [
            0, cut,
            cut, 0,
            width - cut, 0,
            width, cut,
            width, height - cut,
            width - cut, height,
            cut, height,
            0, height - cut
        ];
    }

    private static createText(text: string, fontSize: number, color: string, bold: boolean): any {
        const label = new Laya.Text();
        label.text = text;
        label.font = "Courier New";
        label.fontSize = fontSize;
        label.color = color;
        label.bold = bold;
        label.mouseEnabled = false;
        return label;
    }

    private static createButton(
        text: string,
        width: number,
        height: number,
        kind: "PRIMARY" | "SECONDARY" | "BACK"
    ): any {
        const button = new Laya.Sprite();
        button.width = width;
        button.height = height + 5;
        button.mouseEnabled = true;
        button.menuKind = kind;

        const glow = new Laya.Sprite();
        glow.x = -4;
        glow.y = -4;
        glow.graphics.drawRect(0, 0, width + 8, height + 8, kind === "PRIMARY" ? "#0EA5E9" : "#7C3AED");
        glow.alpha = 0;
        button.addChild(glow);

        const side = new Laya.Sprite();
        side.y = 5;
        side.graphics.drawPoly(0, 0, IntroUI.cutCornerPoints(width, height, 10), "#030712", "#1E3A5F", 1);
        button.addChild(side);

        const face = new Laya.Sprite();
        face.width = width;
        face.height = height;
        button.addChild(face);

        const label = IntroUI.createText(text, kind === "PRIMARY" ? 27 : 21, "#F8FAFC", true);
        label.align = "center";
        label.valign = "middle";
        label.width = width;
        label.height = height;
        face.addChild(label);

        const accent = new Laya.Sprite();
        face.addChild(accent);

        button.menuGlow = glow;
        button.menuFace = face;
        button.menuLabel = label;
        button.menuAccent = accent;

        return button;
    }

    private static updateMainSelection(): void {
        for (let index = 0; index < IntroUI.menuItems.length; index++) {
            IntroUI.updateButton(IntroUI.menuItems[index], index === IntroUI.selectedIndex);
        }
    }

    private static updateButton(button: any, selected: boolean): void {
        const kind = button.menuKind || "BACK";
        let fill = "#0B1427";
        let border = "#475569";
        let accent = "#475569";
        let glowAlpha = 0.05;

        if (kind === "PRIMARY") {
            fill = selected ? "#075A9D" : "#0B3556";
            border = selected ? "#CFFAFE" : "#38BDF8";
            accent = "#22D3EE";
            glowAlpha = selected ? 0.28 : 0.1;
        } else if (kind === "SECONDARY") {
            fill = selected ? "#18264A" : "#0A1428";
            border = selected ? "#A78BFA" : "#475569";
            accent = selected ? "#8B5CF6" : "#334155";
            glowAlpha = selected ? 0.16 : 0.03;
        } else if (selected) {
            fill = "#10345A";
            border = "#67E8F9";
            accent = "#22D3EE";
            glowAlpha = 0.12;
        }

        button.menuFace.graphics.clear();
        button.menuFace.graphics.drawPoly(
            0,
            0,
            IntroUI.cutCornerPoints(button.width, button.height - 5, 10),
            fill,
            border,
            2
        );
        button.menuAccent.graphics.clear();
        button.menuAccent.graphics.drawRect(20, 0, button.width - 40, 3, accent);
        button.menuGlow.alpha = glowAlpha;
        button.menuLabel.color = selected || kind === "PRIMARY" ? "#FFFFFF" : "#CBD5E1";
        button.menuLabel.bold = selected || kind === "PRIMARY";
    }

    private static onMenuHover(event: any): void {
        const target = event?.currentTarget || event?.target;
        const index = IntroUI.menuItems.indexOf(target);
        if (index === 0 || index === 1) {
            IntroUI.selectedIndex = index;
            IntroUI.updateMainSelection();
        }
    }

    private static onMenuClick(event: any): void {
        if (IntroUI.mainMenuActivationGuarded) {
            IntroUI.stopEvent(event);
            return;
        }

        const target = event?.currentTarget || event?.target;
        const index = IntroUI.menuItems.indexOf(target);
        if (index !== 0 && index !== 1) {
            return;
        }

        IntroUI.selectedIndex = index;
        IntroUI.updateMainSelection();
        if (index === 0) {
            IntroUI.acceptStart();
        } else {
            IntroUI.view = IntroUI.HOW_TO_PLAY;
            IntroUI.renderHowToPlay();
        }
    }

    private static onBackClick(): void {
        IntroUI.view = IntroUI.MAIN_MENU;
        IntroUI.selectedIndex = 0;
        IntroUI.renderMainMenu();
    }

    private static onCoverClick(event: any): void {
        IntroUI.dismissCover(event, false);
    }

    private static dismissCover(event: any = null, fromEnter: boolean = false): void {
        if (IntroUI.view !== IntroUI.COVER || IntroUI.coverDismissed) {
            IntroUI.stopEvent(event);
            return;
        }

        IntroUI.coverDismissed = true;
        IntroUI.mainMenuActivationGuarded = true;
        if (fromEnter) {
            IntroUI.coverEnterReleaseRequired = true;
        }
        IntroUI.stopEvent(event);
        IntroUI.clearCoverRoot();

        if (IntroUI.overlay) {
            IntroUI.overlay.alpha = 0.78;
        }
        if (IntroUI.panel) {
            IntroUI.panel.visible = true;
        }

        IntroUI.view = IntroUI.MAIN_MENU;
        IntroUI.selectedIndex = 0;
        IntroUI.renderMainMenu();

        Laya.timer.clear(IntroUI, IntroUI.releaseMainMenuActivationGuard);
        Laya.timer.once(
            IntroUI.COVER_MENU_GUARD_MS,
            IntroUI,
            IntroUI.releaseMainMenuActivationGuard
        );
    }

    private static releaseMainMenuActivationGuard(): void {
        IntroUI.mainMenuActivationGuarded = false;
    }

    private static stopEvent(event: any): void {
        if (event && typeof event.stopPropagation === "function") {
            event.stopPropagation();
        }
    }

    private static clearCoverRoot(): void {
        IntroUI.clearCoverMotionVisuals();
        if (!IntroUI.coverRoot) {
            return;
        }
        IntroUI.coverRoot.mouseEnabled = false;
        IntroUI.coverRoot.off(Laya.Event.CLICK, IntroUI, IntroUI.onCoverClick);
        IntroUI.coverRoot.removeSelf();
        IntroUI.coverRoot.destroy(true);
        IntroUI.coverRoot = null;
    }

    private static resetCoverState(): void {
        Laya.timer.clear(IntroUI, IntroUI.releaseMainMenuActivationGuard);
        IntroUI.clearCoverRoot();
        IntroUI.coverDismissed = false;
        IntroUI.coverEnterReleaseRequired = false;
        IntroUI.mainMenuActivationGuarded = false;
    }

    private static clearCoverInteractionState(): void {
        Laya.timer.clear(IntroUI, IntroUI.releaseMainMenuActivationGuard);
        IntroUI.clearCoverRoot();
        IntroUI.coverDismissed = false;
        IntroUI.coverEnterReleaseRequired = false;
        IntroUI.mainMenuActivationGuarded = false;
    }

    private static onKeyDown(event: any): void {
        const keyCode = event ? event.keyCode : null;
        const key = event ? event.key : "";
        const isEnter = keyCode === 13 || key === "Enter";
        const isEscape = keyCode === 27 || key === "Escape" || key === "Esc";

        if (IntroUI.view === IntroUI.COVER) {
            if (isEnter) {
                IntroUI.dismissCover(event, true);
            }
            return;
        }

        if (isEnter && IntroUI.coverEnterReleaseRequired) {
            IntroUI.stopEvent(event);
            return;
        }

        if (isEnter && IntroUI.mainMenuActivationGuarded) {
            IntroUI.coverEnterReleaseRequired = true;
            IntroUI.stopEvent(event);
            return;
        }

        if (IntroUI.view === IntroUI.HOW_TO_PLAY) {
            const keyId = IntroUI.resolveTestKey(event);
            if (keyId) {
                IntroUI.pressKeycap(keyId);
            }
            if (isEnter || isEscape) {
                IntroUI.onBackClick();
            }
            return;
        }

        const isPrevious = keyCode === 87 || keyCode === 38 || key === "w" || key === "W" || key === "ArrowUp" || key === "Up";
        const isNext = keyCode === 83 || keyCode === 40 || key === "s" || key === "S" || key === "ArrowDown" || key === "Down";
        if (isPrevious || isNext) {
            IntroUI.selectedIndex = IntroUI.selectedIndex === 0 ? 1 : 0;
            IntroUI.updateMainSelection();
            return;
        }
        if (isEnter && IntroUI.selectedIndex === 0) {
            IntroUI.acceptStart();
        } else if (isEnter) {
            IntroUI.view = IntroUI.HOW_TO_PLAY;
            IntroUI.renderHowToPlay();
        }
    }

    private static onKeyUp(event: any): void {
        const keyCode = event ? event.keyCode : null;
        const key = event ? event.key : "";
        const isEnter = keyCode === 13 || key === "Enter";
        if (isEnter && IntroUI.coverEnterReleaseRequired) {
            IntroUI.coverEnterReleaseRequired = false;
            return;
        }

        if (IntroUI.view !== IntroUI.HOW_TO_PLAY) {
            return;
        }
        const keyId = IntroUI.resolveTestKey(event);
        if (keyId) {
            IntroUI.releaseKeycap(keyId);
        }
    }

    private static resolveTestKey(event: any): string | null {
        const code = event ? event.code : "";
        const keyCode = event ? event.keyCode : null;
        const key = event ? event.key : "";

        if (code === "KeyW" || keyCode === 87 || key === "w" || key === "W") return "W";
        if (code === "KeyA" || keyCode === 65 || key === "a" || key === "A") return "A";
        if (code === "KeyD" || keyCode === 68 || key === "d" || key === "D") return "D";
        if (code === "ArrowUp" || keyCode === 38 || key === "ArrowUp" || key === "Up") return "UP";
        if (code === "ArrowLeft" || keyCode === 37 || key === "ArrowLeft" || key === "Left") return "LEFT";
        if (code === "ArrowRight" || keyCode === 39 || key === "ArrowRight" || key === "Right") return "RIGHT";
        if (code === "KeyR" || keyCode === 82 || key === "r" || key === "R") return "R";
        if (code === "KeyM" || keyCode === 77 || key === "m" || key === "M") return "M";
        if (code === "KeyP" || keyCode === 80 || key === "p" || key === "P") return "P";
        return null;
    }

    private static pressKeycap(keyId: string): void {
        const keycap = IntroUI.keycaps[keyId];
        if (!keycap || keycap.pressed) {
            return;
        }
        keycap.pressed = true;
        keycap.releaseUntil = 0;
        IntroUI.drawKeycapFace(keycap, 1);
    }

    private static releaseKeycap(keyId: string): void {
        const keycap = IntroUI.keycaps[keyId];
        if (!keycap || !keycap.pressed) {
            return;
        }
        keycap.pressed = false;
        keycap.releaseUntil = Date.now() + IntroUI.KEY_RELEASE_DECAY_MS;
        IntroUI.drawKeycapFace(keycap, 1);
    }

    private static updateKeyFeedback(): void {
        const now = Date.now();
        for (const keyId of Object.keys(IntroUI.keycaps)) {
            const keycap = IntroUI.keycaps[keyId];
            if (keycap.pressed || keycap.releaseUntil <= 0) {
                continue;
            }

            const remaining = keycap.releaseUntil - now;
            if (remaining <= 0) {
                keycap.releaseUntil = 0;
                IntroUI.drawKeycapFace(keycap, 0);
            } else {
                IntroUI.drawKeycapFace(keycap, remaining / IntroUI.KEY_RELEASE_DECAY_MS);
            }
        }
    }

    private static startKeyFeedbackLoop(): void {
        if (IntroUI.keyFeedbackLoopActive) {
            return;
        }
        Laya.timer.frameLoop(1, IntroUI, IntroUI.updateKeyFeedback);
        IntroUI.keyFeedbackLoopActive = true;
    }

    private static stopKeyFeedbackLoop(): void {
        if (!IntroUI.keyFeedbackLoopActive) {
            return;
        }
        Laya.timer.clear(IntroUI, IntroUI.updateKeyFeedback);
        IntroUI.keyFeedbackLoopActive = false;
    }

    private static resetKeyFeedback(): void {
        for (const keyId of Object.keys(IntroUI.keycaps)) {
            const keycap = IntroUI.keycaps[keyId];
            keycap.pressed = false;
            keycap.releaseUntil = 0;
            IntroUI.drawKeycapFace(keycap, 0);
        }
    }

    private static onFocusLost(): void {
        IntroUI.coverEnterReleaseRequired = false;
        if (IntroUI.mainMenuActivationGuarded) {
            Laya.timer.clear(IntroUI, IntroUI.releaseMainMenuActivationGuard);
            IntroUI.releaseMainMenuActivationGuard();
        }
        IntroUI.resetKeyFeedback();
    }

    private static acceptStart(): void {
        if (
            IntroUI.started
            || IntroUI.view !== IntroUI.MAIN_MENU
            || IntroUI.selectedIndex !== 0
            || IntroUI.mainMenuActivationGuarded
            || IntroUI.coverEnterReleaseRequired
        ) {
            return;
        }

        IntroUI.started = true;
        IntroUI.clearCoverInteractionState();
        IntroUI.unbindKeyboard();
        IntroUI.clearView();
        if (IntroUI.container) {
            IntroUI.container.visible = false;
        }

        const handler = IntroUI.startHandler;
        IntroUI.startHandler = null;
        if (handler) {
            handler();
        }
    }

    private static bindKeyboard(): void {
        if (IntroUI.keyboardBound) {
            return;
        }
        Laya.stage.on(Laya.Event.KEY_DOWN, IntroUI, IntroUI.onKeyDown);
        Laya.stage.on(Laya.Event.KEY_UP, IntroUI, IntroUI.onKeyUp);
        Laya.stage.on(Laya.Event.BLUR, IntroUI, IntroUI.onFocusLost);
        IntroUI.keyboardBound = true;
    }

    private static unbindKeyboard(): void {
        if (!IntroUI.keyboardBound) {
            return;
        }
        Laya.stage.off(Laya.Event.KEY_DOWN, IntroUI, IntroUI.onKeyDown);
        Laya.stage.off(Laya.Event.KEY_UP, IntroUI, IntroUI.onKeyUp);
        Laya.stage.off(Laya.Event.BLUR, IntroUI, IntroUI.onFocusLost);
        IntroUI.keyboardBound = false;
    }

    private static clearView(): void {
        IntroUI.resetKeyFeedback();
        IntroUI.stopKeyFeedbackLoop();
        IntroUI.keycaps = {};

        for (const item of IntroUI.boundItems) {
            item.off(Laya.Event.MOUSE_OVER, IntroUI, IntroUI.onMenuHover);
            item.off(Laya.Event.CLICK, IntroUI, IntroUI.onMenuClick);
            item.off(Laya.Event.CLICK, IntroUI, IntroUI.onBackClick);
        }
        IntroUI.boundItems = [];
        IntroUI.menuItems = [];

        if (IntroUI.viewRoot) {
            IntroUI.viewRoot.removeSelf();
            IntroUI.viewRoot.destroy(true);
            IntroUI.viewRoot = null;
        }
    }
}
