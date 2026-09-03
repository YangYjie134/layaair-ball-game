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
    static isGlobalMuted() {
      return !!Laya.SoundManager.muted;
    }
    static setGlobalMuted(muted) {
      const nextMuted = !!muted;
      Laya.SoundManager.muted = nextMuted;
      _SfxManager.syncScoreMute(nextMuted);
    }
    static playJump() {
      _SfxManager.playOneShot(_SfxManager.JUMP_URL, _SfxManager.JUMP_VOLUME);
    }
    static playDeath() {
      _SfxManager.playOneShot(_SfxManager.DEATH_URL, _SfxManager.DEATH_VOLUME);
    }
    static playClear() {
      _SfxManager.playOneShot(_SfxManager.CLEAR_URL, _SfxManager.CLEAR_VOLUME);
    }
    static playScore() {
      if (_SfxManager.isGlobalMuted())
        return;
      try {
        const context = _SfxManager.getScoreAudioContext();
        const masterGain = _SfxManager.scoreMasterGain;
        if (!context || context.state === "closed" || !masterGain)
          return;
        const playConfirmation = () => {
          if (_SfxManager.isGlobalMuted())
            return;
          try {
            const now = context.currentTime;
            const bodyOscillator = context.createOscillator();
            const bodyGain = context.createGain();
            const metalOscillator = context.createOscillator();
            const metalGain = context.createGain();
            bodyOscillator.type = "triangle";
            bodyOscillator.frequency.setValueAtTime(_SfxManager.SCORE_BODY_START_HZ, now);
            bodyOscillator.frequency.exponentialRampToValueAtTime(
              _SfxManager.SCORE_BODY_END_HZ,
              now + _SfxManager.SCORE_RELEASE_SECONDS
            );
            bodyGain.gain.setValueAtTime(1e-4, now);
            bodyGain.gain.exponentialRampToValueAtTime(
              _SfxManager.SCORE_BODY_PEAK_GAIN,
              now + _SfxManager.SCORE_ATTACK_SECONDS
            );
            bodyGain.gain.exponentialRampToValueAtTime(
              _SfxManager.SCORE_BODY_SUSTAIN_GAIN,
              now + _SfxManager.SCORE_BODY_SUSTAIN_SECONDS
            );
            bodyGain.gain.exponentialRampToValueAtTime(
              1e-4,
              now + _SfxManager.SCORE_RELEASE_SECONDS
            );
            metalOscillator.type = "triangle";
            metalOscillator.frequency.setValueAtTime(_SfxManager.SCORE_METAL_START_HZ, now);
            metalOscillator.frequency.exponentialRampToValueAtTime(
              _SfxManager.SCORE_METAL_END_HZ,
              now + _SfxManager.SCORE_METAL_RELEASE_SECONDS
            );
            metalGain.gain.setValueAtTime(1e-4, now);
            metalGain.gain.exponentialRampToValueAtTime(
              _SfxManager.SCORE_METAL_PEAK_GAIN,
              now + 2e-3
            );
            metalGain.gain.exponentialRampToValueAtTime(
              1e-4,
              now + _SfxManager.SCORE_METAL_RELEASE_SECONDS
            );
            bodyOscillator.connect(bodyGain);
            bodyGain.connect(masterGain);
            metalOscillator.connect(metalGain);
            metalGain.connect(masterGain);
            bodyOscillator.onended = () => {
              try {
                bodyOscillator.disconnect();
                bodyGain.disconnect();
              } catch (_) {
              }
            };
            metalOscillator.onended = () => {
              try {
                metalOscillator.disconnect();
                metalGain.disconnect();
              } catch (_) {
              }
            };
            bodyOscillator.start(now);
            metalOscillator.start(now);
            metalOscillator.stop(now + 0.052);
            bodyOscillator.stop(now + 0.13);
          } catch (_) {
          }
        };
        if (context.state === "suspended" && typeof context.resume === "function") {
          try {
            const resumeResult = context.resume();
            if (resumeResult && typeof resumeResult.then === "function") {
              resumeResult.then(playConfirmation).catch(() => {
              });
              return;
            }
          } catch (_) {
            return;
          }
        }
        playConfirmation();
      } catch (_) {
      }
    }
    static getScoreAudioContext() {
      var _a;
      if (_SfxManager.scoreAudioContext && _SfxManager.scoreAudioContext.state !== "closed") {
        return _SfxManager.scoreAudioContext;
      }
      _SfxManager.scoreAudioContext = null;
      _SfxManager.scoreMasterGain = null;
      try {
        const browserGlobal = typeof globalThis !== "undefined" ? globalThis : null;
        const AudioContextCtor = (_a = browserGlobal == null ? void 0 : browserGlobal.AudioContext) != null ? _a : browserGlobal == null ? void 0 : browserGlobal.webkitAudioContext;
        if (typeof AudioContextCtor !== "function")
          return null;
        const context = new AudioContextCtor();
        const masterGain = context.createGain();
        masterGain.gain.setValueAtTime(_SfxManager.isGlobalMuted() ? 0 : 1, context.currentTime);
        masterGain.connect(context.destination);
        _SfxManager.scoreAudioContext = context;
        _SfxManager.scoreMasterGain = masterGain;
        return context;
      } catch (_) {
        _SfxManager.scoreAudioContext = null;
        _SfxManager.scoreMasterGain = null;
        return null;
      }
    }
    static syncScoreMute(muted) {
      const context = _SfxManager.scoreAudioContext;
      const masterGain = _SfxManager.scoreMasterGain;
      if (!context || context.state === "closed" || !masterGain)
        return;
      try {
        masterGain.gain.setValueAtTime(muted ? 0 : 1, context.currentTime);
      } catch (_) {
      }
    }
    static playOneShot(url, volume) {
      if (_SfxManager.isGlobalMuted())
        return;
      try {
        Laya.SoundManager.soundVolume = 1;
        const channel = Laya.SoundManager.playSound(url, 1);
        if (channel)
          channel.volume = volume;
      } catch (error) {
        console.warn("[SfxManager] Failed to play sound:", url, error);
      }
    }
  };
  _SfxManager.JUMP_URL = "resources/audio/sfx_jump_lift.wav";
  _SfxManager.DEATH_URL = "resources/audio/sfx_death_disintegrate.ogg";
  _SfxManager.CLEAR_URL = "resources/audio/sfx_clear_powerup.ogg";
  _SfxManager.JUMP_VOLUME = 0.84;
  _SfxManager.DEATH_VOLUME = 0.7;
  _SfxManager.CLEAR_VOLUME = 0.7;
  _SfxManager.SCORE_BODY_START_HZ = 880;
  _SfxManager.SCORE_BODY_END_HZ = 1040;
  _SfxManager.SCORE_BODY_PEAK_GAIN = 0.13;
  _SfxManager.SCORE_BODY_SUSTAIN_GAIN = 0.075;
  _SfxManager.SCORE_METAL_START_HZ = 1240;
  _SfxManager.SCORE_METAL_END_HZ = 1120;
  _SfxManager.SCORE_METAL_PEAK_GAIN = 0.035;
  _SfxManager.SCORE_ATTACK_SECONDS = 4e-3;
  _SfxManager.SCORE_BODY_SUSTAIN_SECONDS = 0.055;
  _SfxManager.SCORE_METAL_RELEASE_SECONDS = 0.048;
  _SfxManager.SCORE_RELEASE_SECONDS = 0.125;
  _SfxManager.scoreAudioContext = null;
  _SfxManager.scoreMasterGain = null;
  var SfxManager = _SfxManager;

  // src/ScoreManager.ts
  var WIN_GLYPH_AURA_TEMPLATES = {
    Y: [
      { x: 0, y: 0 },
      { x: 0.23, y: 0 },
      { x: 0.5, y: 0.35 },
      { x: 0.77, y: 0 },
      { x: 1, y: 0 },
      { x: 0.62, y: 0.52 },
      { x: 0.62, y: 1 },
      { x: 0.38, y: 1 },
      { x: 0.38, y: 0.52 }
    ],
    O: [
      { x: 0.5, y: 0 },
      { x: 0.7, y: 0.03 },
      { x: 0.86, y: 0.12 },
      { x: 0.97, y: 0.28 },
      { x: 1, y: 0.5 },
      { x: 0.97, y: 0.72 },
      { x: 0.86, y: 0.88 },
      { x: 0.7, y: 0.97 },
      { x: 0.5, y: 1 },
      { x: 0.3, y: 0.97 },
      { x: 0.14, y: 0.88 },
      { x: 0.03, y: 0.72 },
      { x: 0, y: 0.5 },
      { x: 0.03, y: 0.28 },
      { x: 0.14, y: 0.12 },
      { x: 0.3, y: 0.03 }
    ],
    U: [
      { x: 0, y: 0 },
      { x: 0, y: 0.68 },
      { x: 0.08, y: 0.86 },
      { x: 0.24, y: 0.97 },
      { x: 0.5, y: 1 },
      { x: 0.76, y: 0.97 },
      { x: 0.92, y: 0.86 },
      { x: 1, y: 0.68 },
      { x: 1, y: 0 },
      { x: 0.76, y: 0 },
      { x: 0.76, y: 0.65 },
      { x: 0.7, y: 0.74 },
      { x: 0.62, y: 0.79 },
      { x: 0.5, y: 0.81 },
      { x: 0.38, y: 0.79 },
      { x: 0.3, y: 0.74 },
      { x: 0.24, y: 0.65 },
      { x: 0.24, y: 0 }
    ],
    W: [
      { x: 0, y: 0 },
      { x: 0.2, y: 0 },
      { x: 0.32, y: 0.66 },
      { x: 0.43, y: 0.28 },
      { x: 0.57, y: 0.28 },
      { x: 0.68, y: 0.66 },
      { x: 0.8, y: 0 },
      { x: 1, y: 0 },
      { x: 0.79, y: 1 },
      { x: 0.61, y: 1 },
      { x: 0.5, y: 0.65 },
      { x: 0.39, y: 1 },
      { x: 0.21, y: 1 }
    ],
    I: [
      { x: 0.18, y: 0 },
      { x: 0.82, y: 0 },
      { x: 0.82, y: 0.12 },
      { x: 0.62, y: 0.12 },
      { x: 0.62, y: 0.88 },
      { x: 0.82, y: 0.88 },
      { x: 0.82, y: 1 },
      { x: 0.18, y: 1 },
      { x: 0.18, y: 0.88 },
      { x: 0.38, y: 0.88 },
      { x: 0.38, y: 0.12 },
      { x: 0.18, y: 0.12 }
    ],
    N: [
      { x: 0, y: 0 },
      { x: 0.24, y: 0 },
      { x: 0.76, y: 0.66 },
      { x: 0.76, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0.76, y: 1 },
      { x: 0.24, y: 0.34 },
      { x: 0.24, y: 1 },
      { x: 0, y: 1 }
    ]
  };
  var _ScoreManager = class _ScoreManager {
    constructor() {
      // 当前分数
      this.score = 0;
      // 分数 HUD 与显示对象（仅负责展示，不参与计分）
      this.scoreHud = null;
      this.scoreText = null;
      this.scoreSegments = [];
      // 获胜卡片与提示文本对象
      this.winCard = null;
      this.winText = null;
      this.nextLevelHandler = null;
      this.nextLevelButton = null;
      this.nextLevelLabel = null;
      this.restartHint = null;
      this.winHandler = null;
      this.mobileTouchSession = false;
      this.winGoldenAura = null;
      this.winGoldenGlyphSystems = [];
      this.winGoldenLoopStarted = false;
      this.winGoldenPhase = 0;
      // 是否已经获胜
      this.hasWon = false;
      // 获胜所需分数
      this.winScore = 5;
      // 已经得分过的平台集合（防止重复计分）
      this.scoredPlatforms = /* @__PURE__ */ new Set();
      // WP-E1 平台能量只允许在单次计分周期内单向流转。
      this.platformEnergyStates = /* @__PURE__ */ new Map();
      this.platformEnergyVisuals = /* @__PURE__ */ new Map();
      this.activeEnergyAbsorptions = /* @__PURE__ */ new Map();
      this.energyAbsorptionDurationMs = 500;
      this.transientScoreFeedback = /* @__PURE__ */ new Map();
      this.scoreHudPulseCleanup = null;
      this.scoreHudEntranceCleanup = null;
      this.scoreFeedbackDurationMs = 500;
      this.scoreHudPulseDurationMs = 200;
      this.scoreHudEntranceDurationMs = 320;
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
      this.clearTransientFeedback();
      this.score = 0;
      this.hasWon = false;
      this.scoredPlatforms.clear();
      this.resetPlatformEnergyCycle();
      if (!this.scoreText) {
        this.createScoreText();
      }
      this.updateScoreText();
      this.hideWinText();
      console.log("ScoreManager: Score UI created");
    }
    setNextLevelHandler(handler) {
      this.nextLevelHandler = handler;
    }
    setWinHandler(handler) {
      this.winHandler = handler;
    }
    setMobileTouchSession(mobileTouchSession) {
      this.mobileTouchSession = mobileTouchSession;
      if (this.restartHint) {
        this.restartHint.visible = !mobileTouchSession;
      }
    }
    // 创建分数显示文本
    createScoreText() {
      const hudWidth = 392;
      const hudHeight = 44;
      this.scoreHud = new Laya.Sprite();
      this.scoreHud.name = "WPH_ScoreHud";
      this.scoreHud.x = 40;
      this.scoreHud.y = 32;
      this.scoreHud.width = hudWidth;
      this.scoreHud.height = hudHeight;
      this.scoreHud.zOrder = 9999;
      this.scoreHud.mouseEnabled = false;
      const background = new Laya.Sprite();
      background.alpha = 0.9;
      background.graphics.drawPoly(
        0,
        0,
        [
          8,
          0,
          hudWidth - 8,
          0,
          hudWidth,
          8,
          hudWidth,
          hudHeight - 8,
          hudWidth - 8,
          hudHeight,
          8,
          hudHeight,
          0,
          hudHeight - 8,
          0,
          8
        ],
        "#06111F",
        "#1A7188",
        1
      );
      this.scoreHud.addChild(background);
      const frame = new Laya.Sprite();
      frame.graphics.drawLine(16, 0, 150, 0, "#35E9FF", 2);
      frame.graphics.drawLine(8, 43, 58, 43, "#7C4DFF", 1);
      frame.graphics.drawLine(382, 5, 387, 10, "#35E9FF", 1);
      this.scoreHud.addChild(frame);
      const scoreLabel = new Laya.Text();
      scoreLabel.text = "SCORE";
      scoreLabel.font = "Arial";
      scoreLabel.fontSize = 15;
      scoreLabel.color = "#78D7E8";
      scoreLabel.bold = true;
      scoreLabel.x = 16;
      scoreLabel.y = 6;
      scoreLabel.width = 66;
      scoreLabel.height = 32;
      scoreLabel.align = "left";
      scoreLabel.valign = "middle";
      this.scoreHud.addChild(scoreLabel);
      this.scoreSegments = [];
      const segmentStartX = 90;
      const segmentWidth = 24;
      const segmentGap = 5;
      for (let i = 0; i < this.winScore; i++) {
        const segment = new Laya.Sprite();
        segment.x = segmentStartX + i * (segmentWidth + segmentGap);
        segment.y = 15;
        segment.width = segmentWidth;
        segment.height = 14;
        this.scoreHud.addChild(segment);
        this.scoreSegments.push(segment);
      }
      this.scoreText = new Laya.Text();
      this.scoreText.text = "0 / 5";
      this.scoreText.font = "Arial";
      this.scoreText.fontSize = 19;
      this.scoreText.color = "#E8FCFF";
      this.scoreText.bold = true;
      this.scoreText.x = 252;
      this.scoreText.y = 5;
      this.scoreText.width = 122;
      this.scoreText.height = 34;
      this.scoreText.align = "right";
      this.scoreText.valign = "middle";
      this.scoreHud.addChild(this.scoreText);
      Laya.stage.addChild(this.scoreHud);
    }
    // 创建获胜提示文本
    createWinText() {
      const cardWidth = 540;
      const cardHeight = 300;
      this.winCard = new Laya.Sprite();
      this.winCard.width = cardWidth;
      this.winCard.height = cardHeight;
      this.winCard.zOrder = 1e4;
      this.winCard.mouseEnabled = false;
      const background = new Laya.Sprite();
      background.alpha = 0.94;
      background.graphics.drawPoly(
        0,
        0,
        [
          20,
          0,
          cardWidth - 44,
          0,
          cardWidth,
          44,
          cardWidth,
          cardHeight - 20,
          cardWidth - 20,
          cardHeight,
          44,
          cardHeight,
          0,
          cardHeight - 44,
          0,
          20
        ],
        "#050D1A",
        "#17677B",
        1
      );
      this.winCard.addChild(background);
      const frame = new Laya.Sprite();
      frame.graphics.drawLine(42, 0, 312, 0, "#39F4FF", 2);
      frame.graphics.drawLine(312, 0, 346, 0, "#8B5CFF", 2);
      frame.graphics.drawLine(44, cardHeight, 214, cardHeight, "#39F4FF", 1);
      frame.graphics.drawLine(16, 16, 58, 16, "#39F4FF", 2);
      frame.graphics.drawLine(16, 16, 16, 58, "#39F4FF", 2);
      frame.graphics.drawLine(cardWidth - 16, 58, cardWidth - 16, 88, "#39F4FF", 2);
      frame.graphics.drawLine(cardWidth - 46, 16, cardWidth - 16, 46, "#39F4FF", 2);
      frame.graphics.drawLine(16, cardHeight - 58, 16, cardHeight - 22, "#8B5CFF", 2);
      frame.graphics.drawLine(16, cardHeight - 16, 58, cardHeight - 16, "#8B5CFF", 2);
      frame.graphics.drawLine(cardWidth - 58, cardHeight - 16, cardWidth - 16, cardHeight - 16, "#39F4FF", 2);
      frame.graphics.drawLine(cardWidth - 16, cardHeight - 58, cardWidth - 16, cardHeight - 16, "#39F4FF", 2);
      frame.graphics.drawLine(68, 55, cardWidth - 68, 55, "#164C5B", 1);
      frame.graphics.drawLine(68, 157, cardWidth - 68, 157, "#164C5B", 1);
      this.winCard.addChild(frame);
      const statusText = new Laya.Text();
      statusText.text = "MISSION STATUS // COMPLETE";
      statusText.font = "Arial";
      statusText.fontSize = 14;
      statusText.color = "#66DFF1";
      statusText.bold = true;
      statusText.x = 68;
      statusText.y = 20;
      statusText.width = cardWidth - 136;
      statusText.height = 28;
      statusText.align = "center";
      statusText.valign = "middle";
      this.winCard.addChild(statusText);
      this.winText = new Laya.Text();
      this.winText.text = "YOU WIN";
      this.winText.font = "Arial";
      this.winText.fontSize = 52;
      this.winText.color = "#F0FDFF";
      this.winText.bold = true;
      this.winText.stroke = 2;
      this.winText.strokeColor = "#08788F";
      this.winText.align = "center";
      this.winText.valign = "middle";
      this.winText.x = 56;
      this.winText.y = 62;
      this.winText.width = cardWidth - 112;
      this.winText.height = 82;
      this.createWinGoldenAura(cardWidth, cardHeight);
      this.winCard.addChild(this.winText);
      const scoreStatus = new Laya.Text();
      scoreStatus.text = "SCORE  05 / 05";
      scoreStatus.font = "Arial";
      scoreStatus.fontSize = 16;
      scoreStatus.color = "#9CEAF5";
      scoreStatus.bold = true;
      scoreStatus.x = 68;
      scoreStatus.y = 169;
      scoreStatus.width = cardWidth - 136;
      scoreStatus.height = 28;
      scoreStatus.align = "center";
      scoreStatus.valign = "middle";
      this.winCard.addChild(scoreStatus);
      const buttonWidth = 260;
      const buttonHeight = 48;
      const nextLevelButton = new Laya.Sprite();
      this.nextLevelButton = nextLevelButton;
      nextLevelButton.x = Math.round((cardWidth - buttonWidth) / 2);
      nextLevelButton.y = 200;
      nextLevelButton.width = buttonWidth;
      nextLevelButton.height = buttonHeight;
      nextLevelButton.mouseEnabled = true;
      const nextLevelLabel = new Laya.Text();
      this.nextLevelLabel = nextLevelLabel;
      nextLevelLabel.text = "NEXT LEVEL";
      nextLevelLabel.font = "Arial";
      nextLevelLabel.fontSize = 19;
      nextLevelLabel.color = "#DDFCFF";
      nextLevelLabel.bold = true;
      nextLevelLabel.width = buttonWidth;
      nextLevelLabel.height = buttonHeight;
      nextLevelLabel.align = "center";
      nextLevelLabel.valign = "middle";
      nextLevelLabel.mouseEnabled = false;
      nextLevelButton.addChild(nextLevelLabel);
      this.drawNextLevelButton("normal");
      nextLevelButton.on(Laya.Event.CLICK, this, this.onNextLevelClick);
      nextLevelButton.on(Laya.Event.MOUSE_OVER, this, this.onNextLevelOver);
      nextLevelButton.on(Laya.Event.MOUSE_OUT, this, this.onNextLevelOut);
      nextLevelButton.on(Laya.Event.MOUSE_DOWN, this, this.onNextLevelDown);
      nextLevelButton.on(Laya.Event.MOUSE_UP, this, this.onNextLevelUp);
      this.winCard.addChild(nextLevelButton);
      const restartHint = new Laya.Text();
      this.restartHint = restartHint;
      restartHint.text = "PRESS R";
      restartHint.font = "Arial";
      restartHint.fontSize = 13;
      restartHint.color = "#6FA8B5";
      restartHint.x = 68;
      restartHint.y = 255;
      restartHint.width = cardWidth - 136;
      restartHint.height = 24;
      restartHint.align = "center";
      restartHint.valign = "middle";
      restartHint.mouseEnabled = false;
      restartHint.visible = !this.mobileTouchSession;
      this.winCard.addChild(restartHint);
      this.positionWinCard();
      this.winCard.visible = false;
      Laya.stage.addChild(this.winCard);
    }
    onNextLevelClick() {
      if (this.nextLevelHandler) {
        this.nextLevelHandler();
      }
    }
    drawNextLevelButton(state) {
      const button = this.nextLevelButton;
      if (!(button == null ? void 0 : button.graphics))
        return;
      const buttonWidth = button.width || 260;
      const buttonHeight = button.height || 48;
      const fill = state === "pressed" ? "#12384A" : state === "hover" ? "#0D3040" : "#0A2432";
      const border = state === "pressed" ? "#B8FBFF" : state === "hover" ? "#70FAFF" : "#39F4FF";
      button.graphics.clear();
      button.graphics.drawPoly(
        0,
        0,
        [
          8,
          0,
          buttonWidth - 8,
          0,
          buttonWidth,
          8,
          buttonWidth,
          buttonHeight - 8,
          buttonWidth - 8,
          buttonHeight,
          8,
          buttonHeight,
          0,
          buttonHeight - 8,
          0,
          8
        ],
        fill,
        border,
        state === "hover" ? 3 : 2
      );
      button.graphics.drawLine(18, 5, 88, 5, state === "normal" ? "#8B5CFF" : "#B69BFF", 2);
      button.graphics.drawLine(
        buttonWidth - 70,
        buttonHeight - 5,
        buttonWidth - 18,
        buttonHeight - 5,
        border,
        1
      );
      button.alpha = state === "pressed" ? 0.88 : 1;
      if (this.nextLevelLabel) {
        this.nextLevelLabel.color = state === "normal" ? "#DDFCFF" : "#FFFFFF";
      }
    }
    onNextLevelOver() {
      this.drawNextLevelButton("hover");
    }
    onNextLevelOut() {
      this.drawNextLevelButton("normal");
    }
    onNextLevelDown() {
      this.drawNextLevelButton("pressed");
    }
    onNextLevelUp() {
      this.drawNextLevelButton("hover");
    }
    createWinGoldenAura(cardWidth, cardHeight) {
      if (this.winGoldenAura || !this.winCard || !this.winText)
        return;
      const aura = new Laya.Sprite();
      aura.name = "WPB_WinGoldenAura";
      aura.width = cardWidth;
      aura.height = cardHeight;
      aura.mouseEnabled = false;
      aura.visible = false;
      this.winCard.addChildAt(aura, Math.min(1, this.winCard.numChildren));
      this.winGoldenAura = aura;
      const glyphLayouts = this.getWinGlyphLayouts();
      this.winGoldenGlyphSystems = [];
      for (let glyphIndex = 0; glyphIndex < glyphLayouts.length; glyphIndex++) {
        const layout = glyphLayouts[glyphIndex];
        const template = WIN_GLYPH_AURA_TEMPLATES[layout.character];
        if (!template)
          continue;
        const path = this.buildWinGlyphAuraPath(layout, template);
        const metrics = this.getWinClosedPathMetrics(path);
        const glyphRoot = new Laya.Sprite();
        glyphRoot.name = "WPB_GlyphAura_" + layout.character;
        glyphRoot.mouseEnabled = false;
        aura.addChild(glyphRoot);
        const rimGlow = new Laya.Sprite();
        rimGlow.name = "WPB_GlyphRimGlow_" + layout.character;
        rimGlow.mouseEnabled = false;
        this.drawWinGlyphAuraPath(rimGlow, path, "#FFD700", 5.5);
        glyphRoot.addChild(rimGlow);
        const rimCore = new Laya.Sprite();
        rimCore.name = "WPB_GlyphRimCore_" + layout.character;
        rimCore.mouseEnabled = false;
        this.drawWinGlyphAuraPath(rimCore, path, "#FFE45C", 1.5);
        glyphRoot.addChild(rimCore);
        const particles = [];
        const particlePalette = ["#FFD700", "#FFE45C", "#FFE082", "#FFF7B0"];
        for (let particleIndex = 0; particleIndex < 7; particleIndex++) {
          const particle = new Laya.Sprite();
          particle.name = "WPB_GlyphParticle_" + layout.character + "_" + particleIndex;
          particle.mouseEnabled = false;
          const radius = particleIndex < 5 ? 0.85 + particleIndex % 3 * 0.18 : 0.7 + particleIndex % 2 * 0.14;
          particle.graphics.drawCircle(0, 0, radius, particlePalette[particleIndex % particlePalette.length]);
          glyphRoot.addChild(particle);
          particles.push(particle);
        }
        const spark = new Laya.Sprite();
        spark.name = "WPB_GlyphSpark_" + layout.character;
        spark.mouseEnabled = false;
        spark.graphics.drawLine(-3.2, 0, 3.2, 0, "#FFF7B0", 1.2);
        spark.graphics.drawLine(0, -3.2, 0, 3.2, "#FFF7B0", 1.2);
        spark.graphics.drawCircle(0, 0, 1.05, "#FFFFFF");
        glyphRoot.addChild(spark);
        const energyHead = new Laya.Sprite();
        energyHead.name = "WPB_GlyphEnergyHead_" + layout.character;
        energyHead.mouseEnabled = false;
        glyphRoot.addChild(energyHead);
        this.winGoldenGlyphSystems.push({
          character: layout.character,
          path,
          segmentLengths: metrics.segmentLengths,
          totalLength: metrics.totalLength,
          centerX: layout.centerX,
          centerY: layout.centerY,
          phaseOffset: glyphIndex / glyphLayouts.length,
          rimGlow,
          rimCore,
          energyHead,
          particles,
          spark
        });
      }
      this.updateWinGoldenAura();
    }
    createWinTextMeasureContext(fontSize, fontName, bold) {
      var _a, _b, _c;
      const globalDocument = typeof document !== "undefined" ? document : null;
      const browserDocument = ((_a = Laya.Browser) == null ? void 0 : _a.document) || globalDocument;
      const canvas = (_b = browserDocument == null ? void 0 : browserDocument.createElement) == null ? void 0 : _b.call(browserDocument, "canvas");
      const context = (_c = canvas == null ? void 0 : canvas.getContext) == null ? void 0 : _c.call(canvas, "2d");
      if (!context || typeof context.measureText !== "function")
        return null;
      const family = fontName.includes(" ") ? '"' + fontName + '"' : fontName;
      context.font = (bold ? "bold " : "") + fontSize + "px " + family;
      context.textAlign = "left";
      context.textBaseline = "alphabetic";
      return context;
    }
    measureWinTextSpan(content, context, fontSize, fontName, bold) {
      if (content.length === 0)
        return 0;
      if (context && typeof context.measureText === "function") {
        const measuredWidth = Number(context.measureText(content).width);
        if (Number.isFinite(measuredWidth) && measuredWidth > 0)
          return measuredWidth;
      }
      const probe = new Laya.Text();
      probe.font = fontName;
      probe.fontSize = fontSize;
      probe.bold = bold;
      probe.text = content;
      const layaMeasuredWidth = Number(probe.textWidth);
      if (typeof probe.destroy === "function") {
        probe.destroy(true);
      }
      if (Number.isFinite(layaMeasuredWidth) && layaMeasuredWidth > 0)
        return layaMeasuredWidth;
      return Array.from(content).length * fontSize * 0.6;
    }
    getWinGlyphLayouts() {
      var _a;
      const textNode = this.winText;
      if (!textNode)
        return [];
      const content = String(textNode.text || "YOU WIN");
      const fontSize = Math.max(1, Number(textNode.fontSize) || 52);
      const fontName = String(textNode.font || "Arial");
      const bold = Boolean(textNode.bold);
      const textX = Number(textNode.x) || 0;
      const textY = Number(textNode.y) || 0;
      const textWidth = Math.max(fontSize, Number(textNode.width) || fontSize);
      const textHeight = Math.max(fontSize, Number(textNode.height) || fontSize);
      const context = this.createWinTextMeasureContext(fontSize, fontName, bold);
      const measuredTextWidth = this.measureWinTextSpan(content, context, fontSize, fontName, bold);
      let textStartX = textX;
      if (textNode.align === "center") {
        textStartX += (textWidth - measuredTextWidth) * 0.5;
      } else if (textNode.align === "right") {
        textStartX += textWidth - measuredTextWidth;
      }
      const lineBoxHeight = Math.min(textHeight, fontSize);
      let lineTop = textY;
      if (textNode.valign === "middle") {
        lineTop += (textHeight - lineBoxHeight) * 0.5;
      } else if (textNode.valign === "bottom") {
        lineTop += textHeight - lineBoxHeight;
      }
      const layouts = [];
      for (let characterIndex = 0; characterIndex < content.length; characterIndex++) {
        const character = content.charAt(characterIndex);
        if (character === " ")
          continue;
        const prefixWidth = this.measureWinTextSpan(
          content.slice(0, characterIndex),
          context,
          fontSize,
          fontName,
          bold
        );
        const nextPrefixWidth = this.measureWinTextSpan(
          content.slice(0, characterIndex + 1),
          context,
          fontSize,
          fontName,
          bold
        );
        const advanceWidth = Math.max(1, nextPrefixWidth - prefixWidth);
        const glyphMetrics = (_a = context == null ? void 0 : context.measureText) == null ? void 0 : _a.call(context, character);
        const actualLeft = Math.max(0, Number(glyphMetrics == null ? void 0 : glyphMetrics.actualBoundingBoxLeft) || 0);
        const actualRight = Math.max(0, Number(glyphMetrics == null ? void 0 : glyphMetrics.actualBoundingBoxRight) || 0);
        const actualAscent = Math.max(0, Number(glyphMetrics == null ? void 0 : glyphMetrics.actualBoundingBoxAscent) || 0);
        const actualDescent = Math.max(0, Number(glyphMetrics == null ? void 0 : glyphMetrics.actualBoundingBoxDescent) || 0);
        const measuredInkWidth = actualLeft + actualRight;
        const measuredInkHeight = actualAscent + actualDescent;
        const glyphWidth = Math.max(1, measuredInkWidth || advanceWidth);
        const glyphHeight = Math.max(
          fontSize * 0.68,
          Math.min(lineBoxHeight, measuredInkHeight || lineBoxHeight * 0.82)
        );
        const glyphX = textStartX + prefixWidth - actualLeft;
        const glyphY = lineTop + (lineBoxHeight - glyphHeight) * 0.5;
        layouts.push({
          character,
          x: glyphX,
          y: glyphY,
          width: glyphWidth,
          height: glyphHeight,
          centerX: glyphX + glyphWidth * 0.5,
          centerY: glyphY + glyphHeight * 0.5,
          fontSize
        });
      }
      return layouts;
    }
    buildWinGlyphAuraPath(layout, template) {
      const offset = Math.max(4, Math.min(6, layout.fontSize * 0.1));
      return template.map((normalizedPoint) => {
        const glyphPointX = layout.x + normalizedPoint.x * layout.width;
        const glyphPointY = layout.y + normalizedPoint.y * layout.height;
        const fromCenterX = glyphPointX - layout.centerX;
        const fromCenterY = glyphPointY - layout.centerY;
        const distance = Math.max(1e-3, Math.sqrt(fromCenterX * fromCenterX + fromCenterY * fromCenterY));
        return {
          x: glyphPointX + fromCenterX / distance * offset,
          y: glyphPointY + fromCenterY / distance * offset
        };
      });
    }
    getWinClosedPathMetrics(path) {
      const segmentLengths = [];
      let totalLength = 0;
      for (let i = 0; i < path.length; i++) {
        const start = path[i];
        const end = path[(i + 1) % path.length];
        const deltaX = end.x - start.x;
        const deltaY = end.y - start.y;
        const segmentLength = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
        segmentLengths.push(segmentLength);
        totalLength += segmentLength;
      }
      return { segmentLengths, totalLength };
    }
    drawWinGlyphAuraPath(node, path, color, lineWidth) {
      if (!(node == null ? void 0 : node.graphics) || path.length < 2)
        return;
      node.graphics.clear();
      for (let i = 0; i < path.length; i++) {
        const start = path[i];
        const end = path[(i + 1) % path.length];
        node.graphics.drawLine(start.x, start.y, end.x, end.y, color, lineWidth);
      }
    }
    getWinGlyphPathPoint(system, progress) {
      if (system.path.length === 0 || system.totalLength <= 0) {
        return { x: system.centerX, y: system.centerY };
      }
      const normalizedProgress = (progress % 1 + 1) % 1;
      const targetDistance = normalizedProgress * system.totalLength;
      let traversedDistance = 0;
      for (let i = 0; i < system.path.length; i++) {
        const segmentLength = system.segmentLengths[i];
        if (targetDistance <= traversedDistance + segmentLength || i === system.path.length - 1) {
          const segmentProgress = segmentLength > 0 ? (targetDistance - traversedDistance) / segmentLength : 0;
          const start = system.path[i];
          const end = system.path[(i + 1) % system.path.length];
          return {
            x: start.x + (end.x - start.x) * segmentProgress,
            y: start.y + (end.y - start.y) * segmentProgress
          };
        }
        traversedDistance += segmentLength;
      }
      return system.path[0];
    }
    startWinGoldenAura() {
      var _a;
      if (!this.winGoldenAura)
        return;
      this.stopWinGoldenAura();
      this.winGoldenPhase = 0;
      this.winGoldenAura.visible = true;
      this.updateWinGoldenAura();
      if (typeof ((_a = Laya.timer) == null ? void 0 : _a.frameLoop) === "function") {
        this.winGoldenLoopStarted = true;
        Laya.timer.frameLoop(1, this, this.updateWinGoldenAura);
      }
    }
    stopWinGoldenAura() {
      var _a;
      if (typeof ((_a = Laya.timer) == null ? void 0 : _a.clear) === "function") {
        Laya.timer.clear(this, this.updateWinGoldenAura);
      }
      this.winGoldenLoopStarted = false;
      this.winGoldenPhase = 0;
      if (this.winGoldenAura) {
        this.winGoldenAura.visible = false;
      }
    }
    updateWinGoldenAura() {
      const aura = this.winGoldenAura;
      if (!aura || this.winGoldenGlyphSystems.length === 0)
        return;
      this.winGoldenPhase = (this.winGoldenPhase + 3e-3) % 1;
      const fullPhaseAngle = this.winGoldenPhase * Math.PI * 2;
      const trailPalette = ["#9A6500", "#CE8F00", "#FFD700", "#FFE45C"];
      for (let systemIndex = 0; systemIndex < this.winGoldenGlyphSystems.length; systemIndex++) {
        const system = this.winGoldenGlyphSystems[systemIndex];
        const staggeredAngle = fullPhaseAngle + system.phaseOffset * Math.PI * 2;
        const breath = (Math.sin(staggeredAngle) + 1) * 0.5;
        system.rimGlow.alpha = 0.14 + breath * 0.12;
        system.rimCore.alpha = 0.42 + breath * 0.14;
        const headPhase = (this.winGoldenPhase + system.phaseOffset) % 1;
        system.energyHead.graphics.clear();
        for (let tailIndex = 4; tailIndex >= 1; tailIndex--) {
          const tailPoint = this.getWinGlyphPathPoint(system, headPhase - tailIndex * 0.018);
          system.energyHead.graphics.drawCircle(
            tailPoint.x,
            tailPoint.y,
            0.65 + (4 - tailIndex) * 0.2,
            trailPalette[4 - tailIndex]
          );
        }
        const headPoint = this.getWinGlyphPathPoint(system, headPhase);
        system.energyHead.graphics.drawCircle(headPoint.x, headPoint.y, 3.2, "#FFD700");
        system.energyHead.graphics.drawCircle(headPoint.x, headPoint.y, 1.6, "#FFF7B0");
        system.energyHead.graphics.drawCircle(headPoint.x, headPoint.y, 0.7, "#FFFFFF");
        system.energyHead.alpha = 0.82 + breath * 0.12;
        for (let particleIndex = 0; particleIndex < system.particles.length; particleIndex++) {
          const particle = system.particles[particleIndex];
          const life = (this.winGoldenPhase * 0.72 + particleIndex / system.particles.length + systemIndex * 0.091) % 1;
          const particlePathPhase = (particleIndex / system.particles.length + system.phaseOffset * 0.37 + this.winGoldenPhase * 0.11) % 1;
          const pathPoint = this.getWinGlyphPathPoint(system, particlePathPhase);
          const outwardX = pathPoint.x - system.centerX;
          const outwardY = pathPoint.y - system.centerY;
          const outwardLength = Math.max(1e-3, Math.sqrt(outwardX * outwardX + outwardY * outwardY));
          const isNearContour = particleIndex < 5;
          const outwardDistance = isNearContour ? 0.4 + (Math.sin(staggeredAngle * 0.7 + particleIndex * 1.6) + 1) * 0.55 : 4 + life * 4;
          particle.x = pathPoint.x + outwardX / outwardLength * outwardDistance;
          particle.y = pathPoint.y + outwardY / outwardLength * outwardDistance;
          if (isNearContour) {
            const twinkle = (Math.sin(staggeredAngle * 1.3 + particleIndex * 1.47) + 1) * 0.5;
            particle.alpha = 0.3 + twinkle * 0.3;
          } else {
            particle.alpha = 0.1 + (1 - life) * 0.26;
          }
        }
        const sparkPathPhase = (system.phaseOffset + 0.28 + this.winGoldenPhase * 0.16) % 1;
        const sparkPoint = this.getWinGlyphPathPoint(system, sparkPathPhase);
        const sparkOutwardX = sparkPoint.x - system.centerX;
        const sparkOutwardY = sparkPoint.y - system.centerY;
        const sparkOutwardLength = Math.max(
          1e-3,
          Math.sqrt(sparkOutwardX * sparkOutwardX + sparkOutwardY * sparkOutwardY)
        );
        system.spark.x = sparkPoint.x + sparkOutwardX / sparkOutwardLength * 1.5;
        system.spark.y = sparkPoint.y + sparkOutwardY / sparkOutwardLength * 1.5;
        const sparkPulse = (Math.sin(staggeredAngle * 1.7) + 1) * 0.5;
        system.spark.alpha = 0.12 + sparkPulse * 0.58;
        const sparkScale = 0.72 + sparkPulse * 0.32;
        system.spark.scaleX = sparkScale;
        system.spark.scaleY = sparkScale;
      }
    }
    // 根据当前舞台尺寸保持胜利卡片居中。
    positionWinCard() {
      if (!this.winCard) {
        return;
      }
      this.winCard.x = Math.round((Laya.stage.width - this.winCard.width) / 2);
      this.winCard.y = Math.round((Laya.stage.height - this.winCard.height) / 2);
    }
    // 刷新五段进度格的明暗状态。
    updateScoreSegments() {
      const litCount = Math.min(this.score, this.winScore);
      for (let i = 0; i < this.scoreSegments.length; i++) {
        const segment = this.scoreSegments[i];
        const isLit = i < litCount;
        segment.graphics.clear();
        segment.alpha = isLit ? 1 : 0.72;
        segment.graphics.drawPoly(
          0,
          0,
          [0, 0, 20, 0, 24, 4, 24, 14, 0, 14],
          isLit ? "#2DEBFF" : "#0D2938",
          isLit ? "#B8FBFF" : "#2B6272",
          1
        );
        if (isLit) {
          segment.graphics.drawLine(3, 2, 19, 2, "#E4FFFF", 1);
        }
      }
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
      this.playScoreFeedback(platform);
      this.checkWin();
      console.log(
        "ScoreManager: add score from",
        platformName,
        "score =",
        this.score
      );
    }
    playScoreFeedback(platform) {
      SfxManager.playScore();
      this.beginPlatformEnergyAbsorption(platform);
      this.playScoreHudPulse();
      this.spawnTransientScoreFeedback(platform);
    }
    spawnTransientScoreFeedback(platform) {
      var _a, _b;
      const stage = Laya.stage;
      if (!stage || typeof stage.addChild !== "function")
        return;
      const position = this.getPlatformFeedbackStagePosition(platform);
      const root = new Laya.Sprite();
      root.name = "WPH_ScoreGainFeedback";
      root.width = 190;
      root.height = 68;
      root.x = Math.max(8, Math.min((Number(stage.width) || 1334) - root.width - 8, position.x - root.width * 0.5));
      root.y = Math.max(12, Math.min((Number(stage.height) || 750) - root.height - 12, position.y - 78));
      root.zOrder = 10001;
      root.mouseEnabled = false;
      root.mouseThrough = true;
      root.alpha = 1;
      root.scaleX = 0.8;
      root.scaleY = 0.8;
      const gain = new Laya.Text();
      gain.name = "WPH_ScoreGainValue";
      gain.text = "+1";
      gain.font = "Arial";
      gain.fontSize = 28;
      gain.bold = true;
      gain.color = "#F4FFFF";
      gain.stroke = 2;
      gain.strokeColor = "#0A7288";
      gain.width = root.width;
      gain.height = 34;
      gain.align = "center";
      gain.valign = "middle";
      gain.mouseEnabled = false;
      root.addChild(gain);
      const progress = new Laya.Text();
      progress.name = "WPH_ScoreGainProgress";
      progress.text = "SCORE " + this.score + " / " + this.winScore;
      progress.font = "Arial";
      progress.fontSize = 16;
      progress.bold = true;
      progress.color = "#83F7FF";
      progress.x = 5;
      progress.y = 34;
      progress.width = root.width - 10;
      progress.height = 26;
      progress.align = "center";
      progress.valign = "middle";
      progress.mouseEnabled = false;
      root.addChild(progress);
      const sparkVectors = [
        { x: -30, y: -15 },
        { x: -17, y: -28 },
        { x: 0, y: -34 },
        { x: 18, y: -27 },
        { x: 31, y: -13 }
      ];
      const sparks = [];
      for (let index = 0; index < sparkVectors.length; index++) {
        const vector = sparkVectors[index];
        const spark = new Laya.Sprite();
        spark.name = "WPH_ScoreSpark_" + index;
        spark.x = root.width * 0.5;
        spark.y = 24;
        spark.mouseEnabled = false;
        spark.graphics.drawCircle(0, 0, index % 2 === 0 ? 2 : 1.5, index % 2 === 0 ? "#35E9FF" : "#A878FF");
        root.addChild(spark);
        sparks.push({ node: spark, x: vector.x, y: vector.y });
      }
      stage.addChild(root);
      const startY = root.y;
      const startedAt = this.readUiNow();
      let cleaned = false;
      let cleanup = () => {
      };
      const update = () => {
        if (cleaned || root.destroyed) {
          cleanup();
          return;
        }
        const elapsed = Math.max(0, this.readUiNow() - startedAt);
        const normalized = Math.min(1, elapsed / this.scoreFeedbackDurationMs);
        const rise = 1 - Math.pow(1 - normalized, 2);
        root.y = startY - 42 * rise;
        root.alpha = normalized <= 0.2 ? 1 : Math.max(0, 1 - (normalized - 0.2) / 0.8);
        const scale = normalized <= 0.2 ? 0.8 + normalized / 0.2 * 0.3 : 1.1 - (normalized - 0.2) / 0.8 * 0.1;
        root.scaleX = scale;
        root.scaleY = scale;
        for (const spark of sparks) {
          spark.node.x = root.width * 0.5 + spark.x * rise;
          spark.node.y = 24 + spark.y * rise;
          spark.node.alpha = Math.max(0, 1 - normalized);
        }
        if (normalized >= 1)
          cleanup();
      };
      cleanup = () => {
        var _a2;
        if (cleaned)
          return;
        cleaned = true;
        if (typeof ((_a2 = Laya.timer) == null ? void 0 : _a2.clear) === "function") {
          Laya.timer.clear(root, update);
          Laya.timer.clear(root, cleanup);
        }
        this.transientScoreFeedback.delete(root);
        this.destroyPlatformEnergyNode(root);
      };
      this.transientScoreFeedback.set(root, cleanup);
      update();
      if (typeof ((_a = Laya.timer) == null ? void 0 : _a.frameLoop) === "function") {
        Laya.timer.frameLoop(1, root, update);
      } else if (typeof ((_b = Laya.timer) == null ? void 0 : _b.once) === "function") {
        Laya.timer.once(this.scoreFeedbackDurationMs, root, cleanup);
      }
    }
    getPlatformFeedbackStagePosition(platform) {
      const localX = Math.max(0, Number(platform == null ? void 0 : platform.width) || 0) * 0.5;
      if (platform && typeof platform.localToGlobal === "function" && Laya.Point) {
        try {
          const converted = platform.localToGlobal(new Laya.Point(localX, 0), true);
          if (Number.isFinite(Number(converted == null ? void 0 : converted.x)) && Number.isFinite(Number(converted == null ? void 0 : converted.y))) {
            return { x: Number(converted.x), y: Number(converted.y) };
          }
        } catch (_) {
        }
      }
      let x = localX;
      let y = 0;
      let node = platform;
      let guard = 0;
      while (node && node !== Laya.stage && guard < 32) {
        x += Number(node.x) || 0;
        y += Number(node.y) || 0;
        node = node.parent;
        guard++;
      }
      return { x, y };
    }
    playScoreHudPulse() {
      var _a, _b;
      this.stopScoreHudPulse();
      const hud = this.scoreHud;
      if (!hud)
        return;
      const startedAt = this.readUiNow();
      let stopped = false;
      const update = () => {
        if (stopped || hud.destroyed) {
          stop();
          return;
        }
        const elapsed = Math.max(0, this.readUiNow() - startedAt);
        const normalized = Math.min(1, elapsed / this.scoreHudPulseDurationMs);
        const scale = normalized <= 0.5 ? 1 + normalized / 0.5 * 0.1 : 1.1 - (normalized - 0.5) / 0.5 * 0.1;
        hud.scaleX = scale;
        hud.scaleY = scale;
        if (normalized >= 1)
          stop();
      };
      const stop = () => {
        var _a2;
        if (stopped)
          return;
        stopped = true;
        if (typeof ((_a2 = Laya.timer) == null ? void 0 : _a2.clear) === "function")
          Laya.timer.clear(hud, update);
        hud.scaleX = 1;
        hud.scaleY = 1;
        if (this.scoreHudPulseCleanup === stop)
          this.scoreHudPulseCleanup = null;
      };
      this.scoreHudPulseCleanup = stop;
      update();
      if (typeof ((_a = Laya.timer) == null ? void 0 : _a.frameLoop) === "function") {
        Laya.timer.frameLoop(1, hud, update);
      } else if (typeof ((_b = Laya.timer) == null ? void 0 : _b.once) === "function") {
        Laya.timer.once(this.scoreHudPulseDurationMs, hud, stop);
      }
    }
    stopScoreHudPulse() {
      const cleanup = this.scoreHudPulseCleanup;
      this.scoreHudPulseCleanup = null;
      if (cleanup)
        cleanup();
      if (this.scoreHud) {
        this.scoreHud.scaleX = 1;
        this.scoreHud.scaleY = 1;
      }
    }
    playLevelHudEntrance() {
      var _a, _b;
      this.finishLevelHudEntrance();
      const hud = this.scoreHud;
      if (!hud)
        return;
      hud.x = 10;
      hud.alpha = 0;
      const startedAt = this.readUiNow();
      let finished = false;
      const update = () => {
        if (finished || hud.destroyed) {
          finish();
          return;
        }
        const normalized = Math.min(1, Math.max(0, this.readUiNow() - startedAt) / this.scoreHudEntranceDurationMs);
        const eased = 1 - Math.pow(1 - normalized, 3);
        hud.x = 10 + 30 * eased;
        hud.alpha = eased;
        if (normalized >= 1)
          finish();
      };
      const finish = () => {
        var _a2;
        if (finished)
          return;
        finished = true;
        if (typeof ((_a2 = Laya.timer) == null ? void 0 : _a2.clear) === "function")
          Laya.timer.clear(hud, update);
        hud.x = 40;
        hud.alpha = 1;
        if (this.scoreHudEntranceCleanup === finish)
          this.scoreHudEntranceCleanup = null;
      };
      this.scoreHudEntranceCleanup = finish;
      update();
      if (typeof ((_a = Laya.timer) == null ? void 0 : _a.frameLoop) === "function") {
        Laya.timer.frameLoop(1, hud, update);
      } else if (typeof ((_b = Laya.timer) == null ? void 0 : _b.once) === "function") {
        Laya.timer.once(this.scoreHudEntranceDurationMs, hud, finish);
      }
    }
    finishLevelHudEntrance() {
      const cleanup = this.scoreHudEntranceCleanup;
      this.scoreHudEntranceCleanup = null;
      if (cleanup)
        cleanup();
      if (this.scoreHud) {
        this.scoreHud.x = 40;
        this.scoreHud.alpha = 1;
      }
    }
    clearTransientFeedback() {
      for (const cleanup of Array.from(this.transientScoreFeedback.values()))
        cleanup();
      this.transientScoreFeedback.clear();
      this.stopScoreHudPulse();
    }
    readUiNow() {
      var _a;
      const timerValue = Number((_a = Laya.timer) == null ? void 0 : _a.currTimer);
      return Number.isFinite(timerValue) ? timerValue : Date.now();
    }
    beginPlatformEnergyAbsorption(platform) {
      const currentState = this.getOrInitializePlatformEnergyState(platform);
      if (currentState !== "FULL_ENERGY")
        return;
      this.platformEnergyStates.set(platform, "ABSORBING");
      this.playPlatformEnergyAbsorption(platform);
    }
    getOrInitializePlatformEnergyState(platform) {
      const currentState = this.platformEnergyStates.get(platform);
      if (currentState)
        return currentState;
      this.platformEnergyStates.set(platform, "FULL_ENERGY");
      return "FULL_ENERGY";
    }
    playPlatformEnergyAbsorption(platform) {
      var _a, _b;
      let transferRoot = null;
      let ballSyncGlow = null;
      let energyVisual = null;
      try {
        if (!platform || typeof platform.addChild !== "function") {
          if (this.platformEnergyStates.get(platform) === "ABSORBING") {
            this.platformEnergyStates.set(platform, "DEPLETED");
          }
          return;
        }
        const platformWidth = Math.max(1, Number(platform.width) || 1);
        const platformHeight = Math.max(1, Number(platform.height) || 1);
        const visualHeight = Math.max(7, platformHeight);
        const ball = this.findBallForPlatform(platform);
        energyVisual = this.platformEnergyVisuals.get(platform);
        if (!energyVisual || energyVisual.destroyed) {
          energyVisual = new Laya.Sprite();
          energyVisual.name = "WPE1_PlatformEnergy";
          energyVisual.width = platformWidth;
          energyVisual.height = visualHeight;
          energyVisual.y = -Math.max(3, visualHeight - platformHeight);
          energyVisual.zOrder = 950;
          energyVisual.mouseEnabled = false;
          energyVisual.mouseThrough = true;
          platform.addChild(energyVisual);
          this.platformEnergyVisuals.set(platform, energyVisual);
        }
        this.drawPlatformEnergyGradient(energyVisual, platformWidth, visualHeight, 0);
        transferRoot = new Laya.Sprite();
        transferRoot.name = "WPE1_EnergyTransfer";
        transferRoot.width = platformWidth;
        transferRoot.height = platformHeight;
        transferRoot.zOrder = 1e3;
        transferRoot.mouseEnabled = false;
        transferRoot.mouseThrough = true;
        platform.addChild(transferRoot);
        const flash = new Laya.Sprite();
        flash.mouseEnabled = false;
        flash.mouseThrough = true;
        flash.graphics.drawRect(
          -3,
          energyVisual.y - 2,
          platformWidth + 6,
          visualHeight + 4,
          "#DFFFFF",
          "#35E9FF",
          2
        );
        flash.graphics.drawLine(0, energyVisual.y, platformWidth, energyVisual.y, "#FFFFFF", 2);
        transferRoot.addChild(flash);
        const particlePalette = ["#FFFFFF", "#35E9FF", "#8B5CFF", "#DFFFFF"];
        const particles = [];
        for (let index = 0; index < 8; index++) {
          const particle = new Laya.Sprite();
          const radius = index % 3 === 0 ? 2.4 : 1.6;
          particle.mouseEnabled = false;
          particle.mouseThrough = true;
          particle.graphics.drawCircle(0, 0, radius, particlePalette[index % particlePalette.length]);
          transferRoot.addChild(particle);
          particles.push({
            node: particle,
            startX: platformWidth * (index + 1) / 9,
            startY: energyVisual.y + visualHeight * (0.35 + index % 2 * 0.28),
            driftX: (index - 3.5) * 2.8
          });
        }
        if (ball && typeof ball.addChild === "function") {
          const ballRadius = Math.max(5, Math.max(Number(ball.width) || 10, Number(ball.height) || 10) * 0.5);
          ballSyncGlow = new Laya.Sprite();
          ballSyncGlow.name = "WPE1_BallSync";
          ballSyncGlow.zOrder = 1002;
          ballSyncGlow.mouseEnabled = false;
          ballSyncGlow.mouseThrough = true;
          ballSyncGlow.graphics.drawCircle(0, 0, ballRadius + 4, "#35E9FF", "#FFFFFF", 1.4);
          ballSyncGlow.graphics.drawCircle(0, 0, ballRadius + 1.5, "#8B5CFF");
          ballSyncGlow.alpha = 0;
          ball.addChild(ballSyncGlow);
        }
        const readNow = () => {
          var _a2;
          const timerValue = Number((_a2 = Laya.timer) == null ? void 0 : _a2.currTimer);
          return Number.isFinite(timerValue) ? timerValue : Date.now();
        };
        const startedAt = readNow();
        let finished = false;
        const updateEnergyAbsorption = () => {
          if (finished)
            return;
          if ((transferRoot == null ? void 0 : transferRoot.destroyed) || (energyVisual == null ? void 0 : energyVisual.destroyed)) {
            finishEnergyAbsorption(true);
            return;
          }
          const elapsed = Math.max(0, readNow() - startedAt);
          const progress = Math.min(1, elapsed / this.energyAbsorptionDurationMs);
          const eased = 1 - Math.pow(1 - progress, 2);
          const target = this.getBallTargetInPlatformSpace(platform, ball, platformWidth);
          this.drawPlatformEnergyGradient(energyVisual, platformWidth, visualHeight, progress);
          flash.alpha = 0.72 * Math.pow(1 - progress, 2);
          for (let index = 0; index < particles.length; index++) {
            const particle = particles[index];
            const arc = Math.sin(Math.PI * eased) * (12 + index % 3 * 5);
            particle.node.x = particle.startX + (target.x - particle.startX) * eased + particle.driftX * Math.sin(Math.PI * progress);
            particle.node.y = particle.startY + (target.y - particle.startY) * eased - arc;
            particle.node.alpha = progress < 0.12 ? progress / 0.12 : progress > 0.82 ? Math.max(0, (1 - progress) / 0.18) : 1;
            const scale = 0.75 + Math.sin(Math.PI * progress) * 0.55;
            particle.node.scaleX = scale;
            particle.node.scaleY = scale;
          }
          if (ballSyncGlow) {
            const pulse = Math.sin(Math.PI * progress);
            ballSyncGlow.alpha = pulse * 0.72;
            const glowScale = 0.78 + eased * 0.72;
            ballSyncGlow.scaleX = glowScale;
            ballSyncGlow.scaleY = glowScale;
          }
          if (progress >= 1)
            finishEnergyAbsorption(true);
        };
        const finishEnergyAbsorption = (complete) => {
          var _a2;
          if (finished)
            return;
          finished = true;
          if (typeof ((_a2 = Laya.timer) == null ? void 0 : _a2.clear) === "function") {
            Laya.timer.clear(transferRoot, updateEnergyAbsorption);
            Laya.timer.clear(transferRoot, completeEnergyAbsorption);
          }
          this.activeEnergyAbsorptions.delete(platform);
          this.destroyPlatformEnergyNode(transferRoot);
          this.destroyPlatformEnergyNode(ballSyncGlow);
          if (complete && this.platformEnergyStates.get(platform) === "ABSORBING") {
            this.platformEnergyStates.set(platform, "DEPLETED");
            if (energyVisual && !energyVisual.destroyed) {
              this.drawPlatformEnergyGradient(energyVisual, platformWidth, visualHeight, 1);
            }
          }
        };
        const completeEnergyAbsorption = () => finishEnergyAbsorption(true);
        const cancelEnergyAbsorption = () => finishEnergyAbsorption(false);
        this.activeEnergyAbsorptions.set(platform, cancelEnergyAbsorption);
        updateEnergyAbsorption();
        if (typeof ((_a = Laya.timer) == null ? void 0 : _a.frameLoop) === "function") {
          Laya.timer.frameLoop(1, transferRoot, updateEnergyAbsorption);
        } else if (typeof ((_b = Laya.timer) == null ? void 0 : _b.once) === "function") {
          Laya.timer.once(this.energyAbsorptionDurationMs, transferRoot, completeEnergyAbsorption);
        } else {
          finishEnergyAbsorption(true);
        }
      } catch (_) {
        this.activeEnergyAbsorptions.delete(platform);
        this.destroyPlatformEnergyNode(transferRoot);
        this.destroyPlatformEnergyNode(ballSyncGlow);
        if (this.platformEnergyStates.get(platform) === "ABSORBING") {
          this.platformEnergyStates.set(platform, "DEPLETED");
          if (energyVisual && !energyVisual.destroyed) {
            const width = Math.max(1, Number(platform == null ? void 0 : platform.width) || 1);
            const height = Math.max(7, Number(platform == null ? void 0 : platform.height) || 1);
            this.drawPlatformEnergyGradient(energyVisual, width, height, 1);
          }
        }
      }
    }
    findBallForPlatform(platform) {
      var _a, _b, _c;
      const parent = platform == null ? void 0 : platform.parent;
      if (!parent)
        return null;
      if (typeof parent.getChildByName === "function") {
        const ball = parent.getChildByName("Ball");
        if (ball)
          return ball;
      }
      const children = (_b = (_a = parent == null ? void 0 : parent._children) != null ? _a : parent == null ? void 0 : parent._childs) != null ? _b : [];
      return (_c = children.find((child) => (child == null ? void 0 : child.name) === "Ball")) != null ? _c : null;
    }
    getBallTargetInPlatformSpace(platform, ball, platformWidth) {
      if (ball && ball.parent === (platform == null ? void 0 : platform.parent)) {
        return {
          x: (Number(ball.x) || 0) - (Number(platform.x) || 0),
          y: (Number(ball.y) || 0) - (Number(platform.y) || 0)
        };
      }
      return { x: platformWidth * 0.5, y: -26 };
    }
    drawPlatformEnergyGradient(energyVisual, width, height, progress) {
      if (!(energyVisual == null ? void 0 : energyVisual.graphics))
        return;
      const normalized = Math.max(0, Math.min(1, progress));
      const segmentCount = 12;
      const segmentWidth = width / segmentCount;
      energyVisual.graphics.clear();
      for (let index = 0; index < segmentCount; index++) {
        const position = index / Math.max(1, segmentCount - 1);
        const colorProgress = Math.max(0, Math.min(1, normalized + (1 - position) * 0.16));
        const color = this.mixEnergyColor([53, 233, 255], [25, 29, 48], colorProgress);
        energyVisual.graphics.drawRect(
          index * segmentWidth,
          0,
          segmentWidth + 0.75,
          height,
          color
        );
      }
      const borderColor = this.mixEnergyColor([220, 255, 255], [67, 62, 91], normalized);
      energyVisual.graphics.drawLine(0, 0, width, 0, borderColor, 1.2);
      energyVisual.graphics.drawLine(0, height, width, height, borderColor, 1);
      energyVisual.alpha = 0.94;
    }
    mixEnergyColor(from, to, progress) {
      const channel = (index) => {
        const value = Math.round(from[index] + (to[index] - from[index]) * progress);
        const hex = Math.max(0, Math.min(255, value)).toString(16);
        return hex.length < 2 ? "0" + hex : hex;
      };
      return "#" + channel(0) + channel(1) + channel(2);
    }
    resetPlatformEnergyCycle() {
      for (const cancel of Array.from(this.activeEnergyAbsorptions.values())) {
        cancel();
      }
      this.activeEnergyAbsorptions.clear();
      for (const visual of this.platformEnergyVisuals.values()) {
        this.destroyPlatformEnergyNode(visual);
      }
      this.platformEnergyVisuals.clear();
      this.platformEnergyStates.clear();
    }
    destroyPlatformEnergyNode(node) {
      if (!node)
        return;
      try {
        if (typeof node.removeSelf === "function")
          node.removeSelf();
        if (typeof node.destroy === "function")
          node.destroy(true);
      } catch (_) {
      }
    }
    // 更新分数显示文本
    updateScoreText() {
      if (!this.scoreText) {
        return;
      }
      this.scoreText.text = this.score + " / " + this.winScore;
      this.updateScoreSegments();
    }
    // 检查是否满足获胜条件（分数达到5分）
    checkWin() {
      if (this.hasWon || this.score < this.winScore) {
        return;
      }
      this.hasWon = true;
      SfxManager.playClear();
      const handler = this.winHandler;
      if (handler) {
        try {
          handler(this.score);
        } catch (error) {
          console.error("Level completion handler failed.", error);
        }
      }
      console.log("Game clear");
    }
    // 显示获胜提示文本
    showWinText() {
      if (!this.winCard || !this.winText) {
        return;
      }
      this.positionWinCard();
      this.winCard.mouseEnabled = true;
      this.winCard.visible = true;
      this.startWinGoldenAura();
    }
    // 隐藏获胜提示文本
    hideWinText() {
      if (!this.winCard) {
        return;
      }
      this.winCard.visible = false;
      this.winCard.mouseEnabled = false;
      this.drawNextLevelButton("normal");
      this.stopWinGoldenAura();
    }
    // 重置分数管理器状态
    reset() {
      this.clearTransientFeedback();
      this.finishLevelHudEntrance();
      this.score = 0;
      this.hasWon = false;
      this.scoredPlatforms.clear();
      this.resetPlatformEnergyCycle();
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
    getWinScore() {
      return this.winScore;
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
      // ── 4. 关卡状态：记录当前关卡编号与四格难度 HUD ──
      this.currentLevel = 1;
      this.maxLevel = 4;
      this.levelDifficultyHud = null;
      this.levelDifficultyCells = [];
      this.levelDifficultyNumerals = [];
      this.levelDeathRollbackDisplay = null;
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
      this.levelTransitionHandler = null;
      this.levelTransitionPending = false;
      this.touchInput = null;
      // Pause is owned by Main. These fields only account for active-gameplay logical time.
      this.activeGameplayPauseStartedAt = null;
      this.activeGameplayPauseAccumulatedMs = 0;
      this.levelHudEntranceCleanup = null;
      this.visualLoopStarted = false;
      this.platformLandingImpactStarts = /* @__PURE__ */ new Map();
      this.platformLandingContact = null;
      this.disappearRecoveryStates = /* @__PURE__ */ new Map();
      this.visualPhase = 0;
      this.groundVisual = null;
      this.groundEnergy = null;
      this.ballVisualRoot = null;
      this.ballAura = null;
      this.ballShell = null;
      this.ballCore = null;
      this.ballCircuits = null;
      this.ballVisualScaleX = 1;
      this.ballVisualScaleY = 1;
      this.ballVisualStateReady = false;
      this.ballWasGrounded = false;
      this.ballLastVy = 0;
      this.ballEnergyObservedLevel = 1;
      this.ballEnergyObservedScore = 0;
      this.ballEnergyTransitionFrom = 0;
      this.ballEnergyTransitionTo = 0;
      this.ballEnergyTransitionStartedAt = 0;
      this.ballEnergyTransitionActive = false;
      this.ballEnergyVisualProgress = 0;
      this.ballEnergyEvolutionStrength = 0;
      this.ballEnergyRenderedLevel = 0;
      this.ballEnergyRenderedProgress = -1;
      this.ballTrailNodes = [];
      this.ballTrailHistory = [];
      this.ballTrailLastX = 0;
      this.ballTrailLastY = 0;
      this.boundaryVisuals = [];
      this.shakeTarget = null;
      this.shakeBaseX = 0;
      this.shakeBaseY = 0;
      this.shakeStartedAt = 0;
      this.deathFlash = null;
      this.deathFlashStartedAt = 0;
      this.deathFragmentLayer = null;
      this.deathFragmentStartedAt = 0;
      this.deathFragmentOriginX = 0;
      this.deathFragmentOriginY = 0;
      this.deathFragments = [];
      this.deathReconstructionPhase = "IDLE";
      this.deathReconstructionStartedAt = 0;
      this.deathReconstructionUntilMs = 0;
      this.deathLogicalRespawnDone = false;
      this.deathWorldGenerationDone = false;
      this.deathCoreReassemblyStarted = false;
      this.deathReconstructionAmbience = null;
      this.deathBufferLayer = null;
      this.deathBufferFragments = [];
      this.deathCountdownDigitLayer = null;
      this.deathCountdownDigitSegments = [];
      this.deathCountdownDigitValue = null;
      this.deathCountdownDigitEnergyState = "NONE";
      this.deathReticleGroup = null;
      this.deathReticleParts = [];
      this.deathReticleTemplateIndex = null;
      this.lastDeathReticleTemplateIndex = -1;
      this.deathReticleSequence = 0;
      this.deathReticleVisualScale = 0;
      this.deathCountdownColorState = "NONE";
      this.deathOldWorldVisuals = [];
      this.deathPlatformVisuals = [];
      this.deathPlatformFinalVisibility = /* @__PURE__ */ new Map();
      this.deathHazardFinalVisibility = /* @__PURE__ */ new Map();
      this.deathHazardOwnerPlatforms = /* @__PURE__ */ new Map();
      this.deathGroundCanonicalState = null;
      this.deathBallReassemblyLayer = null;
      this.deathBallShards = [];
      this.deathBallWasVisible = true;
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
      this.createLevelDifficultyBar();
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
          left: () => {
            var _a;
            return this.isKeyDown(Laya.Keyboard.LEFT, Laya.Keyboard.A) || !!((_a = this.touchInput) == null ? void 0 : _a.left());
          },
          right: () => {
            var _a;
            return this.isKeyDown(Laya.Keyboard.RIGHT, Laya.Keyboard.D) || !!((_a = this.touchInput) == null ? void 0 : _a.right());
          },
          jump: () => {
            var _a;
            return this.isKeyDown(Laya.Keyboard.W) || this.isKeyDown(Laya.Keyboard.UP) || !!((_a = this.touchInput) == null ? void 0 : _a.jump());
          }
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
      if (this.holdDeathReconstructionLock(ball, jump, env))
        return;
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
      const nowMs = this.readActiveGameplayTime(time.currTimer());
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
        if (this.isDeathReconstructionActive())
          return;
      }
      env.syncDisappearHighlightBar();
      this.centerX += this.vx;
      env.checkHazards();
      if (this.isDeathReconstructionActive())
        return;
      env.releaseGroundIfUnsupported();
      env.clampToCanvas();
      if (this.isDeathReconstructionActive())
        return;
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
          this.syncGroundVisual();
          ScoreManager.instance.addPlatformScore(platform);
          const dc = this.disappearConfigs.get(platform);
          if (dc && dc.state === "idle") {
            dc.state = "counting";
            dc.triggerAt = this.readActiveGameplayTime(time.currTimer());
          }
        }
      }
    }
    setLevelTransitionHandler(handler) {
      this.levelTransitionHandler = handler;
    }
    getCurrentLevel() {
      return this.currentLevel;
    }
    getMaxLevel() {
      return this.maxLevel;
    }
    setTouchInputSource(source) {
      var _a;
      if (this.touchInput && this.touchInput !== source) {
        this.touchInput.setRuntimeBlockProvider(() => true);
        this.touchInput.resetAll();
      }
      this.touchInput = source;
      (_a = this.touchInput) == null ? void 0 : _a.setRuntimeBlockProvider(() => this.levelTransitionPending || this.isDeathReconstructionActive() || ScoreManager.instance.isWon());
    }
    isPauseBlockedByGameplayState() {
      return !this.enabled || this.levelTransitionPending || this.isHandlingDeath || this.isDeathReconstructionActive() || ScoreManager.instance.isWon();
    }
    beginGameplayPauseAccounting() {
      if (this.activeGameplayPauseStartedAt !== null)
        return;
      this.activeGameplayPauseStartedAt = this.readGameplayRealTime();
    }
    finishGameplayPauseAccounting() {
      if (this.activeGameplayPauseStartedAt === null)
        return;
      const realNow = this.readGameplayRealTime();
      this.activeGameplayPauseAccumulatedMs += Math.max(0, realNow - this.activeGameplayPauseStartedAt);
      this.activeGameplayPauseStartedAt = null;
    }
    synchronizeJumpInputBaseline() {
      this.prevJumpKey = this.isKeyDown(Laya.Keyboard.W) || this.isKeyDown(Laya.Keyboard.UP);
    }
    beginLevelTransition() {
      this.clearDeathReconstruction();
      const handler = this.levelTransitionHandler;
      if (!handler) {
        this.enabled = true;
        return;
      }
      if (this.levelTransitionPending)
        return;
      this.levelTransitionPending = true;
      this.enabled = false;
      let resumed = false;
      const resume = () => {
        if (resumed)
          return;
        resumed = true;
        this.levelTransitionPending = false;
        this.enabled = true;
      };
      try {
        handler(this.currentLevel, resume);
      } catch (error) {
        console.error("Level transition failed; gameplay resumed.", error);
        resume();
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
    readGameplayRealTime() {
      var _a;
      const timerValue = Number((_a = Laya.timer) == null ? void 0 : _a.currTimer);
      return Number.isFinite(timerValue) ? timerValue : Date.now();
    }
    readActiveGameplayTime(realNow = this.readGameplayRealTime()) {
      const currentPauseDuration = this.activeGameplayPauseStartedAt === null ? 0 : Math.max(0, realNow - this.activeGameplayPauseStartedAt);
      return realNow - this.activeGameplayPauseAccumulatedMs - currentPauseDuration;
    }
    readDisappearRecoveryTime() {
      return this.readActiveGameplayTime();
    }
    getOrCreateDisappearRecoveryState(platform) {
      let recovery = this.disappearRecoveryStates.get(platform);
      if (!recovery) {
        recovery = { state: "ACTIVE", enteredAt: this.readDisappearRecoveryTime(), visual: null };
        this.disappearRecoveryStates.set(platform, recovery);
      }
      return recovery;
    }
    hideDisappearRecoveryVisual(recovery) {
      if (recovery.visual && !recovery.visual.destroyed) {
        recovery.visual.visible = false;
      }
    }
    resetDisappearRecoveryState(platform) {
      const recovery = this.disappearRecoveryStates.get(platform);
      if (recovery == null ? void 0 : recovery.visual) {
        this.destroyVisualNode(recovery.visual);
      }
      this.disappearRecoveryStates.set(platform, {
        state: "ACTIVE",
        enteredAt: this.readDisappearRecoveryTime(),
        visual: null
      });
    }
    clearDisappearRecoveryStates() {
      for (const recovery of this.disappearRecoveryStates.values()) {
        if (recovery.visual) {
          this.destroyVisualNode(recovery.visual);
        }
      }
      this.disappearRecoveryStates.clear();
    }
    updateDisappearRecoveryLifecycle(platform, cfg) {
      const nowMs = this.readDisappearRecoveryTime();
      const recovery = this.getOrCreateDisappearRecoveryState(platform);
      if (cfg.state === "counting") {
        if (recovery.state !== "WARNING") {
          recovery.state = "WARNING";
          recovery.enteredAt = cfg.triggerAt || nowMs;
        }
        this.hideDisappearRecoveryVisual(recovery);
        return;
      }
      if (cfg.state === "hidden") {
        platform.visible = false;
        if (recovery.state === "ACTIVE" || recovery.state === "WARNING") {
          recovery.state = "HIDDEN_COOLDOWN";
          recovery.enteredAt = nowMs;
        }
        if (recovery.state === "HIDDEN_COOLDOWN") {
          this.hideDisappearRecoveryVisual(recovery);
          const hiddenElapsed = Math.max(0, nowMs - recovery.enteredAt);
          if (hiddenElapsed >= BallController.DISAPPEAR_HIDDEN_COOLDOWN_MS) {
            recovery.state = "REBUILDING";
            recovery.enteredAt += BallController.DISAPPEAR_HIDDEN_COOLDOWN_MS;
          }
        }
        if (recovery.state === "REBUILDING") {
          const rebuildElapsed = Math.max(0, nowMs - recovery.enteredAt);
          if (rebuildElapsed >= BallController.DISAPPEAR_REBUILDING_MS) {
            cfg.state = "idle";
            cfg.triggerAt = 0;
            recovery.state = "ACTIVE";
            recovery.enteredAt = nowMs;
            this.hideDisappearRecoveryVisual(recovery);
            this.repaintPlatformColor(platform, "#00ff00");
            platform.visible = true;
            return;
          }
          this.drawDisappearRecoveryVisual(
            platform,
            recovery,
            rebuildElapsed / BallController.DISAPPEAR_REBUILDING_MS
          );
        }
        return;
      }
      if (recovery.state !== "ACTIVE") {
        recovery.state = "ACTIVE";
        recovery.enteredAt = nowMs;
        this.hideDisappearRecoveryVisual(recovery);
      }
    }
    drawDisappearRecoveryVisual(platform, recovery, rawProgress) {
      const parent = platform == null ? void 0 : platform.parent;
      if (!parent || typeof parent.addChild !== "function")
        return;
      let visual = recovery.visual;
      if (!visual || visual.destroyed || visual.parent !== parent) {
        if (visual)
          this.destroyVisualNode(visual);
        visual = new Laya.Sprite();
        visual.name = "WPE2_DisappearRecovery";
        visual.mouseEnabled = false;
        visual.mouseThrough = true;
        visual.blendMode = "lighter";
        parent.addChild(visual);
        recovery.visual = visual;
      }
      const progress = Math.max(0, Math.min(1, rawProgress));
      const eased = 1 - Math.pow(1 - progress, 2);
      const width = Math.max(1, Number(platform.width) || 1);
      const depth = Math.max(8, Math.min(16, Number(platform.height) || 10));
      const graphics = visual.graphics;
      if (!graphics)
        return;
      visual.x = Number(platform.x) || 0;
      visual.y = (Number(platform.y) || 0) - 6;
      visual.width = width;
      visual.height = depth + 12;
      visual.zOrder = (Number(platform.zOrder) || 0) + 3;
      visual.alpha = 0.34 + 0.58 * eased;
      visual.visible = true;
      graphics.clear();
      const top = 6;
      const bottom = top + depth;
      const scanY = top + depth * progress;
      if (typeof graphics.drawLine === "function") {
        graphics.drawLine(0, top, width, top, "#BFFFFF", 2);
        graphics.drawLine(0, bottom, width, bottom, "#35E9FF", 1.5);
        graphics.drawLine(0, top, 0, bottom, "#8B5CFF", 1.5);
        graphics.drawLine(width, top, width, bottom, "#8B5CFF", 1.5);
        for (let y = top + 3; y < bottom; y += 4) {
          graphics.drawLine(2, y, width - 2, y, "#16758D", 1);
        }
      }
      if (typeof graphics.drawRect === "function") {
        graphics.drawRect(0, scanY - 1, width, 2, "#E8FFFF");
        graphics.drawRect(width * 0.12, top + 2, width * 0.76 * eased, 1, "#35E9FF");
      }
      for (let index = 0; index < 12; index++) {
        const targetX = width * (index + 0.5) / 12;
        const startX = width * (index * 37 % 23 + 0.5) / 23;
        const targetY = index % 2 === 0 ? top : bottom;
        const startY = index % 2 === 0 ? top - 20 - index % 3 * 5 : bottom + 18 + index % 3 * 5;
        const particleX = startX + (targetX - startX) * eased;
        const particleY = startY + (targetY - startY) * eased;
        const color = index % 3 === 0 ? "#FFFFFF" : index % 2 === 0 ? "#35E9FF" : "#8B5CFF";
        if (typeof graphics.drawCircle === "function") {
          graphics.drawCircle(particleX, particleY, index % 4 === 0 ? 2 : 1.3, color);
        } else if (typeof graphics.drawRect === "function") {
          graphics.drawRect(particleX - 1, particleY - 1, 2, 2, color);
        }
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
      const entry = this.disappearConfigs.entries().next();
      if (entry.done) {
        if (bar)
          bar.visible = false;
        return;
      }
      const [target, cfg] = entry.value;
      if (target && cfg) {
        this.updateDisappearRecoveryLifecycle(target, cfg);
      }
      if (!bar)
        return;
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
      if (graphics && Array.isArray(cmds) && Laya.DrawRectCmd) {
        const drawRectCmd = cmds.find((cmd) => cmd instanceof Laya.DrawRectCmd);
        if (drawRectCmd) {
          drawRectCmd.fillColor = color;
          if (typeof graphics.repaint === "function") {
            graphics.repaint();
          }
        }
      }
      this.paintPlatformVisual(platform, color);
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
    isDeathReconstructionActive() {
      return this.deathReconstructionPhase !== "IDLE";
    }
    holdDeathReconstructionLock(ball, jump, env) {
      if (this.deathReconstructionUntilMs <= 0)
        return false;
      const now = this.getWpBNow();
      this.updateDeathReconstruction(now);
      this.prevJumpKey = jump;
      this.vx = 0;
      this.vy = 0;
      if (this.deathReconstructionPhase === "IDLE")
        return false;
      if (this.deathReconstructionPhase !== "DECONSTRUCTING") {
        this.centerX = this.startX;
        this.centerY = this.startY;
        this.previousY = this.startY;
        env.syncBallSprite(ball);
      }
      return true;
    }
    startDeathReconstruction() {
      this.clearDeathReconstruction();
      const ball = this.owner;
      const now = this.getWpBNow();
      this.levelDeathRollbackDisplay = {
        level: this.currentLevel,
        fromProgress: Math.max(0, Math.min(1, this.ballEnergyVisualProgress))
      };
      this.captureDeathGroundCanonicalState();
      this.deathReconstructionPhase = "DECONSTRUCTING";
      this.deathReconstructionStartedAt = now;
      this.deathReconstructionUntilMs = now + BallController.DEATH_RECONSTRUCTION_DURATION_MS;
      this.deathLogicalRespawnDone = false;
      this.deathWorldGenerationDone = false;
      this.deathCoreReassemblyStarted = false;
      this.deathBallWasVisible = (ball == null ? void 0 : ball.visible) !== false;
      this.deathHazardOwnerPlatforms.clear();
      this.selectDeathReticleTemplate();
      this.mountDeathReconstructionAmbience();
      this.createOldWorldDeconstructionVisuals();
      if (ball)
        ball.visible = true;
      if (this.ballVisualRoot) {
        this.ballVisualRoot.visible = true;
        this.ballVisualRoot.alpha = 1;
      }
      for (const trail of this.ballTrailNodes) {
        trail.visible = false;
        trail.alpha = 0;
      }
    }
    captureDeathGroundCanonicalState() {
      var _a;
      const ground = (_a = this.platforms.find((platform) => (platform == null ? void 0 : platform.name) === "Ground")) != null ? _a : null;
      if (!ground) {
        this.deathGroundCanonicalState = null;
        return;
      }
      const alpha = Number(ground.alpha);
      this.deathGroundCanonicalState = {
        platform: ground,
        visible: ground.visible !== false,
        alpha: Number.isFinite(alpha) ? alpha : 1
      };
    }
    restoreDeathGroundCanonicalState() {
      const canonical = this.deathGroundCanonicalState;
      if (!(canonical == null ? void 0 : canonical.platform))
        return;
      canonical.platform.visible = canonical.visible;
      canonical.platform.alpha = canonical.alpha;
    }
    mountDeathReconstructionAmbience() {
      var _a;
      if (this.deathReconstructionAmbience || !Laya.stage)
        return;
      const stageWidth = Math.max(1, Number(Laya.stage.width) || 1280);
      const stageHeight = Math.max(1, Number(Laya.stage.height) || 720);
      const layer = new Laya.Sprite();
      layer.name = "WPV3_ReassemblyBuffer";
      layer.width = stageWidth;
      layer.height = stageHeight;
      layer.zOrder = 9988;
      layer.alpha = 0;
      layer.mouseEnabled = false;
      layer.mouseThrough = true;
      const dim = new Laya.Sprite();
      dim.name = "WPV3_GlobalDim";
      dim.alpha = 0.72;
      if (typeof ((_a = dim.graphics) == null ? void 0 : _a.drawRect) === "function") {
        dim.graphics.drawRect(0, 0, stageWidth, stageHeight, "#030711");
      }
      layer.addChild(dim);
      Laya.stage.addChild(layer);
      this.deathReconstructionAmbience = layer;
      this.createDeathReticle(layer);
      this.createDeathBufferFragments(layer);
      this.setDeathCountdownColorState("RED");
    }
    getDeathVisualUnit(index, salt) {
      let value = Math.imul(index + 1 + salt * 31, 73244475) ^ Math.imul(this.currentLevel + 17 + salt, 668265261);
      value = Math.imul(value ^ value >>> 16, 73244475);
      return ((value ^ value >>> 16) >>> 0) / 4294967295;
    }
    getDeathCountdownGeometry() {
      var _a, _b;
      const stageWidth = Math.max(1, Number((_a = Laya.stage) == null ? void 0 : _a.width) || 1280);
      const stageHeight = Math.max(1, Number((_b = Laya.stage) == null ? void 0 : _b.height) || 720);
      const referenceDigitHeight = Math.max(96, Math.min(144, stageHeight * 0.18));
      const digitHeight = referenceDigitHeight * BallController.DEATH_COUNTDOWN_DIGIT_SCALE;
      const compositionCenterY = stageHeight * 0.48;
      return {
        stageWidth,
        stageHeight,
        digitCenterY: compositionCenterY,
        digitWidth: digitHeight * 0.72,
        digitHeight,
        reticleScale: referenceDigitHeight * BallController.DEATH_RETICLE_SCALE
      };
    }
    selectDeathReticleTemplate() {
      const templateCount = BallController.DEATH_RETICLE_TEMPLATES.length;
      if (templateCount <= 0) {
        this.deathReticleTemplateIndex = null;
        return;
      }
      this.deathReticleSequence = this.deathReticleSequence + 1 >>> 0;
      let value = Math.imul(this.deathReticleSequence ^ 1831565813, 73244475) ^ Math.imul(this.currentLevel + 374761393, 668265261);
      value = Math.imul(value ^ value >>> 16, 2146121005);
      value ^= value >>> 15;
      let templateIndex = (value >>> 0) % templateCount;
      if (templateCount > 1 && templateIndex === this.lastDeathReticleTemplateIndex) {
        templateIndex = (templateIndex + 1) % templateCount;
      }
      this.deathReticleTemplateIndex = templateIndex;
      this.lastDeathReticleTemplateIndex = templateIndex;
    }
    createDeathReticle(parent) {
      if (!parent || typeof parent.addChild !== "function")
        return;
      const templateIndex = this.deathReticleTemplateIndex;
      if (templateIndex === null)
        return;
      const template = BallController.DEATH_RETICLE_TEMPLATES[templateIndex];
      if (!template)
        return;
      if (this.deathReticleGroup)
        this.destroyVisualNode(this.deathReticleGroup);
      this.deathReticleParts = [];
      const geometry = this.getDeathCountdownGeometry();
      const group = new Laya.Sprite();
      group.name = "WPV31F_CentralReticle_" + template.id;
      group.x = geometry.stageWidth * 0.5;
      group.y = geometry.digitCenterY;
      group.zOrder = 2;
      group.blendMode = "lighter";
      group.mouseEnabled = false;
      group.mouseThrough = true;
      group.alpha = 0;
      for (let i = 0; i < template.parts.length; i++) {
        const partTemplate = template.parts[i];
        const node = new Laya.Sprite();
        node.name = "WPV31F_ReticlePart_" + template.id + "_" + i;
        node.mouseEnabled = false;
        node.mouseThrough = true;
        node.alpha = 0;
        group.addChild(node);
        const visual = { node, template: partTemplate };
        this.deathReticleParts.push(visual);
        this.paintDeathReticlePart(visual, geometry.reticleScale);
      }
      parent.addChild(group);
      this.deathReticleGroup = group;
      this.deathReticleVisualScale = geometry.reticleScale;
    }
    paintDeathReticlePart(visual, visualScale) {
      var _a;
      const graphics = (_a = visual.node) == null ? void 0 : _a.graphics;
      if (!graphics)
        return;
      graphics.clear();
      const part = visual.template;
      const length = Math.max(4, part.length * visualScale);
      const weightScale = part.tone === "DARK" ? 0.7 : part.tone === "ENERGY" ? 0.82 : 0.9;
      const thickness = Math.max(0.8, part.thickness * visualScale * weightScale);
      const toneColor = BallController.DEATH_RETICLE_COLORS[part.tone];
      const coreColor = part.tone === "DARK" ? BallController.DEATH_RETICLE_COLORS.DARK : part.tone === "SOFT" ? "#F3FCFF" : toneColor;
      this.drawDeathCountdownStructuralBar(
        graphics,
        length + thickness * 1.1,
        thickness * 1.65,
        BallController.DEATH_RETICLE_COLORS.DARK
      );
      this.drawDeathCountdownStructuralBar(
        graphics,
        length + thickness * 0.42,
        thickness * 1.05,
        part.tone === "DARK" ? BallController.DEATH_RETICLE_COLORS.ENERGY : toneColor
      );
      this.drawDeathCountdownStructuralBar(
        graphics,
        length,
        thickness * 0.48,
        coreColor
      );
    }
    updateDeathReticle(elapsed) {
      const group = this.deathReticleGroup;
      const templateIndex = this.deathReticleTemplateIndex;
      if (!group || templateIndex === null)
        return;
      const template = BallController.DEATH_RETICLE_TEMPLATES[templateIndex];
      if (!template)
        return;
      const geometry = this.getDeathCountdownGeometry();
      group.x = geometry.stageWidth * 0.5;
      group.y = geometry.digitCenterY;
      if (this.deathReticleVisualScale !== geometry.reticleScale) {
        for (const visual of this.deathReticleParts) {
          this.paintDeathReticlePart(visual, geometry.reticleScale);
        }
        this.deathReticleVisualScale = geometry.reticleScale;
      }
      const entranceProgress = Math.max(0, Math.min(1, elapsed / 460));
      const entrance = 1 - Math.pow(1 - entranceProgress, 3);
      const remaining = 1 - entrance;
      const completionProgress = Math.max(0, Math.min(
        1,
        (elapsed - BallController.DEATH_CORE_REASSEMBLY_START_MS) / (BallController.DEATH_RECONSTRUCTION_DURATION_MS - BallController.DEATH_CORE_REASSEMBLY_START_MS)
      ));
      group.scaleX = 1 + completionProgress * 0.012;
      group.scaleY = 1 + completionProgress * 0.012;
      group.alpha = Math.min(1, 0.72 + entrance * 0.18 + completionProgress * 0.1);
      const visualScale = geometry.reticleScale;
      for (let i = 0; i < this.deathReticleParts.length; i++) {
        const visual = this.deathReticleParts[i];
        const part = visual.template;
        const node = visual.node;
        const baseX = part.x * visualScale;
        const baseY = part.y * visualScale;
        let x = baseX;
        let y = baseY;
        let rotation = part.rotation;
        let localEntrance = entrance;
        let scale = 1;
        switch (template.animation) {
          case "CORNER_LOCK": {
            const xDirection = baseX < 0 ? -1 : 1;
            const yDirection = baseY < 0 ? -1 : 1;
            x += xDirection * remaining * 14;
            y += yDirection * remaining * 14;
            break;
          }
          case "SIDE_DEPLOY":
            x = baseX * (0.55 + entrance * 0.45);
            break;
          case "DUAL_ALIGN":
            x += (i % 2 === 0 ? -1 : 1) * remaining * 10;
            y += (i % 4 < 2 ? -1 : 1) * remaining * 4;
            break;
          case "SEQUENTIAL_LIGHT": {
            const stagger = i / Math.max(1, this.deathReticleParts.length - 1) * 0.46;
            localEntrance = Math.max(0, Math.min(1, (entranceProgress - stagger) / 0.54));
            localEntrance = 1 - Math.pow(1 - localEntrance, 2);
            break;
          }
          case "VERTICAL_CONVERGE": {
            const direction = baseY < 0 ? -1 : 1;
            y += direction * remaining * 16;
            break;
          }
          case "FRAGMENT_LOCK": {
            const radialLength = Math.max(1, Math.sqrt(baseX * baseX + baseY * baseY));
            x += baseX / radialLength * remaining * 11;
            y += baseY / radialLength * remaining * 11;
            rotation += (i % 2 === 0 ? -1 : 1) * remaining * 12;
            scale = 0.84 + entrance * 0.16;
            break;
          }
        }
        const toneAlpha = part.tone === "DARK" ? 0.48 : part.tone === "SOFT" ? 0.94 : 0.78;
        const restrainedPulse = (Math.sin(elapsed * 4e-3 + i * 0.73) + 1) * 0.025;
        node.x = x;
        node.y = y;
        node.rotation = rotation;
        node.scaleX = scale;
        node.scaleY = scale;
        node.alpha = Math.min(1, localEntrance * (toneAlpha + restrainedPulse + completionProgress * 0.08));
      }
    }
    destroyDeathReticle() {
      if (this.deathReticleGroup)
        this.destroyVisualNode(this.deathReticleGroup);
      this.deathReticleGroup = null;
      this.deathReticleParts = [];
      this.deathReticleTemplateIndex = null;
      this.deathReticleVisualScale = 0;
    }
    getDeathCountdownPalette(state) {
      return state === "RED" ? { main: "#FF5267", highlight: "#FF8794", glow: "#FF173B", outline: "#72051B" } : { main: "#42D7FF", highlight: "#B9ECFF", glow: "#2F8FFF", outline: "#0A3D86" };
    }
    drawDeathReconstructionFragment(graphics, length, thickness, color) {
      if (typeof (graphics == null ? void 0 : graphics.drawPoly) === "function") {
        graphics.drawPoly(
          -length * 0.5,
          -thickness * 0.5,
          [0, 0, length, thickness * 0.18, length * 0.78, thickness, length * 0.12, thickness * 0.82],
          color
        );
      } else if (typeof (graphics == null ? void 0 : graphics.drawRect) === "function") {
        graphics.drawRect(-length * 0.5, -thickness * 0.5, length, thickness, color);
      }
    }
    paintDeathBufferFragment(node, index, state) {
      const graphics = node == null ? void 0 : node.graphics;
      if (!graphics)
        return;
      graphics.clear();
      const palette = this.getDeathCountdownPalette(state);
      const colors = [palette.main, palette.highlight, palette.glow, palette.outline];
      const visualScale = this.getDeathCountdownGeometry().digitHeight / 86;
      const length = (7 + index % 4 * 1.25) * visualScale;
      const thickness = (2 + index % 3 * 0.48) * visualScale;
      this.drawDeathReconstructionFragment(graphics, length, thickness, colors[index % colors.length]);
    }
    setDeathCountdownColorState(state) {
      if (this.deathCountdownColorState === state)
        return;
      this.deathCountdownColorState = state;
      for (let i = 0; i < this.deathBufferFragments.length; i++) {
        this.paintDeathBufferFragment(this.deathBufferFragments[i].node, i, state);
      }
    }
    createDeathBufferFragments(parent) {
      this.destroyDeathBufferFragments();
      if (!parent || typeof parent.addChild !== "function")
        return;
      const layer = new Laya.Sprite();
      layer.name = "WPV31_ActiveFragmentBuffer";
      layer.blendMode = "lighter";
      layer.zOrder = 3;
      layer.mouseEnabled = false;
      layer.mouseThrough = true;
      parent.addChild(layer);
      this.deathBufferLayer = layer;
      this.createDeathCountdownDigitSegments(layer);
      const ball = this.owner;
      const spawn = this.getVisualStagePoint(ball == null ? void 0 : ball.parent, this.startX, this.startY);
      for (let i = 0; i < BallController.DEATH_BUFFER_FRAGMENT_COUNT; i++) {
        const node = new Laya.Sprite();
        node.name = "WPV31_BufferFragment_" + i;
        node.mouseEnabled = false;
        node.mouseThrough = true;
        const angle = this.getDeathVisualUnit(i, 1) * Math.PI * 2;
        const radius = 48 + this.getDeathVisualUnit(i, 2) * 64;
        const baseX = spawn.x + Math.cos(angle) * radius;
        const baseY = spawn.y - 44 + Math.sin(angle) * radius * 0.56;
        const phase = this.getDeathVisualUnit(i, 3) * Math.PI * 2;
        const restRotation = -68 + this.getDeathVisualUnit(i, 4) * 136;
        node.x = baseX;
        node.y = baseY;
        node.rotation = restRotation;
        node.visible = false;
        node.alpha = 0;
        node.zOrder = 2;
        layer.addChild(node);
        this.deathBufferFragments.push({
          node,
          baseX,
          baseY,
          orbitX: 5 + this.getDeathVisualUnit(i, 5) * 9,
          orbitY: 4 + this.getDeathVisualUnit(i, 6) * 7,
          phase,
          restRotation
        });
        this.paintDeathBufferFragment(node, i, "RED");
      }
    }
    createDeathCountdownDigitSegments(parent) {
      if (!parent || typeof parent.addChild !== "function")
        return;
      const layer = new Laya.Sprite();
      layer.name = "WPV31D_WhiteCoreCyberDigit";
      layer.zOrder = 1;
      layer.mouseEnabled = false;
      layer.mouseThrough = true;
      layer.visible = false;
      parent.addChild(layer);
      this.deathCountdownDigitLayer = layer;
      for (let i = 0; i < BallController.DEATH_COUNTDOWN_STRUCTURAL_SEGMENT_COUNT; i++) {
        const segment = new Laya.Sprite();
        segment.name = "WPV31D_StructuralDigitSegment_" + i;
        segment.mouseEnabled = false;
        segment.mouseThrough = true;
        segment.visible = false;
        layer.addChild(segment);
        this.deathCountdownDigitSegments.push(segment);
      }
    }
    getDeathBufferDriftPosition(fragment, index, elapsed) {
      const seconds = Math.max(0, elapsed - BallController.DEATH_DECONSTRUCT_END_MS) * 1e-3;
      const x = fragment.baseX + Math.sin(seconds * (0.82 + index % 4 * 0.13) + fragment.phase) * fragment.orbitX + Math.cos(seconds * 1.37 + fragment.phase * 0.7) * 2.5;
      const y = fragment.baseY + Math.cos(seconds * (0.7 + index % 5 * 0.11) + fragment.phase) * fragment.orbitY + Math.sin(seconds * 1.11 + fragment.phase * 1.3) * 2;
      return { x, y };
    }
    getDeathCountdownSegmentTemplate(digit) {
      const segmentsByDigit = {
        3: [
          [-0.36, -0.5, 0.36, -0.5],
          [-0.36, 0, 0.36, 0],
          [-0.36, 0.5, 0.36, 0.5],
          [0.4, -0.46, 0.4, -0.04],
          [0.4, 0.04, 0.4, 0.46]
        ],
        2: [
          [-0.36, -0.5, 0.36, -0.5],
          [0.4, -0.44, 0.4, -0.05],
          [-0.36, 0, 0.36, 0],
          [-0.4, 0.05, -0.4, 0.44],
          [-0.36, 0.5, 0.36, 0.5]
        ],
        1: [
          [-0.36, -0.28, 0.05, -0.5],
          [0.05, -0.46, 0.05, 0.46],
          [-0.36, 0.5, 0.34, 0.5]
        ],
        0: [
          [-0.36, -0.5, 0.36, -0.5],
          [-0.36, 0.5, 0.36, 0.5],
          [-0.4, -0.44, -0.4, -0.04],
          [-0.4, 0.04, -0.4, 0.44],
          [0.4, -0.44, 0.4, -0.04],
          [0.4, 0.04, 0.4, 0.44]
        ]
      };
      return segmentsByDigit[digit];
    }
    getDeathCountdownTarget(index, digit) {
      const segments = this.getDeathCountdownSegmentTemplate(digit);
      const segmentIndex = index % segments.length;
      const lane = Math.floor(index / segments.length);
      const laneCount = Math.ceil(BallController.DEATH_BUFFER_FRAGMENT_COUNT / segments.length);
      const t = Math.min(0.94, (lane + 0.45) / laneCount);
      const [x0, y0, x1, y1] = segments[segmentIndex];
      const geometry = this.getDeathCountdownGeometry();
      const anchorX = geometry.stageWidth * 0.5;
      const anchorY = geometry.digitCenterY;
      return {
        x: anchorX + (x0 + (x1 - x0) * t) * geometry.digitWidth,
        y: anchorY + (y0 + (y1 - y0) * t) * geometry.digitHeight,
        rotation: Math.atan2(
          (y1 - y0) * geometry.digitHeight,
          (x1 - x0) * geometry.digitWidth
        ) * 180 / Math.PI
      };
    }
    drawDeathCountdownStructuralBar(graphics, length, thickness, color) {
      if (typeof (graphics == null ? void 0 : graphics.drawPoly) === "function") {
        const halfLength = length * 0.5;
        const halfThickness = thickness * 0.5;
        const cut = Math.min(thickness * 0.38, length * 0.14);
        graphics.drawPoly(0, 0, [
          -halfLength + cut,
          -halfThickness,
          halfLength - cut,
          -halfThickness,
          halfLength,
          -halfThickness + cut,
          halfLength,
          halfThickness - cut,
          halfLength - cut,
          halfThickness,
          -halfLength + cut,
          halfThickness,
          -halfLength,
          halfThickness - cut,
          -halfLength,
          -halfThickness + cut
        ], color);
      } else if (typeof (graphics == null ? void 0 : graphics.drawRect) === "function") {
        graphics.drawRect(-length * 0.5, -thickness * 0.5, length, thickness, color);
      }
    }
    paintDeathCountdownStructuralSegment(node, length, thickness, index, state) {
      const graphics = node == null ? void 0 : node.graphics;
      if (!graphics)
        return;
      graphics.clear();
      const energy = this.getDeathCountdownPalette(state);
      const coreHighlight = index % 3 === 0 ? "#FFFFFF" : index % 3 === 1 ? "#F4FAFF" : "#DDEEFF";
      this.drawDeathCountdownStructuralBar(graphics, length + thickness * 0.34, thickness, energy.outline);
      this.drawDeathCountdownStructuralBar(graphics, length + thickness * 0.22, thickness * 0.86, energy.glow);
      this.drawDeathCountdownStructuralBar(graphics, length + thickness * 0.1, thickness * 0.74, "#42D7FF");
      this.drawDeathCountdownStructuralBar(graphics, length, thickness * 0.62, "#F4FAFF");
      this.drawDeathCountdownStructuralBar(
        graphics,
        Math.max(thickness, length - thickness * 0.58),
        thickness * 0.17,
        coreHighlight
      );
    }
    updateDeathCountdownStructuralDigit(elapsed, worldTransition) {
      const layer = this.deathCountdownDigitLayer;
      if (!layer)
        return;
      if (elapsed < BallController.DEATH_DECONSTRUCT_END_MS || worldTransition || elapsed >= BallController.DEATH_WORLD_MATERIALIZE_START_MS && elapsed < BallController.DEATH_CORE_REASSEMBLY_START_MS) {
        layer.visible = false;
        return;
      }
      let digit;
      let energyState;
      let formation;
      let visibility = 1;
      if (elapsed >= BallController.DEATH_CORE_REASSEMBLY_START_MS) {
        digit = 0;
        energyState = "BLUE";
        const coreProgress = Math.max(0, Math.min(
          1,
          (elapsed - BallController.DEATH_CORE_REASSEMBLY_START_MS) / (BallController.DEATH_RECONSTRUCTION_DURATION_MS - BallController.DEATH_CORE_REASSEMBLY_START_MS)
        ));
        const formationProgress = Math.min(1, coreProgress / 0.34);
        formation = 1 - Math.pow(1 - formationProgress, 3);
        visibility = Math.min(1, coreProgress / 0.18);
      } else {
        energyState = "RED";
        const countdownElapsed = Math.min(
          BallController.DEATH_WORLD_MATERIALIZE_START_MS - BallController.DEATH_DECONSTRUCT_END_MS - 1e-3,
          Math.max(0, elapsed - BallController.DEATH_DECONSTRUCT_END_MS)
        );
        const beatIndex = Math.min(2, Math.floor(countdownElapsed / BallController.DEATH_COUNTDOWN_BEAT_MS));
        const beatProgress = (countdownElapsed - beatIndex * BallController.DEATH_COUNTDOWN_BEAT_MS) / BallController.DEATH_COUNTDOWN_BEAT_MS;
        digit = [3, 2, 1][beatIndex];
        formation = 1;
        if (beatProgress < 0.3) {
          const local = beatProgress / 0.3;
          formation = 1 - Math.pow(1 - local, 2);
        } else if (beatProgress > 0.72) {
          const local = (beatProgress - 0.72) / 0.28;
          formation = 1 - (1 - Math.pow(1 - local, 2));
        }
      }
      const geometry = this.getDeathCountdownGeometry();
      const templates = this.getDeathCountdownSegmentTemplate(digit);
      const thickness = geometry.digitHeight * 0.15;
      const repaint = this.deathCountdownDigitValue !== digit || this.deathCountdownDigitEnergyState !== energyState;
      layer.visible = true;
      for (let i = 0; i < this.deathCountdownDigitSegments.length; i++) {
        const node = this.deathCountdownDigitSegments[i];
        const template = templates[i];
        if (!template) {
          node.visible = false;
          continue;
        }
        const [x0, y0, x1, y1] = template;
        const dx = (x1 - x0) * geometry.digitWidth;
        const dy = (y1 - y0) * geometry.digitHeight;
        const length = Math.max(thickness * 1.4, Math.sqrt(dx * dx + dy * dy));
        if (repaint)
          this.paintDeathCountdownStructuralSegment(node, length, thickness, i, energyState);
        const stagger = i * 0.035;
        const localFormation = Math.max(0, Math.min(1, (formation - stagger) / Math.max(1e-3, 1 - stagger)));
        const lock = 1 - Math.pow(1 - localFormation, 3);
        node.visible = true;
        node.x = geometry.stageWidth * 0.5 + (x0 + x1) * 0.5 * geometry.digitWidth + (1 - lock) * (i % 2 === 0 ? -10 - i : 10 + i);
        node.y = geometry.digitCenterY + (y0 + y1) * 0.5 * geometry.digitHeight + (1 - lock) * (i % 3 - 1) * 7;
        node.rotation = Math.atan2(dy, dx) * 180 / Math.PI + (1 - lock) * (i % 2 === 0 ? -8 : 8);
        node.scaleX = 0.68 + lock * 0.32;
        node.scaleY = 0.82 + lock * 0.18;
        node.alpha = visibility * Math.min(1, localFormation * 1.45) * (0.72 + lock * 0.28);
      }
      this.deathCountdownDigitValue = digit;
      this.deathCountdownDigitEnergyState = energyState;
    }
    updateDeathBufferFragments(elapsed, worldTransition = false) {
      this.updateDeathCountdownStructuralDigit(elapsed, worldTransition);
      for (const fragment of this.deathBufferFragments) {
        fragment.node.visible = false;
        fragment.node.alpha = 0;
      }
    }
    destroyDeathBufferFragments() {
      if (this.deathCountdownDigitLayer)
        this.destroyVisualNode(this.deathCountdownDigitLayer);
      this.deathCountdownDigitLayer = null;
      this.deathCountdownDigitSegments = [];
      this.deathCountdownDigitValue = null;
      this.deathCountdownDigitEnergyState = "NONE";
      if (this.deathBufferLayer)
        this.destroyVisualNode(this.deathBufferLayer);
      this.deathBufferLayer = null;
      this.deathBufferFragments = [];
      this.deathCountdownColorState = "NONE";
    }
    createOldWorldDeconstructionVisuals() {
      var _a, _b;
      this.destroyDeathOldWorldVisuals();
      this.deathPlatformFinalVisibility.clear();
      this.deathHazardFinalVisibility.clear();
      for (const platform of this.platforms) {
        const wasVisible = (platform == null ? void 0 : platform.visible) !== false;
        this.deathPlatformFinalVisibility.set(platform, wasVisible);
        if (wasVisible && this.deathOldWorldVisuals.length < BallController.DEATH_OLD_WORLD_FRAGMENT_BUDGET) {
          const parent = platform == null ? void 0 : platform.parent;
          if (parent && typeof parent.addChild === "function") {
            const platformWidth = Math.max(1, Number(platform.width) || 1);
            const platformHeight = Math.max(6, Number(platform.height) || 10);
            for (let piece = 0; piece < 3 && this.deathOldWorldVisuals.length < BallController.DEATH_OLD_WORLD_FRAGMENT_BUDGET; piece++) {
              const fragment = new Laya.Sprite();
              fragment.name = "WPV31_OldWorldFragment_" + String((platform == null ? void 0 : platform.name) || "Platform") + "_" + piece;
              const fragmentWidth = Math.max(8, Math.min(48, platformWidth * (0.2 + piece * 0.035)));
              const fragmentHeight = Math.max(2, Math.min(6, platformHeight * (0.32 + piece * 0.08)));
              const startX = (Number(platform.x) || 0) + Math.max(0, platformWidth - fragmentWidth) * (0.08 + piece * 0.42);
              const startY = (Number(platform.y) || 0) + platformHeight * (0.18 + piece * 0.22);
              fragment.x = startX;
              fragment.y = startY;
              fragment.zOrder = (Number(platform.zOrder) || 0) + 4;
              fragment.mouseEnabled = false;
              fragment.mouseThrough = true;
              fragment.blendMode = "lighter";
              const color = piece % 2 === 0 ? "#35E9FF" : "#8B6CFF";
              if (typeof ((_a = fragment.graphics) == null ? void 0 : _a.drawPoly) === "function") {
                fragment.graphics.drawPoly(
                  0,
                  0,
                  [0, 0, fragmentWidth, fragmentHeight * 0.16, fragmentWidth * 0.83, fragmentHeight, fragmentWidth * 0.08, fragmentHeight * 0.78],
                  color
                );
              } else if (typeof ((_b = fragment.graphics) == null ? void 0 : _b.drawRect) === "function") {
                fragment.graphics.drawRect(0, 0, fragmentWidth, fragmentHeight, color);
              }
              parent.addChild(fragment);
              const direction = piece - 1;
              this.deathOldWorldVisuals.push({
                node: fragment,
                startX,
                startY,
                driftX: direction * (10 + this.deathOldWorldVisuals.length % 5 * 2),
                driftY: 8 + piece * 5 + this.deathOldWorldVisuals.length % 4,
                spin: direction === 0 ? 7 : direction * (11 + piece * 3)
              });
            }
          }
        }
        if (platform)
          platform.visible = false;
      }
      for (const spike of this.spikes) {
        this.deathHazardFinalVisibility.set(spike, (spike == null ? void 0 : spike.visible) !== false);
        if (spike)
          spike.visible = false;
      }
      if (this.disappearHighlightBar)
        this.disappearHighlightBar.visible = false;
    }
    updateDeathDeconstruction(elapsed) {
      const progress = Math.max(0, Math.min(1, elapsed / BallController.DEATH_DECONSTRUCT_END_MS));
      if (this.deathReconstructionAmbience) {
        this.deathReconstructionAmbience.alpha = 0.16 + progress * 0.84;
      }
      this.updateDeathBufferFragments(elapsed);
      this.updateDeathReticle(elapsed);
      const eased = 1 - Math.pow(1 - progress, 2);
      for (let i = 0; i < this.deathOldWorldVisuals.length; i++) {
        const fragment = this.deathOldWorldVisuals[i];
        fragment.node.x = fragment.startX + fragment.driftX * eased;
        fragment.node.y = fragment.startY + fragment.driftY * eased;
        fragment.node.rotation = fragment.spin * eased;
        fragment.node.alpha = Math.max(0, 1 - progress * (0.88 + i % 3 * 0.04));
      }
      const ball = this.owner;
      if (ball)
        ball.visible = true;
      if (this.ballVisualRoot) {
        this.ballVisualRoot.visible = true;
        this.ballVisualRoot.alpha = Math.max(0, 1 - progress);
        const pulse = 1 + Math.sin(progress * Math.PI) * 0.16;
        this.ballVisualRoot.scaleX = this.ballVisualScaleX * pulse;
        this.ballVisualRoot.scaleY = this.ballVisualScaleY * pulse;
      }
    }
    beginDeathReassemblyBuffer() {
      if (this.deathLogicalRespawnDone)
        return;
      this.deathLogicalRespawnDone = true;
      this.respawn();
      const ball = this.owner;
      if (ball)
        ball.visible = false;
      if (this.ballVisualRoot) {
        this.ballVisualRoot.visible = false;
        this.ballVisualRoot.alpha = 0;
      }
      this.destroyDeathOldWorldVisuals();
      this.suppressWorldForDeathReconstruction();
      this.deathReconstructionPhase = "BUFFERING";
    }
    suppressWorldForDeathReconstruction() {
      for (const platform of this.platforms) {
        if (platform)
          platform.visible = false;
      }
      for (const spike of this.spikes) {
        if (spike)
          spike.visible = false;
      }
      if (this.disappearHighlightBar)
        this.disappearHighlightBar.visible = false;
    }
    updateDeathReassemblyBuffer(elapsed) {
      if (!this.deathReconstructionAmbience)
        return;
      this.deathReconstructionAmbience.alpha = 1;
      this.updateDeathBufferFragments(elapsed);
      this.updateDeathReticle(elapsed);
    }
    beginDeathWorldMaterialization() {
      var _a, _b, _c;
      if (this.deathWorldGenerationDone)
        return;
      this.deathWorldGenerationDone = true;
      this.randomizePlatforms();
      this.randomizeHazards();
      this.deathPlatformFinalVisibility.clear();
      const canonicalGround = (_b = (_a = this.deathGroundCanonicalState) == null ? void 0 : _a.platform) != null ? _b : null;
      for (const platform of this.platforms) {
        const finalVisibility = platform === canonicalGround ? ((_c = this.deathGroundCanonicalState) == null ? void 0 : _c.visible) !== false : (platform == null ? void 0 : platform.visible) !== false;
        this.deathPlatformFinalVisibility.set(platform, finalVisibility);
        if (platform)
          platform.visible = false;
      }
      this.deathHazardFinalVisibility.clear();
      for (const spike of this.spikes) {
        this.deathHazardFinalVisibility.set(spike, (spike == null ? void 0 : spike.visible) !== false);
        if (spike)
          spike.visible = false;
      }
      this.createDeathPlatformMaterializationVisuals();
      this.deathReconstructionPhase = "WORLD_MATERIALIZING";
    }
    getDeathMaterializationPlatforms() {
      var _a;
      const ground = (_a = this.platforms.find((platform) => (platform == null ? void 0 : platform.name) === "Ground")) != null ? _a : null;
      const gameplayPlatforms = this.getSortedGamePlatforms();
      return ground ? [ground, ...gameplayPlatforms] : gameplayPlatforms;
    }
    createDeathPlatformMaterializationVisuals() {
      var _a;
      this.destroyDeathPlatformVisuals();
      const sorted = this.getDeathMaterializationPlatforms();
      const ranked = sorted.map((platform, index) => ({
        platform,
        index,
        key: this.getDeathPlatformRevealKey(index)
      })).sort((a, b) => a.key - b.key || a.index - b.index);
      const rankByPlatform = /* @__PURE__ */ new Map();
      ranked.forEach((entry, rank) => rankByPlatform.set(entry.platform, rank));
      for (const platform of sorted) {
        const parent = platform == null ? void 0 : platform.parent;
        if (!parent || typeof parent.addChild !== "function")
          continue;
        const platformIndex = sorted.indexOf(platform);
        const duplicates = [];
        for (let duplicateIndex = 0; duplicateIndex < BallController.DEATH_PLATFORM_DUPLICATE_COUNT; duplicateIndex++) {
          const proxy = new Laya.Sprite();
          proxy.name = "WPV31_PlatformDuplicate_" + String((platform == null ? void 0 : platform.name) || "Platform") + "_" + duplicateIndex;
          proxy.width = Math.max(1, Number(platform.width) || 1);
          proxy.height = Math.max(6, Number(platform.height) || 10);
          proxy.zOrder = (Number(platform.zOrder) || 0) + 4 + duplicateIndex;
          proxy.mouseEnabled = false;
          proxy.mouseThrough = true;
          proxy.blendMode = "lighter";
          const direction = duplicateIndex === 0 ? -1 : 1;
          const offsetX = direction * (6 + this.getDeathVisualUnit(platformIndex, 20 + duplicateIndex) * 5);
          const offsetY = direction * (2.5 + this.getDeathVisualUnit(platformIndex, 24 + duplicateIndex) * 3.5);
          const phase = this.getDeathVisualUnit(platformIndex, 28 + duplicateIndex) * Math.PI * 2;
          proxy.x = (Number(platform.x) || 0) + offsetX;
          proxy.y = (Number(platform.y) || 0) + offsetY;
          parent.addChild(proxy);
          this.paintDeathPlatformMaterializationVisual(proxy, 0, duplicateIndex);
          duplicates.push({ node: proxy, duplicateIndex, offsetX, offsetY, phase });
        }
        this.deathPlatformVisuals.push({
          platform,
          duplicates,
          rank: (_a = rankByPlatform.get(platform)) != null ? _a : 0
        });
      }
    }
    getDeathPlatformRevealKey(index) {
      let value = Math.imul(index + 1, 73244475) ^ Math.imul(this.currentLevel + 17, 668265261);
      value = Math.imul(value ^ value >>> 16, 73244475);
      return (value ^ value >>> 16) >>> 0;
    }
    getDeathPlatformMaterializationProgress(visual, elapsed) {
      const count = Math.max(1, this.deathPlatformVisuals.length);
      const stagger = count <= 1 ? 0 : visual.rank * 90 / (count - 1);
      const localElapsed = elapsed - BallController.DEATH_WORLD_MATERIALIZE_START_MS - stagger;
      return Math.max(0, Math.min(1, localElapsed / 330));
    }
    updateDeathWorldMaterialization(elapsed) {
      const phaseProgress = Math.max(0, Math.min(
        1,
        (elapsed - BallController.DEATH_WORLD_MATERIALIZE_START_MS) / (BallController.DEATH_CORE_REASSEMBLY_START_MS - BallController.DEATH_WORLD_MATERIALIZE_START_MS)
      ));
      if (this.deathReconstructionAmbience) {
        this.deathReconstructionAmbience.alpha = 1 - phaseProgress * 0.26;
      }
      this.updateDeathBufferFragments(elapsed, true);
      this.updateDeathReticle(elapsed);
      for (const visual of this.deathPlatformVisuals) {
        const progress = this.getDeathPlatformMaterializationProgress(visual, elapsed);
        const eased = 1 - Math.pow(1 - progress, 3);
        const remaining = 1 - eased;
        for (const duplicate of visual.duplicates) {
          const jitterScale = remaining * (3.2 + duplicate.duplicateIndex * 1.4);
          duplicate.node.x = (Number(visual.platform.x) || 0) + duplicate.offsetX * remaining + Math.sin(elapsed * (0.034 + duplicate.duplicateIndex * 6e-3) + duplicate.phase) * jitterScale;
          duplicate.node.y = (Number(visual.platform.y) || 0) + duplicate.offsetY * remaining + Math.cos(elapsed * (0.03 + duplicate.duplicateIndex * 5e-3) + duplicate.phase) * jitterScale * 0.68;
          duplicate.node.rotation = (duplicate.duplicateIndex === 0 ? -2.4 : 2.4) * remaining + Math.sin(elapsed * 0.026 + duplicate.phase) * remaining;
          this.paintDeathPlatformMaterializationVisual(
            duplicate.node,
            progress,
            duplicate.duplicateIndex
          );
        }
        visual.platform.visible = progress >= BallController.DEATH_PLATFORM_LOCK_THRESHOLD && this.deathPlatformFinalVisibility.get(visual.platform) !== false;
      }
      for (const spike of this.spikes) {
        const shouldExist = this.deathHazardFinalVisibility.get(spike) === true;
        const owner = this.deathHazardOwnerPlatforms.get(spike);
        const ownerVisual = this.deathPlatformVisuals.find((visual) => visual.platform === owner);
        const ownerProgress = ownerVisual ? this.getDeathPlatformMaterializationProgress(ownerVisual, elapsed) : 0;
        spike.visible = shouldExist && !!ownerVisual && ownerProgress >= BallController.DEATH_PLATFORM_LOCK_THRESHOLD;
      }
    }
    paintDeathPlatformMaterializationVisual(node, progress, duplicateIndex) {
      const graphics = node == null ? void 0 : node.graphics;
      if (!graphics)
        return;
      const width = Math.max(1, Number(node.width) || 1);
      const height = Math.max(6, Number(node.height) || 8);
      const eased = 1 - Math.pow(1 - progress, 3);
      graphics.clear();
      node.visible = progress < 1;
      const convergenceFade = Math.max(0, Math.min(1, (1 - progress) / 0.26));
      node.alpha = (0.18 + eased * 0.34) * convergenceFade;
      const color = duplicateIndex === 0 ? "#42F5FF" : "#8B6CFF";
      if (typeof graphics.drawLine === "function") {
        const sliceCount = 4;
        for (let slice = 0; slice < sliceCount; slice++) {
          const x0 = width * slice / sliceCount + (slice % 2 === 0 ? 0 : 2 * (1 - eased));
          const x1 = width * (slice + 0.72 + eased * 0.22) / sliceCount;
          const y = height * (0.25 + slice % 2 * 0.42);
          graphics.drawLine(x0, y, Math.min(width, x1), y, color, slice === 0 ? 2 : 1);
        }
        graphics.drawLine(0, height * 0.5, width, height * 0.5, color, 1);
      } else if (typeof graphics.drawRect === "function") {
        graphics.drawRect(0, height * 0.2, width, Math.max(2, height * 0.6), color);
      }
    }
    finishDeathWorldMaterialization() {
      for (const [platform, visible] of this.deathPlatformFinalVisibility) {
        if (platform)
          platform.visible = visible;
      }
      for (const [spike, visible] of this.deathHazardFinalVisibility) {
        if (spike)
          spike.visible = visible;
      }
      this.restoreDeathGroundCanonicalState();
      this.destroyDeathPlatformVisuals();
    }
    beginDeathCoreReassembly() {
      if (this.deathCoreReassemblyStarted)
        return;
      this.deathCoreReassemblyStarted = true;
      this.finishDeathWorldMaterialization();
      this.deathReconstructionPhase = "CORE_REASSEMBLING";
      const ball = this.owner;
      this.centerX = this.startX;
      this.centerY = this.startY;
      this.previousY = this.startY;
      if (ball) {
        this.syncBallSprite(ball);
        ball.visible = true;
      }
      if (this.ballVisualRoot) {
        this.ballVisualRoot.visible = true;
        this.ballVisualRoot.alpha = 0;
      }
      if (this.ballAura)
        this.ballAura.visible = false;
      if (this.ballShell)
        this.ballShell.visible = false;
      if (this.ballCore)
        this.ballCore.visible = false;
      if (this.ballCircuits)
        this.ballCircuits.visible = false;
      this.createDeathBallReassemblyShards();
    }
    createDeathBallReassemblyShards() {
      var _a, _b;
      this.destroyDeathBallReassembly();
      const ball = this.owner;
      const parent = ball == null ? void 0 : ball.parent;
      if (!parent || typeof parent.addChild !== "function")
        return;
      const layer = new Laya.Sprite();
      layer.name = "WPV3_CyberCoreReassembly";
      layer.x = this.startX;
      layer.y = this.startY;
      layer.zOrder = (Number(ball.zOrder) || 5) + 1;
      layer.mouseEnabled = false;
      layer.mouseThrough = true;
      layer.blendMode = "lighter";
      parent.addChild(layer);
      this.deathBallReassemblyLayer = layer;
      const colors = ["#42F5FF", "#8B6CFF", "#FFFFFF", "#35E9FF"];
      for (let i = 0; i < BallController.DEATH_BALL_SHARD_COUNT; i++) {
        const shard = new Laya.Sprite();
        shard.name = "WPV3_CoreShard_" + i;
        shard.mouseEnabled = false;
        const size = 2.4 + i % 3 * 0.7;
        const color = colors[i % colors.length];
        if (typeof ((_a = shard.graphics) == null ? void 0 : _a.drawPoly) === "function") {
          shard.graphics.drawPoly(
            -size,
            -size,
            [0, 0, size * 2.2, size * 0.35, size * 1.35, size * 2.1, size * 0.2, size * 1.45],
            color
          );
        } else if (typeof ((_b = shard.graphics) == null ? void 0 : _b.drawRect) === "function") {
          shard.graphics.drawRect(-size * 0.5, -size * 0.5, size, size, color);
        }
        const angle = i * Math.PI * 2 / BallController.DEATH_BALL_SHARD_COUNT + i % 2 * 0.17;
        const distance = 23 + i % 3 * 7;
        const startX = Math.cos(angle) * distance;
        const startY = Math.sin(angle) * distance;
        shard.x = startX;
        shard.y = startY;
        layer.addChild(shard);
        this.deathBallShards.push({
          node: shard,
          startX,
          startY,
          spin: i % 2 === 0 ? 150 + i * 11 : -155 - i * 9
        });
      }
    }
    updateDeathCoreReassembly(elapsed) {
      const progress = Math.max(0, Math.min(
        1,
        (elapsed - BallController.DEATH_CORE_REASSEMBLY_START_MS) / (BallController.DEATH_RECONSTRUCTION_DURATION_MS - BallController.DEATH_CORE_REASSEMBLY_START_MS)
      ));
      const eased = 1 - Math.pow(1 - progress, 2);
      if (this.deathReconstructionAmbience) {
        this.deathReconstructionAmbience.alpha = 1;
        const dim = typeof this.deathReconstructionAmbience.getChildByName === "function" ? this.deathReconstructionAmbience.getChildByName("WPV3_GlobalDim") : null;
        if (dim)
          dim.alpha = 0.53 * (1 - eased);
      }
      this.updateDeathBufferFragments(elapsed);
      this.updateDeathReticle(elapsed);
      for (const shard of this.deathBallShards) {
        const remaining = 1 - eased;
        shard.node.x = shard.startX * remaining;
        shard.node.y = shard.startY * remaining;
        shard.node.rotation = shard.spin * progress;
        shard.node.alpha = Math.max(0, 1 - Math.max(0, progress - 0.58) / 0.34);
      }
      if (this.ballVisualRoot) {
        this.ballVisualRoot.visible = true;
        this.ballVisualRoot.alpha = Math.max(0, Math.min(1, (progress - 0.2) / 0.42));
        const scale = 0.78 + eased * 0.22;
        this.ballVisualRoot.scaleX = scale;
        this.ballVisualRoot.scaleY = scale;
      }
      if (this.ballCore) {
        this.ballCore.visible = progress >= 0.28;
        this.ballCore.alpha = Math.max(0, Math.min(1, (progress - 0.28) / 0.2));
      }
      if (this.ballShell) {
        this.ballShell.visible = progress >= 0.48;
        this.ballShell.alpha = Math.max(0, Math.min(1, (progress - 0.48) / 0.24));
      }
      if (this.ballCircuits) {
        this.ballCircuits.visible = progress >= 0.66;
        this.ballCircuits.alpha = Math.max(0, Math.min(1, (progress - 0.66) / 0.2));
      }
      if (this.ballAura) {
        this.ballAura.visible = progress >= 0.78;
        this.ballAura.alpha = Math.max(0, Math.min(0.28, (progress - 0.78) / 0.22 * 0.28));
      }
    }
    updateDeathReconstruction(now = this.getWpBNow()) {
      if (this.deathReconstructionPhase === "IDLE")
        return;
      const elapsed = Math.max(0, now - this.deathReconstructionStartedAt);
      if (elapsed >= BallController.DEATH_DECONSTRUCT_END_MS && !this.deathLogicalRespawnDone) {
        this.beginDeathReassemblyBuffer();
      }
      if (elapsed >= BallController.DEATH_WORLD_MATERIALIZE_START_MS && !this.deathWorldGenerationDone) {
        this.beginDeathWorldMaterialization();
      }
      if (elapsed >= BallController.DEATH_CORE_REASSEMBLY_START_MS && !this.deathCoreReassemblyStarted) {
        this.beginDeathCoreReassembly();
      }
      if (elapsed >= BallController.DEATH_RECONSTRUCTION_DURATION_MS) {
        this.completeDeathReconstruction();
        return;
      }
      this.updateLevelDifficultyBar();
      switch (this.deathReconstructionPhase) {
        case "DECONSTRUCTING":
          this.updateDeathDeconstruction(elapsed);
          break;
        case "BUFFERING":
          this.updateDeathReassemblyBuffer(elapsed);
          break;
        case "WORLD_MATERIALIZING":
          this.updateDeathWorldMaterialization(elapsed);
          break;
        case "CORE_REASSEMBLING":
          this.updateDeathCoreReassembly(elapsed);
          break;
      }
    }
    completeDeathReconstruction() {
      this.finishDeathWorldMaterialization();
      this.restoreCanonicalBallAfterReconstruction();
      this.clearDeathReconstruction();
    }
    restoreCanonicalBallAfterReconstruction() {
      const ball = this.owner;
      if (ball) {
        ball.visible = true;
        this.centerX = this.startX;
        this.centerY = this.startY;
        this.previousY = this.startY;
        this.syncBallSprite(ball);
      }
      this.vx = 0;
      this.vy = 0;
      this.ballVisualScaleX = 1;
      this.ballVisualScaleY = 1;
      if (this.ballVisualRoot) {
        this.ballVisualRoot.visible = true;
        this.ballVisualRoot.alpha = 1;
        this.ballVisualRoot.scaleX = 1;
        this.ballVisualRoot.scaleY = 1;
      }
      if (this.ballAura) {
        this.ballAura.visible = true;
        this.ballAura.alpha = 0.22;
      }
      if (this.ballShell) {
        this.ballShell.visible = true;
        this.ballShell.alpha = 1;
      }
      if (this.ballCore) {
        this.ballCore.visible = true;
        this.ballCore.alpha = 1;
      }
      if (this.ballCircuits) {
        this.ballCircuits.visible = true;
        this.ballCircuits.alpha = 1;
      }
      this.ballTrailHistory = [];
      for (const trail of this.ballTrailNodes) {
        trail.visible = true;
        trail.alpha = 0;
      }
    }
    destroyDeathOldWorldVisuals() {
      for (const fragment of this.deathOldWorldVisuals) {
        this.destroyVisualNode(fragment.node);
      }
      this.deathOldWorldVisuals = [];
    }
    destroyDeathPlatformVisuals() {
      for (const visual of this.deathPlatformVisuals) {
        for (const duplicate of visual.duplicates) {
          this.destroyVisualNode(duplicate.node);
        }
      }
      this.deathPlatformVisuals = [];
    }
    destroyDeathBallReassembly() {
      if (this.deathBallReassemblyLayer) {
        this.destroyVisualNode(this.deathBallReassemblyLayer);
      }
      this.deathBallReassemblyLayer = null;
      this.deathBallShards = [];
    }
    clearDeathReconstruction() {
      const wasActive = this.deathReconstructionPhase !== "IDLE" || this.deathReconstructionUntilMs > 0 || !!this.deathReconstructionAmbience;
      this.destroyDeathBufferFragments();
      this.destroyDeathReticle();
      if (this.deathReconstructionAmbience) {
        this.destroyVisualNode(this.deathReconstructionAmbience);
      }
      this.deathReconstructionAmbience = null;
      this.destroyDeathOldWorldVisuals();
      this.destroyDeathPlatformVisuals();
      this.destroyDeathBallReassembly();
      for (const [platform, visible] of this.deathPlatformFinalVisibility) {
        if (platform)
          platform.visible = visible;
      }
      for (const [spike, visible] of this.deathHazardFinalVisibility) {
        if (spike)
          spike.visible = visible;
      }
      this.restoreDeathGroundCanonicalState();
      if (wasActive) {
        const ball = this.owner;
        if (ball)
          ball.visible = this.deathBallWasVisible;
        if (this.ballVisualRoot) {
          this.ballVisualRoot.visible = true;
          this.ballVisualRoot.alpha = 1;
          this.ballVisualRoot.scaleX = this.ballVisualScaleX;
          this.ballVisualRoot.scaleY = this.ballVisualScaleY;
        }
        if (this.ballAura)
          this.ballAura.visible = true;
        if (this.ballShell)
          this.ballShell.visible = true;
        if (this.ballCore)
          this.ballCore.visible = true;
        if (this.ballCircuits)
          this.ballCircuits.visible = true;
        for (const trail of this.ballTrailNodes) {
          trail.visible = true;
        }
      }
      this.deathPlatformFinalVisibility.clear();
      this.deathHazardFinalVisibility.clear();
      this.deathHazardOwnerPlatforms.clear();
      this.deathGroundCanonicalState = null;
      this.deathReconstructionPhase = "IDLE";
      this.deathReconstructionStartedAt = 0;
      this.deathReconstructionUntilMs = 0;
      this.deathLogicalRespawnDone = false;
      this.deathWorldGenerationDone = false;
      this.deathCoreReassemblyStarted = false;
      this.deathBallWasVisible = true;
      this.levelDeathRollbackDisplay = null;
      if (wasActive) {
        this.updateLevelDifficultyBar();
      }
    }
    captureFatalVisualPosition() {
      const ball = this.owner;
      if (!ball)
        return;
      ball.x = this.centerX;
      ball.y = this.centerY;
    }
    // Normal death enters the locked V3 world reconstruction lifecycle.
    handleDeath() {
      if (this.isHandlingDeath)
        return;
      if (this.deathReconstructionPhase !== "IDLE")
        return;
      if (ScoreManager.instance.isWon())
        return;
      this.isHandlingDeath = true;
      this.captureFatalVisualPosition();
      ScoreManager.instance.clearTransientFeedback();
      SfxManager.playDeath();
      this.startDeathFeedback();
      try {
        this.startDeathReconstruction();
      } finally {
        this.isHandlingDeath = false;
      }
    }
    startDeathFeedback() {
      this.clearDeathFeedback();
      const ball = this.owner;
      this.startScreenShake();
      this.showDeathFlash();
      this.spawnDeathFragments(Number(ball == null ? void 0 : ball.x) || this.centerX, Number(ball == null ? void 0 : ball.y) || this.centerY);
    }
    startScreenShake() {
      var _a;
      this.stopScreenShake();
      const target = (_a = this.owner) == null ? void 0 : _a.parent;
      if (!target || target === Laya.stage)
        return;
      this.shakeTarget = target;
      this.shakeBaseX = Number(target.x) || 0;
      this.shakeBaseY = Number(target.y) || 0;
      this.shakeStartedAt = this.getWpBNow();
    }
    updateScreenShake(now) {
      const target = this.shakeTarget;
      if (!target)
        return;
      const elapsed = Math.max(0, now - this.shakeStartedAt);
      if (elapsed >= 125) {
        this.stopScreenShake();
        return;
      }
      const frame = Math.floor(elapsed / 16);
      const strength = 3.2 * (1 - elapsed / 125);
      target.x = this.shakeBaseX + Math.sin((frame + 1) * 2.17) * strength;
      target.y = this.shakeBaseY + Math.cos((frame + 1) * 2.83) * strength * 0.7;
    }
    stopScreenShake() {
      const target = this.shakeTarget;
      if (target) {
        try {
          target.x = this.shakeBaseX;
          target.y = this.shakeBaseY;
        } catch (_) {
        }
      }
      this.shakeTarget = null;
      this.shakeStartedAt = 0;
    }
    showDeathFlash() {
      var _a;
      this.removeDeathFlash();
      if (!Laya.stage)
        return;
      const flash = new Laya.Sprite();
      flash.name = "WPB_DeathFlash";
      flash.zOrder = 9990;
      flash.mouseEnabled = false;
      flash.mouseThrough = true;
      flash.width = Math.max(1, Laya.stage.width || 1);
      flash.height = Math.max(1, Laya.stage.height || 1);
      flash.alpha = 0.34;
      if (typeof ((_a = flash.graphics) == null ? void 0 : _a.drawRect) === "function") {
        flash.graphics.drawRect(0, 0, flash.width, flash.height, "#FF1744");
      }
      Laya.stage.addChild(flash);
      this.deathFlash = flash;
      this.deathFlashStartedAt = this.getWpBNow();
    }
    updateDeathFlash(now) {
      if (!this.deathFlash)
        return;
      const elapsed = Math.max(0, now - this.deathFlashStartedAt);
      if (elapsed >= 110) {
        this.removeDeathFlash();
        return;
      }
      this.deathFlash.alpha = 0.34 * (1 - elapsed / 110);
    }
    removeDeathFlash() {
      if (this.deathFlash) {
        this.destroyVisualNode(this.deathFlash);
      }
      this.deathFlash = null;
      this.deathFlashStartedAt = 0;
    }
    spawnDeathFragments(worldX, worldY) {
      var _a, _b;
      this.removeDeathFragments();
      const ball = this.owner;
      const parent = ball == null ? void 0 : ball.parent;
      if (!parent || typeof parent.addChild !== "function")
        return;
      const layer = new Laya.Sprite();
      layer.name = "WPV3_DeathCoreFragments";
      layer.zOrder = (Number(ball.zOrder) || 5) + 2;
      layer.mouseEnabled = false;
      layer.mouseThrough = true;
      parent.addChild(layer);
      this.deathFragmentLayer = layer;
      this.deathFragmentStartedAt = this.getWpBNow();
      this.deathFragmentOriginX = worldX;
      this.deathFragmentOriginY = worldY;
      this.deathFragments = [];
      const colors = ["#42F5FF", "#9B6CFF", "#FFFFFF", "#35E9FF"];
      for (let i = 0; i < BallController.DEATH_BALL_SHARD_COUNT; i++) {
        const fragment = new Laya.Sprite();
        fragment.name = "WPV3_DeathCoreFragment_" + i;
        fragment.mouseEnabled = false;
        const size = 2.3 + i % 3 * 0.8;
        const color = colors[i % colors.length];
        if (typeof ((_a = fragment.graphics) == null ? void 0 : _a.drawPoly) === "function") {
          fragment.graphics.drawPoly(
            -size,
            -size,
            [0, 0, size * 2.2, size * 0.35, size * 1.35, size * 2.1, size * 0.2, size * 1.45],
            color
          );
        } else if (typeof ((_b = fragment.graphics) == null ? void 0 : _b.drawRect) === "function") {
          fragment.graphics.drawRect(-size * 0.5, -size * 0.5, size, size, color);
        }
        fragment.x = worldX;
        fragment.y = worldY;
        layer.addChild(fragment);
        const angle = i * Math.PI * 2 / BallController.DEATH_BALL_SHARD_COUNT + i % 2 * 0.16;
        const speed = 58 + i % 4 * 14;
        this.deathFragments.push({
          node: fragment,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          spin: i % 2 === 0 ? 190 + i * 9 : -195 - i * 7
        });
      }
    }
    updateDeathFragments(now) {
      if (!this.deathFragmentLayer)
        return;
      const elapsedMs = Math.max(0, now - this.deathFragmentStartedAt);
      if (elapsedMs >= BallController.DEATH_DECONSTRUCT_END_MS) {
        this.removeDeathFragments();
        return;
      }
      const elapsed = elapsedMs / 1e3;
      const life = 1 - elapsedMs / BallController.DEATH_DECONSTRUCT_END_MS;
      for (const fragment of this.deathFragments) {
        fragment.node.x = this.deathFragmentOriginX + fragment.vx * elapsed;
        fragment.node.y = this.deathFragmentOriginY + fragment.vy * elapsed;
        fragment.node.rotation = fragment.spin * elapsed;
        fragment.node.alpha = life;
      }
    }
    removeDeathFragments() {
      if (this.deathFragmentLayer) {
        this.destroyVisualNode(this.deathFragmentLayer);
      }
      this.deathFragmentLayer = null;
      this.deathFragmentStartedAt = 0;
      this.deathFragments = [];
    }
    updateDeathFeedback() {
      const now = this.getWpBNow();
      this.updateScreenShake(now);
      this.updateDeathFlash(now);
      this.updateDeathFragments(now);
    }
    clearDeathFeedback() {
      this.stopScreenShake();
      this.removeDeathFlash();
      this.removeDeathFragments();
    }
    getWpBNow() {
      var _a;
      const timerValue = Number((_a = Laya.timer) == null ? void 0 : _a.currTimer);
      return Number.isFinite(timerValue) ? timerValue : Date.now();
    }
    getVisualStagePoint(node, localX, localY) {
      if (node && typeof node.localToGlobal === "function" && Laya.Point) {
        try {
          const converted = node.localToGlobal(new Laya.Point(localX, localY), true);
          if (converted && Number.isFinite(converted.x) && Number.isFinite(converted.y)) {
            return { x: converted.x, y: converted.y };
          }
        } catch (_) {
        }
      }
      let x = localX;
      let y = localY;
      let current = node;
      while (current && current !== Laya.stage) {
        x += Number(current.x) || 0;
        y += Number(current.y) || 0;
        current = current.parent;
      }
      return { x, y };
    }
    destroyVisualNode(node) {
      if (!node)
        return;
      try {
        if (typeof node.removeSelf === "function")
          node.removeSelf();
      } catch (_) {
      }
      try {
        if (typeof node.destroy === "function")
          node.destroy(true);
      } catch (_) {
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
      this.syncBallSprite(this.owner);
      this.vx = 0;
      this.vy = 0;
      this.onGround = false;
      this.groundPlatform = null;
      this.resetPlatformLandingImpacts();
      this.platformsActive = false;
      this.deathEnabled = false;
      this.syncGroundVisual();
      ScoreManager.instance.reset();
      this.resetBallEnergyVisual(this.currentLevel, 0);
      this.clearDisappearRecoveryStates();
      for (const [p, cfg] of this.disappearConfigs) {
        cfg.state = "idle";
        cfg.triggerAt = 0;
        p.visible = true;
        this.repaintPlatformColor(p, "#00cc00");
        this.resetDisappearRecoveryState(p);
      }
    }
    restartCurrentAttempt() {
      this.finishGameplayPauseAccounting();
      this.activeGameplayPauseStartedAt = null;
      this.activeGameplayPauseAccumulatedMs = 0;
      this.clearDeathReconstruction();
      this.clearDeathFeedback();
      this.respawn();
    }
    resetRunToLevelOne() {
      this.finishGameplayPauseAccounting();
      this.activeGameplayPauseStartedAt = null;
      this.activeGameplayPauseAccumulatedMs = 0;
      this.clearDeathReconstruction();
      this.clearDeathFeedback();
      this.currentLevel = 1;
      this.respawn();
      this.randomizePlatforms();
      this.randomizeHazards();
      this.updateLevelDifficultyBar();
    }
    // 胜利后进入下一关：复用 respawn() 的全部重置，再重新随机平台布局
    // 胜利后按 R 重开本局，并切换到下一关的随机平台布局
    restartGame(showTransition = true) {
      console.log("Restart game");
      if (this.currentLevel >= this.maxLevel) {
        console.warn("Final level completion is owned by GAME_COMPLETE; wraparound blocked.");
        return false;
      }
      this.clearDeathReconstruction();
      this.clearDeathFeedback();
      this.currentLevel++;
      this.respawn();
      this.randomizePlatforms();
      this.randomizeHazards();
      this.updateLevelDifficultyBar();
      if (showTransition)
        this.beginLevelTransition();
      return true;
    }
    advanceAfterWin(showTransition = true) {
      if (!ScoreManager.instance.isWon()) {
        return false;
      }
      return this.restartGame(showTransition);
    }
    // 复用 SCORE HUD 的切角框与分段格语言，只展示四格成长进度。
    createLevelDifficultyBar() {
      if (this.levelDifficultyHud)
        return;
      const hudWidth = 202;
      const hudHeight = 40;
      this.levelDifficultyHud = new Laya.Sprite();
      this.levelDifficultyHud.x = 40;
      this.levelDifficultyHud.y = 82;
      this.levelDifficultyHud.width = hudWidth;
      this.levelDifficultyHud.height = hudHeight;
      this.levelDifficultyHud.zOrder = 9999;
      this.levelDifficultyHud.mouseEnabled = false;
      const background = new Laya.Sprite();
      background.alpha = 0.9;
      background.graphics.drawPoly(
        0,
        0,
        [
          8,
          0,
          hudWidth - 8,
          0,
          hudWidth,
          8,
          hudWidth,
          hudHeight - 8,
          hudWidth - 8,
          hudHeight,
          8,
          hudHeight,
          0,
          hudHeight - 8,
          0,
          8
        ],
        "#06111F",
        "#1A7188",
        1
      );
      this.levelDifficultyHud.addChild(background);
      const frame = new Laya.Sprite();
      frame.graphics.drawLine(14, 0, 92, 0, "#35E9FF", 1.5);
      frame.graphics.drawLine(8, hudHeight - 1, 42, hudHeight - 1, "#7C4DFF", 1);
      frame.graphics.drawLine(hudWidth - 10, 4, hudWidth - 5, 9, "#35E9FF", 1);
      frame.graphics.drawLine(62, 7, 62, hudHeight - 7, "#164B5A", 1);
      this.levelDifficultyHud.addChild(frame);
      const levelLabel = new Laya.Text();
      levelLabel.name = "WPH_LevelLabel";
      levelLabel.text = "LEVEL " + this.currentLevel;
      levelLabel.font = "Arial";
      levelLabel.fontSize = 12;
      levelLabel.color = "#78D7E8";
      levelLabel.bold = true;
      levelLabel.x = 8;
      levelLabel.y = 5;
      levelLabel.width = 52;
      levelLabel.height = 30;
      levelLabel.align = "left";
      levelLabel.valign = "middle";
      levelLabel.mouseEnabled = false;
      this.levelDifficultyHud.addChild(levelLabel);
      this.levelDifficultyCells = [];
      this.levelDifficultyNumerals = [];
      const cellStartX = 67;
      const cellWidth = 28;
      const cellHeight = 20;
      const cellGap = 4;
      for (let i = 0; i < this.maxLevel; i++) {
        const cell = new Laya.Sprite();
        cell.name = "WPH_LevelCell_" + (i + 1);
        cell.x = cellStartX + i * (cellWidth + cellGap);
        cell.y = 10;
        cell.width = cellWidth;
        cell.height = cellHeight;
        cell.mouseEnabled = false;
        const numeral = new Laya.Text();
        numeral.name = "WPH_LevelRoman_" + (i + 1);
        numeral.font = "Arial";
        numeral.fontSize = 14;
        numeral.bold = true;
        numeral.stroke = 1;
        numeral.strokeColor = "#031019";
        numeral.width = cellWidth;
        numeral.height = cellHeight;
        numeral.align = "center";
        numeral.valign = "middle";
        numeral.mouseEnabled = false;
        cell.addChild(numeral);
        this.levelDifficultyHud.addChild(cell);
        this.levelDifficultyCells.push(cell);
        this.levelDifficultyNumerals.push(numeral);
      }
      Laya.stage.addChild(this.levelDifficultyHud);
      this.updateLevelDifficultyBar();
    }
    // 当前格与 Cyber Ball 共用调色板和成长进度；已完成格只取该关终态色。
    updateLevelDifficultyBar() {
      var _a, _b;
      const palettes = BallController.BALL_ENERGY_CHECKPOINT_PALETTES;
      const romanNumerals = ["I", "II", "III", "IV"];
      const levelLabel = (_b = (_a = this.levelDifficultyHud) == null ? void 0 : _a.getChildByName) == null ? void 0 : _b.call(_a, "WPH_LevelLabel");
      if (levelLabel)
        levelLabel.text = "LEVEL " + this.currentLevel;
      for (let i = 0; i < this.levelDifficultyCells.length; i++) {
        const cell = this.levelDifficultyCells[i];
        const numeral = this.levelDifficultyNumerals[i];
        const cellWidth = Math.max(1, Number(cell == null ? void 0 : cell.width) || 28);
        const cellHeight = Math.max(1, Number(cell == null ? void 0 : cell.height) || 20);
        const level = i + 1;
        const isCompleted = level < this.currentLevel;
        const isCurrent = level === this.currentLevel;
        const startIndex = Math.max(0, Math.min(palettes.length - 2, level - 1));
        const start = palettes[startIndex];
        const target = palettes[startIndex + 1];
        const currentDisplayProgress = this.resolveLevelDeathRollbackDisplayProgress(level);
        const growthProgress = isCompleted ? 1 : isCurrent ? currentDisplayProgress : 0;
        const fillFrom = start.coreOuter.map((channel) => Math.round(channel * 0.44));
        const fillTo = target.coreOuter.map((channel) => Math.round(channel * 0.44));
        const strokeFrom = start.coreOuterStroke.map((channel) => Math.round(channel * 0.76));
        const strokeTo = target.coreOuterStroke.map((channel) => Math.round(channel * 0.76));
        cell.graphics.clear();
        cell.alpha = isCurrent ? 1 : isCompleted ? 0.88 : 0.68;
        cell.graphics.drawPoly(
          0,
          0,
          [0, 0, cellWidth - 4, 0, cellWidth, 4, cellWidth, cellHeight, 0, cellHeight],
          isCompleted || isCurrent ? this.mixBallEnergyColor(fillFrom, fillTo, growthProgress) : "#081822",
          isCompleted || isCurrent ? this.mixBallEnergyColor(strokeFrom, strokeTo, growthProgress) : "#244956",
          isCurrent ? 1.6 : 1
        );
        if (isCompleted || isCurrent) {
          const growthWidth = isCompleted ? cellWidth - 6 : Math.max(2, Math.round((cellWidth - 6) * growthProgress));
          cell.graphics.drawLine(
            3,
            cellHeight - 3,
            3 + growthWidth,
            cellHeight - 3,
            this.mixBallEnergyColor(start.circuitPrimary, target.circuitPrimary, growthProgress),
            1
          );
        }
        if (numeral) {
          numeral.text = isCurrent ? romanNumerals[i] : "";
          numeral.color = this.mixBallEnergyColor(
            start.circuitNode,
            target.circuitNode,
            growthProgress
          );
        }
      }
    }
    playLevelHudEntrance() {
      var _a, _b, _c;
      this.finishLevelHudEntrance();
      const hud = this.levelDifficultyHud;
      if (!hud)
        return;
      hud.x = 10;
      hud.alpha = 0;
      const startedAt = Number.isFinite(Number((_a = Laya.timer) == null ? void 0 : _a.currTimer)) ? Number(Laya.timer.currTimer) : Date.now();
      let finished = false;
      const update = () => {
        var _a2;
        if (finished || hud.destroyed) {
          finish();
          return;
        }
        const now = Number.isFinite(Number((_a2 = Laya.timer) == null ? void 0 : _a2.currTimer)) ? Number(Laya.timer.currTimer) : Date.now();
        const normalized = Math.min(1, Math.max(0, now - startedAt) / 320);
        const eased = 1 - Math.pow(1 - normalized, 3);
        hud.x = 10 + 30 * eased;
        hud.alpha = eased;
        if (normalized >= 1)
          finish();
      };
      const finish = () => {
        var _a2;
        if (finished)
          return;
        finished = true;
        if (typeof ((_a2 = Laya.timer) == null ? void 0 : _a2.clear) === "function")
          Laya.timer.clear(hud, update);
        hud.x = 40;
        hud.alpha = 1;
        if (this.levelHudEntranceCleanup === finish)
          this.levelHudEntranceCleanup = null;
      };
      this.levelHudEntranceCleanup = finish;
      update();
      if (typeof ((_b = Laya.timer) == null ? void 0 : _b.frameLoop) === "function") {
        Laya.timer.frameLoop(1, hud, update);
      } else if (typeof ((_c = Laya.timer) == null ? void 0 : _c.once) === "function") {
        Laya.timer.once(320, hud, finish);
      }
    }
    finishLevelHudEntrance() {
      const cleanup = this.levelHudEntranceCleanup;
      this.levelHudEntranceCleanup = null;
      if (cleanup)
        cleanup();
      if (this.levelDifficultyHud) {
        this.levelDifficultyHud.x = 40;
        this.levelDifficultyHud.alpha = 1;
      }
    }
    resolveLevelDeathRollbackDisplayProgress(level) {
      const authoritativeProgress = Math.max(0, Math.min(1, this.ballEnergyVisualProgress));
      const rollback = this.levelDeathRollbackDisplay;
      if (!rollback || rollback.level !== level || this.deathReconstructionPhase === "IDLE" || this.deathReconstructionStartedAt <= 0) {
        return authoritativeProgress;
      }
      const elapsed = Math.max(0, this.getWpBNow() - this.deathReconstructionStartedAt);
      const timelineProgress = Math.max(
        0,
        Math.min(1, elapsed / BallController.DEATH_RECONSTRUCTION_DURATION_MS)
      );
      const easedProgress = timelineProgress * timelineProgress * (3 - 2 * timelineProgress);
      return rollback.fromProgress * (1 - easedProgress);
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
      this.initializeVisualLayer();
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
        existingSpike.mouseEnabled = false;
        this.paintSpikeVisual(existingSpike);
        this.spikes.push(existingSpike);
        return;
      }
      const spike = new Laya.Sprite();
      spike.name = "Spike_1";
      spike.visible = false;
      spike.width = 80;
      spike.height = 8;
      spike.zOrder = (platform.zOrder || 0) + 1;
      spike.mouseEnabled = false;
      this.paintSpikeVisual(spike);
      platformParent.addChild(spike);
      this.spikes.push(spike);
    }
    // Level 4 尖刺随机化：只放在非移动、非消失的 Platform_1~Platform_5 上。
    randomizeHazards() {
      this.createHazardsIfNeeded();
      this.deathHazardOwnerPlatforms.clear();
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
      this.deathHazardOwnerPlatforms.set(spike, target);
      spike.visible = true;
      this.paintSpikeVisual(spike);
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
      const widestPlatform = sorted.reduce(
        (width, platform) => Math.max(width, Number(platform == null ? void 0 : platform.width) || 200),
        0
      );
      const playfieldWidth = Math.max(0, xMax - xMin);
      const desiredGenerationMargin = Math.min(
        widestPlatform * 0.375,
        Math.max(0, maxNeighborDX - widestPlatform)
      );
      const maximumGenerationMargin = Math.max(0, (playfieldWidth - widestPlatform) * 0.5);
      const platformGenerationMargin = Math.min(desiredGenerationMargin, maximumGenerationMargin);
      const generationBandMin = xMin + platformGenerationMargin;
      const generationBandMax = xMax - platformGenerationMargin;
      const compositionCenterX = (generationBandMin + generationBandMax) * 0.5;
      const compositionHalfSpan = Math.max(
        1,
        (generationBandMax - generationBandMin - widestPlatform) * 0.5
      );
      const compositionBalanceGain = 6;
      const sideOccupancyBalanceGain = 2;
      const compositionOutwardGain = 0.55;
      const staticStreakPressure = 3.6;
      const movingStreakPressure = 2.6;
      const staticAntiAlternationPressure = 0.9;
      const movingAntiAlternationPressure = 0.65;
      const maximumCompositionPressure = 5;
      let prevCenterX = this.startX;
      let lastHorizontalDirection = 0;
      let sameDirectionStreak = 0;
      let alternatingDirectionStreak = 0;
      let normalizedCompositionOffset = 0;
      let leftRightOccupancyBalance = 0;
      let sampledPlatformCount = 0;
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
        const generationCenterMin = generationBandMin + halfWidth;
        const generationCenterMax = generationBandMax - halfWidth;
        let lo = Math.max(centerMin, prevCenterX - maxNeighborDX);
        let hi = Math.min(centerMax, prevCenterX + maxNeighborDX);
        let centerX;
        if (i === 0) {
          centerX = this.pickPlatform1CenterX(
            centerMin,
            centerMax,
            halfWidth,
            generationCenterMin,
            generationCenterMax
          );
        } else {
          if (lo > hi) {
            lo = centerMin;
            hi = centerMax;
          }
          const bandLo = Math.max(lo, generationCenterMin);
          const bandHi = Math.min(hi, generationCenterMax);
          const sampleLo = bandLo <= bandHi ? bandLo : lo;
          const sampleHi = bandLo <= bandHi ? bandHi : hi;
          const randomSample = this.spreadPlatformSample(this.rng());
          const movingComposition = movingIndices.has(i);
          const streakPressure = movingComposition ? movingStreakPressure : staticStreakPressure;
          const antiAlternationPressure = movingComposition ? movingAntiAlternationPressure : staticAntiAlternationPressure;
          const meanCompositionOffset = sampledPlatformCount > 0 ? normalizedCompositionOffset / sampledPlatformCount : 0;
          const compositionPressure = -meanCompositionOffset * compositionBalanceGain - leftRightOccupancyBalance * sideOccupancyBalanceGain;
          const rhythmPressure = lastHorizontalDirection === 0 ? 0 : sameDirectionStreak >= 2 ? -lastHorizontalDirection * streakPressure : alternatingDirectionStreak >= 1 ? lastHorizontalDirection * antiAlternationPressure : 0;
          const combinedPressure = Math.max(
            -maximumCompositionPressure,
            Math.min(maximumCompositionPressure, compositionPressure + rhythmPressure)
          );
          const biasedSample = this.biasPlatformSample(randomSample, combinedPressure);
          const sampledCenterX = sampleLo + biasedSample * (sampleHi - sampleLo);
          const normalizedSampleOffset = Math.max(
            -1,
            Math.min(1, (sampledCenterX - compositionCenterX) / compositionHalfSpan)
          );
          const outwardDirection = normalizedSampleOffset === 0 ? biasedSample < 0.5 ? -1 : 1 : Math.sign(normalizedSampleOffset);
          const outwardRoom = outwardDirection < 0 ? sampledCenterX - sampleLo : sampleHi - sampledCenterX;
          const balanceDamping = Math.max(0.15, 1 - Math.abs(meanCompositionOffset));
          centerX = sampledCenterX + outwardDirection * outwardRoom * compositionOutwardGain * (1 - Math.abs(normalizedSampleOffset)) * balanceDamping;
        }
        platform.x = Math.round(centerX - halfWidth);
        const horizontalDirection = Math.sign(centerX - prevCenterX);
        if (horizontalDirection !== 0) {
          if (horizontalDirection === lastHorizontalDirection) {
            sameDirectionStreak++;
            alternatingDirectionStreak = 0;
          } else {
            alternatingDirectionStreak = lastHorizontalDirection === 0 ? 0 : alternatingDirectionStreak + 1;
            lastHorizontalDirection = horizontalDirection;
            sameDirectionStreak = 1;
          }
        }
        const normalizedCenterOffset = Math.max(
          -1,
          Math.min(1, (centerX - compositionCenterX) / compositionHalfSpan)
        );
        normalizedCompositionOffset += normalizedCenterOffset;
        leftRightOccupancyBalance += Math.sign(normalizedCenterOffset);
        sampledPlatformCount++;
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
      this.refreshPlatformVisuals();
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
      this.clearDisappearRecoveryStates();
      this.disappearConfigs.clear();
      if (this.currentLevel !== 3 && this.currentLevel !== 4)
        return;
      const candidates = sorted.slice(0, -1);
      if (candidates.length === 0)
        return;
      const target = candidates[Math.floor(this.rng() * candidates.length)];
      this.disappearConfigs.set(target, { state: "idle", triggerAt: 0 });
      this.resetDisappearRecoveryState(target);
      this.repaintPlatformColor(target, "#00ff00");
    }
    // 为 Platform_1 选一个中心 X：避开出生点正下方，且不离出生点太远
    pickPlatform1CenterX(centerMin, centerMax, halfWidth, generationCenterMin = centerMin, generationCenterMax = centerMax) {
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
      const bandRanges = ranges.map(([lo, hi]) => [
        Math.max(lo, generationCenterMin),
        Math.min(hi, generationCenterMax)
      ]).filter(([lo, hi]) => lo <= hi);
      const sampledRanges = bandRanges.length > 0 ? bandRanges : ranges;
      if (sampledRanges.length > 0) {
        const [lo, hi] = sampledRanges[Math.floor(this.rng() * sampledRanges.length)];
        const randomSample = this.spreadPlatformSample(this.rng());
        return lo + randomSample * (hi - lo);
      }
      let fallback = this.startX + minOffset;
      if (fallback > centerMax)
        fallback = this.startX - minOffset;
      return Math.min(centerMax, Math.max(centerMin, fallback));
    }
    // 对单次均匀样本做对称、连续、单调的中心外扩，保留完整区间与唯一布局多样性。
    spreadPlatformSample(sample) {
      const value = Math.max(0, Math.min(1, sample));
      const exponent = 1.8;
      return value < 0.5 ? 0.5 * Math.pow(value * 2, exponent) : 1 - 0.5 * Math.pow((1 - value) * 2, exponent);
    }
    // 正值向区间右侧、负值向左侧软偏移；指数映射始终单调且不新增 RNG draw。
    biasPlatformSample(sample, pressure) {
      const value = Math.max(0, Math.min(1, sample));
      const boundedPressure = Math.max(-5, Math.min(5, pressure));
      return boundedPressure >= 0 ? 1 - Math.pow(1 - value, 1 + boundedPressure) : Math.pow(value, 1 - boundedPressure);
    }
    // 检查一个或多个按键是否被按下
    isKeyDown(...keys) {
      return keys.some((key) => Laya.InputManager.hasKeyDown(key));
    }
    initializeVisualLayer() {
      var _a;
      this.refreshPlatformVisuals();
      this.syncGroundVisual();
      this.initializeBallVisual();
      this.initializeBoundaryVisuals();
      if (!this.visualLoopStarted && typeof ((_a = Laya.timer) == null ? void 0 : _a.frameLoop) === "function") {
        this.visualLoopStarted = true;
        Laya.timer.frameLoop(1, this, this.updateVisualEffects);
      }
    }
    refreshPlatformVisuals() {
      for (const platform of this.platforms) {
        if (typeof (platform == null ? void 0 : platform.name) !== "string" || platform.name.indexOf("Platform_") !== 0)
          continue;
        const disappear = this.disappearConfigs.get(platform);
        this.paintPlatformVisual(platform, disappear ? "#00ff00" : "#ffffff");
      }
    }
    paintPlatformVisual(platform, bodyColor) {
      var _a, _b, _c;
      if (!platform || typeof platform.addChild !== "function")
        return;
      let holoSide = typeof platform.getChildByName === "function" ? platform.getChildByName("WPA_HoloSide") : null;
      if (!holoSide) {
        const children = (_b = (_a = platform == null ? void 0 : platform._children) != null ? _a : platform == null ? void 0 : platform._childs) != null ? _b : [];
        holoSide = (_c = children.find((child) => (child == null ? void 0 : child.name) === "WPA_HoloSide")) != null ? _c : null;
      }
      if (!holoSide) {
        holoSide = new Laya.Sprite();
        holoSide.name = "WPA_HoloSide";
        holoSide.mouseEnabled = false;
        holoSide.y = 0;
        platform.addChild(holoSide);
      }
      const width = Math.max(1, platform.width || 1);
      const depth = Math.max(6, Math.min(12, Math.round((platform.height || 10) * 0.7)));
      const isMoving = this.movingConfigs.has(platform);
      const disappear = this.disappearConfigs.get(platform);
      const warning = bodyColor !== "#ffffff";
      const graphics = holoSide.graphics;
      if (!graphics)
        return;
      holoSide.x = 0;
      holoSide.width = width;
      holoSide.height = depth + 4;
      holoSide.zOrder = 1;
      holoSide.alpha = 0.78;
      graphics.clear();
      const sideFill = warning ? bodyColor : "#082A46";
      if (typeof graphics.drawPoly === "function") {
        graphics.drawPoly(0, 3, [0, 0, width, 0, width - 8, depth, 8, depth], sideFill, "#35E9FF", 1);
      }
      if (typeof graphics.drawLine === "function") {
        graphics.drawLine(0, 0, width, 0, warning ? bodyColor : "#8FFBFF", 2);
        graphics.drawLine(8, depth, width - 8, depth, "#715CFF", 1);
        graphics.drawLine(width * 0.2, 5, width * 0.8, 5, "#16758D", 1);
        if (isMoving) {
          const center = width * 0.5;
          graphics.drawLine(center - 24, 7, center - 14, 3, "#A7FFFF", 2);
          graphics.drawLine(center - 24, 7, center - 14, 11, "#A7FFFF", 2);
          graphics.drawLine(center + 24, 7, center + 14, 3, "#A7FFFF", 2);
          graphics.drawLine(center + 24, 7, center + 14, 11, "#A7FFFF", 2);
        }
        if (disappear) {
          for (let x = 12; x < width - 8; x += 22) {
            graphics.drawLine(x, 3, Math.min(width - 4, x + 8), depth, warning ? bodyColor : "#F9FF70", 1);
          }
        }
      }
      this.ensurePlatformThrusters(platform);
    }
    ensurePlatformThrusters(platform) {
      if (!platform || typeof platform.addChild !== "function")
        return;
      this.ensurePlatformThruster(platform, "WPB_LeftThruster", true);
      this.ensurePlatformThruster(platform, "WPB_RightThruster", false);
    }
    ensurePlatformThruster(platform, name, isLeft) {
      var _a, _b, _c, _d, _e, _f, _g;
      let thruster = typeof platform.getChildByName === "function" ? platform.getChildByName(name) : null;
      if (!thruster) {
        const children = (_b = (_a = platform == null ? void 0 : platform._children) != null ? _a : platform == null ? void 0 : platform._childs) != null ? _b : [];
        thruster = (_c = children.find((child) => (child == null ? void 0 : child.name) === name)) != null ? _c : null;
      }
      if (!thruster) {
        thruster = new Laya.Sprite();
        thruster.name = name;
        thruster.mouseEnabled = false;
        thruster.y = Math.max(6, (platform.height || 10) * 0.55);
        platform.addChild(thruster);
      }
      const width = Math.max(1, platform.width || 1);
      thruster.width = 30;
      thruster.height = 46;
      thruster.x = isLeft ? 4 : Math.max(4, width - 34);
      thruster.zOrder = 2;
      thruster.alpha = 0.88;
      thruster.graphics.clear();
      if (typeof ((_d = thruster.graphics) == null ? void 0 : _d.drawPoly) === "function") {
        thruster.graphics.drawPoly(
          2,
          1,
          [3, 0, 23, 0, 27, 5, 23, 13, 7, 13, 0, 5],
          "#10283D",
          "#7DF9FF",
          1.5
        );
        thruster.graphics.drawPoly(
          5,
          9,
          [3, 0, 17, 0, 21, 7, 0, 7],
          "#263454",
          "#BBA2FF",
          1
        );
      }
      if (typeof ((_e = thruster.graphics) == null ? void 0 : _e.drawRect) === "function") {
        thruster.graphics.drawRect(8, 0, 14, 4, "#274D62", "#C5FCFF", 1);
        thruster.graphics.drawRect(10, 12, 10, 4, "#071926", "#42F5FF", 1);
      }
      if (typeof ((_f = thruster.graphics) == null ? void 0 : _f.drawLine) === "function") {
        thruster.graphics.drawLine(6, 5, 24, 5, "#466D88", 1);
        thruster.graphics.drawLine(9, 8, 21, 8, "#8B6CFF", 1);
      }
      let glow = typeof thruster.getChildByName === "function" ? thruster.getChildByName("WPB_NozzleGlow") : null;
      let plume = typeof thruster.getChildByName === "function" ? thruster.getChildByName("WPB_ThrusterPlume") : null;
      if (!glow) {
        glow = new Laya.Sprite();
        glow.name = "WPB_NozzleGlow";
        glow.mouseEnabled = false;
        thruster.addChild(glow);
      }
      if (!plume) {
        plume = new Laya.Sprite();
        plume.name = "WPB_ThrusterPlume";
        plume.mouseEnabled = false;
        thruster.addChild(plume);
      }
      glow.x = 15;
      glow.y = 16;
      glow.zOrder = 2;
      glow.graphics.clear();
      if (typeof ((_g = glow.graphics) == null ? void 0 : _g.drawCircle) === "function") {
        glow.graphics.drawCircle(0, 0, 4.2, "#DFFFFF", "#42F5FF", 1);
        glow.graphics.drawCircle(0, 0, 2.1, "#FFFFFF");
      }
      plume.x = 0;
      plume.y = 16;
      plume.width = 30;
      plume.height = 30;
      plume.zOrder = 1;
      return thruster;
    }
    updatePlatformThrusters(platform, platformIndex, impactOffsetY) {
      const left = typeof platform.getChildByName === "function" ? platform.getChildByName("WPB_LeftThruster") : null;
      const right = typeof platform.getChildByName === "function" ? platform.getChildByName("WPB_RightThruster") : null;
      if (!left || !right)
        return;
      const width = Math.max(1, platform.width || 1);
      const baseY = Math.max(6, (platform.height || 10) * 0.55);
      const visualOffsetY = this.getPlatformVisualHover(platformIndex) + impactOffsetY;
      const leftPulse = (Math.sin(this.visualPhase * 1.65 + platformIndex * 0.73) + 1) * 0.5;
      const rightPulse = (Math.sin(this.visualPhase * 1.65 + platformIndex * 0.73 + 1.35) + 1) * 0.5;
      left.x = 4;
      right.x = Math.max(4, width - 34);
      left.y = baseY + visualOffsetY;
      right.y = baseY + visualOffsetY;
      left.scaleX = 1;
      left.scaleY = 1;
      right.scaleX = 1;
      right.scaleY = 1;
      this.updateThrusterPlume(left, this.visualPhase + platformIndex * 0.47, 0, leftPulse);
      this.updateThrusterPlume(right, this.visualPhase + platformIndex * 0.47 + 1.37, 1, rightPulse);
      const ballPoint = this.getVisualStagePoint(this.owner, 0, 0);
      const radius = this.getBallRadius();
      left.alpha = this.isBallNearThruster(ballPoint, radius, left) ? 0.27 : 0.88;
      right.alpha = this.isBallNearThruster(ballPoint, radius, right) ? 0.27 : 0.88;
    }
    updateThrusterPlume(thruster, phase, sideIndex, pulse) {
      const glow = typeof thruster.getChildByName === "function" ? thruster.getChildByName("WPB_NozzleGlow") : null;
      const plume = typeof thruster.getChildByName === "function" ? thruster.getChildByName("WPB_ThrusterPlume") : null;
      if (!glow || !(plume == null ? void 0 : plume.graphics))
        return;
      glow.alpha = 0.72 + pulse * 0.28;
      const glowScale = 0.88 + pulse * 0.2;
      glow.scaleX = glowScale;
      glow.scaleY = glowScale;
      plume.alpha = 0.82 + pulse * 0.18;
      plume.graphics.clear();
      if (typeof plume.graphics.drawRect === "function") {
        plume.graphics.drawRect(12, 1, 6, 4, "#EFFFFF");
        plume.graphics.drawRect(11, 7, 8, 3, "#72F6FF");
        plume.graphics.drawRect(12, 12, 6, 2, "#5AA8FF");
      }
      const particleCount = 18;
      for (let i = 0; i < particleCount; i++) {
        const progress = (phase * 0.18 + i / particleCount + sideIndex * 0.11) % 1;
        const lane = (i * 7 + sideIndex * 3) % 5 - 2;
        const spread = 2 + progress * 6.5;
        const x = 15 + lane * spread * 0.38 + Math.sin(phase * 1.8 + i * 1.7) * 0.9;
        const y = 3 + progress * 26;
        const radius = progress < 0.24 ? 1.8 : progress < 0.62 ? 1.35 : 0.95;
        const color = progress < 0.2 ? i % 3 === 0 ? "#FFFFFF" : "#BFFFFF" : progress < 0.55 ? i % 2 === 0 ? "#42F5FF" : "#4CA8FF" : i % 2 === 0 ? "#6F7CFF" : "#A45CFF";
        if (typeof plume.graphics.drawCircle === "function") {
          plume.graphics.drawCircle(x, y, radius, color);
        } else if (typeof plume.graphics.drawRect === "function") {
          plume.graphics.drawRect(x - radius, y - radius, radius * 2, radius * 2, color);
        }
      }
    }
    isBallNearThruster(ballPoint, ballRadius, thruster) {
      const width = thruster.width || 30;
      const height = thruster.height || 46;
      const center = this.getVisualStagePoint(thruster, width * 0.5, height * 0.5);
      return Math.abs(ballPoint.x - center.x) <= ballRadius + width * 0.6 && Math.abs(ballPoint.y - center.y) <= ballRadius + height * 0.75;
    }
    getPlatformVisualHover(platformIndex) {
      return Math.sin(this.visualPhase * 0.82 + platformIndex * 0.9) * 1.5;
    }
    getPlatformLandingImpactNow() {
      var _a;
      const timerValue = Number((_a = Laya.timer) == null ? void 0 : _a.currTimer);
      return Number.isFinite(timerValue) ? timerValue : Date.now();
    }
    updatePlatformLandingImpactTrigger(nowMs) {
      const platform = this.onGround ? this.groundPlatform : null;
      const platformName = platform == null ? void 0 : platform.name;
      const disappear = platform ? this.disappearConfigs.get(platform) : null;
      const isValidPlatformLanding = typeof platformName === "string" && platformName.indexOf("Platform_") === 0 && platform.visible !== false && (disappear == null ? void 0 : disappear.state) !== "hidden";
      if (!isValidPlatformLanding) {
        this.platformLandingContact = null;
        return;
      }
      if (this.platformLandingContact !== platform) {
        this.platformLandingImpactStarts.set(platform, nowMs);
      }
      this.platformLandingContact = platform;
    }
    getPlatformLandingImpactOffset(platform, nowMs) {
      const startedAt = this.platformLandingImpactStarts.get(platform);
      if (startedAt === void 0)
        return 0;
      const duration = BallController.PLATFORM_LANDING_IMPACT_DURATION_MS;
      const elapsed = Math.max(0, nowMs - startedAt);
      if (elapsed >= duration) {
        this.platformLandingImpactStarts.delete(platform);
        return 0;
      }
      const halfDuration = duration * 0.5;
      const normalized = elapsed <= halfDuration ? elapsed / halfDuration : (duration - elapsed) / halfDuration;
      return BallController.PLATFORM_LANDING_IMPACT_MAX_Y * Math.max(0, Math.min(1, normalized));
    }
    resetPlatformLandingImpacts() {
      this.platformLandingImpactStarts.clear();
      this.platformLandingContact = null;
    }
    initializeBallVisual() {
      const ball = this.owner;
      const parent = ball == null ? void 0 : ball.parent;
      if (!ball || !parent || typeof ball.addChild !== "function")
        return;
      this.ballVisualRoot = typeof ball.getChildByName === "function" ? ball.getChildByName("WPD_CyberBall") : null;
      if (!this.ballVisualRoot) {
        this.ballVisualRoot = new Laya.Sprite();
        this.ballVisualRoot.name = "WPD_CyberBall";
        this.ballVisualRoot.mouseEnabled = false;
        ball.addChild(this.ballVisualRoot);
      }
      if (ball.graphics && typeof ball.graphics.clear === "function") {
        ball.graphics.clear();
      }
      ball.zOrder = Math.max(Number(ball.zOrder) || 0, 5);
      this.ballVisualRoot.x = 0;
      this.ballVisualRoot.y = 0;
      this.ballVisualRoot.zOrder = 1;
      this.ballVisualRoot.scaleX = 1;
      this.ballVisualRoot.scaleY = 1;
      this.ballAura = this.ensureCyberBallPart(this.ballVisualRoot, "WPD_BallAura");
      this.ballShell = this.ensureCyberBallPart(this.ballVisualRoot, "WPD_BallShell");
      this.ballCore = this.ensureCyberBallPart(this.ballVisualRoot, "WPD_BallCore");
      this.ballCircuits = this.ensureCyberBallPart(this.ballVisualRoot, "WPD_BallCircuits");
      this.ballAura.zOrder = 0;
      this.ballShell.zOrder = 1;
      this.ballCore.zOrder = 2;
      this.ballCircuits.zOrder = 3;
      this.ballAura.graphics.clear();
      this.ballAura.graphics.drawCircle(0, 0, 9.5, "#164D68");
      this.ballAura.graphics.drawCircle(0, 0, 7.3, "#258BC0");
      this.ballAura.alpha = 0.22;
      this.ballShell.graphics.clear();
      this.ballShell.graphics.drawCircle(0, 0, 5.4, "#071824", "#74FAFF", 1.2);
      this.ballShell.graphics.drawPoly(
        0,
        0,
        [0, -5.8, 4.8, -2.7, 4.8, 2.7, 0, 5.8, -4.8, 2.7, -4.8, -2.7],
        "#0B2637",
        "#35E9FF",
        0.8
      );
      this.ballCore.graphics.clear();
      this.ballCore.graphics.drawCircle(0, 0, 3.25, "#19DCE8", "#D8FFFF", 0.8);
      this.ballCore.graphics.drawCircle(0, 0, 1.65, "#F4FFFF");
      this.ballCircuits.graphics.clear();
      this.ballCircuits.graphics.drawLine(-4.2, -1.8, -2.3, -1.1, "#A96CFF", 0.8);
      this.ballCircuits.graphics.drawLine(2.3, 1.1, 4.2, 1.8, "#A96CFF", 0.8);
      this.ballCircuits.graphics.drawLine(-1.1, 3.4, 0, 5.1, "#53F8FF", 0.8);
      this.ballCircuits.graphics.drawLine(1.1, -3.4, 0, -5.1, "#53F8FF", 0.8);
      this.ballCircuits.graphics.drawCircle(-3.9, -1.7, 0.65, "#F7B5FF");
      this.ballCircuits.graphics.drawCircle(3.9, 1.7, 0.65, "#F7B5FF");
      this.initializeBallTrail(parent, ball);
      this.resetBallEnergyVisual(this.currentLevel, ScoreManager.instance.getScore());
    }
    ensureCyberBallPart(parent, name) {
      let part = typeof parent.getChildByName === "function" ? parent.getChildByName(name) : null;
      if (!part) {
        part = new Laya.Sprite();
        part.name = name;
        part.mouseEnabled = false;
        parent.addChild(part);
      }
      part.x = 0;
      part.y = 0;
      return part;
    }
    initializeBallTrail(parent, ball) {
      for (const node of this.ballTrailNodes) {
        this.destroyVisualNode(node);
      }
      this.ballTrailNodes = [];
      this.ballTrailHistory = [];
      const trailCount = 5;
      for (let i = 0; i < trailCount; i++) {
        const trail = new Laya.Sprite();
        trail.name = "WPD_BallTrail_" + i;
        trail.mouseEnabled = false;
        trail.zOrder = Math.max(1, (Number(ball.zOrder) || 5) - 1);
        trail.alpha = 0;
        trail.graphics.drawCircle(0, 0, 5.2, "#145270", "#42F5FF", 0.8);
        trail.graphics.drawCircle(0, 0, 2.4, "#45F1FF");
        parent.addChild(trail);
        this.ballTrailNodes.push(trail);
      }
      this.ballTrailLastX = Number(ball.x) || 0;
      this.ballTrailLastY = Number(ball.y) || 0;
    }
    resetBallEnergyVisual(level, score) {
      const normalizedLevel = Math.max(1, Math.min(this.maxLevel, Math.floor(level)));
      const normalizedScore = Math.max(
        0,
        Math.min(BallController.BALL_ENERGY_STAGE_COUNT, Math.floor(score))
      );
      const progress = Math.pow(normalizedScore / BallController.BALL_ENERGY_STAGE_COUNT, 1.2);
      this.ballEnergyObservedLevel = normalizedLevel;
      this.ballEnergyObservedScore = normalizedScore;
      this.ballEnergyTransitionFrom = progress;
      this.ballEnergyTransitionTo = progress;
      this.ballEnergyTransitionStartedAt = 0;
      this.ballEnergyTransitionActive = false;
      this.ballEnergyVisualProgress = progress;
      this.applyBallEnergyVisual(normalizedLevel, progress, true);
    }
    updateBallEnergyEvolution() {
      const level = Math.max(1, Math.min(this.maxLevel, Math.floor(this.currentLevel)));
      const score = Math.max(
        0,
        Math.min(BallController.BALL_ENERGY_STAGE_COUNT, Math.floor(ScoreManager.instance.getScore()))
      );
      const now = this.readBallEnergyTime();
      if (level !== this.ballEnergyObservedLevel || score < this.ballEnergyObservedScore) {
        this.resetBallEnergyVisual(level, score);
        return;
      }
      if (score > this.ballEnergyObservedScore) {
        const currentProgress = this.resolveBallEnergyTransition(now);
        const targetProgress = Math.pow(score / BallController.BALL_ENERGY_STAGE_COUNT, 1.2);
        this.ballEnergyObservedScore = score;
        this.ballEnergyTransitionFrom = currentProgress;
        this.ballEnergyTransitionTo = targetProgress;
        this.ballEnergyTransitionStartedAt = now;
        this.ballEnergyTransitionActive = targetProgress > currentProgress;
      }
      this.ballEnergyVisualProgress = this.resolveBallEnergyTransition(now);
      this.applyBallEnergyVisual(level, this.ballEnergyVisualProgress, false);
    }
    resolveBallEnergyTransition(now) {
      if (!this.ballEnergyTransitionActive) {
        return this.ballEnergyTransitionTo;
      }
      const elapsed = Math.max(0, now - this.ballEnergyTransitionStartedAt);
      const progress = Math.min(1, elapsed / BallController.BALL_ENERGY_ABSORPTION_DURATION_MS);
      const eased = 1 - Math.pow(1 - progress, 2);
      const visualProgress = this.ballEnergyTransitionFrom + (this.ballEnergyTransitionTo - this.ballEnergyTransitionFrom) * eased;
      if (progress >= 1) {
        this.ballEnergyTransitionActive = false;
        return this.ballEnergyTransitionTo;
      }
      return visualProgress;
    }
    readBallEnergyTime() {
      var _a;
      const timerValue = Number((_a = Laya.timer) == null ? void 0 : _a.currTimer);
      return Number.isFinite(timerValue) ? timerValue : Date.now();
    }
    applyBallEnergyVisual(level, progress, force) {
      const normalizedProgress = Math.max(0, Math.min(1, progress));
      this.ballEnergyVisualProgress = normalizedProgress;
      this.updateLevelDifficultyBar();
      if (!force && this.ballEnergyRenderedLevel === level && Math.abs(this.ballEnergyRenderedProgress - normalizedProgress) < 1e-3) {
        return;
      }
      const palettes = BallController.BALL_ENERGY_CHECKPOINT_PALETTES;
      const startIndex = Math.max(0, Math.min(palettes.length - 2, level - 1));
      const start = palettes[startIndex];
      const target = palettes[startIndex + 1];
      const mix = (from, to) => {
        return this.mixBallEnergyColor(from, to, normalizedProgress);
      };
      const evolutionStrength = Math.max(
        0,
        Math.min(1, (startIndex + normalizedProgress) / Math.max(1, palettes.length - 1))
      );
      if (this.ballAura) {
        this.ballAura.graphics.clear();
        this.ballAura.graphics.drawCircle(0, 0, 9.5, mix(start.auraOuter, target.auraOuter));
        this.ballAura.graphics.drawCircle(0, 0, 7.3, mix(start.auraInner, target.auraInner));
      }
      if (this.ballShell) {
        this.ballShell.graphics.clear();
        this.ballShell.graphics.drawCircle(
          0,
          0,
          5.4,
          mix(start.shellOuter, target.shellOuter),
          mix(start.shellOuterStroke, target.shellOuterStroke),
          1.2
        );
        this.ballShell.graphics.drawPoly(
          0,
          0,
          [0, -5.8, 4.8, -2.7, 4.8, 2.7, 0, 5.8, -4.8, 2.7, -4.8, -2.7],
          mix(start.shellPanel, target.shellPanel),
          mix(start.shellPanelStroke, target.shellPanelStroke),
          0.8
        );
      }
      if (this.ballCore) {
        this.ballCore.graphics.clear();
        this.ballCore.graphics.drawCircle(
          0,
          0,
          3.25,
          mix(start.coreOuter, target.coreOuter),
          mix(start.coreOuterStroke, target.coreOuterStroke),
          0.8 + evolutionStrength * 0.7
        );
        this.ballCore.graphics.drawCircle(0, 0, 1.65, mix(start.coreInner, target.coreInner));
      }
      if (this.ballCircuits) {
        const primary = mix(start.circuitPrimary, target.circuitPrimary);
        const secondary = mix(start.circuitSecondary, target.circuitSecondary);
        const node = mix(start.circuitNode, target.circuitNode);
        const lineWidth = 0.8 + evolutionStrength * 0.35;
        this.ballCircuits.graphics.clear();
        this.ballCircuits.graphics.drawLine(-4.2, -1.8, -2.3, -1.1, primary, lineWidth);
        this.ballCircuits.graphics.drawLine(2.3, 1.1, 4.2, 1.8, primary, lineWidth);
        this.ballCircuits.graphics.drawLine(-1.1, 3.4, 0, 5.1, secondary, lineWidth);
        this.ballCircuits.graphics.drawLine(1.1, -3.4, 0, -5.1, secondary, lineWidth);
        this.ballCircuits.graphics.drawCircle(-3.9, -1.7, 0.65, node);
        this.ballCircuits.graphics.drawCircle(3.9, 1.7, 0.65, node);
      }
      const trailOuter = mix(start.trailOuter, target.trailOuter);
      const trailStroke = mix(start.trailStroke, target.trailStroke);
      const trailInner = mix(start.trailInner, target.trailInner);
      for (const trail of this.ballTrailNodes) {
        trail.graphics.clear();
        trail.graphics.drawCircle(0, 0, 5.2, trailOuter, trailStroke, 0.8);
        trail.graphics.drawCircle(0, 0, 2.4, trailInner);
      }
      this.ballEnergyEvolutionStrength = evolutionStrength;
      this.ballEnergyRenderedLevel = level;
      this.ballEnergyRenderedProgress = normalizedProgress;
    }
    mixBallEnergyColor(from, to, progress) {
      const red = Math.round(from[0] + (to[0] - from[0]) * progress);
      const green = Math.round(from[1] + (to[1] - from[1]) * progress);
      const blue = Math.round(from[2] + (to[2] - from[2]) * progress);
      return "#" + this.ballEnergyHex(red) + this.ballEnergyHex(green) + this.ballEnergyHex(blue);
    }
    ballEnergyHex(value) {
      const hex = Math.max(0, Math.min(255, value)).toString(16).toUpperCase();
      return hex.length < 2 ? "0" + hex : hex;
    }
    updateBallVisualEffects(pulse) {
      const ball = this.owner;
      const visual = this.ballVisualRoot;
      if (!ball || !visual)
        return;
      this.updateBallEnergyEvolution();
      if (!this.ballVisualStateReady) {
        this.ballVisualStateReady = true;
        this.ballWasGrounded = this.onGround;
        this.ballLastVy = this.vy;
      }
      const landedThisFrame = this.onGround && !this.ballWasGrounded && this.ballLastVy > 1;
      let targetScaleX = 1;
      let targetScaleY = 1;
      let recovery = 0.2;
      if (landedThisFrame) {
        const impact = Math.min(1, this.ballLastVy / Math.max(1, this.jumpStrength));
        this.ballVisualScaleX = 1.14 + impact * 0.16;
        this.ballVisualScaleY = 0.82 - impact * 0.12;
        recovery = 0.16;
      } else if (!this.onGround && this.vy < -1.2) {
        const lift = Math.min(1, Math.abs(this.vy) / Math.max(1, this.jumpStrength));
        targetScaleX = 1 - lift * 0.16;
        targetScaleY = 1 + lift * 0.26;
        recovery = 0.28;
      } else if (!this.onGround && this.vy > 2) {
        const fall = Math.min(1, this.vy / Math.max(1, this.jumpStrength));
        targetScaleX = 1 - fall * 0.07;
        targetScaleY = 1 + fall * 0.11;
      }
      this.ballVisualScaleX += (targetScaleX - this.ballVisualScaleX) * recovery;
      this.ballVisualScaleY += (targetScaleY - this.ballVisualScaleY) * recovery;
      visual.scaleX = this.ballVisualScaleX;
      visual.scaleY = this.ballVisualScaleY;
      if (this.ballAura) {
        const auraScale = 1.08 + pulse * 0.16;
        this.ballAura.scaleX = auraScale;
        this.ballAura.scaleY = auraScale;
        this.ballAura.alpha = 0.2 + this.ballEnergyEvolutionStrength * 0.08 + pulse * (0.15 + this.ballEnergyEvolutionStrength * 0.04);
      }
      if (this.ballCore) {
        const coreScale = 0.9 + pulse * 0.18;
        this.ballCore.scaleX = coreScale;
        this.ballCore.scaleY = coreScale;
        this.ballCore.alpha = 0.84 + this.ballEnergyEvolutionStrength * 0.04 + pulse * (0.16 - this.ballEnergyEvolutionStrength * 0.04);
      }
      this.updateBallTrail(ball);
      this.ballWasGrounded = this.onGround;
      this.ballLastVy = this.vy;
    }
    updateBallTrail(ball) {
      if (this.ballTrailNodes.length === 0)
        return;
      const x = Number(ball.x) || 0;
      const y = Number(ball.y) || 0;
      const teleportDistance = Math.abs(x - this.ballTrailLastX) + Math.abs(y - this.ballTrailLastY);
      if (teleportDistance > 90) {
        this.ballTrailHistory = [];
      }
      this.ballTrailLastX = x;
      this.ballTrailLastY = y;
      this.ballTrailHistory.unshift({
        x,
        y,
        scaleX: this.ballVisualScaleX,
        scaleY: this.ballVisualScaleY
      });
      const maxHistory = this.ballTrailNodes.length * 2 + 1;
      if (this.ballTrailHistory.length > maxHistory) {
        this.ballTrailHistory.length = maxHistory;
      }
      const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
      const motionAlpha = Math.max(0, Math.min(1, (speed - 0.35) / 6));
      for (let i = 0; i < this.ballTrailNodes.length; i++) {
        const trail = this.ballTrailNodes[i];
        const sample = this.ballTrailHistory[Math.min(this.ballTrailHistory.length - 1, (i + 1) * 2)];
        if (!sample || motionAlpha <= 0) {
          trail.alpha = 0;
          continue;
        }
        trail.x = sample.x;
        trail.y = sample.y;
        trail.scaleX = sample.scaleX * (1 - i * 0.045);
        trail.scaleY = sample.scaleY * (1 - i * 0.045);
        trail.alpha = motionAlpha * (0.24 + this.ballEnergyEvolutionStrength * 0.04) * Math.pow(0.55, i);
      }
    }
    initializeBoundaryVisuals() {
      this.boundaryVisuals = [];
      const walls = [this.topWall, this.leftWall, this.rightWall];
      for (let index = 0; index < walls.length; index++) {
        const wall = walls[index];
        if (!wall || typeof wall.addChild !== "function")
          continue;
        let root = typeof wall.getChildByName === "function" ? wall.getChildByName("WPD_CyberBoundary") : null;
        if (!root) {
          root = new Laya.Sprite();
          root.name = "WPD_CyberBoundary";
          root.mouseEnabled = false;
          wall.addChild(root);
        }
        let scan = typeof root.getChildByName === "function" ? root.getChildByName("WPD_BoundaryScan") : null;
        if (!scan) {
          scan = new Laya.Sprite();
          scan.name = "WPD_BoundaryScan";
          scan.mouseEnabled = false;
          root.addChild(scan);
        }
        const length = Math.max(1, Number(wall.width) || 1);
        const thickness = Math.max(4, Number(wall.height) || 4);
        root.x = 0;
        root.y = 0;
        root.width = length;
        root.height = thickness;
        root.zOrder = 2;
        root.graphics.clear();
        root.graphics.drawRect(0, 0, length, thickness, "#071521", "#35E9FF", 1.2);
        root.graphics.drawLine(0, 2, length, 2, "#9C70FF", 1);
        root.graphics.drawLine(0, thickness - 2, length, thickness - 2, "#45F6FF", 1.4);
        for (let x = 18; x < length; x += 58) {
          const segmentEnd = Math.min(length, x + 24);
          root.graphics.drawLine(x, thickness * 0.5, segmentEnd, thickness * 0.5, "#1A708A", 1);
          root.graphics.drawCircle(x - 5, thickness * 0.5, 1.25, index === 0 ? "#72F8FF" : "#B887FF");
        }
        scan.y = 4;
        scan.zOrder = 1;
        scan.graphics.clear();
        scan.graphics.drawRect(0, 0, 42, Math.max(2, thickness - 8), "#59F7FF");
        scan.alpha = 0.18;
        this.boundaryVisuals.push({ root, scan, length, phaseOffset: index * 0.31 });
      }
    }
    updateBoundaryVisuals(pulse) {
      for (const visual of this.boundaryVisuals) {
        const travel = visual.length + 42;
        const progress = (this.visualPhase * 0.018 + visual.phaseOffset) % 1;
        visual.scan.x = progress * travel - 42;
        visual.scan.alpha = 0.08 + pulse * 0.13;
        visual.root.alpha = 0.9 + pulse * 0.08;
      }
    }
    syncGroundVisual() {
      var _a;
      const ground = (_a = this.platforms.find((platform) => (platform == null ? void 0 : platform.name) === "Ground")) != null ? _a : null;
      if (!ground || typeof ground.addChild !== "function")
        return;
      if (!this.groundVisual || this.groundVisual.parent !== ground) {
        this.groundVisual = typeof ground.getChildByName === "function" ? ground.getChildByName("WPA_GroundVisual") : null;
        if (!this.groundVisual) {
          this.groundVisual = new Laya.Sprite();
          this.groundVisual.name = "WPA_GroundVisual";
          this.groundVisual.mouseEnabled = false;
          ground.addChild(this.groundVisual);
        }
      }
      if (!this.groundEnergy || this.groundEnergy.parent !== this.groundVisual) {
        this.groundEnergy = typeof this.groundVisual.getChildByName === "function" ? this.groundVisual.getChildByName("WPA_GroundEnergy") : null;
        if (!this.groundEnergy) {
          this.groundEnergy = new Laya.Sprite();
          this.groundEnergy.name = "WPA_GroundEnergy";
          this.groundEnergy.mouseEnabled = false;
          this.groundVisual.addChild(this.groundEnergy);
        }
      }
      const width = Math.max(1, ground.width || Laya.stage.width || 1);
      const height = Math.max(8, ground.height || 20);
      const graphics = this.groundVisual.graphics;
      const energyGraphics = this.groundEnergy.graphics;
      if (!graphics || !energyGraphics)
        return;
      this.groundVisual.x = 0;
      this.groundVisual.y = 0;
      this.groundVisual.width = width;
      this.groundVisual.height = height;
      this.groundVisual.zOrder = 2;
      this.groundEnergy.width = width;
      this.groundEnergy.height = height;
      this.groundEnergy.x = 0;
      this.groundEnergy.y = 0;
      this.groundEnergy.visible = true;
      graphics.clear();
      energyGraphics.clear();
      if (this.deathEnabled) {
        if (typeof graphics.drawRect === "function") {
          graphics.drawRect(0, 0, width, height, "#3A092C", "#FF2E8A", 2);
        }
        if (typeof graphics.drawLine === "function") {
          const gridStep = Math.max(24, Math.round(width / 14));
          for (let x = 0; x <= width; x += gridStep) {
            graphics.drawLine(x, 0, x, height, "#8D174F", 1);
          }
          for (let y = 5; y < height; y += 7) {
            graphics.drawLine(0, y, width, y, "#641044", 1);
          }
        }
        if (typeof graphics.drawPoly === "function") {
          const toothWidth = Math.max(12, Math.round(width / 32));
          for (let x = 0; x < width; x += toothWidth) {
            graphics.drawPoly(x, 0, [0, height, toothWidth * 0.5, 1, toothWidth, height], "#D41468", "#FF73BE", 1);
          }
        }
        if (typeof energyGraphics.drawLine === "function") {
          for (let i = 0; i < 12; i++) {
            const x = (i * 83 + 19) % width;
            const y = 2 + i * 11 % Math.max(3, height - 4);
            energyGraphics.drawLine(x, y, Math.min(width, x + 9), Math.max(0, y - 4), i % 2 ? "#FF4DA6" : "#B95CFF", 2);
          }
        }
      } else {
        if (typeof graphics.drawRect === "function") {
          graphics.drawRect(0, 0, width, height, "#0C2836", "#2D6572", 1);
        }
        if (typeof graphics.drawPoly === "function") {
          const panelWidth = 112;
          const panelBottom = Math.max(8, height - 4);
          for (let x = 0, panelIndex = 0; x < width; x += panelWidth, panelIndex++) {
            const panelX = x + 3;
            const availableWidth = Math.max(0, Math.min(panelWidth - 6, width - panelX));
            if (availableWidth < 12)
              continue;
            graphics.drawPoly(
              panelX,
              0,
              [
                0,
                5,
                7,
                2,
                availableWidth - 8,
                2,
                availableWidth,
                6,
                availableWidth - 5,
                panelBottom,
                5,
                panelBottom
              ],
              panelIndex % 2 === 0 ? "#123B49" : "#0F3442",
              "#28606D",
              0.7
            );
          }
        }
        if (typeof graphics.drawLine === "function") {
          graphics.drawLine(0, 1, width, 1, "#73C9D6", 1.5);
          graphics.drawLine(0, 3, width, 3, "#285C69", 1);
          graphics.drawLine(0, height - 2, width, height - 2, "#20505D", 1);
          for (let x = 0; x < width; x += 112) {
            graphics.drawLine(x, 3, x, height - 3, "#397684", 1);
            graphics.drawLine(
              x + 18,
              Math.max(7, height - 7),
              Math.min(width, x + 42),
              6,
              "#397583",
              1
            );
          }
          for (let x = 22; x < width; x += 168) {
            graphics.drawLine(x, 8, Math.min(width, x + 28), 8, "#4E98A5", 1);
            graphics.drawLine(x + 38, height - 7, Math.min(width, x + 54), height - 7, "#34717F", 1);
          }
          for (let x = 72; x < width; x += 224) {
            graphics.drawLine(x, 4, Math.min(width, x + 10), 4, "#82DAE3", 1);
          }
        }
        if (typeof energyGraphics.drawCircle === "function") {
          const moteCount = Math.max(7, Math.min(11, Math.round(width / 128)));
          for (let i = 0; i < moteCount; i++) {
            const x = (i * 127 + 43) % width;
            const y = 5 + i * 9 % Math.max(3, height - 10);
            const outer = i % 3 === 0 ? 2 : 1.4;
            energyGraphics.drawCircle(x, y, outer, i % 2 === 0 ? "#238CA3" : "#316FB5");
            energyGraphics.drawCircle(x, y, 0.75, i % 2 === 0 ? "#B6FAFF" : "#B7D5FF");
          }
        }
        if (typeof energyGraphics.drawLine === "function") {
          for (let x = 46; x < width; x += 224) {
            energyGraphics.drawLine(x - 5, 5, x + 7, 5, "#69D7E5", 1);
            energyGraphics.drawLine(x + 18, height - 8, x + 28, height - 8, "#5A8FDF", 0.8);
          }
        }
      }
    }
    paintSpikeVisual(spike) {
      const graphics = spike == null ? void 0 : spike.graphics;
      if (!graphics)
        return;
      const width = Math.max(1, spike.width || 1);
      const height = Math.max(1, spike.height || 1);
      graphics.clear();
      if (typeof graphics.drawRect === "function") {
        graphics.drawRect(0, 0, width, height, "#3E092E", "#FF2E8A", 2);
      }
      if (typeof graphics.drawPoly === "function") {
        const toothCount = Math.max(3, Math.floor(width / 14));
        const toothWidth = width / toothCount;
        for (let i = 0; i < toothCount; i++) {
          const x = i * toothWidth;
          graphics.drawPoly(x, 0, [0, height, toothWidth * 0.5, 0, toothWidth, height], i % 2 ? "#7C2CFF" : "#FF267E", "#FF9BD1", 1);
        }
      }
      if (typeof graphics.drawLine === "function") {
        graphics.drawLine(0, height - 1, width, height - 1, "#FF4DA6", 2);
        graphics.drawLine(0, 1, width, 1, "#FFF0FA", 1);
      }
      this.ensureSpikeEnergy(spike);
    }
    ensureSpikeEnergy(spike) {
      var _a, _b, _c;
      if (!spike || typeof spike.addChild !== "function")
        return;
      let energy = typeof spike.getChildByName === "function" ? spike.getChildByName("WPA_HazardEnergy") : null;
      if (!energy) {
        const children = (_b = (_a = spike == null ? void 0 : spike._children) != null ? _a : spike == null ? void 0 : spike._childs) != null ? _b : [];
        energy = (_c = children.find((child) => (child == null ? void 0 : child.name) === "WPA_HazardEnergy")) != null ? _c : null;
      }
      if (!energy) {
        energy = new Laya.Sprite();
        energy.name = "WPA_HazardEnergy";
        energy.mouseEnabled = false;
        spike.addChild(energy);
      }
      const width = Math.max(1, spike.width || 1);
      const height = Math.max(1, spike.height || 1);
      energy.width = width;
      energy.height = height;
      energy.graphics.clear();
      if (typeof energy.graphics.drawLine === "function") {
        for (let i = 0; i < 6; i++) {
          const x = (i + 0.5) * width / 6;
          energy.graphics.drawLine(x - 4, height * 0.75, x + 4, height * 0.25, i % 2 ? "#44F6FF" : "#FFB4E1", 1);
        }
      }
    }
    updateVisualEffects() {
      this.visualPhase += 0.055;
      const pulse = (Math.sin(this.visualPhase) + 1) * 0.5;
      const landingImpactNow = this.getPlatformLandingImpactNow();
      this.updatePlatformLandingImpactTrigger(landingImpactNow);
      let platformVisualIndex = 0;
      for (const platform of this.platforms) {
        if (typeof (platform == null ? void 0 : platform.name) !== "string" || platform.name.indexOf("Platform_") !== 0)
          continue;
        const hoverY = this.getPlatformVisualHover(platformVisualIndex);
        const impactOffsetY = this.getPlatformLandingImpactOffset(platform, landingImpactNow);
        const holoSide = typeof platform.getChildByName === "function" ? platform.getChildByName("WPA_HoloSide") : null;
        if (holoSide) {
          holoSide.y = hoverY + impactOffsetY;
          const disappear = this.disappearConfigs.get(platform);
          holoSide.alpha = this.movingConfigs.has(platform) || (disappear == null ? void 0 : disappear.state) === "counting" ? 0.58 + pulse * 0.34 : 0.78;
        }
        this.updatePlatformThrusters(platform, platformVisualIndex, impactOffsetY);
        platformVisualIndex++;
      }
      if (this.groundVisual) {
        this.groundVisual.alpha = this.deathEnabled ? 0.78 + pulse * 0.2 : 0.98 + pulse * 0.02;
      }
      if (this.groundEnergy) {
        if (this.deathEnabled) {
          this.groundEnergy.alpha = 0.35 + pulse * 0.65;
          this.groundEnergy.x = 0;
          this.groundEnergy.y = Math.round(Math.sin(this.visualPhase * 1.7) * 2);
        } else {
          this.groundEnergy.alpha = 0.34 + pulse * 0.2;
          this.groundEnergy.x = Math.round(Math.sin(this.visualPhase * 0.43) * 3);
          this.groundEnergy.y = Math.round(Math.sin(this.visualPhase * 0.71));
        }
      }
      for (const spike of this.spikes) {
        const energy = typeof (spike == null ? void 0 : spike.getChildByName) === "function" ? spike.getChildByName("WPA_HazardEnergy") : null;
        if (energy) {
          energy.alpha = 0.35 + pulse * 0.65;
        }
      }
      this.updateBallVisualEffects(pulse);
      this.updateBoundaryVisuals(pulse);
      this.updateDeathFeedback();
      this.updateDeathReconstruction();
    }
    onDestroy() {
      var _a;
      this.finishLevelHudEntrance();
      ScoreManager.instance.clearTransientFeedback();
      if (this.touchInput) {
        this.touchInput.setRuntimeBlockProvider(() => true);
        this.touchInput.resetAll();
        this.touchInput = null;
      }
      this.clearDeathReconstruction();
      this.clearDeathFeedback();
      this.clearDisappearRecoveryStates();
      this.resetPlatformLandingImpacts();
      if (this.visualLoopStarted && typeof ((_a = Laya.timer) == null ? void 0 : _a.clear) === "function") {
        Laya.timer.clear(this, this.updateVisualEffects);
      }
      this.visualLoopStarted = false;
      this.levelTransitionHandler = null;
      this.levelTransitionPending = false;
      this.groundVisual = null;
      this.groundEnergy = null;
      for (const trail of this.ballTrailNodes) {
        this.destroyVisualNode(trail);
      }
      this.ballTrailNodes = [];
      this.ballTrailHistory = [];
      this.ballVisualRoot = null;
      this.ballAura = null;
      this.ballShell = null;
      this.ballCore = null;
      this.ballCircuits = null;
      this.ballEnergyTransitionActive = false;
      this.ballEnergyRenderedLevel = 0;
      this.ballEnergyRenderedProgress = -1;
      this.boundaryVisuals = [];
    }
  };
  /**
   * 消失平台延迟消失时间常数（毫秒）
   * 小球踩上消失平台后，平台进入 counting 状态，经过此延迟后进入 hidden 状态并消失。
   * 同时支持颜色预警：0-20% 绿→黄，80-100% 黄→红，视觉提示玩家平台即将消失。
   */
  BallController.DISAPPEAR_DELAY = 800;
  BallController.PLATFORM_LANDING_IMPACT_DURATION_MS = 120;
  BallController.PLATFORM_LANDING_IMPACT_MAX_Y = 3;
  BallController.BALL_ENERGY_STAGE_COUNT = 5;
  BallController.BALL_ENERGY_ABSORPTION_DURATION_MS = 500;
  BallController.BALL_ENERGY_CHECKPOINT_PALETTES = [
    {
      auraOuter: [22, 77, 104],
      auraInner: [37, 139, 192],
      shellOuter: [7, 24, 36],
      shellOuterStroke: [116, 250, 255],
      shellPanel: [11, 38, 55],
      shellPanelStroke: [53, 233, 255],
      coreOuter: [25, 220, 232],
      coreOuterStroke: [216, 255, 255],
      coreInner: [244, 255, 255],
      circuitPrimary: [169, 108, 255],
      circuitSecondary: [83, 248, 255],
      circuitNode: [247, 181, 255],
      trailOuter: [20, 82, 112],
      trailStroke: [66, 245, 255],
      trailInner: [69, 241, 255]
    },
    {
      auraOuter: [24, 47, 106],
      auraInner: [82, 62, 215],
      shellOuter: [8, 20, 46],
      shellOuterStroke: [158, 132, 255],
      shellPanel: [16, 28, 73],
      shellPanelStroke: [124, 105, 255],
      coreOuter: [112, 82, 255],
      coreOuterStroke: [228, 244, 255],
      coreInner: [255, 255, 255],
      circuitPrimary: [194, 123, 255],
      circuitSecondary: [98, 183, 255],
      circuitNode: [244, 197, 255],
      trailOuter: [23, 54, 109],
      trailStroke: [132, 120, 255],
      trailInner: [158, 150, 255]
    },
    {
      auraOuter: [55, 22, 108],
      auraInner: [135, 45, 225],
      shellOuter: [24, 10, 52],
      shellOuterStroke: [215, 150, 255],
      shellPanel: [38, 16, 75],
      shellPanelStroke: [175, 80, 255],
      coreOuter: [175, 60, 255],
      coreOuterStroke: [248, 215, 255],
      coreInner: [255, 255, 255],
      circuitPrimary: [255, 105, 215],
      circuitSecondary: [180, 120, 255],
      circuitNode: [255, 205, 245],
      trailOuter: [70, 30, 112],
      trailStroke: [185, 95, 255],
      trailInner: [220, 140, 255]
    },
    {
      auraOuter: [95, 22, 75],
      auraInner: [215, 55, 145],
      shellOuter: [46, 12, 38],
      shellOuterStroke: [255, 150, 205],
      shellPanel: [70, 18, 55],
      shellPanelStroke: [255, 90, 165],
      coreOuter: [250, 55, 150],
      coreOuterStroke: [255, 220, 240],
      coreInner: [255, 255, 255],
      circuitPrimary: [255, 185, 80],
      circuitSecondary: [255, 100, 175],
      circuitNode: [255, 235, 175],
      trailOuter: [98, 28, 68],
      trailStroke: [250, 75, 150],
      trailInner: [255, 135, 185]
    },
    {
      auraOuter: [125, 28, 75],
      auraInner: [255, 185, 45],
      shellOuter: [38, 14, 32],
      shellOuterStroke: [255, 220, 115],
      shellPanel: [62, 20, 48],
      shellPanelStroke: [255, 190, 65],
      coreOuter: [255, 210, 50],
      coreOuterStroke: [255, 250, 200],
      coreInner: [255, 255, 255],
      circuitPrimary: [255, 245, 160],
      circuitSecondary: [255, 155, 45],
      circuitNode: [255, 255, 255],
      trailOuter: [115, 32, 70],
      trailStroke: [255, 165, 60],
      trailInner: [255, 225, 110]
    }
  ];
  BallController.DISAPPEAR_HIDDEN_COOLDOWN_MS = 2e3;
  BallController.DISAPPEAR_REBUILDING_MS = 400;
  BallController.DEATH_RECONSTRUCTION_DURATION_MS = 3e3;
  BallController.DEATH_DECONSTRUCT_END_MS = 300;
  BallController.DEATH_WORLD_MATERIALIZE_START_MS = 2100;
  BallController.DEATH_CORE_REASSEMBLY_START_MS = 2550;
  BallController.DEATH_PLATFORM_LOCK_THRESHOLD = 0.98;
  BallController.DEATH_BALL_SHARD_COUNT = 8;
  BallController.DEATH_BUFFER_FRAGMENT_COUNT = 24;
  BallController.DEATH_OLD_WORLD_FRAGMENT_BUDGET = 24;
  BallController.DEATH_PLATFORM_DUPLICATE_COUNT = 2;
  BallController.DEATH_COUNTDOWN_BEAT_MS = 600;
  BallController.DEATH_COUNTDOWN_STRUCTURAL_SEGMENT_COUNT = 6;
  BallController.DEATH_COUNTDOWN_DIGIT_SCALE = 0.72;
  BallController.DEATH_RETICLE_SCALE = 0.72;
  BallController.DEATH_RETICLE_COLORS = {
    PRIMARY: "#42D7FF",
    ENERGY: "#2F8FFF",
    SOFT: "#B9ECFF",
    DARK: "#0A3D86"
  };
  BallController.DEATH_RETICLE_TEMPLATES = [
    {
      id: "TEMPLATE_A",
      animation: "CORNER_LOCK",
      parts: [
        { x: -0.61, y: -0.72, length: 0.34, thickness: 0.022, rotation: 0, tone: "PRIMARY" },
        { x: -0.78, y: -0.55, length: 0.28, thickness: 0.022, rotation: 90, tone: "ENERGY" },
        { x: -0.79, y: -0.75, length: 0.19, thickness: 0.026, rotation: -45, tone: "SOFT" },
        { x: 0.61, y: -0.72, length: 0.34, thickness: 0.022, rotation: 0, tone: "PRIMARY" },
        { x: 0.78, y: -0.55, length: 0.28, thickness: 0.022, rotation: 90, tone: "ENERGY" },
        { x: 0.79, y: -0.75, length: 0.19, thickness: 0.026, rotation: 45, tone: "SOFT" },
        { x: -0.61, y: 0.72, length: 0.34, thickness: 0.022, rotation: 0, tone: "PRIMARY" },
        { x: -0.78, y: 0.55, length: 0.28, thickness: 0.022, rotation: 90, tone: "ENERGY" },
        { x: -0.79, y: 0.75, length: 0.19, thickness: 0.026, rotation: 45, tone: "SOFT" },
        { x: 0.61, y: 0.72, length: 0.34, thickness: 0.022, rotation: 0, tone: "PRIMARY" },
        { x: 0.78, y: 0.55, length: 0.28, thickness: 0.022, rotation: 90, tone: "ENERGY" },
        { x: 0.79, y: 0.75, length: 0.19, thickness: 0.026, rotation: -45, tone: "SOFT" },
        { x: 0, y: -0.88, length: 0.12, thickness: 0.014, rotation: 90, tone: "DARK" },
        { x: 0, y: 0.88, length: 0.12, thickness: 0.014, rotation: 90, tone: "DARK" }
      ]
    },
    {
      id: "TEMPLATE_B",
      animation: "SIDE_DEPLOY",
      parts: [
        { x: -0.82, y: 0, length: 0.48, thickness: 0.022, rotation: 90, tone: "PRIMARY" },
        { x: -0.7, y: -0.34, length: 0.25, thickness: 0.022, rotation: 0, tone: "ENERGY" },
        { x: -0.7, y: 0.34, length: 0.25, thickness: 0.022, rotation: 0, tone: "ENERGY" },
        { x: 0.82, y: 0, length: 0.48, thickness: 0.022, rotation: 90, tone: "PRIMARY" },
        { x: 0.7, y: -0.34, length: 0.25, thickness: 0.022, rotation: 0, tone: "ENERGY" },
        { x: 0.7, y: 0.34, length: 0.25, thickness: 0.022, rotation: 0, tone: "ENERGY" },
        { x: -0.3, y: -0.82, length: 0.16, thickness: 0.018, rotation: 90, tone: "DARK" },
        { x: 0, y: -0.86, length: 0.21, thickness: 0.024, rotation: 90, tone: "SOFT" },
        { x: 0.3, y: -0.82, length: 0.16, thickness: 0.018, rotation: 90, tone: "DARK" },
        { x: -0.3, y: 0.82, length: 0.16, thickness: 0.018, rotation: 90, tone: "DARK" },
        { x: 0, y: 0.86, length: 0.21, thickness: 0.024, rotation: 90, tone: "SOFT" },
        { x: 0.3, y: 0.82, length: 0.16, thickness: 0.018, rotation: 90, tone: "DARK" },
        { x: -0.94, y: 0, length: 0.1, thickness: 0.014, rotation: 0, tone: "DARK" },
        { x: 0.94, y: 0, length: 0.1, thickness: 0.014, rotation: 0, tone: "DARK" }
      ]
    },
    {
      id: "TEMPLATE_C",
      animation: "DUAL_ALIGN",
      parts: [
        { x: -0.24, y: -0.69, length: 0.28, thickness: 0.021, rotation: -45, tone: "PRIMARY" },
        { x: -0.56, y: -0.37, length: 0.28, thickness: 0.021, rotation: -45, tone: "ENERGY" },
        { x: 0.24, y: -0.69, length: 0.28, thickness: 0.021, rotation: 45, tone: "PRIMARY" },
        { x: 0.56, y: -0.37, length: 0.28, thickness: 0.021, rotation: 45, tone: "ENERGY" },
        { x: 0.56, y: 0.37, length: 0.28, thickness: 0.021, rotation: -45, tone: "ENERGY" },
        { x: 0.24, y: 0.69, length: 0.28, thickness: 0.021, rotation: -45, tone: "PRIMARY" },
        { x: -0.24, y: 0.69, length: 0.28, thickness: 0.021, rotation: 45, tone: "PRIMARY" },
        { x: -0.56, y: 0.37, length: 0.28, thickness: 0.021, rotation: 45, tone: "ENERGY" },
        { x: -0.42, y: -0.42, length: 0.2, thickness: 0.018, rotation: 0, tone: "DARK" },
        { x: -0.5, y: -0.34, length: 0.16, thickness: 0.018, rotation: 90, tone: "SOFT" },
        { x: 0.42, y: -0.42, length: 0.2, thickness: 0.018, rotation: 0, tone: "DARK" },
        { x: 0.5, y: -0.34, length: 0.16, thickness: 0.018, rotation: 90, tone: "SOFT" },
        { x: -0.42, y: 0.42, length: 0.2, thickness: 0.018, rotation: 0, tone: "DARK" },
        { x: -0.5, y: 0.34, length: 0.16, thickness: 0.018, rotation: 90, tone: "SOFT" },
        { x: 0.42, y: 0.42, length: 0.2, thickness: 0.018, rotation: 0, tone: "DARK" },
        { x: 0.5, y: 0.34, length: 0.16, thickness: 0.018, rotation: 90, tone: "SOFT" },
        { x: 0, y: -0.88, length: 0.12, thickness: 0.014, rotation: 90, tone: "ENERGY" },
        { x: 0, y: 0.88, length: 0.12, thickness: 0.014, rotation: 90, tone: "ENERGY" }
      ]
    },
    {
      id: "TEMPLATE_D",
      animation: "SEQUENTIAL_LIGHT",
      parts: [
        { x: 0, y: -0.76, length: 0.3, thickness: 0.025, rotation: 90, tone: "SOFT" },
        { x: 0.76, y: 0, length: 0.3, thickness: 0.025, rotation: 0, tone: "SOFT" },
        { x: 0, y: 0.76, length: 0.3, thickness: 0.025, rotation: 90, tone: "SOFT" },
        { x: -0.76, y: 0, length: 0.3, thickness: 0.025, rotation: 0, tone: "SOFT" },
        { x: 0.43, y: -0.69, length: 0.14, thickness: 0.018, rotation: 32, tone: "ENERGY" },
        { x: 0.69, y: -0.43, length: 0.14, thickness: 0.018, rotation: 58, tone: "DARK" },
        { x: 0.69, y: 0.43, length: 0.14, thickness: 0.018, rotation: -58, tone: "ENERGY" },
        { x: 0.43, y: 0.69, length: 0.14, thickness: 0.018, rotation: -32, tone: "DARK" },
        { x: -0.43, y: 0.69, length: 0.14, thickness: 0.018, rotation: 32, tone: "ENERGY" },
        { x: -0.69, y: 0.43, length: 0.14, thickness: 0.018, rotation: 58, tone: "DARK" },
        { x: -0.69, y: -0.43, length: 0.14, thickness: 0.018, rotation: -58, tone: "ENERGY" },
        { x: -0.43, y: -0.69, length: 0.14, thickness: 0.018, rotation: -32, tone: "DARK" },
        { x: -0.16, y: -0.92, length: 0.08, thickness: 0.013, rotation: 0, tone: "DARK" },
        { x: 0.16, y: 0.92, length: 0.08, thickness: 0.013, rotation: 0, tone: "DARK" }
      ]
    },
    {
      id: "TEMPLATE_E",
      animation: "VERTICAL_CONVERGE",
      parts: [
        { x: 0, y: -0.8, length: 0.43, thickness: 0.024, rotation: 0, tone: "PRIMARY" },
        { x: -0.47, y: -0.76, length: 0.24, thickness: 0.018, rotation: 0, tone: "DARK" },
        { x: 0.5, y: -0.76, length: 0.17, thickness: 0.022, rotation: 0, tone: "SOFT" },
        { x: -0.16, y: -0.68, length: 0.17, thickness: 0.018, rotation: 90, tone: "ENERGY" },
        { x: 0, y: 0.8, length: 0.34, thickness: 0.024, rotation: 0, tone: "PRIMARY" },
        { x: -0.5, y: 0.76, length: 0.17, thickness: 0.022, rotation: 0, tone: "SOFT" },
        { x: 0.45, y: 0.76, length: 0.27, thickness: 0.018, rotation: 0, tone: "DARK" },
        { x: 0.18, y: 0.68, length: 0.17, thickness: 0.018, rotation: 90, tone: "ENERGY" },
        { x: -0.75, y: -0.3, length: 0.24, thickness: 0.023, rotation: -42, tone: "ENERGY" },
        { x: -0.78, y: 0.27, length: 0.2, thickness: 0.019, rotation: 42, tone: "DARK" },
        { x: 0.75, y: -0.3, length: 0.24, thickness: 0.023, rotation: 42, tone: "ENERGY" },
        { x: 0.78, y: 0.27, length: 0.2, thickness: 0.019, rotation: -42, tone: "DARK" },
        { x: -0.9, y: 0, length: 0.11, thickness: 0.014, rotation: 0, tone: "DARK" },
        { x: 0.9, y: 0, length: 0.11, thickness: 0.014, rotation: 0, tone: "DARK" }
      ]
    },
    {
      id: "TEMPLATE_F",
      animation: "FRAGMENT_LOCK",
      parts: [
        { x: 0, y: -0.82, length: 0.3, thickness: 0.024, rotation: 0, tone: "SOFT" },
        { x: 0.45, y: -0.7, length: 0.25, thickness: 0.02, rotation: 32, tone: "PRIMARY" },
        { x: 0.73, y: -0.39, length: 0.22, thickness: 0.019, rotation: 62, tone: "ENERGY" },
        { x: 0.8, y: 0.14, length: 0.26, thickness: 0.022, rotation: 96, tone: "DARK" },
        { x: 0.59, y: 0.61, length: 0.28, thickness: 0.02, rotation: -45, tone: "PRIMARY" },
        { x: 0.1, y: 0.82, length: 0.24, thickness: 0.024, rotation: -5, tone: "SOFT" },
        { x: -0.42, y: 0.72, length: 0.25, thickness: 0.02, rotation: 30, tone: "ENERGY" },
        { x: -0.76, y: 0.34, length: 0.24, thickness: 0.021, rotation: 70, tone: "PRIMARY" },
        { x: -0.76, y: -0.28, length: 0.19, thickness: 0.019, rotation: -72, tone: "DARK" },
        { x: -0.44, y: -0.7, length: 0.28, thickness: 0.021, rotation: -32, tone: "ENERGY" },
        { x: -0.43, y: -0.36, length: 0.18, thickness: 0.018, rotation: 0, tone: "DARK" },
        { x: 0.43, y: -0.36, length: 0.18, thickness: 0.018, rotation: 0, tone: "DARK" },
        { x: -0.43, y: 0.36, length: 0.18, thickness: 0.018, rotation: 0, tone: "DARK" },
        { x: 0.43, y: 0.36, length: 0.18, thickness: 0.018, rotation: 0, tone: "DARK" },
        { x: 0.88, y: -0.12, length: 0.09, thickness: 0.014, rotation: 90, tone: "ENERGY" },
        { x: -0.88, y: 0.12, length: 0.09, thickness: 0.014, rotation: 90, tone: "ENERGY" }
      ]
    },
    {
      id: "TEMPLATE_G",
      animation: "SEQUENTIAL_LIGHT",
      parts: [
        { x: -0.43, y: -0.68, length: 0.36, thickness: 0.022, rotation: 30, tone: "PRIMARY" },
        { x: 0.43, y: -0.68, length: 0.36, thickness: 0.022, rotation: -30, tone: "ENERGY" },
        { x: -0.72, y: -0.34, length: 0.28, thickness: 0.02, rotation: 90, tone: "SOFT" },
        { x: 0.72, y: -0.34, length: 0.22, thickness: 0.019, rotation: 90, tone: "DARK" },
        { x: -0.72, y: 0.34, length: 0.22, thickness: 0.019, rotation: 90, tone: "DARK" },
        { x: 0.72, y: 0.34, length: 0.28, thickness: 0.02, rotation: 90, tone: "SOFT" },
        { x: -0.43, y: 0.68, length: 0.36, thickness: 0.022, rotation: -30, tone: "ENERGY" },
        { x: 0.43, y: 0.68, length: 0.36, thickness: 0.022, rotation: 30, tone: "PRIMARY" },
        { x: 0, y: -0.86, length: 0.11, thickness: 0.014, rotation: 90, tone: "ENERGY" },
        { x: 0.86, y: 0, length: 0.11, thickness: 0.014, rotation: 0, tone: "DARK" },
        { x: 0, y: 0.86, length: 0.11, thickness: 0.014, rotation: 90, tone: "DARK" },
        { x: -0.86, y: 0, length: 0.11, thickness: 0.014, rotation: 0, tone: "ENERGY" }
      ]
    },
    {
      id: "TEMPLATE_H",
      animation: "CORNER_LOCK",
      parts: [
        { x: -0.47, y: -0.52, length: 0.18, thickness: 0.022, rotation: 0, tone: "SOFT" },
        { x: -0.58, y: -0.41, length: 0.2, thickness: 0.022, rotation: 90, tone: "PRIMARY" },
        { x: 0.47, y: -0.52, length: 0.18, thickness: 0.022, rotation: 0, tone: "SOFT" },
        { x: 0.58, y: -0.41, length: 0.2, thickness: 0.022, rotation: 90, tone: "PRIMARY" },
        { x: -0.47, y: 0.52, length: 0.18, thickness: 0.022, rotation: 0, tone: "SOFT" },
        { x: -0.58, y: 0.41, length: 0.2, thickness: 0.022, rotation: 90, tone: "ENERGY" },
        { x: 0.47, y: 0.52, length: 0.18, thickness: 0.022, rotation: 0, tone: "SOFT" },
        { x: 0.58, y: 0.41, length: 0.2, thickness: 0.022, rotation: 90, tone: "ENERGY" },
        { x: -0.67, y: -0.73, length: 0.2, thickness: 0.018, rotation: 0, tone: "DARK" },
        { x: -0.79, y: -0.61, length: 0.22, thickness: 0.018, rotation: 90, tone: "ENERGY" },
        { x: 0.67, y: -0.73, length: 0.2, thickness: 0.018, rotation: 0, tone: "DARK" },
        { x: 0.79, y: -0.61, length: 0.22, thickness: 0.018, rotation: 90, tone: "ENERGY" },
        { x: -0.67, y: 0.73, length: 0.2, thickness: 0.018, rotation: 0, tone: "DARK" },
        { x: -0.79, y: 0.61, length: 0.22, thickness: 0.018, rotation: 90, tone: "PRIMARY" },
        { x: 0.67, y: 0.73, length: 0.2, thickness: 0.018, rotation: 0, tone: "DARK" },
        { x: 0.79, y: 0.61, length: 0.22, thickness: 0.018, rotation: 90, tone: "PRIMARY" },
        { x: 0.88, y: -0.2, length: 0.08, thickness: 0.013, rotation: 0, tone: "DARK" },
        { x: 0.88, y: -0.04, length: 0.13, thickness: 0.014, rotation: 0, tone: "ENERGY" },
        { x: 0.88, y: 0.13, length: 0.1, thickness: 0.013, rotation: 0, tone: "DARK" },
        { x: -0.88, y: 0.24, length: 0.08, thickness: 0.013, rotation: 0, tone: "ENERGY" }
      ]
    },
    {
      id: "TEMPLATE_I",
      animation: "FRAGMENT_LOCK",
      parts: [
        { x: -0.52, y: -0.61, length: 0.26, thickness: 0.021, rotation: 46, tone: "PRIMARY" },
        { x: -0.19, y: -0.79, length: 0.22, thickness: 0.019, rotation: 12, tone: "ENERGY" },
        { x: 0.19, y: -0.78, length: 0.16, thickness: 0.018, rotation: -12, tone: "DARK" },
        { x: 0.51, y: -0.59, length: 0.22, thickness: 0.021, rotation: -46, tone: "SOFT" },
        { x: 0.69, y: 0.1, length: 0.18, thickness: 0.019, rotation: 90, tone: "PRIMARY" },
        { x: 0.52, y: 0.58, length: 0.24, thickness: 0.021, rotation: 46, tone: "ENERGY" },
        { x: 0.14, y: 0.79, length: 0.25, thickness: 0.02, rotation: 8, tone: "PRIMARY" },
        { x: -0.28, y: 0.74, length: 0.18, thickness: 0.018, rotation: -18, tone: "DARK" },
        { x: -0.59, y: 0.48, length: 0.26, thickness: 0.021, rotation: -55, tone: "SOFT" },
        { x: -0.72, y: -0.08, length: 0.18, thickness: 0.019, rotation: 90, tone: "ENERGY" },
        { x: 0.87, y: -0.31, length: 0.08, thickness: 0.013, rotation: 0, tone: "DARK" },
        { x: 0.9, y: -0.17, length: 0.13, thickness: 0.014, rotation: 0, tone: "ENERGY" },
        { x: 0.87, y: -0.03, length: 0.09, thickness: 0.013, rotation: 0, tone: "DARK" }
      ]
    },
    {
      id: "TEMPLATE_J",
      animation: "DUAL_ALIGN",
      parts: [
        { x: -0.2, y: -0.73, length: 0.27, thickness: 0.022, rotation: -45, tone: "SOFT" },
        { x: -0.52, y: -0.43, length: 0.22, thickness: 0.02, rotation: -45, tone: "PRIMARY" },
        { x: 0.2, y: -0.73, length: 0.27, thickness: 0.022, rotation: 45, tone: "SOFT" },
        { x: 0.52, y: -0.43, length: 0.22, thickness: 0.02, rotation: 45, tone: "ENERGY" },
        { x: 0.52, y: 0.43, length: 0.22, thickness: 0.02, rotation: -45, tone: "PRIMARY" },
        { x: 0.2, y: 0.73, length: 0.27, thickness: 0.022, rotation: -45, tone: "SOFT" },
        { x: -0.2, y: 0.73, length: 0.27, thickness: 0.022, rotation: 45, tone: "SOFT" },
        { x: -0.52, y: 0.43, length: 0.22, thickness: 0.02, rotation: 45, tone: "ENERGY" },
        { x: -0.86, y: -0.24, length: 0.09, thickness: 0.013, rotation: 0, tone: "DARK" },
        { x: -0.88, y: 0, length: 0.14, thickness: 0.014, rotation: 0, tone: "PRIMARY" },
        { x: -0.86, y: 0.24, length: 0.09, thickness: 0.013, rotation: 0, tone: "DARK" },
        { x: 0.86, y: -0.24, length: 0.09, thickness: 0.013, rotation: 0, tone: "DARK" },
        { x: 0.88, y: 0, length: 0.14, thickness: 0.014, rotation: 0, tone: "ENERGY" },
        { x: 0.86, y: 0.24, length: 0.09, thickness: 0.013, rotation: 0, tone: "DARK" }
      ]
    }
  ];
  BallController = __decorateClass([
    regClass("1LSzwPdgQ7mD0zqbvY-BVw")
  ], BallController);

  // src/BackgroundManager.ts
  var _BackgroundManager = class _BackgroundManager {
    static draw(sceneRoot) {
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
      background.zOrder = _BackgroundManager.backgroundZOrder;
      background.x = 0;
      background.y = 0;
      background.width = _BackgroundManager.width;
      background.height = _BackgroundManager.height;
      background.mouseEnabled = false;
      if (!background.graphics) {
        console.warn("BackgroundManager: Background node has no graphics object.");
        return;
      }
      background.graphics.clear();
      _BackgroundManager.drawDeepSpaceGradient(background.graphics);
      _BackgroundManager.ensureStardustLayer(background);
      _BackgroundManager.startStardustAnimation();
    }
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
    static drawDeepSpaceGradient(graphics) {
      const middleY = _BackgroundManager.height * 0.5;
      graphics.drawRect(0, 0, _BackgroundManager.width, _BackgroundManager.height, "#030712");
      _BackgroundManager.drawGradientSegment(graphics, 0, middleY, "#061324", 6, 19, 36);
      graphics.drawRect(0, middleY, _BackgroundManager.width, _BackgroundManager.height - middleY, "#061324");
      _BackgroundManager.drawGradientSegment(graphics, middleY, _BackgroundManager.height, "#091C30", 9, 28, 48);
    }
    static drawGradientSegment(graphics, startY, endY, targetColor, targetRed, targetGreen, targetBlue) {
      const steps = _BackgroundManager.gradientStepsPerSegment;
      const segmentHeight = endY - startY;
      for (let index = 0; index < steps; index++) {
        const progress = index / (steps - 1);
        const y = startY + segmentHeight * index / steps;
        const nextY = startY + segmentHeight * (index + 1) / steps;
        const fill = index === steps - 1 ? targetColor : `rgba(${targetRed},${targetGreen},${targetBlue},${progress.toFixed(4)})`;
        graphics.drawRect(0, y, _BackgroundManager.width, nextY - y + 0.5, fill);
      }
    }
    static ensureStardustLayer(background) {
      if (!_BackgroundManager.stardustLayer) {
        const layer2 = new Laya.Sprite();
        layer2.name = "WP_F_StardustLayer";
        layer2.width = _BackgroundManager.width;
        layer2.height = _BackgroundManager.height;
        layer2.zOrder = 1;
        layer2.mouseEnabled = false;
        for (let index = 0; index < _BackgroundManager.stardustConfigs.length; index++) {
          const config = _BackgroundManager.stardustConfigs[index];
          const star = new Laya.Sprite();
          star.name = `WP_F_Stardust_${index + 1}`;
          star.mouseEnabled = false;
          star.graphics.drawCircle(0, 0, config.radius * 2.2, "#164A68");
          star.graphics.drawCircle(0, 0, config.radius, config.color);
          layer2.addChild(star);
          _BackgroundManager.stardustSprites.push(star);
        }
        _BackgroundManager.stardustLayer = layer2;
      }
      const layer = _BackgroundManager.stardustLayer;
      layer.zOrder = 1;
      if (layer.parent !== background) {
        if (layer.parent && typeof layer.removeSelf === "function") {
          layer.removeSelf();
        }
        background.addChild(layer);
      }
    }
    static startStardustAnimation() {
      _BackgroundManager.elapsedMilliseconds = 0;
      _BackgroundManager.applyStardustFrame();
      Laya.timer.clear(_BackgroundManager, _BackgroundManager.updateStardust);
      Laya.timer.frameLoop(1, _BackgroundManager, _BackgroundManager.updateStardust);
    }
    static updateStardust() {
      if (!_BackgroundManager.stardustLayer || !_BackgroundManager.stardustLayer.parent) {
        Laya.timer.clear(_BackgroundManager, _BackgroundManager.updateStardust);
        return;
      }
      const rawDelta = Number(Laya.timer.delta);
      const deltaMilliseconds = Number.isFinite(rawDelta) && rawDelta > 0 ? Math.min(rawDelta, 50) : 16.6667;
      _BackgroundManager.elapsedMilliseconds += deltaMilliseconds;
      _BackgroundManager.applyStardustFrame();
    }
    static applyStardustFrame() {
      const time = _BackgroundManager.elapsedMilliseconds;
      for (let index = 0; index < _BackgroundManager.stardustConfigs.length; index++) {
        const config = _BackgroundManager.stardustConfigs[index];
        const star = _BackgroundManager.stardustSprites[index];
        star.x = config.x;
        if (config.motionLayer === 3) {
          const breathProgress = time / _BackgroundManager.energyBreathPeriodMs * _BackgroundManager.twoPi;
          const breathWave = 0.5 - 0.5 * Math.cos(config.phase + breathProgress);
          star.y = config.y;
          star.alpha = _BackgroundManager.energyMinAlpha + (_BackgroundManager.energyMaxAlpha - _BackgroundManager.energyMinAlpha) * breathWave;
          continue;
        }
        const driftPeriod = config.motionLayer === 1 ? _BackgroundManager.farDriftPeriodMs : _BackgroundManager.nearDriftPeriodMs;
        const driftProgress = time / driftPeriod * _BackgroundManager.twoPi;
        star.y = config.y + Math.sin(config.phase + driftProgress) * config.driftRange;
        star.alpha = config.alpha;
      }
    }
  };
  _BackgroundManager.width = 1334;
  _BackgroundManager.height = 750;
  _BackgroundManager.backgroundZOrder = -100;
  _BackgroundManager.gradientStepsPerSegment = 128;
  _BackgroundManager.farDriftPeriodMs = 5e3;
  _BackgroundManager.nearDriftPeriodMs = 3500;
  _BackgroundManager.energyBreathPeriodMs = 4e3;
  _BackgroundManager.energyMinAlpha = 0.1;
  _BackgroundManager.energyMaxAlpha = 0.45;
  _BackgroundManager.twoPi = Math.PI * 2;
  // 固定配置：3 层 × 6 个星尘，不使用运行时随机数。
  _BackgroundManager.stardustConfigs = [
    // Layer 1：远景慢漂，6 个，±8px / 5000ms。
    { motionLayer: 1, x: 64, y: 76, radius: 1, color: "#DDF8FF", alpha: 0.12, driftRange: 8, phase: 0.2 },
    { motionLayer: 1, x: 152, y: 184, radius: 1.4, color: "#8FEAFF", alpha: 0.16, driftRange: 8, phase: 1.25 },
    { motionLayer: 1, x: 238, y: 42, radius: 0.9, color: "#D7DEFF", alpha: 0.21, driftRange: 8, phase: 2.3 },
    { motionLayer: 1, x: 334, y: 292, radius: 1.2, color: "#A9D8FF", alpha: 0.25, driftRange: 8, phase: 3.35 },
    { motionLayer: 1, x: 426, y: 118, radius: 1.6, color: "#C9F7FF", alpha: 0.3, driftRange: 8, phase: 4.4 },
    { motionLayer: 1, x: 518, y: 386, radius: 1, color: "#A9B8FF", alpha: 0.35, driftRange: 8, phase: 5.45 },
    // Layer 2：近层漂移，6 个，±8~13px / 3500ms。
    { motionLayer: 2, x: 612, y: 206, radius: 1.3, color: "#9CEFFF", alpha: 0.15, driftRange: 8, phase: 0.55 },
    { motionLayer: 2, x: 704, y: 64, radius: 0.8, color: "#E7F5FF", alpha: 0.2, driftRange: 9, phase: 1.6 },
    { motionLayer: 2, x: 798, y: 338, radius: 1.5, color: "#B8A9FF", alpha: 0.26, driftRange: 10, phase: 2.65 },
    { motionLayer: 2, x: 886, y: 166, radius: 1.1, color: "#BDEEFF", alpha: 0.31, driftRange: 11, phase: 3.7 },
    { motionLayer: 2, x: 978, y: 438, radius: 1.3, color: "#91DFFF", alpha: 0.37, driftRange: 12, phase: 4.75 },
    { motionLayer: 2, x: 1072, y: 92, radius: 1, color: "#D8E4FF", alpha: 0.38, driftRange: 13, phase: 5.8 },
    // Layer 3：固定能量节点，6 个，仅作 0.10→0.45→0.10 / 4000ms 呼吸。
    { motionLayer: 3, x: 1164, y: 276, radius: 1.6, color: "#B5F4FF", alpha: 0.1, driftRange: 0, phase: 0 },
    { motionLayer: 3, x: 1262, y: 144, radius: 0.9, color: "#C6CFFF", alpha: 0.1, driftRange: 0, phase: 1.05 },
    { motionLayer: 3, x: 118, y: 526, radius: 1.2, color: "#8DDFFF", alpha: 0.1, driftRange: 0, phase: 2.1 },
    { motionLayer: 3, x: 388, y: 646, radius: 1, color: "#BAC7FF", alpha: 0.1, driftRange: 0, phase: 3.15 },
    { motionLayer: 3, x: 746, y: 574, radius: 1.4, color: "#A1E9FF", alpha: 0.1, driftRange: 0, phase: 4.2 },
    { motionLayer: 3, x: 1128, y: 662, radius: 1.1, color: "#D9F8FF", alpha: 0.1, driftRange: 0, phase: 5.25 }
  ];
  _BackgroundManager.stardustLayer = null;
  _BackgroundManager.stardustSprites = [];
  _BackgroundManager.elapsedMilliseconds = 0;
  var BackgroundManager = _BackgroundManager;

  // src/IntroUI.ts
  var _IntroUI = class _IntroUI {
    static show(onStart, mobileTouchSession = false, lifecycleCallbacks = {}) {
      if (_IntroUI.started || _IntroUI.container) {
        return;
      }
      _IntroUI.startHandler = onStart;
      _IntroUI.lifecycleCallbacks = lifecycleCallbacks;
      _IntroUI.mobileTouchSession = mobileTouchSession;
      _IntroUI.view = _IntroUI.COVER;
      _IntroUI.selectedIndex = 0;
      _IntroUI.resetCoverState();
      _IntroUI.createShell();
      _IntroUI.renderCover();
      _IntroUI.bindKeyboard();
    }
    static returnToMainMenu(onStart, mobileTouchSession = false, lifecycleCallbacks = {}) {
      var _a, _b;
      if (!_IntroUI.container || !_IntroUI.panel) {
        return;
      }
      _IntroUI.startHandler = onStart;
      _IntroUI.lifecycleCallbacks = lifecycleCallbacks;
      _IntroUI.mobileTouchSession = mobileTouchSession;
      _IntroUI.started = false;
      _IntroUI.view = _IntroUI.MAIN_MENU;
      _IntroUI.selectedIndex = 0;
      _IntroUI.resetCoverState();
      if (_IntroUI.overlay) {
        _IntroUI.overlay.alpha = 0.78;
      }
      _IntroUI.panel.visible = true;
      _IntroUI.container.visible = true;
      _IntroUI.renderMainMenu();
      _IntroUI.bindKeyboard();
      (_b = (_a = _IntroUI.lifecycleCallbacks).onMainMenuEntered) == null ? void 0 : _b.call(_a);
    }
    static createShell() {
      const container = new Laya.Sprite();
      const panelWidth = _IntroUI.PANEL_WIDTH;
      const panelHeight = _IntroUI.PANEL_HEIGHT;
      container.zOrder = 10001;
      const overlay = new Laya.Sprite();
      overlay.mouseEnabled = false;
      overlay.graphics.drawRect(
        0,
        0,
        Laya.stage.width,
        Laya.stage.height,
        "#02050C"
      );
      overlay.alpha = 0.78;
      container.addChild(overlay);
      const panel = new Laya.Sprite();
      panel.width = panelWidth;
      panel.height = panelHeight;
      panel.x = (Laya.stage.width - panelWidth) / 2;
      panel.y = (Laya.stage.height - panelHeight) / 2;
      const backing = new Laya.Sprite();
      backing.alpha = 0.92;
      backing.graphics.drawPoly(
        0,
        0,
        _IntroUI.cutCornerPoints(panelWidth, panelHeight, 18),
        "#07101F",
        "#0EA5E9",
        2
      );
      panel.addChild(backing);
      const innerFrame = new Laya.Sprite();
      innerFrame.graphics.drawPoly(
        0,
        0,
        _IntroUI.cutCornerPoints(panelWidth - 20, panelHeight - 20, 13),
        null,
        "#1E3A5F",
        1
      );
      innerFrame.x = 10;
      innerFrame.y = 10;
      panel.addChild(innerFrame);
      const topRail = new Laya.Sprite();
      topRail.graphics.drawRect(28, 0, panelWidth - 56, 5, "#22D3EE");
      topRail.graphics.drawRect(350, 5, 200, 2, "#8B5CF6");
      topRail.alpha = 0.9;
      panel.addChild(topRail);
      const cornerMarks = new Laya.Sprite();
      cornerMarks.graphics.drawLine(22, 24, 66, 24, "#38BDF8", 2);
      cornerMarks.graphics.drawLine(22, 24, 22, 55, "#38BDF8", 2);
      cornerMarks.graphics.drawLine(panelWidth - 22, panelHeight - 24, panelWidth - 66, panelHeight - 24, "#8B5CF6", 2);
      cornerMarks.graphics.drawLine(panelWidth - 22, panelHeight - 24, panelWidth - 22, panelHeight - 55, "#8B5CF6", 2);
      cornerMarks.alpha = 0.75;
      panel.addChild(cornerMarks);
      container.addChild(panel);
      Laya.stage.addChild(container);
      _IntroUI.container = container;
      _IntroUI.overlay = overlay;
      _IntroUI.panel = panel;
    }
    static renderCover() {
      _IntroUI.clearView();
      _IntroUI.clearCoverRoot();
      _IntroUI.view = _IntroUI.COVER;
      _IntroUI.coverDismissed = false;
      _IntroUI.coverEnterPhysicalDown = false;
      _IntroUI.coverEnterReleaseRequired = false;
      _IntroUI.mainMenuActivationGuarded = false;
      if (_IntroUI.overlay) {
        _IntroUI.overlay.alpha = 0.84;
      }
      if (_IntroUI.panel) {
        _IntroUI.panel.visible = false;
      }
      const stageWidth = Laya.stage.width;
      const stageHeight = Laya.stage.height;
      const coverRoot = new Laya.Sprite();
      coverRoot.width = stageWidth;
      coverRoot.height = stageHeight;
      coverRoot.mouseEnabled = true;
      coverRoot.mouseThrough = false;
      coverRoot.graphics.drawRect(0, 0, stageWidth, stageHeight, "#020713");
      const atmosphere = new Laya.Sprite();
      atmosphere.mouseEnabled = false;
      const coreGlow = new Laya.Sprite();
      coreGlow.graphics.drawCircle(stageWidth / 2, 390, 238, "#07162A");
      coreGlow.graphics.drawCircle(stageWidth / 2, 390, 178, "#0A2039");
      coreGlow.alpha = 0.58;
      atmosphere.addChild(coreGlow);
      const grid = new Laya.Sprite();
      for (let x = 82; x < stageWidth; x += 84) {
        grid.graphics.drawLine(x, 0, x, stageHeight, "#0B1B2D", 1);
      }
      for (let y = 75; y < stageHeight; y += 75) {
        grid.graphics.drawLine(0, y, stageWidth, y, "#0B1B2D", 1);
      }
      grid.alpha = 0.32;
      atmosphere.addChild(grid);
      const vignette = new Laya.Sprite();
      vignette.graphics.drawRect(0, 0, stageWidth, 30, "#01040B");
      vignette.graphics.drawRect(0, stageHeight - 30, stageWidth, 30, "#01040B");
      vignette.graphics.drawRect(0, 30, 34, stageHeight - 60, "#01040B");
      vignette.graphics.drawRect(stageWidth - 34, 30, 34, stageHeight - 60, "#01040B");
      vignette.alpha = 0.82;
      atmosphere.addChild(vignette);
      coverRoot.addChild(atmosphere);
      const particleRoot = _IntroUI.createCoverParticleField(stageWidth, stageHeight);
      coverRoot.addChild(particleRoot);
      const trackingFrame = _IntroUI.createCoverTrackingFrame(stageWidth, stageHeight);
      coverRoot.addChild(trackingFrame);
      const topRail = new Laya.Sprite();
      topRail.graphics.drawRect(120, 54, stageWidth - 240, 1, "#164E63");
      topRail.graphics.drawRect(stageWidth / 2 - 88, 52, 176, 3, "#22D3EE");
      topRail.alpha = 0.72;
      coverRoot.addChild(topRail);
      const leftReadout = _IntroUI.createText("SYS://TITLE_INTERFACE", 12, "#35627A", true);
      leftReadout.x = 126;
      leftReadout.y = 70;
      leftReadout.width = 300;
      leftReadout.height = 18;
      coverRoot.addChild(leftReadout);
      const rightReadout = _IntroUI.createText("SIMULATION NODE 01", 12, "#4C3F78", true);
      rightReadout.align = "right";
      rightReadout.x = stageWidth - 426;
      rightReadout.y = 70;
      rightReadout.width = 300;
      rightReadout.height = 18;
      coverRoot.addChild(rightReadout);
      const titleGlow = _IntroUI.createText("BALL GAME", 82, "#22D3EE", true);
      titleGlow.align = "center";
      titleGlow.valign = "middle";
      titleGlow.x = 0;
      titleGlow.y = 104;
      titleGlow.width = stageWidth;
      titleGlow.height = 104;
      titleGlow.alpha = 0.2;
      coverRoot.addChild(titleGlow);
      const title = _IntroUI.createText("BALL GAME", 82, "#F8FAFC", true);
      title.align = "center";
      title.valign = "middle";
      title.x = 0;
      title.y = 99;
      title.width = stageWidth;
      title.height = 104;
      coverRoot.addChild(title);
      const subtitle = _IntroUI.createText("CYBER CORE TRIAL", 22, "#A78BFA", true);
      subtitle.align = "center";
      subtitle.valign = "middle";
      subtitle.x = 0;
      subtitle.y = 205;
      subtitle.width = stageWidth;
      subtitle.height = 32;
      coverRoot.addChild(subtitle);
      const core = _IntroUI.createCoverCore();
      core.x = stageWidth / 2;
      core.y = 390;
      coverRoot.addChild(core);
      const status = _IntroUI.createText("SYSTEM READY", 15, "#22D3EE", true);
      status.align = "center";
      status.x = 0;
      status.y = 574;
      status.width = stageWidth;
      status.height = 22;
      coverRoot.addChild(status);
      _IntroUI.coverStatusText = status;
      const prompt = _IntroUI.createText(
        _IntroUI.mobileTouchSession ? "TOUCH AND HOLD TO INITIALIZE" : "HOLD [ ENTER ] OR HOLD MOUSE TO INITIALIZE",
        18,
        "#E2E8F0",
        true
      );
      prompt.align = "center";
      prompt.valign = "middle";
      prompt.x = 120;
      prompt.y = 605;
      prompt.width = stageWidth - 240;
      prompt.height = 30;
      coverRoot.addChild(prompt);
      const chargeDisplay = _IntroUI.createCoverChargeDisplay(stageWidth);
      coverRoot.addChild(chargeDisplay);
      const bottomRail = new Laya.Sprite();
      bottomRail.graphics.drawRect(210, 0, stageWidth - 420, 1, "#1E3A5F");
      bottomRail.graphics.drawRect(stageWidth / 2 - 48, -1, 96, 3, "#8B5CF6");
      bottomRail.y = 660;
      bottomRail.alpha = 0.68;
      coverRoot.addChild(bottomRail);
      coverRoot.on(Laya.Event.MOUSE_DOWN, _IntroUI, _IntroUI.onCoverPointerDown);
      coverRoot.on(Laya.Event.MOUSE_OUT, _IntroUI, _IntroUI.onCoverPointerCancel);
      _IntroUI.container.addChild(coverRoot);
      _IntroUI.coverRoot = coverRoot;
      _IntroUI.bindCoverBackgroundLifecycle();
      _IntroUI.startCoverMotionLoop();
    }
    static createCoverChargeDisplay(stageWidth) {
      const root = new Laya.Sprite();
      root.mouseEnabled = false;
      root.visible = false;
      const barWidth = 540;
      const barHeight = 18;
      const barX = (stageWidth - barWidth) / 2;
      const barY = 638;
      const pulse = new Laya.Sprite();
      pulse.mouseEnabled = false;
      pulse.x = barX - 8;
      pulse.y = barY - 8;
      pulse.graphics.drawPoly(
        0,
        0,
        _IntroUI.cutCornerPoints(barWidth + 16, barHeight + 16, 7),
        "#0EA5E9"
      );
      pulse.alpha = 0;
      root.addChild(pulse);
      const backing = new Laya.Sprite();
      backing.mouseEnabled = false;
      backing.x = barX;
      backing.y = barY;
      backing.graphics.drawPoly(
        0,
        0,
        _IntroUI.cutCornerPoints(barWidth, barHeight, 5),
        "#03101D",
        "#22D3EE",
        1.5
      );
      backing.alpha = 0.92;
      root.addChild(backing);
      const ticks = new Laya.Sprite();
      ticks.mouseEnabled = false;
      ticks.x = barX;
      ticks.y = barY;
      for (let index = 1; index < 12; index++) {
        const x = barWidth * index / 12;
        ticks.graphics.drawLine(x, 4, x, index % 3 === 0 ? 14 : 10, "#164E63", 1);
      }
      ticks.alpha = 0.72;
      root.addChild(ticks);
      const fill = new Laya.Sprite();
      fill.mouseEnabled = false;
      fill.x = barX + 4;
      fill.y = barY + 4;
      root.addChild(fill);
      const leadingEdge = new Laya.Sprite();
      leadingEdge.mouseEnabled = false;
      leadingEdge.y = barY + 2;
      leadingEdge.graphics.drawRect(-2, 0, 4, barHeight - 4, "#E8FDFF");
      leadingEdge.alpha = 0;
      root.addChild(leadingEdge);
      const particleRoot = _IntroUI.createChargeParticlePool();
      root.addChild(particleRoot);
      _IntroUI.chargeBarRoot = root;
      _IntroUI.chargeBarFill = fill;
      _IntroUI.chargeBarLeadingEdge = leadingEdge;
      _IntroUI.chargeBarPulse = pulse;
      _IntroUI.chargeParticleRoot = particleRoot;
      return root;
    }
    static createChargeParticlePool() {
      const root = new Laya.Sprite();
      root.mouseEnabled = false;
      _IntroUI.chargeParticles = [];
      const colors = ["#22D3EE", "#38BDF8", "#67E8F9", "#E8FDFF", "#8B5CF6"];
      for (let index = 0; index < _IntroUI.CHARGE_PARTICLE_POOL_MAX; index++) {
        const node = new Laya.Sprite();
        const size = 1.5 + index % 3 * 0.75;
        node.mouseEnabled = false;
        node.visible = false;
        node.graphics.drawRect(-size / 2, -size / 2, size, size, colors[index % colors.length]);
        root.addChild(node);
        _IntroUI.chargeParticles.push({
          node,
          active: false,
          x: 0,
          y: 0,
          velocityX: 0,
          velocityY: 0,
          ageMs: 0,
          lifetimeMs: 0
        });
      }
      return root;
    }
    static createCoverParticleField(stageWidth, stageHeight) {
      const root = new Laya.Sprite();
      root.mouseEnabled = false;
      _IntroUI.coverParticles = [];
      for (let index = 0; index < 20; index++) {
        const node = new Laya.Sprite();
        const radius = 1.5 + index % 3 * 0.5;
        node.graphics.drawCircle(0, 0, radius, index % 5 === 0 ? "#8B5CF6" : "#38BDF8");
        node.alpha = 0.22 + index % 5 * 0.045;
        const x = 42 + index * 181 % (stageWidth - 84);
        const y = 36 + index * 109 % (stageHeight - 72);
        node.x = x;
        node.y = y;
        root.addChild(node);
        _IntroUI.coverParticles.push({
          node,
          kind: "DUST",
          x,
          y,
          velocityX: -2.4 + index % 5 * 1.2,
          velocityY: 4 + index % 4,
          phase: 0,
          orbitRadius: 0,
          orbitSpeed: 0
        });
      }
      for (let index = 0; index < 8; index++) {
        const node = new Laya.Sprite();
        const width = 4 + index % 3 * 2;
        node.graphics.drawRect(0, 0, width, 2, index % 3 === 0 ? "#7C3AED" : "#0EA5E9");
        node.alpha = 0.28 + index % 3 * 0.09;
        const x = 78 + index * 257 % (stageWidth - 156);
        const y = 58 + index * 137 % (stageHeight - 116);
        node.x = x;
        node.y = y;
        root.addChild(node);
        _IntroUI.coverParticles.push({
          node,
          kind: "FRAGMENT",
          x,
          y,
          velocityX: 3 + index % 4,
          velocityY: 5.5 + index % 3 * 1.5,
          phase: 0,
          orbitRadius: 0,
          orbitSpeed: 0
        });
      }
      for (let index = 0; index < 4; index++) {
        const node = new Laya.Sprite();
        const radius = 2.5 + index * 0.5;
        const color = index % 2 === 0 ? "#67E8F9" : "#A78BFA";
        node.graphics.drawCircle(0, 0, radius + 2, null, color, 1);
        node.graphics.drawCircle(0, 0, radius, color);
        node.alpha = 0.52 + index * 0.06;
        const phase = Math.PI * 2 * index / 4;
        const orbitRadius = 128 + index % 2 * 22;
        const x = stageWidth / 2 + Math.cos(phase) * orbitRadius;
        const y = 390 + Math.sin(phase) * orbitRadius * 0.62;
        node.x = x;
        node.y = y;
        root.addChild(node);
        _IntroUI.coverParticles.push({
          node,
          kind: "MOTE",
          x,
          y,
          velocityX: 0,
          velocityY: 0,
          phase,
          orbitRadius,
          orbitSpeed: 0.075 + index * 0.012
        });
      }
      _IntroUI.coverParticleRoot = root;
      return root;
    }
    static createCoverTrackingFrame(stageWidth, stageHeight) {
      const root = new Laya.Sprite();
      root.mouseEnabled = false;
      _IntroUI.coverTrackingMarkers = [];
      const addMarker = (x, y, horizontalDirection, verticalDirection, color, axis, phase, speed) => {
        const node = new Laya.Sprite();
        node.mouseEnabled = false;
        node.graphics.drawLine(0, 0, horizontalDirection * 11, 0, color, 1.5);
        node.graphics.drawLine(horizontalDirection * 17, 0, horizontalDirection * 34, 0, color, 1.5);
        node.graphics.drawLine(0, 0, 0, verticalDirection * 13, color, 1.5);
        node.graphics.drawCircle(horizontalDirection * 40, 0, 1.5, color);
        node.alpha = 0.42;
        node.x = x;
        node.y = y;
        root.addChild(node);
        _IntroUI.coverTrackingMarkers.push({
          node,
          originX: x,
          originY: y,
          axis,
          amplitude: 2.5,
          phase,
          speed
        });
      };
      addMarker(88, 142, 1, 1, "#38BDF8", "X", 0.2, 0.34);
      addMarker(stageWidth - 88, 142, -1, 1, "#8B5CF6", "Y", 1.7, 0.29);
      addMarker(88, stageHeight - 116, 1, -1, "#8B5CF6", "Y", 3.1, 0.31);
      addMarker(stageWidth - 88, stageHeight - 116, -1, -1, "#38BDF8", "X", 4.6, 0.27);
      _IntroUI.coverTrackingRoot = root;
      return root;
    }
    static startCoverMotionLoop() {
      if (_IntroUI.coverMotionLoopActive || !_IntroUI.coverParticleRoot || !_IntroUI.coverCoreRoot) {
        return;
      }
      Laya.timer.frameLoop(1, _IntroUI, _IntroUI.updateCoverMotion);
      _IntroUI.coverMotionLoopActive = true;
    }
    static updateCoverMotion() {
      var _a;
      if (_IntroUI.view !== _IntroUI.COVER || !_IntroUI.coverParticleRoot || !_IntroUI.coverCoreRoot) {
        _IntroUI.stopCoverMotionLoop();
        return;
      }
      const rawDelta = Number((_a = Laya.timer) == null ? void 0 : _a.delta);
      const deltaMs = Number.isFinite(rawDelta) ? Math.min(Math.max(rawDelta, 0), 50) : 16.67;
      const deltaSeconds = deltaMs / 1e3;
      const stageWidth = Laya.stage.width;
      const stageHeight = Laya.stage.height;
      _IntroUI.coverMotionElapsedSeconds += deltaSeconds;
      for (const particle of _IntroUI.coverParticles) {
        if (particle.kind === "MOTE") {
          particle.phase += particle.orbitSpeed * deltaSeconds;
          particle.x = stageWidth / 2 + Math.cos(particle.phase) * particle.orbitRadius;
          particle.y = 390 + Math.sin(particle.phase) * particle.orbitRadius * 0.62;
        } else {
          particle.x += particle.velocityX * deltaSeconds;
          particle.y += particle.velocityY * deltaSeconds;
          if (particle.y > stageHeight + 8)
            particle.y = -8;
          if (particle.x > stageWidth + 8)
            particle.x = -8;
          if (particle.x < -8)
            particle.x = stageWidth + 8;
        }
        particle.node.x = particle.x;
        particle.node.y = particle.y;
      }
      if (_IntroUI.coverOuterTickRing) {
        _IntroUI.coverOuterTickRing.rotation = (_IntroUI.coverOuterTickRing.rotation + 2.4 * deltaSeconds) % 360;
      }
      if (_IntroUI.coverInnerArcRing) {
        _IntroUI.coverInnerArcRing.rotation = (_IntroUI.coverInnerArcRing.rotation - 1.25 * deltaSeconds + 360) % 360;
      }
      for (const marker of _IntroUI.coverTrackingMarkers) {
        const offset = Math.sin(
          _IntroUI.coverMotionElapsedSeconds * marker.speed + marker.phase
        ) * marker.amplitude;
        marker.node.x = marker.originX + (marker.axis === "X" ? offset : 0);
        marker.node.y = marker.originY + (marker.axis === "Y" ? offset : 0);
      }
      _IntroUI.updateCoverHold(deltaMs);
      if (_IntroUI.view !== _IntroUI.COVER) {
        return;
      }
      _IntroUI.updateChargeParticles(deltaMs);
      _IntroUI.drawCoverChargeProgress();
    }
    static beginCoverHold(source, pointerId = null, event = null) {
      var _a, _b;
      if (_IntroUI.view !== _IntroUI.COVER || _IntroUI.coverDismissed || _IntroUI.coverHoldState !== "IDLE" || _IntroUI.coverHoldSource !== "NONE") {
        _IntroUI.stopEvent(event);
        return;
      }
      _IntroUI.coverHoldState = "CHARGING";
      _IntroUI.coverHoldSource = source;
      _IntroUI.activeHoldPointerId = source === "POINTER" ? pointerId : null;
      _IntroUI.coverChargeElapsedMs = 0;
      _IntroUI.coverChargeProgress = 0;
      _IntroUI.chargeParticleEmissionElapsedMs = 0;
      if (_IntroUI.chargeBarRoot) {
        _IntroUI.chargeBarRoot.visible = true;
      }
      (_b = (_a = _IntroUI.lifecycleCallbacks).onCoverInteractionStarted) == null ? void 0 : _b.call(_a);
      _IntroUI.stopEvent(event);
    }
    static cancelCoverHold() {
      if (_IntroUI.coverHoldState !== "CHARGING") {
        return;
      }
      _IntroUI.coverHoldState = "DECAYING";
      _IntroUI.coverHoldSource = "NONE";
      _IntroUI.activeHoldPointerId = null;
      _IntroUI.chargeParticleEmissionElapsedMs = 0;
    }
    static updateCoverHold(deltaMs) {
      if (_IntroUI.coverHoldState === "CHARGING") {
        _IntroUI.coverChargeElapsedMs = Math.min(
          _IntroUI.FULL_CHARGE_MS,
          _IntroUI.coverChargeElapsedMs + deltaMs
        );
        _IntroUI.coverChargeProgress = _IntroUI.coverChargeElapsedMs / _IntroUI.FULL_CHARGE_MS;
        _IntroUI.chargeParticleEmissionElapsedMs += deltaMs;
        while (_IntroUI.chargeParticleEmissionElapsedMs >= 70) {
          _IntroUI.chargeParticleEmissionElapsedMs -= 70;
          _IntroUI.emitChargeParticle(false);
        }
        if (_IntroUI.coverChargeProgress >= 1) {
          const completedSource = _IntroUI.coverHoldSource;
          const completedPointerId = _IntroUI.activeHoldPointerId;
          _IntroUI.coverHoldState = "COMPLETING";
          _IntroUI.coverCompletionElapsedMs = 0;
          _IntroUI.coverHoldSource = "NONE";
          _IntroUI.activeHoldPointerId = null;
          if (completedSource === "KEY_ENTER") {
            _IntroUI.coverEnterReleaseRequired = true;
          } else if (completedSource === "POINTER") {
            _IntroUI.menuPointerActivationState = "WAITING_FOR_OLD_RELEASE";
            _IntroUI.blockedCoverPointerId = completedPointerId;
          }
          _IntroUI.emitCompletionParticleBurst();
        }
        return;
      }
      if (_IntroUI.coverHoldState === "DECAYING") {
        _IntroUI.coverChargeProgress = Math.max(
          0,
          _IntroUI.coverChargeProgress - deltaMs / _IntroUI.DECAY_MS
        );
        if (_IntroUI.coverChargeProgress <= 0) {
          _IntroUI.coverChargeProgress = 0;
          _IntroUI.coverChargeElapsedMs = 0;
          _IntroUI.coverHoldState = "IDLE";
        }
        return;
      }
      if (_IntroUI.coverHoldState === "COMPLETING") {
        _IntroUI.coverCompletionElapsedMs += deltaMs;
        if (_IntroUI.coverCompletionElapsedMs >= _IntroUI.SUCCESS_MS) {
          _IntroUI.enterMainMenuAfterCover();
        }
      }
    }
    static emitChargeParticle(completionBurst) {
      if (!_IntroUI.chargeParticles.length) {
        return;
      }
      const particle = _IntroUI.chargeParticles[_IntroUI.chargeParticleSequence % _IntroUI.chargeParticles.length];
      const sequence = _IntroUI.chargeParticleSequence++;
      const barWidth = 540;
      const barX = (Laya.stage.width - barWidth) / 2;
      const barY = 638;
      const leadingX = barX + 4 + (barWidth - 8) * _IntroUI.coverChargeProgress;
      const originMode = sequence % 6;
      const originX = completionBurst ? barX + 12 + sequence * 47 % (barWidth - 24) : originMode === 0 ? barX + 4 : originMode === 1 ? barX + barWidth - 4 : leadingX + (sequence % 3 - 1) * 5;
      const direction = sequence % 5 - 2;
      particle.active = true;
      particle.x = originX;
      particle.y = barY + (completionBurst ? 8 : 5 + sequence % 8);
      particle.velocityX = direction * (completionBurst ? 34 : 19);
      particle.velocityY = -(completionBurst ? 105 + sequence % 4 * 18 : 72 + sequence % 5 * 11);
      particle.ageMs = 0;
      particle.lifetimeMs = completionBurst ? 380 + sequence % 4 * 45 : 300 + sequence % 5 * 42;
      particle.node.x = particle.x;
      particle.node.y = particle.y;
      particle.node.alpha = 1;
      particle.node.visible = true;
    }
    static emitCompletionParticleBurst() {
      for (let index = 0; index < 12; index++) {
        _IntroUI.emitChargeParticle(true);
      }
    }
    static updateChargeParticles(deltaMs) {
      const deltaSeconds = deltaMs / 1e3;
      for (const particle of _IntroUI.chargeParticles) {
        if (!particle.active) {
          continue;
        }
        particle.ageMs += deltaMs;
        if (particle.ageMs >= particle.lifetimeMs) {
          particle.active = false;
          particle.node.visible = false;
          continue;
        }
        particle.velocityY += 24 * deltaSeconds;
        particle.x += particle.velocityX * deltaSeconds;
        particle.y += particle.velocityY * deltaSeconds;
        particle.node.x = particle.x;
        particle.node.y = particle.y;
        particle.node.alpha = Math.max(0, 1 - particle.ageMs / particle.lifetimeMs);
      }
    }
    static drawCoverChargeProgress() {
      if (!_IntroUI.chargeBarRoot || !_IntroUI.chargeBarFill || !_IntroUI.chargeBarLeadingEdge) {
        return;
      }
      const active = _IntroUI.coverHoldState !== "IDLE" || _IntroUI.coverChargeProgress > 0;
      _IntroUI.chargeBarRoot.visible = active;
      if (!active) {
        _IntroUI.chargeBarLeadingEdge.alpha = 0;
        if (_IntroUI.coverStatusText)
          _IntroUI.coverStatusText.text = "SYSTEM READY";
        return;
      }
      const innerWidth = 532;
      const fillWidth = innerWidth * _IntroUI.coverChargeProgress;
      _IntroUI.chargeBarFill.graphics.clear();
      if (fillWidth > 0) {
        _IntroUI.chargeBarFill.graphics.drawRect(0, 0, fillWidth, 10, "#0EA5E9");
        _IntroUI.chargeBarFill.graphics.drawRect(0, 1, fillWidth, 2, "#67E8F9");
      }
      _IntroUI.chargeBarLeadingEdge.x = (Laya.stage.width - 540) / 2 + 4 + fillWidth;
      _IntroUI.chargeBarLeadingEdge.alpha = fillWidth > 1 ? 0.92 : 0;
      if (_IntroUI.coverHoldState === "COMPLETING") {
        if (_IntroUI.coverStatusText)
          _IntroUI.coverStatusText.text = "CORE LINK ESTABLISHED";
        if (_IntroUI.chargeBarPulse) {
          _IntroUI.chargeBarPulse.alpha = 0.12 + 0.2 * Math.sin(
            Math.min(1, _IntroUI.coverCompletionElapsedMs / _IntroUI.SUCCESS_MS) * Math.PI
          );
        }
        return;
      }
      if (_IntroUI.chargeBarPulse)
        _IntroUI.chargeBarPulse.alpha = 0;
      const percentage = Math.round(_IntroUI.coverChargeProgress * 100);
      if (_IntroUI.coverStatusText) {
        _IntroUI.coverStatusText.text = _IntroUI.coverHoldState === "DECAYING" ? `SIGNAL DECAY // ${percentage}%` : `INITIALIZING // ${percentage}%`;
      }
    }
    static stopCoverMotionLoop() {
      if (!_IntroUI.coverMotionLoopActive) {
        return;
      }
      Laya.timer.clear(_IntroUI, _IntroUI.updateCoverMotion);
      _IntroUI.coverMotionLoopActive = false;
    }
    static clearCoverParticles() {
      _IntroUI.coverParticles = [];
      if (_IntroUI.coverParticleRoot) {
        _IntroUI.coverParticleRoot.removeSelf();
        _IntroUI.coverParticleRoot.destroy(true);
        _IntroUI.coverParticleRoot = null;
      }
    }
    static clearCoverMotionVisuals() {
      _IntroUI.stopCoverMotionLoop();
      _IntroUI.clearCoverParticles();
      if (_IntroUI.coverCoreRoot) {
        _IntroUI.coverCoreRoot.removeSelf();
        _IntroUI.coverCoreRoot.destroy(true);
      }
      if (_IntroUI.coverTrackingRoot) {
        _IntroUI.coverTrackingRoot.removeSelf();
        _IntroUI.coverTrackingRoot.destroy(true);
      }
      _IntroUI.coverCoreRoot = null;
      _IntroUI.coverHeroBallRoot = null;
      _IntroUI.coverOuterTickRing = null;
      _IntroUI.coverInnerArcRing = null;
      _IntroUI.coverTrackingRoot = null;
      _IntroUI.coverTrackingMarkers = [];
      _IntroUI.coverMotionElapsedSeconds = 0;
    }
    static clearCoverChargeState() {
      for (const particle of _IntroUI.chargeParticles) {
        particle.active = false;
        particle.node.visible = false;
      }
      _IntroUI.chargeParticles = [];
      _IntroUI.chargeParticleRoot = null;
      _IntroUI.chargeBarRoot = null;
      _IntroUI.chargeBarFill = null;
      _IntroUI.chargeBarLeadingEdge = null;
      _IntroUI.chargeBarPulse = null;
      _IntroUI.coverStatusText = null;
      _IntroUI.coverHoldState = "IDLE";
      _IntroUI.coverHoldSource = "NONE";
      _IntroUI.activeHoldPointerId = null;
      _IntroUI.coverChargeElapsedMs = 0;
      _IntroUI.coverChargeProgress = 0;
      _IntroUI.coverCompletionElapsedMs = 0;
      _IntroUI.chargeParticleEmissionElapsedMs = 0;
      _IntroUI.chargeParticleSequence = 0;
    }
    static bindCoverBackgroundLifecycle() {
      var _a, _b, _c, _d, _e, _f, _g, _h;
      _IntroUI.unbindCoverBackgroundLifecycle();
      _IntroUI.coverBrowserWindow = ((_a = Laya.Browser) == null ? void 0 : _a.window) || null;
      _IntroUI.coverBrowserDocument = ((_b = _IntroUI.coverBrowserWindow) == null ? void 0 : _b.document) || null;
      (_d = (_c = _IntroUI.coverBrowserWindow) == null ? void 0 : _c.addEventListener) == null ? void 0 : _d.call(_c, "touchcancel", _IntroUI.onCoverPointerCancel);
      (_f = (_e = _IntroUI.coverBrowserWindow) == null ? void 0 : _e.addEventListener) == null ? void 0 : _f.call(_e, "pagehide", _IntroUI.onCoverBackgroundCancel);
      (_h = (_g = _IntroUI.coverBrowserDocument) == null ? void 0 : _g.addEventListener) == null ? void 0 : _h.call(_g, "visibilitychange", _IntroUI.onCoverVisibilityChange);
    }
    static unbindCoverBackgroundLifecycle() {
      var _a, _b, _c, _d, _e, _f;
      (_b = (_a = _IntroUI.coverBrowserWindow) == null ? void 0 : _a.removeEventListener) == null ? void 0 : _b.call(_a, "touchcancel", _IntroUI.onCoverPointerCancel);
      (_d = (_c = _IntroUI.coverBrowserWindow) == null ? void 0 : _c.removeEventListener) == null ? void 0 : _d.call(_c, "pagehide", _IntroUI.onCoverBackgroundCancel);
      (_f = (_e = _IntroUI.coverBrowserDocument) == null ? void 0 : _e.removeEventListener) == null ? void 0 : _f.call(_e, "visibilitychange", _IntroUI.onCoverVisibilityChange);
      _IntroUI.coverBrowserWindow = null;
      _IntroUI.coverBrowserDocument = null;
    }
    static onCoverBackgroundCancel() {
      _IntroUI.cancelCoverHold();
    }
    static onCoverVisibilityChange() {
      var _a, _b;
      if (((_a = _IntroUI.coverBrowserDocument) == null ? void 0 : _a.hidden) === true || ((_b = _IntroUI.coverBrowserDocument) == null ? void 0 : _b.visibilityState) === "hidden") {
        _IntroUI.cancelCoverHold();
      }
    }
    static createCoverCore() {
      const core = new Laya.Sprite();
      core.mouseEnabled = false;
      const outerTickRing = new Laya.Sprite();
      outerTickRing.mouseEnabled = false;
      const tickCount = 24;
      for (let index = 0; index < tickCount; index++) {
        const angle = Math.PI * 2 * index / tickCount;
        const innerRadius = index % 3 === 0 ? 101 : 106;
        const outerRadius = index % 3 === 0 ? 121 : 116;
        const color = index % 6 === 0 ? "#A78BFA" : "#38BDF8";
        outerTickRing.graphics.drawLine(
          Math.cos(angle) * innerRadius,
          Math.sin(angle) * innerRadius,
          Math.cos(angle) * outerRadius,
          Math.sin(angle) * outerRadius,
          color,
          index % 3 === 0 ? 2 : 1.5
        );
      }
      core.addChild(outerTickRing);
      const innerArcRing = new Laya.Sprite();
      innerArcRing.mouseEnabled = false;
      _IntroUI.drawCoverArc(innerArcRing.graphics, 76, 14, 68, "#38BDF8", 1.5, 8);
      _IntroUI.drawCoverArc(innerArcRing.graphics, 76, 104, 146, "#6D5AA8", 2, 7);
      _IntroUI.drawCoverArc(innerArcRing.graphics, 76, 205, 284, "#8B5CF6", 2, 11);
      _IntroUI.drawCoverArc(innerArcRing.graphics, 76, 319, 346, "#38BDF8", 1.5, 5);
      innerArcRing.alpha = 0.78;
      core.addChild(innerArcRing);
      const rings = new Laya.Sprite();
      rings.mouseEnabled = false;
      rings.graphics.drawCircle(0, 0, 116, null, "#164E63", 1);
      rings.graphics.drawCircle(0, 0, 92, null, "#0EA5E9", 2);
      rings.graphics.drawCircle(0, 0, 67, null, "#6D5AA8", 2);
      rings.graphics.drawCircle(0, 0, 39, "#071B2E", "#67E8F9", 2);
      rings.graphics.drawLine(-150, 0, -126, 0, "#22D3EE", 2);
      rings.graphics.drawLine(126, 0, 150, 0, "#22D3EE", 2);
      rings.graphics.drawLine(0, -150, 0, -126, "#8B5CF6", 2);
      rings.graphics.drawLine(0, 126, 0, 150, "#8B5CF6", 2);
      core.addChild(rings);
      const heroBall = _IntroUI.createCoverHeroBall();
      core.addChild(heroBall);
      _IntroUI.coverCoreRoot = core;
      _IntroUI.coverHeroBallRoot = heroBall;
      _IntroUI.coverOuterTickRing = outerTickRing;
      _IntroUI.coverInnerArcRing = innerArcRing;
      return core;
    }
    static createCoverHeroBall() {
      const root = new Laya.Sprite();
      root.mouseEnabled = false;
      const aura = new Laya.Sprite();
      aura.mouseEnabled = false;
      aura.graphics.drawCircle(0, 0, 30, "#123D5C");
      aura.graphics.drawCircle(0, 0, 25, "#176E92");
      aura.alpha = 0.2;
      root.addChild(aura);
      const shell = new Laya.Sprite();
      shell.mouseEnabled = false;
      shell.graphics.drawCircle(0, 0, 20.5, "#071824", "#74FAFF", 2);
      shell.graphics.drawPoly(
        0,
        0,
        [0, -19, 16.2, -9.5, 16.2, 9.5, 0, 19, -16.2, 9.5, -16.2, -9.5],
        "#0B2637",
        "#35E9FF",
        1.5
      );
      root.addChild(shell);
      const plasmaCore = new Laya.Sprite();
      plasmaCore.mouseEnabled = false;
      plasmaCore.graphics.drawCircle(0, 0, 10.5, "#19DCE8", "#D8FFFF", 1.5);
      plasmaCore.graphics.drawCircle(0, 0, 5.2, "#F4FFFF");
      plasmaCore.graphics.drawCircle(-2.2, -2.4, 1.7, "#FFFFFF");
      root.addChild(plasmaCore);
      const circuits = new Laya.Sprite();
      circuits.mouseEnabled = false;
      circuits.graphics.drawLine(-15.4, -6.4, -10.3, -4.2, "#A96CFF", 1.5);
      circuits.graphics.drawLine(-10.3, -4.2, -8.1, -1.2, "#A96CFF", 1.5);
      circuits.graphics.drawLine(8.1, 1.2, 10.3, 4.2, "#A96CFF", 1.5);
      circuits.graphics.drawLine(10.3, 4.2, 15.4, 6.4, "#A96CFF", 1.5);
      circuits.graphics.drawLine(-4.1, 12.4, 0, 17.6, "#53F8FF", 1.5);
      circuits.graphics.drawLine(4.1, -12.4, 0, -17.6, "#53F8FF", 1.5);
      circuits.graphics.drawCircle(-14.8, -6.2, 1.4, "#F7B5FF");
      circuits.graphics.drawCircle(14.8, 6.2, 1.4, "#F7B5FF");
      root.addChild(circuits);
      return root;
    }
    static drawCoverArc(graphics, radius, startDegrees, endDegrees, color, lineWidth, segmentCount) {
      const degreeToRadian = Math.PI / 180;
      for (let index = 0; index < segmentCount; index++) {
        const start = startDegrees + (endDegrees - startDegrees) * (index / segmentCount);
        const end = startDegrees + (endDegrees - startDegrees) * ((index + 1) / segmentCount);
        graphics.drawLine(
          Math.cos(start * degreeToRadian) * radius,
          Math.sin(start * degreeToRadian) * radius,
          Math.cos(end * degreeToRadian) * radius,
          Math.sin(end * degreeToRadian) * radius,
          color,
          lineWidth
        );
      }
    }
    static renderMainMenu() {
      _IntroUI.clearView();
      _IntroUI.viewRoot = new Laya.Sprite();
      _IntroUI.panel.addChild(_IntroUI.viewRoot);
      const systemLabel = _IntroUI.createText(
        "SYS://CORE_BOOT    SIMULATION NODE 01    STATUS: READY",
        13,
        "#38BDF8",
        true
      );
      systemLabel.align = "center";
      systemLabel.x = 40;
      systemLabel.y = 28;
      systemLabel.width = 820;
      systemLabel.height = 22;
      _IntroUI.viewRoot.addChild(systemLabel);
      const title = _IntroUI.createText("BALL GAME", 48, "#F8FAFC", true);
      title.align = "center";
      title.valign = "middle";
      title.x = 40;
      title.y = 51;
      title.width = 820;
      title.height = 60;
      _IntroUI.viewRoot.addChild(title);
      const subtitle = _IntroUI.createText("CYBER CORE TRIAL", 18, "#A78BFA", true);
      subtitle.align = "center";
      subtitle.valign = "middle";
      subtitle.x = 40;
      subtitle.y = 108;
      subtitle.width = 820;
      subtitle.height = 28;
      _IntroUI.viewRoot.addChild(subtitle);
      const mission = _IntroUI.createText(
        "Ascend four sectors. Absorb energy. Survive the simulation.",
        18,
        "#B8C7DA",
        false
      );
      mission.align = "center";
      mission.valign = "middle";
      mission.x = 70;
      mission.y = 145;
      mission.width = 760;
      mission.height = 30;
      _IntroUI.viewRoot.addChild(mission);
      const divider = new Laya.Sprite();
      divider.graphics.drawRect(188, 0, 524, 1, "#1E3A5F");
      divider.graphics.drawRect(410, -1, 80, 3, "#0EA5E9");
      divider.y = 190;
      _IntroUI.viewRoot.addChild(divider);
      const startButton = _IntroUI.createButton("START GAME", 640, 78, "PRIMARY");
      startButton.x = 130;
      startButton.y = 220;
      const helpLabel = _IntroUI.mobileTouchSession ? "TOUCH CONTROLS  /  HOW TO PLAY" : "CONTROL TEST  /  HOW TO PLAY";
      const howToPlayButton = _IntroUI.createButton(helpLabel, 640, 64, "SECONDARY");
      howToPlayButton.x = 130;
      howToPlayButton.y = 326;
      _IntroUI.viewRoot.addChild(startButton);
      _IntroUI.viewRoot.addChild(howToPlayButton);
      _IntroUI.menuItems = [startButton, howToPlayButton];
      for (const item of _IntroUI.menuItems) {
        item.on(Laya.Event.MOUSE_OVER, _IntroUI, _IntroUI.onMenuHover);
        item.on(Laya.Event.MOUSE_DOWN, _IntroUI, _IntroUI.onMenuPointerDown);
        item.on(Laya.Event.MOUSE_UP, _IntroUI, _IntroUI.onMenuPointerUp);
        item.on(Laya.Event.MOUSE_OUT, _IntroUI, _IntroUI.onMenuPointerCancel);
        item.on(Laya.Event.CLICK, _IntroUI, _IntroUI.onMenuClick);
        _IntroUI.boundItems.push(item);
      }
      _IntroUI.updateMainSelection();
      const hint = _IntroUI.createText(
        _IntroUI.mobileTouchSession ? "TAP AN OPTION TO SELECT" : "W / ↑  PREVIOUS      S / ↓  NEXT      ENTER  CONFIRM",
        15,
        "#94A3B8",
        false
      );
      hint.align = "center";
      hint.valign = "middle";
      hint.x = 40;
      hint.y = 420;
      hint.width = 820;
      hint.height = 28;
      _IntroUI.viewRoot.addChild(hint);
      if (!_IntroUI.mobileTouchSession) {
        const touchHint = _IntroUI.createText(
          "Mouse or touch an item to select and confirm",
          15,
          "#64748B",
          false
        );
        touchHint.align = "center";
        touchHint.valign = "middle";
        touchHint.x = 40;
        touchHint.y = 454;
        touchHint.width = 820;
        touchHint.height = 26;
        _IntroUI.viewRoot.addChild(touchHint);
      }
      const footer = _IntroUI.createText(
        "CORE LINK: STANDBY    //    INPUT CHANNEL: AVAILABLE",
        12,
        "#35627A",
        true
      );
      footer.align = "center";
      footer.x = 40;
      footer.y = 526;
      footer.width = 820;
      footer.height = 18;
      _IntroUI.viewRoot.addChild(footer);
    }
    static renderHowToPlay() {
      if (_IntroUI.mobileTouchSession) {
        _IntroUI.renderMobileHowToPlay();
        return;
      }
      _IntroUI.clearView();
      _IntroUI.viewRoot = new Laya.Sprite();
      _IntroUI.panel.addChild(_IntroUI.viewRoot);
      const title = _IntroUI.createText("CONTROL TEST", 32, "#F8FAFC", true);
      title.align = "center";
      title.valign = "middle";
      title.x = 40;
      title.y = 24;
      title.width = 820;
      title.height = 42;
      _IntroUI.viewRoot.addChild(title);
      const inputLabel = _IntroUI.createText("INPUT TEST", 14, "#22D3EE", true);
      inputLabel.align = "center";
      inputLabel.x = 40;
      inputLabel.y = 68;
      inputLabel.width = 820;
      inputLabel.height = 20;
      _IntroUI.viewRoot.addChild(inputLabel);
      const instruction = _IntroUI.createText(
        "Press the keys below to verify input.",
        16,
        "#B8C7DA",
        false
      );
      instruction.align = "center";
      instruction.x = 40;
      instruction.y = 91;
      instruction.width = 820;
      instruction.height = 24;
      _IntroUI.viewRoot.addChild(instruction);
      const testMode = _IntroUI.createText(
        "TEST MODE  ·  GAME ACTIONS DISABLED",
        13,
        "#C4B5FD",
        true
      );
      testMode.align = "center";
      testMode.x = 248;
      testMode.y = 119;
      testMode.width = 404;
      testMode.height = 22;
      testMode.graphics.drawRect(0, 0, 404, 22, "#17142F", "#6D5AA8", 1);
      _IntroUI.viewRoot.addChild(testMode);
      _IntroUI.addSectionLabel("PRIMARY", 78, 158, 248, "#38BDF8");
      _IntroUI.addSectionLabel("ALTERNATE", 328, 158, 248, "#64748B");
      _IntroUI.addSectionLabel("UTILITY", 602, 158, 220, "#64748B");
      _IntroUI.createKeycap("W", "W", 160, 190, 74, 54, "PRIMARY");
      _IntroUI.createKeycap("A", "A", 111, 254, 74, 54, "PRIMARY");
      _IntroUI.createKeycap("D", "D", 209, 254, 74, 54, "PRIMARY");
      _IntroUI.createKeycap("UP", "↑", 417, 193, 64, 48, "ALTERNATE");
      _IntroUI.createKeycap("LEFT", "←", 375, 253, 64, 48, "ALTERNATE");
      _IntroUI.createKeycap("RIGHT", "→", 459, 253, 64, 48, "ALTERNATE");
      _IntroUI.createUtilityKey("R", "RESTART", 626, 184);
      _IntroUI.createUtilityKey("M", "MUTE", 626, 242);
      _IntroUI.createUtilityKey("P", "PAUSE", 626, 300);
      const note = _IntroUI.createText(
        "PHYSICAL KEYBOARD TEST  ·  Use a keyboard to test key input.",
        13,
        "#718096",
        false
      );
      note.align = "center";
      note.x = 80;
      note.y = 359;
      note.width = 740;
      note.height = 22;
      _IntroUI.viewRoot.addChild(note);
      const reference = _IntroUI.createText(
        "MOVE  A / D or ← / →    JUMP  W or ↑    R  RESTART    M  MUTE    P  PAUSE / TOP-RIGHT ICON",
        14,
        "#94A3B8",
        false
      );
      reference.align = "center";
      reference.x = 55;
      reference.y = 386;
      reference.width = 790;
      reference.height = 22;
      _IntroUI.viewRoot.addChild(reference);
      const backButton = _IntroUI.createButton("BACK", 640, 60, "BACK");
      backButton.x = 130;
      backButton.y = 422;
      _IntroUI.viewRoot.addChild(backButton);
      _IntroUI.updateButton(backButton, true);
      backButton.on(Laya.Event.MOUSE_DOWN, _IntroUI, _IntroUI.onMenuPointerDown);
      backButton.on(Laya.Event.MOUSE_UP, _IntroUI, _IntroUI.onMenuPointerUp);
      backButton.on(Laya.Event.MOUSE_OUT, _IntroUI, _IntroUI.onMenuPointerCancel);
      backButton.on(Laya.Event.CLICK, _IntroUI, _IntroUI.onMenuClick);
      _IntroUI.boundItems.push(backButton);
      const hint = _IntroUI.createText("ENTER or ESC  ·  BACK", 14, "#64748B", false);
      hint.align = "center";
      hint.valign = "middle";
      hint.x = 40;
      hint.y = 494;
      hint.width = 820;
      hint.height = 24;
      _IntroUI.viewRoot.addChild(hint);
      const footer = _IntroUI.createText(
        "OBSERVER ONLY    //    NO GAMEPLAY ACTIONS    //    MULTIKEY READY",
        12,
        "#35627A",
        true
      );
      footer.align = "center";
      footer.x = 40;
      footer.y = 532;
      footer.width = 820;
      footer.height = 18;
      _IntroUI.viewRoot.addChild(footer);
      _IntroUI.startKeyFeedbackLoop();
    }
    static renderMobileHowToPlay() {
      _IntroUI.clearView();
      _IntroUI.viewRoot = new Laya.Sprite();
      _IntroUI.panel.addChild(_IntroUI.viewRoot);
      const title = _IntroUI.createText("TOUCH CONTROLS", 32, "#F8FAFC", true);
      title.align = "center";
      title.valign = "middle";
      title.x = 40;
      title.y = 24;
      title.width = 820;
      title.height = 42;
      _IntroUI.viewRoot.addChild(title);
      const inputLabel = _IntroUI.createText("MOBILE INPUT GUIDE", 14, "#22D3EE", true);
      inputLabel.align = "center";
      inputLabel.x = 40;
      inputLabel.y = 68;
      inputLabel.width = 820;
      inputLabel.height = 20;
      _IntroUI.viewRoot.addChild(inputLabel);
      const instruction = _IntroUI.createText(
        "Use the on-screen controls during play.",
        16,
        "#B8C7DA",
        false
      );
      instruction.align = "center";
      instruction.x = 40;
      instruction.y = 94;
      instruction.width = 820;
      instruction.height = 24;
      _IntroUI.viewRoot.addChild(instruction);
      const guideMode = _IntroUI.createText(
        "GUIDE MODE  ·  GAME ACTIONS DISABLED",
        13,
        "#C4B5FD",
        true
      );
      guideMode.align = "center";
      guideMode.x = 248;
      guideMode.y = 124;
      guideMode.width = 404;
      guideMode.height = 22;
      guideMode.graphics.drawRect(0, 0, 404, 22, "#17142F", "#6D5AA8", 1);
      _IntroUI.viewRoot.addChild(guideMode);
      _IntroUI.createTouchGuideCard(
        "MOVE",
        "LEFT   /   RIGHT",
        "Use LEFT and RIGHT to move.",
        80,
        168,
        470,
        "DIRECTION"
      );
      _IntroUI.createTouchGuideCard(
        "JUMP",
        "JUMP",
        "Tap JUMP to jump.",
        574,
        168,
        246,
        "JUMP"
      );
      const backButton = _IntroUI.createButton("BACK", 640, 60, "BACK");
      backButton.x = 130;
      backButton.y = 422;
      _IntroUI.viewRoot.addChild(backButton);
      _IntroUI.updateButton(backButton, true);
      backButton.on(Laya.Event.MOUSE_DOWN, _IntroUI, _IntroUI.onMenuPointerDown);
      backButton.on(Laya.Event.MOUSE_UP, _IntroUI, _IntroUI.onMenuPointerUp);
      backButton.on(Laya.Event.MOUSE_OUT, _IntroUI, _IntroUI.onMenuPointerCancel);
      backButton.on(Laya.Event.CLICK, _IntroUI, _IntroUI.onMenuClick);
      _IntroUI.boundItems.push(backButton);
      const hint = _IntroUI.createText("TAP BACK TO RETURN", 14, "#64748B", false);
      hint.align = "center";
      hint.valign = "middle";
      hint.x = 40;
      hint.y = 494;
      hint.width = 820;
      hint.height = 24;
      _IntroUI.viewRoot.addChild(hint);
      const footer = _IntroUI.createText(
        "TOUCH LINK READY    //    MOVE + JUMP",
        12,
        "#35627A",
        true
      );
      footer.align = "center";
      footer.x = 40;
      footer.y = 532;
      footer.width = 820;
      footer.height = 18;
      _IntroUI.viewRoot.addChild(footer);
    }
    static createTouchGuideCard(action, controls, detail, x, y, width, glyph) {
      const height = 202;
      const card = new Laya.Sprite();
      card.x = x;
      card.y = y;
      card.width = width;
      card.height = height;
      card.mouseEnabled = false;
      card.graphics.drawPoly(
        0,
        0,
        _IntroUI.cutCornerPoints(width, height, 12),
        "#06111F",
        glyph === "DIRECTION" ? "#22D3EE" : "#8B5CF6",
        2
      );
      card.graphics.drawRect(18, 18, width - 36, 2, glyph === "DIRECTION" ? "#155E75" : "#5B4A96");
      _IntroUI.viewRoot.addChild(card);
      const actionLabel = _IntroUI.createText(action, 16, "#E8FAFF", true);
      actionLabel.x = 22;
      actionLabel.y = 28;
      actionLabel.width = width - 44;
      actionLabel.height = 24;
      actionLabel.align = "center";
      card.addChild(actionLabel);
      const glyphRoot = new Laya.Sprite();
      glyphRoot.mouseEnabled = false;
      card.addChild(glyphRoot);
      if (glyph === "DIRECTION") {
        _IntroUI.drawTouchGuideButton(glyphRoot, 119, 66, 64, "LEFT");
        _IntroUI.drawTouchGuideButton(glyphRoot, 287, 66, 64, "RIGHT");
      } else {
        _IntroUI.drawTouchGuideButton(glyphRoot, 91, 66, 64, "JUMP");
      }
      const controlsLabel = _IntroUI.createText(controls, 14, "#67E8F9", true);
      controlsLabel.x = 18;
      controlsLabel.y = 137;
      controlsLabel.width = width - 36;
      controlsLabel.height = 20;
      controlsLabel.align = "center";
      card.addChild(controlsLabel);
      const detailLabel = _IntroUI.createText(detail, 13, "#94A3B8", false);
      detailLabel.x = 18;
      detailLabel.y = 166;
      detailLabel.width = width - 36;
      detailLabel.height = 20;
      detailLabel.align = "center";
      card.addChild(detailLabel);
    }
    static drawTouchGuideButton(root, x, y, size, control) {
      const button = new Laya.Sprite();
      button.x = x;
      button.y = y;
      button.width = size;
      button.height = size;
      button.mouseEnabled = false;
      button.graphics.drawPoly(
        0,
        0,
        _IntroUI.cutCornerPoints(size, size, 9),
        "#0A2638",
        "#6AF7FF",
        2
      );
      const center = size / 2;
      if (control === "LEFT") {
        button.graphics.drawPoly(center - 16, center, [16, -15, 16, -5, 28, -5, 28, 5, 16, 5, 16, 15], "#E8FDFF");
      } else if (control === "RIGHT") {
        button.graphics.drawPoly(center + 16, center, [-16, -15, -16, -5, -28, -5, -28, 5, -16, 5, -16, 15], "#E8FDFF");
      } else {
        button.graphics.drawPoly(center, center - 16, [-15, 16, -5, 16, -5, 28, 5, 28, 5, 16, 15, 16], "#E8FDFF");
      }
      root.addChild(button);
    }
    static addSectionLabel(text, x, y, width, color) {
      const label = _IntroUI.createText(text, 12, color, true);
      label.x = x;
      label.y = y;
      label.width = width;
      label.height = 18;
      label.align = "center";
      _IntroUI.viewRoot.addChild(label);
    }
    static createUtilityKey(keyId, action, x, y) {
      _IntroUI.createKeycap(keyId, keyId, x, y, 58, 46, "UTILITY");
      const label = _IntroUI.createText(action, 13, "#94A3B8", true);
      label.x = x + 72;
      label.y = y + 11;
      label.width = 104;
      label.height = 22;
      _IntroUI.viewRoot.addChild(label);
    }
    static createKeycap(keyId, glyph, x, y, width, height, tier) {
      const root = new Laya.Sprite();
      root.x = x;
      root.y = y;
      root.width = width;
      root.height = height + 5;
      root.mouseEnabled = false;
      root.graphics.drawPoly(
        0,
        5,
        _IntroUI.cutCornerPoints(width, height, tier === "PRIMARY" ? 8 : 6),
        "#020617",
        "#17324D",
        1
      );
      const face = new Laya.Sprite();
      face.width = width;
      face.height = height;
      const glow = new Laya.Sprite();
      glow.width = width;
      glow.height = height;
      glow.graphics.drawPoly(
        0,
        0,
        _IntroUI.cutCornerPoints(width, height, tier === "PRIMARY" ? 8 : 6),
        "#0EA5E9",
        "#BAE6FD",
        2
      );
      glow.alpha = 0;
      face.addChild(glow);
      const label = _IntroUI.createText(glyph, tier === "PRIMARY" ? 23 : 20, "#BAE6FD", true);
      label.align = "center";
      label.valign = "middle";
      label.width = width;
      label.height = height;
      face.addChild(label);
      root.addChild(face);
      _IntroUI.viewRoot.addChild(root);
      _IntroUI.keycaps[keyId] = {
        root,
        face,
        glow,
        label,
        tier,
        pressed: false,
        releaseUntil: 0
      };
      _IntroUI.drawKeycapFace(_IntroUI.keycaps[keyId], 0);
    }
    static drawKeycapFace(keycap, intensity) {
      const width = keycap.face.width;
      const height = keycap.face.height;
      const cut = keycap.tier === "PRIMARY" ? 8 : 6;
      const fill = keycap.tier === "PRIMARY" ? "#0B172A" : "#08111F";
      const border = keycap.tier === "PRIMARY" ? "#2B7894" : "#334155";
      const idleGlyph = keycap.tier === "PRIMARY" ? "#BAE6FD" : "#718096";
      keycap.face.graphics.clear();
      keycap.face.graphics.drawPoly(
        0,
        0,
        _IntroUI.cutCornerPoints(width, height, cut),
        fill,
        intensity > 0 ? "#67E8F9" : border,
        intensity > 0 ? 2 : 1
      );
      keycap.face.y = Math.round(intensity * 3);
      keycap.glow.alpha = intensity * 0.62;
      keycap.label.color = intensity > 0 ? "#FFFFFF" : idleGlyph;
    }
    static cutCornerPoints(width, height, cut) {
      return [
        0,
        cut,
        cut,
        0,
        width - cut,
        0,
        width,
        cut,
        width,
        height - cut,
        width - cut,
        height,
        cut,
        height,
        0,
        height - cut
      ];
    }
    static createText(text, fontSize, color, bold) {
      const label = new Laya.Text();
      label.text = text;
      label.font = "Courier New";
      label.fontSize = fontSize;
      label.color = color;
      label.bold = bold;
      label.mouseEnabled = false;
      return label;
    }
    static createButton(text, width, height, kind) {
      const button = new Laya.Sprite();
      button.width = width;
      button.height = height + 5;
      button.mouseEnabled = true;
      button.menuKind = kind;
      button.menuAction = kind === "PRIMARY" ? "START" : kind === "SECONDARY" ? "HOW_TO_PLAY" : "BACK";
      const glow = new Laya.Sprite();
      glow.x = -4;
      glow.y = -4;
      glow.graphics.drawRect(0, 0, width + 8, height + 8, kind === "PRIMARY" ? "#0EA5E9" : "#7C3AED");
      glow.alpha = 0;
      button.addChild(glow);
      const side = new Laya.Sprite();
      side.y = 5;
      side.graphics.drawPoly(0, 0, _IntroUI.cutCornerPoints(width, height, 10), "#030712", "#1E3A5F", 1);
      button.addChild(side);
      const face = new Laya.Sprite();
      face.width = width;
      face.height = height;
      button.addChild(face);
      const label = _IntroUI.createText(text, kind === "PRIMARY" ? 27 : 21, "#F8FAFC", true);
      label.align = "center";
      label.valign = "middle";
      label.width = width;
      label.height = height;
      face.addChild(label);
      const accent = new Laya.Sprite();
      face.addChild(accent);
      button.menuGlow = glow;
      button.menuFace = face;
      button.menuLabel = label;
      button.menuAccent = accent;
      button.menuPressed = false;
      return button;
    }
    static updateMainSelection() {
      for (let index = 0; index < _IntroUI.menuItems.length; index++) {
        _IntroUI.updateButton(_IntroUI.menuItems[index], index === _IntroUI.selectedIndex);
      }
    }
    static updateButton(button, selected) {
      const kind = button.menuKind || "BACK";
      const pressed = button.menuPressed === true;
      let fill = "#0B1427";
      let border = "#475569";
      let accent = "#475569";
      let glowAlpha = 0.05;
      let borderWidth = 2;
      let accentHeight = 3;
      if (kind === "PRIMARY") {
        fill = selected ? "#075A9D" : "#0B3556";
        border = selected ? "#CFFAFE" : "#38BDF8";
        accent = "#22D3EE";
        glowAlpha = selected ? 0.28 : 0.1;
      } else if (kind === "SECONDARY") {
        fill = selected ? "#18264A" : "#0A1428";
        border = selected ? "#A78BFA" : "#475569";
        accent = selected ? "#8B5CF6" : "#334155";
        glowAlpha = selected ? 0.16 : 0.03;
      } else if (selected) {
        fill = "#10345A";
        border = "#67E8F9";
        accent = "#22D3EE";
        glowAlpha = 0.12;
      }
      if (pressed) {
        fill = kind === "PRIMARY" ? "#0284C7" : "#4C1D95";
        border = kind === "PRIMARY" ? "#ECFEFF" : "#DDD6FE";
        accent = kind === "PRIMARY" ? "#67E8F9" : "#C4B5FD";
        glowAlpha = kind === "PRIMARY" ? 0.62 : 0.52;
        borderWidth = 3;
        accentHeight = 5;
      }
      button.menuFace.y = pressed ? 5 : 0;
      button.menuFace.graphics.clear();
      button.menuFace.graphics.drawPoly(
        0,
        0,
        _IntroUI.cutCornerPoints(button.width, button.height - 5, 10),
        fill,
        border,
        borderWidth
      );
      button.menuAccent.graphics.clear();
      button.menuAccent.graphics.drawRect(20, 0, button.width - 40, accentHeight, accent);
      button.menuGlow.alpha = glowAlpha;
      button.menuLabel.color = selected || kind === "PRIMARY" ? "#FFFFFF" : "#CBD5E1";
      button.menuLabel.bold = selected || kind === "PRIMARY";
    }
    static onMenuHover(event) {
      const target = (event == null ? void 0 : event.currentTarget) || (event == null ? void 0 : event.target);
      const index = _IntroUI.menuItems.indexOf(target);
      if (index === 0 || index === 1) {
        _IntroUI.selectedIndex = index;
        _IntroUI.updateMainSelection();
      }
    }
    static onMenuClick(event) {
      if (!_IntroUI.mobileTouchSession) {
        _IntroUI.resetMenuPressedState();
      }
      const target = (event == null ? void 0 : event.currentTarget) || (event == null ? void 0 : event.target);
      const action = target == null ? void 0 : target.menuAction;
      if (_IntroUI.boundItems.indexOf(target) < 0 || action !== "START" && action !== "HOW_TO_PLAY" && action !== "BACK") {
        if (_IntroUI.mobileTouchSession) {
          _IntroUI.cancelPendingMenuActivation();
        }
        return;
      }
      if (action !== "BACK" && (_IntroUI.mainMenuActivationGuarded || _IntroUI.menuPointerActivationState !== "ARMED")) {
        if (_IntroUI.mobileTouchSession) {
          _IntroUI.cancelPendingMenuActivation();
        }
        _IntroUI.stopEvent(event);
        return;
      }
      const index = _IntroUI.menuItems.indexOf(target);
      if (!_IntroUI.mobileTouchSession) {
        _IntroUI.activateMenuAction(action);
        return;
      }
      if (_IntroUI.pendingMenuActivation !== null || _IntroUI.pressedMenuItem !== target) {
        _IntroUI.stopEvent(event);
        return;
      }
      if (index === 0 || index === 1) {
        _IntroUI.selectedIndex = index;
        _IntroUI.updateMainSelection();
      }
      _IntroUI.pendingMenuActivation = action;
      const elapsedMs = Math.max(0, Date.now() - _IntroUI.menuPressStartedAt);
      if (elapsedMs >= _IntroUI.MOBILE_MENU_PRESS_MIN_MS) {
        _IntroUI.completeMobileMenuPress();
      } else {
        _IntroUI.scheduleMobileMenuPressCompletion(
          _IntroUI.MOBILE_MENU_PRESS_MIN_MS - elapsedMs
        );
      }
      _IntroUI.stopEvent(event);
    }
    static onMenuPointerDown(event) {
      if (_IntroUI.menuPointerActivationState === "WAITING_FOR_FRESH_DOWN") {
        _IntroUI.menuPointerActivationState = "ARMED";
        _IntroUI.blockedCoverPointerId = null;
      }
      if (_IntroUI.menuPointerActivationState === "WAITING_FOR_OLD_RELEASE") {
        _IntroUI.cancelPendingMenuActivation();
        _IntroUI.stopEvent(event);
        return;
      }
      const target = (event == null ? void 0 : event.currentTarget) || (event == null ? void 0 : event.target);
      const action = target == null ? void 0 : target.menuAction;
      const index = _IntroUI.menuItems.indexOf(target);
      if (_IntroUI.boundItems.indexOf(target) < 0 || action !== "START" && action !== "HOW_TO_PLAY" && action !== "BACK") {
        return;
      }
      if (_IntroUI.pressedMenuItem || _IntroUI.pendingMenuActivation !== null) {
        _IntroUI.stopEvent(event);
        return;
      }
      _IntroUI.pressedMenuItem = target;
      _IntroUI.menuPressStartedAt = Date.now();
      _IntroUI.activeMenuPointerId = _IntroUI.resolvePointerId(event);
      _IntroUI.menuPressReleased = false;
      target.menuPressed = true;
      if (index === 0 || index === 1) {
        _IntroUI.selectedIndex = index;
        _IntroUI.updateMainSelection();
      } else {
        _IntroUI.updateButton(target, true);
      }
    }
    static onMenuPointerUp(event = null) {
      if (!_IntroUI.pressedMenuItem || !_IntroUI.menuEventMatchesActivePointer(event)) {
        return;
      }
      if (!_IntroUI.mobileTouchSession) {
        _IntroUI.cancelPendingMenuActivation();
        return;
      }
      _IntroUI.menuPressReleased = true;
      const elapsedMs = Math.max(0, Date.now() - _IntroUI.menuPressStartedAt);
      _IntroUI.scheduleMobileMenuPressCompletion(
        Math.max(0, _IntroUI.MOBILE_MENU_PRESS_MIN_MS - elapsedMs)
      );
    }
    static onMenuPointerCancel(event = null) {
      var _a;
      if (!_IntroUI.pressedMenuItem || !_IntroUI.menuEventMatchesActivePointer(event)) {
        return;
      }
      const nativeType = String(((_a = event == null ? void 0 : event.nativeEvent) == null ? void 0 : _a.type) || "").toLowerCase();
      if (nativeType === "touchend" && _IntroUI.menuPressReleased && _IntroUI.pendingMenuActivation !== null) {
        return;
      }
      _IntroUI.cancelPendingMenuActivation();
    }
    static menuEventMatchesActivePointer(event) {
      if (_IntroUI.activeMenuPointerId === null) {
        return true;
      }
      const hasPointerIdentity = (event == null ? void 0 : event.touchId) !== void 0 || (event == null ? void 0 : event.pointerId) !== void 0;
      return !hasPointerIdentity || _IntroUI.resolvePointerId(event) === _IntroUI.activeMenuPointerId;
    }
    static scheduleMobileMenuPressCompletion(delayMs) {
      Laya.timer.clear(_IntroUI, _IntroUI.completeMobileMenuPress);
      Laya.timer.once(
        Math.max(0, delayMs),
        _IntroUI,
        _IntroUI.completeMobileMenuPress
      );
    }
    static completeMobileMenuPress() {
      const activation = _IntroUI.pendingMenuActivation;
      Laya.timer.clear(_IntroUI, _IntroUI.completeMobileMenuPress);
      _IntroUI.pendingMenuActivation = null;
      _IntroUI.menuPressStartedAt = 0;
      _IntroUI.activeMenuPointerId = null;
      _IntroUI.menuPressReleased = false;
      _IntroUI.resetMenuPressedState();
      if (activation !== null && _IntroUI.mobileTouchSession && (activation === "BACK" && _IntroUI.view === _IntroUI.HOW_TO_PLAY || activation !== "BACK" && _IntroUI.view === _IntroUI.MAIN_MENU)) {
        _IntroUI.activateMenuAction(activation);
      }
    }
    static cancelPendingMenuActivation() {
      Laya.timer.clear(_IntroUI, _IntroUI.completeMobileMenuPress);
      _IntroUI.pendingMenuActivation = null;
      _IntroUI.menuPressStartedAt = 0;
      _IntroUI.activeMenuPointerId = null;
      _IntroUI.menuPressReleased = false;
      _IntroUI.resetMenuPressedState();
    }
    static resetMenuPressedState() {
      const pressedItem = _IntroUI.pressedMenuItem;
      if (!pressedItem) {
        return;
      }
      pressedItem.menuPressed = false;
      _IntroUI.pressedMenuItem = null;
      const index = _IntroUI.menuItems.indexOf(pressedItem);
      if (index >= 0) {
        _IntroUI.updateMainSelection();
      } else if (pressedItem.menuFace) {
        _IntroUI.updateButton(pressedItem, true);
      }
    }
    static activateMenuAction(action) {
      if (action === "BACK") {
        _IntroUI.onBackClick();
        return;
      }
      _IntroUI.activateMenuSelection(action === "START" ? 0 : 1);
    }
    static activateMenuSelection(index) {
      _IntroUI.selectedIndex = index;
      _IntroUI.updateMainSelection();
      if (index === 0) {
        _IntroUI.acceptStart();
      } else {
        _IntroUI.enterHowToPlay();
      }
    }
    static enterHowToPlay() {
      var _a, _b;
      _IntroUI.view = _IntroUI.HOW_TO_PLAY;
      _IntroUI.renderHowToPlay();
      (_b = (_a = _IntroUI.lifecycleCallbacks).onHowToPlayEntered) == null ? void 0 : _b.call(_a);
    }
    static onBackClick() {
      var _a, _b;
      _IntroUI.view = _IntroUI.MAIN_MENU;
      _IntroUI.selectedIndex = 0;
      _IntroUI.renderMainMenu();
      (_b = (_a = _IntroUI.lifecycleCallbacks).onMainMenuEntered) == null ? void 0 : _b.call(_a);
    }
    static onCoverPointerDown(event) {
      var _a, _b;
      if (!_IntroUI.mobileTouchSession) {
        const rawButton = (_b = event == null ? void 0 : event.button) != null ? _b : (_a = event == null ? void 0 : event.nativeEvent) == null ? void 0 : _a.button;
        if (rawButton !== void 0 && rawButton !== null && Number(rawButton) !== 0) {
          _IntroUI.stopEvent(event);
          return;
        }
      }
      const pointerId = _IntroUI.resolvePointerId(event);
      _IntroUI.beginCoverHold("POINTER", pointerId, event);
    }
    static onIntroPointerUp(event) {
      const pointerId = _IntroUI.resolvePointerId(event);
      if (_IntroUI.menuPointerActivationState === "WAITING_FOR_OLD_RELEASE" && pointerId === _IntroUI.blockedCoverPointerId) {
        _IntroUI.menuPointerActivationState = "WAITING_FOR_FRESH_DOWN";
        _IntroUI.stopEvent(event);
      }
      if (_IntroUI.view === _IntroUI.COVER && _IntroUI.coverHoldState === "CHARGING" && _IntroUI.coverHoldSource === "POINTER" && pointerId === _IntroUI.activeHoldPointerId) {
        _IntroUI.cancelCoverHold();
        _IntroUI.stopEvent(event);
      }
    }
    static onCoverPointerCancel(event = null) {
      if (_IntroUI.coverHoldState !== "CHARGING" || _IntroUI.coverHoldSource !== "POINTER") {
        return;
      }
      const hasIdentity = (event == null ? void 0 : event.touchId) !== void 0 || (event == null ? void 0 : event.pointerId) !== void 0;
      if (hasIdentity && _IntroUI.resolvePointerId(event) !== _IntroUI.activeHoldPointerId) {
        return;
      }
      _IntroUI.cancelCoverHold();
      _IntroUI.stopEvent(event);
    }
    static resolvePointerId(event) {
      const rawId = (event == null ? void 0 : event.touchId) !== void 0 && (event == null ? void 0 : event.touchId) !== null ? event.touchId : (event == null ? void 0 : event.pointerId) !== void 0 && (event == null ? void 0 : event.pointerId) !== null ? event.pointerId : 0;
      const numericId = Number(rawId);
      return Number.isFinite(numericId) ? numericId : 0;
    }
    static enterMainMenuAfterCover() {
      var _a, _b;
      if (_IntroUI.view !== _IntroUI.COVER || _IntroUI.coverDismissed || _IntroUI.coverHoldState !== "COMPLETING") {
        return;
      }
      _IntroUI.coverDismissed = true;
      _IntroUI.mainMenuActivationGuarded = true;
      _IntroUI.clearCoverRoot();
      if (_IntroUI.overlay) {
        _IntroUI.overlay.alpha = 0.78;
      }
      if (_IntroUI.panel) {
        _IntroUI.panel.visible = true;
      }
      _IntroUI.view = _IntroUI.MAIN_MENU;
      _IntroUI.selectedIndex = 0;
      _IntroUI.renderMainMenu();
      (_b = (_a = _IntroUI.lifecycleCallbacks).onMainMenuEntered) == null ? void 0 : _b.call(_a);
      Laya.timer.clear(_IntroUI, _IntroUI.releaseMainMenuActivationGuard);
      Laya.timer.once(
        _IntroUI.COVER_MENU_GUARD_MS,
        _IntroUI,
        _IntroUI.releaseMainMenuActivationGuard
      );
    }
    static releaseMainMenuActivationGuard() {
      _IntroUI.mainMenuActivationGuarded = false;
    }
    static stopEvent(event) {
      if (event && typeof event.stopPropagation === "function") {
        event.stopPropagation();
      }
    }
    static clearCoverRoot() {
      _IntroUI.unbindCoverBackgroundLifecycle();
      _IntroUI.clearCoverMotionVisuals();
      _IntroUI.clearCoverChargeState();
      if (!_IntroUI.coverRoot) {
        return;
      }
      _IntroUI.coverRoot.mouseEnabled = false;
      _IntroUI.coverRoot.off(Laya.Event.MOUSE_DOWN, _IntroUI, _IntroUI.onCoverPointerDown);
      _IntroUI.coverRoot.off(Laya.Event.MOUSE_OUT, _IntroUI, _IntroUI.onCoverPointerCancel);
      _IntroUI.coverRoot.removeSelf();
      _IntroUI.coverRoot.destroy(true);
      _IntroUI.coverRoot = null;
    }
    static resetCoverState() {
      Laya.timer.clear(_IntroUI, _IntroUI.releaseMainMenuActivationGuard);
      _IntroUI.clearCoverRoot();
      _IntroUI.coverDismissed = false;
      _IntroUI.coverEnterPhysicalDown = false;
      _IntroUI.coverEnterReleaseRequired = false;
      _IntroUI.mainMenuActivationGuarded = false;
      _IntroUI.menuPointerActivationState = "ARMED";
      _IntroUI.blockedCoverPointerId = null;
    }
    static clearCoverInteractionState() {
      Laya.timer.clear(_IntroUI, _IntroUI.releaseMainMenuActivationGuard);
      _IntroUI.clearCoverRoot();
      _IntroUI.coverDismissed = false;
      _IntroUI.coverEnterPhysicalDown = false;
      _IntroUI.coverEnterReleaseRequired = false;
      _IntroUI.mainMenuActivationGuarded = false;
      _IntroUI.menuPointerActivationState = "ARMED";
      _IntroUI.blockedCoverPointerId = null;
    }
    static onKeyDown(event) {
      const keyCode = event ? event.keyCode : null;
      const key = event ? event.key : "";
      const isEnter = keyCode === 13 || key === "Enter";
      const isEscape = keyCode === 27 || key === "Escape" || key === "Esc";
      if (_IntroUI.view === _IntroUI.COVER) {
        if (isEnter) {
          if (_IntroUI.coverEnterPhysicalDown) {
            _IntroUI.stopEvent(event);
            return;
          }
          _IntroUI.coverEnterPhysicalDown = true;
          if (_IntroUI.coverHoldState === "IDLE" && _IntroUI.coverHoldSource === "NONE") {
            _IntroUI.beginCoverHold("KEY_ENTER", null, event);
          } else {
            if (_IntroUI.coverHoldSource === "POINTER" || _IntroUI.coverHoldState === "COMPLETING") {
              _IntroUI.coverEnterReleaseRequired = true;
            }
            _IntroUI.stopEvent(event);
          }
        }
        return;
      }
      if (isEnter && _IntroUI.coverEnterReleaseRequired) {
        _IntroUI.stopEvent(event);
        return;
      }
      if (isEnter && _IntroUI.mainMenuActivationGuarded) {
        _IntroUI.coverEnterReleaseRequired = true;
        _IntroUI.stopEvent(event);
        return;
      }
      if (_IntroUI.view === _IntroUI.HOW_TO_PLAY) {
        const keyId = _IntroUI.resolveTestKey(event);
        if (keyId) {
          _IntroUI.pressKeycap(keyId);
        }
        if (isEnter || isEscape) {
          _IntroUI.onBackClick();
        }
        return;
      }
      const isPrevious = keyCode === 87 || keyCode === 38 || key === "w" || key === "W" || key === "ArrowUp" || key === "Up";
      const isNext = keyCode === 83 || keyCode === 40 || key === "s" || key === "S" || key === "ArrowDown" || key === "Down";
      if (isPrevious || isNext) {
        _IntroUI.selectedIndex = _IntroUI.selectedIndex === 0 ? 1 : 0;
        _IntroUI.updateMainSelection();
        return;
      }
      if (isEnter && _IntroUI.selectedIndex === 0) {
        _IntroUI.acceptStart();
      } else if (isEnter) {
        _IntroUI.enterHowToPlay();
      }
    }
    static onKeyUp(event) {
      const keyCode = event ? event.keyCode : null;
      const key = event ? event.key : "";
      const isEnter = keyCode === 13 || key === "Enter";
      if (isEnter) {
        _IntroUI.coverEnterPhysicalDown = false;
      }
      if (_IntroUI.view === _IntroUI.COVER && isEnter && _IntroUI.coverHoldState === "CHARGING" && _IntroUI.coverHoldSource === "KEY_ENTER") {
        _IntroUI.cancelCoverHold();
        return;
      }
      if (isEnter && _IntroUI.coverEnterReleaseRequired) {
        _IntroUI.coverEnterReleaseRequired = false;
        return;
      }
      if (_IntroUI.view !== _IntroUI.HOW_TO_PLAY) {
        return;
      }
      const keyId = _IntroUI.resolveTestKey(event);
      if (keyId) {
        _IntroUI.releaseKeycap(keyId);
      }
    }
    static resolveTestKey(event) {
      const code = event ? event.code : "";
      const keyCode = event ? event.keyCode : null;
      const key = event ? event.key : "";
      if (code === "KeyW" || keyCode === 87 || key === "w" || key === "W")
        return "W";
      if (code === "KeyA" || keyCode === 65 || key === "a" || key === "A")
        return "A";
      if (code === "KeyD" || keyCode === 68 || key === "d" || key === "D")
        return "D";
      if (code === "ArrowUp" || keyCode === 38 || key === "ArrowUp" || key === "Up")
        return "UP";
      if (code === "ArrowLeft" || keyCode === 37 || key === "ArrowLeft" || key === "Left")
        return "LEFT";
      if (code === "ArrowRight" || keyCode === 39 || key === "ArrowRight" || key === "Right")
        return "RIGHT";
      if (code === "KeyR" || keyCode === 82 || key === "r" || key === "R")
        return "R";
      if (code === "KeyM" || keyCode === 77 || key === "m" || key === "M")
        return "M";
      if (code === "KeyP" || keyCode === 80 || key === "p" || key === "P")
        return "P";
      return null;
    }
    static pressKeycap(keyId) {
      const keycap = _IntroUI.keycaps[keyId];
      if (!keycap || keycap.pressed) {
        return;
      }
      keycap.pressed = true;
      keycap.releaseUntil = 0;
      _IntroUI.drawKeycapFace(keycap, 1);
    }
    static releaseKeycap(keyId) {
      const keycap = _IntroUI.keycaps[keyId];
      if (!keycap || !keycap.pressed) {
        return;
      }
      keycap.pressed = false;
      keycap.releaseUntil = Date.now() + _IntroUI.KEY_RELEASE_DECAY_MS;
      _IntroUI.drawKeycapFace(keycap, 1);
    }
    static updateKeyFeedback() {
      const now = Date.now();
      for (const keyId of Object.keys(_IntroUI.keycaps)) {
        const keycap = _IntroUI.keycaps[keyId];
        if (keycap.pressed || keycap.releaseUntil <= 0) {
          continue;
        }
        const remaining = keycap.releaseUntil - now;
        if (remaining <= 0) {
          keycap.releaseUntil = 0;
          _IntroUI.drawKeycapFace(keycap, 0);
        } else {
          _IntroUI.drawKeycapFace(keycap, remaining / _IntroUI.KEY_RELEASE_DECAY_MS);
        }
      }
    }
    static startKeyFeedbackLoop() {
      if (_IntroUI.keyFeedbackLoopActive) {
        return;
      }
      Laya.timer.frameLoop(1, _IntroUI, _IntroUI.updateKeyFeedback);
      _IntroUI.keyFeedbackLoopActive = true;
    }
    static stopKeyFeedbackLoop() {
      if (!_IntroUI.keyFeedbackLoopActive) {
        return;
      }
      Laya.timer.clear(_IntroUI, _IntroUI.updateKeyFeedback);
      _IntroUI.keyFeedbackLoopActive = false;
    }
    static resetKeyFeedback() {
      for (const keyId of Object.keys(_IntroUI.keycaps)) {
        const keycap = _IntroUI.keycaps[keyId];
        keycap.pressed = false;
        keycap.releaseUntil = 0;
        _IntroUI.drawKeycapFace(keycap, 0);
      }
    }
    static onFocusLost() {
      _IntroUI.cancelCoverHold();
      _IntroUI.resetKeyFeedback();
    }
    static acceptStart() {
      if (_IntroUI.started || _IntroUI.view !== _IntroUI.MAIN_MENU || _IntroUI.selectedIndex !== 0 || _IntroUI.mainMenuActivationGuarded || _IntroUI.coverEnterReleaseRequired || _IntroUI.menuPointerActivationState !== "ARMED") {
        return;
      }
      _IntroUI.started = true;
      _IntroUI.clearCoverInteractionState();
      _IntroUI.unbindKeyboard();
      _IntroUI.clearView();
      if (_IntroUI.container) {
        _IntroUI.container.visible = false;
      }
      const handler = _IntroUI.startHandler;
      _IntroUI.startHandler = null;
      _IntroUI.lifecycleCallbacks = {};
      if (handler) {
        handler();
      }
    }
    static bindKeyboard() {
      if (_IntroUI.keyboardBound) {
        return;
      }
      Laya.stage.on(Laya.Event.KEY_DOWN, _IntroUI, _IntroUI.onKeyDown);
      Laya.stage.on(Laya.Event.KEY_UP, _IntroUI, _IntroUI.onKeyUp);
      Laya.stage.on(Laya.Event.MOUSE_UP, _IntroUI, _IntroUI.onIntroPointerUp);
      Laya.stage.on(Laya.Event.MOUSE_UP, _IntroUI, _IntroUI.onMenuPointerUp);
      Laya.stage.on(Laya.Event.BLUR, _IntroUI, _IntroUI.onFocusLost);
      Laya.stage.on(Laya.Event.BLUR, _IntroUI, _IntroUI.onMenuPointerCancel);
      _IntroUI.keyboardBound = true;
    }
    static unbindKeyboard() {
      if (!_IntroUI.keyboardBound) {
        return;
      }
      Laya.stage.off(Laya.Event.KEY_DOWN, _IntroUI, _IntroUI.onKeyDown);
      Laya.stage.off(Laya.Event.KEY_UP, _IntroUI, _IntroUI.onKeyUp);
      Laya.stage.off(Laya.Event.MOUSE_UP, _IntroUI, _IntroUI.onIntroPointerUp);
      Laya.stage.off(Laya.Event.MOUSE_UP, _IntroUI, _IntroUI.onMenuPointerUp);
      Laya.stage.off(Laya.Event.BLUR, _IntroUI, _IntroUI.onFocusLost);
      Laya.stage.off(Laya.Event.BLUR, _IntroUI, _IntroUI.onMenuPointerCancel);
      _IntroUI.keyboardBound = false;
    }
    static clearView() {
      _IntroUI.cancelPendingMenuActivation();
      _IntroUI.resetKeyFeedback();
      _IntroUI.stopKeyFeedbackLoop();
      _IntroUI.keycaps = {};
      for (const item of _IntroUI.boundItems) {
        item.off(Laya.Event.MOUSE_OVER, _IntroUI, _IntroUI.onMenuHover);
        item.off(Laya.Event.MOUSE_DOWN, _IntroUI, _IntroUI.onMenuPointerDown);
        item.off(Laya.Event.MOUSE_UP, _IntroUI, _IntroUI.onMenuPointerUp);
        item.off(Laya.Event.MOUSE_OUT, _IntroUI, _IntroUI.onMenuPointerCancel);
        item.off(Laya.Event.CLICK, _IntroUI, _IntroUI.onMenuClick);
        item.off(Laya.Event.CLICK, _IntroUI, _IntroUI.onBackClick);
      }
      _IntroUI.boundItems = [];
      _IntroUI.menuItems = [];
      if (_IntroUI.viewRoot) {
        _IntroUI.viewRoot.removeSelf();
        _IntroUI.viewRoot.destroy(true);
        _IntroUI.viewRoot = null;
      }
    }
  };
  _IntroUI.COVER = "COVER";
  _IntroUI.MAIN_MENU = "MAIN_MENU";
  _IntroUI.HOW_TO_PLAY = "HOW_TO_PLAY";
  _IntroUI.PANEL_WIDTH = 900;
  _IntroUI.PANEL_HEIGHT = 580;
  _IntroUI.KEY_RELEASE_DECAY_MS = 190;
  _IntroUI.COVER_MENU_GUARD_MS = 450;
  _IntroUI.MOBILE_MENU_PRESS_MIN_MS = 120;
  // First-pass runtime candidates. Human runtime validation is still required.
  _IntroUI.FULL_CHARGE_MS = 1200;
  _IntroUI.DECAY_MS = 300;
  _IntroUI.SUCCESS_MS = 250;
  _IntroUI.CHARGE_PARTICLE_POOL_MAX = 18;
  _IntroUI.view = _IntroUI.COVER;
  _IntroUI.selectedIndex = 0;
  _IntroUI.started = false;
  _IntroUI.mobileTouchSession = false;
  _IntroUI.keyboardBound = false;
  _IntroUI.startHandler = null;
  _IntroUI.lifecycleCallbacks = {};
  _IntroUI.container = null;
  _IntroUI.overlay = null;
  _IntroUI.panel = null;
  _IntroUI.coverRoot = null;
  _IntroUI.coverDismissed = false;
  _IntroUI.coverEnterPhysicalDown = false;
  _IntroUI.coverEnterReleaseRequired = false;
  _IntroUI.mainMenuActivationGuarded = false;
  _IntroUI.menuPointerActivationState = "ARMED";
  _IntroUI.blockedCoverPointerId = null;
  _IntroUI.coverHoldState = "IDLE";
  _IntroUI.coverHoldSource = "NONE";
  _IntroUI.activeHoldPointerId = null;
  _IntroUI.coverChargeElapsedMs = 0;
  _IntroUI.coverChargeProgress = 0;
  _IntroUI.coverCompletionElapsedMs = 0;
  _IntroUI.chargeParticleEmissionElapsedMs = 0;
  _IntroUI.chargeParticleSequence = 0;
  _IntroUI.chargeParticleRoot = null;
  _IntroUI.chargeParticles = [];
  _IntroUI.chargeBarRoot = null;
  _IntroUI.chargeBarFill = null;
  _IntroUI.chargeBarLeadingEdge = null;
  _IntroUI.chargeBarPulse = null;
  _IntroUI.coverStatusText = null;
  _IntroUI.coverBrowserWindow = null;
  _IntroUI.coverBrowserDocument = null;
  _IntroUI.coverParticleRoot = null;
  _IntroUI.coverParticles = [];
  _IntroUI.coverCoreRoot = null;
  _IntroUI.coverHeroBallRoot = null;
  _IntroUI.coverOuterTickRing = null;
  _IntroUI.coverInnerArcRing = null;
  _IntroUI.coverTrackingRoot = null;
  _IntroUI.coverTrackingMarkers = [];
  _IntroUI.coverMotionElapsedSeconds = 0;
  _IntroUI.coverMotionLoopActive = false;
  _IntroUI.viewRoot = null;
  _IntroUI.menuItems = [];
  _IntroUI.boundItems = [];
  _IntroUI.pressedMenuItem = null;
  _IntroUI.menuPressStartedAt = 0;
  _IntroUI.activeMenuPointerId = null;
  _IntroUI.pendingMenuActivation = null;
  _IntroUI.menuPressReleased = false;
  _IntroUI.keycaps = {};
  _IntroUI.keyFeedbackLoopActive = false;
  var IntroUI = _IntroUI;

  // src/BgmManager.ts
  var _BgmManager = class _BgmManager {
    /** Backward-compatible alias for callers outside this frozen round. */
    static playBgm(mobileSession = false) {
      _BgmManager.playGameplayBgm(mobileSession);
    }
    static playCoverBgm(mobileSession) {
      const url = mobileSession ? _BgmManager.coverMobileBgmUrl : _BgmManager.coverDesktopBgmUrl;
      _BgmManager.playRole("COVER", url, _BgmManager.coverVolume);
    }
    static playMenuBgm(mobileSession) {
      const url = mobileSession ? _BgmManager.menuMobileBgmUrl : _BgmManager.menuDesktopBgmUrl;
      const volume = mobileSession ? _BgmManager.menuMobileVolume : _BgmManager.menuDesktopVolume;
      _BgmManager.playRole("MENU", url, volume);
    }
    static playGameplayBgm(mobileSession = false) {
      const volume = mobileSession ? _BgmManager.gameplayMobileVolume : _BgmManager.gameplayDesktopVolume;
      _BgmManager.playRole("GAMEPLAY", _BgmManager.gameplayBgmUrl, volume);
    }
    static playRole(role, url, volume) {
      if (_BgmManager.currentRole === role && _BgmManager.currentUrl === url && _BgmManager.currentVolume === volume && _BgmManager.isPlaying) {
        return;
      }
      if (_BgmManager.currentRole !== "NONE" || _BgmManager.isPlaying) {
        try {
          Laya.SoundManager.stopMusic();
        } catch (error) {
          console.warn("BgmManager: failed to stop the previous music role.", error);
        }
      }
      _BgmManager.currentRole = "NONE";
      _BgmManager.currentUrl = null;
      _BgmManager.currentVolume = null;
      _BgmManager.isPlaying = false;
      try {
        Laya.SoundManager.musicVolume = volume;
        Laya.SoundManager.playMusic(url, 0);
        _BgmManager.currentRole = role;
        _BgmManager.currentUrl = url;
        _BgmManager.currentVolume = volume;
        _BgmManager.isPlaying = true;
      } catch (error) {
        _BgmManager.currentRole = "NONE";
        _BgmManager.currentUrl = null;
        _BgmManager.currentVolume = null;
        _BgmManager.isPlaying = false;
        console.warn(`BgmManager: failed to start ${role} music.`, error);
      }
    }
    static stopBgm() {
      if (_BgmManager.currentRole === "NONE" && !_BgmManager.isPlaying) {
        return;
      }
      try {
        Laya.SoundManager.stopMusic();
      } catch (error) {
        console.warn("BgmManager: failed to stop music.", error);
      } finally {
        _BgmManager.currentRole = "NONE";
        _BgmManager.currentUrl = null;
        _BgmManager.currentVolume = null;
        _BgmManager.isPlaying = false;
      }
    }
    static setVolume(volume) {
      const nextVolume = Math.max(0, Math.min(1, volume));
      _BgmManager.gameplayDesktopVolume = nextVolume;
      _BgmManager.gameplayMobileVolume = nextVolume;
      if (_BgmManager.currentRole === "GAMEPLAY" && _BgmManager.isPlaying) {
        Laya.SoundManager.musicVolume = nextVolume;
        _BgmManager.currentVolume = nextVolume;
      }
    }
  };
  _BgmManager.coverDesktopBgmUrl = "resources/audio/bgm_cover_desktop.mp3";
  _BgmManager.coverMobileBgmUrl = "resources/audio/bgm_cover_mobile.mp3";
  _BgmManager.menuDesktopBgmUrl = "resources/audio/bgm_menu_desktop.mp3";
  _BgmManager.menuMobileBgmUrl = "resources/audio/bgm_menu_mobile.mp3";
  _BgmManager.gameplayBgmUrl = "resources/audio/bgm_final_techno7.mp3";
  // Runtime mix values. Human runtime listening validation is still required.
  _BgmManager.coverVolume = 0.27;
  _BgmManager.menuDesktopVolume = 0.08;
  _BgmManager.menuMobileVolume = 0.18;
  _BgmManager.gameplayDesktopVolume = 0.18;
  _BgmManager.gameplayMobileVolume = 0.33;
  _BgmManager.currentRole = "NONE";
  _BgmManager.currentUrl = null;
  _BgmManager.currentVolume = null;
  _BgmManager.isPlaying = false;
  var BgmManager = _BgmManager;

  // src/LevelTransition.ts
  var _LevelTransition = class _LevelTransition {
    constructor(mode, level, score, nextLevel, completion) {
      this.mode = mode;
      this.level = level;
      this.score = score;
      this.nextLevel = nextLevel;
      this.overlay = null;
      this.card = null;
      this.startedAt = 0;
      this.completed = false;
      this.completion = completion;
    }
    static show(level, completion) {
      _LevelTransition.start(new _LevelTransition("READY", level, 0, 0, completion));
    }
    static showClear(level, score, nextLevel, completion) {
      _LevelTransition.start(new _LevelTransition("CLEAR", level, score, nextLevel, completion));
    }
    static cancel() {
      var _a;
      (_a = _LevelTransition.active) == null ? void 0 : _a.finish(false);
    }
    static start(transition) {
      if (_LevelTransition.active)
        _LevelTransition.active.finish(false);
      _LevelTransition.active = transition;
      try {
        transition.mount();
      } catch (error) {
        console.error("Level transition presentation failed.", error);
        transition.finish(true);
      }
    }
    get durationMs() {
      return this.mode === "CLEAR" ? 1400 : 960;
    }
    mount() {
      var _a, _b;
      const stageWidth = Math.max(1, Number((_a = Laya.stage) == null ? void 0 : _a.width) || 1334);
      const stageHeight = Math.max(1, Number((_b = Laya.stage) == null ? void 0 : _b.height) || 750);
      const overlay = new Laya.Sprite();
      overlay.name = this.mode === "CLEAR" ? "WPH_LevelClearTransition" : "WPH_LevelReadyTransition";
      overlay.width = stageWidth;
      overlay.height = stageHeight;
      overlay.zOrder = 10005;
      overlay.mouseEnabled = true;
      overlay.mouseThrough = false;
      this.overlay = overlay;
      this.drawBackdrop(overlay, stageWidth, stageHeight);
      this.card = this.createCard(overlay, stageWidth, stageHeight);
      overlay.on(Laya.Event.MOUSE_DOWN, this, this.blockInput);
      overlay.on(Laya.Event.MOUSE_UP, this, this.blockInput);
      overlay.on(Laya.Event.CLICK, this, this.blockInput);
      Laya.stage.addChild(overlay);
      this.startedAt = this.readNow();
      this.update();
      Laya.timer.frameLoop(1, this, this.update);
    }
    drawBackdrop(overlay, width, height) {
      const graphics = overlay.graphics;
      graphics.drawRect(0, 0, width, height, "#030711");
      graphics.drawRect(0, 0, width, height, "#071426", "#35E9FF", 2);
      const gridSize = Math.max(54, Math.round(width / 18));
      for (let x = 0; x <= width; x += gridSize)
        graphics.drawLine(x, 0, x, height, "#0B2637", 1);
      for (let y = 0; y <= height; y += gridSize)
        graphics.drawLine(0, y, width, y, "#0B2034", 1);
      graphics.drawLine(width * 0.08, height * 0.17, width * 0.42, height * 0.17, "#35E9FF", 2);
      graphics.drawLine(width * 0.58, height * 0.83, width * 0.92, height * 0.83, "#715CFF", 2);
    }
    createCard(overlay, width, height) {
      const cardWidth = this.mode === "CLEAR" ? 620 : 520;
      const cardHeight = this.mode === "CLEAR" ? 350 : 240;
      const card = new Laya.Sprite();
      card.name = this.mode === "CLEAR" ? "WPH_LevelClearCard" : "WPH_LevelReadyCard";
      card.x = Math.round((width - cardWidth) / 2);
      card.y = Math.round((height - cardHeight) / 2);
      card.width = cardWidth;
      card.height = cardHeight;
      card.mouseEnabled = false;
      card.alpha = 0;
      card.scaleX = 0.92;
      card.scaleY = 0.92;
      card.graphics.drawPoly(
        0,
        0,
        [
          18,
          0,
          cardWidth - 42,
          0,
          cardWidth,
          42,
          cardWidth,
          cardHeight - 18,
          cardWidth - 18,
          cardHeight,
          42,
          cardHeight,
          0,
          cardHeight - 42,
          0,
          18
        ],
        "#06101E",
        "#35E9FF",
        2
      );
      card.graphics.drawLine(42, 7, cardWidth * 0.5, 7, "#83F7FF", 3);
      card.graphics.drawLine(cardWidth * 0.5, 7, cardWidth - 88, 7, "#8B5CFF", 3);
      card.graphics.drawLine(42, cardHeight - 8, 190, cardHeight - 8, "#8B5CFF", 2);
      card.graphics.drawLine(cardWidth - 190, cardHeight - 8, cardWidth - 42, cardHeight - 8, "#35E9FF", 2);
      overlay.addChild(card);
      if (this.mode === "CLEAR") {
        this.addText(card, "LEVEL " + this.level + " CLEAR!", 45, "#F4FFFF", true, 28, 46, cardWidth - 56, 64);
        this.addText(card, "SCORE", 16, "#78D7E8", true, 28, 126, cardWidth - 56, 28);
        this.addText(card, this.score + " / 5", 38, "#83F7FF", true, 28, 153, cardWidth - 56, 55);
        this.addText(card, "NEXT: LEVEL " + this.nextLevel, 22, "#DCCFFF", true, 28, 242, cardWidth - 56, 40);
      } else {
        this.addText(card, "LEVEL " + this.level, 46, "#F4FFFF", true, 28, 48, cardWidth - 56, 64);
        this.addText(card, "GET READY", 23, "#83F7FF", true, 28, 132, cardWidth - 56, 40);
      }
      return card;
    }
    addText(parent, text, fontSize, color, bold, x, y, width, height) {
      const label = new Laya.Text();
      label.text = text;
      label.font = "Arial";
      label.fontSize = fontSize;
      label.color = color;
      label.bold = bold;
      label.x = x;
      label.y = y;
      label.width = width;
      label.height = height;
      label.align = "center";
      label.valign = "middle";
      label.mouseEnabled = false;
      parent.addChild(label);
    }
    update() {
      const elapsed = Math.max(0, this.readNow() - this.startedAt);
      const entrance = Math.min(1, elapsed / 220);
      const eased = 1 - Math.pow(1 - entrance, 3);
      if (this.card) {
        this.card.alpha = eased;
        this.card.scaleX = 0.92 + eased * 0.08;
        this.card.scaleY = 0.92 + eased * 0.08;
      }
      const fadeStart = this.durationMs - 220;
      if (elapsed >= fadeStart && this.overlay) {
        this.overlay.alpha = Math.max(0, 1 - (elapsed - fadeStart) / 220);
      }
      if (elapsed >= this.durationMs)
        this.finish(true);
    }
    readNow() {
      var _a;
      const timerValue = Number((_a = Laya.timer) == null ? void 0 : _a.currTimer);
      return Number.isFinite(timerValue) ? timerValue : Date.now();
    }
    blockInput(event) {
      if (event && typeof event.stopPropagation === "function")
        event.stopPropagation();
    }
    finish(invokeCompletion) {
      var _a, _b, _c;
      if (this.completed)
        return;
      this.completed = true;
      if (typeof ((_a = Laya.timer) == null ? void 0 : _a.clear) === "function")
        Laya.timer.clear(this, this.update);
      if (this.overlay) {
        this.overlay.off(Laya.Event.MOUSE_DOWN, this, this.blockInput);
        this.overlay.off(Laya.Event.MOUSE_UP, this, this.blockInput);
        this.overlay.off(Laya.Event.CLICK, this, this.blockInput);
        (_c = (_b = this.overlay).removeSelf) == null ? void 0 : _c.call(_b);
        this.overlay.destroy(true);
        this.overlay = null;
        this.card = null;
      }
      if (_LevelTransition.active === this)
        _LevelTransition.active = null;
      const completion = this.completion;
      this.completion = null;
      if (invokeCompletion && completion)
        completion();
    }
  };
  _LevelTransition.active = null;
  var LevelTransition = _LevelTransition;

  // src/PauseUI.ts
  var _PauseUI = class _PauseUI {
    constructor(mobileTouchSession, actions) {
      this.mobileTouchSession = mobileTouchSession;
      this.actions = actions;
      this.pauseButton = null;
      this.pauseButtonFace = null;
      this.pauseButtonGlow = null;
      this.modalRoot = null;
      this.modalButtons = [];
      this.muteButton = null;
      this.modalActionLocked = false;
      this.destroyed = false;
      this.mountPauseButton();
    }
    setPauseButtonAvailable(available) {
      if (!this.pauseButton)
        return;
      const interactive = available && !this.destroyed && !this.modalRoot;
      this.pauseButton.visible = interactive;
      this.pauseButton.mouseEnabled = interactive;
      this.drawPauseButton("normal");
    }
    showPauseModal() {
      if (this.destroyed || this.modalRoot)
        return;
      this.modalActionLocked = false;
      this.setPauseButtonAvailable(false);
      this.mountPauseModal();
      this.refreshSettings();
    }
    refreshSettings() {
      if (this.muteButton) {
        this.muteButton.label.text = "MUTE: " + (this.actions.isMuted() ? "ON" : "OFF");
      }
    }
    lockModalActions() {
      if (!this.modalRoot || this.modalActionLocked)
        return false;
      this.modalActionLocked = true;
      for (const button of this.modalButtons) {
        button.root.mouseEnabled = false;
        this.drawModalButton(button, "normal");
      }
      return true;
    }
    hidePauseModal() {
      if (!this.modalRoot)
        return;
      this.modalRoot.offAll();
      this.modalRoot.removeSelf();
      this.modalRoot.destroy(true);
      this.modalRoot = null;
      this.modalButtons = [];
      this.muteButton = null;
      this.modalActionLocked = false;
    }
    destroy() {
      if (this.destroyed)
        return;
      this.destroyed = true;
      this.hidePauseModal();
      if (this.pauseButton) {
        this.pauseButton.offAll();
        this.pauseButton.removeSelf();
        this.pauseButton.destroy(true);
      }
      this.pauseButton = null;
      this.pauseButtonFace = null;
      this.pauseButtonGlow = null;
    }
    mountPauseButton() {
      var _a;
      const width = 64;
      const visibleWidth = 50;
      const visibleRightInset = 4;
      const visibleX = width - visibleRightInset - visibleWidth;
      const height = 50;
      const button = new Laya.Sprite();
      button.name = "PauseUI_PauseButton";
      button.x = Math.max(18, (Number((_a = Laya.stage) == null ? void 0 : _a.width) || 1334) - width - 34);
      button.y = 28;
      button.width = width;
      button.height = height;
      button.zOrder = _PauseUI.PAUSE_BUTTON_Z;
      button.visible = false;
      button.mouseEnabled = false;
      button.mouseThrough = false;
      button.alpha = 0.5;
      const glow = new Laya.Sprite();
      glow.name = "PauseUI_PauseGlow";
      glow.x = visibleX - 4;
      glow.y = -4;
      glow.graphics.drawPoly(0, 0, this.cutCornerPoints(visibleWidth + 8, height + 8, 9), "#0EA5E9");
      glow.alpha = 0.08;
      button.addChild(glow);
      const face = new Laya.Sprite();
      face.name = "PauseUI_PauseFace";
      face.x = visibleX;
      face.width = visibleWidth;
      face.height = height;
      button.addChild(face);
      const glyph = new Laya.Sprite();
      glyph.name = "PauseUI_PauseGlyph";
      glyph.mouseEnabled = false;
      glyph.graphics.drawRect(14, 15, 7, 20, "#D9FCFF");
      glyph.graphics.drawRect(29, 15, 7, 20, "#D9FCFF");
      face.addChild(glyph);
      button.on(Laya.Event.CLICK, this, this.onPauseButtonClick);
      button.on(Laya.Event.MOUSE_OVER, this, this.onPauseButtonOver);
      button.on(Laya.Event.MOUSE_OUT, this, this.onPauseButtonOut);
      button.on(Laya.Event.MOUSE_DOWN, this, this.onPauseButtonDown);
      button.on(Laya.Event.MOUSE_UP, this, this.onPauseButtonOver);
      this.pauseButton = button;
      this.pauseButtonFace = face;
      this.pauseButtonGlow = glow;
      this.drawPauseButton("normal");
      Laya.stage.addChild(button);
    }
    drawPauseButton(state) {
      var _a;
      if (!this.pauseButtonFace || !this.pauseButtonGlow)
        return;
      const width = Number(this.pauseButtonFace.width) || 50;
      const height = Number((_a = this.pauseButton) == null ? void 0 : _a.height) || 50;
      const pressed = state === "pressed";
      const hover = state === "hover";
      this.pauseButtonFace.graphics.clear();
      this.pauseButtonFace.graphics.drawPoly(
        0,
        0,
        this.cutCornerPoints(width, height, 8),
        pressed ? "#0C3043" : hover ? "#09283A" : "#071827",
        hover || pressed ? "#83FAFF" : "#28DDEC",
        pressed ? 3 : 2
      );
      this.pauseButtonFace.graphics.drawLine(12, 5, 48, 5, "#8B5CFF", 2);
      this.pauseButtonFace.graphics.drawLine(width - 34, height - 5, width - 12, height - 5, "#39F4FF", 1);
      this.pauseButtonGlow.alpha = pressed ? 0.2 : hover ? 0.16 : 0.08;
      this.pauseButtonFace.y = pressed ? 2 : 0;
      this.pauseButton.alpha = pressed ? 1 : hover ? 0.78 : 0.5;
    }
    mountPauseModal() {
      var _a, _b;
      const stageWidth = Math.max(1, Number((_a = Laya.stage) == null ? void 0 : _a.width) || 1334);
      const stageHeight = Math.max(1, Number((_b = Laya.stage) == null ? void 0 : _b.height) || 750);
      const panelWidth = 520;
      const panelHeight = 500;
      const root = new Laya.Sprite();
      root.name = "PauseUI_Modal";
      root.width = stageWidth;
      root.height = stageHeight;
      root.zOrder = _PauseUI.PAUSE_MODAL_Z;
      root.mouseEnabled = true;
      root.mouseThrough = false;
      root.on(Laya.Event.MOUSE_DOWN, this, this.blockEvent);
      root.on(Laya.Event.MOUSE_UP, this, this.blockEvent);
      root.on(Laya.Event.CLICK, this, this.blockEvent);
      const dim = new Laya.Sprite();
      dim.name = "PauseUI_Dim";
      dim.mouseEnabled = false;
      dim.graphics.drawRect(0, 0, stageWidth, stageHeight, "#02050C");
      dim.alpha = 0.74;
      root.addChild(dim);
      const panel = new Laya.Sprite();
      panel.name = "PauseUI_Panel";
      panel.x = Math.round((stageWidth - panelWidth) / 2);
      panel.y = Math.round((stageHeight - panelHeight) / 2);
      panel.width = panelWidth;
      panel.height = panelHeight;
      panel.mouseEnabled = true;
      panel.graphics.drawPoly(
        0,
        0,
        this.cutCornerPoints(panelWidth, panelHeight, 18),
        "#06101E",
        "#26E7F2",
        2
      );
      panel.graphics.drawPoly(
        10,
        10,
        this.cutCornerPoints(panelWidth - 20, panelHeight - 20, 13),
        null,
        "#1B4260",
        1
      );
      panel.graphics.drawLine(42, 6, 214, 6, "#67F7FF", 3);
      panel.graphics.drawLine(214, 6, 310, 6, "#8B5CFF", 3);
      panel.graphics.drawLine(panelWidth - 156, panelHeight - 7, panelWidth - 42, panelHeight - 7, "#26E7F2", 2);
      root.addChild(panel);
      const status = this.createText("SYS://SESSION CONTROL", 13, "#46DFF0", true);
      status.x = 36;
      status.y = 24;
      status.width = panelWidth - 72;
      status.height = 20;
      status.align = "center";
      panel.addChild(status);
      const title = this.createText("PAUSED", 38, "#F0FDFF", true);
      title.x = 36;
      title.y = 50;
      title.width = panelWidth - 72;
      title.height = 52;
      title.align = "center";
      title.valign = "middle";
      title.stroke = 2;
      title.strokeColor = "#075E72";
      panel.addChild(title);
      const subtitle = this.createText("SIMULATION HOLD  //  AUDIO LINK ACTIVE", 13, "#809FB2", false);
      subtitle.x = 30;
      subtitle.y = 101;
      subtitle.width = panelWidth - 60;
      subtitle.height = 20;
      subtitle.align = "center";
      panel.addChild(subtitle);
      const buttonWidth = 360;
      const buttonHeight = 56;
      const buttonX = Math.round((panelWidth - buttonWidth) / 2);
      let buttonY = 142;
      const resume = this.createModalButton("RESUME", "RESUME", "PRIMARY", buttonWidth, buttonHeight);
      resume.root.x = buttonX;
      resume.root.y = buttonY;
      panel.addChild(resume.root);
      this.modalButtons.push(resume);
      buttonY += 70;
      const restart = this.createModalButton("RESTART", "RESTART", "SECONDARY", buttonWidth, buttonHeight);
      restart.root.x = buttonX;
      restart.root.y = buttonY;
      panel.addChild(restart.root);
      this.modalButtons.push(restart);
      buttonY += 70;
      const mainMenu = this.createModalButton("MAIN MENU", "MAIN_MENU", "SECONDARY", buttonWidth, buttonHeight);
      mainMenu.root.x = buttonX;
      mainMenu.root.y = buttonY;
      panel.addChild(mainMenu.root);
      this.modalButtons.push(mainMenu);
      buttonY += 70;
      const mute = this.createModalButton("MUTE: OFF", "MUTE", "SETTING", buttonWidth, buttonHeight);
      mute.root.x = buttonX;
      mute.root.y = buttonY;
      panel.addChild(mute.root);
      this.modalButtons.push(mute);
      this.muteButton = mute;
      const footer = this.createText(
        this.mobileTouchSession ? "TOUCH SESSION  //  CURRENT LEVEL LOCKED" : "P  RESUME  //  CURRENT LEVEL LOCKED",
        12,
        "#3F7187",
        true
      );
      footer.x = 30;
      footer.y = panelHeight - 37;
      footer.width = panelWidth - 60;
      footer.height = 18;
      footer.align = "center";
      panel.addChild(footer);
      this.modalRoot = root;
      Laya.stage.addChild(root);
    }
    createModalButton(text, action, kind, width, height) {
      const root = new Laya.Sprite();
      root.name = "PauseUI_" + action;
      root.width = width;
      root.height = height;
      root.mouseEnabled = true;
      root.mouseThrough = false;
      const glow = new Laya.Sprite();
      glow.x = -4;
      glow.y = -4;
      glow.graphics.drawPoly(0, 0, this.cutCornerPoints(width + 8, height + 8, 10), kind === "PRIMARY" ? "#0EA5E9" : "#7047D7");
      glow.alpha = 0.05;
      root.addChild(glow);
      const face = new Laya.Sprite();
      face.width = width;
      face.height = height;
      root.addChild(face);
      const label = this.createText(text, kind === "PRIMARY" ? 22 : 19, "#F0FDFF", true);
      label.width = width;
      label.height = height;
      label.align = "center";
      label.valign = "middle";
      face.addChild(label);
      const button = { root, face, glow, label, kind, action };
      root.pauseButtonModel = button;
      root.on(Laya.Event.CLICK, this, this.onModalButtonClick);
      root.on(Laya.Event.MOUSE_OVER, this, this.onModalButtonOver);
      root.on(Laya.Event.MOUSE_OUT, this, this.onModalButtonOut);
      root.on(Laya.Event.MOUSE_DOWN, this, this.onModalButtonDown);
      root.on(Laya.Event.MOUSE_UP, this, this.onModalButtonOver);
      this.drawModalButton(button, "normal");
      return button;
    }
    drawModalButton(button, state) {
      const width = Number(button.root.width) || 360;
      const height = Number(button.root.height) || 56;
      const primary = button.kind === "PRIMARY";
      const pressed = state === "pressed";
      const hover = state === "hover";
      const fill = primary ? pressed ? "#075071" : hover ? "#075D80" : "#093B55" : pressed ? "#152A45" : hover ? "#142C48" : "#0B192C";
      const border = primary ? hover || pressed ? "#C8FDFF" : "#48EAF4" : hover || pressed ? "#A996FF" : "#47627A";
      button.face.graphics.clear();
      button.face.graphics.drawPoly(0, 0, this.cutCornerPoints(width, height, 9), fill, border, hover ? 3 : 2);
      button.face.graphics.drawLine(18, 5, 92, 5, primary ? "#56F5FF" : "#8B5CFF", 2);
      button.face.graphics.drawLine(width - 76, height - 5, width - 18, height - 5, border, 1);
      button.face.y = pressed ? 2 : 0;
      button.glow.alpha = pressed ? 0.2 : hover ? 0.14 : 0.05;
      button.label.color = hover || pressed ? "#FFFFFF" : primary ? "#E8FDFF" : "#C7D7E4";
    }
    onPauseButtonClick(event) {
      var _a, _b;
      this.blockEvent(event);
      if (!((_a = this.pauseButton) == null ? void 0 : _a.visible) || !((_b = this.pauseButton) == null ? void 0 : _b.mouseEnabled))
        return;
      this.setPauseButtonAvailable(false);
      this.actions.requestPause();
    }
    onPauseButtonOver() {
      this.drawPauseButton("hover");
    }
    onPauseButtonOut() {
      this.drawPauseButton("normal");
    }
    onPauseButtonDown(event) {
      this.blockEvent(event);
      this.drawPauseButton("pressed");
    }
    onModalButtonClick(event) {
      var _a;
      this.blockEvent(event);
      if (this.modalActionLocked)
        return;
      const button = (_a = (event == null ? void 0 : event.currentTarget) || (event == null ? void 0 : event.target)) == null ? void 0 : _a.pauseButtonModel;
      if (!button)
        return;
      if (button.action === "RESUME") {
        this.actions.resume();
        return;
      }
      if (button.action === "RESTART") {
        this.actions.restartCurrentAttempt();
        return;
      }
      if (button.action === "MAIN_MENU") {
        this.actions.returnToMainMenu();
        return;
      }
      if (button.action === "MUTE") {
        this.actions.toggleMute();
        this.refreshSettings();
      }
    }
    onModalButtonOver(event) {
      var _a;
      const button = (_a = (event == null ? void 0 : event.currentTarget) || (event == null ? void 0 : event.target)) == null ? void 0 : _a.pauseButtonModel;
      if (button && !this.modalActionLocked)
        this.drawModalButton(button, "hover");
    }
    onModalButtonOut(event) {
      var _a;
      const button = (_a = (event == null ? void 0 : event.currentTarget) || (event == null ? void 0 : event.target)) == null ? void 0 : _a.pauseButtonModel;
      if (button)
        this.drawModalButton(button, "normal");
    }
    onModalButtonDown(event) {
      var _a;
      this.blockEvent(event);
      const button = (_a = (event == null ? void 0 : event.currentTarget) || (event == null ? void 0 : event.target)) == null ? void 0 : _a.pauseButtonModel;
      if (button && !this.modalActionLocked)
        this.drawModalButton(button, "pressed");
    }
    blockEvent(event) {
      if (event && typeof event.stopPropagation === "function") {
        event.stopPropagation();
      }
    }
    createText(text, fontSize, color, bold) {
      const label = new Laya.Text();
      label.text = text;
      label.font = "Arial";
      label.fontSize = fontSize;
      label.color = color;
      label.bold = bold;
      label.mouseEnabled = false;
      return label;
    }
    cutCornerPoints(width, height, cut) {
      return [
        0,
        cut,
        cut,
        0,
        width - cut,
        0,
        width,
        cut,
        width,
        height - cut,
        width - cut,
        height,
        cut,
        height,
        0,
        height - cut
      ];
    }
  };
  _PauseUI.PAUSE_BUTTON_Z = 1e4;
  _PauseUI.PAUSE_MODAL_Z = 10004;
  var PauseUI = _PauseUI;

  // src/TouchController.ts
  var TOUCH_CONTROL_LAYOUT = {
    left: {
      visibleX: 56,
      visibleY: 558,
      visibleSize: 88,
      hitX: 32,
      hitY: 542,
      hitSize: 120
    },
    right: {
      visibleX: 168,
      visibleY: 558,
      visibleSize: 88,
      hitX: 168,
      hitY: 542,
      hitSize: 120
    },
    jump: {
      visibleX: 1174,
      visibleY: 548,
      visibleSize: 96,
      hitX: 1147,
      hitY: 521,
      hitSize: 150
    }
  };
  var OrientationHintState = class {
    constructor() {
      this.acknowledged = false;
      this.preGameActive = true;
      this.visible = false;
    }
    syncViewport(isPortrait) {
      if (!this.preGameActive || this.acknowledged) {
        this.visible = false;
        return;
      }
      if (!isPortrait) {
        if (this.visible) {
          this.acknowledged = true;
        }
        this.visible = false;
        return;
      }
      this.visible = true;
    }
    acknowledge() {
      this.acknowledged = true;
      this.visible = false;
    }
    completePreGame() {
      this.preGameActive = false;
      this.visible = false;
    }
    isAcknowledged() {
      return this.acknowledged;
    }
    isVisible() {
      return this.visible;
    }
  };
  var TouchInputState = class {
    constructor() {
      this.pointers = {
        left: /* @__PURE__ */ new Set(),
        right: /* @__PURE__ */ new Set(),
        jump: /* @__PURE__ */ new Set()
      };
    }
    press(control, pointerId) {
      this.releasePointer(pointerId);
      this.pointers[control].add(pointerId);
    }
    releasePointer(pointerId) {
      this.pointers.left.delete(pointerId);
      this.pointers.right.delete(pointerId);
      this.pointers.jump.delete(pointerId);
    }
    isHeld(control) {
      return this.pointers[control].size > 0;
    }
    clear() {
      this.pointers.left.clear();
      this.pointers.right.clear();
      this.pointers.jump.clear();
    }
  };
  var _TouchController = class _TouchController {
    constructor() {
      this.state = new TouchInputState();
      this.buttons = {};
      this.buttonVisuals = {};
      this.orientationState = new OrientationHintState();
      this.pressBursts = /* @__PURE__ */ new Set();
      this.root = null;
      this.orientationRoot = null;
      this.deferredPreGameAction = null;
      this.gameplayActive = false;
      this.runtimeBlocked = false;
      this.runtimeBlockProvider = null;
      this.destroyed = false;
      this.onNativeTouchCancel = () => this.resetAll();
      this.onViewportOrientationChanged = () => this.syncOrientationHint();
      var _a;
      this.nativeWindow = ((_a = Laya.Browser) == null ? void 0 : _a.window) || null;
    }
    static create() {
      if (!_TouchController.isTouchCapable()) {
        return null;
      }
      const controller = new _TouchController();
      controller.mount();
      return controller;
    }
    static isTouchCapable() {
      var _a;
      const browserWindow = (_a = Laya.Browser) == null ? void 0 : _a.window;
      if (!browserWindow) {
        return false;
      }
      const navigatorLike = browserWindow.navigator || {};
      return "ontouchstart" in browserWindow || Number(navigatorLike.maxTouchPoints || 0) > 0 || Number(navigatorLike.msMaxTouchPoints || 0) > 0;
    }
    left() {
      return this.isInputAvailable() && this.state.isHeld("left");
    }
    right() {
      return this.isInputAvailable() && this.state.isHeld("right");
    }
    jump() {
      return this.isInputAvailable() && this.state.isHeld("jump");
    }
    setGameplayActive(active) {
      if (this.gameplayActive === active) {
        return;
      }
      this.gameplayActive = active;
      this.updateVisibility();
    }
    deferPreGameActionIfHintVisible(action) {
      this.syncOrientationHint();
      if (!this.orientationState.isVisible()) {
        return false;
      }
      this.deferredPreGameAction = action;
      return true;
    }
    completePreGame() {
      this.deferredPreGameAction = null;
      this.orientationState.completePreGame();
      this.updateOrientationHintVisibility();
    }
    setRuntimeBlockProvider(provider) {
      this.runtimeBlockProvider = provider;
      this.refreshRuntimeBlock();
    }
    resetAll() {
      this.state.clear();
      this.renderAllButtons();
    }
    destroy() {
      var _a;
      if (this.destroyed) {
        return;
      }
      this.destroyed = true;
      this.gameplayActive = false;
      this.runtimeBlocked = true;
      this.runtimeBlockProvider = null;
      this.deferredPreGameAction = null;
      this.orientationState.completePreGame();
      this.resetAll();
      Laya.stage.off(Laya.Event.MOUSE_UP, this, this.onPointerUp);
      Laya.stage.off(Laya.Event.BLUR, this, this.onFocusLost);
      Laya.stage.off(Laya.Event.VISIBILITY_CHANGE, this, this.onVisibilityChanged);
      if (this.nativeWindow && typeof this.nativeWindow.removeEventListener === "function") {
        this.nativeWindow.removeEventListener("touchcancel", this.onNativeTouchCancel);
        this.nativeWindow.removeEventListener("resize", this.onViewportOrientationChanged);
        this.nativeWindow.removeEventListener("orientationchange", this.onViewportOrientationChanged);
      }
      (_a = Laya.timer) == null ? void 0 : _a.clearAll(this);
      for (const burst of this.pressBursts) {
        burst.removeSelf();
        burst.destroy(true);
      }
      this.pressBursts.clear();
      if (this.root) {
        this.root.removeSelf();
        this.root.destroy(true);
        this.root = null;
      }
      if (this.orientationRoot) {
        this.orientationRoot.removeSelf();
        this.orientationRoot.destroy(true);
        this.orientationRoot = null;
      }
    }
    mount() {
      if (Laya.InputManager) {
        Laya.InputManager.multiTouchEnabled = true;
      }
      const root = new Laya.Sprite();
      root.name = "MobileTouchControls";
      root.width = _TouchController.STAGE_WIDTH;
      root.height = _TouchController.STAGE_HEIGHT;
      root.zOrder = 9998;
      root.mouseEnabled = true;
      root.mouseThrough = true;
      root.visible = false;
      this.root = root;
      this.createButton("left", TOUCH_CONTROL_LAYOUT.left);
      this.createButton("right", TOUCH_CONTROL_LAYOUT.right);
      this.createButton("jump", TOUCH_CONTROL_LAYOUT.jump);
      this.createOrientationHint();
      Laya.stage.on(Laya.Event.MOUSE_UP, this, this.onPointerUp);
      Laya.stage.on(Laya.Event.BLUR, this, this.onFocusLost);
      Laya.stage.on(Laya.Event.VISIBILITY_CHANGE, this, this.onVisibilityChanged);
      if (this.nativeWindow && typeof this.nativeWindow.addEventListener === "function") {
        this.nativeWindow.addEventListener("touchcancel", this.onNativeTouchCancel, { passive: true });
        this.nativeWindow.addEventListener("resize", this.onViewportOrientationChanged, { passive: true });
        this.nativeWindow.addEventListener("orientationchange", this.onViewportOrientationChanged, { passive: true });
      }
      Laya.stage.addChild(root);
      if (this.orientationRoot) {
        Laya.stage.addChild(this.orientationRoot);
      }
      this.syncOrientationHint();
    }
    createButton(control, layout) {
      if (!this.root) {
        return;
      }
      const hitTarget = new Laya.Sprite();
      hitTarget.name = "MobileTouch_" + control.toUpperCase() + "_HIT";
      hitTarget.x = layout.hitX;
      hitTarget.y = layout.hitY;
      hitTarget.width = layout.hitSize;
      hitTarget.height = layout.hitSize;
      hitTarget.mouseEnabled = true;
      hitTarget.mouseThrough = false;
      hitTarget.touchControl = control;
      hitTarget.on(Laya.Event.MOUSE_DOWN, this, this.onPointerDown);
      hitTarget.on(Laya.Event.MOUSE_OUT, this, this.onPointerOut);
      const visual = new Laya.Sprite();
      visual.name = "MobileTouch_" + control.toUpperCase() + "_VISIBLE";
      visual.x = layout.visibleX - layout.hitX;
      visual.y = layout.visibleY - layout.hitY;
      visual.width = layout.visibleSize;
      visual.height = layout.visibleSize;
      visual.mouseEnabled = false;
      hitTarget.addChild(visual);
      this.root.addChild(hitTarget);
      this.buttons[control] = hitTarget;
      this.buttonVisuals[control] = visual;
      this.renderButton(control);
    }
    createOrientationHint() {
      const root = new Laya.Sprite();
      root.name = "MobileOrientationHint";
      root.width = _TouchController.STAGE_WIDTH;
      root.height = _TouchController.STAGE_HEIGHT;
      root.zOrder = 10003;
      root.mouseEnabled = true;
      root.mouseThrough = false;
      root.visible = false;
      root.on(Laya.Event.MOUSE_DOWN, this, this.stopEvent);
      const overlay = new Laya.Sprite();
      overlay.name = "MobileOrientationHint_Overlay";
      overlay.width = _TouchController.STAGE_WIDTH;
      overlay.height = _TouchController.STAGE_HEIGHT;
      overlay.mouseEnabled = true;
      overlay.mouseThrough = false;
      overlay.graphics.drawRect(0, 0, overlay.width, overlay.height, "#020713");
      overlay.alpha = 0.58;
      root.addChild(overlay);
      const panelWidth = 650;
      const panelHeight = 354;
      const panel = new Laya.Sprite();
      panel.name = "MobileOrientationHint_Panel";
      panel.x = (_TouchController.STAGE_WIDTH - panelWidth) / 2;
      panel.y = (_TouchController.STAGE_HEIGHT - panelHeight) / 2;
      panel.width = panelWidth;
      panel.height = panelHeight;
      panel.mouseEnabled = true;
      panel.mouseThrough = false;
      panel.graphics.drawPoly(
        0,
        0,
        [
          22,
          0,
          panelWidth - 22,
          0,
          panelWidth,
          22,
          panelWidth,
          panelHeight - 22,
          panelWidth - 22,
          panelHeight,
          22,
          panelHeight,
          0,
          panelHeight - 22,
          0,
          22
        ],
        "#071424",
        "#35E9FF",
        2
      );
      panel.graphics.drawLine(22, 10, 176, 10, "#83F7FF", 2);
      panel.graphics.drawLine(panelWidth - 164, panelHeight - 10, panelWidth - 22, panelHeight - 10, "#6F5CFF", 2);
      panel.graphics.drawLine(18, 48, 18, 96, "#176B80", 1);
      panel.graphics.drawLine(panelWidth - 18, panelHeight - 96, panelWidth - 18, panelHeight - 48, "#176B80", 1);
      root.addChild(panel);
      const glyph = new Laya.Sprite();
      glyph.name = "MobileOrientationHint_RotateGlyph";
      glyph.x = 58;
      glyph.y = 65;
      glyph.mouseEnabled = false;
      glyph.graphics.drawRect(8, 2, 44, 72, null, "#35E9FF", 2);
      glyph.graphics.drawLine(25, 65, 35, 65, "#86F8FF", 2);
      glyph.graphics.drawRect(48, 38, 78, 46, null, "#8B76FF", 2);
      glyph.graphics.drawLine(113, 57, 113, 66, "#C8C0FF", 2);
      glyph.graphics.drawLine(13, 91, 105, 91, "#2A94A8", 2);
      glyph.graphics.drawLine(105, 91, 94, 82, "#6AF7FF", 2);
      glyph.graphics.drawLine(105, 91, 94, 100, "#6AF7FF", 2);
      panel.addChild(glyph);
      const title = this.createOrientationText("横屏体验更佳", 32, "#F4FEFF", true);
      title.x = 188;
      title.y = 62;
      title.width = 400;
      title.height = 48;
      panel.addChild(title);
      const status = this.createOrientationText("LANDSCAPE  /  RECOMMENDED", 15, "#63EAF7", true);
      status.x = 188;
      status.y = 112;
      status.width = 400;
      status.height = 28;
      panel.addChild(status);
      const detail = this.createOrientationText(
        "旋转设备可获得更完整的视野，\n以及更舒适的触控操作。",
        21,
        "#C5D9E8",
        false
      );
      detail.x = 188;
      detail.y = 152;
      detail.width = 400;
      detail.height = 70;
      detail.leading = 10;
      panel.addChild(detail);
      const continueButton = new Laya.Sprite();
      continueButton.name = "MobileOrientationHint_Continue";
      continueButton.x = 170;
      continueButton.y = 266;
      continueButton.width = 310;
      continueButton.height = 54;
      continueButton.mouseEnabled = true;
      continueButton.mouseThrough = false;
      continueButton.graphics.drawPoly(
        0,
        0,
        [10, 0, 300, 0, 310, 10, 310, 44, 300, 54, 10, 54, 0, 44, 0, 10],
        "#0A2638",
        "#6AF7FF",
        2
      );
      continueButton.on(Laya.Event.CLICK, this, this.onOrientationContinue);
      panel.addChild(continueButton);
      const continueLabel = this.createOrientationText("继续使用竖屏  /  CONTINUE", 18, "#E9FDFF", true);
      continueLabel.align = "center";
      continueLabel.valign = "middle";
      continueLabel.width = continueButton.width;
      continueLabel.height = continueButton.height;
      continueButton.addChild(continueLabel);
      this.orientationRoot = root;
    }
    createOrientationText(text, fontSize, color, bold) {
      const label = new Laya.Text();
      label.text = text;
      label.fontSize = fontSize;
      label.color = color;
      label.bold = bold;
      label.mouseEnabled = false;
      return label;
    }
    onOrientationContinue(event) {
      this.orientationState.acknowledge();
      this.updateOrientationHintVisibility();
      this.stopEvent(event);
      this.flushDeferredPreGameAction();
    }
    syncOrientationHint() {
      if (this.destroyed) {
        return;
      }
      const wasVisible = this.orientationState.isVisible();
      this.orientationState.syncViewport(this.isPortraitViewport());
      this.updateOrientationHintVisibility();
      if (wasVisible && this.orientationState.isAcknowledged()) {
        this.flushDeferredPreGameAction();
      }
    }
    updateOrientationHintVisibility() {
      if (this.orientationRoot) {
        this.orientationRoot.visible = this.orientationState.isVisible() && !this.destroyed;
      }
    }
    isPortraitViewport() {
      var _a, _b, _c, _d, _e, _f;
      const documentElement = (_b = (_a = this.nativeWindow) == null ? void 0 : _a.document) == null ? void 0 : _b.documentElement;
      const width = Number(
        ((_c = this.nativeWindow) == null ? void 0 : _c.innerWidth) || (documentElement == null ? void 0 : documentElement.clientWidth) || ((_d = Laya.Browser) == null ? void 0 : _d.clientWidth) || 0
      );
      const height = Number(
        ((_e = this.nativeWindow) == null ? void 0 : _e.innerHeight) || (documentElement == null ? void 0 : documentElement.clientHeight) || ((_f = Laya.Browser) == null ? void 0 : _f.clientHeight) || 0
      );
      return width > 0 && height > width;
    }
    flushDeferredPreGameAction() {
      const action = this.deferredPreGameAction;
      this.deferredPreGameAction = null;
      if (action) {
        action();
      }
    }
    onPointerDown(event) {
      const button = (event == null ? void 0 : event.currentTarget) || (event == null ? void 0 : event.target);
      const control = button == null ? void 0 : button.touchControl;
      if (!control || !this.isInputAvailable()) {
        return;
      }
      const freshPress = !this.state.isHeld(control);
      this.state.press(control, this.getPointerId(event));
      this.renderAllButtons();
      if (freshPress) {
        this.emitPressSparks(control);
      }
      this.stopEvent(event);
    }
    onPointerUp(event) {
      this.state.releasePointer(this.getPointerId(event));
      this.renderAllButtons();
    }
    onPointerOut(event) {
      this.state.releasePointer(this.getPointerId(event));
      this.renderAllButtons();
    }
    onFocusLost() {
      this.resetAll();
    }
    onVisibilityChanged(visible) {
      var _a;
      if (visible === false || ((_a = Laya.stage) == null ? void 0 : _a.isVisibility) === false) {
        this.resetAll();
      }
    }
    updateVisibility() {
      const shouldShow = this.gameplayActive && !this.runtimeBlocked && !this.destroyed;
      if (!shouldShow) {
        this.resetAll();
      }
      if (this.root) {
        this.root.visible = shouldShow;
      }
    }
    isInputAvailable() {
      this.refreshRuntimeBlock();
      return this.gameplayActive && !this.runtimeBlocked && !this.destroyed;
    }
    refreshRuntimeBlock() {
      const blocked = this.runtimeBlockProvider ? this.runtimeBlockProvider() === true : false;
      if (this.runtimeBlocked === blocked) {
        return;
      }
      this.runtimeBlocked = blocked;
      this.updateVisibility();
    }
    getPointerId(event) {
      return typeof (event == null ? void 0 : event.touchId) === "number" ? event.touchId : -1;
    }
    stopEvent(event) {
      if (event && typeof event.stopPropagation === "function") {
        event.stopPropagation();
      }
    }
    renderAllButtons() {
      this.renderButton("left");
      this.renderButton("right");
      this.renderButton("jump");
    }
    renderButton(control) {
      const visual = this.buttonVisuals[control];
      if (!visual) {
        return;
      }
      const pressed = this.state.isHeld(control);
      const size = Number(visual.width) || _TouchController.DIRECTION_VISIBLE_SIZE;
      const inset = 5;
      const panelSize = size - inset * 2;
      const cut = control === "jump" ? 14 : 12;
      const fill = pressed ? "#0D3F55" : "#06111F";
      const border = pressed ? "#A5FBFF" : "#35E9FF";
      const glyph = pressed ? "#FFFFFF" : "#BFFBFF";
      const graphics = visual.graphics;
      graphics.clear();
      if (pressed) {
        graphics.drawPoly(
          inset - 2,
          inset - 2,
          [
            cut + 2,
            0,
            panelSize - cut + 2,
            0,
            panelSize + 4,
            cut + 2,
            panelSize + 4,
            panelSize - cut + 2,
            panelSize - cut + 2,
            panelSize + 4,
            cut + 2,
            panelSize + 4,
            0,
            panelSize - cut + 2,
            0,
            cut + 2
          ],
          null,
          "#4AF4FF",
          2
        );
      }
      graphics.drawPoly(
        inset,
        inset,
        [
          cut,
          0,
          panelSize - cut,
          0,
          panelSize,
          cut,
          panelSize,
          panelSize - cut,
          panelSize - cut,
          panelSize,
          cut,
          panelSize,
          0,
          panelSize - cut,
          0,
          cut
        ],
        fill,
        border,
        pressed ? 3 : 2
      );
      graphics.drawLine(inset + cut, inset + 8, inset + panelSize - cut, inset + 8, pressed ? "#8FFBFF" : "#1A7188", 1);
      const center = size / 2;
      const glyphRadius = control === "jump" ? 19 : 17;
      if (control === "left") {
        graphics.drawPoly(
          center - glyphRadius - 2,
          center,
          [
            glyphRadius,
            -glyphRadius,
            glyphRadius,
            -7,
            glyphRadius * 1.7,
            -7,
            glyphRadius * 1.7,
            7,
            glyphRadius,
            7,
            glyphRadius,
            glyphRadius
          ],
          glyph
        );
        graphics.drawLine(center + 7, center - 17, center + 17, center - 17, pressed ? "#9CFBFF" : "#227D91", 2);
        graphics.drawLine(center + 7, center + 17, center + 17, center + 17, pressed ? "#9CFBFF" : "#227D91", 2);
      } else if (control === "right") {
        graphics.drawPoly(
          center + glyphRadius + 2,
          center,
          [
            -glyphRadius,
            -glyphRadius,
            -glyphRadius,
            -7,
            -glyphRadius * 1.7,
            -7,
            -glyphRadius * 1.7,
            7,
            -glyphRadius,
            7,
            -glyphRadius,
            glyphRadius
          ],
          glyph
        );
        graphics.drawLine(center - 17, center - 17, center - 7, center - 17, pressed ? "#9CFBFF" : "#227D91", 2);
        graphics.drawLine(center - 17, center + 17, center - 7, center + 17, pressed ? "#9CFBFF" : "#227D91", 2);
      } else {
        graphics.drawPoly(
          center,
          center - glyphRadius - 2,
          [
            -glyphRadius,
            glyphRadius,
            -7,
            glyphRadius,
            -7,
            glyphRadius * 1.7,
            7,
            glyphRadius * 1.7,
            7,
            glyphRadius,
            glyphRadius,
            glyphRadius
          ],
          glyph
        );
        graphics.drawLine(center - 15, center + 19, center - 8, center + 28, pressed ? "#9CFBFF" : "#227D91", 2);
        graphics.drawLine(center, center + 19, center, center + 31, pressed ? "#FFFFFF" : "#35AABD", 2);
        graphics.drawLine(center + 15, center + 19, center + 8, center + 28, pressed ? "#9CFBFF" : "#227D91", 2);
      }
      visual.alpha = pressed ? 1 : 0.78;
    }
    emitPressSparks(control) {
      const visual = this.buttonVisuals[control];
      if (!visual || !Laya.timer) {
        return;
      }
      const burst = new Laya.Sprite();
      burst.name = "MobileTouch_" + control.toUpperCase() + "_PRESS_BURST";
      burst.mouseEnabled = false;
      const center = Number(visual.width) / 2;
      const fragments = control === "jump" ? [[-17, 16, -25, 28], [0, 20, 0, 34], [17, 16, 25, 28]] : [[-12, -20, -18, -31], [0, -23, 0, -35], [12, -20, 18, -31]];
      for (let index = 0; index < _TouchController.PRESS_SPARK_COUNT; index++) {
        const fragment = fragments[index];
        burst.graphics.drawLine(
          center + fragment[0],
          center + fragment[1],
          center + fragment[2],
          center + fragment[3],
          index === 1 ? "#FFFFFF" : "#6AF7FF",
          index === 1 ? 2 : 1
        );
      }
      visual.addChild(burst);
      this.pressBursts.add(burst);
      Laya.timer.once(180, this, () => this.disposePressBurst(burst));
    }
    disposePressBurst(burst) {
      if (!this.pressBursts.delete(burst)) {
        return;
      }
      burst.removeSelf();
      burst.destroy(true);
    }
  };
  _TouchController.STAGE_WIDTH = 1334;
  _TouchController.STAGE_HEIGHT = 750;
  _TouchController.DIRECTION_VISIBLE_SIZE = 88;
  _TouchController.JUMP_VISIBLE_SIZE = 96;
  _TouchController.DIRECTION_HIT_SIZE = 120;
  _TouchController.JUMP_HIT_SIZE = 150;
  _TouchController.PRESS_SPARK_COUNT = 3;
  var TouchController = _TouchController;

  // src/TouchTutorialUI.ts
  var _TouchTutorialUI = class _TouchTutorialUI {
    constructor(completion) {
      this.root = null;
      this.stepRoot = null;
      this.guidePanel = null;
      this.yesButton = null;
      this.step = 1;
      this.advanceLocked = false;
      this.destroyed = false;
      this.completion = completion;
    }
    static showOnce(completion) {
      if (_TouchTutorialUI.shownThisSession) {
        return null;
      }
      const tutorial = new _TouchTutorialUI(completion);
      try {
        tutorial.mount();
        _TouchTutorialUI.shownThisSession = true;
        return tutorial;
      } catch (error) {
        tutorial.destroy();
        console.error("Touch tutorial presentation failed.", error);
        return null;
      }
    }
    static hasShownThisSession() {
      return _TouchTutorialUI.shownThisSession;
    }
    destroy() {
      if (this.destroyed) {
        return;
      }
      this.destroyed = true;
      this.completion = null;
      this.teardown();
    }
    mount() {
      const root = new Laya.Sprite();
      root.name = "TouchTutorialModal";
      root.width = TouchController.STAGE_WIDTH;
      root.height = TouchController.STAGE_HEIGHT;
      root.zOrder = 10002;
      root.mouseEnabled = true;
      root.mouseThrough = false;
      const dim = new Laya.Sprite();
      dim.name = "TouchTutorial_Dim";
      dim.width = TouchController.STAGE_WIDTH;
      dim.height = TouchController.STAGE_HEIGHT;
      dim.mouseEnabled = true;
      dim.mouseThrough = false;
      dim.graphics.drawRect(0, 0, dim.width, dim.height, "#020713");
      dim.alpha = 0.62;
      root.addChild(dim);
      root.on(Laya.Event.MOUSE_DOWN, this, this.blockInput);
      root.on(Laya.Event.MOUSE_UP, this, this.blockInput);
      root.on(Laya.Event.CLICK, this, this.blockInput);
      Laya.stage.addChild(root);
      this.root = root;
      this.renderStep();
    }
    renderStep() {
      this.clearStepRoot();
      if (!this.root || this.destroyed) {
        return;
      }
      const stepRoot = new Laya.Sprite();
      stepRoot.name = "TouchTutorial_STEP_" + this.step;
      stepRoot.mouseEnabled = true;
      stepRoot.mouseThrough = true;
      this.root.addChild(stepRoot);
      this.stepRoot = stepRoot;
      if (this.step === 1) {
        this.drawControlFocus(stepRoot, "left", "LEFT");
        this.drawControlFocus(stepRoot, "right", "RIGHT");
        this.drawGuidePanel(stepRoot, "STEP 1  /  MOVE", "Use LEFT / RIGHT to move.");
      } else {
        this.drawControlFocus(stepRoot, "jump", "JUMP");
        this.drawGuidePanel(stepRoot, "STEP 2  /  JUMP", "Tap JUMP to jump.");
      }
    }
    drawGuidePanel(root, titleCopy, detailCopy) {
      const panelWidth = 590;
      const panelHeight = 250;
      const panel = new Laya.Sprite();
      panel.name = "TouchTutorial_GuidePanel";
      panel.x = (TouchController.STAGE_WIDTH - panelWidth) / 2;
      panel.y = 174;
      panel.width = panelWidth;
      panel.height = panelHeight;
      panel.mouseEnabled = true;
      panel.mouseThrough = false;
      panel.graphics.drawPoly(
        0,
        0,
        this.cutCornerPoints(panelWidth, panelHeight, 18),
        "#071424",
        "#35E9FF",
        2
      );
      panel.graphics.drawLine(22, 10, 174, 10, "#83F7FF", 2);
      panel.graphics.drawLine(panelWidth - 164, panelHeight - 10, panelWidth - 22, panelHeight - 10, "#6F5CFF", 2);
      panel.on(Laya.Event.MOUSE_DOWN, this, this.blockInput);
      panel.on(Laya.Event.MOUSE_UP, this, this.blockInput);
      panel.on(Laya.Event.CLICK, this, this.blockInput);
      root.addChild(panel);
      this.guidePanel = panel;
      const status = this.createText("TOUCH LINK  //  0" + this.step + " OF 02", 14, "#63EAF7", true);
      status.x = 34;
      status.y = 34;
      status.width = panelWidth - 68;
      status.height = 22;
      status.align = "center";
      panel.addChild(status);
      const title = this.createText(titleCopy, 34, "#F4FEFF", true);
      title.x = 34;
      title.y = 70;
      title.width = panelWidth - 68;
      title.height = 48;
      title.align = "center";
      panel.addChild(title);
      const detail = this.createText(detailCopy, 21, "#C5D9E8", false);
      detail.x = 34;
      detail.y = 126;
      detail.width = panelWidth - 68;
      detail.height = 32;
      detail.align = "center";
      panel.addChild(detail);
      this.createYesButton(panel, panelWidth);
    }
    createYesButton(panel, panelWidth) {
      const buttonWidth = 220;
      const buttonHeight = 48;
      const button = new Laya.Sprite();
      button.name = "TouchTutorial_YES";
      button.x = Math.round((panelWidth - buttonWidth) / 2);
      button.y = 178;
      button.width = buttonWidth;
      button.height = buttonHeight + 5;
      button.mouseEnabled = true;
      button.mouseThrough = false;
      const glow = new Laya.Sprite();
      glow.name = "TouchTutorial_YES_Glow";
      glow.x = -4;
      glow.y = -4;
      glow.graphics.drawRect(0, 0, buttonWidth + 8, buttonHeight + 8, "#0EA5E9");
      button.addChild(glow);
      const side = new Laya.Sprite();
      side.name = "TouchTutorial_YES_Side";
      side.y = 5;
      side.graphics.drawPoly(0, 0, this.cutCornerPoints(buttonWidth, buttonHeight, 10), "#030712", "#1E3A5F", 1);
      button.addChild(side);
      const face = new Laya.Sprite();
      face.name = "TouchTutorial_YES_Face";
      face.width = buttonWidth;
      face.height = buttonHeight;
      button.addChild(face);
      const label = this.createText("YES", 22, "#FFFFFF", true);
      label.name = "TouchTutorial_YES_Label";
      label.font = "Courier New";
      label.align = "center";
      label.valign = "middle";
      label.width = buttonWidth;
      label.height = buttonHeight;
      face.addChild(label);
      const accent = new Laya.Sprite();
      accent.name = "TouchTutorial_YES_Accent";
      face.addChild(accent);
      button.tutorialGlow = glow;
      button.tutorialFace = face;
      button.tutorialLabel = label;
      button.tutorialAccent = accent;
      this.yesButton = button;
      this.drawYesButton("normal");
      button.on(Laya.Event.CLICK, this, this.confirmYes);
      button.on(Laya.Event.MOUSE_OVER, this, this.onYesOver);
      button.on(Laya.Event.MOUSE_OUT, this, this.onYesOut);
      button.on(Laya.Event.MOUSE_DOWN, this, this.onYesDown);
      button.on(Laya.Event.MOUSE_UP, this, this.onYesUp);
      panel.addChild(button);
    }
    drawYesButton(state) {
      var _a;
      const button = this.yesButton;
      if (!((_a = button == null ? void 0 : button.tutorialFace) == null ? void 0 : _a.graphics)) {
        return;
      }
      const buttonWidth = button.width;
      const buttonHeight = button.height - 5;
      const fill = state === "pressed" ? "#075A9D" : state === "hover" ? "#0B4772" : "#0B3556";
      const border = state === "pressed" ? "#CFFAFE" : state === "hover" ? "#67E8F9" : "#38BDF8";
      button.tutorialFace.graphics.clear();
      button.tutorialFace.graphics.drawPoly(
        0,
        0,
        this.cutCornerPoints(buttonWidth, buttonHeight, 10),
        fill,
        border,
        2
      );
      button.tutorialAccent.graphics.clear();
      button.tutorialAccent.graphics.drawRect(20, 0, buttonWidth - 40, 3, "#22D3EE");
      button.tutorialFace.y = state === "pressed" ? 3 : 0;
      button.tutorialGlow.alpha = state === "pressed" ? 0.28 : state === "hover" ? 0.2 : 0.1;
      button.tutorialLabel.color = state === "normal" ? "#F8FAFC" : "#FFFFFF";
    }
    onYesOver(event) {
      this.stopEvent(event);
      this.drawYesButton("hover");
    }
    onYesOut(event) {
      this.stopEvent(event);
      this.drawYesButton("normal");
    }
    onYesDown(event) {
      this.stopEvent(event);
      this.drawYesButton("pressed");
    }
    onYesUp(event) {
      this.stopEvent(event);
      this.drawYesButton("hover");
    }
    drawControlFocus(root, control, labelCopy) {
      const layout = TOUCH_CONTROL_LAYOUT[control];
      const pad = 12;
      const frame = new Laya.Sprite();
      frame.name = "TouchTutorial_Focus_" + control.toUpperCase();
      frame.x = layout.visibleX - pad;
      frame.y = layout.visibleY - pad;
      frame.width = layout.visibleSize + pad * 2;
      frame.height = layout.visibleSize + pad * 2;
      frame.mouseEnabled = false;
      frame.graphics.drawPoly(
        0,
        0,
        this.cutCornerPoints(frame.width, frame.height, 14),
        null,
        "#83F7FF",
        4
      );
      frame.graphics.drawPoly(
        6,
        6,
        this.cutCornerPoints(frame.width - 12, frame.height - 12, 10),
        null,
        "#22D3EE",
        1
      );
      root.addChild(frame);
      const labelWidth = control === "jump" ? 128 : 112;
      const label = this.createText(labelCopy, 14, "#E8FDFF", true);
      label.name = "TouchTutorial_Label_" + control.toUpperCase();
      label.x = this.clampFocusLabelX(layout, labelWidth);
      label.y = layout.visibleY - 48;
      label.width = labelWidth;
      label.height = 26;
      label.align = "center";
      label.valign = "middle";
      label.graphics.drawRect(0, 0, labelWidth, 26, "#0A2638", "#35E9FF", 1);
      root.addChild(label);
    }
    clampFocusLabelX(layout, width) {
      const centered = layout.visibleX + layout.visibleSize / 2 - width / 2;
      return Math.max(12, Math.min(TouchController.STAGE_WIDTH - width - 12, centered));
    }
    confirmYes(event) {
      this.stopEvent(event);
      if (this.destroyed || this.advanceLocked) {
        return;
      }
      this.advanceLocked = true;
      if (this.step === 1) {
        this.step = 2;
        this.renderStep();
        Laya.timer.once(_TouchTutorialUI.ADVANCE_LATCH_MS, this, this.releaseAdvanceLatch);
        return;
      }
      this.complete();
    }
    releaseAdvanceLatch() {
      this.advanceLocked = false;
    }
    complete() {
      if (this.destroyed) {
        return;
      }
      const completion = this.completion;
      this.completion = null;
      this.destroyed = true;
      this.teardown();
      if (completion) {
        completion();
      }
    }
    teardown() {
      var _a;
      if (this.root) {
        this.root.visible = false;
        this.root.mouseEnabled = false;
      }
      (_a = Laya.timer) == null ? void 0 : _a.clear(this, this.releaseAdvanceLatch);
      this.advanceLocked = false;
      this.clearStepRoot();
      if (!this.root) {
        return;
      }
      this.root.off(Laya.Event.MOUSE_DOWN, this, this.blockInput);
      this.root.off(Laya.Event.MOUSE_UP, this, this.blockInput);
      this.root.off(Laya.Event.CLICK, this, this.blockInput);
      this.root.removeSelf();
      this.root.destroy(true);
      this.root = null;
    }
    clearStepRoot() {
      if (this.yesButton) {
        this.yesButton.off(Laya.Event.CLICK, this, this.confirmYes);
        this.yesButton.off(Laya.Event.MOUSE_OVER, this, this.onYesOver);
        this.yesButton.off(Laya.Event.MOUSE_OUT, this, this.onYesOut);
        this.yesButton.off(Laya.Event.MOUSE_DOWN, this, this.onYesDown);
        this.yesButton.off(Laya.Event.MOUSE_UP, this, this.onYesUp);
        this.yesButton = null;
      }
      if (this.guidePanel) {
        this.guidePanel.off(Laya.Event.MOUSE_DOWN, this, this.blockInput);
        this.guidePanel.off(Laya.Event.MOUSE_UP, this, this.blockInput);
        this.guidePanel.off(Laya.Event.CLICK, this, this.blockInput);
        this.guidePanel = null;
      }
      if (!this.stepRoot) {
        return;
      }
      this.stepRoot.removeSelf();
      this.stepRoot.destroy(true);
      this.stepRoot = null;
    }
    blockInput(event) {
      this.stopEvent(event);
    }
    stopEvent(event) {
      if (event && typeof event.stopPropagation === "function") {
        event.stopPropagation();
      }
    }
    createText(text, fontSize, color, bold) {
      const label = new Laya.Text();
      label.text = text;
      label.fontSize = fontSize;
      label.color = color;
      label.bold = bold;
      label.mouseEnabled = false;
      return label;
    }
    cutCornerPoints(width, height, cut) {
      return [
        cut,
        0,
        width - cut,
        0,
        width,
        cut,
        width,
        height - cut,
        width - cut,
        height,
        cut,
        height,
        0,
        height - cut,
        0,
        cut
      ];
    }
  };
  _TouchTutorialUI.ADVANCE_LATCH_MS = 180;
  _TouchTutorialUI.shownThisSession = false;
  var TouchTutorialUI = _TouchTutorialUI;

  // src/GameCompleteUI.ts
  var GameCompleteUI = class {
    constructor(finalLevelScore, levelTargetScore, actions) {
      this.finalLevelScore = finalLevelScore;
      this.levelTargetScore = levelTargetScore;
      this.actions = actions;
      this.root = null;
      this.buttons = [];
      this.actionLocked = false;
      this.destroyed = false;
      this.mount();
    }
    destroy() {
      if (this.destroyed)
        return;
      this.destroyed = true;
      this.actionLocked = true;
      if (this.root) {
        this.root.offAll();
        this.root.removeSelf();
        this.root.destroy(true);
        this.root = null;
      }
      this.buttons.length = 0;
    }
    mount() {
      var _a, _b;
      const stageWidth = Math.max(1, Number((_a = Laya.stage) == null ? void 0 : _a.width) || 1334);
      const stageHeight = Math.max(1, Number((_b = Laya.stage) == null ? void 0 : _b.height) || 750);
      const root = new Laya.Sprite();
      root.name = "GameCompleteUI";
      root.width = stageWidth;
      root.height = stageHeight;
      root.zOrder = 10006;
      root.mouseEnabled = true;
      root.mouseThrough = false;
      root.on(Laya.Event.MOUSE_DOWN, this, this.blockEvent);
      root.on(Laya.Event.MOUSE_UP, this, this.blockEvent);
      root.on(Laya.Event.CLICK, this, this.blockEvent);
      this.root = root;
      const backdrop = new Laya.Sprite();
      backdrop.name = "GameCompleteUI_Backdrop";
      backdrop.graphics.drawRect(0, 0, stageWidth, stageHeight, "#020713");
      backdrop.mouseEnabled = false;
      root.addChild(backdrop);
      const gridSize = Math.max(54, Math.round(stageWidth / 18));
      const grid = new Laya.Sprite();
      grid.name = "GameCompleteUI_Grid";
      grid.mouseEnabled = false;
      for (let x = 0; x <= stageWidth; x += gridSize)
        grid.graphics.drawLine(x, 0, x, stageHeight, "#0B2637", 1);
      for (let y = 0; y <= stageHeight; y += gridSize)
        grid.graphics.drawLine(0, y, stageWidth, y, "#0B2034", 1);
      grid.alpha = 0.78;
      root.addChild(grid);
      const panelWidth = 690;
      const panelHeight = 560;
      const panel = new Laya.Sprite();
      panel.name = "GameCompleteUI_Panel";
      panel.x = Math.round((stageWidth - panelWidth) / 2);
      panel.y = Math.round((stageHeight - panelHeight) / 2);
      panel.width = panelWidth;
      panel.height = panelHeight;
      panel.mouseEnabled = true;
      panel.mouseThrough = false;
      panel.graphics.drawPoly(
        0,
        0,
        [
          22,
          0,
          panelWidth - 52,
          0,
          panelWidth,
          52,
          panelWidth,
          panelHeight - 22,
          panelWidth - 22,
          panelHeight,
          52,
          panelHeight,
          0,
          panelHeight - 52,
          0,
          22
        ],
        "#06101E",
        "#35E9FF",
        2
      );
      panel.graphics.drawLine(46, 7, 310, 7, "#83F7FF", 3);
      panel.graphics.drawLine(310, 7, panelWidth - 110, 7, "#8B5CFF", 3);
      panel.graphics.drawLine(46, panelHeight - 8, 224, panelHeight - 8, "#8B5CFF", 2);
      panel.graphics.drawLine(panelWidth - 224, panelHeight - 8, panelWidth - 46, panelHeight - 8, "#35E9FF", 2);
      root.addChild(panel);
      this.addText(panel, "GAME COMPLETE", 48, "#F4FFFF", true, 40, 46, panelWidth - 80, 72);
      this.addText(panel, "ALL 4 LEVELS CLEARED!", 22, "#83F7FF", true, 40, 124, panelWidth - 80, 38);
      const scoreCard = new Laya.Sprite();
      scoreCard.name = "GameCompleteUI_FinalLevelScore";
      scoreCard.x = 145;
      scoreCard.y = 184;
      scoreCard.width = 400;
      scoreCard.height = 112;
      scoreCard.mouseEnabled = false;
      scoreCard.graphics.drawPoly(
        0,
        0,
        [10, 0, 390, 0, 400, 10, 400, 102, 390, 112, 10, 112, 0, 102, 0, 10],
        "#071827",
        "#23677A",
        1
      );
      panel.addChild(scoreCard);
      this.addText(scoreCard, "FINAL LEVEL SCORE", 15, "#78D7E8", true, 20, 14, 360, 26);
      this.addText(
        scoreCard,
        this.finalLevelScore + " / " + this.levelTargetScore,
        36,
        "#E8FDFF",
        true,
        20,
        44,
        360,
        50
      );
      const playAgain = this.createButton("PLAY AGAIN", "PLAY_AGAIN", 330, 58, true);
      playAgain.root.x = Math.round((panelWidth - playAgain.root.width) / 2);
      playAgain.root.y = 332;
      panel.addChild(playAgain.root);
      this.buttons.push(playAgain);
      const mainMenu = this.createButton("MAIN MENU", "MAIN_MENU", 330, 58, false);
      mainMenu.root.x = Math.round((panelWidth - mainMenu.root.width) / 2);
      mainMenu.root.y = 410;
      panel.addChild(mainMenu.root);
      this.buttons.push(mainMenu);
      this.addText(panel, "RUN COMPLETE  //  INPUT LOCKED", 12, "#3F7187", true, 40, 500, panelWidth - 80, 20);
      Laya.stage.addChild(root);
    }
    createButton(text, action, width, height, primary) {
      const root = new Laya.Sprite();
      root.name = "GameCompleteUI_" + action;
      root.width = width;
      root.height = height;
      root.mouseEnabled = true;
      root.mouseThrough = false;
      const glow = new Laya.Sprite();
      glow.x = -4;
      glow.y = -4;
      glow.graphics.drawPoly(0, 0, this.cutCorners(width + 8, height + 8, 10), primary ? "#0EA5E9" : "#7047D7");
      glow.alpha = 0.06;
      root.addChild(glow);
      const face = new Laya.Sprite();
      face.width = width;
      face.height = height;
      root.addChild(face);
      const label = this.createText(text, primary ? 22 : 19, "#F0FDFF", true);
      label.width = width;
      label.height = height;
      label.align = "center";
      label.valign = "middle";
      face.addChild(label);
      const button = { root, face, glow, label, action };
      root.gameCompleteButton = button;
      root.on(Laya.Event.CLICK, this, this.onButtonClick);
      root.on(Laya.Event.MOUSE_OVER, this, this.onButtonOver);
      root.on(Laya.Event.MOUSE_OUT, this, this.onButtonOut);
      root.on(Laya.Event.MOUSE_DOWN, this, this.onButtonDown);
      root.on(Laya.Event.MOUSE_UP, this, this.onButtonOver);
      this.drawButton(button, "normal");
      return button;
    }
    drawButton(button, state) {
      const primary = button.action === "PLAY_AGAIN";
      const pressed = state === "pressed";
      const hover = state === "hover";
      const fill = primary ? pressed ? "#075071" : hover ? "#075D80" : "#093B55" : pressed ? "#152A45" : hover ? "#142C48" : "#0B192C";
      const border = primary ? hover || pressed ? "#C8FDFF" : "#48EAF4" : hover || pressed ? "#A996FF" : "#47627A";
      button.face.graphics.clear();
      button.face.graphics.drawPoly(0, 0, this.cutCorners(button.root.width, button.root.height, 9), fill, border, hover ? 3 : 2);
      button.face.graphics.drawLine(18, 5, 92, 5, primary ? "#56F5FF" : "#8B5CFF", 2);
      button.face.graphics.drawLine(button.root.width - 76, button.root.height - 5, button.root.width - 18, button.root.height - 5, border, 1);
      button.face.y = pressed ? 2 : 0;
      button.glow.alpha = pressed ? 0.2 : hover ? 0.14 : 0.06;
      button.label.color = hover || pressed ? "#FFFFFF" : primary ? "#E8FDFF" : "#C7D7E4";
    }
    onButtonClick(event) {
      var _a;
      this.blockEvent(event);
      if (this.destroyed || this.actionLocked)
        return;
      const button = (_a = (event == null ? void 0 : event.currentTarget) || (event == null ? void 0 : event.target)) == null ? void 0 : _a.gameCompleteButton;
      if (!button)
        return;
      this.actionLocked = true;
      for (const candidate of this.buttons) {
        candidate.root.mouseEnabled = false;
        this.drawButton(candidate, "normal");
      }
      if (button.action === "PLAY_AGAIN")
        this.actions.playAgain();
      else
        this.actions.returnToMainMenu();
    }
    onButtonOver(event) {
      var _a;
      const button = (_a = (event == null ? void 0 : event.currentTarget) || (event == null ? void 0 : event.target)) == null ? void 0 : _a.gameCompleteButton;
      if (button && !this.actionLocked)
        this.drawButton(button, "hover");
    }
    onButtonOut(event) {
      var _a;
      const button = (_a = (event == null ? void 0 : event.currentTarget) || (event == null ? void 0 : event.target)) == null ? void 0 : _a.gameCompleteButton;
      if (button)
        this.drawButton(button, "normal");
    }
    onButtonDown(event) {
      var _a;
      this.blockEvent(event);
      const button = (_a = (event == null ? void 0 : event.currentTarget) || (event == null ? void 0 : event.target)) == null ? void 0 : _a.gameCompleteButton;
      if (button && !this.actionLocked)
        this.drawButton(button, "pressed");
    }
    addText(parent, text, fontSize, color, bold, x, y, width, height) {
      const label = this.createText(text, fontSize, color, bold);
      label.x = x;
      label.y = y;
      label.width = width;
      label.height = height;
      label.align = "center";
      label.valign = "middle";
      parent.addChild(label);
    }
    createText(text, fontSize, color, bold) {
      const label = new Laya.Text();
      label.text = text;
      label.font = "Arial";
      label.fontSize = fontSize;
      label.color = color;
      label.bold = bold;
      label.mouseEnabled = false;
      return label;
    }
    blockEvent(event) {
      if (event && typeof event.stopPropagation === "function")
        event.stopPropagation();
    }
    cutCorners(width, height, cut) {
      return [
        0,
        cut,
        cut,
        0,
        width - cut,
        0,
        width,
        cut,
        width,
        height - cut,
        width - cut,
        height,
        cut,
        height,
        0,
        height - cut
      ];
    }
  };

  // src/Main.ts
  var { regClass: regClass2 } = Laya;
  var Main = class extends Laya.Script {
    constructor() {
      super(...arguments);
      this.muteKeyHeld = false;
      this.pauseKeyHeld = false;
      this.ballController = null;
      this.touchController = null;
      this.touchTutorial = null;
      this.pauseUI = null;
      this.gameCompleteUI = null;
      this.gameStarted = false;
      this.activeGameplay = false;
      this.levelTransitionActive = false;
      this.completionFlowActive = false;
      this.gameCompleteActive = false;
      this.completionLevel = 0;
      this.completionScore = 0;
      this.mobileTouchSession = false;
      // Main/session orchestration is the single authoritative Pause state owner.
      this.paused = false;
      this.pendingPauseIntent = false;
      this.mobileBrowserWindow = null;
      this.mobileBrowserDocument = null;
      this.onMobileWindowBlur = () => {
        this.onFocusLost();
        this.requestMobileBackgroundPause();
      };
      this.onMobilePageHide = () => this.requestMobileBackgroundPause();
      this.onMobileVisibilityChange = () => {
        var _a, _b;
        if (((_a = this.mobileBrowserDocument) == null ? void 0 : _a.hidden) === true || ((_b = this.mobileBrowserDocument) == null ? void 0 : _b.visibilityState) === "hidden") {
          this.requestMobileBackgroundPause();
        }
      };
    }
    onStart() {
      console.log("Main onStart");
      BackgroundManager.draw(this.owner);
      this.touchController = TouchController.create();
      this.mobileTouchSession = !!Laya.Browser.onMobile && TouchController.isTouchCapable();
      ScoreManager.instance.setMobileTouchSession(this.mobileTouchSession);
      ScoreManager.instance.init();
      this.ballController = this.findBallController();
      if (this.ballController) {
        this.ballController.enabled = false;
        this.ballController.setTouchInputSource(this.touchController);
        this.ballController.setLevelTransitionHandler((level, resume) => {
          this.showLevelTransition(level, () => {
            resume();
            this.enableGameplay();
          });
        });
      } else {
        console.error("BallController lookup failed; gameplay remains disabled.");
      }
      this.pauseUI = new PauseUI(this.mobileTouchSession, {
        requestPause: () => this.requestPauseIntent(),
        resume: () => this.resumeFromPause(),
        restartCurrentAttempt: () => this.restartCurrentAttemptFromPause(),
        returnToMainMenu: () => this.returnToMainMenuFromPause(),
        toggleMute: () => this.toggleGlobalMute(),
        isMuted: () => SfxManager.isGlobalMuted()
      });
      ScoreManager.instance.setWinHandler((score) => this.handleLevelWon(score));
      IntroUI.show(
        () => this.acceptStartIntent(),
        this.mobileTouchSession,
        {
          onCoverInteractionStarted: () => BgmManager.playCoverBgm(this.mobileTouchSession),
          onMainMenuEntered: () => BgmManager.playMenuBgm(this.mobileTouchSession),
          onHowToPlayEntered: () => BgmManager.stopBgm()
        }
      );
      BgmManager.playCoverBgm(this.mobileTouchSession);
      Laya.stage.on(Laya.Event.KEY_DOWN, this, this.onGlobalKeyDown);
      Laya.stage.on(Laya.Event.KEY_UP, this, this.onGlobalKeyUp);
      Laya.stage.on(Laya.Event.BLUR, this, this.onFocusLost);
      this.bindMobileBackgroundLifecycle();
      this.syncPausePresentation();
      console.log("Main menu active");
    }
    onUpdate() {
      this.syncPausePresentation();
    }
    findBallController() {
      const sceneRoot = this.owner;
      const ballNode = sceneRoot && typeof sceneRoot.getChildByName === "function" ? sceneRoot.getChildByName("Ball") : null;
      if (!ballNode || typeof ballNode.getComponent !== "function") {
        return null;
      }
      return ballNode.getComponent(BallController) || null;
    }
    acceptStartIntent() {
      var _a, _b;
      if (this.gameStarted) {
        return;
      }
      if (!this.ballController) {
        console.error("Start rejected: BallController is unavailable.");
        return;
      }
      if ((_a = this.touchController) == null ? void 0 : _a.deferPreGameActionIfHintVisible(() => this.acceptStartIntent())) {
        return;
      }
      this.gameStarted = true;
      (_b = this.touchController) == null ? void 0 : _b.completePreGame();
      BgmManager.stopBgm();
      this.showLevelTransition(1, () => this.enterLevelOne());
    }
    showLevelTransition(level, completion) {
      var _a, _b;
      this.cancelPendingPauseIntent();
      ScoreManager.instance.clearTransientFeedback();
      this.levelTransitionActive = true;
      this.activeGameplay = false;
      (_a = this.touchController) == null ? void 0 : _a.resetAll();
      (_b = this.touchController) == null ? void 0 : _b.setGameplayActive(false);
      this.syncPausePresentation();
      LevelTransition.show(level, () => {
        this.levelTransitionActive = false;
        completion();
      });
    }
    enterLevelOne() {
      if (!this.ballController) {
        return;
      }
      this.playLevelHudEntrance();
      if (this.mobileTouchSession && this.touchController) {
        this.touchController.setGameplayActive(true);
        const tutorial = TouchTutorialUI.showOnce(() => this.completeTouchTutorial());
        if (tutorial) {
          this.touchTutorial = tutorial;
          this.syncPausePresentation();
          return;
        }
      }
      this.enableGameplay();
    }
    completeTouchTutorial() {
      var _a;
      this.touchTutorial = null;
      (_a = this.touchController) == null ? void 0 : _a.resetAll();
      this.enableGameplay();
    }
    enableGameplay() {
      var _a;
      if (!this.ballController || this.paused || this.levelTransitionActive || this.completionFlowActive || this.gameCompleteActive) {
        return;
      }
      this.activeGameplay = true;
      this.ballController.enabled = true;
      (_a = this.touchController) == null ? void 0 : _a.setGameplayActive(true);
      this.syncPausePresentation();
      BgmManager.playGameplayBgm(this.mobileTouchSession);
    }
    playLevelHudEntrance() {
      var _a;
      ScoreManager.instance.playLevelHudEntrance();
      (_a = this.ballController) == null ? void 0 : _a.playLevelHudEntrance();
    }
    handleLevelWon(score) {
      var _a, _b;
      if (!this.ballController || this.completionFlowActive || this.gameCompleteActive)
        return;
      this.completionFlowActive = true;
      this.completionLevel = this.ballController.getCurrentLevel();
      this.completionScore = score;
      this.activeGameplay = false;
      this.cancelPendingPauseIntent();
      (_a = this.touchController) == null ? void 0 : _a.resetAll();
      (_b = this.touchController) == null ? void 0 : _b.setGameplayActive(false);
      this.ballController.enabled = false;
      this.syncPausePresentation();
      Laya.timer.once(320, this, this.presentLevelCompletion);
    }
    presentLevelCompletion() {
      var _a;
      const controller = this.ballController;
      if (!controller || !this.completionFlowActive)
        return;
      ScoreManager.instance.clearTransientFeedback();
      if (this.completionLevel === controller.getMaxLevel()) {
        this.gameCompleteActive = true;
        (_a = this.gameCompleteUI) == null ? void 0 : _a.destroy();
        this.gameCompleteUI = new GameCompleteUI(
          this.completionScore,
          ScoreManager.instance.getWinScore(),
          {
            playAgain: () => this.playAgainFromGameComplete(),
            returnToMainMenu: () => this.returnToMainMenuFromGameComplete()
          }
        );
        this.syncPausePresentation();
        return;
      }
      this.levelTransitionActive = true;
      const completedLevel = this.completionLevel;
      const completedScore = this.completionScore;
      LevelTransition.showClear(completedLevel, completedScore, completedLevel + 1, () => {
        var _a2;
        this.levelTransitionActive = false;
        if (!((_a2 = this.ballController) == null ? void 0 : _a2.advanceAfterWin(false))) {
          console.error("Automatic level advancement was rejected.");
          this.completionFlowActive = false;
          this.syncPausePresentation();
          return;
        }
        this.completionFlowActive = false;
        this.completionLevel = 0;
        this.completionScore = 0;
        this.playLevelHudEntrance();
        this.enableGameplay();
      });
    }
    playAgainFromGameComplete() {
      var _a, _b, _c;
      if (!this.gameCompleteActive || !this.ballController)
        return;
      (_a = this.gameCompleteUI) == null ? void 0 : _a.destroy();
      this.gameCompleteUI = null;
      this.gameCompleteActive = false;
      this.completionFlowActive = false;
      this.completionLevel = 0;
      this.completionScore = 0;
      this.paused = false;
      this.activeGameplay = false;
      this.gameStarted = true;
      (_b = this.touchController) == null ? void 0 : _b.resetAll();
      (_c = this.touchController) == null ? void 0 : _c.setGameplayActive(false);
      this.ballController.resetRunToLevelOne();
      this.ballController.enabled = false;
      this.showLevelTransition(1, () => this.enterLevelOne());
    }
    returnToMainMenuFromGameComplete() {
      if (!this.gameCompleteActive || !this.ballController)
        return;
      this.returnToMainMenu();
    }
    /** Canonical session-owned test used by every Pause entry and final commit. */
    canPauseNow() {
      return this.gameStarted && this.activeGameplay && !this.paused && !this.levelTransitionActive && !this.completionFlowActive && !this.gameCompleteActive && !this.touchTutorial && !!this.ballController && !ScoreManager.instance.isWon() && !this.ballController.isPauseBlockedByGameplayState();
    }
    requestPauseIntent() {
      if (this.pendingPauseIntent || !this.canPauseNow()) {
        this.syncPausePresentation();
        return;
      }
      this.pendingPauseIntent = true;
      this.syncPausePresentation();
      Laya.timer.frameOnce(1, this, this.commitPendingPauseIntent);
    }
    commitPendingPauseIntent() {
      var _a, _b, _c;
      if (!this.pendingPauseIntent)
        return;
      this.pendingPauseIntent = false;
      if (!this.canPauseNow() || !this.ballController) {
        this.syncPausePresentation();
        return;
      }
      this.paused = true;
      this.ballController.beginGameplayPauseAccounting();
      (_a = this.touchController) == null ? void 0 : _a.resetAll();
      (_b = this.touchController) == null ? void 0 : _b.setGameplayActive(false);
      this.ballController.enabled = false;
      (_c = this.pauseUI) == null ? void 0 : _c.showPauseModal();
      this.syncPausePresentation();
    }
    cancelPendingPauseIntent() {
      var _a;
      if (!this.pendingPauseIntent)
        return;
      this.pendingPauseIntent = false;
      if (typeof ((_a = Laya.timer) == null ? void 0 : _a.clear) === "function") {
        Laya.timer.clear(this, this.commitPendingPauseIntent);
      }
    }
    resumeFromPause() {
      var _a, _b, _c;
      if (!this.paused || !this.ballController)
        return;
      if (!((_a = this.pauseUI) == null ? void 0 : _a.lockModalActions()))
        return;
      (_b = this.touchController) == null ? void 0 : _b.resetAll();
      this.ballController.finishGameplayPauseAccounting();
      this.ballController.synchronizeJumpInputBaseline();
      this.paused = false;
      this.ballController.enabled = true;
      (_c = this.touchController) == null ? void 0 : _c.setGameplayActive(true);
      this.pauseUI.hidePauseModal();
      this.syncPausePresentation();
    }
    restartCurrentAttemptFromPause() {
      var _a, _b, _c;
      if (!this.paused || !this.ballController)
        return;
      if (!((_a = this.pauseUI) == null ? void 0 : _a.lockModalActions()))
        return;
      (_b = this.touchController) == null ? void 0 : _b.resetAll();
      this.ballController.restartCurrentAttempt();
      this.ballController.synchronizeJumpInputBaseline();
      this.paused = false;
      this.ballController.enabled = true;
      (_c = this.touchController) == null ? void 0 : _c.setGameplayActive(true);
      this.pauseUI.hidePauseModal();
      this.syncPausePresentation();
    }
    returnToMainMenuFromPause() {
      var _a;
      if (!this.paused || !this.ballController)
        return;
      if (!((_a = this.pauseUI) == null ? void 0 : _a.lockModalActions()))
        return;
      this.returnToMainMenu();
    }
    returnToMainMenu() {
      var _a, _b, _c, _d;
      if (!this.ballController)
        return;
      Laya.timer.clear(this, this.presentLevelCompletion);
      LevelTransition.cancel();
      (_a = this.gameCompleteUI) == null ? void 0 : _a.destroy();
      this.gameCompleteUI = null;
      this.gameCompleteActive = false;
      this.completionFlowActive = false;
      this.completionLevel = 0;
      this.completionScore = 0;
      ScoreManager.instance.clearTransientFeedback();
      (_b = this.touchController) == null ? void 0 : _b.resetAll();
      (_c = this.touchController) == null ? void 0 : _c.setGameplayActive(false);
      this.ballController.resetRunToLevelOne();
      this.ballController.enabled = false;
      this.paused = false;
      this.activeGameplay = false;
      this.gameStarted = false;
      this.levelTransitionActive = false;
      this.cancelPendingPauseIntent();
      (_d = this.pauseUI) == null ? void 0 : _d.hidePauseModal();
      IntroUI.returnToMainMenu(
        () => this.acceptStartIntent(),
        this.mobileTouchSession,
        {
          onCoverInteractionStarted: () => BgmManager.playCoverBgm(this.mobileTouchSession),
          onMainMenuEntered: () => BgmManager.playMenuBgm(this.mobileTouchSession),
          onHowToPlayEntered: () => BgmManager.stopBgm()
        }
      );
      this.syncPausePresentation();
    }
    syncPausePresentation() {
      var _a;
      (_a = this.pauseUI) == null ? void 0 : _a.setPauseButtonAvailable(
        !this.pendingPauseIntent && this.canPauseNow()
      );
    }
    bindMobileBackgroundLifecycle() {
      var _a, _b, _c, _d, _e, _f, _g, _h;
      if (!this.mobileTouchSession)
        return;
      this.mobileBrowserWindow = ((_a = Laya.Browser) == null ? void 0 : _a.window) || null;
      this.mobileBrowserDocument = ((_b = this.mobileBrowserWindow) == null ? void 0 : _b.document) || null;
      (_d = (_c = this.mobileBrowserWindow) == null ? void 0 : _c.addEventListener) == null ? void 0 : _d.call(_c, "blur", this.onMobileWindowBlur);
      (_f = (_e = this.mobileBrowserWindow) == null ? void 0 : _e.addEventListener) == null ? void 0 : _f.call(_e, "pagehide", this.onMobilePageHide);
      (_h = (_g = this.mobileBrowserDocument) == null ? void 0 : _g.addEventListener) == null ? void 0 : _h.call(_g, "visibilitychange", this.onMobileVisibilityChange);
    }
    unbindMobileBackgroundLifecycle() {
      var _a, _b, _c, _d, _e, _f;
      (_b = (_a = this.mobileBrowserWindow) == null ? void 0 : _a.removeEventListener) == null ? void 0 : _b.call(_a, "blur", this.onMobileWindowBlur);
      (_d = (_c = this.mobileBrowserWindow) == null ? void 0 : _c.removeEventListener) == null ? void 0 : _d.call(_c, "pagehide", this.onMobilePageHide);
      (_f = (_e = this.mobileBrowserDocument) == null ? void 0 : _e.removeEventListener) == null ? void 0 : _f.call(_e, "visibilitychange", this.onMobileVisibilityChange);
      this.mobileBrowserWindow = null;
      this.mobileBrowserDocument = null;
    }
    requestMobileBackgroundPause() {
      if (!this.mobileTouchSession)
        return;
      this.requestPauseIntent();
    }
    toggleGlobalMute() {
      var _a;
      const nextMuted = !SfxManager.isGlobalMuted();
      SfxManager.setGlobalMuted(nextMuted);
      (_a = this.pauseUI) == null ? void 0 : _a.refreshSettings();
      console.log("Muted:", nextMuted);
    }
    onGlobalKeyDown(event) {
      if (this.isMuteKey(event)) {
        if (!this.gameStarted) {
          this.muteKeyHeld = true;
          return;
        }
        if (this.muteKeyHeld)
          return;
        this.muteKeyHeld = true;
        this.toggleGlobalMute();
        return;
      }
      if (!this.isPauseKey(event))
        return;
      if (this.pauseKeyHeld)
        return;
      this.pauseKeyHeld = true;
      if (!this.gameStarted)
        return;
      if (this.paused) {
        this.resumeFromPause();
        return;
      }
      this.requestPauseIntent();
    }
    onGlobalKeyUp(event) {
      if (this.isMuteKey(event)) {
        this.muteKeyHeld = false;
      }
      if (this.isPauseKey(event)) {
        this.pauseKeyHeld = false;
      }
    }
    onFocusLost() {
      this.muteKeyHeld = false;
      this.pauseKeyHeld = false;
    }
    isMuteKey(event) {
      return (event == null ? void 0 : event.keyCode) === 77 || (event == null ? void 0 : event.key) === "m" || (event == null ? void 0 : event.key) === "M";
    }
    isPauseKey(event) {
      return (event == null ? void 0 : event.keyCode) === 80 || (event == null ? void 0 : event.key) === "p" || (event == null ? void 0 : event.key) === "P";
    }
    onDestroy() {
      var _a, _b, _c, _d;
      Laya.timer.clear(this, this.presentLevelCompletion);
      LevelTransition.cancel();
      this.cancelPendingPauseIntent();
      this.unbindMobileBackgroundLifecycle();
      Laya.stage.off(Laya.Event.KEY_DOWN, this, this.onGlobalKeyDown);
      Laya.stage.off(Laya.Event.KEY_UP, this, this.onGlobalKeyUp);
      Laya.stage.off(Laya.Event.BLUR, this, this.onFocusLost);
      (_a = this.touchTutorial) == null ? void 0 : _a.destroy();
      this.touchTutorial = null;
      (_b = this.gameCompleteUI) == null ? void 0 : _b.destroy();
      this.gameCompleteUI = null;
      (_c = this.pauseUI) == null ? void 0 : _c.destroy();
      this.pauseUI = null;
      ScoreManager.instance.setWinHandler(null);
      ScoreManager.instance.clearTransientFeedback();
      ScoreManager.instance.finishLevelHudEntrance();
      if (this.ballController) {
        this.ballController.setTouchInputSource(null);
      }
      (_d = this.touchController) == null ? void 0 : _d.destroy();
      this.touchController = null;
    }
  };
  Main = __decorateClass([
    regClass2("e60XQm7tTY2BwFAdxb8D1g")
  ], Main);
})();
