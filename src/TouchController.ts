declare const Laya: any;

export type TouchControl = "left" | "right" | "jump";

export interface TouchControlLayout {
    visibleX: number;
    visibleY: number;
    visibleSize: number;
    hitX: number;
    hitY: number;
    hitSize: number;
}

export const TOUCH_CONTROL_LAYOUT: Record<TouchControl, TouchControlLayout> = {
    left: {
        visibleX: 56,
        visibleY: 606,
        visibleSize: 88,
        hitX: 48,
        hitY: 598,
        hitSize: 104,
    },
    right: {
        visibleX: 168,
        visibleY: 606,
        visibleSize: 88,
        hitX: 160,
        hitY: 598,
        hitSize: 104,
    },
    jump: {
        visibleX: 1174,
        visibleY: 596,
        visibleSize: 96,
        hitX: 1158,
        hitY: 580,
        hitSize: 128,
    },
};

export class OrientationHintState {
    private acknowledged: boolean = false;
    private preGameActive: boolean = true;
    private visible: boolean = false;

    public syncViewport(isPortrait: boolean): void {
        if (!this.preGameActive || this.acknowledged) {
            this.visible = false;
            return;
        }

        if (!isPortrait) {
            if (this.visible) {
                this.acknowledged = true;
            }
            this.visible = false;
            return;
        }

        this.visible = true;
    }

    public acknowledge(): void {
        this.acknowledged = true;
        this.visible = false;
    }

    public completePreGame(): void {
        this.preGameActive = false;
        this.visible = false;
    }

    public isAcknowledged(): boolean {
        return this.acknowledged;
    }

    public isVisible(): boolean {
        return this.visible;
    }
}

export class TouchInputState {
    private readonly pointers: Record<TouchControl, Set<number>> = {
        left: new Set<number>(),
        right: new Set<number>(),
        jump: new Set<number>(),
    };

    public press(control: TouchControl, pointerId: number): void {
        this.releasePointer(pointerId);
        this.pointers[control].add(pointerId);
    }

    public releasePointer(pointerId: number): void {
        this.pointers.left.delete(pointerId);
        this.pointers.right.delete(pointerId);
        this.pointers.jump.delete(pointerId);
    }

    public isHeld(control: TouchControl): boolean {
        return this.pointers[control].size > 0;
    }

    public clear(): void {
        this.pointers.left.clear();
        this.pointers.right.clear();
        this.pointers.jump.clear();
    }
}

export class TouchController {
    public static readonly STAGE_WIDTH: number = 1334;
    public static readonly STAGE_HEIGHT: number = 750;
    public static readonly DIRECTION_VISIBLE_SIZE: number = 88;
    public static readonly JUMP_VISIBLE_SIZE: number = 96;
    public static readonly DIRECTION_HIT_SIZE: number = 104;
    public static readonly JUMP_HIT_SIZE: number = 128;
    private static readonly PRESS_SPARK_COUNT: number = 3;

    private readonly state: TouchInputState = new TouchInputState();
    private readonly buttons: Partial<Record<TouchControl, any>> = {};
    private readonly buttonVisuals: Partial<Record<TouchControl, any>> = {};
    private readonly orientationState: OrientationHintState = new OrientationHintState();
    private readonly pressBursts: Set<any> = new Set<any>();
    private root: any = null;
    private orientationRoot: any = null;
    private deferredPreGameAction: (() => void) | null = null;
    private gameplayActive: boolean = false;
    private runtimeBlocked: boolean = false;
    private runtimeBlockProvider: (() => boolean) | null = null;
    private destroyed: boolean = false;
    private readonly nativeWindow: any;
    private readonly onNativeTouchCancel = (): void => this.resetAll();
    private readonly onViewportOrientationChanged = (): void => this.syncOrientationHint();

    private constructor() {
        this.nativeWindow = Laya.Browser?.window || null;
    }

