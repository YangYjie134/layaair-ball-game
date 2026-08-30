declare var Laya: any;

export type MusicRole = "NONE" | "COVER" | "MENU" | "GAMEPLAY";

export class BgmManager {
    private static readonly coverDesktopBgmUrl: string = "resources/audio/bgm_cover_desktop.mp3";
    private static readonly coverMobileBgmUrl: string = "resources/audio/bgm_cover_mobile.mp3";
    private static readonly menuDesktopBgmUrl: string = "resources/audio/bgm_menu_desktop.mp3";
    private static readonly menuMobileBgmUrl: string = "resources/audio/bgm_menu_mobile.mp3";
    private static readonly gameplayBgmUrl: string = "resources/audio/bgm_final_techno7.mp3";
    // Runtime mix values. Human runtime listening validation is still required.
    private static readonly coverVolume: number = 0.27;
    private static readonly menuDesktopVolume: number = 0.08;
    private static readonly menuMobileVolume: number = 0.18;
    private static gameplayDesktopVolume: number = 0.18;
    private static gameplayMobileVolume: number = 0.33;
    private static currentRole: MusicRole = "NONE";
    private static currentUrl: string | null = null;
    private static currentVolume: number | null = null;
    private static isPlaying: boolean = false;

    /** Backward-compatible alias for callers outside this frozen round. */
    public static playBgm(mobileSession: boolean = false): void {
        BgmManager.playGameplayBgm(mobileSession);
    }

    public static playCoverBgm(mobileSession: boolean): void {
        const url = mobileSession
            ? BgmManager.coverMobileBgmUrl
            : BgmManager.coverDesktopBgmUrl;
        BgmManager.playRole("COVER", url, BgmManager.coverVolume);
    }

    public static playMenuBgm(mobileSession: boolean): void {
        const url = mobileSession
            ? BgmManager.menuMobileBgmUrl
            : BgmManager.menuDesktopBgmUrl;
        const volume = mobileSession
            ? BgmManager.menuMobileVolume
            : BgmManager.menuDesktopVolume;
        BgmManager.playRole("MENU", url, volume);
    }

    public static playGameplayBgm(mobileSession: boolean = false): void {
        const volume = mobileSession
            ? BgmManager.gameplayMobileVolume
            : BgmManager.gameplayDesktopVolume;
        BgmManager.playRole("GAMEPLAY", BgmManager.gameplayBgmUrl, volume);
    }

    private static playRole(role: Exclude<MusicRole, "NONE">, url: string, volume: number): void {
        if (
            BgmManager.currentRole === role
            && BgmManager.currentUrl === url
            && BgmManager.currentVolume === volume
            && BgmManager.isPlaying
        ) {
            return;
        }

        if (BgmManager.currentRole !== "NONE" || BgmManager.isPlaying) {
            try {
                Laya.SoundManager.stopMusic();
            } catch (error) {
                console.warn("BgmManager: failed to stop the previous music role.", error);
            }
        }
        BgmManager.currentRole = "NONE";
        BgmManager.currentUrl = null;
        BgmManager.currentVolume = null;
        BgmManager.isPlaying = false;

        try {
            Laya.SoundManager.musicVolume = volume;
            Laya.SoundManager.playMusic(url, 0);
            BgmManager.currentRole = role;
            BgmManager.currentUrl = url;
            BgmManager.currentVolume = volume;
            BgmManager.isPlaying = true;
        } catch (error) {
            BgmManager.currentRole = "NONE";
            BgmManager.currentUrl = null;
            BgmManager.currentVolume = null;
            BgmManager.isPlaying = false;
            console.warn(`BgmManager: failed to start ${role} music.`, error);
        }
    }

    public static stopBgm(): void {
        if (BgmManager.currentRole === "NONE" && !BgmManager.isPlaying) {
            return;
        }

        try {
            Laya.SoundManager.stopMusic();
        } catch (error) {
            console.warn("BgmManager: failed to stop music.", error);
        } finally {
            BgmManager.currentRole = "NONE";
            BgmManager.currentUrl = null;
            BgmManager.currentVolume = null;
            BgmManager.isPlaying = false;
        }
    }

    public static setVolume(volume: number): void {
        const nextVolume = Math.max(0, Math.min(1, volume));
        BgmManager.gameplayDesktopVolume = nextVolume;
        BgmManager.gameplayMobileVolume = nextVolume;
        if (BgmManager.currentRole === "GAMEPLAY" && BgmManager.isPlaying) {
            Laya.SoundManager.musicVolume = nextVolume;
            BgmManager.currentVolume = nextVolume;
        }
    }
}
