const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "..");
const SCENE_PATH = path.join(ROOT, "assets", "Scene.ls");
const SOURCE_PATH = path.join(ROOT, "src", "BallController.ts");
const INPUT_READ_ORDER = Object.freeze(["restart", "left", "right", "jump"]);
const INVALID_PHASES = new Set(["setup", "settle", "launch", "flight", "post-step"]);
const RECORD_FIELDS = Object.freeze([
    "hazardId",
    "hostId",
    "sourceId",
    "targetId",
    "spikeSide",
    "affectedRole",
    "sourceOrder",
    "targetOrder",
]);

class Script {
    constructor() {
        this.owner = null;
    }
}

class DrawRectCmd {
    constructor(x = 0, y = 0, width = 0, height = 0, fillColor = "#ffffff") {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.fillColor = fillColor;
    }
}

class DrawCircleCmd {
    constructor(x = 0, y = 0, radius = 0, fillColor = "#ffffff") {
        this.x = x;
        this.y = y;
        this.radius = radius;
        this.fillColor = fillColor;
    }
}

function createGraphics(serializedCommands = []) {
    const commands = serializedCommands.map((command) => {
        if (command?._$type === "DrawCircleCmd") {
            return new DrawCircleCmd(command.x ?? 0, command.y ?? 0, command.radius ?? 0, command.fillColor ?? "#ffffff");
        }
        return new DrawRectCmd(
            command?.x ?? 0,
            command?.y ?? 0,
            command?.width ?? 0,
            command?.height ?? 0,
            command?.fillColor ?? "#ffffff",
        );
    });
    return {
        cmds: commands,
        clear() {
            this.cmds = [];
        },
        drawRect(x, y, width, height, color) {
            this.cmds.push(new DrawRectCmd(x, y, width, height, color));
        },
        drawCircle(x, y, radius, color) {
            this.cmds.push(new DrawCircleCmd(x, y, radius, color));
        },
        repaint() {},
    };
}

class Sprite {
    constructor() {
        this.name = "";
        this.x = 0;
        this.y = 0;
        this.width = 0;
        this.height = 0;
        this.rotation = 0;
        this.visible = true;
        this.zOrder = 0;
        this.parent = null;
        this._children = [];
        this._childs = this._children;
        this.graphics = createGraphics();
    }

    addChild(child) {
        assert.ok(child && typeof child === "object", "addChild requires a node object");
        if (!this._children.includes(child)) this._children.push(child);
        child.parent = this;
        return child;
    }

    getChildByName(name) {
        return this._children.find((child) => child?.name === name) ?? null;
    }
}

class Text extends Sprite {}

const stage = {
    width: 0,
    height: 0,
    _children: [],
    addChild(child) {
        this._children.push(child);
        child.parent = this;
        return child;
    },
};

global.Laya = {
    DrawRectCmd,
    DrawCircleCmd,
    InputManager: { hasKeyDown: () => false },
    Keyboard: {},
    Script,
    Sprite,
    SoundManager: {
        soundVolume: 1,
        playSound() {
            throw new Error("real audio playback is forbidden in the C2 step harness");
        },
    },
    Text,
    regClass: () => (target) => target,
    stage,
    timer: { currTimer: 0 },
};

require.extensions[".ts"] = function transpileTypeScript(module, filename) {
    const source = fs.readFileSync(filename, "utf8");
    const result = ts.transpileModule(source, {
        compilerOptions: {
            experimentalDecorators: true,
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2020,
        },
        fileName: filename,
    });
    module._compile(result.outputText, filename);
};

const BallController = require(SOURCE_PATH).default;
const { ScoreManager } = require(path.join(ROOT, "src", "ScoreManager.ts"));
const { SfxManager } = require(path.join(ROOT, "src", "SfxManager.ts"));
const {
    parseSceneGeometry,
    normalizeLayout,
    identifyAffectedJumps,
} = require(path.join(__dirname, "l4-affected-jumps.cjs"));

class C2InvalidUnmodeledError extends Error {
    constructor(result) {
        super(`${result.code}: ${result.message}`);
        this.name = "C2InvalidUnmodeledError";
        this.result = result;
    }
}

