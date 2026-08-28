declare var Laya: any;

export class SfxManager {
    private static readonly JUMP_URL: string = "resources/audio/sfx_jump_lift.wav";
    private static readonly DEATH_URL: string = "resources/audio/sfx_death_disintegrate.ogg";
    private static readonly CLEAR_URL: string = "resources/audio/sfx_clear_powerup.ogg";
    private static readonly JUMP_VOLUME: number = 0.84;
    private static readonly DEATH_VOLUME: number = 0.7;
    private static readonly CLEAR_VOLUME: number = 0.7;
    private static readonly SCORE_BODY_START_HZ: number = 880;
    private static readonly SCORE_BODY_END_HZ: number = 1040;
    private static readonly SCORE_BODY_PEAK_GAIN: number = 0.13;
    private static readonly SCORE_BODY_SUSTAIN_GAIN: number = 0.075;
    private static readonly SCORE_METAL_START_HZ: number = 1240;
    private static readonly SCORE_METAL_END_HZ: number = 1120;
    private static readonly SCORE_METAL_PEAK_GAIN: number = 0.035;
    private static readonly SCORE_ATTACK_SECONDS: number = 0.004;
    private static readonly SCORE_BODY_SUSTAIN_SECONDS: number = 0.055;
    private static readonly SCORE_METAL_RELEASE_SECONDS: number = 0.048;
    private static readonly SCORE_RELEASE_SECONDS: number = 0.125;
    private static scoreAudioContext: any = null;
    private static scoreMasterGain: any = null;

    public static isGlobalMuted(): boolean {
        return !!Laya.SoundManager.muted;
    }

    public static setGlobalMuted(muted: boolean): void {
        const nextMuted = !!muted;
        Laya.SoundManager.muted = nextMuted;
        SfxManager.syncScoreMute(nextMuted);
    }

    public static playJump(): void {
        SfxManager.playOneShot(SfxManager.JUMP_URL, SfxManager.JUMP_VOLUME);
    }

    public static playDeath(): void {
        SfxManager.playOneShot(SfxManager.DEATH_URL, SfxManager.DEATH_VOLUME);
    }

    public static playClear(): void {
        SfxManager.playOneShot(SfxManager.CLEAR_URL, SfxManager.CLEAR_VOLUME);
    }

