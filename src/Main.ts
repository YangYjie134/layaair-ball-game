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
import { PauseUI } from "./PauseUI";
import { TouchController } from "./TouchController";
import { TouchTutorialUI } from "./TouchTutorialUI";
import { GameCompleteUI } from "./GameCompleteUI";

@regClass()
export class Main extends Laya.Script {
    private muteKeyHeld: boolean = false;
    private pauseKeyHeld: boolean = false;
    private ballController: BallController | null = null;
    private touchController: TouchController | null = null;
    private touchTutorial: TouchTutorialUI | null = null;
    private pauseUI: PauseUI | null = null;
    private gameCompleteUI: GameCompleteUI | null = null;
    private gameStarted: boolean = false;
    private activeGameplay: boolean = false;
    private levelTransitionActive: boolean = false;
    private completionFlowActive: boolean = false;
    private gameCompleteActive: boolean = false;
    private completionLevel: number = 0;
    private completionScore: number = 0;
    private mobileTouchSession: boolean = false;

    // Main/session orchestration is the single authoritative Pause state owner.
    private paused: boolean = false;
    private pendingPauseIntent: boolean = false;
    private mobileBrowserWindow: any = null;
    private mobileBrowserDocument: any = null;
    private readonly onMobileWindowBlur = (): void => {
        this.onFocusLost();
        this.requestMobileBackgroundPause();
    };
    private readonly onMobilePageHide = (): void => this.requestMobileBackgroundPause();
    private readonly onMobileVisibilityChange = (): void => {
        if (this.mobileBrowserDocument?.hidden === true
            || this.mobileBrowserDocument?.visibilityState === "hidden") {
            this.requestMobileBackgroundPause();
        }
    };

    onStart(): void {
        console.log("Main onStart");
        BackgroundManager.draw(this.owner);

        this.touchController = TouchController.create();
        this.mobileTouchSession = !!Laya.Browser.onMobile && TouchController.isTouchCapable();
        ScoreManager.instance.setMobileTouchSession(this.mobileTouchSession);
        ScoreManager.instance.init();

        this.ballController = this.findBallController();
        if (this.ballController) {
            this.ballController.enabled = false;
            this.ballController.setTouchInputSource(this.touchController);
            this.ballController.setLevelTransitionHandler((level: number, resume: () => void) => {
                this.showLevelTransition(level, () => {
                    resume();
                    this.enableGameplay();
                });
            });
        } else {
            console.error("BallController lookup failed; gameplay remains disabled.");
        }

        this.pauseUI = new PauseUI(this.mobileTouchSession, {
            requestPause: () => this.requestPauseIntent(),
            resume: () => this.resumeFromPause(),
            restartCurrentAttempt: () => this.restartCurrentAttemptFromPause(),
            returnToMainMenu: () => this.returnToMainMenuFromPause(),
            toggleMute: () => this.toggleGlobalMute(),
            isMuted: () => SfxManager.isGlobalMuted(),
        });

        ScoreManager.instance.setWinHandler((score: number) => this.handleLevelWon(score));

        IntroUI.show(
            () => this.acceptStartIntent(),
            this.mobileTouchSession,
            {
                onCoverInteractionStarted: () => BgmManager.playCoverBgm(this.mobileTouchSession),
                onMainMenuEntered: () => BgmManager.playMenuBgm(this.mobileTouchSession),
                onHowToPlayEntered: () => BgmManager.stopBgm(),
            }
        );
        BgmManager.playCoverBgm(this.mobileTouchSession);
        Laya.stage.on(Laya.Event.KEY_DOWN, this, this.onGlobalKeyDown);
        Laya.stage.on(Laya.Event.KEY_UP, this, this.onGlobalKeyUp);
        Laya.stage.on(Laya.Event.BLUR, this, this.onFocusLost);
        this.bindMobileBackgroundLifecycle();
        this.syncPausePresentation();
        console.log("Main menu active");
    }

    onUpdate(): void {
        this.syncPausePresentation();
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
        BgmManager.stopBgm();
        this.showLevelTransition(1, () => this.enterLevelOne());
    }

