# Audio Sources

All audio in this project is **CC0 / Public Domain**. Attribution is not legally
required under CC0, but source and processing details are recorded here for full
traceability.

## Background Music

| Role / profile | Original filename | Source title / pack | Author | Source page | License | Repo output filename | Actual processing embodied in the approved master |
|----------------|-------------------|---------------------|--------|-------------|---------|----------------------|---------------------------------------------------|
| Cover / Desktop | `sector.mp3` | *Dark Sci-Fi Audio Pack* | SRG774 | https://opengameart.org/content/dark-sci-fi-audio-pack | CC0 1.0 / Public Domain | `resources/audio/bgm_cover_desktop.mp3` | Human-tuned Desktop V3 stronger master, integrated byte-for-byte with no repo-side processing. Duration `00:00:39`, nominal bitrate `172 kbps`, size `841010` bytes; SHA-256 `184E63CE177372CA91319007F16C02FD4B1BAF7FBA5EAF05893F5943D2307910`. |
| Cover / Mobile | `sector.mp3` | *Dark Sci-Fi Audio Pack* | SRG774 | https://opengameart.org/content/dark-sci-fi-audio-pack | CC0 1.0 / Public Domain | `resources/audio/bgm_cover_mobile.mp3` | Human-tuned Mobile V3 stronger master, integrated byte-for-byte with no repo-side processing. This is a distinct device master: duration `00:00:39`, nominal bitrate `174 kbps`, size `850565` bytes; SHA-256 `7946D8C3232AFAFFD4B2D4CC082C499A403737635B3CCAE35597859E1C5E6EB2`. |
| Main Menu / Desktop | `transmission.mp3` | *Dark Sci-Fi Audio Pack* | SRG774 | https://opengameart.org/content/dark-sci-fi-audio-pack | CC0 1.0 / Public Domain | `resources/audio/bgm_menu_desktop.mp3` | Source start trimmed exactly `6.500 s`, timestamps reset, then a `150 ms` linear fade-in; Human-tuned Desktop V1 locked master integrated byte-for-byte with no repo-side processing. Duration `00:01:27`, nominal bitrate `189 kbps`, size `2079696` bytes; SHA-256 `FE7A8751177BDB251A90A40DAE9CF47ADD92FB56CC420CAD95136E98689380FF`. |
| Main Menu / Mobile | `transmission.mp3` | *Dark Sci-Fi Audio Pack* | SRG774 | https://opengameart.org/content/dark-sci-fi-audio-pack | CC0 1.0 / Public Domain | `resources/audio/bgm_menu_mobile.mp3` | The same `6.500 s` source trim, timestamp reset, and `150 ms` linear fade-in are embodied in this distinct Human-approved Mobile V1 master; integrated byte-for-byte with no repo-side processing. Duration `00:01:27`, nominal bitrate `189 kbps`, size `2076136` bytes; SHA-256 `180993FD0C8515BAF1BBEB253567EA93A4F1D8AB6E46F97706CD8163410BC102`. |
| Gameplay | `Ending / Credits` | *5 Chiptunes (Action)* | Juhani Junkala / SubspaceAudio | https://opengameart.org/content/5-chiptunes-action | CC0 / Public Domain | `resources/audio/bgm_final_techno7.mp3` | Existing gameplay asset and behavior retained unchanged in this round. |

The Desktop and Mobile Cover/Menu files are distinct supplied outputs, as shown by their
different SHA-256 values, byte sizes, and (for Cover) nominal bitrates. No normalization,
trim, fade, EQ, compression, loudness change, or other audio processing was performed during integration.

## Sound Effects

Source pack: **512 Sound Effects (8-bit style)** — CC0
https://opengameart.org/content/512-sound-effects-8-bit-style

| Asset (in repo)                    | Original file (from pack)  | In-game use | Verification                      |
|------------------------------------|----------------------------|-------------|-----------------------------------|
| `resources/audio/sfx_jump.mp3`     | `sfx_movement_jump11.wav`  | jump        | waveform corr 0.998 vs source WAV |
| `resources/audio/sfx_death.mp3`    | `sfx_sounds_damage2.wav`   | death       | waveform corr 0.988 vs source WAV |
| `resources/audio/sfx_clear.mp3`    | `sfx_sounds_powerup13.wav` | level clear | waveform corr 0.997 vs source WAV |

Conversion: original WAV (PCM 16-bit, 44.1 kHz mono, authored in Sony Sound Forge 7.0,
2015) transcoded to MP3 (44.1 kHz mono, VBR ~q2) with ffmpeg. Source and license are
written into the ID3 tags (artist / album / comment / copyright) of each output file.

Provenance was verified by normalized waveform cross-correlation between each MP3 and its
claimed source WAV: matched pairs scored 0.99+,