function makeInvalidResult({ code, firstInvalidField, frame, phase, message, context }) {
    const result = {
        status: "INVALID_UNMODELED",
        code,
        firstInvalidField,
        frame,
        phase,
        message,
        context: {
            seed: context.seed,
            hazardId: context.hazardId,
            sourceId: context.sourceId,
            targetId: context.targetId,
        },
    };
    validateInvalidResult(result);
    return result;
}

function validateInvalidResult(result) {
    assert.equal(result?.status, "INVALID_UNMODELED", "invalid result status changed");
    assert.match(result.code, /^[A-Z][A-Z0-9_]*$/, "invalid result code must be stable machine text");
    assert.equal(typeof result.firstInvalidField, "string", "firstInvalidField must be a string");
    assert.ok(result.firstInvalidField.length > 0, "firstInvalidField must not be empty");
    assert.ok(result.frame === null || (Number.isInteger(result.frame) && result.frame >= 0), "frame must be null or a non-negative integer");
    assert.ok(INVALID_PHASES.has(result.phase), "invalid result phase changed");
    assert.equal(typeof result.message, "string", "invalid result message must be a string");
    assert.ok(result.message.length > 0, "invalid result message must not be empty");
    assert.deepStrictEqual(Object.keys(result.context), ["seed", "hazardId", "sourceId", "targetId"]);
    return true;
}

function failInvalid(details) {
    throw new C2InvalidUnmodeledError(makeInvalidResult(details));
}

function contextFor(seed, record = {}) {
    return {
        seed,
        hazardId: record.hazardId ?? null,
        sourceId: record.sourceId ?? null,
        targetId: record.targetId ?? null,
    };
}

function createSeededRng(seed) {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let value = state;
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
}

function materializeSceneNode(serialized, index, parent = null) {
    assert.ok(serialized && typeof serialized === "object", "Scene node must be an object");
    const node = new Sprite();
    node.name = typeof serialized.name === "string" ? serialized.name : "";
    node.x = serialized.x ?? 0;
    node.y = serialized.y ?? 0;
    node.width = serialized.width ?? 0;
    node.height = serialized.height ?? 0;
    node.rotation = serialized.rotation ?? 0;
    node.visible = serialized.visible ?? true;
    node.zOrder = serialized.zOrder ?? 0;
    node.graphics = createGraphics(serialized._gcmds ?? []);
    if (node.name) {
        assert.equal(index.has(node.name), false, `Scene node ${node.name} is duplicated`);
        index.set(node.name, node);
    }
    if (parent) parent.addChild(node);
    for (const child of serialized._$child ?? []) materializeSceneNode(child, index, node);
    return node;
}

function requireNode(index, name) {
    const node = index.get(name);
    assert.ok(node, `Scene node ${name} is missing`);
    return node;
}

function captureGeneratedLayout(seed, fixture) {
    const { controller, gamePlatforms, spike } = fixture;
    const host = spike.visible
        ? gamePlatforms.find((platform) => (
            spike.y + spike.height === platform.y
            && spike.x >= platform.x
            && spike.x + spike.width <= platform.x + platform.width
        )) ?? null
        : null;
    const side = !host
        ? null
        : spike.x === host.x
            ? "left"
            : spike.x + spike.width === host.x + host.width
                ? "right"
                : "unknown";
    return {
        seed: seed >>> 0,
        platforms: gamePlatforms.map((platform) => {
            const moving = controller.movingConfigs.get(platform);
            return {
                name: platform.name,
                x: platform.x,
                y: platform.y,
                moving: moving
                    ? {
                        speed: moving.speed,
                        rangeMin: moving.rangeMin,
                        rangeMax: moving.rangeMax,
                        direction: moving.direction,
                    }
                    : null,
                disappear: controller.disappearConfigs.has(platform),
            };
        }),
        spike: {
            visible: spike.visible,
            host: host?.name ?? null,
            side,
            x: spike.x,
            y: spike.y,
            width: spike.width,
            height: spike.height,
        },
    };
}

