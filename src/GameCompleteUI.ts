declare const Laya: any;

export interface GameCompleteActions {
    playAgain(): void;
    returnToMainMenu(): void;
}

type GameCompleteAction = "PLAY_AGAIN" | "MAIN_MENU";

interface GameCompleteButton {
    root: any;
    face: any;
    glow: any;
    label: any;
    action: GameCompleteAction;
}

export class GameCompleteUI {
    private root: any = null;
    private readonly buttons: GameCompleteButton[] = [];
    private actionLocked: boolean = false;
    private destroyed: boolean = false;

    public constructor(
        private readonly finalLevelScore: number,
        private readonly levelTargetScore: number,
        private readonly actions: GameCompleteActions,
    ) {
        this.mount();
    }

    public destroy(): void {
        if (this.destroyed) return;
        this.destroyed = true;
        this.actionLocked = true;
        if (this.root) {
            this.root.offAll();
            this.root.removeSelf();
            this.root.destroy(true);
            this.root = null;
        }
        this.buttons.length = 0;
    }

    private mount(): void {
        const stageWidth = Math.max(1, Number(Laya.stage?.width) || 1334);
        const stageHeight = Math.max(1, Number(Laya.stage?.height) || 750);
        const root = new Laya.Sprite();
        root.name = "GameCompleteUI";
        root.width = stageWidth;
        root.height = stageHeight;
        root.zOrder = 10006;
        root.mouseEnabled = true;
        root.mouseThrough = false;
        root.on(Laya.Event.MOUSE_DOWN, this, this.blockEvent);
        root.on(Laya.Event.MOUSE_UP, this, this.blockEvent);
        root.on(Laya.Event.CLICK, this, this.blockEvent);
        this.root = root;

        const backdrop = new Laya.Sprite();
        backdrop.name = "GameCompleteUI_Backdrop";
        backdrop.graphics.drawRect(0, 0, stageWidth, stageHeight, "#020713");
        backdrop.mouseEnabled = false;
        root.addChild(backdrop);

        const gridSize = Math.max(54, Math.round(stageWidth / 18));
        const grid = new Laya.Sprite();
        grid.name = "GameCompleteUI_Grid";
        grid.mouseEnabled = false;
        for (let x = 0; x <= stageWidth; x += gridSize) grid.graphics.drawLine(x, 0, x, stageHeight, "#0B2637", 1);
        for (let y = 0; y <= stageHeight; y += gridSize) grid.graphics.drawLine(0, y, stageWidth, y, "#0B2034", 1);
        grid.alpha = 0.78;
        root.addChild(grid);

        const panelWidth = 690;
        const panelHeight = 560;
        const panel = new Laya.Sprite();
        panel.name = "GameCompleteUI_Panel";
        panel.x = Math.round((stageWidth - panelWidth) / 2);
        panel.y = Math.round((stageHeight - panelHeight) / 2);
        panel.width = panelWidth;
        panel.height = panelHeight;
        panel.mouseEnabled = true;
        panel.mouseThrough = false;
        panel.graphics.drawPoly(
            0,
            0,
            [22, 0, panelWidth - 52, 0, panelWidth, 52, panelWidth, panelHeight - 22,
                panelWidth - 22, panelHeight, 52, panelHeight, 0, panelHeight - 52, 0, 22],
            "#06101E",
            "#35E9FF",
            2,
        );
        panel.graphics.drawLine(46, 7, 310, 7, "#83F7FF", 3);
        panel.graphics.drawLine(310, 7, panelWidth - 110, 7, "#8B5CFF", 3);
        panel.graphics.drawLine(46, panelHeight - 8, 224, panelHeight - 8, "#8B5CFF", 2);
        panel.graphics.drawLine(panelWidth - 224, panelHeight - 8, panelWidth - 46, panelHeight - 8, "#35E9FF", 2);
        root.addChild(panel);

        this.addText(panel, "GAME COMPLETE", 48, "#F4FFFF", true, 40, 46, panelWidth - 80, 72);
        this.addText(panel, "ALL 4 LEVELS CLEARED!", 22, "#83F7FF", true, 40, 124, panelWidth - 80, 38);

        const scoreCard = new Laya.Sprite();
        scoreCard.name = "GameCompleteUI_FinalLevelScore";
        scoreCard.x = 145;
        scoreCard.y = 184;
        scoreCard.width = 400;
        scoreCard.height = 112;
        scoreCard.mouseEnabled = false;
        scoreCard.graphics.drawPoly(
            0,
            0,
            [10, 0, 390, 0, 400, 10, 400, 102, 390, 112, 10, 112, 0, 102, 0, 10],
            "#071827",
            "#23677A",
            1,
        );
        panel.addChild(scoreCard);
        this.addText(scoreCard, "FINAL LEVEL SCORE", 15, "#78D7E8", true, 20, 14, 360, 26);
        this.addText(
            scoreCard,
            this.finalLevelScore + " / " + this.levelTargetScore,
            36,
            "#E8FDFF",
            true,
            20,
            44,
            360,
            50,
        );

        const playAgain = this.createButton("PLAY AGAIN", "PLAY_AGAIN", 330, 58, true);
        playAgain.root.x = Math.round((panelWidth - playAgain.root.width) / 2);
        playAgain.root.y = 332;
        panel.addChild(playAgain.root);
        this.buttons.push(playAgain);

        const mainMenu = this.createButton("MAIN MENU", "MAIN_MENU", 330, 58, false);
        mainMenu.root.x = Math.round((panelWidth - mainMenu.root.width) / 2);
        mainMenu.root.y = 410;
        panel.addChild(mainMenu.root);
        this.buttons.push(mainMenu);

        this.addText(panel, "RUN COMPLETE  //  INPUT LOCKED", 12, "#3F7187", true, 40, 500, panelWidth - 80, 20);
        Laya.stage.addChild(root);
    }