    public static create(): TouchController | null {
        if (!TouchController.isTouchCapable()) {
            return null;
        }

        const controller = new TouchController();
        controller.mount();
        return controller;
    }

    public static isTouchCapable(): boolean {
        const browserWindow = Laya.Browser?.window;
        if (!browserWindow) {
            return false;
        }

        const navigatorLike = browserWindow.navigator || {};
        return "ontouchstart" in browserWindow
            || Number(navigatorLike.maxTouchPoints || 0) > 0
            || Number(navigatorLike.msMaxTouchPoints || 0) > 0;
    }

    public left(): boolean {
        return this.isInputAvailable() && this.state.isHeld("left");
    }

    public right(): boolean {
        return this.isInputAvailable() && this.state.isHeld("right");
    }

    public jump(): boolean {
        return this.isInputAvailable() && this.state.isHeld("jump");
    }

    public setGameplayActive(active: boolean): void {
        if (this.gameplayActive === active) {
            return;
        }
        this.gameplayActive = active;
        this.updateVisibility();
    }

    public deferPreGameActionIfHintVisible(action: () => void): boolean {
        this.syncOrientationHint();
        if (!this.orientationState.isVisible()) {
            return false;
        }

        this.deferredPreGameAction = action;
        return true;
    }

    public completePreGame(): void {
        this.deferredPreGameAction = null;
        this.orientationState.completePreGame();
        this.updateOrientationHintVisibility();
    }

    public setRuntimeBlockProvider(provider: (() => boolean) | null): void {
        this.runtimeBlockProvider = provider;
        this.refreshRuntimeBlock();
    }

    public resetAll(): void {
        this.state.clear();
        this.renderAllButtons();
    }

    public destroy(): void {
        if (this.destroyed) {
            return;
        }
        this.destroyed = true;
        this.gameplayActive = false;
        this.runtimeBlocked = true;
        this.runtimeBlockProvider = null;
        this.deferredPreGameAction = null;
        this.orientationState.completePreGame();
        this.resetAll();

        Laya.stage.off(Laya.Event.MOUSE_UP, this, this.onPointerUp);
        Laya.stage.off(Laya.Event.BLUR, this, this.onFocusLost);
        Laya.stage.off(Laya.Event.VISIBILITY_CHANGE, this, this.onVisibilityChanged);
        if (this.nativeWindow && typeof this.nativeWindow.removeEventListener === "function") {
            this.nativeWindow.removeEventListener("touchcancel", this.onNativeTouchCancel);
            this.nativeWindow.removeEventListener("resize", this.onViewportOrientationChanged);
            this.nativeWindow.removeEventListener("orientationchange", this.onViewportOrientationChanged);
        }
        Laya.timer?.clearAll(this);

        for (const burst of this.pressBursts) {
            burst.removeSelf();
            burst.destroy(true);
        }
        this.pressBursts.clear();

        if (this.root) {
            this.root.removeSelf();
            this.root.destroy(true);
            this.root = null;
        }
        if (this.orientationRoot) {
            this.orientationRoot.removeSelf();
            this.orientationRoot.destroy(true);
            this.orientationRoot = null;
        }
    }

    private mount(): void {
        if (Laya.InputManager) {
            Laya.InputManager.multiTouchEnabled = true;
        }

        const root = new Laya.Sprite();
        root.name = "MobileTouchControls";
        root.width = TouchController.STAGE_WIDTH;
        root.height = TouchController.STAGE_HEIGHT;
        root.zOrder = 9998;
        root.mouseEnabled = true;
        root.mouseThrough = true;
        root.visible = false;
        this.root = root;

        this.createButton("left", TOUCH_CONTROL_LAYOUT.left);
        this.createButton("right", TOUCH_CONTROL_LAYOUT.right);
        this.createButton("jump", TOUCH_CONTROL_LAYOUT.jump);
        this.createOrientationHint();

        Laya.stage.on(Laya.Event.MOUSE_UP, this, this.onPointerUp);
        Laya.stage.on(Laya.Event.BLUR, this, this.onFocusLost);
        Laya.stage.on(Laya.Event.VISIBILITY_CHANGE, this, this.onVisibilityChanged);
        if (this.nativeWindow && typeof this.nativeWindow.addEventListener === "function") {
            this.nativeWindow.addEventListener("touchcancel", this.onNativeTouchCancel, { passive: true });
            this.nativeWindow.addEventListener("resize", this.onViewportOrientationChanged, { passive: true });
            this.nativeWindow.addEventListener("orientationchange", this.onViewportOrientationChanged, { passive: true });
        }
        Laya.stage.addChild(root);
        if (this.orientationRoot) {
            Laya.stage.addChild(this.orientationRoot);
        }
        this.syncOrientationHint();
    }

