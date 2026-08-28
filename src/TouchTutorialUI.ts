declare const Laya: any;

import { TOUCH_CONTROL_LAYOUT, TouchControl, TouchControlLayout, TouchController } from "./TouchController";

type TouchTutorialStep = 1 | 2;

export class TouchTutorialUI {
    private static readonly ADVANCE_LATCH_MS: number = 180;
    private static shownThisSession: boolean = false;

    private root: any = null;
    private stepRoot: any = null;
    private guidePanel: any = null;
    private yesButton: any = null;
    private step: TouchTutorialStep = 1;
    private advanceLocked: boolean = false;
    private destroyed: boolean = false;
    private completion: (() => void) | null;

    private constructor(completion: () => void) {
        this.completion = completion;
    }

    public static showOnce(completion: () => void): TouchTutorialUI | null {
        if (TouchTutorialUI.shownThisSession) {
            return null;
        }

        const tutorial = new TouchTutorialUI(completion);
        try {
            tutorial.mount();
            TouchTutorialUI.shownThisSession = true;
            return tutorial;
        } catch (error) {
            tutorial.destroy();
            console.error("Touch tutorial presentation failed.", error);
            return null;
        }
    }

    public static hasShownThisSession(): boolean {
        return TouchTutorialUI.shownThisSession;
    }

    public destroy(): void {
        if (this.destroyed) {
            return;
        }
        this.destroyed = true;
        this.completion = null;
        this.teardown();
    }

    private mount(): void {
        const root = new Laya.Sprite();
        root.name = "TouchTutorialModal";
        root.width = TouchController.STAGE_WIDTH;
        root.height = TouchController.STAGE_HEIGHT;
        root.zOrder = 10002;
        root.mouseEnabled = true;
        root.mouseThrough = false;

        const dim = new Laya.Sprite();
        dim.name = "TouchTutorial_Dim";
        dim.width = TouchController.STAGE_WIDTH;
        dim.height = TouchController.STAGE_HEIGHT;
        dim.mouseEnabled = true;
        dim.mouseThrough = false;
        dim.graphics.drawRect(0, 0, dim.width, dim.height, "#020713");
        dim.alpha = 0.62;
        root.addChild(dim);

        root.on(Laya.Event.MOUSE_DOWN, this, this.blockInput);
        root.on(Laya.Event.MOUSE_UP, this, this.blockInput);
        root.on(Laya.Event.CLICK, this, this.blockInput);

        Laya.stage.addChild(root);
        this.root = root;
        this.renderStep();
    }

    private renderStep(): void {
        this.clearStepRoot();
        if (!this.root || this.destroyed) {
            return;
        }

        const stepRoot = new Laya.Sprite();
        stepRoot.name = "TouchTutorial_STEP_" + this.step;
        stepRoot.mouseEnabled = true;
        stepRoot.mouseThrough = true;
        this.root.addChild(stepRoot);
        this.stepRoot = stepRoot;

        if (this.step === 1) {
            this.drawControlFocus(stepRoot, "left", "LEFT");
            this.drawControlFocus(stepRoot, "right", "RIGHT");
            this.drawGuidePanel(stepRoot, "STEP 1  /  MOVE", "Use LEFT / RIGHT to move.");
        } else {
            this.drawControlFocus(stepRoot, "jump", "JUMP");
            this.drawGuidePanel(stepRoot, "STEP 2  /  JUMP", "Tap JUMP to jump.");
        }
    }

    private drawGuidePanel(root: any, titleCopy: string, detailCopy: string): void {
        const panelWidth = 590;
        const panelHeight = 250;
        const panel = new Laya.Sprite();
        panel.name = "TouchTutorial_GuidePanel";
        panel.x = (TouchController.STAGE_WIDTH - panelWidth) / 2;
        panel.y = 174;
        panel.width = panelWidth;
        panel.height = panelHeight;
        panel.mouseEnabled = true;
        panel.mouseThrough = false;
        panel.graphics.drawPoly(
            0,
            0,
            this.cutCornerPoints(panelWidth, panelHeight, 18),
            "#071424",
            "#35E9FF",
            2
        );
        panel.graphics.drawLine(22, 10, 174, 10, "#83F7FF", 2);
        panel.graphics.drawLine(panelWidth - 164, panelHeight - 10, panelWidth - 22, panelHeight - 10, "#6F5CFF", 2);
        panel.on(Laya.Event.MOUSE_DOWN, this, this.blockInput);
        panel.on(Laya.Event.MOUSE_UP, this, this.blockInput);
        panel.on(Laya.Event.CLICK, this, this.blockInput);
        root.addChild(panel);
        this.guidePanel = panel;

        const status = this.createText("TOUCH LINK  //  0" + this.step + " OF 02", 14, "#63EAF7", true);
        status.x = 34;
        status.y = 34;
        status.width = panelWidth - 68;
        status.height = 22;
        status.align = "center";
        panel.addChild(status);

        const title = this.createText(titleCopy, 34, "#F4FEFF", true);
        title.x = 34;
        title.y = 70;
        title.width = panelWidth - 68;
        title.height = 48;
        title.align = "center";
        panel.addChild(title);

        const detail = this.createText(detailCopy, 21, "#C5D9E8", false);
        detail.x = 34;
        detail.y = 126;
        detail.width = panelWidth - 68;
        detail.height = 32;
        detail.align = "center";
        panel.addChild(detail);

        this.createYesButton(panel, panelWidth);
    }

