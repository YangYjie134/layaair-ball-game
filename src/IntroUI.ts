declare var Laya: any;

export class IntroUI { 
    private static created: boolean = false;
    private static panel: any = null;

    public static show(): void {
        if (IntroUI.created) {
            return;
        }

        IntroUI.created = true;

        const panel = new Laya.Sprite();
        const panelWidth = 520;
        const panelHeight = 280;

        panel.width = panelWidth;
        panel.height = panelHeight;
        panel.x = (Laya.stage.width - panelWidth) / 2;
        panel.y = (Laya.stage.height - panelHeight) / 2;
        panel.zOrder = 10001;
        panel.graphics.drawRect(0, 0, panelWidth, panelHeight, "#1F2937", "#FFFFFF", 2);

        const text = new Laya.Text();
        text.text = "Controls\nA/D or ←/→   Move\nW or ↑       Jump\nReach Score 5 to Win\nR   Next Level (after win)\nPress Space to start";
        text.fontSize = 28;
        text.color = "#FFFFFF";
        text.bold = true;
        text.align = "left";
        text.valign = "middle";
        text.leading = 10;
        text.x = 44;
        text.y = 20;
        text.width = panelWidth - 88;
        text.height = panelHeight - 40;

        panel.addChild(text);
        Laya.stage.addChild(panel);

        IntroUI.panel = panel;
        Laya.stage.on(Laya.Event.KEY_DOWN, IntroUI, IntroUI.onKeyDown);
    }

    private static onKeyDown(event: any): void {
        const keyCode = event ? event.keyCode : null;
        const key = event ? event.key : "";
        const isStartKey = keyCode === 32 || key === " " || key === "Space";
        if (!isStartKey) {
            return;
        }

        if (IntroUI.panel) {
            IntroUI.panel.visible = false;
        }

        Laya.stage.off(Laya.Event.KEY_DOWN, IntroUI, IntroUI.onKeyDown);
    }
}
