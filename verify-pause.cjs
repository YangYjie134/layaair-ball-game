const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const repoRoot = __dirname;
const read = (relative) => fs.readFileSync(path.join(repoRoot, relative), "utf8");

function between(source, start, end) {
    const from = source.indexOf(start);
    assert.notEqual(from, -1, `missing start anchor: ${start}`);
    const to = source.indexOf(end, from + start.length);
    assert.notEqual(to, -1, `missing end anchor: ${end}`);
    return source.slice(from, to);
}

function inOrder(source, tokens, label) {
    let cursor = -1;
    for (const token of tokens) {
        const next = source.indexOf(token, cursor + 1);
        assert.notEqual(next, -1, `${label}: missing ${token}`);
        assert.ok(next > cursor, `${label}: out-of-order ${token}`);
        cursor = next;
    }
}

class Graphics {
    clear() {}
    drawRect() {}
    drawPoly() {}
    drawLine() {}
    drawCircle() {}
}

class Node {
    constructor() {
        Object.assign(this, {
            name: "", x: 0, y: 0, width: 0, height: 0, visible: true,
            mouseEnabled: false, mouseThrough: true, alpha: 1, zOrder: 0,
            parent: null, children: [], handlers: new Map(), graphics: new Graphics(), destroyed: false,
        });
    }
    addChild(child) { child.parent = this; this.children.push(child); return child; }
    removeSelf() {
        if (this.parent) {
            const index = this.parent.children.indexOf(this);
            if (index >= 0) this.parent.children.splice(index, 1);
        }
        this.parent = null;
        return this;
    }
    destroy(deep) {
        this.destroyed = true;
        if (deep) { for (const child of this.children) child.destroy?.(true); this.children = []; }
        this.handlers.clear();
    }
    on(event, caller, method) {
        const handlers = this.handlers.get(event) || [];
        handlers.push({ caller, method });
        this.handlers.set(event, handlers);
    }
    off(event, caller, method) {
        this.handlers.set(event, (this.handlers.get(event) || []).filter(
            (entry) => entry.caller !== caller || entry.method !== method,
        ));
    }
    offAll() { this.handlers.clear(); }
    emit(event, data = {}) {
        for (const entry of [...(this.handlers.get(event) || [])]) {
            entry.method.call(entry.caller, {
                currentTarget: this, target: this, stopPropagation() {}, ...data,
            });
        }
    }
}

class Text extends Node {
    constructor() {
        super();
        Object.assign(this, {
            text: "", font: "", fontSize: 0, color: "", bold: false,
            align: "left", valign: "top", stroke: 0, strokeColor: "",
        });
    }
}

function createLaya({ mobile = false } = {}) {
    const queue = [];
    const heldKeys = new Set();
    const windowListeners = new Map();
    const documentListeners = new Map();
    const addListener = (listeners, event, listener) => {
        const entries = listeners.get(event) || [];
        entries.push(listener);
        listeners.set(event, entries);
    };
    const removeListener = (listeners, event, listener) => {
        listeners.set(event, (listeners.get(event) || []).filter((entry) => entry !== listener));
    };
    const browserDocument = {
        hidden: false,
        visibilityState: "visible",
        addEventListener(event, listener) { addListener(documentListeners, event, listener); },
        removeEventListener(event, listener) { removeListener(documentListeners, event, listener); },
    };
    const browserWindow = {
        ...(mobile ? { ontouchstart: null } : {}),
        navigator: { maxTouchPoints: mobile ? 5 : 0 },
        document: browserDocument,
        addEventListener(event, listener) { addListener(windowListeners, event, listener); },
        removeEventListener(event, listener) { removeListener(windowListeners, event, listener); },
    };
    const stage = new Node();
    stage.width = 1334;
    stage.height = 750;
    class Script { constructor() { this.enabled = true; this.owner = null; } }
    const timer = {
        currTimer: 0,
        frameOnce(frames, caller, method) { queue.push({ frames, caller, method }); },
        frameLoop() {},
        clear(caller, method) {
            for (let index = queue.length - 1; index >= 0; index--) {
                if (queue[index].caller === caller && queue[index].method === method) queue.splice(index, 1);
            }
        },
        clearAll(caller) {
            for (let index = queue.length - 1; index >= 0; index--) {
                if (queue[index].caller === caller) queue.splice(index, 1);
            }
        },
        flush() {
            for (const entry of queue.splice(0, queue.length)) entry.method.call(entry.caller);
        },
        get pendingCount() { return queue.length; },
    };
    const laya = {
        Script, Sprite: Node, Text, stage, timer,
        Browser: { onMobile: mobile, window: browserWindow },
        Event: {
            CLICK: "click", MOUSE_OVER: "mouseover", MOUSE_OUT: "mouseout",
            MOUSE_DOWN: "mousedown", MOUSE_UP: "mouseup", KEY_DOWN: "keydown",
            KEY_UP: "keyup", BLUR: "blur", VISIBILITY_CHANGE: "visibilitychange",
        },
        Keyboard: { W: 87, UP: 38, R: 82, LEFT: 37, RIGHT: 39, A: 65, D: 68 },
        InputManager: { hasKeyDown: (key) => heldKeys.has(key) },
        regClass: () => (target) => target,
    };
    return {
        laya,
        heldKeys,
        emitWindow(event) {
            for (const listener of [...(windowListeners.get(event) || [])]) listener({ type: event });
        },
        emitDocument(event) {
            for (const listener of [...(documentListeners.get(event) || [])]) listener({ type: event });
        },
        setDocumentHidden(hidden) {
            browserDocument.hidden = hidden;
            browserDocument.visibilityState = hidden ? "hidden" : "visible";
        },
        windowListenerCount(event) { return (windowListeners.get(event) || []).length; },
        documentListenerCount(event) { return (documentListeners.get(event) || []).length; },
    };
}