    private createYesButton(panel: any, panelWidth: number): void {
        const buttonWidth = 220;
        const buttonHeight = 48;
        const button = new Laya.Sprite();
        button.name = "TouchTutorial_YES";
        button.x = Math.round((panelWidth - buttonWidth) / 2);
        button.y = 178;
        button.width = buttonWidth;
        button.height = buttonHeight + 5;
        button.mouseEnabled = true;
        button.mouseThrough = false;

        const glow = new Laya.Sprite();
        glow.name = "TouchTutorial_YES_Glow";
        glow.x = -4;
        glow.y = -4;
        glow.graphics.drawRect(0, 0, buttonWidth + 8, buttonHeight + 8, "#0EA5E9");
        button.addChild(glow);

        const side = new Laya.Sprite();
        side.name = "TouchTutorial_YES_Side";
        side.y = 5;
        side.graphics.drawPoly(0, 0, this.cutCornerPoints(buttonWidth, buttonHeight, 10), "#030712", "#1E3A5F", 1);
        button.addChild(side);

        const face = new Laya.Sprite();
        face.name = "TouchTutorial_YES_Face";
        face.width = buttonWidth;
        face.height = buttonHeight;
        button.addChild(face);

        const label = this.createText("YES", 22, "#FFFFFF", true);
        label.name = "TouchTutorial_YES_Label";
        label.font = "Courier New";
        label.align = "center";
        label.valign = "middle";
        label.width = buttonWidth;
        label.height = buttonHeight;
        face.addChild(label);

        const accent = new Laya.Sprite();
        accent.name = "TouchTutorial_YES_Accent";
        face.addChild(accent);

        button.tutorialGlow = glow;
        button.tutorialFace = face;
        button.tutorialLabel = label;
        button.tutorialAccent = accent;
        this.yesButton = button;
        this.drawYesButton("normal");

        button.on(Laya.Event.CLICK, this, this.confirmYes);
        button.on(Laya.Event.MOUSE_OVER, this, this.onYesOver);
        button.on(Laya.Event.MOUSE_OUT, this, this.onYesOut);
        button.on(Laya.Event.MOUSE_DOWN, this, this.onYesDown);
        button.on(Laya.Event.MOUSE_UP, this, this.onYesUp);
        panel.addChild(button);
    }

    private drawYesButton(state: "normal" | "hover" | "pressed"): void {
        const button = this.yesButton;
        if (!button?.tutorialFace?.graphics) {
            return;
        }

        const buttonWidth = button.width;
        const buttonHeight = button.height - 5;
        const fill = state === "pressed" ? "#075A9D" : state === "hover" ? "#0B4772" : "#0B3556";
        const border = state === "pressed" ? "#CFFAFE" : state === "hover" ? "#67E8F9" : "#38BDF8";
        button.tutorialFace.graphics.clear();
        button.tutorialFace.graphics.drawPoly(
            0,
            0,
            this.cutCornerPoints(buttonWidth, buttonHeight, 10),
            fill,
            border,
            2
        );
        button.tutorialAccent.graphics.clear();
        button.tutorialAccent.graphics.drawRect(20, 0, buttonWidth - 40, 3, "#22D3EE");
        button.tutorialFace.y = state === "pressed" ? 3 : 0;
        button.tutorialGlow.alpha = state === "pressed" ? 0.28 : state === "hover" ? 0.2 : 0.1;
        button.tutorialLabel.color = state === "normal" ? "#F8FAFC" : "#FFFFFF";
    }

    private onYesOver(event: any): void {
        this.stopEvent(event);
        this.drawYesButton("hover");
    }

    private onYesOut(event: any): void {
        this.stopEvent(event);
        this.drawYesButton("normal");
    }

    private onYesDown(event: any): void {
        this.stopEvent(event);
        this.drawYesButton("pressed");
    }

    private onYesUp(event: any): void {
        this.stopEvent(event);
        this.drawYesButton("hover");
    }

