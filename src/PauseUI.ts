declare const Laya: any;

export interface PauseUIActions {
    requestPause(): void;
    resume(): void;
    restartCurrentAttempt(): void;
    returnToMainMenu(): void;
    toggleMute(): void;
    isMuted(): boolean;
}

type PauseButtonKind = "PRIMARY" | "SECONDARY" | "SETTING";

interface PauseModalButton {
    root: any;
    face: any;
    glow: any;
    label: any;
    kind: PauseButtonKind;
    action: "RESUME" | "RESTART" | "MAIN_MENU" | "MUTE";
}

/** Shared cyber presentation for the gameplay Pause control and Pause modal. */
export class PauseUI {
    private static readonly PAUSE_BUTTON_Z: number = 10000;
    private static readonly PAUSE_MODAL_Z: number = 10004;

    private pauseButton: any = null;
    private pauseButtonFace: any = null;
    private pauseButtonGlow: any = null;
    private modalRoot: any = null;
    private modalButtons: PauseModalButton[] = [];
    private muteButton: PauseModalButton | null = null;
    private modalActionLocked: boolean = false;
    private destroyed: boolean = false;

    public constructor(
        private readonly mobileTouchSession: boolean,
        private readonly actions: PauseUIActions,
    ) {
        this.mountPauseButton();
    }

    public setPauseButtonAvailable(available: boolean): void {
        if (!this.pauseButton) return;
        const interactive = available && !this.destroyed && !this.modalRoot;
        this.pauseButton.visible = interactive;
        this.pauseButton.mouseEnabled = interactive;
        this.drawPauseButton("normal");
    }

    public showPauseModal(): void {
        if (this.destroyed || this.modalRoot) return;
        this.modalActionLocked = false;
        this.setPauseButtonAvailable(false);
        this.mountPauseModal();
        this.refreshSettings();
    }

    public refreshSettings(): void {
        if (this.muteButton) {
            this.muteButton.label.text = "MUTE: " + (this.actions.isMuted() ? "ON" : "OFF");
        }
    }

    public lockModalActions(): boolean {
        if (!this.modalRoot || this.modalActionLocked) return false;
        this.modalActionLocked = true;
        for (const button of this.modalButtons) {
            button.root.mouseEnabled = false;
            this.drawModalButton(button, "normal");
        }
        return true;
    }

    public hidePauseModal(): void {
        if (!this.modalRoot) return;
        this.modalRoot.offAll();
        this.modalRoot.removeSelf();
        this.modalRoot.destroy(true);
        this.modalRoot = null;
        this.modalButtons = [];
        this.muteButton = null;
        this.modalActionLocked = false;
    }

    public destroy(): void {
        if (this.destroyed) return;
        this.destroyed = true;
        this.hidePauseModal();
        if (this.pauseButton) {
            this.pauseButton.offAll();
            this.pauseButton.removeSelf();
            this.pauseButton.destroy(true);
        }
        this.pauseButton = null;
        this.pauseButtonFace = null;
        this.pauseButtonGlow = null;
    }

    private mountPauseButton(): void {
        const width = 64;
        const visibleWidth = 50;
        const visibleRightInset = 4;
        const visibleX = width - visibleRightInset - visibleWidth;
        const height = 50;
        const button = new Laya.Sprite();
        button.name = "PauseUI_PauseButton";
        button.x = Math.max(18, (Number(Laya.stage?.width) || 1334) - width - 34);
        button.y = 28;
        button.width = width;
        button.height = height;
        button.zOrder = PauseUI.PAUSE_BUTTON_Z;
        button.visible = false;
        button.mouseEnabled = false;
        button.mouseThrough = false;
        button.alpha = 0.5;

        const glow = new Laya.Sprite();
        glow.name = "PauseUI_PauseGlow";
        glow.x = visibleX - 4;
        glow.y = -4;
        glow.graphics.drawPoly(0, 0, this.cutCornerPoints(visibleWidth + 8, height + 8, 9), "#0EA5E9");
        glow.alpha = 0.08;
        button.addChild(glow);

        const face = new Laya.Sprite();
        face.name = "PauseUI_PauseFace";
        face.x = visibleX;
        face.width = visibleWidth;
        face.height = height;
        button.addChild(face);

        const glyph = new Laya.Sprite();
        glyph.name = "PauseUI_PauseGlyph";
        glyph.mouseEnabled = false;
        glyph.graphics.drawRect(14, 15, 7, 20, "#D9FCFF");
        glyph.graphics.drawRect(29, 15, 7, 20, "#D9FCFF");
        face.addChild(glyph);

        button.on(Laya.Event.CLICK, this, this.onPauseButtonClick);
        button.on(Laya.Event.MOUSE_OVER, this, this.onPauseButtonOver);
        button.on(Laya.Event.MOUSE_OUT, this, this.onPauseButtonOut);
        button.on(Laya.Event.MOUSE_DOWN, this, this.onPauseButtonDown);
        button.on(Laya.Event.MOUSE_UP, this, this.onPauseButtonOver);

        this.pauseButton = button;
        this.pauseButtonFace = face;
        this.pauseButtonGlow = glow;
        this.drawPauseButton("normal");
        Laya.stage.addChild(button);
    }

