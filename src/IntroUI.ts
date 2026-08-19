declare var Laya: any;

export class IntroUI {
    private static readonly MAIN_MENU: "MAIN_MENU" = "MAIN_MENU";
    private static readonly HOW_TO_PLAY: "HOW_TO_PLAY" = "HOW_TO_PLAY";

    private static view: "MAIN_MENU" | "HOW_TO_PLAY" = IntroUI.MAIN_MENU;
    private static selectedIndex: 0 | 1 = 0;
    private static started: boolean = false;
    private static keyboardBound: boolean = false;
    private static startHandler: (() => void) | null = null;
    private static container: any = null;
    private static panel: any = null;
    private static viewRoot: any = null;
    private static menuItems: any[] = [];
    private static boundItems: any[] = [];

    public static show(onStart: () => void): void {
        if (IntroUI.started || IntroUI.container) {
            return;
        }

        IntroUI.startHandler = onStart;
        IntroUI.view = IntroUI.MAIN_MENU;
        IntroUI.selectedIndex = 0;
        IntroUI.createShell();
        IntroUI.renderMainMenu();
        IntroUI.bindKeyboard();
    }

    private static createShell(): void {
        const container = new Laya.Sprite();
        const panelWidth = 720;
        const panelHeight = 560;

        container.zOrder = 10001;

        const overlay = new Laya.Sprite();
        overlay.mouseEnabled = false;
        overlay.graphics.drawRect(
            0,
            0,
            Laya.stage.width,
            Laya.stage.height,
            "#000000"
        );
        overlay.alpha = 0.62;
        container.addChild(overlay);

        const panel = new Laya.Sprite();
        panel.width = panelWidth;
        panel.height = panelHeight;
        panel.x = (Laya.stage.width - panelWidth) / 2;
        panel.y = (Laya.stage.height - panelHeight) / 2;
        panel.graphics.drawRect(0, 0, panelWidth, panelHeight, "#111827", "#60A5FA", 2);
        panel.graphics.drawRect(0, 0, panelWidth, 8, "#38BDF8");

        container.addChild(panel);
        Laya.stage.addChild(container);

        IntroUI.container = container;
        IntroUI.panel = panel;
    }

    private static renderMainMenu(): void {
        IntroUI.clearView();
        IntroUI.viewRoot = new Laya.Sprite();
        IntroUI.panel.addChild(IntroUI.viewRoot);

        const title = IntroUI.createText("BALL GAME", 42, "#F8FAFC", true);
        title.align = "center";
        title.valign = "middle";
        title.x = 40;
        title.y = 28;
        title.width = 640;
        title.height = 58;
        IntroUI.viewRoot.addChild(title);

        const subtitle = IntroUI.createText("MAIN MENU", 20, "#CBD5E1", true);
        subtitle.align = "center";
        subtitle.valign = "middle";
        subtitle.x = 40;
        subtitle.y = 92;
        subtitle.width = 640;
        subtitle.height = 32;
        IntroUI.viewRoot.addChild(subtitle);

        const startButton = IntroUI.createButton("START GAME", 560, 70);
        startButton.x = 80;
        startButton.y = 170;

        const howToPlayButton = IntroUI.createButton("HOW TO PLAY", 560, 70);
        howToPlayButton.x = 80;
        howToPlayButton.y = 270;

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
            "W / Up: previous    S / Down: next    Enter: confirm",
            18,
            "#CBD5E1",
            false
        );
        hint.align = "center";
        hint.valign = "middle";
        hint.x = 40;
        hint.y = 410;
        hint.width = 640;
        hint.height = 34;
        IntroUI.viewRoot.addChild(hint);