function loadTs(relative, laya, dependencies = {}, globals = {}) {
    const file = path.join(repoRoot, relative);
    const output = ts.transpileModule(fs.readFileSync(file, "utf8"), {
        compilerOptions: {
            target: ts.ScriptTarget.ES2020,
            module: ts.ModuleKind.CommonJS,
            experimentalDecorators: true,
        },
        fileName: file,
    }).outputText;
    const module = { exports: {} };
    const context = vm.createContext({
        console: { log() {}, error() {}, warn() {} }, Date, Math, Map, Set,
        Number, String, Array, Object, Boolean, Error, Laya: laya, ...globals,
    });
    const wrapper = vm.runInContext(`(function(require,module,exports){${output}\n})`, context, { filename: file });
    wrapper((request) => {
        assert.ok(Object.prototype.hasOwnProperty.call(dependencies, request),
            `unexpected dependency ${request} from ${relative}`);
        return dependencies[request];
    }, module, module.exports);
    return module.exports;
}

function findNode(root, name) {
    if (!root) return null;
    if (root.name === name) return root;
    for (const child of root.children || []) {
        const match = findNode(child, name);
        if (match) return match;
    }
    return null;
}

function collectTexts(root, values = []) {
    if (!root) return values;
    if (typeof root.text === "string" && root.text) values.push(root.text);
    for (const child of root.children || []) collectTexts(child, values);
    return values;
}

function createMainFixture({ mobile = false } = {}) {
    const browser = createLaya({ mobile });
    const { laya } = browser;
    const score = {
        won: false, mobile: null, nextLevelHandler: null,
        setMobileTouchSession(value) { this.mobile = value; }, init() {},
        setNextLevelHandler(handler) { this.nextLevelHandler = handler; },
        isWon() { return this.won; },
    };
    const sfx = {
        muted: false,
        isGlobalMuted() { return this.muted; },
        setGlobalMuted(value) { this.muted = value; },
    };
    const touch = {
        held: true, active: false, resetCount: 0,
        resetAll() { this.held = false; this.resetCount++; },
        setGameplayActive(value) { this.active = value; if (!value) this.resetAll(); },
        setRuntimeBlockProvider() {}, completePreGame() {},
        deferPreGameActionIfHintVisible() { return false; }, destroy() {},
    };
    class FakeBall {
        constructor() {
            Object.assign(this, {
                enabled: true, blocked: false, beginPauseCount: 0, finishPauseCount: 0,
                rebaseCount: 0, restartCurrentCount: 0, currentLevel: 3, haptics: false,
                position: 10, velocity: 2, movingPlatformX: 20,
            });
        }
        setTouchInputSource() {}
        setLevelTransitionHandler(handler) { this.transitionHandler = handler; }
        isPauseBlockedByGameplayState() { return this.blocked || !this.enabled; }
        beginGameplayPauseAccounting() { this.beginPauseCount++; }
        finishGameplayPauseAccounting() { this.finishPauseCount++; }
        synchronizeJumpInputBaseline() { this.rebaseCount++; }
        restartCurrentAttempt() { this.restartCurrentCount++; this.position = 0; this.velocity = 0; }
        setDeathHapticsEnabled(value) { this.haptics = !!value; }
        isDeathHapticsEnabled() { return this.haptics; }
        advanceAfterWin() {}
        simulateEngineFrame() {
            if (!this.enabled) return;
            this.position += this.velocity;
            this.velocity += 1;
            this.movingPlatformX += 2;
        }
    }
    const ball = new FakeBall();
    const transitions = [];
    let introStart = null;
    const fixture = { ...browser, score, sfx, touch, ball, transitions, pauseUI: null };
    class StubPauseUI {
        constructor(isMobile, actions) {
            Object.assign(this, {
                mobile: isMobile, actions, available: false, shown: false, locked: false, showCount: 0,
            });
            fixture.pauseUI = this;
        }
        setPauseButtonAvailable(value) { this.available = value; }
        showPauseModal() { this.shown = true; this.locked = false; this.showCount++; }
        lockModalActions() { if (!this.shown || this.locked) return false; this.locked = true; return true; }
        hidePauseModal() { this.shown = false; }
        refreshSettings() {}
        destroy() {}
    }
    const { Main } = loadTs("src/Main.ts", laya, {
        "./BackgroundManager": { BackgroundManager: { draw() {} } },
        "./ScoreManager": { ScoreManager: { instance: score } },
        "./IntroUI": { IntroUI: { show(handler) { introStart = handler; } } },
        "./BgmManager": { BgmManager: { playBgm() {} } },
        "./SfxManager": { SfxManager: sfx },
        "./BallController": { default: FakeBall },
        "./LevelTransition": { LevelTransition: { show(level, completion) { transitions.push({ level, completion }); } } },
        "./PauseUI": { PauseUI: StubPauseUI },
        "./TouchController": { TouchController: { create: () => touch, isTouchCapable: () => mobile } },
        "./TouchTutorialUI": { TouchTutorialUI: { showOnce: () => null } },
    });
    const main = new Main();
    main.owner = { getChildByName: () => ({ getComponent: () => ball }) };
    main.onStart();
    Object.assign(fixture, {
        main,
        start: () => introStart(),
        finishTransition: () => transitions.shift().completion(),
    });
    return fixture;
}

