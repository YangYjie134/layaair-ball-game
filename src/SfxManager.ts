declare var Laya: any;

export class SfxManager {
    private static readonly JUMP_URL: string = "resources/audio/sfx_jump.mp3";
    private static readonly DEATH_URL: string = "resources/audio/sfx_death.mp3";
    private static readonly CLEAR_URL: string = "resources/audio/sfx_clear.mp3";
    private static readonly SFX_VOLUME: number = 0.7;

    public static playJump(): void {
        SfxManager.playOneShot(SfxManager.JUMP_URL);
    }

    public static playDeath(): void {
        SfxManager.playOneShot(SfxManager.DEATH_URL);
    }

    public static playClear(): void {
        SfxManager.playOneShot(SfxManager.CLEAR_URL);
    }

    private static playOneShot(url: string): void {
        try {
            Laya.SoundManager.soundVolume = SfxManager.SFX_VOLUME;
            Laya.SoundManager.playSound(url, 1);
        } catch (error) {
            console.warn("[SfxManager] Failed to play sound:", url, error);
        }
    }
}
