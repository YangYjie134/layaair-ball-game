// Runtime Laya global declaration for TypeScript.
declare var Laya: any;

const { regClass } = Laya;
import { BackgroundManager } from "./BackgroundManager";
import { ScoreManager } from "./ScoreManager";
import { IntroUI } from "./IntroUI";
import { BgmManager } from "./BgmManager";
import { SfxManager } from "./SfxManager";
import BallController from "./BallController";
import { LevelTransition } from "./LevelTransition";
import { TouchController } from "./TouchController";

@regClass()
export class Main extends Laya.Script {
    private muteKeyHeld: boolean = false;
    private ballController: BallController | null = null;
    private touchController: TouchController | null = null;
    private gameStarted: boolean = false;

    onStart() {
        console.log("Main onStart");
        BackgroundManager.draw(this.owner);
        ScoreManager.instance.init();
        this.touchController = TouchController.create();

        this.ballController = this.findBallController();
        if (this.ballController) {
            this.ballController.enabled = false;
            this.ballController.setTouchInputSource(this.touchController);
            this.ballController.setLevelTransitionHandler((level: number, resume: () => void) => {
                this.touchController?.setGameplayActive(false);
                LevelTransition.show(level, () => {
                    resume();
                    this.touchController?.setGameplayActive(true);
                });
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
        if (this.touchController?.deferPreGameActionIfHintVisible(() => this.acceptStartIntent())) {
            return;
        }

        this.gameStarted = true;
        this.touchController?.completePreGame();
        this.touchController?.setGameplayActive(false);
        LevelTransition.show(1, () => {
            if (!this.ballController) return;
            this.ballController.enabled = true;
            this.touchController?.setGameplayActive(true);
            BgmManager.playBgm();
        });
    }

    onDestroy(): void {
        if (this.ballController) {
            this.ballController.setTouchInputSource(null);
        }
        this.touchController?.destroy();
        this.touchController = null;
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
        const nextMuted = !SfxManager.isGlobalMuted();
        SfxManager.setGlobalMuted(nextMuted);
        console.log("Muted:", nextMuted);
    }

    private onMuteKeyUp(event: any): void {
        const isMuteKey = event.keyCode === 77 || event.key === "m" || event.key === "M";
        if (isMuteKey) {
            this.muteKeyHeld = false;
        }
    }
}