    private createButton(control: TouchControl, layout: TouchControlLayout): void {
        if (!this.root) {
            return;
        }

        const hitTarget = new Laya.Sprite();
        hitTarget.name = "MobileTouch_" + control.toUpperCase() + "_HIT";
        hitTarget.x = layout.hitX;
        hitTarget.y = layout.hitY;
        hitTarget.width = layout.hitSize;
        hitTarget.height = layout.hitSize;
        hitTarget.mouseEnabled = true;
        hitTarget.mouseThrough = false;
        hitTarget.touchControl = control;
        hitTarget.on(Laya.Event.MOUSE_DOWN, this, this.onPointerDown);
        hitTarget.on(Laya.Event.MOUSE_OUT, this, this.onPointerOut);

        const visual = new Laya.Sprite();
        visual.name = "MobileTouch_" + control.toUpperCase() + "_VISIBLE";
        visual.x = layout.visibleX - layout.hitX;
        visual.y = layout.visibleY - layout.hitY;
        visual.width = layout.visibleSize;
        visual.height = layout.visibleSize;
        visual.mouseEnabled = false;
        hitTarget.addChild(visual);

        this.root.addChild(hitTarget);
        this.buttons[control] = hitTarget;
        this.buttonVisuals[control] = visual;
        this.renderButton(control);
    }