function installScoreAndSfxObservers(fixture) {
    const scoreState = {
        value: 0,
        hasWon: false,
        scoredPlatforms: new Set(),
    };
    fixture.scoreState = scoreState;
    const manager = ScoreManager.instance;

    function recordDependency(type, details) {
        if (fixture.runtime?.activeStep) fixture.runtime.record(type, details);
    }

    manager.isWon = () => {
        recordDependency("score-call", { method: "isWon", value: scoreState.hasWon });
        return scoreState.hasWon;
    };
    manager.addPlatformScore = (platform) => {
        const name = typeof platform?.name === "string" ? platform.name : null;
        if (name?.startsWith("Platform_") && !scoreState.scoredPlatforms.has(name)) {
            scoreState.scoredPlatforms.add(name);
            scoreState.value++;
        }
        recordDependency("score-call", { method: "addPlatformScore", platform: name, value: scoreState.value });
    };
    manager.reset = () => {
        scoreState.value = 0;
        scoreState.hasWon = false;
        scoreState.scoredPlatforms.clear();
        recordDependency("score-call", { method: "reset", value: 0 });
    };
    manager.getScore = () => scoreState.value;

    SfxManager.playJump = () => recordDependency("sfx-call", { sound: "jump" });
    SfxManager.playDeath = () => recordDependency("sfx-call", { sound: "death" });
    SfxManager.playClear = () => recordDependency("sfx-call", { sound: "clear" });
}

function createSeedFixture(seed) {
    const normalizedSeed = seed >>> 0;
    const sceneText = fs.readFileSync(SCENE_PATH, "utf8");
    const serializedScene = JSON.parse(sceneText);
    const sceneGeometry = parseSceneGeometry(sceneText);
    const nodeIndex = new Map();
    const root = materializeSceneNode(serializedScene, nodeIndex);
    stage.width = serializedScene.width;
    stage.height = serializedScene.height;
    stage._children = [];

    const ball = requireNode(nodeIndex, "Ball");
    const gamePlatforms = [1, 2, 3, 4, 5].map((order) => requireNode(nodeIndex, `Platform_${order}`));
    const ground = requireNode(nodeIndex, "Ground");
    const controller = new BallController();
    controller.owner = ball;
    controller.currentLevel = 4;
    controller.startX = ball.x;
    controller.startY = ball.y;
    controller.centerX = ball.x;
    controller.centerY = ball.y;
    controller.previousY = ball.y;
    controller.platforms = [...gamePlatforms, ground];
    controller.spikes = [];
    controller.topWall = requireNode(nodeIndex, "top wall");
    controller.leftWall = requireNode(nodeIndex, "left wall");
    controller.rightWall = requireNode(nodeIndex, "right wall");

    assert.equal(controller.randomizePlatforms, BallController.prototype.randomizePlatforms, "production randomizePlatforms is unavailable");
    assert.equal(controller.randomizeHazards, BallController.prototype.randomizeHazards, "production randomizeHazards is unavailable");
    const rng = createSeededRng(normalizedSeed);
    const rngValues = [];
    controller.setRandomSource(() => {
        const value = rng();
        rngValues.push(value);
        return value;
    });

    BallController.prototype.randomizePlatforms.call(controller);
    BallController.prototype.randomizeHazards.call(controller);
    assert.equal(controller.spikes.length, 1, "production generation must create exactly one spike node");

    const fixture = {
        seed: normalizedSeed,
        sceneText,
        sceneGeometry,
        root,
        nodeIndex,
        controller,
        ball,
        gamePlatforms,
        ground,
        spike: controller.spikes[0],
        rngValues,
        filesWritten: 0,
        runtime: null,
    };
    fixture.layoutSnapshot = captureGeneratedLayout(normalizedSeed, fixture);
    fixture.normalizedLayout = normalizeLayout(fixture.layoutSnapshot, sceneGeometry);
    installScoreAndSfxObservers(fixture);
    return fixture;
}

function deriveAffectedRecords(fixture) {
    const normalized = normalizeLayout(fixture.layoutSnapshot, fixture.sceneGeometry);
    return identifyAffectedJumps(normalized);
}

function progressionOrder(name) {
    const match = /^Platform_([1-9]\d*)$/.exec(name);
    return match ? Number(match[1]) : null;
}

