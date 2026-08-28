const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { execFileSync } = require("node:child_process");
const ts = require("typescript");

const repoRoot = path.resolve(__dirname, "..");
const touchPath = path.join(repoRoot, "src", "TouchController.ts");
const mainPath = path.join(repoRoot, "src", "Main.ts");
const ballPath = path.join(repoRoot, "src", "BallController.ts");
const scenePath = path.join(repoRoot, "assets", "Scene.ls");
const settingsPath = path.join(repoRoot, "settings", "PlayerSettings.json");

function read(filePath) {
    return fs.readFileSync(filePath, "utf8");
}

function headFile(relativePath) {
    return execFileSync("git", ["show", `HEAD:${relativePath}`], {
        cwd: repoRoot,
        encoding: "utf8",
    });
}

function extractBetween(source, start, end) {
    const startIndex = source.indexOf(start);
    const endIndex = source.indexOf(end, startIndex);
    assert.ok(startIndex >= 0 && endIndex > startIndex, `Missing protected anchor: ${start}`);
    return source.slice(startIndex, endIndex);
}

function loadTouchModule(laya) {
    const compiled = ts.transpileModule(read(touchPath), {
        compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2019,
        },
        fileName: touchPath,
    }).outputText;
    const module = { exports: {} };
    vm.runInNewContext(compiled, {
        module,
        exports: module.exports,
        Map,
        Set,
        Number,
        Laya: laya,
    }, { filename: "TouchController.js" });
    return module.exports;
}

function runStateSmoke() {
    const { TouchInputState } = loadTouchModule();
    const state = new TouchInputState();
    assert.equal(state.isHeld("left"), false);
    assert.equal(state.isHeld("right"), false);
    assert.equal(state.isHeld("jump"), false);

    state.press("left", 11);
    assert.equal(state.isHeld("left"), true);
    state.releasePointer(11);
    assert.equal(state.isHeld("left"), false);

    state.press("right", 12);
    assert.equal(state.isHeld("right"), true);
    state.releasePointer(12);
    assert.equal(state.isHeld("right"), false);

    state.press("jump", 13);
    assert.equal(state.isHeld("jump"), true);
    state.releasePointer(13);
    assert.equal(state.isHeld("jump"), false);
    console.log("touch-only LEFT/RIGHT/JUMP: PASS");

    state.press("left", 21);
    state.press("jump", 22);
    assert.equal(state.isHeld("left"), true);
    assert.equal(state.isHeld("jump"), true);
    state.clear();
    console.log("LEFT + JUMP multitouch: PASS");

    state.press("right", 31);
    state.press("jump", 32);
    assert.equal(state.isHeld("right"), true);
    assert.equal(state.isHeld("jump"), true);
    state.clear();
    console.log("RIGHT + JUMP multitouch: PASS");

    let previousJump = false;
    let jumpEdges = 0;
    const sampleJump = () => {
        const jump = state.isHeld("jump");
        if (jump && !previousJump) jumpEdges++;
        previousJump = jump;
    };
    state.press("jump", 41);
    sampleJump();
    sampleJump();
    sampleJump();
    assert.equal(jumpEdges, 1);
    state.releasePointer(41);
    sampleJump();
    state.press("jump", 42);
    sampleJump();
    assert.equal(jumpEdges, 2);
    console.log("held jump edge model: PASS");

    state.press("left", 51);
    state.press("jump", 52);
    state.releasePointer(51);
    assert.equal(state.isHeld("left"), false);
    assert.equal(state.isHeld("jump"), true);
    state.clear();
    assert.equal(state.isHeld("jump"), false);
    console.log("independent release/cancel reset: PASS");
}

function runOrientationStateSmoke() {
    const { OrientationHintState } = loadTouchModule();

    const rotateState = new OrientationHintState();
    rotateState.syncViewport(true);
    assert.equal(rotateState.isVisible(), true);
    assert.equal(rotateState.isAcknowledged(), false);
    rotateState.syncViewport(false);
    assert.equal(rotateState.isVisible(), false);
    assert.equal(rotateState.isAcknowledged(), true);
    rotateState.syncViewport(true);
    assert.equal(rotateState.isVisible(), false);
    console.log("portrait hint -> landscape auto-ack -> no repeat: PASS");

    const continueState = new OrientationHintState();
    continueState.syncViewport(true);
    continueState.acknowledge();
    assert.equal(continueState.isVisible(), false);
    assert.equal(continueState.isAcknowledged(), true);
    continueState.syncViewport(true);
    assert.equal(continueState.isVisible(), false);
    console.log("portrait Continue acknowledgment: PASS");

    const landscapeFirstState = new OrientationHintState();
    landscapeFirstState.syncViewport(false);
    assert.equal(landscapeFirstState.isVisible(), false);
    assert.equal(landscapeFirstState.isAcknowledged(), false);
    landscapeFirstState.completePreGame();
    landscapeFirstState.syncViewport(true);
    assert.equal(landscapeFirstState.isVisible(), false);
    console.log("landscape first launch + pre-game-only gate: PASS");
}

