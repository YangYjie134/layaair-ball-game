const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { execFileSync } = require("node:child_process");
const ts = require("typescript");

const repoRoot = path.resolve(__dirname, "..");
const touchPath = path.join(repoRoot, "src", "TouchController.ts");
const tutorialPath = path.join(repoRoot, "src", "TouchTutorialUI.ts");
const introPath = path.join(repoRoot, "src", "IntroUI.ts");
const mainPath = path.join(repoRoot, "src", "Main.ts");
const ballPath = path.join(repoRoot, "src", "BallController.ts");
const scorePath = path.join(repoRoot, "src", "ScoreManager.ts");
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

function assertSourceOrder(source, anchors, label) {
    let previousIndex = -1;
    for (const anchor of anchors) {
        const index = source.indexOf(anchor);
        assert.ok(index > previousIndex, `${label}: expected source order for ${anchor}`);
        previousIndex = index;
    }
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

function loadTutorialModule(laya, touchModule) {
    const compiled = ts.transpileModule(read(tutorialPath), {
        compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2019,
        },
        fileName: tutorialPath,
    }).outputText;
    const module = { exports: {} };
    vm.runInNewContext(compiled, {
        module,
        exports: module.exports,
        require(request) {
            if (request === "./TouchController") return touchModule;
            throw new Error(`Unexpected tutorial dependency: ${request}`);
        },
        console,
        Math,
        Number,
        Laya: laya,
    }, { filename: "TouchTutorialUI.js" });
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

    state.press("left", 33);
    state.press("right", 33);
    assert.equal(state.isHeld("left"), false,
        "one pointer remained owned by LEFT after reassignment to RIGHT");
    assert.equal(state.isHeld("right"), true,
        "one pointer failed to transfer exclusively to RIGHT");
    state.clear();
    console.log("single-pointer LEFT/RIGHT exclusive ownership: PASS");

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
    assert.equal(layout.left.visibleX, 56);
    assert.equal(layout.right.visibleX, 168);
    assert.equal(layout.jump.visibleX, 1174);
    assert.equal(layout.left.visibleY, 558);
    assert.equal(layout.right.visibleY, 558);
    assert.equal(layout.jump.visibleY, 548);
    assert.equal(layout.left.hitSize, 110);
    assert.equal(layout.right.hitSize, 110);
    assert.equal(layout.jump.hitSize, 136);

    const directionGap = layout.right.hitX - (layout.left.hitX + layout.left.hitSize);
    assert.equal(directionGap, 2);
    assert.ok(directionGap > 0, "LEFT and RIGHT hit areas overlap");
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
        MOUSE_OVER: "mouseover",
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
            clear(caller, method) {
                for (let index = scheduled.length - 1; index >= 0; index--) {
                    if (scheduled[index].caller === caller && scheduled[index].method === method) {
                        scheduled.splice(index, 1);
                    }
                }
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
        scheduledCount() {
            return scheduled.length;
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

function runTutorialMountedSmoke() {
    const tutorialMock = createMockLaya(844, 390);
    const touchModule = loadTouchModule(tutorialMock.laya);
    const { TouchController } = touchModule;
    const { TouchTutorialUI } = loadTutorialModule(tutorialMock.laya, touchModule);
    const controller = TouchController.create();
    controller.completePreGame();
    controller.setGameplayActive(true);

    const controlsRoot = findNode(tutorialMock.laya.stage, "MobileTouchControls");
    const orientationRoot = findNode(tutorialMock.laya.stage, "MobileOrientationHint");
    const leftHit = findNode(tutorialMock.laya.stage, "MobileTouch_LEFT_HIT");
    const rightHit = findNode(tutorialMock.laya.stage, "MobileTouch_RIGHT_HIT");
    const jumpHit = findNode(tutorialMock.laya.stage, "MobileTouch_JUMP_HIT");
    const stageChildrenBeforeTutorial = tutorialMock.laya.stage.children.length;
    let completionRuns = 0;
    let teardownPrecededCompletion = false;
    const tutorial = TouchTutorialUI.showOnce(() => {
        teardownPrecededCompletion = findNode(tutorialMock.laya.stage, "TouchTutorialModal") === null;
        controller.resetAll();
        completionRuns++;
    });

    assert.ok(tutorial, "first tutorial display was suppressed");
    assert.equal(TouchTutorialUI.hasShownThisSession(), true);
    const tutorialRoot = findNode(tutorialMock.laya.stage, "TouchTutorialModal");
    assert.ok(tutorialRoot, "tutorial modal was not mounted");
    assert.equal(tutorialRoot.zOrder, 10002);
    assert.equal(controlsRoot.zOrder, 9998);
    assert.equal(orientationRoot.zOrder, 10003);
    assert.equal(controlsRoot.visible, true, "touch controls hidden beneath tutorial");
    assert.equal(tutorialRoot.mouseThrough, false);
    assert.ok(findNode(tutorialRoot, "TouchTutorial_Focus_LEFT"));
    assert.ok(findNode(tutorialRoot, "TouchTutorial_Focus_RIGHT"));
    assert.equal(findNode(tutorialRoot, "TouchTutorial_Focus_JUMP"), null);

    let stoppedEvents = 0;
    const stepOneRoot = findNode(tutorialRoot, "TouchTutorial_STEP_1");
    const stepOnePanel = findNode(tutorialRoot, "TouchTutorial_GuidePanel");
    const stepOneYes = findNode(tutorialRoot, "TouchTutorial_YES");
    const stepOneYesFace = findNode(tutorialRoot, "TouchTutorial_YES_Face");
    const stepOneYesLabel = findNode(tutorialRoot, "TouchTutorial_YES_Label");
    assert.ok(stepOnePanel && stepOneYes && stepOneYesFace && stepOneYesLabel);
    assert.equal(stepOneYesLabel.text, "YES");
    assert.equal(stepOneYesLabel.font, "Courier New");
    assert.equal(stepOneYesLabel.bold, true);
    assert.equal(hasBorder(stepOneYesFace, "#38BDF8"), true, "YES did not inherit the cyan cyber CTA edge");
    assert.equal(stepOneYesFace.graphics.operations.some((operation) => operation.args[3] === "#FFFFFF"), false,
        "YES used white as its dominant body fill");

    const blockedTap = (target, stageX, stageY) => {
        const event = { stageX, stageY, stopPropagation() { stoppedEvents++; } };
        target.emit(tutorialMock.laya.Event.MOUSE_DOWN, event);
        target.emit(tutorialMock.laya.Event.MOUSE_UP, event);
        target.emit(tutorialMock.laya.Event.CLICK, event);
    };
    blockedTap(tutorialRoot, 12, 12);
    blockedTap(stepOnePanel, stepOnePanel.x + 30, stepOnePanel.y + 30);
    for (const control of ["left", "right", "jump"]) {
        const layout = touchModule.TOUCH_CONTROL_LAYOUT[control];
        blockedTap(tutorialRoot, layout.hitX + layout.hitSize / 2, layout.hitY + layout.hitSize / 2);
    }
    assert.equal(findNode(tutorialRoot, "TouchTutorial_STEP_1"), stepOneRoot,
        "background, panel, or control-area tap advanced STEP 1");
    assert.equal(completionRuns, 0);
    assert.equal(controller.left(), false);
    assert.equal(controller.right(), false);
    assert.equal(controller.jump(), false);

    const tutorialChildCount = tutorialRoot.children.length;
    stepOneYes.emit(tutorialMock.laya.Event.MOUSE_DOWN, { stopPropagation() { stoppedEvents++; } });
    assert.equal(stepOneYesFace.y, 3, "YES lacks pressed displacement feedback");
    stepOneYes.emit(tutorialMock.laya.Event.MOUSE_UP, { stopPropagation() { stoppedEvents++; } });
    assert.equal(stepOneYesFace.y, 0, "YES pressed feedback did not release");
    stepOneYes.emit(tutorialMock.laya.Event.CLICK, { stopPropagation() { stoppedEvents++; } });
    const stepTwoRoot = findNode(tutorialRoot, "TouchTutorial_STEP_2");
    const stepTwoPanel = findNode(tutorialRoot, "TouchTutorial_GuidePanel");
    const stepTwoYes = findNode(tutorialRoot, "TouchTutorial_YES");
    const stepTwoYesLabel = findNode(tutorialRoot, "TouchTutorial_YES_Label");
    assert.ok(stepTwoRoot, "first YES did not advance to STEP 2");
    assert.ok(stepTwoPanel && stepTwoYes && stepTwoYes !== stepOneYes);
    assert.equal(stepTwoYesLabel.text, "YES", "STEP 2 confirmation label drifted from YES");
    assert.equal(stepOneRoot.destroyed, true, "STEP 1 node survived rerender");
    assert.equal(tutorialRoot.children.length, tutorialChildCount, "tutorial step nodes accumulated");
    assert.ok(findNode(tutorialRoot, "TouchTutorial_Focus_JUMP"));
    assert.equal(findNode(tutorialRoot, "TouchTutorial_Focus_LEFT"), null);
    assert.equal(tutorialMock.scheduledCount(), 1);
    for (const event of ["click", "mouseover", "mouseout", "mousedown", "mouseup"]) {
        assert.equal((stepOneYes.handlers.get(event) || []).length, 0, `STEP 1 YES retained ${event} listeners`);
    }
    for (const event of ["click", "mousedown", "mouseup"]) {
        assert.equal((stepOnePanel.handlers.get(event) || []).length, 0, `STEP 1 panel retained ${event} listeners`);
    }

    stepTwoYes.emit(tutorialMock.laya.Event.CLICK, { stopPropagation() { stoppedEvents++; } });
    assert.equal(completionRuns, 0, "duplicated input burst skipped STEP 2");
    assert.equal(findNode(tutorialRoot, "TouchTutorial_STEP_2"), stepTwoRoot);
    assert.equal(tutorialRoot.children.length, tutorialChildCount, "duplicate input grew tutorial nodes");

    tutorialMock.runTimers();
    assert.equal(tutorialMock.scheduledCount(), 0);
    blockedTap(tutorialRoot, 20, 20);
    blockedTap(stepTwoPanel, stepTwoPanel.x + 32, stepTwoPanel.y + 32);
    assert.equal(findNode(tutorialRoot, "TouchTutorial_STEP_2"), stepTwoRoot,
        "background or STEP 2 panel tap completed the tutorial");

    leftHit.emit(tutorialMock.laya.Event.MOUSE_DOWN, {
        currentTarget: leftHit,
        touchId: 89,
        stopPropagation() {},
    });
    rightHit.emit(tutorialMock.laya.Event.MOUSE_DOWN, {
        currentTarget: rightHit,
        touchId: 90,
        stopPropagation() {},
    });
    jumpHit.emit(tutorialMock.laya.Event.MOUSE_DOWN, {
        currentTarget: jumpHit,
        touchId: 91,
        stopPropagation() {},
    });
    assert.equal(controller.left(), true, "reset boundary fixture did not seed held LEFT");
    assert.equal(controller.right(), true, "reset boundary fixture did not seed held RIGHT");
    assert.equal(controller.jump(), true, "reset boundary fixture did not seed held JUMP");
    tutorialMock.runTimers();
    assert.equal(tutorialMock.scheduledCount(), 0);
    stepTwoYes.emit(tutorialMock.laya.Event.CLICK, { stopPropagation() { stoppedEvents++; } });

    assert.equal(completionRuns, 1);
    assert.equal(teardownPrecededCompletion, true);
    assert.equal(controller.left(), false, "held LEFT survived final tutorial reset");
    assert.equal(controller.right(), false, "held RIGHT survived final tutorial reset");
    assert.equal(controller.jump(), false, "held JUMP survived final tutorial reset");
    assert.equal(findNode(tutorialMock.laya.stage, "TouchTutorialModal"), null);
    assert.equal(tutorialMock.laya.stage.children.length, stageChildrenBeforeTutorial);
    assert.equal(tutorialMock.scheduledCount(), 0);
    assert.equal((tutorialRoot.handlers.get(tutorialMock.laya.Event.MOUSE_DOWN) || []).length, 0);
    assert.equal((tutorialRoot.handlers.get(tutorialMock.laya.Event.MOUSE_UP) || []).length, 0);
    assert.equal((tutorialRoot.handlers.get(tutorialMock.laya.Event.CLICK) || []).length, 0);
    for (const event of ["click", "mouseover", "mouseout", "mousedown", "mouseup"]) {
        assert.equal((stepTwoYes.handlers.get(event) || []).length, 0, `STEP 2 YES retained ${event} listeners`);
    }
    for (const event of ["click", "mousedown", "mouseup"]) {
        assert.equal((stepTwoPanel.handlers.get(event) || []).length, 0, `STEP 2 panel retained ${event} listeners`);
    }

    const secondTutorial = TouchTutorialUI.showOnce(() => completionRuns++);
    assert.equal(secondTutorial, null, "tutorial repeated in the same page session");
    assert.equal(tutorialMock.laya.stage.children.length, stageChildrenBeforeTutorial);
    controller.destroy();
    console.log("YES-only two-step tutorial interception/latch/teardown/session-once/final-reset: PASS");
}

function runStaticContracts() {
    const ballSource = read(ballPath);
    const headBallSource = headFile("src/BallController.ts");
    const protectedStep = extractBetween(ballSource, "    public stepPhysics(", "    private levelTransitionHandler:");
    const headProtectedStep = extractBetween(headBallSource, "    public stepPhysics(", "    private levelTransitionHandler:");
    assert.equal(
        (protectedStep.match(/this\.readActiveGameplayTime\(time\.currTimer\(\)\)/g) || []).length,
        2,
        "stepPhysics must route both disappearing-platform timer reads through the Pause-aware clock",
    );
    assert.equal(protectedStep, headProtectedStep,
        "stepPhysics protected body differs from the frozen HEAD blob");

    assert.match(ballSource, /left:\s*\(\)\s*=>\s*this\.isKeyDown\(Laya\.Keyboard\.LEFT,\s*Laya\.Keyboard\.A\)\s*\|\|\s*!!this\.touchInput\?\.left\(\)/);
    assert.match(ballSource, /right:\s*\(\)\s*=>\s*this\.isKeyDown\(Laya\.Keyboard\.RIGHT,\s*Laya\.Keyboard\.D\)\s*\|\|\s*!!this\.touchInput\?\.right\(\)/);
    assert.match(ballSource, /jump:\s*\(\)\s*=>\s*this\.isKeyDown\(Laya\.Keyboard\.W\)\s*\|\|\s*this\.isKeyDown\(Laya\.Keyboard\.UP\)\s*\|\|\s*!!this\.touchInput\?\.jump\(\)/);
    console.log("keyboard + touch input seam: PASS");
    console.log("stepPhysics protected body unchanged outside Pause-aware clock seam: PASS");

    const touchSource = read(touchPath);
    const headTouchSource = headFile("src/TouchController.ts");
    const touchCapability = extractBetween(touchSource, "    public static isTouchCapable()", "    public left()");
    const headTouchCapability = extractBetween(headTouchSource, "    public static isTouchCapable()", "    public left()");
    assert.equal(touchCapability, headTouchCapability, "TouchController.isTouchCapable semantics changed");
    assert.match(touchSource, /MOUSE_OUT/);
    assert.match(touchSource, /MOUSE_UP/);
    assert.match(touchSource, /touchcancel/);
    assert.match(touchSource, /Event\.BLUR/);
    assert.match(touchSource, /VISIBILITY_CHANGE/);
    assert.match(ballSource, /isDeathReconstructionActive\(\)/);
    console.log("release/cancel/focus/death-lock hooks: PASS");

    const mainSource = read(mainPath);
    const introSource = read(introPath);
    const scoreSource = read(scorePath);
    const tutorialSource = read(tutorialPath);
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

    assert.match(mainSource, /mobileTouchSession\s*=\s*!!Laya\.Browser\.onMobile\s*&&\s*TouchController\.isTouchCapable\(\)/);
    assert.match(mainSource, /if \(this\.mobileTouchSession && this\.touchController\) \{[\s\S]*?TouchTutorialUI\.showOnce/);
    assert.match(mainSource, /IntroUI\.show\([\s\S]*?\(\) => this\.acceptStartIntent\(\),[\s\S]*?this\.mobileTouchSession,[\s\S]*?onCoverInteractionStarted:[\s\S]*?onMainMenuEntered:[\s\S]*?onHowToPlayEntered:/);
    assert.match(mainSource, /private completeTouchTutorial\(\): void \{[\s\S]*?resetAll\(\);[\s\S]*?enableGameplay\(\);/);
    const enterLevelOneSource = extractBetween(mainSource, "    private enterLevelOne(): void", "    private completeTouchTutorial(): void");
    const tutorialStartBranch = extractBetween(
        enterLevelOneSource,
        "            const tutorial = TouchTutorialUI.showOnce",
        "        this.enableGameplay();"
    );
    const completeTutorialSource = extractBetween(
        mainSource,
        "    private completeTouchTutorial(): void",
        "    private enableGameplay(): void"
    );
    const enableGameplaySource = extractBetween(
        mainSource,
        "    private enableGameplay(): void",
        "    /** Canonical session-owned test"
    );
    assert.doesNotMatch(tutorialStartBranch, /BgmManager/,
        "Gameplay BGM still starts while the first mobile tutorial mounts");
    assert.match(tutorialStartBranch, /if \(tutorial\) \{\s*this\.touchTutorial = tutorial;\s*this\.syncPausePresentation\(\);\s*return;\s*\}/);
    assert.doesNotMatch(enterLevelOneSource, /BgmManager/,
        "enterLevelOne retained a duplicate gameplay BGM call");
    assertSourceOrder(
        completeTutorialSource,
        ["this.touchTutorial = null;", "this.touchController?.resetAll();", "this.enableGameplay();"],
        "final YES completion"
    );
    assert.doesNotMatch(completeTutorialSource, /BgmManager/,
        "tutorial completion retained a duplicate gameplay BGM call");
    assertSourceOrder(
        enableGameplaySource,
        ["this.activeGameplay = true;", "this.ballController.enabled = true;", "this.touchController?.setGameplayActive(true);", "this.syncPausePresentation();", "BgmManager.playGameplayBgm(this.mobileTouchSession);"],
        "central gameplay enable"
    );
    assert.match(introSource, /"CONTROL TEST  \/  HOW TO PLAY"/);
    assert.match(introSource, /"TOUCH CONTROLS  \/  HOW TO PLAY"/);
    const physicalKeyIds = ["W", "A", "D", "UP", "LEFT", "RIGHT", "R", "M", "P"];
    assert.equal(physicalKeyIds.length, 9);
    for (const keyId of physicalKeyIds) {
        assert.match(introSource, new RegExp(`createKeycap\\("${keyId}"|createUtilityKey\\("${keyId}"`));
    }
    assert.match(introSource, /createUtilityKey\("P",\s*"PAUSE"/);
    assert.match(introSource, /code === "KeyP" \|\| keyCode === 80[\s\S]*?return "P"/);
    assert.match(introSource,
        /IntroUI\.mobileTouchSession\s*\?\s*"TOUCH AND HOLD TO INITIALIZE"\s*:\s*"HOLD \[ ENTER \] OR HOLD MOUSE TO INITIALIZE"/);
    assert.match(introSource,
        /IntroUI\.mobileTouchSession\s*\?\s*"TAP AN OPTION TO SELECT"\s*:\s*"W \/ ↑\s+PREVIOUS\s+S \/ ↓\s+NEXT\s+ENTER\s+CONFIRM"/);
    const mobileHelpSource = extractBetween(
        introSource,
        "    private static renderMobileHowToPlay(): void",
        "    private static createTouchGuideCard(",
    );
    assert.match(mobileHelpSource, /MOVE \+ JUMP/);
    assert.doesNotMatch(mobileHelpSource, /PRESS\s+[PMR]|KEYBOARD|\bPAUSE\b|\bESC\b|\bENTER\b/i);
    assert.match(introSource, /private static renderMobileHowToPlay\(\): void/);
    assert.match(introSource, /"MOVE"[\s\S]*?"LEFT\s+\/\s+RIGHT"[\s\S]*?"JUMP"/);
    assert.match(scoreSource, /nextLevelLabel\.text\s*=\s*"NEXT LEVEL"/);
    assert.match(scoreSource, /restartHint\.text\s*=\s*"PRESS R"[\s\S]*?restartHint\.visible\s*=\s*!this\.mobileTouchSession/);
    assert.equal((tutorialSource.match(/"STEP [12]\s+\/\s+(?:MOVE|JUMP)"/g) || []).length, 2,
        "first-use mobile tutorial must remain exactly MOVE then JUMP");
    assert.doesNotMatch(tutorialSource, /localStorage|sessionStorage|document\.cookie/);
    assert.doesNotMatch(tutorialSource, /charge|long-press|pause|settings|gesture/i);
    assert.match(tutorialSource, /root\.zOrder = 10002/);
    assert.match(tutorialSource, /root\.mouseThrough = false/);
    assert.match(tutorialSource, /Event\.MOUSE_DOWN[\s\S]*Event\.MOUSE_UP[\s\S]*Event\.CLICK/);
    assert.match(tutorialSource, /root\.on\(Laya\.Event\.CLICK, this, this\.blockInput\)/);
    assert.match(tutorialSource, /button\.on\(Laya\.Event\.CLICK, this, this\.confirmYes\)/);
    assert.equal((tutorialSource.match(/\.on\(Laya\.Event\.CLICK, this, this\.confirmYes\)/g) || []).length, 1,
        "YES must be the only CLICK binding with tutorial advancement authority");
    assert.doesNotMatch(tutorialSource, /TAP TO CONTINUE|TAP TO START|NEXT|START|ENGAGE/);
    assert.match(tutorialSource, /createText\("YES", 22, "#FFFFFF", true\)[\s\S]*?label\.font = "Courier New"/);
    assert.match(tutorialSource, /ADVANCE_LATCH_MS:\s*number\s*=\s*180/);
    assert.doesNotMatch(tutorialSource, /BgmManager|SfxManager|playBgm|playSfx/);
    console.log("mobile-session, desktop-help, YES-only isolation, BGM order, and final-reset contracts: PASS");

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
    assert.equal(changed.some((file) => /(?:^|\/)SfxManager\.ts$/.test(file)), false);
    assert.equal(changed.some((file) => /^(?:src\/TouchController\.ts|src\/TouchTutorialUI\.ts|src\/BallController\.ts|src\/ScoreManager\.ts)$/.test(file)), false);
    assert.equal(changed.includes("assets/Scene.ls"), false);
    assert.equal(changed.some((file) => /^tools\/(?:verify-l4|l4-.*(?:snapshot|baseline))/.test(file)), false);
    console.log("world layout, protected touch/gameplay files, and L4 fixtures unchanged: PASS");
}

runStateSmoke();
runOrientationStateSmoke();
runLayoutSmoke();
runMountedUiSmoke();
runTutorialMountedSmoke();
runStaticContracts();
console.log("verification: PASS");
