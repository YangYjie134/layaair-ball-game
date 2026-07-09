# Audio Sources

All audio in this project is **CC0 / Public Domain**, authored by **Juhani Junkala**
(published on OpenGameArt as *SubspaceAudio*). Attribution is not legally required
under CC0, but is recorded here as good practice and for full traceability.

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