function validateRecordAndResolve(fixture, record) {
    const context = contextFor(fixture.seed, record);
    for (const field of RECORD_FIELDS) {
        if (!Object.prototype.hasOwnProperty.call(record, field)) {
            failInvalid({
                code: "MISSING_RECORD_FIELD",
                firstInvalidField: `record.${field}`,
                frame: null,
                phase: "setup",
                message: `Affected record is missing ${field}`,
                context,
            });
        }
    }

    const source = fixture.gamePlatforms.find((platform) => platform.name === record.sourceId) ?? null;
    const target = fixture.gamePlatforms.find((platform) => platform.name === record.targetId) ?? null;
    const host = fixture.gamePlatforms.find((platform) => platform.name === record.hostId) ?? null;
    if (!source) failInvalid({ code: "MISSING_SOURCE_OBJECT", firstInvalidField: "record.sourceId", frame: null, phase: "setup", message: "Source platform object cannot be resolved", context });
    if (!target) failInvalid({ code: "MISSING_TARGET_OBJECT", firstInvalidField: "record.targetId", frame: null, phase: "setup", message: "Target platform object cannot be resolved", context });
    if (!host) failInvalid({ code: "MISSING_HOST_OBJECT", firstInvalidField: "record.hostId", frame: null, phase: "setup", message: "Host platform object cannot be resolved", context });

    const hazard = record.hazardId === "hazard:spike:0" ? fixture.spike : null;
    if (!hazard) failInvalid({ code: "MISSING_HAZARD_OBJECT", firstInvalidField: "record.hazardId", frame: null, phase: "setup", message: "Hazard object cannot be resolved", context });
    const exactHost = hazard.y + hazard.height === host.y
        && hazard.x >= host.x
        && hazard.x + hazard.width <= host.x + host.width;
    if (!exactHost) failInvalid({ code: "HAZARD_HOST_MISMATCH", firstInvalidField: "record.hostId", frame: null, phase: "setup", message: "Generated hazard geometry does not match record host", context });
    const actualSide = hazard.x === host.x
        ? "left"
        : hazard.x + hazard.width === host.x + host.width
            ? "right"
            : null;
    if (actualSide !== record.spikeSide) failInvalid({ code: "SPIKE_SIDE_MISMATCH", firstInvalidField: "record.spikeSide", frame: null, phase: "setup", message: "Generated spike side does not match record", context });

    if (record.affectedRole === "landing") {
        if (host !== target) failInvalid({ code: "LANDING_ROLE_HOST_MISMATCH", firstInvalidField: "record.affectedRole", frame: null, phase: "setup", message: "Landing record host must be the target object", context });
    } else if (record.affectedRole === "takeoff") {
        if (host !== source) failInvalid({ code: "TAKEOFF_ROLE_HOST_MISMATCH", firstInvalidField: "record.affectedRole", frame: null, phase: "setup", message: "Takeoff record host must be the source object", context });
    } else {
        failInvalid({ code: "INVALID_AFFECTED_ROLE", firstInvalidField: "record.affectedRole", frame: null, phase: "setup", message: "Affected role is not modeled", context });
    }

    if (progressionOrder(source.name) !== record.sourceOrder) failInvalid({ code: "SOURCE_ORDER_MISMATCH", firstInvalidField: "record.sourceOrder", frame: null, phase: "setup", message: "Source progression identity changed", context });
    if (progressionOrder(target.name) !== record.targetOrder) failInvalid({ code: "TARGET_ORDER_MISMATCH", firstInvalidField: "record.targetOrder", frame: null, phase: "setup", message: "Target progression identity changed", context });
    if (record.targetOrder !== record.sourceOrder + 1) failInvalid({ code: "NON_ADJACENT_PROGRESSION", firstInvalidField: "record.targetOrder", frame: null, phase: "setup", message: "Record is not a forward adjacent progression jump", context });

    return {
        source,
        target,
        host,
        hazard,
        recordFieldUsage: Object.fromEntries(RECORD_FIELDS.map((field) => [field, true])),
    };
}

function validateSingleFrameAction(action, context, frame, phase) {
    for (const field of ["left", "right", "jumpDown", "restartDown"]) {
        if (typeof action?.[field] !== "boolean") {
            failInvalid({
                code: "INVALID_ACTION_FIELD",
                firstInvalidField: `action.${field}`,
                frame,
                phase,
                message: `Action ${field} must be boolean`,
                context,
            });
        }
    }
    if (action.left && action.right) {
        failInvalid({
            code: "INVALID_OPPOSING_DIRECTIONS",
            firstInvalidField: "action.left",
            frame,
            phase,
            message: "Simultaneous left and right input is invalid, not neutral",
            context,
        });
    }
    return action;
}