function activate(fixture) {
    fixture.start();
    assert.equal(fixture.main.canPauseNow(), false, "transition allowed Pause");
    fixture.finishTransition();
    assert.equal(fixture.main.canPauseNow(), true, "active gameplay did not allow Pause");
}

function testGateAndRace() {
    const gate = createMainFixture();
    assert.equal(gate.main.canPauseNow(), false, "Cover/Main Menu allowed Pause");
    assert.equal(gate.pauseUI.available, false, "Cover/Main Menu exposed Pause button");
    activate(gate);
    assert.equal(gate.pauseUI.available, true, "desktop active gameplay hid Pause button");
    gate.main.touchTutorial = {};
    assert.equal(gate.main.canPauseNow(), false, "tutorial allowed Pause");
    gate.main.onUpdate();
    assert.equal(gate.pauseUI.available, false, "tutorial exposed Pause button");
    gate.main.touchTutorial = null;
    gate.main.levelTransitionActive = true;
    assert.equal(gate.main.canPauseNow(), false, "LevelTransition allowed Pause");
    gate.main.onUpdate();
    assert.equal(gate.pauseUI.available, false, "LevelTransition exposed Pause button");
    gate.main.levelTransitionActive = false;
    gate.ball.blocked = true;
    assert.equal(gate.main.canPauseNow(), false, "death handling allowed Pause");
    gate.main.onUpdate();
    assert.equal(gate.pauseUI.available, false, "death handling exposed Pause button");
    gate.ball.blocked = false;
    gate.score.won = true;
    assert.equal(gate.main.canPauseNow(), false, "Win allowed Pause");
    gate.main.onUpdate();
    assert.equal(gate.pauseUI.available, false, "Win exposed Pause button");

    const death = createMainFixture();
    activate(death);
    death.main.requestPauseIntent();
    assert.equal(death.laya.timer.pendingCount, 1);
    assert.equal(death.main.paused, false, "raw event committed Pause synchronously");
    death.ball.blocked = true;
    death.laya.timer.flush();
    assert.equal(death.main.paused, false, "same-tick death lost to Pause");
    assert.equal(death.main.pendingPauseIntent, false, "rejected Pause intent survived");

    const win = createMainFixture();
    activate(win);
    win.main.requestPauseIntent();
    win.score.won = true;
    win.laya.timer.flush();
    assert.equal(win.main.paused, false, "same-tick Win lost to Pause");

    const transition = createMainFixture();
    activate(transition);
    transition.main.requestPauseIntent();
    transition.main.showLevelTransition(2, () => {});
    assert.equal(transition.main.pendingPauseIntent, false);
    assert.equal(transition.laya.timer.pendingCount, 0, "transition retained pending Pause callback");
    console.log("Pause gate + deferred death/win/transition race: PASS");
}

