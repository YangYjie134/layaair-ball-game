// Runtime Laya global declaration for TypeScript.
declare var Laya: any;

const { regClass } = Laya;
import { BackgroundManager } from "./BackgroundManager";
import { ScoreManager } from "./ScoreManager";
import { IntroUI } from "./IntroUI";
import { BgmManager } from "./BgmManager";
import BallController from "./BallController";
import { LevelTransition } from "./LevelTransition";

@regClass()
export class Main extends Laya.Script {
    private muteKeyHeld: boolean = false;
    private ballController: BallController | null = null;
    private gameStarted: boolean = false;

    onStart() {
        console.log("Main onStart");
        BackgroundManager.draw(this.owner);
        ScoreManager.instance.init();

        this.ballController = this.findBallController();
        if (this.ballController) {
            this.ballController.enabled = false;
            this.ballController.setLevelTransitionHandler((level: number, resume: () => void) => {
                LevelTransition.show(level, resume);
            });
        } else {
            console.error("BallController lookup failed; gameplay remains disabled.");
        }

        ScoreManager.instance.setNextLevelHandler(() => {
            if (this.ballController) {
                this.ballController.advanceAfterWin();
            }
        });

        IntroUI.show(() => this.acceptStartIntent());
        Laya.stage.on(Laya.Event.KEY_DOWN, this, this.onMuteKeyDown);
        Laya.stage.on(Laya.Event.KEY_UP, this, this.onMuteKeyUp);
        console.log("Main menu active");
    }

    private findBallController(): BallController | null {
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
        LevelTransition.show(1, () => {
            if (!this.ballController) return;
            this.ballController.enabled = true;
            BgmManager.playBgm();
        });
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