function runLayoutSmoke() {
    const { TOUCH_CONTROL_LAYOUT: layout } = loadTouchModule();
    assert.equal(layout.left.visibleSize, 88);
    assert.equal(layout.right.visibleSize, 88);
    assert.equal(layout.jump.visibleSize, 96);
    assert.ok(layout.left.hitSize > layout.left.visibleSize);
    assert.ok(layout.right.hitSize > layout.right.visibleSize);
    assert.ok(layout.jump.hitSize > layout.jump.visibleSize);

    const directionGap = layout.right.hitX - (layout.left.hitX + layout.left.hitSize);
    assert.equal(directionGap, 8);
    for (const control of ["left", "right", "jump"]) {
        const bounds = layout[control];
        assert.ok(bounds.hitX >= 0 && bounds.hitY >= 0, `${control} hit area leaves the stage`);
        assert.ok(bounds.hitX + bounds.hitSize <= 1334, `${control} hit area exceeds stage width`);
        assert.ok(bounds.hitY + bounds.hitSize <= 750, `${control} hit area exceeds stage height`);
    }
    console.log("visible bounds preserved + enlarged non-overlapping hit bounds: PASS");
}

function createMockLaya(initialWidth = 1334, initialHeight = 750) {
    class Graphics {
        constructor() {
            this.operations = [];
        }

        clear() {
            this.operations = [];
        }

        drawPoly(...args) {
            this.operations.push({ method: "drawPoly", args });
        }

        drawLine(...args) {
            this.operations.push({ method: "drawLine", args });
        }

        drawRect(...args) {
            this.operations.push({ method: "drawRect", args });
        }
    }

    class Sprite {
        constructor() {
            this.name = "";
            this.x = 0;
            this.y = 0;
            this.width = 0;
            this.height = 0;
            this.alpha = 1;
            this.visible = true;
            this.children = [];
            this.parent = null;
            this.graphics = new Graphics();
            this.handlers = new Map();
        }

        addChild(child) {
            child.parent = this;
            this.children.push(child);
            return child;
        }

        removeSelf() {
            if (this.parent) {
                this.parent.children = this.parent.children.filter((child) => child !== this);
                this.parent = null;
            }
            return this;
        }

        destroy(destroyChildren) {
            if (destroyChildren) {
                for (const child of [...this.children]) child.destroy(true);
            }
            this.children = [];
            this.removeSelf();
            this.destroyed = true;
        }

        on(event, caller, method) {
            const handlers = this.handlers.get(event) || [];
            handlers.push({ caller, method });
            this.handlers.set(event, handlers);
        }

        off(event, caller, method) {
            const handlers = this.handlers.get(event) || [];
            this.handlers.set(event, handlers.filter((entry) => entry.caller !== caller || entry.method !== method));
        }

        emit(event, payload = {}) {
            for (const entry of [...(this.handlers.get(event) || [])]) {
                entry.method.call(entry.caller, payload);
            }
        }
    }

    class Text extends Sprite {
        constructor() {
            super();
            this.text = "";
        }
    }

    const windowListeners = new Map();
    const browserWindow = {
        ontouchstart: null,
        navigator: { maxTouchPoints: 5 },
        innerWidth: initialWidth,
        innerHeight: initialHeight,
        document: { documentElement: { clientWidth: initialWidth, clientHeight: initialHeight } },
        addEventListener(event, listener) {
            const listeners = windowListeners.get(event) || [];
            listeners.push(listener);
            windowListeners.set(event, listeners);
        },
        removeEventListener(event, listener) {
            const listeners = windowListeners.get(event) || [];
            windowListeners.set(event, listeners.filter((entry) => entry !== listener));
        },
    };

    const scheduled = [];
    const stage = new Sprite();
    stage.width = 1334;
    stage.height = 750;
    stage.isVisibility = true;
    const Event = {
        MOUSE_DOWN: "mousedown",
        MOUSE_UP: "mouseup",
        MOUSE_OUT: "mouseout",
        CLICK: "click",
        BLUR: "blur",
        VISIBILITY_CHANGE: "visibilitychange",
    };
    const laya = {
        Sprite,
        Text,
        Event,
        stage,
        Browser: { window: browserWindow, clientWidth: initialWidth, clientHeight: initialHeight },
        InputManager: { multiTouchEnabled: false },
        timer: {
            once(delay, caller, method) {
                scheduled.push({ delay, caller, method });
            },
            clearAll(caller) {
                for (let index = scheduled.length - 1; index >= 0; index--) {
                    if (scheduled[index].caller === caller) scheduled.splice(index, 1);
                }
            },
        },
    };

    return {
        laya,
        emitWindow(event) {
            for (const listener of [...(windowListeners.get(event) || [])]) listener();
        },
        setViewport(width, height) {
            browserWindow.innerWidth = width;
            browserWindow.innerHeight = height;
            browserWindow.document.documentElement.clientWidth = width;
            browserWindow.document.documentElement.clientHeight = height;
            laya.Browser.clientWidth = width;
            laya.Browser.clientHeight = height;
        },
        runTimers() {
            while (scheduled.length > 0) {
                const task = scheduled.shift();
                task.method.call(task.caller);
            }
        },
    };
}