    private showLevelTransition(level: number, completion: () => void): void {
        this.cancelPendingPauseIntent();
        ScoreManager.instance.clearTransientFeedback();
        this.levelTransitionActive = true;
        this.activeGameplay = false;
        this.touchController?.resetAll();
        this.touchController?.setGameplayActive(false);
        this.syncPausePresentation();
        LevelTransition.show(level, () => {
            this.levelTransitionActive = false;
            completion();
        });
    }

    private enterLevelOne(): void {
        if (!this.ballController) {
            return;
        }

        this.playLevelHudEntrance();

        if (this.mobileTouchSession && this.touchController) {
            this.touchController.setGameplayActive(true);
            const tutorial = TouchTutorialUI.showOnce(() => this.completeTouchTutorial());
            if (tutorial) {
                this.touchTutorial = tutorial;
                this.syncPausePresentation();
                return;
            }
        }

        this.enableGameplay();
    }

    private completeTouchTutorial(): void {
        this.touchTutorial = null;
        this.touchController?.resetAll();
        this.enableGameplay();
    }

    private enableGameplay(): void {
        if (!this.ballController || this.paused || this.levelTransitionActive
            || this.completionFlowActive || this.gameCompleteActive) {
            return;
        }
        this.activeGameplay = true;
        this.ballController.enabled = true;
        this.touchController?.setGameplayActive(true);
        this.syncPausePresentation();
        BgmManager.playGameplayBgm(this.mobileTouchSession);
    }

    private playLevelHudEntrance(): void {
        ScoreManager.instance.playLevelHudEntrance();
        this.ballController?.playLevelHudEntrance();
    }

    private handleLevelWon(score: number): void {
        if (!this.ballController || this.completionFlowActive || this.gameCompleteActive) return;

        this.completionFlowActive = true;
        this.completionLevel = this.ballController.getCurrentLevel();
        this.completionScore = score;
        this.activeGameplay = false;
        this.cancelPendingPauseIntent();
        this.touchController?.resetAll();
        this.touchController?.setGameplayActive(false);
        this.ballController.enabled = false;
        this.syncPausePresentation();

        // Keep the freshly spawned +1 visible before the full-screen completion state.
        Laya.timer.once(320, this, this.presentLevelCompletion);
    }

    private presentLevelCompletion(): void {
        const controller = this.ballController;
        if (!controller || !this.completionFlowActive) return;

        ScoreManager.instance.clearTransientFeedback();
        if (this.completionLevel === controller.getMaxLevel()) {
            this.gameCompleteActive = true;
            this.gameCompleteUI?.destroy();
            this.gameCompleteUI = new GameCompleteUI(
                this.completionScore,
                ScoreManager.instance.getWinScore(),
                {
                    playAgain: () => this.playAgainFromGameComplete(),
                    returnToMainMenu: () => this.returnToMainMenuFromGameComplete(),
                },
            );
            this.syncPausePresentation();
            return;
        }

        this.levelTransitionActive = true;
        const completedLevel = this.completionLevel;
        const completedScore = this.completionScore;
        LevelTransition.showClear(completedLevel, completedScore, completedLevel + 1, () => {
            this.levelTransitionActive = false;
            if (!this.ballController?.advanceAfterWin(false)) {
                console.error("Automatic level advancement was rejected.");
                this.completionFlowActive = false;
                this.syncPausePresentation();
                return;
            }

            this.completionFlowActive = false;
            this.completionLevel = 0;
            this.completionScore = 0;
            this.playLevelHudEntrance();
            this.enableGameplay();
        });
    }

    private playAgainFromGameComplete(): void {
        if (!this.gameCompleteActive || !this.ballController) return;

        this.gameCompleteUI?.destroy();
        this.gameCompleteUI = null;
        this.gameCompleteActive = false;
        this.completionFlowActive = false;
        this.completionLevel = 0;
        this.completionScore = 0;
        this.paused = false;
        this.activeGameplay = false;
        this.gameStarted = true;
        this.touchController?.resetAll();
        this.touchController?.setGameplayActive(false);
        this.ballController.resetRunToLevelOne();
        this.ballController.enabled = false;
        this.showLevelTransition(1, () => this.enterLevelOne());
    }