    private drawPauseButton(state: "normal" | "hover" | "pressed"): void {
        if (!this.pauseButtonFace || !this.pauseButtonGlow) return;
        const width = Number(this.pauseButtonFace.width) || 50;
        const height = Number(this.pauseButton?.height) || 50;
        const pressed = state === "pressed";
        const hover = state === "hover";
        this.pauseButtonFace.graphics.clear();
        this.pauseButtonFace.graphics.drawPoly(
            0,
            0,
            this.cutCornerPoints(width, height, 8),
            pressed ? "#0C3043" : hover ? "#09283A" : "#071827",
            hover || pressed ? "#83FAFF" : "#28DDEC",
            pressed ? 3 : 2,
        );
        this.pauseButtonFace.graphics.drawLine(12, 5, 48, 5, "#8B5CFF", 2);
        this.pauseButtonFace.graphics.drawLine(width - 34, height - 5, width - 12, height - 5, "#39F4FF", 1);
        this.pauseButtonGlow.alpha = pressed ? 0.2 : hover ? 0.16 : 0.08;
        this.pauseButtonFace.y = pressed ? 2 : 0;
        this.pauseButton.alpha = pressed ? 1 : hover ? 0.78 : 0.5;
    }

    private mountPauseModal(): void {
        const stageWidth = Math.max(1, Number(Laya.stage?.width) || 1334);
        const stageHeight = Math.max(1, Number(Laya.stage?.height) || 750);
        const panelWidth = 520;
        const panelHeight = 500;

        const root = new Laya.Sprite();
        root.name = "PauseUI_Modal";
        root.width = stageWidth;
        root.height = stageHeight;
        root.zOrder = PauseUI.PAUSE_MODAL_Z;
        root.mouseEnabled = true;
        root.mouseThrough = false;
        root.on(Laya.Event.MOUSE_DOWN, this, this.blockEvent);
        root.on(Laya.Event.MOUSE_UP, this, this.blockEvent);
        root.on(Laya.Event.CLICK, this, this.blockEvent);

        const dim = new Laya.Sprite();
        dim.name = "PauseUI_Dim";
        dim.mouseEnabled = false;
        dim.graphics.drawRect(0, 0, stageWidth, stageHeight, "#02050C");
        dim.alpha = 0.74;
        root.addChild(dim);

        const panel = new Laya.Sprite();
        panel.name = "PauseUI_Panel";
        panel.x = Math.round((stageWidth - panelWidth) / 2);
        panel.y = Math.round((stageHeight - panelHeight) / 2);
        panel.width = panelWidth;
        panel.height = panelHeight;
        panel.mouseEnabled = true;
        panel.graphics.drawPoly(
            0,
            0,
            this.cutCornerPoints(panelWidth, panelHeight, 18),
            "#06101E",
            "#26E7F2",
            2,
        );
        panel.graphics.drawPoly(
            10,
            10,
            this.cutCornerPoints(panelWidth - 20, panelHeight - 20, 13),
            null,
            "#1B4260",
            1,
        );
        panel.graphics.drawLine(42, 6, 214, 6, "#67F7FF", 3);
        panel.graphics.drawLine(214, 6, 310, 6, "#8B5CFF", 3);
        panel.graphics.drawLine(panelWidth - 156, panelHeight - 7, panelWidth - 42, panelHeight - 7, "#26E7F2", 2);
        root.addChild(panel);

        const status = this.createText("SYS://SESSION CONTROL", 13, "#46DFF0", true);
        status.x = 36;
        status.y = 24;
        status.width = panelWidth - 72;
        status.height = 20;
        status.align = "center";
        panel.addChild(status);

        const title = this.createText("PAUSED", 38, "#F0FDFF", true);
        title.x = 36;
        title.y = 50;
        title.width = panelWidth - 72;
        title.height = 52;
        title.align = "center";
        title.valign = "middle";
        title.stroke = 2;
        title.strokeColor = "#075E72";
        panel.addChild(title);

        const subtitle = this.createText("SIMULATION HOLD  //  AUDIO LINK ACTIVE", 13, "#809FB2", false);
        subtitle.x = 30;
        subtitle.y = 101;
        subtitle.width = panelWidth - 60;
        subtitle.height = 20;
        subtitle.align = "center";
        panel.addChild(subtitle);

        const buttonWidth = 360;
        const buttonHeight = 56;
        const buttonX = Math.round((panelWidth - buttonWidth) / 2);
        let buttonY = 142;
        const resume = this.createModalButton("RESUME", "RESUME", "PRIMARY", buttonWidth, buttonHeight);
        resume.root.x = buttonX;
        resume.root.y = buttonY;
        panel.addChild(resume.root);
        this.modalButtons.push(resume);

        buttonY += 70;
        const restart = this.createModalButton("RESTART", "RESTART", "SECONDARY", buttonWidth, buttonHeight);
        restart.root.x = buttonX;
        restart.root.y = buttonY;
        panel.addChild(restart.root);
        this.modalButtons.push(restart);

        buttonY += 70;
        const mainMenu = this.createModalButton("MAIN MENU", "MAIN_MENU", "SECONDARY", buttonWidth, buttonHeight);
        mainMenu.root.x = buttonX;
        mainMenu.root.y = buttonY;
        panel.addChild(mainMenu.root);
        this.modalButtons.push(mainMenu);

        buttonY += 70;
        const mute = this.createModalButton("MUTE: OFF", "MUTE", "SETTING", buttonWidth, buttonHeight);
        mute.root.x = buttonX;
        mute.root.y = buttonY;
        panel.addChild(mute.root);
        this.modalButtons.push(mute);
        this.muteButton = mute;

        const footer = this.createText(
            this.mobileTouchSession ? "TOUCH SESSION  //  CURRENT LEVEL LOCKED" : "P  RESUME  //  CURRENT LEVEL LOCKED",
            12,
            "#3F7187",
            true,
        );
        footer.x = 30;
        footer.y = panelHeight - 37;
        footer.width = panelWidth - 60;
        footer.height = 18;
        footer.align = "center";
        panel.addChild(footer);

        this.modalRoot = root;
        Laya.stage.addChild(root);
    }