function installRuntimeObservers(fixture) {
    if (fixture.runtime) return fixture.runtime;
    const runtime = {
        activeStep: null,
        events: [],
        deathEvents: [],
        sequence: 0,
        nextStepCallId: 1,
        stepPhysicsCalls: 0,
        timerReadCount: 0,
        postStepObservations: 0,
        productionMethods: Object.create(null),
        record(type, details = {}) {
            const event = {
                sequence: this.sequence++,
                type,
                stepCallId: this.activeStep?.stepCallId ?? null,
                ...details,
            };
            this.events.push(event);
            return event;
        },
    };
    fixture.runtime = runtime;
    installScoreAndSfxObservers(fixture);

    const methods = [
        "restartGame",
        "updateMovingPlatform",
        "resolveVerticalCollision",
        "syncDisappearHighlightBar",
        "checkHazards",
        "releaseGroundIfUnsupported",
        "clampToCanvas",
        "checkDeath",
        "handleDeath",
        "randomizePlatforms",
        "randomizeHazards",
        "respawn",
        "syncBallSprite",
    ];
    for (const method of methods) {
        const original = fixture.controller[method];
        assert.equal(typeof original, "function", `production method ${method} is unavailable`);
        runtime.productionMethods[method] = original;
        fixture.controller[method] = function observedProductionMethod(...args) {
            const platform = method === "updateMovingPlatform" || method === "resolveVerticalCollision" ? args[0] : null;
            runtime.record("method-start", { method, platform: platform?.name ?? null });
            if (method === "handleDeath") {
                const deathEvent = runtime.record("death-before", {
                    frame: runtime.activeStep?.frame ?? null,
                    phase: runtime.activeStep?.phase ?? null,
                    beforeRespawn: true,
                    beforeState: {
                        x: fixture.controller.centerX,
                        y: fixture.controller.centerY,
                        vx: fixture.controller.vx,
                        vy: fixture.controller.vy,
                        onGround: fixture.controller.onGround,
                        groundPlatform: fixture.controller.groundPlatform?.name ?? null,
                    },
                });
                runtime.deathEvents.push(deathEvent);
            }
            try {
                return original.apply(this, args);
            } finally {
                if (method === "handleDeath") runtime.record("death-after", { afterProductionMethod: true });
                runtime.record("method-end", { method, platform: platform?.name ?? null });
            }
        };
    }
    return runtime;
}

function executeProductionStep(fixture, action, frame, phase, timeMs) {
    const runtime = installRuntimeObservers(fixture);
    const context = contextFor(fixture.seed, fixture.activeRecord);
    validateSingleFrameAction(action, context, frame, phase);
    const activeStep = {
        stepCallId: runtime.nextStepCallId++,
        frame,
        phase,
        timeMs,
        inputReads: [],
        timerReads: [],
    };
    runtime.activeStep = activeStep;
    const stepStart = runtime.record("step-start", { frame, phase, action: { ...action } });
    const input = Object.fromEntries(INPUT_READ_ORDER.map((name) => [name, () => {
        const value = name === "jump" ? action.jumpDown : name === "restart" ? action.restartDown : action[name];
        activeStep.inputReads.push(name);
        runtime.record("input-read", { input: name, value, index: activeStep.inputReads.length - 1 });
        return value;
    }]));
    const time = {
        currTimer() {
            activeStep.timerReads.push(timeMs);
            runtime.timerReadCount++;
            runtime.record("timer-read", { value: timeMs, index: activeStep.timerReads.length - 1 });
            return timeMs;
        },
    };
    const controller = fixture.controller;
    const env = {
        isWon: () => ScoreManager.instance.isWon(),
        restartGame: controller.restartGame.bind(controller),
        playJump: () => SfxManager.playJump(),
        updateMovingPlatform: controller.updateMovingPlatform.bind(controller),
        resolveVerticalCollision: controller.resolveVerticalCollision.bind(controller),
        syncDisappearHighlightBar: controller.syncDisappearHighlightBar.bind(controller),
        checkHazards: controller.checkHazards.bind(controller),
        releaseGroundIfUnsupported: controller.releaseGroundIfUnsupported.bind(controller),
        clampToCanvas: controller.clampToCanvas.bind(controller),
        syncBallSprite: controller.syncBallSprite.bind(controller),
    };

    let completed = false;
    const originalConsoleLog = console.log;
    console.log = (...args) => runtime.record("console-log", { args: args.map((value) => String(value)) });
    try {
        assert.equal(BallController.prototype.stepPhysics, controller.stepPhysics, "production stepPhysics was replaced");
        runtime.stepPhysicsCalls++;
        BallController.prototype.stepPhysics.call(controller, fixture.ball, input, time, env);
        completed = true;
    } finally {
        console.log = originalConsoleLog;
        runtime.record("step-end", { frame, phase, completed });
    }
    assert.deepStrictEqual(activeStep.inputReads, INPUT_READ_ORDER, `frame ${frame}: input read order changed`);
    assert.ok(activeStep.timerReads.length > 0, `frame ${frame}: production timer was not read`);
    assert.equal(new Set(activeStep.timerReads).size, 1, `frame ${frame}: same-frame timer reads diverged`);

    const observation = {
        frame,
        phase,
        stepCallId: activeStep.stepCallId,
        x: controller.centerX,
        y: controller.centerY,
        vx: controller.vx,
        vy: controller.vy,
        prevJumpKey: controller.prevJumpKey,
        onGround: controller.onGround,
        groundPlatform: controller.groundPlatform?.name ?? null,
        groundPlatformObject: controller.groundPlatform,
        targetIdentityMatch: controller.groundPlatform === fixture.activeTarget,
        deathObserved: runtime.deathEvents.some((event) => event.stepCallId === activeStep.stepCallId),
        inputReads: [...activeStep.inputReads],
        timerReads: [...activeStep.timerReads],
        stepStartSequence: stepStart.sequence,
    };
    runtime.postStepObservations++;
    const postEvent = runtime.record("post-step-landing", {
        frame,
        phase,
        onGround: observation.onGround,
        groundPlatform: observation.groundPlatform,
        targetIdentityMatch: observation.targetIdentityMatch,
    });
    observation.postStepSequence = postEvent.sequence;
    runtime.activeStep = null;
    return observation;
}