    private createOrientationHint(): void {
        const root = new Laya.Sprite();
        root.name = "MobileOrientationHint";
        root.width = TouchController.STAGE_WIDTH;
        root.height = TouchController.STAGE_HEIGHT;
        root.zOrder = 10003;
        root.mouseEnabled = true;
        root.mouseThrough = false;
        root.visible = false;
        root.on(Laya.Event.MOUSE_DOWN, this, this.stopEvent);

        const overlay = new Laya.Sprite();
        overlay.name = "MobileOrientationHint_Overlay";
        overlay.width = TouchController.STAGE_WIDTH;
        overlay.height = TouchController.STAGE_HEIGHT;
        overlay.mouseEnabled = true;
        overlay.mouseThrough = false;
        overlay.graphics.drawRect(0, 0, overlay.width, overlay.height, "#020713");
        overlay.alpha = 0.58;
        root.addChild(overlay);

        const panelWidth = 650;
        const panelHeight = 354;
        const panel = new Laya.Sprite();
        panel.name = "MobileOrientationHint_Panel";
        panel.x = (TouchController.STAGE_WIDTH - panelWidth) / 2;
        panel.y = (TouchController.STAGE_HEIGHT - panelHeight) / 2;
        panel.width = panelWidth;
        panel.height = panelHeight;
        panel.mouseEnabled = true;
        panel.mouseThrough = false;
        panel.graphics.drawPoly(
            0,
            0,
            [22, 0, panelWidth - 22, 0, panelWidth, 22, panelWidth, panelHeight - 22,
                panelWidth - 22, panelHeight, 22, panelHeight, 0, panelHeight - 22, 0, 22],
            "#071424",
            "#35E9FF",
            2,
        );
        panel.graphics.drawLine(22, 10, 176, 10, "#83F7FF", 2);
        panel.graphics.drawLine(panelWidth - 164, panelHeight - 10, panelWidth - 22, panelHeight - 10, "#6F5CFF", 2);
        panel.graphics.drawLine(18, 48, 18, 96, "#176B80", 1);
        panel.graphics.drawLine(panelWidth - 18, panelHeight - 96, panelWidth - 18, panelHeight - 48, "#176B80", 1);
        root.addChild(panel);

        const glyph = new Laya.Sprite();
        glyph.name = "MobileOrientationHint_RotateGlyph";
        glyph.x = 58;
        glyph.y = 65;
        glyph.mouseEnabled = false;
        glyph.graphics.drawRect(8, 2, 44, 72, null, "#35E9FF", 2);
        glyph.graphics.drawLine(25, 65, 35, 65, "#86F8FF", 2);
        glyph.graphics.drawRect(48, 38, 78, 46, null, "#8B76FF", 2);
        glyph.graphics.drawLine(113, 57, 113, 66, "#C8C0FF", 2);
        glyph.graphics.drawLine(13, 91, 105, 91, "#2A94A8", 2);
        glyph.graphics.drawLine(105, 91, 94, 82, "#6AF7FF", 2);
        glyph.graphics.drawLine(105, 91, 94, 100, "#6AF7FF", 2);
        panel.addChild(glyph);

        const title = this.createOrientationText("横屏体验更佳", 32, "#F4FEFF", true);
        title.x = 188;
        title.y = 62;
        title.width = 400;
        title.height = 48;
        panel.addChild(title);

        const status = this.createOrientationText("LANDSCAPE  /  RECOMMENDED", 15, "#63EAF7", true);
        status.x = 188;
        status.y = 112;
        status.width = 400;
        status.height = 28;
        panel.addChild(status);

        const detail = this.createOrientationText(
            "旋转设备可获得更完整的视野，\n以及更舒适的触控操作。",
            21,
            "#C5D9E8",
            false,
        );
        detail.x = 188;
        detail.y = 152;
        detail.width = 400;
        detail.height = 70;
        detail.leading = 10;
        panel.addChild(detail);

        const continueButton = new Laya.Sprite();
        continueButton.name = "MobileOrientationHint_Continue";
        continueButton.x = 170;
        continueButton.y = 266;
        continueButton.width = 310;
        continueButton.height = 54;
        continueButton.mouseEnabled = true;
        continueButton.mouseThrough = false;
        continueButton.graphics.drawPoly(
            0,
            0,
            [10, 0, 300, 0, 310, 10, 310, 44, 300, 54, 10, 54, 0, 44, 0, 10],
            "#0A2638",
            "#6AF7FF",
            2,
        );
        continueButton.on(Laya.Event.CLICK, this, this.onOrientationContinue);
        panel.addChild(continueButton);

        const continueLabel = this.createOrientationText("继续使用竖屏  /  CONTINUE", 18, "#E9FDFF", true);
        continueLabel.align = "center";
        continueLabel.valign = "middle";
        continueLabel.width = continueButton.width;
        continueLabel.height = continueButton.height;
        continueButton.addChild(continueLabel);

        this.orientationRoot = root;
    }

    private createOrientationText(text: string, fontSize: number, color: string, bold: boolean): any {
        const label = new Laya.Text();
        label.text = text;
        label.fontSize = fontSize;
        label.color = color;
        label.bold = bold;
        label.mouseEnabled = false;
        return label;
    }

    private onOrientationContinue(event: any): void {
        this.orientationState.acknowledge();
        this.updateOrientationHintVisibility();
        this.stopEvent(event);
        this.flushDeferredPreGameAction();
    }

    private syncOrientationHint(): void {
        if (this.destroyed) {
            return;
        }

        const wasVisible = this.orientationState.isVisible();
        this.orientationState.syncViewport(this.isPortraitViewport());
        this.updateOrientationHintVisibility();
        if (wasVisible && this.orientationState.isAcknowledged()) {
            this.flushDeferredPreGameAction();
        }
    }