    private createModalButton(
        text: string,
        action: PauseModalButton["action"],
        kind: PauseButtonKind,
        width: number,
        height: number,
    ): PauseModalButton {
        const root = new Laya.Sprite();
        root.name = "PauseUI_" + action;
        root.width = width;
        root.height = height;
        root.mouseEnabled = true;
        root.mouseThrough = false;

        const glow = new Laya.Sprite();
        glow.x = -4;
        glow.y = -4;
        glow.graphics.drawPoly(0, 0, this.cutCornerPoints(width + 8, height + 8, 10), kind === "PRIMARY" ? "#0EA5E9" : "#7047D7");
        glow.alpha = 0.05;
        root.addChild(glow);

        const face = new Laya.Sprite();
        face.width = width;
        face.height = height;
        root.addChild(face);

        const label = this.createText(text, kind === "PRIMARY" ? 22 : 19, "#F0FDFF", true);
        label.width = width;
        label.height = height;
        label.align = "center";
        label.valign = "middle";
        face.addChild(label);

        const button: PauseModalButton = { root, face, glow, label, kind, action };
        (root as any).pauseButtonModel = button;
        root.on(Laya.Event.CLICK, this, this.onModalButtonClick);
        root.on(Laya.Event.MOUSE_OVER, this, this.onModalButtonOver);
        root.on(Laya.Event.MOUSE_OUT, this, this.onModalButtonOut);
        root.on(Laya.Event.MOUSE_DOWN, this, this.onModalButtonDown);
        root.on(Laya.Event.MOUSE_UP, this, this.onModalButtonOver);
        this.drawModalButton(button, "normal");
        return button;
    }