        const touchHint = IntroUI.createText("Mouse or touch an item to select and confirm", 16, "#94A3B8", false);
        touchHint.align = "center";
        touchHint.valign = "middle";
        touchHint.x = 40;
        touchHint.y = 458;
        touchHint.width = 640;
        touchHint.height = 28;
        IntroUI.viewRoot.addChild(touchHint);
    }

    private static renderHowToPlay(): void {
        IntroUI.clearView();
        IntroUI.viewRoot = new Laya.Sprite();
        IntroUI.panel.addChild(IntroUI.viewRoot);

        const title = IntroUI.createText("HOW TO PLAY", 34, "#F8FAFC", true);
        title.align = "center";
        title.valign = "middle";
        title.x = 40;
        title.y = 28;
        title.width = 640;
        title.height = 52;
        IntroUI.viewRoot.addChild(title);

        const instructions = IntroUI.createText(
            "MOVE              A / D or Left / Right\n" +
            "JUMP              W or Up\n" +
            "NEXT LEVEL        R after a win\n" +
            "MUTE              M\n" +
            "GOAL              Reach score 5 to win.",
            22,
            "#F8FAFC",
            false
        );
        instructions.leading = 14;
        instructions.x = 94;
        instructions.y = 128;
        instructions.width = 532;
        instructions.height = 190;
        IntroUI.viewRoot.addChild(instructions);

        const backButton = IntroUI.createButton("BACK", 560, 70);
        backButton.x = 80;
        backButton.y = 382;
        IntroUI.viewRoot.addChild(backButton);
        IntroUI.updateButton(backButton, true);
        backButton.on(Laya.Event.CLICK, IntroUI, IntroUI.onBackClick);
        IntroUI.boundItems.push(backButton);

        const hint = IntroUI.createText("Enter or Esc: back", 18, "#CBD5E1", false);
        hint.align = "center";
        hint.valign = "middle";
        hint.x = 40;
        hint.y = 478;
        hint.width = 640;
        hint.height = 30;
        IntroUI.viewRoot.addChild(hint);
    }

    private static createText(text: string, fontSize: number, color: string, bold: boolean): any {
        const label = new Laya.Text();
        label.text = text;
        label.fontSize = fontSize;
        label.color = color;
        label.bold = bold;
        label.mouseEnabled = false;
        return label;
    }

    private static createButton(text: string, width: number, height: number): any {
        const button = new Laya.Sprite();
        button.width = width;
        button.height = height;
        button.mouseEnabled = true;

        const label = IntroUI.createText(text, 26, "#F8FAFC", true);
        label.align = "center";
        label.valign = "middle";
        label.x = 0;
        label.y = 0;
        label.width = width;
        label.height = height;
        button.addChild(label);
        button.menuLabel = label;

        return button;
    }

    private static updateMainSelection(): void {
        for (let index = 0; index < IntroUI.menuItems.length; index++) {
            IntroUI.updateButton(IntroUI.menuItems[index], index === IntroUI.selectedIndex);
        }
    }

    private static updateButton(button: any, selected: boolean): void {
        const fill = selected ? "#2563EB" : "#1F2937";
        const border = selected ? "#BAE6FD" : "#475569";
        button.graphics.clear();
        button.graphics.drawRect(0, 0, button.width, button.height, fill, border, 2);
        button.menuLabel.color = selected ? "#FFFFFF" : "#E2E8F0";
        button.menuLabel.bold = selected;
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

    private static onKeyDown(event: any): void {
        const keyCode = event ? event.keyCode : null;
        const key = event ? event.key : "";
        const isEnter = keyCode === 13 || key === "Enter";
        const isEscape = keyCode === 27 || key === "Escape" || key === "Esc";

        if (IntroUI.view === IntroUI.HOW_TO_PLAY) {
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

    private static acceptStart(): void {
        if (IntroUI.started || IntroUI.view !== IntroUI.MAIN_MENU || IntroUI.selectedIndex !== 0) {
            return;
        }

        IntroUI.started = true;
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
        IntroUI.keyboardBound = true;
    }

    private static unbindKeyboard(): void {
        if (!IntroUI.keyboardBound) {
            return;
        }
        Laya.stage.off(Laya.Event.KEY_DOWN, IntroUI, IntroUI.onKeyDown);
        IntroUI.keyboardBound = false;
    }

    private static clearView(): void {
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