function testFreezeTouchAndLatch() {
    const preGame = createMainFixture();
    preGame.main.onGlobalKeyDown({ keyCode: 80, key: "p" });
    assert.equal(preGame.main.paused, false, "pre-game P opened real Pause");
    assert.equal(preGame.main.pendingPauseIntent, false, "pre-game P queued real Pause");
    preGame.main.onGlobalKeyUp({ keyCode: 80, key: "p" });

    const fixture = createMainFixture({ mobile: true });
    activate(fixture);
    fixture.ball.simulateEngineFrame();
    const before = [fixture.ball.position, fixture.ball.velocity, fixture.ball.movingPlatformX];
    fixture.touch.held = true;
    fixture.main.onGlobalKeyDown({ keyCode: 80, key: "p" });
    fixture.laya.timer.flush();
    assert.equal(fixture.main.paused, true);
    assert.equal(fixture.ball.enabled, false);
    assert.equal(fixture.pauseUI.available, false, "Pause modal left underlying Pause button active");
    assert.equal(fixture.touch.held, false, "Pause retained touch state");
    fixture.ball.simulateEngineFrame();
    assert.deepEqual([fixture.ball.position, fixture.ball.velocity, fixture.ball.movingPlatformX], before,
        "ball/platform simulation advanced while disabled");
    fixture.main.onGlobalKeyDown({ keyCode: 80, key: "p" });
    assert.equal(fixture.main.paused, true, "key repeat immediately resumed");
    fixture.main.onGlobalKeyUp({ keyCode: 80, key: "p" });
    fixture.main.onGlobalKeyDown({ keyCode: 27, key: "Escape" });
    assert.equal(fixture.main.paused, true, "ESC remained a gameplay Pause/Resume shortcut");
    fixture.touch.held = true;
    fixture.main.onGlobalKeyDown({ keyCode: 80, key: "p" });
    assert.equal(fixture.main.paused, false, "fresh P did not resume");
    assert.equal(fixture.touch.held, false, "Resume retained touch state");
    assert.equal(fixture.ball.rebaseCount, 1);
    assert.equal(fixture.ball.beginPauseCount, 1);
    assert.equal(fixture.ball.finishPauseCount, 1);
    console.log("physics/platform freeze + touch reset + pre-game guard + P-only latch: PASS");
}

function fireMobileBackgroundBurst(fixture) {
    fixture.emitWindow("blur");
    fixture.setDocumentHidden(true);
    fixture.emitDocument("visibilitychange");
    fixture.emitWindow("pagehide");
}

function testMobileBackgroundAutoPause() {
    const active = createMainFixture({ mobile: true });
    assert.equal(active.windowListenerCount("blur"), 1);
    assert.equal(active.windowListenerCount("pagehide"), 1);
    assert.equal(active.documentListenerCount("visibilitychange"), 1);
    activate(active);
    const resetsBeforeBackground = active.touch.resetCount;
    active.touch.held = true;
    fireMobileBackgroundBurst(active);
    assert.equal(active.laya.timer.pendingCount, 1,
        "one app switch queued duplicate Pause commits");
    active.laya.timer.flush();
    assert.equal(active.main.paused, true, "active mobile gameplay did not auto-Pause");
    assert.equal(active.pauseUI.showCount, 1, "background burst mounted duplicate PauseUI");
    assert.equal(active.touch.held, false, "background auto-Pause retained held touch state");
    assert.ok(active.touch.resetCount > resetsBeforeBackground,
        "background auto-Pause bypassed canonical touch cleanup");

    fireMobileBackgroundBurst(active);
    assert.equal(active.laya.timer.pendingCount, 0, "already Paused background event queued another Pause");
    assert.equal(active.pauseUI.showCount, 1, "already Paused background event duplicated PauseUI");
    active.setDocumentHidden(false);
    active.emitDocument("visibilitychange");
    assert.equal(active.main.paused, true, "foreground visibility auto-resumed gameplay");
    assert.equal(active.ball.enabled, false, "foreground visibility re-enabled gameplay");
    active.pauseUI.actions.resume();
    assert.equal(active.main.paused, false, "explicit RESUME did not restore gameplay");
    assert.equal(active.ball.enabled, true);

    const blockedCases = [
        ["menu", () => {}],
        ["tutorial", (fixture) => { activate(fixture); fixture.main.touchTutorial = {}; }],
        ["transition", (fixture) => { fixture.start(); }],
        ["death", (fixture) => { activate(fixture); fixture.ball.blocked = true; }],
        ["win", (fixture) => { activate(fixture); fixture.score.won = true; }],
    ];
    for (const [label, arrange] of blockedCases) {
        const fixture = createMainFixture({ mobile: true });
        arrange(fixture);
        fireMobileBackgroundBurst(fixture);
        fixture.laya.timer.flush();
        assert.equal(fixture.main.paused, false, `${label} background event opened Pause`);
        assert.equal(fixture.pauseUI.showCount, 0, `${label} background event mounted PauseUI`);
    }

    const desktop = createMainFixture();
    activate(desktop);
    assert.equal(desktop.windowListenerCount("blur"), 0);
    assert.equal(desktop.windowListenerCount("pagehide"), 0);
    assert.equal(desktop.documentListenerCount("visibilitychange"), 0);
    fireMobileBackgroundBurst(desktop);
    desktop.laya.timer.flush();
    assert.equal(desktop.main.paused, false, "desktop gained mobile background auto-Pause");

    active.main.onDestroy();
    assert.equal(active.windowListenerCount("blur"), 0);
    assert.equal(active.windowListenerCount("pagehide"), 0);
    assert.equal(active.documentListenerCount("visibilitychange"), 0);
    console.log("mobile blur/visibility/pagehide idempotent auto-Pause + no auto-resume + state gates: PASS");
}