    private updateOrientationHintVisibility(): void {
        if (this.orientationRoot) {
            this.orientationRoot.visible = this.orientationState.isVisible() && !this.destroyed;
        }
    }

    private isPortraitViewport(): boolean {
        const documentElement = this.nativeWindow?.document?.documentElement;
        const width = Number(
            this.nativeWindow?.innerWidth
            || documentElement?.clientWidth
            || Laya.Browser?.clientWidth
            || 0,
        );
        const height = Number(
            this.nativeWindow?.innerHeight
            || documentElement?.clientHeight
            || Laya.Browser?.clientHeight
            || 0,
        );
        return width > 0 && height > width;
    }

    private flushDeferredPreGameAction(): void {
        const action = this.deferredPreGameAction;
        this.deferredPreGameAction = null;
        if (action) {
            action();
        }
    }

    private onPointerDown(event: any): void {
        const button = event?.currentTarget || event?.target;
        const control = button?.touchControl as TouchControl | undefined;
        if (!control || !this.isInputAvailable()) {
            return;
        }

        const freshPress = !this.state.isHeld(control);
        this.state.press(control, this.getPointerId(event));
        this.renderAllButtons();
        if (freshPress) {
            this.emitPressSparks(control);
        }
        this.stopEvent(event);
    }

    private onPointerUp(event: any): void {
        this.state.releasePointer(this.getPointerId(event));
        this.renderAllButtons();
    }

    private onPointerOut(event: any): void {
        this.state.releasePointer(this.getPointerId(event));
        this.renderAllButtons();
    }

    private onFocusLost(): void {
        this.resetAll();
    }

    private onVisibilityChanged(visible: boolean): void {
        if (visible === false || Laya.stage?.isVisibility === false) {
            this.resetAll();
        }
    }

    private updateVisibility(): void {
        const shouldShow = this.gameplayActive && !this.runtimeBlocked && !this.destroyed;
        if (!shouldShow) {
            this.resetAll();
        }
        if (this.root) {
            this.root.visible = shouldShow;
        }
    }

    private isInputAvailable(): boolean {
        this.refreshRuntimeBlock();
        return this.gameplayActive && !this.runtimeBlocked && !this.destroyed;
    }

    private refreshRuntimeBlock(): void {
        const blocked = this.runtimeBlockProvider ? this.runtimeBlockProvider() === true : false;
        if (this.runtimeBlocked === blocked) {
            return;
        }
        this.runtimeBlocked = blocked;
        this.updateVisibility();
    }

    private getPointerId(event: any): number {
        return typeof event?.touchId === "number" ? event.touchId : -1;
    }

    private stopEvent(event: any): void {
        if (event && typeof event.stopPropagation === "function") {
            event.stopPropagation();
        }
    }

    private renderAllButtons(): void {
        this.renderButton("left");
        this.renderButton("right");
        this.renderButton("jump");
    }

