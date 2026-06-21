# LayaAir Ball Game

这是一个使用 **LayaAir 3 + TypeScript** 制作的 2D 小球跳跃小游戏项目。

项目目前已经完成基础游戏循环，包括小球移动、跳跃、平台得分、死亡复活和代码绘制背景等功能。

## 项目状态

当前版本已经实现：

- 小球左右移动
- 小球跳跃
- 平台接触判断
- 得分系统
- 死亡与复活机制
- 代码绘制背景
- 基础游戏循环

## 技术栈

- LayaAir 3
- TypeScript
- Git / GitHub
- VS Code

## 核心文件说明

```text
src/
├─ Main.ts                # 游戏入口，负责初始化游戏主要逻辑
├─ BallController.ts      # 小球控制逻辑，包括移动、跳跃、死亡复活等
├─ ScoreManager.ts        # 得分系统，负责分数显示和平台得分判断
└─ BackgroundManager.ts   # 使用代码绘制游戏背景
