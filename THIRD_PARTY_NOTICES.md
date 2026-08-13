# Third-Party Notices

This document records third-party software and media included in the BallGame
source tree or generated Web distribution. 本文件仅记录第三方材料及其许可，不代表对项目原创
代码、文档、截图或游戏设计授予统一许可。

## LayaAir 3.3.11

- Project: LayaAir Engine
- Copyright: Copyright (c) 2022 layabox
- License: MIT License
- Source: https://github.com/layabox/LayaAir/tree/v3.3.11
- Full license text: `LICENSES/LayaAir-MIT.txt`

The project uses LayaAir for rendering, input, UI, timers, scene execution, and
Web publishing. LayaAir material in this repository includes:

- `engine/types/`
- `assets/atlas/comp/`
- `assets/resources/layaAir.png`
- Generated Web runtime libraries, internal UI files, and splash assets

The 38 component PNG files and `layaAir.png` in the project were hash-matched
against the corresponding LayaAir 3.3.11 project-template files during the
publishing audit.

## Box2D

- Project: Box2D
- Copyright: Copyright (c) 2019 Erin Catto
- License: MIT License
- Upstream: https://github.com/erincatto/box2d
- Full license text: `LICENSES/Box2D-MIT.txt`

The generated Web output includes LayaAir's `laya.box2D.js` and
`laya.physics2D.js` modules because the LayaAir 2D physics module remains
enabled in the project settings. The generated `laya.box2D.js` incorporates a
Web build of Box2D. Its exact vendored Box2D version is not identified in the
generated module, so this notice does not claim a specific upstream version.

The game scene and TypeScript gameplay code do not attach LayaAir `RigidBody`
or `Collider` components. Movement and collision are handled by the project's
custom gameplay physics.

## Audio

All packaged audio below is by Juhani Junkala, published on OpenGameArt as
SubspaceAudio, and dedicated to the public domain under CC0 1.0 Universal.
Attribution is not required by CC0, but source details are retained for
traceability.

| Project file | Work / source file | Source | License |
| --- | --- | --- | --- |
| `assets/resources/audio/bgm_main.mp3` | Ending / Credits, from *5 Chiptunes (Action)* | https://opengameart.org/content/5-chiptunes-action | CC0 1.0 |
| `assets/resources/audio/sfx_jump.mp3` | `sfx_movement_jump11.wav`, from *512 Sound Effects (8-bit style)* | https://opengameart.org/content/512-sound-effects-8-bit-style | CC0 1.0 |
| `assets/resources/audio/sfx_death.mp3` | `sfx_sounds_damage2.wav`, from *512 Sound Effects (8-bit style)* | https://opengameart.org/content/512-sound-effects-8-bit-style | CC0 1.0 |
| `assets/resources/audio/sfx_clear.mp3` | `sfx_sounds_powerup13.wav`, from *512 Sound Effects (8-bit style)* | https://opengameart.org/content/512-sound-effects-8-bit-style | CC0 1.0 |

CC0 1.0 Universal: https://creativecommons.org/publicdomain/zero/1.0/

## Project Licensing Boundary

No project-wide license is currently declared for BallGame. Unless a file
states otherwise, this notice documents third-party terms only and does not
grant permission to reuse the project's original material.