function loadBall({ withVibrate = true, navigatorSource = "laya" } = {}) {
    const { laya, heldKeys } = createLaya();
    const score = {
        won: false, resetCount: 0,
        isWon() { return this.won; },
        reset() { this.resetCount++; this.won = false; },
        addPlatformScore() {}, getScore() { return 0; },
    };
    const vibrations = [];
    const navigator = withVibrate ? { vibrate: (duration) => { vibrations.push(duration); return true; } } : {};
    if (navigatorSource === "laya") {
        laya.Browser.window.navigator = navigator;
    } else {
        laya.Browser.window.navigator = {};
    }
    const module = loadTs("src/BallController.ts", laya, {
        "./ScoreManager": { ScoreManager: { instance: score } },
        "./SfxManager": { SfxManager: { playJump() {}, playDeath() {} } },
    }, navigatorSource === "global" ? { navigator } : {});
    const controller = new module.default();
    controller.owner = { x: 0, y: 0, visible: true };
    return { controller, laya, heldKeys, score, vibrations };
}

function physicsEnv(playJump) {
    return {
        isWon: () => false, restartGame() {}, playJump,
        updateMovingPlatform() {}, resolveVerticalCollision() {},
        syncDisappearHighlightBar() {}, checkHazards() {},
        releaseGroundIfUnsupported() {}, clampToCanvas() {}, syncBallSprite() {},
    };
}

function testLogicalClockAndJump() {
    const clock = loadBall();
    const controller = clock.controller;
    const platform = { visible: true };
    controller.repaintPlatformColor = () => {};
    controller.disappearConfigs.set(platform, { state: "counting", triggerAt: 900 });
    clock.laya.timer.currTimer = 1000;
    controller.beginGameplayPauseAccounting();
    clock.laya.timer.currTimer = 11000;
    assert.equal(controller.readActiveGameplayTime(), 1000, "logical time advanced during Pause");
    controller.finishGameplayPauseAccounting();
    clock.laya.timer.currTimer = 11100;
    controller.stepPhysics(
        { x: 0, y: 0 },
        { restart: () => false, left: () => false, right: () => false, jump: () => false },
        { currTimer: () => clock.laya.timer.currTimer },
        physicsEnv(() => {}),
    );
    assert.equal(controller.disappearConfigs.get(platform).state, "counting",
        "real Pause duration skipped the disappearing countdown");
    clock.laya.timer.currTimer = 11750;
    controller.stepPhysics(
        { x: 0, y: 0 },
        { restart: () => false, left: () => false, right: () => false, jump: () => false },
        { currTimer: () => clock.laya.timer.currTimer },
        physicsEnv(() => {}),
    );
    assert.equal(controller.disappearConfigs.get(platform).state, "hidden",
        "active gameplay time did not advance after Resume");

    const jump = loadBall();
    let jumpCount = 0;
    jump.heldKeys.add(jump.laya.Keyboard.W);
    jump.controller.synchronizeJumpInputBaseline();
    jump.controller.onGround = true;
    jump.controller.groundPlatform = { name: "Ground" };
    jump.controller.stepPhysics(
        { x: 0, y: 0 },
        { restart: () => false, left: () => false, right: () => false, jump: () => true },
        { currTimer: () => 0 }, physicsEnv(() => jumpCount++),
    );
    assert.equal(jumpCount, 0, "held jump synthesized a jump after Resume");
    jump.heldKeys.clear();
    jump.controller.stepPhysics(
        { x: 0, y: 0 },
        { restart: () => false, left: () => false, right: () => false, jump: () => false },
        { currTimer: () => 1 }, physicsEnv(() => jumpCount++),
    );
    jump.controller.onGround = true;
    jump.controller.groundPlatform = { name: "Ground" };
    jump.controller.stepPhysics(
        { x: 0, y: 0 },
        { restart: () => false, left: () => false, right: () => false, jump: () => true },
        { currTimer: () => 2 }, physicsEnv(() => jumpCount++),
    );
    assert.equal(jumpCount, 1, "release + fresh jump press did not work");
    console.log("Pause-aware disappearing clock + keyboard jump rebase: PASS");
}