    private drawControlFocus(root: any, control: TouchControl, labelCopy: string): void {
        const layout = TOUCH_CONTROL_LAYOUT[control];
        const pad = 12;
        const frame = new Laya.Sprite();
        frame.name = "TouchTutorial_Focus_" + control.toUpperCase();
        frame.x = layout.visibleX - pad;
        frame.y = layout.visibleY - pad;
        frame.width = layout.visibleSize + pad * 2;
        frame.height = layout.visibleSize + pad * 2;
        frame.mouseEnabled = false;
        frame.graphics.drawPoly(
            0,
            0,
            this.cutCornerPoints(frame.width, frame.height, 14),
            null,
            "#83F7FF",
            4
        );
        frame.graphics.drawPoly(
            6,
            6,
            this.cutCornerPoints(frame.width - 12, frame.height - 12, 10),
            null,
            "#22D3EE",
            1
        );
        root.addChild(frame);

        const labelWidth = control === "jump" ? 128 : 112;
        const label = this.createText(labelCopy, 14, "#E8FDFF", true);
        label.name = "TouchTutorial_Label_" + control.toUpperCase();
        label.x = this.clampFocusLabelX(layout, labelWidth);
        label.y = layout.visibleY - 48;
        label.width = labelWidth;
        label.height = 26;
        label.align = "center";
        label.valign = "middle";
        label.graphics.drawRect(0, 0, labelWidth, 26, "#0A2638", "#35E9FF", 1);
        root.addChild(label);
    }

    private clampFocusLabelX(layout: TouchControlLayout, width: number): number {
        const centered = layout.visibleX + layout.visibleSize / 2 - width / 2;
        return Math.max(12, Math.min(TouchController.STAGE_WIDTH - width - 12, centered));
    }

    private confirmYes(event: any): void {
        this.stopEvent(event);
        if (this.destroyed || this.advanceLocked) {
            return;
        }

        this.advanceLocked = true;
        if (this.step === 1) {
            this.step = 2;
            this.renderStep();
            Laya.timer.once(TouchTutorialUI.ADVANCE_LATCH_MS, this, this.releaseAdvanceLatch);
            return;
        }

        this.complete();
    }

    private releaseAdvanceLatch(): void {
        this.advanceLocked = false;
    }

    private complete(): void {
        if (this.destroyed) {
            return;
        }
        const completion = this.completion;
        this.completion = null;
        this.destroyed = true;
        this.teardown();
        if (completion) {
            completion();
        }
    }

    private teardown(): void {
        if (this.root) {
            this.root.visible = false;
            this.root.mouseEnabled = false;
        }
        Laya.timer?.clear(this, this.releaseAdvanceLatch);
        this.advanceLocked = false;
        this.clearStepRoot();
        if (!this.root) {
            return;
        }

        this.root.off(Laya.Event.MOUSE_DOWN, this, this.blockInput);
        this.root.off(Laya.Event.MOUSE_UP, this, this.blockInput);
        this.root.off(Laya.Event.CLICK, this, this.blockInput);
        this.root.removeSelf();
        this.root.destroy(true);
        this.root = null;
    }

    private clearStepRoot(): void {
        if (this.yesButton) {
            this.yesButton.off(Laya.Event.CLICK, this, this.confirmYes);
            this.yesButton.off(Laya.Event.MOUSE_OVER, this, this.onYesOver);
            this.yesButton.off(Laya.Event.MOUSE_OUT, this, this.onYesOut);
            this.yesButton.off(Laya.Event.MOUSE_DOWN, this, this.onYesDown);
            this.yesButton.off(Laya.Event.MOUSE_UP, this, this.onYesUp);
            this.yesButton = null;
        }
        if (this.guidePanel) {
            this.guidePanel.off(Laya.Event.MOUSE_DOWN, this, this.blockInput);
            this.guidePanel.off(Laya.Event.MOUSE_UP, this, this.blockInput);
            this.guidePanel.off(Laya.Event.CLICK, this, this.blockInput);
            this.guidePanel = null;
        }
        if (!this.stepRoot) {
            return;
        }
        this.stepRoot.removeSelf();
        this.stepRoot.destroy(true);
        this.stepRoot = null;
    }

    private blockInput(event: any): void {
        this.stopEvent(event);
    }

    private stopEvent(event: any): void {
        if (event && typeof event.stopPropagation === "function") {
            event.stopPropagation();
        }
    }

    private createText(text: string, fontSize: number, color: string, bold: boolean): any {
        const label = new Laya.Text();
        label.text = text;
        label.fontSize = fontSize;
        label.color = color;
        label.bold = bold;
        label.mouseEnabled = false;
        return label;
    }

    private cutCornerPoints(width: number, height: number, cut: number): number[] {
        return [
            cut, 0,
            width - cut, 0,
            width, cut,
            width, height - cut,
            width - cut, height,
            cut, height,
            0, height - cut,
            0, cut,
        ];
    }
}
