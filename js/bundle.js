"use strict";
(() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __decorateClass = (decorators, target, key, kind) => {
    var result = kind > 1 ? void 0 : kind ? __getOwnPropDesc(target, key) : target;
    for (var i = decorators.length - 1, decorator; i >= 0; i--)
      if (decorator = decorators[i])
        result = (kind ? decorator(target, key, result) : decorator(result)) || result;
    if (kind && result)
      __defProp(target, key, result);
    return result;
  };

  // src/SfxManager.ts
  var _SfxManager = class _SfxManager {
    static playJump() {
      _SfxManager.playOneShot(_SfxManager.JUMP_URL);
    }
    static playDeath() {
      _SfxManager.playOneShot(_SfxManager.DEATH_URL);
    }
    static playClear() {
      _SfxManager.playOneShot(_SfxManager.CLEAR_URL);
    }
    static playOneShot(url) {
      try {
        Laya.SoundManager.soundVolume = _SfxManager.SFX_VOLUME;
        Laya.SoundManager.playSound(url, 1);
      } catch (error) {
        console.warn("[SfxManager] Failed to play sound:", url, error);
      }
    }
  };
  _SfxManager.JUMP_URL = "resources/audio/sfx_jump.mp3";
  _SfxManager.DEATH_URL = "resources/audio/sfx_death.mp3";
  _SfxManager.CLEAR_URL = "resources/audio/sfx_clear.mp3";
  _SfxManager.SFX_VOLUME = 0.7;
  var SfxManager = _SfxManager;

  // src/ScoreManager.ts
  var _ScoreManager = class _ScoreManager {
    constructor() {
      // 当前分数
      this.score = 0;
      // 分数显示文本对象
      this.scoreText = null;
      // 获胜提示文本对象
      this.winText = null;
      // 是否已经获胜
      this.hasWon = false;
      // 获胜所需分数
      this.winScore = 5;
      // 已经得分过的平台集合（防止重复计分）
      this.scoredPlatforms = /* @__PURE__ */ new Set();
    }
    // 获取分数管理器的单例实例
    static get instance() {
      if (!_ScoreManager._instance) {
        _ScoreManager._instance = new _ScoreManager();
      }
      return _ScoreManager._instance;
    }
    // 初始化分数管理器，重置分数状态并创建界面文本
    init() {
      this.score = 0;
      this.hasWon = false;
      this.scoredPlatforms.clear();
      if (!this.scoreText) {
        this.createScoreText();
      }
      if (!this.winText) {
        this.createWinText();
      }
      this.updateScoreText();
      this.hideWinText();
      console.log("ScoreManager: Score UI created");
    }
    // 创建分数显示文本
    createScoreText() {
      this.scoreText = new Laya.Text();
      this.scoreText.text = "Score: 0";
      this.scoreText.fontSize = 28;
      this.scoreText.color = "#FFD700";
      this.scoreText.bold = true;
      this.scoreText.x = 40;
      this.scoreText.y = 30;
      this.scoreText.width = 300;
      this.scoreText.height = 50;
      this.scoreText.zOrder = 9999;
      Laya.stage.addChild(this.scoreText);
    }
    // 创建获胜提示文本
    createWinText() {
      this.winText = new Laya.Text();
      this.winText.text = "You Win!";
      this.winText.fontSize = 48;
      this.winText.color = "#FFD700";
      this.winText.bold = true;
      this.winText.align = "center";
      this.winText.valign = "middle";
      this.winText.x = 0;
      this.winText.y = 0;
      this.winText.width = Laya.stage.width;
      this.winText.height = Laya.stage.height;
      this.winText.zOrder = 1e4;
      this.winText.visible = false;
      Laya.stage.addChild(this.winText);
    }
    // 当球接触到平台时添加分数
    addPlatformScore(platform) {
      if (!platform) {
        return;
      }
      const platformName = platform.name;
      if (typeof platformName !== "string") {
        return;
      }
      if (platformName === "Ground") {
        return;
      }
      if (!platformName.startsWith("Platform_")) {
        return;
      }
      if (this.scoredPlatforms.has(platformName)) {
        return;
      }
      this.scoredPlatforms.add(platformName);
      this.score++;
      this.updateScoreText();
      this.checkWin();
      console.log(
        "ScoreManager: add score from",
        platformName,
        "score =",
        this.score
      );
    }
    // 更新分数显示文本
    updateScoreText() {
      if (!this.scoreText) {
        return;
      }
      this.scoreText.text = "Score: " + this.score;
    }
    // 检查是否满足获胜条件（分数达到5分）
    checkWin() {
      if (this.hasWon || this.score < this.winScore) {
        return;
      }
      this.hasWon = true;
      SfxManager.playClear();
      this.showWinText();
      console.log("Game clear");
    }
    // 显示获胜提示文本
    showWinText() {
      if (!this.winText) {
        return;
      }
      this.winText.width = Laya.stage.width;
      this.winText.height = Laya.stage.height;
      this.winText.visible = true;
    }
    // 隐藏获胜提示文本
    hideWinText() {
      if (!this.winText) {
        return;
      }
      this.winText.visible = false;
    }
    // 重置分数管理器状态
    reset() {
      this.score = 0;
      this.hasWon = false;
      this.scoredPlatforms.clear();
      this.updateScoreText();
      this.hideWinText();
      console.log("ScoreManager: reset score");
    }
    // 获取当前分数
    getScore() {
      return this.score;
    }
    // 是否已经胜利（供外部判断是否允许按 R 重开）
    isWon() {
      return this.hasWon;
    }
  };
  // 单例实例，确保全局只存在一个分数管理器
  _ScoreManager._instance = null;
  var ScoreManager = _ScoreManager;

  // src/BallController.ts
  var { regClass } = Laya;
  var BallController = class extends Laya.Script {
    constructor() {
      super(...arguments);
      // 当前脚本采用自定义平台物理方案：
      // 球的移动、落地判断、墙体限制和复活逻辑都由脚本自行计算。
      // 这样可以避免 Box2D 在平台顶角附近反复接触/分离造成的卡顿。
      // ── 1. 运动参数：控制球的速度、重力和跳跃表现 ──
      // 水平速度（向右为正）
      this.vx = 0;
      // 竖直速度（向下为正）
      this.vy = 0;
      this.moveAccel = 0.7;
      // 水平加速度，越大左右启动越快。
      this.maxSpeedX = 5;
      // 水平最大速度，限制球不要越跑越快。
      this.friction = 0.99;
      // 松开方向键后的减速系数，越接近 1 滑行越久。
      this.gravity = 0.5;
      // 每帧给 vy 增加的重力。
      this.jumpStrength = 13;
      // W 跳跃力度，数值越大跳得越高。
      this.bounceY = 0.6;
      // 碰到顶墙时的垂直反弹比例。
      this.bounceX = 0.5;
      // 撞左右墙时的水平反弹比例。
      this.onGround = false;
      // 当前帧是否站在地面/平台上。
      // ── 2. 碰撞计算状态：记录平台激活状态与死亡复活条件 ──
      /**
       * Platform_* 平台激活标志。初值 false。
       * 从 Ground 起跳后自动置为 true，使 Platform_* 开始参与碰撞判定。
       * 目的：避免回落 Ground 时被下面的 Platform_* 意外阻挡，保证跳跃逻辑清晰。
       */
      this.platformsActive = false;
      // 从 Ground 起跳后激活 Platform_* 碰撞
      /**
       * Ground 死亡区启用标志。初值 false。
       * 第一次踩到任何 Platform_* 后自动置为 true，允许接触 Ground 触发复活逻辑。
       * 目的：第一跳只能在 Ground 上，不会误踩下面的 Platform_* 后立即死亡。
       */
      this.deathEnabled = false;
      // 第一次踩到 Platform_* 后，Ground 才算死亡区
      // 球的初始出生点X坐标
      this.startX = 0;
      // 球的初始出生点Y坐标
      this.startY = 0;
      // 上一帧球的Y坐标（用于判断是否穿过平台顶面）
      this.previousY = 0;
      this.centerX = 0;
      // 这里把 ball.x 当作球心 X 使用。
      this.centerY = 0;
      // 这里把 ball.y 当作球心 Y 使用。
      this.groundPlatform = null;
      // 当前托住球的平台，走出边缘后会释放。
      this.topWall = null;
      // 顶墙节点，用来计算真实可玩区域。
      this.leftWall = null;
      // 左墙节点，用来避免球钻进白墙。
      this.rightWall = null;
      // 右墙节点，用来避免球钻进白墙。
      // ── 3. 输入控制相关变量：记录按键状态，避免连续触发跳跃与重开 ──
      // 上一帧是否按下了跳跃键（用于检测按键刚按下）
      this.prevJumpKey = false;
      // 上一帧是否按下了重开键 R（用于检测按键刚按下）
      this.prevRestartKey = false;
      // ── 4. 关卡状态：记录当前关卡编号与界面显示内容 ──
      this.currentLevel = 1;
      this.maxLevel = 4;
      this.levelText = null;
      this.rng = Math.random;
      this.platforms = [];
      // Platform_ 开头的节点和 Ground 都会放进这里。
      this.spikes = [];
      // Level 4 静态尖刺，运行时动态创建。
      this.spikeWidthRatio = 0.45;
      // Level 4 尖刺占平台宽度比例，越小安全区越宽。
      this.disappearHighlightBar = null;
      this.isHandlingDeath = false;
      // 共享死亡锁，避免同一帧重复触发死亡流程。
      /**
       * 移动平台运行时配置映射表
       * Key: 平台节点对象
       * Value: 该平台对应的 MovingConfig 配置（包含速度、方向、rangeMin/rangeMax 等）
       * 作用：updateMovingPlatform() 每帧查询此表，按 rangeMin/rangeMax 限制范围更新平台 x 坐标。
       * 生命周期：randomizePlatforms() 时根据关卡等级随机填充，respawn() 时清空。
       */
      this.movingConfigs = /* @__PURE__ */ new Map();
      /**
       * 消失平台状态映射表
       * Key: 平台节点对象
       * Value: 该平台对应的 DisappearConfig 配置（包含状态、触发时间戳等）
       * 作用：onUpdate() 中每帧检查计时进度，更新颜色预警，判断是否消失。
       * 启用条件：仅 Level 3/4 关卡通过 setupDisappearPlatforms() 填充；低于 Level 3 时为空。
       */
      this.disappearConfigs = /* @__PURE__ */ new Map();
    }
    setRandomSource(rng) {
      this.rng = rng;
    }
    // 初始化时记录出生点并收集平台与墙体节点，后续碰撞逻辑将以这些节点为基准
    onAwake() {
      const ball = this.owner;
      if (ball) {
        this.centerX = ball.x;
        this.centerY = ball.y;
        this.startX = this.centerX;
        this.startY = this.centerY;
      }
      this.collectPlatforms();
      this.createLevelText();
    }
    // 每帧更新，处理输入、重力、跳跃和碰撞等逻辑
    onUpdate() {
      const ball = this.owner;
      if (!ball)
        return;
      this.stepPhysics(
        ball,
        {
          restart: () => this.isKeyDown(Laya.Keyboard.R),
          left: () => this.isKeyDown(Laya.Keyboard.LEFT, Laya.Keyboard.A),
          right: () => this.isKeyDown(Laya.Keyboard.RIGHT, Laya.Keyboard.D),
          jump: () => this.isKeyDown(Laya.Keyboard.W) || this.isKeyDown(Laya.Keyboard.UP)
        },
        {
          currTimer: () => Laya.timer.currTimer
        },
        {
          isWon: () => ScoreManager.instance.isWon(),
          restartGame: () => this.restartGame(),
          playJump: () => SfxManager.playJump(),
          updateMovingPlatform: (platform) => this.updateMovingPlatform(platform),
          resolveVerticalCollision: (platform, time) => this.resolveVerticalCollision(platform, time),
          syncDisappearHighlightBar: () => this.syncDisappearHighlightBar(),
          checkHazards: () => this.checkHazards(),
          releaseGroundIfUnsupported: () => this.releaseGroundIfUnsupported(),
          clampToCanvas: () => this.clampToCanvas(),
          syncBallSprite: (target) => this.syncBallSprite(target)
        }
      );
    }
    stepPhysics(ball, input, time, env) {
      var _a;
      const restart = input.restart();
      if (restart && !this.prevRestartKey && env.isWon()) {
        this.prevRestartKey = restart;
        env.restartGame();
        return;
      }
      this.prevRestartKey = restart;
      this.centerX = ball.x;
      this.centerY = ball.y;
      const left = input.left();
      const right = input.right();
      const jump = input.jump();
      if (left)
        this.vx -= this.moveAccel;
      if (right)
        this.vx += this.moveAccel;
      if (!left && !right) {
        this.vx *= this.friction;
        if (Math.abs(this.vx) < 0.05)
          this.vx = 0;
      }
      this.vx = Math.max(-this.maxSpeedX, Math.min(this.maxSpeedX, this.vx));
      this.vy += this.gravity;
      if (jump && !this.prevJumpKey && this.onGround && !env.isWon()) {
        if (!this.platformsActive && ((_a = this.groundPlatform) == null ? void 0 : _a.name) === "Ground") {
          this.platformsActive = true;
          console.log("Platforms active");
        }
        this.vy = -this.jumpStrength;
        env.playJump();
        this.onGround = false;
        this.groundPlatform = null;
      }
      this.prevJumpKey = jump;
      this.onGround = false;
      this.groundPlatform = null;
      this.previousY = this.centerY;
      this.centerY += this.vy;
      const nowMs = time.currTimer();
      for (const [p, cfg] of this.disappearConfigs) {
        if (cfg.state === "counting") {
          const elapsedMs = nowMs - cfg.triggerAt;
          const progress = Math.max(0, Math.min(1, elapsedMs / BallController.DISAPPEAR_DELAY));
          let warningColor = "#ffff00";
          if (progress < 0.2) {
            const rate = progress / 0.2;
            const red = Math.round(255 * rate);
            warningColor = "#" + ("0" + red.toString(16)).slice(-2) + "ff00";
          } else if (progress >= 0.8) {
            const rate = (progress - 0.8) / 0.2;
            const green = Math.round(255 * (1 - rate));
            warningColor = "#ff" + ("0" + green.toString(16)).slice(-2) + "00";
          }
          this.repaintPlatformColor(p, warningColor);
          if (elapsedMs >= BallController.DISAPPEAR_DELAY) {
            cfg.state = "hidden";
            p.visible = false;
          }
        }
      }
      for (const platform of this.platforms) {
        env.updateMovingPlatform(platform);
        env.resolveVerticalCollision(platform, time);
      }
      env.syncDisappearHighlightBar();
      this.centerX += this.vx;
      env.checkHazards();
      env.releaseGroundIfUnsupported();
      env.clampToCanvas();
      env.syncBallSprite(ball);
    }
    /**
     * 单向平台垂直碰撞检测与落地处理
     *
     * 核心原理：只有"球正在下落，且球底部从平台上方穿过平台顶面"时，才把球放到平台上。
     * 这样平台侧面和底面不会产生碰撞，避开了 Box2D 顶角处的反复接触/分离卡顿。
     *
     * 流程：
     * 1. 检查平台是否已消失（hidden）或未激活（Platform_* 但 platformsActive=false）
     * 2. 计算球心、球半径、平台几何关系
     * 3. 判断"穿过判定"：上一帧在平台上方，本帧在平台下方 → 视为跨过顶面
     * 4. 若穿过且水平范围内，更新落地状态、速度、平台引用
     * 5. Ground 平台落地时检查 deathEnabled 标志决定是否复活
     * 6. Platform_* 落地时触发计分和消失平台计时
     */
    resolveVerticalCollision(platform, time) {
      const dcSkip = this.disappearConfigs.get(platform);
      if (dcSkip && dcSkip.state === "hidden")
        return;
      const name = platform == null ? void 0 : platform.name;
      if (!this.platformsActive && typeof name === "string" && name.indexOf("Platform_") === 0) {
        return;
      }
      const radius = this.getBallRadius();
      const platformX = platform.x || 0;
      const platformY = platform.y || 0;
      const platformWidth = platform.width || 0;
      const platformTop = platformY;
      const previousBottom = this.previousY + radius;
      const currentBottom = this.centerY + radius;
      const edgeGrace = this.getPlatformEdgeGrace(radius);
      const withinTop = this.centerX >= platformX - edgeGrace && this.centerX <= platformX + platformWidth + edgeGrace;
      const crossedTop = previousBottom <= platformTop + 0.5 && currentBottom >= platformTop - 0.5;
      if (this.vy >= 0 && withinTop && crossedTop) {
        this.centerY = platformTop - radius;
        this.vy = 0;
        this.onGround = true;
        this.groundPlatform = platform;
        const platformName = (platform == null ? void 0 : platform.name) || "";
        if (platformName === "Ground") {
          if (this.deathEnabled && !ScoreManager.instance.isWon()) {
            this.handleDeath();
          }
          return;
        }
        if (typeof platformName === "string" && platformName.indexOf("Platform_") === 0) {
          this.deathEnabled = true;
          ScoreManager.instance.addPlatformScore(platform);
          const dc = this.disappearConfigs.get(platform);
          if (dc && dc.state === "idle") {
            dc.state = "counting";
            dc.triggerAt = time.currTimer();
          }
        }
      }
    }
    /**
     * 墙体边界限制。
     * 因为 Box2D 碰撞被关闭了，顶墙和左右墙也需要用脚本手动挡住。
     */
    clampToCanvas() {
      const radius = this.getBallRadius();
      const leftWallInner = this.getWallInnerBound(this.leftWall, "left");
      const rightWallInner = this.getWallInnerBound(this.rightWall, "right");
      const topWallBottom = this.getWallInnerBound(this.topWall, "top");
      const minX = leftWallInner + radius;
      const maxX = rightWallInner - radius;
      if (this.centerX < minX) {
        this.centerX = minX;
        this.vx = -this.vx * this.bounceX;
      }
      if (this.centerX > maxX) {
        this.centerX = maxX;
        this.vx = -this.vx * this.bounceX;
      }
      const minY = topWallBottom + radius;
      if (this.centerY < minY) {
        this.centerY = minY;
        if (this.vy < 0)
          this.vy = -this.vy * this.bounceY;
      }
      this.checkDeath();
    }
    /**
     * 更新移动平台的水平位置
     * 每帧对所有激活的 Platform_* 调用一次，按照 MovingConfig 参数更新其 x 坐标。
     * 移动范围由 rangeMin 和 rangeMax 约束，触及边界时自动翻转方向。
     *
     * 特殊处理：消失平台消失后（state === 'hidden'）停止后台移动，
     * 冻结平台在消失瞬间的 x 位置，避免隐形移动导致诡异行为。
     *
     * @param platform - 待更新的平台节点
     */
    updateMovingPlatform(platform) {
      const config = this.movingConfigs.get(platform);
      if (!config)
        return;
      const dc = this.disappearConfigs.get(platform);
      if (dc && dc.state === "hidden")
        return;
      platform.x += config.speed * config.direction;
      if (platform.x >= config.rangeMax) {
        platform.x = config.rangeMax;
        config.direction = -1;
      } else if (platform.x <= config.rangeMin) {
        platform.x = config.rangeMin;
        config.direction = 1;
      }
    }
    createDisappearHighlightBarIfNeeded() {
      if (this.disappearHighlightBar)
        return;
      const platform = this.platforms.find((p) => typeof (p == null ? void 0 : p.name) === "string" && p.name.indexOf("Platform_") === 0);
      const platformParent = platform == null ? void 0 : platform.parent;
      if (!platformParent)
        return;
      const bar = new Laya.Sprite();
      bar.name = "DisappearHighlightBar";
      bar.visible = false;
      bar.width = 0;
      bar.height = 4;
      bar.zOrder = (platform.zOrder || 0) + 1;
      platformParent.addChild(bar);
      this.disappearHighlightBar = bar;
    }
    syncDisappearHighlightBar() {
      var _a;
      this.createDisappearHighlightBarIfNeeded();
      const bar = this.disappearHighlightBar;
      if (!bar)
        return;
      const entry = this.disappearConfigs.entries().next();
      if (entry.done) {
        bar.visible = false;
        return;
      }
      const [target, cfg] = entry.value;
      if (!target || !cfg || cfg.state === "hidden") {
        bar.visible = false;
        return;
      }
      let color = "#00ff00";
      const cmds = (_a = target == null ? void 0 : target.graphics) == null ? void 0 : _a.cmds;
      if (Array.isArray(cmds)) {
        const drawRectCmd = Laya.DrawRectCmd ? cmds.find((cmd) => cmd instanceof Laya.DrawRectCmd) : cmds.find((cmd) => typeof (cmd == null ? void 0 : cmd.fillColor) === "string");
        if (typeof (drawRectCmd == null ? void 0 : drawRectCmd.fillColor) === "string") {
          color = drawRectCmd.fillColor;
        }
      }
      bar.x = target.x;
      bar.y = target.y;
      bar.width = target.width || 0;
      bar.height = 4;
      bar.zOrder = (target.zOrder || 0) + 1;
      bar.graphics.clear();
      bar.graphics.drawRect(0, 0, bar.width, bar.height, color);
      bar.visible = true;
    }
    // 按颜色重绘平台矩形填充,不重建绘制命令
    repaintPlatformColor(platform, color) {
      const graphics = platform == null ? void 0 : platform.graphics;
      const cmds = graphics == null ? void 0 : graphics.cmds;
      if (!graphics || !Array.isArray(cmds) || !Laya.DrawRectCmd)
        return;
      const drawRectCmd = cmds.find((cmd) => cmd instanceof Laya.DrawRectCmd);
      if (!drawRectCmd)
        return;
      drawRectCmd.fillColor = color;
      if (typeof graphics.repaint === "function") {
        graphics.repaint();
      }
    }
    // 检查球是否掉出屏幕
    checkDeath() {
      if (this.centerY > Laya.stage.height + 100 && !ScoreManager.instance.isWon()) {
        this.handleDeath();
      }
    }
    // 检查小球是否碰到可见尖刺。只触发统一死亡流程，不改平台落地状态。
    checkHazards() {
      if (ScoreManager.instance.isWon())
        return;
      const radius = this.getBallRadius();
      const inset = Math.min(3, radius * 0.3);
      for (const spike of this.spikes) {
        if (!(spike == null ? void 0 : spike.visible))
          continue;
        const rectLeft = (spike.x || 0) + inset;
        const rectRight = (spike.x || 0) + (spike.width || 0) - inset;
        const rectTop = (spike.y || 0) + inset;
        const rectBottom = (spike.y || 0) + (spike.height || 0) - inset;
        if (rectLeft >= rectRight || rectTop >= rectBottom)
          continue;
        const nearestX = Math.max(rectLeft, Math.min(this.centerX, rectRight));
        const nearestY = Math.max(rectTop, Math.min(this.centerY, rectBottom));
        const dx = this.centerX - nearestX;
        const dy = this.centerY - nearestY;
        if (dx * dx + dy * dy <= radius * radius) {
          this.handleDeath();
          return;
        }
      }
    }
    // 死亡代表当前随机挑战失败：先换同关布局，再复活到出生点。
    handleDeath() {
      if (this.isHandlingDeath)
        return;
      if (ScoreManager.instance.isWon())
        return;
      this.isHandlingDeath = true;
      SfxManager.playDeath();
      try {
        this.randomizePlatforms();
        this.randomizeHazards();
        this.respawn();
      } finally {
        this.isHandlingDeath = false;
      }
    }
    /**
     * 复活逻辑：重置小球位置、速度、平台状态和消失平台配置
     *
     * 复活时刻：
     * 1. 小球掉出屏幕底部（checkDeath()）
     * 2. 小球落到 Ground 平台且 deathEnabled=true（resolveVerticalCollision()）
     *
     * 复活操作：
     * - 小球位置/速度：恢复到出生点，清空速度向量
     * - 平台碰撞状态：platformsActive=false（需重新从 Ground 起跳激活）
     * - 死亡判定：deathEnabled=false（需重新踩 Platform_* 才启用 Ground 死亡）
     * - 分数系统：调用 ScoreManager.reset()，清空本关分数和已踩平台记录
     * - 消失平台：全部复原为 idle 状态（绿色可见），重置计时器，允许再次触发倒计时
     *
     * 此方法不修改 currentLevel，仅复活当前关卡。下一关切换由 restartGame() 负责。
     */
    respawn() {
      console.log("Ball died, respawn");
      this.centerX = this.startX;
      this.centerY = this.startY;
      this.previousY = this.startY;
      this.vx = 0;
      this.vy = 0;
      this.onGround = false;
      this.groundPlatform = null;
      this.platformsActive = false;
      this.deathEnabled = false;
      ScoreManager.instance.reset();
      for (const [p, cfg] of this.disappearConfigs) {
        cfg.state = "idle";
        cfg.triggerAt = 0;
        p.visible = true;
        this.repaintPlatformColor(p, "#00cc00");
      }
    }
    // 胜利后进入下一关：复用 respawn() 的全部重置，再重新随机平台布局
    // 胜利后按 R 重开本局，并切换到下一关的随机平台布局
    restartGame() {
      console.log("Restart game");
      this.currentLevel++;
      if (this.currentLevel > this.maxLevel) {
        this.currentLevel = 1;
      }
      this.respawn();
      this.randomizePlatforms();
      this.randomizeHazards();
      this.updateLevelText();
    }
    // 创建关卡显示文本，用于在界面上展示当前关卡编号
    createLevelText() {
      if (this.levelText)
        return;
      this.levelText = new Laya.Text();
      this.levelText.fontSize = 28;
      this.levelText.color = "#FFD700";
      this.levelText.bold = true;
      this.levelText.x = 40;
      this.levelText.y = 80;
      this.levelText.width = 300;
      this.levelText.height = 50;
      this.levelText.zOrder = 9999;
      Laya.stage.addChild(this.levelText);
      this.updateLevelText();
    }
    // 根据当前关卡状态刷新关卡显示文本
    updateLevelText() {
      if (!this.levelText)
        return;
      this.levelText.text = "Level: " + this.currentLevel;
    }
    /**
     * 统一计算墙体内侧边界。
     * 当前左右墙是一个横向矩形旋转 90 度得到的竖墙：
     * - width 是墙的长度，不是厚度
     * - height 才是墙的厚度
     * 所以左墙内侧是 wall.x，右墙内侧是 wall.x - wall.height。
     */
    getWallInnerBound(wall, side) {
      if (!wall) {
        return side === "right" ? Laya.stage.width : 0;
      }
      const x = wall.x || 0;
      const y = wall.y || 0;
      const width = wall.width || 0;
      const height = wall.height || 0;
      const rotation = Math.abs(wall.rotation || 0) % 180;
      const isVerticalByRotation = rotation > 45 && rotation < 135;
      if (side === "left")
        return isVerticalByRotation ? x : x + width;
      if (side === "right")
        return isVerticalByRotation ? x - height : x;
      return y + height;
    }
    // 同步球的位置到Laya节点
    syncBallSprite(ball) {
      ball.x = this.centerX;
      ball.y = this.centerY;
    }
    /**
     * 检测球是否离开平台边缘并释放落地状态
     *
     * 边缘释放机制：球站在平台上时，如果水平移动到平台有效范围外（考虑容差），
     * 立即清除落地状态，让球自然下落，避免被硬卡在平台边缘。
     *
     * 这个机制确保玩家能顺利跨越平台间的小间隙，同时保持单向平台的视觉直观性。
     * 容差值（edgeGrace）为 2 像素或半径的 40%，防止过于敏感或不够敏感。
     */
    releaseGroundIfUnsupported() {
      if (!this.onGround || !this.groundPlatform)
        return;
      const platform = this.groundPlatform;
      const radius = this.getBallRadius();
      const edgeGrace = this.getPlatformEdgeGrace(radius);
      const leftBound = (platform.x || 0) - edgeGrace;
      const rightBound = (platform.x || 0) + (platform.width || 0) + edgeGrace;
      if (this.centerX < leftBound || this.centerX > rightBound) {
        this.onGround = false;
        this.groundPlatform = null;
      }
    }
    // 计算平台边缘容差值
    getPlatformEdgeGrace(radius) {
      return Math.min(2, radius * 0.4);
    }
    // 获取球的半径
    getBallRadius() {
      const ball = this.owner;
      return Math.max(ball.width || 30, ball.height || 30) * 0.5;
    }
    // 收集场景中所有的平台和墙体
    collectPlatforms() {
      var _a, _b, _c, _d, _e;
      const parent = this.owner.parent;
      const children = (_b = (_a = parent == null ? void 0 : parent._children) != null ? _a : parent == null ? void 0 : parent._childs) != null ? _b : [];
      this.topWall = (_c = children.find((child) => (child == null ? void 0 : child.name) === "top wall")) != null ? _c : null;
      this.leftWall = (_d = children.find((child) => (child == null ? void 0 : child.name) === "left wall")) != null ? _d : null;
      this.rightWall = (_e = children.find((child) => (child == null ? void 0 : child.name) === "right wall")) != null ? _e : null;
      this.platforms = children.filter((child) => {
        return typeof (child == null ? void 0 : child.name) === "string" && (child.name.indexOf("Platform_") === 0 || child.name === "Ground");
      });
      if (this.platforms.length === 0) {
        console.warn("⚠️ 场景中未找到任何以 Platform_ 开头的节点！");
      }
      this.createHazardsIfNeeded();
      this.randomizePlatforms();
      this.randomizeHazards();
    }
    // 动态创建 Level 4 尖刺，挂到 Platform_* 相同的 parent，避免坐标系不一致。
    createHazardsIfNeeded() {
      var _a, _b;
      if (this.spikes.length > 0)
        return;
      const platform = this.platforms.find((p) => {
        return typeof (p == null ? void 0 : p.name) === "string" && p.name.indexOf("Platform_") === 0;
      });
      const platformParent = platform == null ? void 0 : platform.parent;
      if (!platformParent)
        return;
      const children = (_b = (_a = platformParent == null ? void 0 : platformParent._children) != null ? _a : platformParent == null ? void 0 : platformParent._childs) != null ? _b : [];
      const existingSpike = typeof platformParent.getChildByName === "function" ? platformParent.getChildByName("Spike_1") : children.find((child) => (child == null ? void 0 : child.name) === "Spike_1");
      if (existingSpike) {
        existingSpike.visible = false;
        this.spikes.push(existingSpike);
        return;
      }
      const spike = new Laya.Sprite();
      spike.name = "Spike_1";
      spike.visible = false;
      spike.width = 80;
      spike.height = 8;
      spike.zOrder = (platform.zOrder || 0) + 1;
      spike.graphics.clear();
      spike.graphics.drawRect(0, 0, spike.width, spike.height, "#ff0000");
      platformParent.addChild(spike);
      this.spikes.push(spike);
    }
    // Level 4 尖刺随机化：只放在非移动、非消失的 Platform_1~Platform_5 上。
    randomizeHazards() {
      this.createHazardsIfNeeded();
      if (this.currentLevel !== 4) {
        for (const spike2 of this.spikes) {
          spike2.visible = false;
        }
        return;
      }
      const spike = this.spikes[0];
      if (!spike)
        return;
      const radius = this.getBallRadius();
      const spikeHeight = Math.max(8, Math.round(radius * 1.6));
      const minSafeWidth = radius * 2 + 12;
      const leftInner = this.getWallInnerBound(this.leftWall, "left");
      const rightInner = this.getWallInnerBound(this.rightWall, "right");
      const topWallBottom = this.getWallInnerBound(this.topWall, "top");
      const sorted = this.getSortedGamePlatforms();
      const candidates = [];
      const spikeSides = ["left", "right"];
      for (const platform of sorted) {
        const name = platform == null ? void 0 : platform.name;
        if (typeof name !== "string" || !/^Platform_[1-5]$/.test(name))
          continue;
        if (this.movingConfigs.has(platform))
          continue;
        if (this.disappearConfigs.has(platform))
          continue;
        const platformX = platform.x || 0;
        const platformY = platform.y || 0;
        const platformWidth = platform.width || 0;
        const spikeWidth2 = Math.floor(platformWidth * this.spikeWidthRatio);
        const safeWidth = platformWidth - spikeWidth2;
        if (spikeWidth2 <= 0 || safeWidth < minSafeWidth)
          continue;
        if (platformX < leftInner || platformX + platformWidth > rightInner)
          continue;
        if (platformY - spikeHeight < topWallBottom)
          continue;
        for (const side of spikeSides) {
          if (this.isSpikePlacementFair(platform, side, sorted, spikeWidth2)) {
            candidates.push({ platform, side, spikeWidth: spikeWidth2 });
          }
        }
      }
      if (candidates.length === 0) {
        spike.visible = false;
        return;
      }
      const placement = candidates[Math.floor(this.rng() * candidates.length)];
      const target = placement.platform;
      const targetWidth = target.width || 0;
      const spikeWidth = placement.spikeWidth;
      const spikeX = placement.side === "left" ? target.x : target.x + targetWidth - spikeWidth;
      const spikeY = target.y - spikeHeight;
      if (spikeX < leftInner || spikeX + spikeWidth > rightInner || spikeY < topWallBottom) {
        spike.visible = false;
        return;
      }
      spike.x = Math.round(spikeX);
      spike.y = Math.round(spikeY);
      spike.width = spikeWidth;
      spike.height = spikeHeight;
      spike.zOrder = (target.zOrder || 0) + 1;
      spike.visible = true;
      spike.graphics.clear();
      spike.graphics.drawRect(0, 0, spike.width, spike.height, "#ff0000");
    }
    getSortedGamePlatforms() {
      return this.platforms.filter((p) => typeof p.name === "string" && p.name.indexOf("Platform_") === 0).sort((a, b) => a.name.localeCompare(b.name));
    }
    isSpikePlacementFair(hostPlatform, spikeSide, sorted, spikeWidth) {
      var _a;
      const hostIndex = sorted.indexOf(hostPlatform);
      if (hostIndex < 0)
        return true;
      const ground = (_a = this.platforms.find((p) => (p == null ? void 0 : p.name) === "Ground")) != null ? _a : null;
      const prevNeighbor = hostIndex > 0 ? sorted[hostIndex - 1] : ground;
      const nextNeighbor = hostIndex < sorted.length - 1 ? sorted[hostIndex + 1] : null;
      if (prevNeighbor && this.isNeighborOnSide(hostPlatform, prevNeighbor, spikeSide)) {
        if (!this.isAffectedJumpFair(prevNeighbor, hostPlatform, hostPlatform, spikeSide, spikeWidth)) {
          return false;
        }
      }
      if (nextNeighbor && this.isNeighborOnSide(hostPlatform, nextNeighbor, spikeSide)) {
        if (!this.isAffectedJumpFair(hostPlatform, nextNeighbor, hostPlatform, spikeSide, spikeWidth)) {
          return false;
        }
      }
      return true;
    }
    isAffectedJumpFair(sourcePlatform, targetPlatform, hostPlatform, spikeSide, spikeWidth) {
      const reach = this.estimateJumpReachBySimulation(sourcePlatform.y || 0, targetPlatform.y || 0);
      if (this.disappearConfigs.has(targetPlatform)) {
        const requiredX2 = this.getWorstCaseRequiredX(sourcePlatform, targetPlatform, hostPlatform, spikeSide, spikeWidth);
        if (requiredX2 === null)
          return false;
        const safetyFrameMargin = 2;
        const horizontalSafetyMargin = this.maxSpeedX * safetyFrameMargin;
        return requiredX2 <= reach - horizontalSafetyMargin;
      }
      if (this.movingConfigs.has(targetPlatform)) {
        const bestCaseRequiredX = this.getBestCaseRequiredX(sourcePlatform, targetPlatform, hostPlatform, spikeSide, spikeWidth);
        if (bestCaseRequiredX === null)
          return false;
        return bestCaseRequiredX <= reach;
      }
      const requiredX = this.getWorstCaseRequiredX(sourcePlatform, targetPlatform, hostPlatform, spikeSide, spikeWidth);
      if (requiredX === null)
        return false;
      return requiredX <= reach;
    }
    getWorstCaseRequiredX(sourcePlatform, targetPlatform, hostPlatform, spikeSide, spikeWidth) {
      const sourceXs = this.getPlatformXOptions(sourcePlatform);
      const targetXs = this.getPlatformXOptions(targetPlatform);
      let worstRequiredX = 0;
      for (const sourceX of sourceXs) {
        const sourceInterval = this.getPlatformSafeCenterInterval(
          sourcePlatform,
          sourcePlatform === hostPlatform ? spikeSide : void 0,
          sourcePlatform === hostPlatform ? spikeWidth : void 0,
          sourceX
        );
        if (!sourceInterval)
          return null;
        for (const targetX of targetXs) {
          const targetInterval = this.getPlatformSafeCenterInterval(
            targetPlatform,
            targetPlatform === hostPlatform ? spikeSide : void 0,
            targetPlatform === hostPlatform ? spikeWidth : void 0,
            targetX
          );
          if (!targetInterval)
            return null;
          worstRequiredX = Math.max(worstRequiredX, this.getCenterIntervalGap(sourceInterval, targetInterval));
        }
      }
      return worstRequiredX;
    }
    getBestCaseRequiredX(sourcePlatform, targetPlatform, hostPlatform, spikeSide, spikeWidth) {
      const sourceXs = this.getPlatformXOptions(sourcePlatform);
      const targetXs = this.getPlatformXOptions(targetPlatform);
      let bestRequiredX = null;
      for (const sourceX of sourceXs) {
        const sourceInterval = this.getPlatformSafeCenterInterval(
          sourcePlatform,
          sourcePlatform === hostPlatform ? spikeSide : void 0,
          sourcePlatform === hostPlatform ? spikeWidth : void 0,
          sourceX
        );
        if (!sourceInterval)
          continue;
        for (const targetX of targetXs) {
          const targetInterval = this.getPlatformSafeCenterInterval(
            targetPlatform,
            targetPlatform === hostPlatform ? spikeSide : void 0,
            targetPlatform === hostPlatform ? spikeWidth : void 0,
            targetX
          );
          if (!targetInterval)
            continue;
          const requiredX = this.getCenterIntervalGap(sourceInterval, targetInterval);
          bestRequiredX = bestRequiredX === null ? requiredX : Math.min(bestRequiredX, requiredX);
        }
      }
      return bestRequiredX;
    }
    getPlatformXOptions(platform) {
      const config = this.movingConfigs.get(platform);
      if (!config)
        return [platform.x || 0];
      const options = [];
      for (const x of [config.rangeMin, config.rangeMax]) {
        if (typeof x === "number" && isFinite(x) && options.indexOf(x) < 0) {
          options.push(x);
        }
      }
      return options.length > 0 ? options : [platform.x || 0];
    }
    getPlatformSafeCenterInterval(platform, spikeSide, spikeWidth, xOverride) {
      const radius = this.getBallRadius();
      const platformX = xOverride !== void 0 ? xOverride : platform.x || 0;
      const platformWidth = platform.width || 0;
      const spikeBlockWidth = spikeWidth || 0;
      let left = platformX + radius;
      let right = platformX + platformWidth - radius;
      if (spikeSide === "left") {
        left = platformX + spikeBlockWidth + radius;
      } else if (spikeSide === "right") {
        right = platformX + platformWidth - spikeBlockWidth - radius;
      }
      if (left >= right)
        return null;
      return [left, right];
    }
    getCenterIntervalGap(sourceInterval, targetInterval) {
      if (targetInterval[0] > sourceInterval[1]) {
        return targetInterval[0] - sourceInterval[1];
      }
      if (sourceInterval[0] > targetInterval[1]) {
        return sourceInterval[0] - targetInterval[1];
      }
      return 0;
    }
    isNeighborOnSide(hostPlatform, neighborPlatform, side) {
      const radius = this.getBallRadius();
      const hostCenter = (hostPlatform.x || 0) + (hostPlatform.width || 0) / 2;
      const neighborCenter = (neighborPlatform.x || 0) + (neighborPlatform.width || 0) / 2;
      const delta = neighborCenter - hostCenter;
      if (Math.abs(delta) < radius)
        return false;
      return side === "left" ? delta <= -radius : delta >= radius;
    }
    estimateJumpReachBySimulation(sourceY, targetY) {
      const radius = this.getBallRadius();
      let centerY = sourceY - radius;
      let vy = -this.jumpStrength;
      let horizontalSteps = 0;
      const maxFrames = 120;
      for (let frame = 0; frame < maxFrames; frame++) {
        const previousY = centerY;
        centerY += vy;
        const previousBottom = previousY + radius;
        const currentBottom = centerY + radius;
        const crossedTop = previousBottom <= targetY + 0.5 && currentBottom >= targetY - 0.5;
        if (vy >= 0 && crossedTop) {
          return horizontalSteps * this.maxSpeedX;
        }
        horizontalSteps++;
        vy += this.gravity;
      }
      return -1;
    }
    /**
     * 对 Platform_* 平台做分层随机布局，生成关卡的随机平台配置
     *
     * 逻辑流程：
     * 1. 过滤并按名字排序 Platform_* 节点，保证分层顺序稳定
     * 2. 分配 Platform_1 ~ Platform_N 分别对应从低到高的 N 层
     * 3. 对每层平台：
     *    - Y 坐标：基础高度向上分层（Platform_1 最低 ≈620px），每层相隔 120px
     *    - X 坐标：在合法范围内随机（保证整体在左右墙内），相邻平台中心距离限制在 ±300px
     *    - Platform_1 特殊处理：避开出生点正下方，但留在可跳范围内
     * 4. 按关卡等级随机分配移动平台（Level 2 选 1 个，Level 3/4 选 2 个）
     *    - rangeMin 来自左墙内侧边界，rangeMax 来自右墙内侧边界减去平台宽度
     *    - 填充 movingConfigs Map 以供 updateMovingPlatform() 使用
     * 5. 调用 setupDisappearPlatforms() 注册消失平台配置（仅 Level 3/4 启用）
     *
     * 此方法仅改动平台节点的 x / y 坐标，不改其他属性（width/height/显示等）。
     * 由 collectPlatforms()（初始化）和 restartGame()（下一关）调用。
     */
    randomizePlatforms() {
      const sorted = this.platforms.filter((p) => typeof p.name === "string" && p.name.indexOf("Platform_") === 0).sort((a, b) => a.name.localeCompare(b.name));
      const count = sorted.length;
      this.movingConfigs.clear();
      if (count === 0)
        return;
      const xMin = this.getWallInnerBound(this.leftWall, "left");
      const xMax = this.getWallInnerBound(this.rightWall, "right");
      const baseY = 620;
      const layerStep = 120;
      const yJitter = 20;
      const maxNeighborDX = 300;
      let prevCenterX = this.startX;
      const movingCount = this.currentLevel === 3 || this.currentLevel === 4 ? 2 : this.currentLevel === 2 ? 1 : 0;
      const movingIndices = /* @__PURE__ */ new Set();
      const targetMovingCount = Math.min(movingCount, count);
      while (movingIndices.size < targetMovingCount) {
        movingIndices.add(Math.floor(this.rng() * count));
      }
      let movingIndex = 0;
      for (let i = 0; i < count; i++) {
        const platform = sorted[i];
        const platformWidth = platform.width || 200;
        const halfWidth = platformWidth / 2;
        const layerBaseY = baseY - i * layerStep;
        const jitter = (this.rng() * 2 - 1) * yJitter;
        platform.y = Math.round(layerBaseY + jitter);
        const centerMin = xMin + halfWidth;
        const centerMax = xMax - halfWidth;
        let lo = Math.max(centerMin, prevCenterX - maxNeighborDX);
        let hi = Math.min(centerMax, prevCenterX + maxNeighborDX);
        let centerX;
        if (i === 0) {
          centerX = this.pickPlatform1CenterX(centerMin, centerMax, halfWidth);
        } else {
          if (lo > hi) {
            lo = centerMin;
            hi = centerMax;
          }
          centerX = lo + this.rng() * (hi - lo);
        }
        platform.x = Math.round(centerX - halfWidth);
        prevCenterX = centerX;
        if (movingIndices.has(i)) {
          const leftInner = this.getWallInnerBound(this.leftWall, "left");
          const rightInner = this.getWallInnerBound(this.rightWall, "right");
          const rangeMin = Math.max(leftInner, platform.x - 300);
          const rangeMax = Math.min(rightInner - platform.width, platform.x + 300);
          const safeRangeMin = rangeMin <= rangeMax ? rangeMin : platform.x;
          const safeRangeMax = rangeMin <= rangeMax ? rangeMax : platform.x;
          this.movingConfigs.set(platform, {
            axis: "x",
            speed: 1.5,
            rangeMin: safeRangeMin,
            rangeMax: safeRangeMax,
            direction: movingIndex === 0 ? 1 : -1
          });
          movingIndex++;
        }
      }
      for (const p of sorted) {
        p.visible = true;
        this.repaintPlatformColor(p, "#ffffff");
      }
      this.setupDisappearPlatforms(sorted, movingIndices);
    }
    /**
     * 按当前关卡等级注册消失平台，并允许与移动平台重合
     *
     * 启用条件：仅 Level 3/4 关卡有消失平台，Level 1 和 Level 2 返回空配置。
     *
     * 消失平台的来源和规则：
     * - 从除最后一块外的 Platform_* 中随机选取 1 块平台
     * - 可与移动平台重合（同一块平台既能移动，又能消失）
     * - 消失平台不额外生成，复用现有的 Platform_* 节点
     *
     * 初始化操作：
     * - 清空 disappearConfigs 旧配置
     * - 随机选中的平台初始化为 { state: 'idle', triggerAt: 0 }
     * - 平台颜色设为绿色（#00cc00），表示待踩可用状态
     *
     * 参数说明：
     * @param sorted - 已排序的 Platform_* 节点数组（仅含 Platform_*，不含 Ground）
     * @param movingIndices - 本轮被分配为移动平台的平台索引集合（仅用于展示，消失平台可与其重合）
     */
    setupDisappearPlatforms(sorted, movingIndices) {
      this.disappearConfigs.clear();
      if (this.currentLevel !== 3 && this.currentLevel !== 4)
        return;
      const candidates = sorted.slice(0, -1);
      if (candidates.length === 0)
        return;
      const target = candidates[Math.floor(this.rng() * candidates.length)];
      this.disappearConfigs.set(target, { state: "idle", triggerAt: 0 });
      this.repaintPlatformColor(target, "#00ff00");
    }
    // 为 Platform_1 选一个中心 X：避开出生点正下方，且不离出生点太远
    pickPlatform1CenterX(centerMin, centerMax, halfWidth) {
      const ballHalf = this.getBallRadius();
      const forbidLo = this.startX - halfWidth - ballHalf;
      const forbidHi = this.startX + halfWidth + ballHalf;
      const minOffset = halfWidth + ballHalf + 20;
      const maxOffset = 280;
      const rightLo = Math.max(centerMin, this.startX + minOffset);
      const rightHi = Math.min(centerMax, this.startX + maxOffset);
      const leftHi = Math.min(centerMax, this.startX - minOffset);
      const leftLo = Math.max(centerMin, this.startX - maxOffset);
      const ranges = [];
      if (rightLo <= rightHi)
        ranges.push([rightLo, rightHi]);
      if (leftLo <= leftHi)
        ranges.push([leftLo, leftHi]);
      if (ranges.length > 0) {
        const [lo, hi] = ranges[Math.floor(this.rng() * ranges.length)];
        return lo + this.rng() * (hi - lo);
      }
      let fallback = this.startX + minOffset;
      if (fallback > centerMax)
        fallback = this.startX - minOffset;
      return Math.min(centerMax, Math.max(centerMin, fallback));
    }
    // 检查一个或多个按键是否被按下
    isKeyDown(...keys) {
      return keys.some((key) => Laya.InputManager.hasKeyDown(key));
    }
  };
  /**
   * 消失平台延迟消失时间常数（毫秒）
   * 小球踩上消失平台后，平台进入 counting 状态，经过此延迟后进入 hidden 状态并消失。
   * 同时支持颜色预警：0-20% 绿→黄，80-100% 黄→红，视觉提示玩家平台即将消失。
   */
  BallController.DISAPPEAR_DELAY = 800;
  BallController = __decorateClass([
    regClass("1LSzwPdgQ7mD0zqbvY-BVw")
  ], BallController);

  // src/BackgroundManager.ts
  var _BackgroundManager = class _BackgroundManager {
    // 绘制背景的公共方法
    static draw(sceneRoot) {
      console.log("BackgroundManager draw called");
      const scene2D = _BackgroundManager.findScene2D(sceneRoot);
      if (!scene2D) {
        console.warn("BackgroundManager: Scene2D node not found.");
        return;
      }
      const background = scene2D.getChildByName("Background");
      if (!background) {
        console.warn("BackgroundManager: Background node not found under Scene2D.");
        return;
      }
      console.log("Background found:", background.name);
      background.zOrder = -100;
      background.x = 0;
      background.y = 0;
      background.width = _BackgroundManager.width;
      background.height = _BackgroundManager.height;
      background.mouseEnabled = false;
      if (background.graphics) {
        background.graphics.clear();
        background.graphics.drawRect(0, 0, _BackgroundManager.width, _BackgroundManager.height, "#06142d");
        _BackgroundManager.drawStars(background.graphics);
      } else {
        console.warn("BackgroundManager: Background node has no graphics object.");
      }
    }
    // 寻找Scene2D节点，支持多种查找方式
    static findScene2D(sceneRoot) {
      if (sceneRoot && sceneRoot.name === "Scene2D") {
        return sceneRoot;
      }
      if (sceneRoot && sceneRoot.getChildByName) {
        const scene2D = sceneRoot.getChildByName("Scene2D");
        if (scene2D) {
          return scene2D;
        }
      }
      if (sceneRoot && sceneRoot.scene && sceneRoot.scene.name === "Scene2D") {
        return sceneRoot.scene;
      }
      if (Laya.stage && Laya.stage.getChildByName) {
        return Laya.stage.getChildByName("Scene2D");
      }
      return null;
    }
    // 绘制背景星星
    static drawStars(graphics) {
      const stars = [
        { x: 56, y: 48, radius: 1.5, color: "#ffffff" },
        { x: 128, y: 92, radius: 1, color: "#dcecff" },
        { x: 224, y: 38, radius: 1.2, color: "#ffffff" },
        { x: 318, y: 116, radius: 1, color: "#b9d7ff" },
        { x: 432, y: 64, radius: 1.4, color: "#ffffff" },
        { x: 548, y: 142, radius: 1, color: "#dcecff" },
        { x: 672, y: 72, radius: 1.3, color: "#ffffff" },
        { x: 744, y: 174, radius: 1, color: "#b9d7ff" },
        { x: 86, y: 216, radius: 1, color: "#dcecff" },
        { x: 278, y: 248, radius: 1.5, color: "#ffffff" },
        { x: 482, y: 228, radius: 1, color: "#b9d7ff" },
        { x: 618, y: 294, radius: 1.2, color: "#ffffff" },
        { x: 724, y: 344, radius: 1, color: "#dcecff" }
      ];
      for (const star of stars) {
        graphics.drawCircle(star.x, star.y, star.radius, star.color);
      }
    }
  };
  // 画布宽度用于统一背景尺寸，避免不同分辨率下出现拉伸
  _BackgroundManager.width = 1334;
  // 画布高度用于统一背景尺寸，确保背景与场景比例保持一致
  _BackgroundManager.height = 750;
  var BackgroundManager = _BackgroundManager;

  // src/IntroUI.ts
  var _IntroUI = class _IntroUI {
    static show() {
      if (_IntroUI.created) {
        return;
      }
      _IntroUI.created = true;
      const panel = new Laya.Sprite();
      const panelWidth = 520;
      const panelHeight = 280;
      panel.width = panelWidth;
      panel.height = panelHeight;
      panel.x = (Laya.stage.width - panelWidth) / 2;
      panel.y = (Laya.stage.height - panelHeight) / 2;
      panel.zOrder = 10001;
      panel.graphics.drawRect(0, 0, panelWidth, panelHeight, "#1F2937", "#FFFFFF", 2);
      const text = new Laya.Text();
      text.text = "Controls\nA/D or ←/→   Move\nW or ↑       Jump\nReach Score 5 to Win\nR   Next Level (after win)\nPress Space to start";
      text.fontSize = 28;
      text.color = "#FFFFFF";
      text.bold = true;
      text.align = "left";
      text.valign = "middle";
      text.leading = 10;
      text.x = 44;
      text.y = 20;
      text.width = panelWidth - 88;
      text.height = panelHeight - 40;
      panel.addChild(text);
      Laya.stage.addChild(panel);
      _IntroUI.panel = panel;
      Laya.stage.on(Laya.Event.KEY_DOWN, _IntroUI, _IntroUI.onKeyDown);
    }
    static onKeyDown(event) {
      const keyCode = event ? event.keyCode : null;
      const key = event ? event.key : "";
      const isStartKey = keyCode === 32 || key === " " || key === "Space";
      if (!isStartKey) {
        return;
      }
      if (_IntroUI.panel) {
        _IntroUI.panel.visible = false;
      }
      Laya.stage.off(Laya.Event.KEY_DOWN, _IntroUI, _IntroUI.onKeyDown);
    }
  };
  _IntroUI.created = false;
  _IntroUI.panel = null;
  var IntroUI = _IntroUI;

  // src/BgmManager.ts
  var _BgmManager = class _BgmManager {
    static playBgm() {
      if (_BgmManager.isPlaying) {
        return;
      }
      _BgmManager.isPlaying = true;
      try {
        Laya.SoundManager.musicVolume = _BgmManager.volume;
        Laya.SoundManager.playMusic(_BgmManager.bgmUrl, 0);
      } catch (error) {
        _BgmManager.isPlaying = false;
        console.warn("BgmManager: failed to start BGM.", error);
      }
    }
    static stopBgm() {
      if (!_BgmManager.isPlaying) {
        return;
      }
      Laya.SoundManager.stopMusic();
      _BgmManager.isPlaying = false;
    }
    static setVolume(volume) {
      const nextVolume = Math.max(0, Math.min(1, volume));
      _BgmManager.volume = nextVolume;
      Laya.SoundManager.musicVolume = nextVolume;
    }
  };
  _BgmManager.bgmUrl = "resources/audio/bgm_main.mp3";
  _BgmManager.isPlaying = false;
  _BgmManager.volume = 0.45;
  var BgmManager = _BgmManager;

  // src/Main.ts
  var { regClass: regClass2, property } = Laya;
  var Main = class extends Laya.Script {
    constructor() {
      super(...arguments);
      this.muteKeyHeld = false;
    }
    // 脚本启动时执行一次，类似游戏的开始函数
    onStart() {
      console.log("Main onStart");
      BackgroundManager.draw(this.owner);
      ScoreManager.instance.init();
      IntroUI.show();
      Laya.stage.on(Laya.Event.KEY_DOWN, this, this.onStartBgmKeyDown);
      Laya.stage.on(Laya.Event.KEY_DOWN, this, this.onMuteKeyDown);
      Laya.stage.on(Laya.Event.KEY_UP, this, this.onMuteKeyUp);
      console.log("Game start");
    }
    onStartBgmKeyDown(event) {
      const keyCode = event ? event.keyCode : null;
      const key = event ? event.key : "";
      const isStartKey = keyCode === 32 || key === " " || key === "Space";
      if (!isStartKey) {
        return;
      }
      Laya.stage.off(Laya.Event.KEY_DOWN, this, this.onStartBgmKeyDown);
      BgmManager.playBgm();
    }
    onMuteKeyDown(event) {
      const isMuteKey = event.keyCode === 77 || event.key === "m" || event.key === "M";
      if (!isMuteKey) {
        return;
      }
      if (this.muteKeyHeld) {
        return;
      }
      this.muteKeyHeld = true;
      Laya.SoundManager.muted = !Laya.SoundManager.muted;
      console.log("Muted:", Laya.SoundManager.muted);
    }
    onMuteKeyUp(event) {
      const isMuteKey = event.keyCode === 77 || event.key === "m" || event.key === "M";
      if (isMuteKey) {
        this.muteKeyHeld = false;
      }
    }
  };
  Main = __decorateClass([
    regClass2("e60XQm7tTY2BwFAdxb8D1g")
  ], Main);
})();