function testRestartAndHaptics() {
    const restart = loadBall();
    const controller = restart.controller;
    controller.currentLevel = 3;
    controller.activeGameplayPauseStartedAt = 100;
    controller.activeGameplayPauseAccumulatedMs = 50;
    restart.laya.timer.currTimer = 1000;
    let respawns = 0;
    let nextLevelCalls = 0;
    controller.clearDeathReconstruction = () => {};
    controller.clearDeathFeedback = () => {};
    controller.respawn = () => { respawns++; controller.vx = 0; controller.vy = 0; };
    controller.restartGame = () => { nextLevelCalls++; };
    controller.restartCurrentAttempt();
    assert.equal(controller.currentLevel, 3, "Pause RESTART advanced currentLevel");
    assert.equal(nextLevelCalls, 0, "Pause RESTART used next-level Win path");
    assert.equal(respawns, 1, "Pause RESTART did not reuse respawn");
    assert.equal(controller.vx, 0);
    assert.equal(controller.vy, 0);
    assert.equal(controller.activeGameplayPauseStartedAt, null);
    assert.equal(controller.activeGameplayPauseAccumulatedMs, 0);

    const haptics = loadBall();
    haptics.controller.startDeathFeedback = () => {};
    haptics.controller.startDeathReconstruction = () => {};
    haptics.controller.handleDeath();
    assert.deepEqual(haptics.vibrations, [], "default-OFF haptics vibrated");
    haptics.controller.setDeathHapticsEnabled(true);
    haptics.controller.handleDeath();
    assert.deepEqual(haptics.vibrations, [40],
        "opt-in real death path did not reach Laya.Browser.window.navigator.vibrate");
    haptics.controller.setDeathHapticsEnabled(false);
    haptics.controller.handleDeath();
    assert.deepEqual(haptics.vibrations, [40], "OFF-again haptics vibrated");
    const unsupported = loadBall({ withVibrate: false });
    unsupported.controller.setDeathHapticsEnabled(true);
    assert.doesNotThrow(() => unsupported.controller.triggerDeathHaptics());
    const fallback = loadBall({ navigatorSource: "global" });
    fallback.controller.setDeathHapticsEnabled(true);
    fallback.controller.triggerDeathHaptics();
    assert.deepEqual(fallback.vibrations, [40], "global navigator fallback did not vibrate");
    console.log("current-level RESTART + browser-window opt-in death haptics + safe fallback: PASS");
}

function testPauseUi() {
    const mobileLaya = createLaya({ mobile: true }).laya;
    const { PauseUI } = loadTs("src/PauseUI.ts", mobileLaya);
    let muted = false;
    let haptics = false;
    let requests = 0;
    const actions = {
        requestPause: () => requests++, resume() {}, restartCurrentAttempt() {},
        toggleMute: () => { muted = !muted; },
        toggleHaptics: () => { haptics = !haptics; },
        isMuted: () => muted, isHapticsEnabled: () => haptics,
    };
    const ui = new PauseUI(true, actions);
    const pauseButton = findNode(mobileLaya.stage, "PauseUI_PauseButton");
    assert.ok(pauseButton, "mobile Pause button was not mounted");
    assert.equal(pauseButton.zOrder, 10000);
    assert.equal(pauseButton.width, 64, "Pause hit width changed during visual narrowing");
    assert.equal(pauseButton.height, 50, "Pause hit height changed during visual narrowing");
    assert.equal(pauseButton.alpha, 0.5, "Pause idle state is not visibly semi-transparent");
    const pauseFace = findNode(pauseButton, "PauseUI_PauseFace");
    assert.ok(pauseFace);
    assert.equal(pauseFace.width, 50, "Pause visible body was not narrowed");
    assert.equal(pauseFace.x, 10, "Pause visible body did not preserve its prior right edge");
    assert.equal(pauseFace.x + pauseFace.width, 60,
        "Pause visible right edge drifted after narrowing");
    assert.ok(findNode(pauseButton, "PauseUI_PauseGlyph"));
    assert.equal(collectTexts(pauseButton).includes("PAUSE"), false,
        "Pause control retained the PAUSE annotation");
    ui.setPauseButtonAvailable(true);
    pauseButton.emit(mobileLaya.Event.MOUSE_DOWN);
    assert.equal(pauseFace.y, 2, "Pause pressed displacement feedback regressed");
    assert.equal(pauseButton.alpha, 1, "Pause pressed feedback did not restore full opacity");
    pauseButton.emit(mobileLaya.Event.MOUSE_UP);
    assert.equal(pauseFace.y, 0);
    assert.equal(pauseButton.alpha, 0.78, "Pause hover feedback did not brighten from idle");
    pauseButton.emit(mobileLaya.Event.CLICK);
    assert.equal(requests, 1);
    ui.showPauseModal();
    const modal = findNode(mobileLaya.stage, "PauseUI_Modal");
    assert.ok(modal);
    assert.equal(modal.zOrder, 10004);
    assert.ok(findNode(modal, "PauseUI_RESUME"));
    assert.ok(findNode(modal, "PauseUI_RESTART"));
    const mute = findNode(modal, "PauseUI_MUTE");
    const haptic = findNode(modal, "PauseUI_HAPTICS");
    assert.ok(mute && haptic, "mobile Pause settings are incomplete");
    mute.emit(mobileLaya.Event.CLICK);
    haptic.emit(mobileLaya.Event.CLICK);
    assert.equal(muted, true);
    assert.equal(haptics, true);
    assert.equal(mute.children[1].children[0].text, "MUTE: ON");
    assert.equal(haptic.children[1].children[0].text, "HAPTICS: ON");

    const desktopLaya = createLaya().laya;
    const DesktopPauseUI = loadTs("src/PauseUI.ts", desktopLaya).PauseUI;
    const desktop = new DesktopPauseUI(false, actions);
    const desktopButton = findNode(desktopLaya.stage, "PauseUI_PauseButton");
    assert.ok(desktopButton, "desktop Pause button was not mounted");
    assert.ok(desktopButton.width >= 44 && desktopButton.height >= 44,
        "desktop Pause click target is too small");
    assert.equal(collectTexts(desktopButton).includes("PAUSE"), false);
    desktop.setPauseButtonAvailable(true);
    desktopButton.emit(desktopLaya.Event.CLICK);
    assert.equal(requests, 2, "desktop Pause button did not route to canonical request action");
    desktop.showPauseModal();
    const desktopModal = findNode(desktopLaya.stage, "PauseUI_Modal");
    assert.ok(desktopModal);
    assert.equal(findNode(desktopModal, "PauseUI_HAPTICS"), null,
        "desktop modal exposed mobile Haptics");
    assert.ok(collectTexts(desktopModal).some((text) => text.includes("P  RESUME")));
    assert.equal(collectTexts(desktopModal).some((text) => text.includes("ESC")), false,
        "desktop Pause modal still teaches ESC Resume");
    console.log("desktop/mobile icon-only Pause button + modal layering + live settings labels: PASS");
}