    private returnToMainMenuFromGameComplete(): void {
        if (!this.gameCompleteActive || !this.ballController) return;
        this.returnToMainMenu();
    }

    /** Canonical session-owned test used by every Pause entry and final commit. */
    private canPauseNow(): boolean {
        return this.gameStarted
            && this.activeGameplay
            && !this.paused
            && !this.levelTransitionActive
            && !this.completionFlowActive
            && !this.gameCompleteActive
            && !this.touchTutorial
            && !!this.ballController
            && !ScoreManager.instance.isWon()
            && !this.ballController.isPauseBlockedByGameplayState();
    }

    private requestPauseIntent(): void {
        if (this.pendingPauseIntent || !this.canPauseNow()) {
            this.syncPausePresentation();
            return;
        }

        this.pendingPauseIntent = true;
        this.syncPausePresentation();
        // Stage input can precede BallController.onUpdate. One frame of deferral lets
        // the current gameplay tick acquire death/win/transition before final validation.
        Laya.timer.frameOnce(1, this, this.commitPendingPauseIntent);
    }

    private commitPendingPauseIntent(): void {
        if (!this.pendingPauseIntent) return;
        this.pendingPauseIntent = false;
        if (!this.canPauseNow() || !this.ballController) {
            this.syncPausePresentation();
            return;
        }

        this.paused = true;
        this.ballController.beginGameplayPauseAccounting();
        this.touchController?.resetAll();
        this.touchController?.setGameplayActive(false);
        this.ballController.enabled = false;
        this.pauseUI?.showPauseModal();
        this.syncPausePresentation();
    }

    private cancelPendingPauseIntent(): void {
        if (!this.pendingPauseIntent) return;
        this.pendingPauseIntent = false;
        if (typeof Laya.timer?.clear === "function") {
            Laya.timer.clear(this, this.commitPendingPauseIntent);
        }
    }

    private resumeFromPause(): void {
        if (!this.paused || !this.ballController) return;
        if (!this.pauseUI?.lockModalActions()) return;

        this.touchController?.resetAll();
        this.ballController.finishGameplayPauseAccounting();
        this.ballController.synchronizeJumpInputBaseline();
        this.paused = false;
        this.ballController.enabled = true;
        this.touchController?.setGameplayActive(true);
        this.pauseUI.hidePauseModal();
        this.syncPausePresentation();
    }

    private restartCurrentAttemptFromPause(): void {
        if (!this.paused || !this.ballController) return;
        if (!this.pauseUI?.lockModalActions()) return;

        this.touchController?.resetAll();
        this.ballController.restartCurrentAttempt();
        this.ballController.synchronizeJumpInputBaseline();
        this.paused = false;
        this.ballController.enabled = true;
        this.touchController?.setGameplayActive(true);
        this.pauseUI.hidePauseModal();
        this.syncPausePresentation();
    }

    private returnToMainMenuFromPause(): void {
        if (!this.paused || !this.ballController) return;
        if (!this.pauseUI?.lockModalActions()) return;

        this.returnToMainMenu();
    }

    private returnToMainMenu(): void {
        if (!this.ballController) return;

        Laya.timer.clear(this, this.presentLevelCompletion);
        LevelTransition.cancel();
        this.gameCompleteUI?.destroy();
        this.gameCompleteUI = null;
        this.gameCompleteActive = false;
        this.completionFlowActive = false;
        this.completionLevel = 0;
        this.completionScore = 0;
        ScoreManager.instance.clearTransientFeedback();
        this.touchController?.resetAll();
        this.touchController?.setGameplayActive(false);
        this.ballController.resetRunToLevelOne();
        this.ballController.enabled = false;
        this.paused = false;
        this.activeGameplay = false;
        this.gameStarted = false;
        this.levelTransitionActive = false;
        this.cancelPendingPauseIntent();
        this.pauseUI?.hidePauseModal();
        IntroUI.returnToMainMenu(
            () => this.acceptStartIntent(),
            this.mobileTouchSession,
            {
                onCoverInteractionStarted: () => BgmManager.playCoverBgm(this.mobileTouchSession),
                onMainMenuEntered: () => BgmManager.playMenuBgm(this.mobileTouchSession),
                onHowToPlayEntered: () => BgmManager.stopBgm(),
            }
        );
        this.syncPausePresentation();
    }