function findNode(root, name) {
    if (root.name === name) return root;
    for (const child of root.children || []) {
        const match = findNode(child, name);
        if (match) return match;
    }
    return null;
}

function hasBorder(node, color) {
    return node.graphics.operations.some((operation) => (
        operation.method === "drawPoly" && operation.args[4] === color
    ));
}

function runMountedUiSmoke() {
    const portraitMock = createMockLaya(390, 844);
    const { TouchController: PortraitController } = loadTouchModule(portraitMock.laya);
    const portraitController = PortraitController.create();
    const portraitHint = findNode(portraitMock.laya.stage, "MobileOrientationHint");
    assert.ok(portraitHint && portraitHint.visible, "portrait hint was not mounted visibly");
    let deferredRuns = 0;
    assert.equal(portraitController.deferPreGameActionIfHintVisible(() => deferredRuns++), true);
    portraitMock.setViewport(844, 390);
    portraitMock.emitWindow("orientationchange");
    assert.equal(portraitHint.visible, false);
    assert.equal(deferredRuns, 1);
    portraitMock.setViewport(390, 844);
    portraitMock.emitWindow("resize");
    assert.equal(portraitHint.visible, false);
    portraitController.destroy();
    console.log("mounted portrait hint rotate-dismiss + session no-repeat: PASS");

    const continueMock = createMockLaya(390, 844);
    const { TouchController: ContinueController } = loadTouchModule(continueMock.laya);
    const continueController = ContinueController.create();
    const continueHint = findNode(continueMock.laya.stage, "MobileOrientationHint");
    const continueButton = findNode(continueMock.laya.stage, "MobileOrientationHint_Continue");
    continueButton.emit(continueMock.laya.Event.CLICK, { stopPropagation() {} });
    assert.equal(continueHint.visible, false);
    continueMock.emitWindow("resize");
    assert.equal(continueHint.visible, false);
    continueController.destroy();
    console.log("mounted portrait Continue-dismiss: PASS");

    const controlsMock = createMockLaya(844, 390);
    const { TouchController } = loadTouchModule(controlsMock.laya);
    const controller = TouchController.create();
    const orientationHint = findNode(controlsMock.laya.stage, "MobileOrientationHint");
    assert.ok(orientationHint && !orientationHint.visible, "landscape first launch showed a hint");
    controller.completePreGame();
    controller.setGameplayActive(true);

    const leftVisual = findNode(controlsMock.laya.stage, "MobileTouch_LEFT_VISIBLE");
    const rightHit = findNode(controlsMock.laya.stage, "MobileTouch_RIGHT_HIT");
    const rightVisual = findNode(controlsMock.laya.stage, "MobileTouch_RIGHT_VISIBLE");
    const jumpHit = findNode(controlsMock.laya.stage, "MobileTouch_JUMP_HIT");
    const jumpVisual = findNode(controlsMock.laya.stage, "MobileTouch_JUMP_VISIBLE");
    rightHit.emit(controlsMock.laya.Event.MOUSE_DOWN, { currentTarget: rightHit, touchId: 31, stopPropagation() {} });
    jumpHit.emit(controlsMock.laya.Event.MOUSE_DOWN, { currentTarget: jumpHit, touchId: 32, stopPropagation() {} });
    assert.equal(controller.right(), true);
    assert.equal(controller.jump(), true);
    assert.equal(controller.left(), false);
    assert.equal(hasBorder(rightVisual, "#A5FBFF"), true);
    assert.equal(hasBorder(jumpVisual, "#A5FBFF"), true);
    assert.equal(hasBorder(leftVisual, "#A5FBFF"), false);
    assert.equal(rightVisual.children.filter((child) => /PRESS_BURST$/.test(child.name)).length, 1);
    assert.equal(jumpVisual.children.filter((child) => /PRESS_BURST$/.test(child.name)).length, 1);
    controlsMock.runTimers();
    assert.equal(controller.right(), true);
    assert.equal(controller.jump(), true);
    controlsMock.emitWindow("touchcancel");
    assert.equal(controller.right(), false);
    assert.equal(controller.jump(), false);
    controller.destroy();
    console.log("independent pressed glow + UI-only finite sparks + touchcancel reset: PASS");
}

