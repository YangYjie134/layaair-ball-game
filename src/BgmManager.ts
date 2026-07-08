declare var Laya: any;

export class BgmManager {
    private static readonly bgmUrl: string = "resources/audio/bgm_main.mp3";
    private static isPlaying: boolean = false;
    private static volume: number = 0.45;

    public static playBgm(): void {
        if (BgmManager.isPlaying) {
            return;
        }

        BgmManager.isPlaying = true;
        try {
            Laya.SoundManager.musicVolume = BgmManager.volume;
            Laya.SoundManager.playMusic(BgmManager.bgmUrl, 0);
        } catch (error) {
            BgmManager.isPlaying = false;
            console.warn("BgmManager: failed to start BGM.", error);
        }
    }

    public static stopBgm(): void {
        if (!BgmManager.isPlaying) {
            return;
        }

        Laya.SoundManager.stopMusic();
        BgmManager.isPlaying = false;
    }

    public static setVolume(volume: number): void {
        const nextVolume = Math.max(0, Math.min(1, volume));
        BgmManager.volume = nextVolume;
        Laya.SoundManager.musicVolume = nextVolume;
    }
}