    private renderButton(control: TouchControl): void {
        const visual = this.buttonVisuals[control];
        if (!visual) {
            return;
        }

        const pressed = this.state.isHeld(control);
        const size = Number(visual.width) || TouchController.DIRECTION_VISIBLE_SIZE;
        const inset = 5;
        const panelSize = size - inset * 2;
        const cut = control === "jump" ? 14 : 12;
        const fill = pressed ? "#0D3F55" : "#06111F";
        const border = pressed ? "#A5FBFF" : "#35E9FF";
        const glyph = pressed ? "#FFFFFF" : "#BFFBFF";
        const graphics = visual.graphics;
        graphics.clear();
        if (pressed) {
            graphics.drawPoly(
                inset - 2,
                inset - 2,
                [cut + 2, 0, panelSize - cut + 2, 0, panelSize + 4, cut + 2,
                    panelSize + 4, panelSize - cut + 2, panelSize - cut + 2, panelSize + 4,
                    cut + 2, panelSize + 4, 0, panelSize - cut + 2, 0, cut + 2],
                null,
                "#4AF4FF",
                2,
            );
        }
        graphics.drawPoly(
            inset,
            inset,
            [cut, 0, panelSize - cut, 0, panelSize, cut, panelSize, panelSize - cut,
                panelSize - cut, panelSize, cut, panelSize, 0, panelSize - cut, 0, cut],
            fill,
            border,
            pressed ? 3 : 2,
        );
        graphics.drawLine(inset + cut, inset + 8, inset + panelSize - cut, inset + 8, pressed ? "#8FFBFF" : "#1A7188", 1);

        const center = size / 2;
        const glyphRadius = control === "jump" ? 19 : 17;
        if (control === "left") {
            graphics.drawPoly(
                center - glyphRadius - 2,
                center,
                [glyphRadius, -glyphRadius, glyphRadius, -7, glyphRadius * 1.7, -7,
                    glyphRadius * 1.7, 7, glyphRadius, 7, glyphRadius, glyphRadius],
                glyph,
            );
            graphics.drawLine(center + 7, center - 17, center + 17, center - 17, pressed ? "#9CFBFF" : "#227D91", 2);
            graphics.drawLine(center + 7, center + 17, center + 17, center + 17, pressed ? "#9CFBFF" : "#227D91", 2);
        } else if (control === "right") {
            graphics.drawPoly(
                center + glyphRadius + 2,
                center,
                [-glyphRadius, -glyphRadius, -glyphRadius, -7, -glyphRadius * 1.7, -7,
                    -glyphRadius * 1.7, 7, -glyphRadius, 7, -glyphRadius, glyphRadius],
                glyph,
            );
            graphics.drawLine(center - 17, center - 17, center - 7, center - 17, pressed ? "#9CFBFF" : "#227D91", 2);
            graphics.drawLine(center - 17, center + 17, center - 7, center + 17, pressed ? "#9CFBFF" : "#227D91", 2);
        } else {
            graphics.drawPoly(
                center,
                center - glyphRadius - 2,
                [-glyphRadius, glyphRadius, -7, glyphRadius, -7, glyphRadius * 1.7,
                    7, glyphRadius * 1.7, 7, glyphRadius, glyphRadius, glyphRadius],
                glyph,
            );
            graphics.drawLine(center - 15, center + 19, center - 8, center + 28, pressed ? "#9CFBFF" : "#227D91", 2);
            graphics.drawLine(center, center + 19, center, center + 31, pressed ? "#FFFFFF" : "#35AABD", 2);
            graphics.drawLine(center + 15, center + 19, center + 8, center + 28, pressed ? "#9CFBFF" : "#227D91", 2);
        }
        visual.alpha = pressed ? 1 : 0.78;
    }

    private emitPressSparks(control: TouchControl): void {
        const visual = this.buttonVisuals[control];
        if (!visual || !Laya.timer) {
            return;
        }

        const burst = new Laya.Sprite();
        burst.name = "MobileTouch_" + control.toUpperCase() + "_PRESS_BURST";
        burst.mouseEnabled = false;
        const center = Number(visual.width) / 2;
        const fragments = control === "jump"
            ? [[-17, 16, -25, 28], [0, 20, 0, 34], [17, 16, 25, 28]]
            : [[-12, -20, -18, -31], [0, -23, 0, -35], [12, -20, 18, -31]];
        for (let index = 0; index < TouchController.PRESS_SPARK_COUNT; index++) {
            const fragment = fragments[index];
            burst.graphics.drawLine(
                center + fragment[0],
                center + fragment[1],
                center + fragment[2],
                center + fragment[3],
                index === 1 ? "#FFFFFF" : "#6AF7FF",
                index === 1 ? 2 : 1,
            );
        }
        visual.addChild(burst);
        this.pressBursts.add(burst);
        Laya.timer.once(180, this, () => this.disposePressBurst(burst));
    }

    private disposePressBurst(burst: any): void {
        if (!this.pressBursts.delete(burst)) {
            return;
        }
        burst.removeSelf();
        burst.destroy(true);
    }
}