function runStaticContracts() {
    const ballSource = read(ballPath);
    const headBallSource = headFile("src/BallController.ts");
    const protectedStep = extractBetween(ballSource, "    public stepPhysics(", "    private levelTransitionHandler:");
    const headProtectedStep = extractBetween(headBallSource, "    public stepPhysics(", "    private levelTransitionHandler:");
    assert.equal(protectedStep, headProtectedStep, "stepPhysics changed outside the authorized input seam");

    assert.match(ballSource, /left:\s*\(\)\s*=>\s*this\.isKeyDown\(Laya\.Keyboard\.LEFT,\s*Laya\.Keyboard\.A\)\s*\|\|\s*!!this\.touchInput\?\.left\(\)/);
    assert.match(ballSource, /right:\s*\(\)\s*=>\s*this\.isKeyDown\(Laya\.Keyboard\.RIGHT,\s*Laya\.Keyboard\.D\)\s*\|\|\s*!!this\.touchInput\?\.right\(\)/);
    assert.match(ballSource, /jump:\s*\(\)\s*=>\s*this\.isKeyDown\(Laya\.Keyboard\.W\)\s*\|\|\s*this\.isKeyDown\(Laya\.Keyboard\.UP\)\s*\|\|\s*!!this\.touchInput\?\.jump\(\)/);
    console.log("keyboard + touch input seam: PASS");
    console.log("stepPhysics protected body unchanged: PASS");

    const touchSource = read(touchPath);
    assert.match(touchSource, /MOUSE_OUT/);
    assert.match(touchSource, /MOUSE_UP/);
    assert.match(touchSource, /touchcancel/);
    assert.match(touchSource, /Event\.BLUR/);
    assert.match(touchSource, /VISIBILITY_CHANGE/);
    assert.match(ballSource, /isDeathReconstructionActive\(\)/);
    console.log("release/cancel/focus/death-lock hooks: PASS");

    const mainSource = read(mainPath);
    assert.match(touchSource, /innerWidth/);
    assert.match(touchSource, /innerHeight/);
    assert.match(touchSource, /orientationchange/);
    assert.match(touchSource, /继续使用竖屏\s+\/\s+CONTINUE/);
    assert.match(mainSource, /deferPreGameActionIfHintVisible/);
    assert.match(mainSource, /completePreGame\(\)/);
    assert.doesNotMatch(touchSource, /localStorage|sessionStorage|document\.cookie/);
    assert.doesNotMatch(touchSource, /requestFullscreen|screen\.orientation\.lock|Math\.random/);
    assert.doesNotMatch(touchSource, /BgmManager|SfxManager|playBgm|playSfx/);
    console.log("session-local pre-game orientation recommendation contracts: PASS");

    assert.match(touchSource, /PRESS_SPARK_COUNT:\s*number\s*=\s*3/);
    assert.match(touchSource, /freshPress/);
    assert.match(touchSource, /Laya\.timer\.once\(180/);
    console.log("finite deterministic UI-only press feedback contracts: PASS");

    const scene = JSON.parse(read(scenePath));
    assert.equal(scene.width, 1334);
    assert.equal(scene.height, 750);
    const settings = JSON.parse(read(settingsPath));
    assert.equal(settings.resolution.scaleMode, "showall");
    assert.equal(settings.resolution.alignH, "center");
    assert.equal(settings.resolution.screenMode, "horizontal");
    console.log("logical stage 1334x750 + showall + horizontal: PASS");

    for (const constantName of ["moveAccel", "maxSpeedX", "friction", "gravity", "jumpStrength", "bounceY", "bounceX"]) {
        const pattern = new RegExp(`private ${constantName}: number = [^;]+;`);
        assert.equal(ballSource.match(pattern)?.[0], headBallSource.match(pattern)?.[0], `${constantName} changed`);
    }
    console.log("physics constants unchanged: PASS");

    const changed = execFileSync("git", ["diff", "--name-only"], { cwd: repoRoot, encoding: "utf8" })
        .split(/\r?\n/)
        .filter(Boolean);
    assert.equal(changed.some((file) => /(?:^|\/)(?:BgmManager|SfxManager)\.ts$|^assets\/resources\/audio\//.test(file)), false);
    assert.equal(changed.includes("assets/Scene.ls"), false);
    assert.equal(changed.some((file) => /^tools\/(?:verify-l4|l4-.*(?:snapshot|baseline))/.test(file)), false);
    console.log("world layout, audio, and L4 fixture files unchanged: PASS");
}

runStateSmoke();
runOrientationStateSmoke();
runLayoutSmoke();
runMountedUiSmoke();
runStaticContracts();
console.log("verification: PASS");