    private syncPausePresentation(): void {
        this.pauseUI?.setPauseButtonAvailable(
            !this.pendingPauseIntent && this.canPauseNow(),
        );
    }

    private bindMobileBackgroundLifecycle(): void {
        if (!this.mobileTouchSession) return;
        this.mobileBrowserWindow = Laya.Browser?.window || null;
        this.mobileBrowserDocument = this.mobileBrowserWindow?.document || null;
        this.mobileBrowserWindow?.addEventListener?.("blur", this.onMobileWindowBlur);
        this.mobileBrowserWindow?.addEventListener?.("pagehide", this.onMobilePageHide);
        this.mobileBrowserDocument?.addEventListener?.("visibilitychange", this.onMobileVisibilityChange);
    }

    private unbindMobileBackgroundLifecycle(): void {
        this.mobileBrowserWindow?.removeEventListener?.("blur", this.onMobileWindowBlur);
        this.mobileBrowserWindow?.removeEventListener?.("pagehide", this.onMobilePageHide);
        this.mobileBrowserDocument?.removeEventListener?.("visibilitychange", this.onMobileVisibilityChange);
        this.mobileBrowserWindow = null;
        this.mobileBrowserDocument = null;
    }

    private requestMobileBackgroundPause(): void {
        if (!this.mobileTouchSession) return;
        this.requestPauseIntent();
    }

    private toggleGlobalMute(): void {
        const nextMuted = !SfxManager.isGlobalMuted();
        SfxManager.setGlobalMuted(nextMuted);
        this.pauseUI?.refreshSettings();
        console.log("Muted:", nextMuted);
    }

    private onGlobalKeyDown(event: any): void {
        if (this.isMuteKey(event)) {
            if (!this.gameStarted) {
                this.muteKeyHeld = true;
                return;
            }
            if (this.muteKeyHeld) return;
            this.muteKeyHeld = true;
            this.toggleGlobalMute();
            return;
        }

        if (!this.isPauseKey(event)) return;
        if (this.pauseKeyHeld) return;
        this.pauseKeyHeld = true;
        if (!this.gameStarted) return;
        if (this.paused) {
            this.resumeFromPause();
            return;
        }
        this.requestPauseIntent();
    }

    private onGlobalKeyUp(event: any): void {
        if (this.isMuteKey(event)) {
            this.muteKeyHeld = false;
        }
        if (this.isPauseKey(event)) {
            this.pauseKeyHeld = false;
        }
    }

    private onFocusLost(): void {
        this.muteKeyHeld = false;
        this.pauseKeyHeld = false;
    }

    private isMuteKey(event: any): boolean {
        return event?.keyCode === 77 || event?.key === "m" || event?.key === "M";
    }

    private isPauseKey(event: any): boolean {
        return event?.keyCode === 80
            || event?.key === "p"
            || event?.key === "P";
    }

    onDestroy(): void {
        Laya.timer.clear(this, this.presentLevelCompletion);
        LevelTransition.cancel();
        this.cancelPendingPauseIntent();
        this.unbindMobileBackgroundLifecycle();
        Laya.stage.off(Laya.Event.KEY_DOWN, this, this.onGlobalKeyDown);
        Laya.stage.off(Laya.Event.KEY_UP, this, this.onGlobalKeyUp);
        Laya.stage.off(Laya.Event.BLUR, this, this.onFocusLost);
        this.touchTutorial?.destroy();
        this.touchTutorial = null;
        this.gameCompleteUI?.destroy();
        this.gameCompleteUI = null;
        this.pauseUI?.destroy();
        this.pauseUI = null;
        ScoreManager.instance.setWinHandler(null);
        ScoreManager.instance.clearTransientFeedback();
        ScoreManager.instance.finishLevelHudEntrance();
        if (this.ballController) {
            this.ballController.setTouchInputSource(null);
        }
        this.touchController?.destroy();
        this.touchController = null;
    }
}