function summarizeTrajectory(observations, stopReason) {
    const apex = observations.reduce((best, observation) => observation.y < best.y ? observation : best, observations[0]);
    const xs = observations.map((observation) => observation.x);
    const ys = observations.map((observation) => observation.y);
    const compact = (observation) => ({
        frame: observation.frame,
        phase: observation.phase,
        x: observation.x,
        y: observation.y,
        vx: observation.vx,
        vy: observation.vy,
        onGround: observation.onGround,
        groundPlatform: observation.groundPlatform,
    });
    return {
        stopReason,
        first: compact(observations[0]),
        launch: compact(observations.find((observation) => observation.phase === "launch") ?? observations[0]),
        apex: compact(apex),
        final: compact(observations[observations.length - 1]),
        xRange: [Math.min(...xs), Math.max(...xs)],
        yRange: [Math.min(...ys), Math.max(...ys)],
    };
}

function auditRuntime(runtime) {
    const stepStarts = runtime.events.filter((event) => event.type === "step-start");
    const stepEnds = runtime.events.filter((event) => event.type === "step-end");
    const postSteps = runtime.events.filter((event) => event.type === "post-step-landing");
    const brackets = stepStarts.every((start) => {
        const end = stepEnds.find((candidate) => candidate.stepCallId === start.stepCallId);
        const post = postSteps.find((candidate) => candidate.stepCallId === start.stepCallId);
        return end && post && start.sequence < end.sequence && end.sequence < post.sequence;
    });
    const deathsBracketed = runtime.deathEvents.every((death) => {
        const start = stepStarts.find((candidate) => candidate.stepCallId === death.stepCallId);
        const end = stepEnds.find((candidate) => candidate.stepCallId === death.stepCallId);
        const respawn = runtime.events.find((candidate) => (
            candidate.stepCallId === death.stepCallId
            && candidate.type === "method-start"
            && candidate.method === "respawn"
            && candidate.sequence > death.sequence
        ));
        return start
            && end
            && respawn
            && start.sequence < death.sequence
            && death.sequence < respawn.sequence
            && respawn.sequence < end.sequence
            && death.beforeRespawn === true;
    });
    return {
        stepBracketsValid: brackets && stepStarts.length === runtime.stepPhysicsCalls && stepEnds.length === runtime.stepPhysicsCalls,
        postStepLandingOnly: postSteps.length === runtime.stepPhysicsCalls && runtime.postStepObservations === runtime.stepPhysicsCalls,
        deathEventsBracketedBeforeRespawn: deathsBracketed,
        stepCallIds: stepStarts.map((event) => event.stepCallId),
        firstStepSequence: stepStarts[0]?.sequence ?? null,
        lastStepEndSequence: stepEnds[stepEnds.length - 1]?.sequence ?? null,
    };
}