    private createButton(
        text: string,
        action: GameCompleteAction,
        width: number,
        height: number,
        primary: boolean,
    ): GameCompleteButton {
        const root = new Laya.Sprite();
        root.name = "GameCompleteUI_" + action;
        root.width = width;
        root.height = height;
        root.mouseEnabled = true;
        root.mouseThrough = false;

        const glow = new Laya.Sprite();
        glow.x = -4;
        glow.y = -4;
        glow.graphics.drawPoly(0, 0, this.cutCorners(width + 8, height + 8, 10), primary ? "#0EA5E9" : "#7047D7");
        glow.alpha = 0.06;
        root.addChild(glow);

        const face = new Laya.Sprite();
        face.width = width;
        face.height = height;
        root.addChild(face);

        const label = this.createText(text, primary ? 22 : 19, "#F0FDFF", true);
        label.width = width;
        label.height = height;
        label.align = "center";
        label.valign = "middle";
        face.addChild(label);

        const button: GameCompleteButton = { root, face, glow, label, action };
        root.gameCompleteButton = button;
        root.on(Laya.Event.CLICK, this, this.onButtonClick);
        root.on(Laya.Event.MOUSE_OVER, this, this.onButtonOver);
        root.on(Laya.Event.MOUSE_OUT, this, this.onButtonOut);
        root.on(Laya.Event.MOUSE_DOWN, this, this.onButtonDown);
        root.on(Laya.Event.MOUSE_UP, this, this.onButtonOver);
        this.drawButton(button, "normal");
        return button;
    }

    private drawButton(button: GameCompleteButton, state: "normal" | "hover" | "pressed"): void {
        const primary = button.action === "PLAY_AGAIN";
        const pressed = state === "pressed";
        const hover = state === "hover";
        const fill = primary
            ? pressed ? "#075071" : hover ? "#075D80" : "#093B55"
            : pressed ? "#152A45" : hover ? "#142C48" : "#0B192C";
        const border = primary ? (hover || pressed ? "#C8FDFF" : "#48EAF4") : (hover || pressed ? "#A996FF" : "#47627A");
        button.face.graphics.clear();
        button.face.graphics.drawPoly(0, 0, this.cutCorners(button.root.width, button.root.height, 9), fill, border, hover ? 3 : 2);
        button.face.graphics.drawLine(18, 5, 92, 5, primary ? "#56F5FF" : "#8B5CFF", 2);
        button.face.graphics.drawLine(button.root.width - 76, button.root.height - 5, button.root.width - 18, button.root.height - 5, border, 1);
        button.face.y = pressed ? 2 : 0;
        button.glow.alpha = pressed ? 0.2 : hover ? 0.14 : 0.06;
        button.label.color = hover || pressed ? "#FFFFFF" : primary ? "#E8FDFF" : "#C7D7E4";
    }

    private onButtonClick(event: any): void {
        this.blockEvent(event);
        if (this.destroyed || this.actionLocked) return;
        const button = (event?.currentTarget || event?.target)?.gameCompleteButton as GameCompleteButton;
        if (!button) return;
        this.actionLocked = true;
        for (const candidate of this.buttons) {
            candidate.root.mouseEnabled = false;
            this.drawButton(candidate, "normal");
        }
        if (button.action === "PLAY_AGAIN") this.actions.playAgain();
        else this.actions.returnToMainMenu();
    }

    private onButtonOver(event: any): void {
        const button = (event?.currentTarget || event?.target)?.gameCompleteButton as GameCompleteButton;
        if (button && !this.actionLocked) this.drawButton(button, "hover");
    }

    private onButtonOut(event: any): void {
        const button = (event?.currentTarget || event?.target)?.gameCompleteButton as GameCompleteButton;
        if (button) this.drawButton(button, "normal");
    }

    private onButtonDown(event: any): void {
        this.blockEvent(event);
        const button = (event?.currentTarget || event?.target)?.gameCompleteButton as GameCompleteButton;
        if (button && !this.actionLocked) this.drawButton(button, "pressed");
    }

    private addText(parent: any, text: string, fontSize: number, color: string, bold: boolean, x: number, y: number, width: number, height: number): void {
        const label = this.createText(text, fontSize, color, bold);
        label.x = x;
        label.y = y;
        label.width = width;
        label.height = height;
        label.align = "center";
        label.valign = "middle";
        parent.addChild(label);
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

    private blockEvent(event: any): void {
        if (event && typeof event.stopPropagation === "function") event.stopPropagation();
    }

    private cutCorners(width: number, height: number, cut: number): number[] {
        return [0, cut, cut, 0, width - cut, 0, width, cut, width, height - cut,
            width - cut, height, cut, height, 0, height - cut];
    }
}
