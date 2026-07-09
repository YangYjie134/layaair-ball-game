# LayaAir Ball Game

A small 2D platformer built with **LayaAir 3** and **TypeScript**.

This project is a learning and portfolio project, not a commercial release. It focuses on custom platformer physics, readable gameplay rules, randomized platform layouts, and a compact level loop that can be extended over time.

## Project Summary

The player controls a ball, jumps through platform layouts, scores by landing on platforms, and advances through four level rule sets. Later levels add moving platforms, disappearing platforms, and static spike hazards while keeping the core controls simple.

The project currently uses code-driven gameplay logic and a code-drawn background rather than relying only on scene-editor behavior.

## Current Status

- **Engine:** LayaAir 3
- **Language:** TypeScript
- **Genre:** 2D platformer prototype
- **Current level loop:** Level 1 through Level 4, then loops back
- **Latest completed gameplay round:** spike hazards can now be placed on the first platform
- **Project stage:** playable learning prototype / portfolio project

## Features

- Custom ball movement with gravity, horizontal acceleration, and jumping.
- Custom one-way platform collision for simple and controllable platformer behavior.
- Platform scoring with one score per platform touch.
- Death and respawn loop after falling back to danger areas or leaving the playable space.
- Randomized platform layouts after death and level reset.
- Moving platforms in later levels.
- Disappearing platforms with brighter warning colors and a visual highlight bar.
- Static spike hazards in Level 4.
- Intro controls overlay at startup.
- Code-drawn background.

## Controls

| Action | Input |
| --- | --- |
| Move left / right | `A` / `D` or left / right arrow |
| Jump | `W` or up arrow |
| Advance after win | `R` |
| Dismiss intro overlay | `Space` |

## Audio Credits

All audio is CC0 (public domain) by Juhani Junkala (published on OpenGameArt as
SubspaceAudio). Attribution is not legally required under CC0, but is provided here
as good practice. See `assets/AUDIO_SOURCES.md` for per-file source traceability.

* **Background music** — "Ending / Credits", from *5 Chiptunes (Action)*
  * https://opengameart.org/content/5-chiptunes-action  (CC0)
* **Sound effects** (jump / death / level-clear) — from *512 Sound Effects (8-bit style)*
  * https://opengameart.org/content/512-sound-effects-8-bit-style  (CC0)

## Level Design

| Level | Main Mechanics |
| --- | --- |
| Level 1 | Basic platform jumping |
| Level 2 | Moving platforms |
| Level 3 | Moving platforms and disappearing platforms |
| Level 4 | Moving platforms, disappearing platforms, and static spike hazards |

Current platform and hazard rules:

- Platform layouts are randomized as part of the restart / respawn loop.
- Spikes can appear on `Platform_1` through `Platform_5`.
- Spikes do not appear on `Ground`, moving platforms, or disappearing platforms.
- Disappearing platforms are not selected from the final platform.
- Disappearing platforms warn the player with brighter colors and a highlight bar before becoming inactive.

## Technical Notes

The game uses custom one-way platform physics instead of relying fully on Box2D contacts for platform behavior. This keeps the rules focused on the platformer use case: the ball lands on platform tops, but platform sides and bottom contacts do not need full rigid-body handling.

That direction was chosen after unstable platform-corner behavior made the built-in physics path harder to control for this prototype. The custom approach keeps collision rules, respawn behavior, and level reset behavior easier to reason about.

Important runtime systems include:

- `BallController.ts` for movement, platform collision, level progression, hazards, respawn, and platform randomization.
- `ScoreManager.ts` for score tracking, win state, and platform score deduplication.
- `BackgroundManager.ts` for the code-drawn background.
- `IntroUI.ts` for the startup controls overlay.

## Project Structure

```text
src/
├── Main.ts                # Entry point for startup systems
├── BallController.ts      # Core player, platform, level, respawn, and hazard logic
├── ScoreManager.ts        # Score and win-state management
├── BackgroundManager.ts   # Code-drawn background
└── IntroUI.ts             # Startup controls overlay
```

## How to Run

Open the project with **LayaAir IDE** and run the main scene from the editor.

`package.json` currently does not define npm scripts, so this README intentionally does not document `npm run dev`, `npm start`, or similar commands.

## Development Notes

- The project is intentionally small and code-readable.
- Gameplay behavior is still prototype-level and may need balance passes.
- The current architecture favors explicit TypeScript gameplay logic over broad engine abstraction.
- Respawn, platform reset, and randomized layout behavior are core parts of the game loop.

## Roadmap

- UI polish.
- Sound effects and background music.
- More level variety.
- Difficulty balancing.
- Better visual feedback.

## 中文简要说明

这是一个使用 **LayaAir 3 + TypeScript** 制作的 2D 小球平台跳跃项目，定位是学习和作品集展示项目，而不是商业化成品。

当前已经实现 Level 1 到 Level 4 的循环玩法，包括基础跳跃、移动平台、消失平台、静态尖刺、死亡复活、平台随机刷新、开场操作提示和代码绘制背景。项目重点是用自定义单向平台物理来保持平台跳跃规则简单、可控，并方便继续扩展关卡机制。