function runFixedActionSmoke(fixture, record, actionPlan) {
    try {
        const context = contextFor(fixture.seed, record);
        if (actionPlan?.directionRule !== "relative-platform-centers") {
            failInvalid({ code: "INVALID_DIRECTION_RULE", firstInvalidField: "actionPlan.directionRule", frame: null, phase: "setup", message: "Only the fixed relative-center direction rule is modeled", context });
        }
        if (actionPlan?.settleFrames !== 1) {
            failInvalid({ code: "INVALID_SETTLE_COUNT", firstInvalidField: "actionPlan.settleFrames", frame: null, phase: "setup", message: "The fixed plan requires exactly one neutral settle frame", context });
        }
        if (!Number.isInteger(actionPlan?.horizonFrames) || actionPlan.horizonFrames <= 0) {
            failInvalid({ code: "INVALID_HORIZON", firstInvalidField: "actionPlan.horizonFrames", frame: null, phase: "setup", message: "Horizon must be a positive fixed integer", context });
        }

        const resolved = validateRecordAndResolve(fixture, record);
        const { controller, ball } = fixture;
        const { source, target, hazard } = resolved;
        fixture.activeRecord = record;
        fixture.activeTarget = target;
        const radius = controller.getBallRadius();
        const sourceGeometryAtSetup = { x: source.x, y: source.y, width: source.width, height: source.height };
        const targetGeometryAtSetup = { x: target.x, y: target.y, width: target.width, height: target.height };
        const startX = sourceGeometryAtSetup.x + sourceGeometryAtSetup.width / 2;
        const startY = sourceGeometryAtSetup.y - radius;
        if (!(startX >= sourceGeometryAtSetup.x + radius && startX <= sourceGeometryAtSetup.x + sourceGeometryAtSetup.width - radius)) {
            failInvalid({ code: "INVALID_START_X", firstInvalidField: "start.x", frame: null, phase: "setup", message: "Source safe center cannot contain the real ball radius", context });
        }
        const hazardCoversStart = hazard.visible
            && startX + radius > hazard.x
            && startX - radius < hazard.x + hazard.width
            && startY + radius > hazard.y
            && startY - radius < hazard.y + hazard.height;
        if (hazardCoversStart) failInvalid({ code: "START_OVERLAPS_HAZARD", firstInvalidField: "start.x", frame: null, phase: "setup", message: "Fixed source center overlaps the generated spike", context });

        const sourceCenter = sourceGeometryAtSetup.x + sourceGeometryAtSetup.width / 2;
        const targetCenter = targetGeometryAtSetup.x + targetGeometryAtSetup.width / 2;
        if (sourceCenter === targetCenter) failInvalid({ code: "AMBIGUOUS_HORIZONTAL_DIRECTION", firstInvalidField: "actionPlan.directionRule", frame: null, phase: "setup", message: "Source and target centers do not define one direction", context });
        const direction = targetCenter > sourceCenter ? "right" : "left";
        const heldDirection = {
            left: direction === "left",
            right: direction === "right",
        };

        controller.vx = 0;
        controller.vy = 0;
        controller.centerX = startX;
        controller.centerY = startY;
        controller.previousY = startY;
        controller.onGround = false;
        controller.groundPlatform = null;
        controller.prevJumpKey = false;
        controller.prevRestartKey = false;
        controller.platformsActive = true;
        controller.deathEnabled = true;
        controller.isHandlingDeath = false;
        ball.x = startX;
        ball.y = startY;

        const adapterPreconditions = {
            currentLevel: controller.currentLevel,
            platformsActive: controller.platformsActive,
            deathEnabled: controller.deathEnabled,
            sourceObjectInProductionPlatforms: controller.platforms.includes(source),
            targetObjectInProductionPlatforms: controller.platforms.includes(target),
        };
        assert.deepStrictEqual(adapterPreconditions, {
            currentLevel: 4,
            platformsActive: true,
            deathEnabled: true,
            sourceObjectInProductionPlatforms: true,
            targetObjectInProductionPlatforms: true,
        });

        installRuntimeObservers(fixture);
        const observations = [];
        const neutralAction = { left: false, right: false, jumpDown: false, restartDown: false };
        const settle = executeProductionStep(fixture, neutralAction, 0, "settle", 0);
        observations.push(settle);
        if (settle.deathObserved) failInvalid({ code: "DEATH_DURING_SETTLE", firstInvalidField: "start", frame: 0, phase: "settle", message: "Fixed source position died during the production settle frame", context });
        if (!(controller.onGround === true && controller.groundPlatform === source && controller.vy === 0 && controller.prevJumpKey === false)) {
            failInvalid({ code: "UNSETTLED_SOURCE_STATE", firstInvalidField: "controller.onGround", frame: 0, phase: "settle", message: "Production settle frame did not establish the required source state", context });
        }

        let status = "SEARCH_MISS";
        let stopReason = "horizon";
        let actionFramesRun = 0;
        for (let actionFrame = 0; actionFrame < actionPlan.horizonFrames; actionFrame++) {
            const phase = actionFrame === 0 ? "launch" : "flight";
            const action = {
                ...heldDirection,
                jumpDown: actionFrame === 0,
                restartDown: false,
            };
            const observation = executeProductionStep(fixture, action, actionFrame + 1, phase, (actionFrame + 1) * 16);
            observations.push(observation);
            actionFramesRun++;
            if (observation.targetIdentityMatch && observation.onGround) {
                status = "REACHABLE";
                stopReason = "target-identity-landing";
                break;
            }
            if (observation.deathObserved) {
                stopReason = "death-observer";
                break;
            }
            if (observation.onGround && observation.groundPlatformObject && observation.groundPlatformObject !== target) {
                stopReason = "non-target-landing";
                break;
            }
        }

        const runtimeAudit = auditRuntime(fixture.runtime);
        const finalObservation = observations[observations.length - 1];
        const deathEvents = fixture.runtime.deathEvents.map((event) => ({
            stepCallId: event.stepCallId,
            frame: event.frame,
            phase: event.phase,
            sequence: event.sequence,
            beforeRespawn: event.beforeRespawn,
            beforeState: event.beforeState,
        }));
        return {
            status,
            seed: fixture.seed,
            record,
            source,
            target,
            startState: {
                x: startX,
                y: startY,
                radius,
                sourceTop: sourceGeometryAtSetup.y,
                sourceGeometryAtSetup,
                targetGeometryAtSetup,
                safeCenter: true,
                adapterPreconditions,
                settledAfterProductionStep: {
                    onGround: settle.onGround,
                    groundPlatformIdentityMatch: settle.groundPlatformObject === source,
                    vy: settle.vy,
                    prevJumpKey: settle.prevJumpKey,
                },
            },
            actionPlan: {
                directionRule: actionPlan.directionRule,
                resolvedDirection: direction,
                settleFrames: 1,
                jumpPressFrames: 1,
                jumpReleaseAfterPress: true,
                feedbackControl: false,
                horizonFrames: actionPlan.horizonFrames,
            },
            framesRun: observations.length,
            settleFramesRun: 1,
            actionFramesRun,
            stepPhysicsCallCount: fixture.runtime.stepPhysicsCalls,
            inputReadOrder: [...INPUT_READ_ORDER],
            timerReadCount: fixture.runtime.timerReadCount,
            finalGroundPlatform: finalObservation.groundPlatform,
            targetIdentityMatch: finalObservation.targetIdentityMatch,
            targetObjectStillInProductionPlatforms: controller.platforms.includes(target),
            deathEvents,
            trajectorySummary: summarizeTrajectory(observations, stopReason),
            runtimeAudit,
            recordFieldUsage: resolved.recordFieldUsage,
            productionFairnessHelperDirectCalls: 0,
            filesWritten: fixture.filesWritten,
        };
    } catch (error) {
        if (error instanceof C2InvalidUnmodeledError) return error.result;
        throw error;
    }
}

module.exports = {
    C2InvalidUnmodeledError,
    INPUT_READ_ORDER,
    RECORD_FIELDS,
    createSeedFixture,
    deriveAffectedRecords,
    makeInvalidResult,
    runFixedActionSmoke,
    validateInvalidResult,
    validateSingleFrameAction,
};
