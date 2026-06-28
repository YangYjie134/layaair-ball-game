# LayaAir Ball Game

这是一个使用 **LayaAir 3 + TypeScript** 制作的 2D 小球跳跃小游戏项目。

项目目前已经完成基础游戏循环，包括小球移动、跳跃、自定义平台碰撞、平台得分、死亡复活、胜利判定、多关卡循环和代码绘制背景等功能。

## 项目状态

当前版本已经实现：

* 小球左右移动
* W / UP 跳跃
* 自定义重力与速度控制
* 单向平台碰撞检测
* 平台边缘自然掉落
* 平台得分系统
* 同一平台只加一次分
* 胜利条件判断
* You Win 胜利提示
* 死亡与复活机制
* 胜利后按 R 进入下一关
* Level 1 - 3 循环
* 平台随机刷新
* 代码绘制背景
* 基础游戏循环

## 技术栈

* LayaAir 3
* TypeScript
* Git / GitHub
* VS Code
* Node.js / TypeScript 编译检查

## 核心文件说明

```text
src/
├─ Main.ts                # 游戏入口，负责初始化背景和分数系统
├─ BallController.ts      # 小球核心控制逻辑，包括移动、跳跃、碰撞、死亡复活、关卡推进等
├─ ScoreManager.ts        # 得分系统，负责分数显示、平台去重得分、胜利判断和 reset
└─ BackgroundManager.ts   # 使用代码绘制游戏背景
```

## 核心机制说明

### Main.ts

`Main.ts` 是游戏启动后的入口脚本，主要负责初始化全局系统。

当前主要调用：

* `BackgroundManager.draw(this.owner)`：绘制游戏背景
* `ScoreManager.instance.init()`：初始化分数 UI

### BallController.ts

`BallController.ts` 是当前项目最核心的脚本，负责小球相关的大部分游戏逻辑。

主要包含：

* A / D 或左右方向键移动
* W / UP 跳跃
* `vx / vy` 速度控制
* 自定义重力
* 单向平台碰撞
* 平台边缘自然掉落
* Ground 死亡判断
* 掉出屏幕死亡判断
* `respawn()` 复活重置
* 胜利后按 R 进入下一关
* Level UI 显示
* 平台随机刷新

### ScoreManager.ts

`ScoreManager.ts` 负责分数和胜利状态。

主要包含：

* 显示 `Score`
* 记录当前分数
* 使用 `Set` 记录已经得过分的平台
* 防止同一平台重复加分
* 判断是否达到胜利分数
* 显示 `You Win!`
* `reset()` 重置分数、胜利状态和已得分平台记录

### BackgroundManager.ts

`BackgroundManager.ts` 负责绘制固定背景。

当前背景是静态背景，不会随着玩家输入或小球移动变化。背景节点会放在较低层级，避免遮挡小球、平台和 UI。

## 当前版本关键状态

当前项目已经从早期 Box2D 碰撞尝试，转为自定义平台物理方案。

采用自定义物理的原因：

* 更容易控制小球跳跃手感
* 避免平台顶角卡顿
* 更容易实现单向平台
* 更适合当前 2D 小球跳跃游戏的 MVP 阶段

当前核心状态包括：

* `vx`：横向速度
* `vy`：纵向速度
* `onGround`：小球是否站在可站立表面上
* `groundPlatform`：当前支撑小球的平台
* `previousY`：上一帧小球 Y 坐标
* `platformsActive`：平台碰撞是否激活
* `deathEnabled`：Ground 是否已经变成死亡区
* `currentLevel`：当前关卡
* `maxLevel`：最大关卡数

## 当前游戏流程

1. 游戏启动后，`Main.ts` 初始化背景和分数 UI。
2. 小球出生在初始位置。
3. 玩家使用 A / D 或左右方向键移动。
4. 玩家使用 W / UP 跳跃。
5. 从 Ground 起跳后，平台碰撞开始激活。
6. 小球落到 `Platform_*` 后获得分数。
7. 同一平台只会加一次分。
8. 第一次踩到平台后，Ground 变成死亡区。
9. 小球之后如果掉回 Ground，会触发复活。
10. 小球掉出屏幕底部超过一定距离，也会触发复活。
11. 分数达到胜利条件后显示 `You Win!`。
12. 胜利后按 R 进入下一关。
13. Level 超过最大关卡数后回到 Level 1。

## 开发记录

### 2026.6.23 02:33

完成 Claude Code 接入，并通过两个小重构验证流程：

1. 删除 `BallController.ts` 中重复的 `ScoreManager` 初始化；
2. 将 `ScoreManager.ts` 中的胜利分数 `5` 提取为 `winScore`；

同时理解了自定义平台物理中的落地检测和离地检测逻辑。

### 2026.6.28

完成当前阶段核心功能整理：

1. 完成 Ground 死亡时机优化；
2. 将旧的 `gameStarted` 拆分为 `platformsActive` 和 `deathEnabled`；
3. 实现第一跳失败落回 Ground 不死亡；
4. 实现第一次踩到平台后 Ground 才成为死亡区；
5. 新增 Level 1 - 3 循环；
6. 胜利后按 R 进入下一关；
7. 新关卡会重置小球、分数并随机刷新平台；
8. 在 `respawn()` 中补充 `previousY = startY`，避免上一帧位置残留；
9. 添加 TypeScript 本地编译检查；
10. 整理四个核心脚本注释；
11. 将跳跃输入简化为 W / UP。

## 后续计划

* 调整 Score UI 和 Level UI 间距
* 优化胜利后的重开流程
* 增加不同关卡难度
* 增加音效
* 优化 UI 显示
* 继续开发完善游戏