    private drawModalButton(button: PauseModalButton, state: "normal" | "hover" | "pressed"): void {
        const width = Number(button.root.width) || 360;
        const height = Number(button.root.height) || 56;
        const primary = button.kind === "PRIMARY";
        const pressed = state === "pressed";
        const hover = state === "hover";
        const fill = primary
            ? pressed ? "#075071" : hover ? "#075D80" : "#093B55"
            : pressed ? "#152A45" : hover ? "#142C48" : "#0B192C";
        const border = primary ? (hover || pressed ? "#C8FDFF" : "#48EAF4") : (hover || pressed ? "#A996FF" : "#47627A");
        button.face.graphics.clear();
        button.face.graphics.drawPoly(0, 0, this.cutCornerPoints(width, height, 9), fill, border, hover ? 3 : 2);
        button.face.graphics.drawLine(18, 5, 92, 5, primary ? "#56F5FF" : "#8B5CFF", 2);
        button.face.graphics.drawLine(width - 76, height - 5, width - 18, height - 5, border, 1);
        button.face.y = pressed ? 2 : 0;
        button.glow.alpha = pressed ? 0.2 : hover ? 0.14 : 0.05;
        button.label.color = hover || pressed ? "#FFFFFF" : primary ? "#E8FDFF" : "#C7D7E4";
    }

    private onPauseButtonClick(event: any): void {
        this.blockEvent(event);
        if (!this.pauseButton?.visible || !this.pauseButton?.mouseEnabled) return;
        this.setPauseButtonAvailable(false);
        this.actions.requestPause();
    }

    private onPauseButtonOver(): void {
        this.drawPauseButton("hover");
    }

    private onPauseButtonOut(): void {
        this.drawPauseButton("normal");
    }

    private onPauseButtonDown(event: any): void {
        this.blockEvent(event);
        this.drawPauseButton("pressed");
    }

    private onModalButtonClick(event: any): void {
        this.blockEvent(event);
        if (this.modalActionLocked) return;
        const button = (event?.currentTarget || event?.target)?.pauseButtonModel as PauseModalButton;
        if (!button) return;

        if (button.action === "RESUME") {
            this.actions.resume();
            return;
        }
        if (button.action === "RESTART") {
            this.actions.restartCurrentAttempt();
            return;
        }
        if (button.action === "MAIN_MENU") {
            this.actions.returnToMainMenu();
            return;
        }
        if (button.action === "MUTE") {
            this.actions.toggleMute();
            this.refreshSettings();
        }
    }

    private onModalButtonOver(event: any): void {
        const button = (event?.currentTarget || event?.target)?.pauseButtonModel as PauseModalButton;
        if (button && !this.modalActionLocked) this.drawModalButton(button, "hover");
    }

    private onModalButtonOut(event: any): void {
        const button = (event?.currentTarget || event?.target)?.pauseButtonModel as PauseModalButton;
        if (button) this.drawModalButton(button, "normal");
    }

    private onModalButtonDown(event: any): void {
        this.blockEvent(event);
        const button = (event?.currentTarget || event?.target)?.pauseButtonModel as PauseModalButton;
        if (button && !this.modalActionLocked) this.drawModalButton(button, "pressed");
    }

    private blockEvent(event: any): void {
        if (event && typeof event.stopPropagation === "function") {
            event.stopPropagation();
        }
    }

    private createText(text: string, fontSize: number, color: string, bold: boolean): any {
        const label = new Laya.Text();
        label.text = text;
        label.font = "Arial";
        label.fontSize = fontSize;
        label.color = color;
        label.bold = bold;
        label.mouseEnabled = false;
        return label;
    }

    private cutCornerPoints(width: number, height: number, cut: number): number[] {
        return [
            0, cut,
            cut, 0,
            width - cut, 0,
            width, cut,
            width, height - cut,
            width - cut, height,
            cut, height,
            0, height - cut,
        ];
    }
}