    public static playScore(): void {
        if (SfxManager.isGlobalMuted()) return;

        try {
            const context = SfxManager.getScoreAudioContext();
            const masterGain = SfxManager.scoreMasterGain;
            if (!context || context.state === "closed" || !masterGain) return;

            const playConfirmation = (): void => {
                if (SfxManager.isGlobalMuted()) return;

                try {
                    const now = context.currentTime;
                    const bodyOscillator = context.createOscillator();
                    const bodyGain = context.createGain();
                    const metalOscillator = context.createOscillator();
                    const metalGain = context.createGain();

                    bodyOscillator.type = "triangle";
                    bodyOscillator.frequency.setValueAtTime(SfxManager.SCORE_BODY_START_HZ, now);
                    bodyOscillator.frequency.exponentialRampToValueAtTime(
                        SfxManager.SCORE_BODY_END_HZ,
                        now + SfxManager.SCORE_RELEASE_SECONDS
                    );
                    bodyGain.gain.setValueAtTime(0.0001, now);
                    bodyGain.gain.exponentialRampToValueAtTime(
                        SfxManager.SCORE_BODY_PEAK_GAIN,
                        now + SfxManager.SCORE_ATTACK_SECONDS
                    );
                    bodyGain.gain.exponentialRampToValueAtTime(
                        SfxManager.SCORE_BODY_SUSTAIN_GAIN,
                        now + SfxManager.SCORE_BODY_SUSTAIN_SECONDS
                    );
                    bodyGain.gain.exponentialRampToValueAtTime(
                        0.0001,
                        now + SfxManager.SCORE_RELEASE_SECONDS
                    );

                    // A quiet inharmonic downward transient supplies the cyber-metal attack
                    // without returning to the fatiguing upper-frequency range.
                    metalOscillator.type = "triangle";
                    metalOscillator.frequency.setValueAtTime(SfxManager.SCORE_METAL_START_HZ, now);
                    metalOscillator.frequency.exponentialRampToValueAtTime(
                        SfxManager.SCORE_METAL_END_HZ,
                        now + SfxManager.SCORE_METAL_RELEASE_SECONDS
                    );
                    metalGain.gain.setValueAtTime(0.0001, now);
                    metalGain.gain.exponentialRampToValueAtTime(
                        SfxManager.SCORE_METAL_PEAK_GAIN,
                        now + 0.002
                    );
                    metalGain.gain.exponentialRampToValueAtTime(
                        0.0001,
                        now + SfxManager.SCORE_METAL_RELEASE_SECONDS
                    );

                    bodyOscillator.connect(bodyGain);
                    bodyGain.connect(masterGain);
                    metalOscillator.connect(metalGain);
                    metalGain.connect(masterGain);

                    bodyOscillator.onended = (): void => {
                        try {
                            bodyOscillator.disconnect();
                            bodyGain.disconnect();
                        } catch (_) {
                            // Audio nodes may already be disconnected during page teardown.
                        }
                    };
                    metalOscillator.onended = (): void => {
                        try {
                            metalOscillator.disconnect();
                            metalGain.disconnect();
                        } catch (_) {
                            // Audio nodes may already be disconnected during page teardown.
                        }
                    };

                    bodyOscillator.start(now);
                    metalOscillator.start(now);
                    metalOscillator.stop(now + 0.052);
                    bodyOscillator.stop(now + 0.13);
                } catch (_) {
                    // Web Audio failures must never affect scoring.
                }
            };

            if (context.state === "suspended" && typeof context.resume === "function") {
                try {
                    const resumeResult = context.resume();
                    if (resumeResult && typeof resumeResult.then === "function") {
                        resumeResult.then(playConfirmation).catch((): void => {
                            // Autoplay denial is an expected silent no-op.
                        });
                        return;
                    }
                } catch (_) {
                    return;
                }
            }

            playConfirmation();
        } catch (_) {
            // Web Audio is optional; unsupported browsers remain silent.
        }
    }

    private static getScoreAudioContext(): any {
        if (SfxManager.scoreAudioContext && SfxManager.scoreAudioContext.state !== "closed") {
            return SfxManager.scoreAudioContext;
        }

        SfxManager.scoreAudioContext = null;
        SfxManager.scoreMasterGain = null;

        try {
            const browserGlobal: any = typeof globalThis !== "undefined" ? globalThis : null;
            const AudioContextCtor = browserGlobal?.AudioContext ?? browserGlobal?.webkitAudioContext;
            if (typeof AudioContextCtor !== "function") return null;

            const context = new AudioContextCtor();
            const masterGain = context.createGain();
            masterGain.gain.setValueAtTime(SfxManager.isGlobalMuted() ? 0 : 1, context.currentTime);
            masterGain.connect(context.destination);
            SfxManager.scoreAudioContext = context;
            SfxManager.scoreMasterGain = masterGain;
            return context;
        } catch (_) {
            SfxManager.scoreAudioContext = null;
            SfxManager.scoreMasterGain = null;
            return null;
        }
    }

    private static syncScoreMute(muted: boolean): void {
        const context = SfxManager.scoreAudioContext;
        const masterGain = SfxManager.scoreMasterGain;
        if (!context || context.state === "closed" || !masterGain) return;

        try {
            masterGain.gain.setValueAtTime(muted ? 0 : 1, context.currentTime);
        } catch (_) {
            // The Laya-managed channels still obey the global mute state.
        }
    }

    private static playOneShot(url: string, volume: number): void {
        if (SfxManager.isGlobalMuted()) return;

        try {
            Laya.SoundManager.soundVolume = 1;
            const channel = Laya.SoundManager.playSound(url, 1);
            if (channel) channel.volume = volume;
        } catch (error) {
            console.warn("[SfxManager] Failed to play sound:", url, error);
        }
    }
}