function testStaticContracts() {
    const main = read("src/Main.ts");
    const ball = read("src/BallController.ts");
    const pause = read("src/PauseUI.ts");
    const intro = read("src/IntroUI.ts");
    const score = read("src/ScoreManager.ts");

    assert.equal((main.match(/private paused:\s*boolean/g) || []).length, 1);
    assert.doesNotMatch(ball, /(?:private|public)\s+(?:isPaused|paused)\s*:\s*boolean/);
    assert.doesNotMatch(pause, /(?:private|public)\s+(?:isPaused|paused)\s*:\s*boolean/);
    assert.doesNotMatch(pause, /\.enabled\s*=|stepPhysics|currTimer/);
    assert.match(main, /private canPauseNow\(\): boolean/);
    assert.match(main, /requestPauseIntent[\s\S]*?frameOnce\(1, this, this\.commitPendingPauseIntent\)/);
    assert.match(main, /commitPendingPauseIntent[\s\S]*?this\.canPauseNow\(\)/);

    const commit = between(main,
        "    private commitPendingPauseIntent(): void",
        "    private cancelPendingPauseIntent(): void");
    inOrder(commit, [
        "this.pendingPauseIntent = false;", "this.canPauseNow()", "this.paused = true;",
        "beginGameplayPauseAccounting()", "resetAll()", "setGameplayActive(false)",
        "this.ballController.enabled = false", "showPauseModal()",
    ], "Pause commit");
    const resume = between(main,
        "    private resumeFromPause(): void",
        "    private restartCurrentAttemptFromPause(): void");
    inOrder(resume, [
        "lockModalActions()", "resetAll()", "finishGameplayPauseAccounting()",
        "synchronizeJumpInputBaseline()", "this.paused = false",
        "this.ballController.enabled = true", "setGameplayActive(true)", "hidePauseModal()",
    ], "Resume");
    const restart = between(main,
        "    private restartCurrentAttemptFromPause(): void",
        "    private syncPausePresentation(): void");
    inOrder(restart, [
        "lockModalActions()", "resetAll()", "restartCurrentAttempt()",
        "synchronizeJumpInputBaseline()", "this.paused = false",
        "this.ballController.enabled = true", "setGameplayActive(true)", "hidePauseModal()",
    ], "Pause RESTART");
    const pauseKey = between(main,
        "    private isPauseKey(event: any): boolean",
        "    onDestroy(): void");
    assert.match(pauseKey, /keyCode === 80/);
    assert.doesNotMatch(pauseKey, /keyCode === 27|Escape|Esc/);
    const pausePresentation = between(main,
        "    private syncPausePresentation(): void",
        "    private bindMobileBackgroundLifecycle(): void");
    assert.match(pausePresentation, /!this\.pendingPauseIntent && this\.canPauseNow\(\)/);
    assert.doesNotMatch(pausePresentation, /mobileTouchSession/,
        "desktop Pause button remained suppressed");
    const lifecycle = between(main,
        "    private bindMobileBackgroundLifecycle(): void",
        "    private toggleGlobalMute(): void");
    for (const signal of ["blur", "visibilitychange", "pagehide"]) {
        assert.match(lifecycle, new RegExp(`addEventListener\\?\\.\\(\"${signal}\"`));
        assert.match(lifecycle, new RegExp(`removeEventListener\\?\\.\\(\"${signal}\"`));
    }
    assert.match(lifecycle,
        /private requestMobileBackgroundPause\(\): void \{[\s\S]*?if \(!this\.mobileTouchSession\) return;[\s\S]*?this\.requestPauseIntent\(\)/);

    assert.match(main, /SfxManager\.isGlobalMuted\(\)/);
    assert.match(main, /SfxManager\.setGlobalMuted\(nextMuted\)/);
    assert.doesNotMatch(pause, /globalMuted|setGlobalMuted|BgmManager|AudioContext|suspend\(/);
    assert.doesNotMatch(resume, /BgmManager|playBgm/);
    assert.doesNotMatch(commit, /BgmManager|playBgm/);
    assert.match(ball, /private deathHapticsEnabled:\s*boolean\s*=\s*false/);
    assert.match(ball,
        /if \(!this\.deathHapticsEnabled\) return;[\s\S]*?Laya\.Browser\?\.window\?\.navigator[\s\S]*?navigatorObject\.vibrate\.call\(navigatorObject, 40\)/);
    assert.equal((between(ball,
        "    private handleDeath(): void",
        "    private startDeathFeedback(): void").match(/triggerDeathHaptics\(\)/g) || []).length, 1);
    assert.doesNotMatch(ball, /localStorage|sessionStorage|document\.cookie/);

    assert.match(main, /ScoreManager\.instance\.setMobileTouchSession\(this\.mobileTouchSession\)/);
    assert.match(score, /restartHint\.visible\s*=\s*!this\.mobileTouchSession/);
    assert.match(intro,
        /IntroUI\.mobileTouchSession\s*\?\s*"TAP AN OPTION TO SELECT"\s*:\s*"W \/ ↑\s+PREVIOUS\s+S \/ ↓\s+NEXT\s+ENTER\s+CONFIRM"/);
    assert.match(intro,
        /IntroUI\.mobileTouchSession\s*\?\s*"TAP ANYWHERE TO CONTINUE"\s*:\s*"CLICK \/ TAP ANYWHERE OR PRESS \[ ENTER \] TO CONTINUE"/);
    assert.match(intro,
        /if \(!IntroUI\.mobileTouchSession\) \{[\s\S]*?"Mouse or touch an item to select and confirm"/);
    const mobileHelp = between(intro,
        "    private static renderMobileHowToPlay(): void",
        "    private static createTouchGuideCard(");
    assert.match(mobileHelp, /MOVE \+ JUMP/);
    assert.doesNotMatch(mobileHelp, /PRESS\s+[PMR]|KEYBOARD|\bPAUSE\b|\bESC\b|\bENTER\b/i);
    assert.match(intro, /createUtilityKey\("P",\s*"PAUSE"/);
    assert.match(intro, /code === "KeyP" \|\| keyCode === 80[\s\S]*?return "P"/);
    assert.match(pause, /PAUSE_BUTTON_Z:\s*number\s*=\s*10000/);
    assert.match(pause, /PAUSE_MODAL_Z:\s*number\s*=\s*10004/);
    assert.match(pause,
        /const width = 64;[\s\S]*?const visibleWidth = 50;[\s\S]*?const visibleRightInset = 4;[\s\S]*?const visibleX = width - visibleRightInset - visibleWidth;/);
    assert.match(pause,
        /button\.x = Math\.max\(18, \(Number\(Laya\.stage\?\.width\) \|\| 1334\) - width - 34\)/);
    assert.match(pause,
        /glyph\.graphics\.drawRect\(14, 15, 7, 20,[\s\S]*?glyph\.graphics\.drawRect\(29, 15, 7, 20,/);
    assert.match(pause, /constructor\([\s\S]*?this\.mountPauseButton\(\)/);
    assert.doesNotMatch(pause, /createText\("PAUSE"|P \/ ESC|MobilePause/);
    console.log("single authority + ordering + P-only input + lifecycle + mobile-copy contracts: PASS");
}

testStaticContracts();
testGateAndRace();
testFreezeTouchAndLatch();
testMobileBackgroundAutoPause();
testLogicalClockAndJump();
testRestartAndHaptics();
testPauseUi();
console.log("pause verification: PASS");
