// Runtime Laya global declaration for TypeScript.
declare var Laya: any;

const { regClass } = Laya;
import { BackgroundManager } from "./BackgroundManager";
import { ScoreManager } from "./ScoreManager";
import { IntroUI } from "./IntroUI";
import { BgmManager } from "./BgmManager";
import BallController from "./BallController";

@regClass()
export class Main extends Laya.Script {
    private muteKeyHeld: boolean = false;
    private ballController: any = null;
    private gameStarted: boolean = false;

    onStart() {
        console.log("Main onStart");
        BackgroundManager.draw(this.owner);
        ScoreManager.instance.init();

        this.ballController = this.findBallController();
        if (this.ballController) {
            this.ballController.enabled = false;
        } else {
            console.error("BallController lookup failed; gameplay remains disabled.");
        }

        IntroUI.show(() => this.acceptStartIntent());
        Laya.stage.on(Laya.Event.KEY_DOWN, this, this.onMuteKeyDown);
        Laya.stage.on(Laya.Event.KEY_UP, this, this.onMuteKeyUp);
        console.log("Main menu active");
    }

    private findBallController(): any {
        const sceneRoot: any = this.owner;
        const ballNode = sceneRoot && typeof sceneRoot.getChildByName === "function"
            ? sceneRoot.getChildByName("Ball")
            : null;
        if (!ballNode || typeof ballNode.getComponent !== "function") {
            return null;
        }

        return ballNode.getComponent(BallController) || null;
    }

    private acceptStartIntent(): void {
        if (this.gameStarted) {
            return;
        }
        if (!this.ballController) {
            console.error("Start rejected: BallController is unavailable.");
            return;
        }

        this.gameStarted = true;
        this.ballController.enabled = true;
        BgmManager.playBgm();
    }

    private onMuteKeyDown(event: any): void {
        const isMuteKey = event.keyCode === 77 || event.key === "m" || event.key === "M";
        if (!isMuteKey) {
            return;
        }

        if (this.muteKeyHeld) {
            return;
        }

        this.muteKeyHeld = true;
        Laya.SoundManager.muted = !Laya.SoundManager.muted;
        console.log("Muted:", Laya.SoundManager.muted);
    }

    private onMuteKeyUp(event: any): void {
        const isMuteKey = event.keyCode === 77 || event.key === "m" || event.key === "M";
        if (isMuteKey) {
            this.muteKeyHeld = false;
        }
    }
}
