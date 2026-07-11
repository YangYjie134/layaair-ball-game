const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync, spawnSync } = require("node:child_process");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "..");
const SOURCE_PATH = path.join(ROOT, "src", "BallController.ts");
const TOOL_PATH = __filename;
const FIXTURE_PATH = path.join(__dirname, "l4-physics.baseline.json");
const LAYOUT_PATH = path.join(__dirname, "l4-layout.seed-1278501273.snapshot.json");
const BASELINE_COMMIT = "996ac4e";
const BASELINE_TITLE = "test(level4): add deterministic generation harness";
const B1_FIXTURE_COMMIT = "9ab869d";
const B1_FIXTURE_TITLE = "test(physics): freeze pre-stepPhysics baseline";
const FROZEN_FIXTURE_SHA256 = "5c53dcd27cfc71d25b73c8acbb2703a00ce05f45fd8b0d2c82bb51bede85c9b3";
const BASELINE_SOURCE_BLOB_SHA256 = "b5abdacaf2cb7cdb8379708c4913254d97a2570f91196811c149e81c62d82750";
const BASELINE_CAPTURE_TOOL_BLOB_SHA256 = "7f4c39ceefa23f224755ca923440101e11f77727f83dd509a6dc11f5bffef4e9";
const FROZEN_TRAJECTORY_EXCLUDED_FIELDS = Object.freeze([
    "productionSourceSha256",
    "captureToolSha256",
]);
const GENERATION_SEED = 1278501273;
const SCHEMA_VERSION = 1;

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

let activeHarness = null;

function record(type, details = {}) {
    const frame = activeHarness?.frameContext;
    if (!frame) return null;
    const event = {
        frame: frame.frame,
        sequence: frame.nextSequence++,
        type,
        phase: activeHarness.phase,
        ...details,
    };
    frame.events.push(event);
    return event;
}

function createGraphics(fillColor = "#ffffff") {
    return {
        cmds: [new DrawRectCmd(0, 0, 0, 0, fillColor)],
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
        record("newSprite", { spriteRole: activeHarness?.constructingSpriteRole ?? "production" });
    }

    addChild(child) {
        assert.ok(child && typeof child === "object", "addChild requires a node object");
        if (child.parent && child.parent !== this && Array.isArray(child.parent._children)) {
            const previousIndex = child.parent._children.indexOf(child);
            if (previousIndex >= 0) child.parent._children.splice(previousIndex, 1);
        }
        if (!this._children.includes(child)) this._children.push(child);
        child.parent = this;
        record("addChild", {
            parentId: stableNodeId(this),
            childId: stableNodeId(child),
            childName: child.name || null,
        });
        return child;
    }

    getChildByName(name) {
        return this._children.find((child) => child?.name === name) ?? null;
    }
}

const Keyboard = Object.freeze({
    R: "R",
    LEFT: "LEFT",
    A: "A",
    RIGHT: "RIGHT",
    D: "D",
    W: "W",
    UP: "UP",
});

const timer = {};
Object.defineProperty(timer, "currTimer", {
    enumerable: true,
    get() {
        const harness = activeHarness;
        const frame = harness?.frameContext;
        assert.ok(frame, "Laya.timer.currTimer was read outside an active fixture frame");
        const index = frame.timerReads.length;
        assert.ok(
            index < frame.timerValues.length,
            `${harness.scenarioId} frame ${frame.frame}: timer read ${index} exceeded supplied flow`,
        );
        const value = frame.timerValues[index];
        const entry = {
            index,
            value,
            phase: harness.phase,
        };
        frame.timerReads.push(entry);
        record("timerRead", entry);
        return value;
    },
});

global.Laya = {
    DrawRectCmd,
    DrawCircleCmd,
    InputManager: {
        hasKeyDown(key) {
            const harness = activeHarness;
            const frame = harness?.frameContext;
            assert.ok(frame, "Laya.InputManager.hasKeyDown was called outside an active fixture frame");
            const value = keyValue(frame.input, key);
            const entry = { index: frame.inputReads.length, key, value, phase: harness.phase };
            frame.inputReads.push(entry);
            record("inputRead", entry);
            return value;
        },
    },
    Keyboard,
    Script,
    Sprite,
    SoundManager: {
        soundVolume: 1,
        playSound() {
            throw new Error("real audio playback is forbidden in the physics baseline harness");
        },
    },
    Text: class extends Sprite {},
    regClass: () => (target) => target,
    stage: Object.assign(new Sprite(), { name: "Stage", width: 1334, height: 750 }),
    timer,
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

function sha256Bytes(bytes) {
    return crypto.createHash("sha256").update(bytes).digest("hex");
}

function sha256File(filePath) {
    return sha256Bytes(fs.readFileSync(filePath));
}

function gitOutput(args) {
    return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
}

function readGitBlob(commit, filePath) {
    const objectSpec = `${commit}:${filePath}`;
    const result = spawnSync("git", ["cat-file", "blob", objectSpec], {
        cwd: ROOT,
        encoding: null,
    });
    if (result.error) throw result.error;
    assert.equal(
        result.status,
        0,
        `unable to read historical Git blob ${objectSpec}: ${result.stderr?.toString("utf8").trim() ?? "unknown git error"}`,
    );
    assert.ok(Buffer.isBuffer(result.stdout), `${objectSpec}: git blob stdout must be a raw Buffer`);
    return result.stdout;
}

function assertGitAncestor(commit, label) {
    const result = spawnSync("git", ["merge-base", "--is-ancestor", commit, "HEAD"], {
        cwd: ROOT,
        encoding: null,
    });
    if (result.error) throw result.error;
    assert.equal(
        result.status,
        0,
        `${label} ${commit} is not an ancestor of HEAD: ${result.stderr?.toString("utf8").trim() ?? "git merge-base failed"}`,
    );
}

function verifyRepositoryAnchor() {
    assert.equal(gitOutput(["branch", "--show-current"]), "main", "baseline capture requires branch main");
    assert.equal(gitOutput(["show", "-s", "--format=%s", BASELINE_COMMIT]), BASELINE_TITLE, "baseline commit title changed");
    assert.equal(gitOutput(["show", "-s", "--format=%s", B1_FIXTURE_COMMIT]), B1_FIXTURE_TITLE, "B1 fixture commit title changed");
    assertGitAncestor(BASELINE_COMMIT, "baseline commit");
    assertGitAncestor(B1_FIXTURE_COMMIT, "B1 fixture commit");
    return {
        head: gitOutput(["rev-parse", "--short=7", "HEAD"]),
        baselineTitle: BASELINE_TITLE,
        b1FixtureTitle: B1_FIXTURE_TITLE,
    };
}

function materializeCrlf(rawBlob) {
    let insertedCarriageReturns = 0;
    for (let index = 0; index < rawBlob.length; index++) {
        if (rawBlob[index] === 0x0a && (index === 0 || rawBlob[index - 1] !== 0x0d)) insertedCarriageReturns++;
    }

    const materialized = Buffer.allocUnsafe(rawBlob.length + insertedCarriageReturns);
    let outputIndex = 0;
    for (let index = 0; index < rawBlob.length; index++) {
        if (rawBlob[index] === 0x0a && (index === 0 || rawBlob[index - 1] !== 0x0d)) {
            materialized[outputIndex++] = 0x0d;
        }
        materialized[outputIndex++] = rawBlob[index];
    }
    assert.equal(outputIndex, materialized.length, "CRLF materialization byte count changed");
    return materialized;
}

function diagnoseLegacyWorktreeHash(fixtureHash, rawBlob, label) {
    const rawBlobSha256 = sha256Bytes(rawBlob);
    const crlfMaterializedSha256 = sha256Bytes(materializeCrlf(rawBlob));
    const matchMode = fixtureHash === rawBlobSha256
        ? "RAW_BLOB"
        : fixtureHash === crlfMaterializedSha256
            ? "CRLF_MATERIALIZED"
            : null;
    assert.ok(
        matchMode,
        `${label} fixture legacy hash ${fixtureHash} matches neither raw blob ${rawBlobSha256} nor CRLF materialization ${crlfMaterializedSha256}`,
    );
    return { fixtureHash, rawBlobSha256, crlfMaterializedSha256, matchMode };
}

function verifyFrozenFixtureProvenance(fixture) {
    const fixtureSha256 = sha256File(FIXTURE_PATH);
    assert.equal(fixtureSha256, FROZEN_FIXTURE_SHA256, "frozen fixture file SHA-256 changed");
    assert.equal(fixture.baselineCommit, BASELINE_COMMIT, "fixture baselineCommit changed");
    assert.equal(fixture.baselineCommitTitle, BASELINE_TITLE, "fixture baselineCommitTitle changed");
    assert.equal(fixture.productionSourcePath, "src/BallController.ts", "fixture productionSourcePath changed");

    const repository = verifyRepositoryAnchor();
    const baselineProductionBlobId = gitOutput(["rev-parse", `${BASELINE_COMMIT}:src/BallController.ts`]);
    const b1ProductionBlobId = gitOutput(["rev-parse", `${B1_FIXTURE_COMMIT}:src/BallController.ts`]);
    assert.equal(b1ProductionBlobId, baselineProductionBlobId, "BallController Git blob object ID changed between baseline and B1");

    const baselineProductionBlob = readGitBlob(BASELINE_COMMIT, "src/BallController.ts");
    const b1ProductionBlob = readGitBlob(B1_FIXTURE_COMMIT, "src/BallController.ts");
    assert.ok(baselineProductionBlob.equals(b1ProductionBlob), "BallController raw blob bytes changed between baseline and B1");
    const b1CaptureToolBlob = readGitBlob(B1_FIXTURE_COMMIT, "tools/capture-l4-physics-baseline.cjs");

    const productionCanonicalRuntimeSha256 = sha256Bytes(baselineProductionBlob);
    const captureToolCanonicalRuntimeSha256 = sha256Bytes(b1CaptureToolBlob);
    assert.equal(productionCanonicalRuntimeSha256, BASELINE_SOURCE_BLOB_SHA256, "canonical production blob SHA-256 changed");
    assert.equal(captureToolCanonicalRuntimeSha256, BASELINE_CAPTURE_TOOL_BLOB_SHA256, "canonical capture-tool blob SHA-256 changed");

    assert.ok(Object.prototype.hasOwnProperty.call(fixture, "productionSourceSha256"), "fixture lacks productionSourceSha256 legacy field");
    assert.ok(Object.prototype.hasOwnProperty.call(fixture, "captureToolSha256"), "fixture lacks captureToolSha256 legacy field");
    const productionLegacy = diagnoseLegacyWorktreeHash(
        fixture.productionSourceSha256,
        baselineProductionBlob,
        "production",
    );
    const captureToolLegacy = diagnoseLegacyWorktreeHash(
        fixture.captureToolSha256,
        b1CaptureToolBlob,
        "capture-tool",
    );

    return {
        repository,
        fixtureSha256,
        baselineProductionBlobId,
        b1ProductionBlobId,
        productionCanonicalRuntimeSha256,
        captureToolCanonicalRuntimeSha256,
        productionLegacy,
        captureToolLegacy,
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

function stableNodeId(node) {
    if (!node) return null;
    if (typeof node.__fixtureId === "string") return node.__fixtureId;
    if (typeof node.name === "string" && node.name.length > 0) return node.name;
    return null;
}

function createNode(id, name, x, y, width, height, options = {}) {
    const node = new Sprite();
    node.__fixtureId = id;
    node.name = name;
    node.x = x;
    node.y = y;
    node.width = width;
    node.height = height;
    node.rotation = options.rotation ?? 0;
    node.visible = options.visible ?? true;
    node.zOrder = options.zOrder ?? 0;
    node.graphics = createGraphics(options.color ?? "#ffffff");
    return node;
}

function keyValue(input, key) {
    if (key === Keyboard.R) return input.restart;
    if (key === Keyboard.LEFT) return input.left;
    if (key === Keyboard.A) return false;
    if (key === Keyboard.RIGHT) return input.right;
    if (key === Keyboard.D) return false;
    if (key === Keyboard.W) return input.jump;
    if (key === Keyboard.UP) return false;
    throw new Error(`unexpected input key read: ${String(key)}`);
}

function expectedInputKeys(input) {
    const keys = [Keyboard.R, Keyboard.LEFT];
    if (!input.left) keys.push(Keyboard.A);
    keys.push(Keyboard.RIGHT);
    if (!input.right) keys.push(Keyboard.D);
    keys.push(Keyboard.W);
    if (!input.jump) keys.push(Keyboard.UP);
    return keys;
}

function normalizedInput(input = {}) {
    return {
        restart: input.restart === true,
        left: input.left === true,
        right: input.right === true,
        jump: input.jump === true,
    };
}

function frame(input, ...timerValues) {
    return { input: normalizedInput(input), timerValues };
}

function graphicsState(graphics) {
    const cmds = Array.isArray(graphics?.cmds) ? graphics.cmds : [];
    return cmds.map((cmd) => {
        if (cmd instanceof DrawRectCmd) {
            return {
                type: "drawRect",
                x: cmd.x,
                y: cmd.y,
                width: cmd.width,
                height: cmd.height,
                fillColor: cmd.fillColor,
            };
        }
        if (cmd instanceof DrawCircleCmd) {
            return {
                type: "drawCircle",
                x: cmd.x,
                y: cmd.y,
                radius: cmd.radius,
                fillColor: cmd.fillColor,
            };
        }
        throw new Error(`unsupported graphics command: ${cmd?.constructor?.name ?? typeof cmd}`);
    });
}

function ballBrief(controller) {
    return {
        centerX: controller.centerX,
        centerY: controller.centerY,
        vx: controller.vx,
        vy: controller.vy,
        previousY: controller.previousY,
        onGround: controller.onGround,
        groundPlatformId: stableNodeId(controller.groundPlatform),
        platformsActive: controller.platformsActive,
        deathEnabled: controller.deathEnabled,
        isHandlingDeath: controller.isHandlingDeath,
    };
}

function platformBrief(controller, platform) {
    if (!platform) return null;
    const moving = controller.movingConfigs.get(platform) ?? null;
    const disappear = controller.disappearConfigs.get(platform) ?? null;
    return {
        platformId: stableNodeId(platform),
        x: platform.x,
        y: platform.y,
        visible: platform.visible,
        movingDirection: moving?.direction ?? null,
        disappearState: disappear?.state ?? null,
        disappearTriggerAt: disappear?.triggerAt ?? null,
    };
}

function highlightState(harness) {
    const controller = harness.controller;
    const bar = controller.disappearHighlightBar;
    const firstEntry = controller.disappearConfigs.entries().next();
    const target = firstEntry.done ? null : firstEntry.value[0];
    return {
        exists: Boolean(bar),
        referenceAssigned: bar === harness.highlightReference && bar !== null,
        targetPlatformId: stableNodeId(target),
        visible: bar?.visible ?? false,
        x: bar?.x ?? null,
        y: bar?.y ?? null,
        width: bar?.width ?? null,
        height: bar?.height ?? null,
        zOrder: bar?.zOrder ?? null,
        parentId: stableNodeId(bar?.parent),
        graphics: bar ? graphicsState(bar.graphics) : [],
    };
}

function spikeHost(controller, spike) {
    if (!spike?.visible) return null;
    return controller.platforms.find((platform) => (
        spike.y + spike.height === platform.y
        && spike.x >= platform.x
        && spike.x + spike.width <= platform.x + platform.width
    )) ?? null;
}

function captureState(harness) {
    const { controller, score, initialPlatformRefs } = harness;
    assert.deepEqual(controller.platforms, initialPlatformRefs, `${harness.scenarioId}: platform array identity/order changed`);
    const names = controller.platforms.map((platform) => platform.name);
    assert.equal(new Set(names).size, names.length, `${harness.scenarioId}: platform names must remain unique`);

    return {
        ball: {
            ...ballBrief(controller),
            prevJumpKey: controller.prevJumpKey,
            prevRestartKey: controller.prevRestartKey,
            spriteX: controller.owner.x,
            spriteY: controller.owner.y,
        },
        platforms: controller.platforms.map((platform, order) => {
            const moving = controller.movingConfigs.get(platform) ?? null;
            const disappear = controller.disappearConfigs.get(platform) ?? null;
            const isGamePlatform = typeof platform.name === "string" && platform.name.startsWith("Platform_");
            return {
                platformId: stableNodeId(platform),
                platformName: platform.name,
                platformOrderIndex: order,
                x: platform.x,
                y: platform.y,
                width: platform.width,
                height: platform.height,
                visible: platform.visible,
                collidable: (!disappear || disappear.state !== "hidden") && (!isGamePlatform || controller.platformsActive),
                moving: moving ? {
                    direction: moving.direction,
                    speed: moving.speed,
                    rangeMin: moving.rangeMin,
                    rangeMax: moving.rangeMax,
                } : null,
                disappear: disappear ? {
                    state: disappear.state,
                    triggerAt: disappear.triggerAt,
                } : null,
                graphics: graphicsState(platform.graphics),
            };
        }),
        spikes: controller.spikes.map((spike, index) => ({
            spikeId: stableNodeId(spike) ?? `Spike_${index + 1}`,
            hostPlatformId: stableNodeId(spikeHost(controller, spike)),
            x: spike.x,
            y: spike.y,
            width: spike.width,
            height: spike.height,
            visible: spike.visible,
            graphics: graphicsState(spike.graphics),
        })),
        score: {
            score: score.value,
            hasWon: score.hasWon,
            scoredPlatformIds: [...score.scoredPlatforms],
        },
        highlight: highlightState(harness),
    };
}

function installScoreAndSfx(harness, options = {}) {
    const score = {
        value: options.score ?? 0,
        hasWon: options.hasWon ?? false,
        scoredPlatforms: new Set(options.scoredPlatforms ?? []),
        winScore: 5,
    };
    harness.score = score;
    const manager = ScoreManager.instance;

    SfxManager.playJump = () => {
        record("sfx", { sound: "jump" });
        harness.frameContext?.sfxCalls.push("jump");
    };
    SfxManager.playDeath = () => {
        record("sfx", { sound: "death" });
        harness.frameContext?.sfxCalls.push("death");
    };
    SfxManager.playClear = () => {
        record("sfx", { sound: "clear" });
        harness.frameContext?.sfxCalls.push("clear");
    };

    manager.isWon = () => {
        const call = { method: "isWon", value: score.hasWon, phase: harness.phase };
        harness.frameContext?.scoreCalls.push(call);
        record("scoreCall", call);
        return score.hasWon;
    };
    manager.addPlatformScore = (platform) => {
        const platformId = stableNodeId(platform);
        const before = { score: score.value, hasWon: score.hasWon, scored: [...score.scoredPlatforms] };
        if (typeof platform?.name === "string" && platform.name.startsWith("Platform_") && !score.scoredPlatforms.has(platformId)) {
            score.scoredPlatforms.add(platformId);
            score.value++;
            if (!score.hasWon && score.value >= score.winScore) {
                score.hasWon = true;
                SfxManager.playClear();
                record("win", { platformId, score: score.value });
            }
        }
        const call = {
            method: "addPlatformScore",
            platformId,
            before,
            after: { score: score.value, hasWon: score.hasWon, scored: [...score.scoredPlatforms] },
            phase: harness.phase,
        };
        harness.frameContext?.scoreCalls.push(call);
        record("scoreCall", call);
    };
    manager.reset = () => {
        const before = { score: score.value, hasWon: score.hasWon, scored: [...score.scoredPlatforms] };
        score.value = 0;
        score.hasWon = false;
        score.scoredPlatforms.clear();
        const call = {
            method: "reset",
            before,
            after: { score: score.value, hasWon: score.hasWon, scored: [] },
            phase: harness.phase,
        };
        harness.frameContext?.scoreCalls.push(call);
        record("scoreCall", call);
    };
    manager.getScore = () => score.value;
}

function withPhase(harness, phase, callback) {
    const previous = harness.phase;
    harness.phase = phase;
    try {
        return callback();
    } finally {
        harness.phase = previous;
    }
}

function methodSnapshot(harness, platform) {
    return {
        ball: ballBrief(harness.controller),
        platform: platformBrief(harness.controller, platform),
    };
}

function installMethodObservers(harness) {
    const methods = [
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
        const original = harness.controller[method];
        assert.equal(typeof original, "function", `production method ${method} is unavailable`);
        harness.controller[method] = function observedMethod(...args) {
            const platform = method === "updateMovingPlatform" || method === "resolveVerticalCollision" ? args[0] : null;
            const platformId = stableNodeId(platform);
            const phase = platformId ? `${method}:${platformId}` : method;
            const before = methodSnapshot(harness, platform);
            if (method === "syncDisappearHighlightBar") before.highlight = highlightState(harness);

            if (method === "handleDeath") {
                const reason = harness.phase.startsWith("resolveVerticalCollision:Ground")
                    ? "groundCollision"
                    : harness.phase === "checkHazards"
                        ? "hazard"
                        : harness.phase === "checkDeath"
                            ? "bottom"
                            : "other";
                record("death", { reason });
                if (reason === "hazard") record("hazardHit", {});
            }

            const event = record("method", { method, platformId, before, after: null });
            const result = withPhase(harness, phase, () => original.apply(this, args));
            event.after = methodSnapshot(harness, platform);
            if (method === "syncDisappearHighlightBar") event.after.highlight = highlightState(harness);

            if (method === "clampToCanvas") {
                const after = event.after.ball;
                const beforeBall = before.ball;
                if (beforeBall.centerX !== after.centerX && beforeBall.vx !== after.vx) {
                    record("wallBounce", {
                        side: beforeBall.centerX < after.centerX ? "left" : "right",
                        beforeX: beforeBall.centerX,
                        afterX: after.centerX,
                        beforeVx: beforeBall.vx,
                        afterVx: after.vx,
                    });
                }
            }
            return result;
        };
    }
}

function setupHighlightReferenceObserver(harness) {
    let highlightReference = null;
    Object.defineProperty(harness.controller, "disappearHighlightBar", {
        configurable: true,
        enumerable: true,
        get() {
            return highlightReference;
        },
        set(value) {
            const previousId = stableNodeId(highlightReference);
            highlightReference = value;
            harness.highlightReference = value;
            if (value && !value.__fixtureId) value.__fixtureId = "DisappearHighlightBar";
            record("highlightReferenceAssigned", {
                previousId,
                nextId: stableNodeId(value),
            });
        },
    });
    harness.highlightReference = null;
}

function assertStageALayout(controller, stageASnapshot) {
    const platforms = controller.platforms.filter((platform) => platform.name.startsWith("Platform_"));
    const actual = {
        seed: GENERATION_SEED,
        platforms: platforms.map((platform) => {
            const moving = controller.movingConfigs.get(platform);
            return {
                name: platform.name,
                x: platform.x,
                y: platform.y,
                moving: moving ? {
                    speed: moving.speed,
                    rangeMin: moving.rangeMin,
                    rangeMax: moving.rangeMax,
                    direction: moving.direction,
                } : null,
                disappear: controller.disappearConfigs.has(platform),
            };
        }),
        spike: (() => {
            const spike = controller.spikes[0];
            const host = spikeHost(controller, spike);
            const side = !host ? null : spike.x === host.x ? "left" : spike.x + spike.width === host.x + host.width ? "right" : "unknown";
            return {
                visible: spike.visible,
                host: host?.name ?? null,
                side,
                x: spike.x,
                y: spike.y,
                width: spike.width,
                height: spike.height,
            };
        })(),
    };
    assert.deepStrictEqual(actual, stageASnapshot, "production generation no longer matches the stage A snapshot");
}

function createHarness(scenario) {
    activeHarness = null;
    const root = createNode("Playfield", "Playfield", 0, 0, 1334, 750);
    const platformSpecs = [
        ["Platform_1", 70, 552, 200, 1],
        ["Platform_2", 280, 409, 200, 1],
        ["Platform_3", 649, 326, 200, 1],
        ["Platform_4", 272, 221, 200, 1],
        ["Platform_5", 536, 113, 200, 1],
        ["Ground", 0, 720, 1334, 30],
    ];
    const platforms = platformSpecs.map(([name, x, y, width, height]) => createNode(name, name, x, y, width, height));
    const [platform1, platform2, platform3, platform4, platform5, ground] = platforms;
    for (const platform of platforms) root.addChild(platform);
    const topWall = createNode("top wall", "top wall", 0, 0, 1334, 30);
    const leftWall = createNode("left wall", "left wall", 30, 0, 1334, 30, { rotation: 90 });
    const rightWall = createNode("right wall", "right wall", 1334, 0, 1334, 30, { rotation: 90 });
    root.addChild(topWall);
    root.addChild(leftWall);
    root.addChild(rightWall);
    const ball = createNode("Ball", "Ball", 667, 713, 10, 10);
    root.addChild(ball);
    const spike = createNode("Spike_1", "Spike_1", 0, 0, 80, 8, { color: "#ff0000", visible: false, zOrder: 1 });
    root.addChild(spike);

    const controller = new BallController();
    controller.owner = ball;
    controller.currentLevel = 4;
    controller.startX = 667;
    controller.startY = 713;
    controller.centerX = ball.x;
    controller.centerY = ball.y;
    controller.previousY = ball.y;
    controller.platforms = platforms;
    controller.spikes = [spike];
    controller.topWall = topWall;
    controller.leftWall = leftWall;
    controller.rightWall = rightWall;

    const initializationRngCalls = [];
    const seededRng = createSeededRng(GENERATION_SEED);
    controller.setRandomSource(() => {
        const value = seededRng();
        initializationRngCalls.push({ index: initializationRngCalls.length, value });
        return value;
    });
    controller.randomizePlatforms();
    controller.randomizeHazards();
    assertStageALayout(controller, JSON.parse(fs.readFileSync(LAYOUT_PATH, "utf8")));

    const harness = {
        scenarioId: scenario.id,
        controller,
        root,
        nodes: { platform1, platform2, platform3, platform4, platform5, ground, topWall, leftWall, rightWall, ball, spike },
        phase: "setup",
        frameContext: null,
        initializationRngCalls,
        highlightReference: null,
        onUpdateCalls: 0,
        stepPhysicsCalls: 0,
    };
    installScoreAndSfx(harness, scenario.score);
    scenario.configure(harness);

    assert.equal(controller.owner, ball, `${scenario.id}: owner identity changed during setup`);
    assert.equal(controller.onUpdate, BallController.prototype.onUpdate, `${scenario.id}: controller onUpdate must be the production prototype method`);
    assert.equal(new Set(controller.platforms.map((platform) => platform.name)).size, controller.platforms.length, `${scenario.id}: duplicate platform names`);
    harness.initialPlatformRefs = [...controller.platforms];
    setupHighlightReferenceObserver(harness);
    installMethodObservers(harness);

    controller.setRandomSource(() => {
        const frameContext = harness.frameContext;
        assert.ok(frameContext, `${scenario.id}: RNG was consumed outside an active fixture frame`);
        const value = seededRng();
        const entry = {
            index: frameContext.rngCalls.length,
            value,
            phase: harness.phase,
        };
        frameContext.rngCalls.push(entry);
        record("rngCall", entry);
        return value;
    });
    return harness;
}

function configureCommon(harness) {
    const { controller, nodes } = harness;
    controller.vx = 0;
    controller.vy = 0;
    controller.onGround = false;
    controller.groundPlatform = null;
    controller.prevJumpKey = false;
    controller.prevRestartKey = false;
    controller.platformsActive = true;
    controller.deathEnabled = false;
    controller.isHandlingDeath = false;
    controller.disappearConfigs.clear();
    controller.movingConfigs.clear();
    controller.disappearHighlightBar = null;
    for (const platform of controller.platforms) {
        platform.visible = true;
        platform.graphics = createGraphics("#ffffff");
    }
    nodes.spike.visible = false;
    nodes.ball.x = controller.centerX = 667;
    nodes.ball.y = controller.centerY = 300;
    controller.previousY = controller.centerY;
}

function setBall(harness, x, y, vx, vy) {
    harness.nodes.ball.x = harness.controller.centerX = x;
    harness.nodes.ball.y = harness.controller.centerY = y;
    harness.controller.previousY = y;
    harness.controller.vx = vx;
    harness.controller.vy = vy;
}

function moveUnusedPlatforms(harness, keepIds) {
    const keep = new Set(keepIds);
    for (const platform of harness.controller.platforms) {
        if (!keep.has(platform.name) && platform.name !== "Ground") {
            platform.x = 40;
            platform.y = 80;
        }
    }
}

function scenarioDefinitions() {
    const noInput = {};
    const scenarioAFrames = [];
    scenarioAFrames.push(frame(noInput, 0));
    for (let index = 1; index <= 10; index++) scenarioAFrames.push(frame({ left: true }, index * 16));
    for (let index = 11; index <= 30; index++) scenarioAFrames.push(frame({ right: true }, index * 16));
    scenarioAFrames.push(frame({ jump: true }, 31 * 16));
    scenarioAFrames.push(frame({ jump: true }, 32 * 16));
    scenarioAFrames.push(frame({ jump: true }, 33 * 16));
    scenarioAFrames.push(frame({}, 34 * 16));
    scenarioAFrames.push(frame({ jump: true }, 35 * 16));
    for (let index = 36; index <= 90; index++) scenarioAFrames.push(frame({}, index * 16));
    scenarioAFrames.push(frame({ jump: true }, 91 * 16));
    scenarioAFrames.push(frame({ jump: true }, 92 * 16));

    return [
        {
            id: "A-basic-input-jump-edge",
            coverage: ["friction", "left", "right", "vx-clamp", "gravity", "ground-landing", "jump-edge", "held-jump", "release-and-press", "prevJumpKey"],
            frames: scenarioAFrames,
            configure(harness) {
                configureCommon(harness);
                const { controller, nodes } = harness;
                moveUnusedPlatforms(harness, []);
                nodes.ground.y = 720;
                setBall(harness, 667, 715, 1, 0);
                controller.onGround = true;
                controller.groundPlatform = nodes.ground;
                controller.platformsActive = false;
            },
        },
        {
            id: "B-platform-landing-and-edge-release",
            coverage: ["vertical-crossing", "onGround", "groundPlatform-reference", "synchronous-score-win", "edge-release"],
            score: { score: 4, scoredPlatforms: ["Platform_2", "Platform_3", "Platform_4", "Platform_5"] },
            frames: [frame({ right: true }, 100), frame({ right: true }, 116), frame({ right: true }, 132), frame({ right: true }, 148)],
            configure(harness) {
                configureCommon(harness);
                const { controller, nodes } = harness;
                moveUnusedPlatforms(harness, ["Platform_1"]);
                Object.assign(nodes.platform1, { x: 100, y: 100, width: 60, height: 1 });
                setBall(harness, 150, 94, 5, 1);
                controller.platformsActive = true;
            },
        },
        {
            id: "C-moving-platform-order-and-turn",
            coverage: ["move-before-collision", "moving-x", "direction-turn", "range-boundary", "supported-without-horizontal-carry", "platform-loop-order"],
            frames: [frame(noInput, 200), frame(noInput, 216), frame(noInput, 232), frame(noInput, 248)],
            configure(harness) {
                configureCommon(harness);
                const { controller, nodes } = harness;
                moveUnusedPlatforms(harness, ["Platform_1"]);
                Object.assign(nodes.platform1, { x: 100, y: 100, width: 80, height: 1 });
                controller.movingConfigs.set(nodes.platform1, { axis: "x", speed: 1.5, rangeMin: 100, rangeMax: 103, direction: 1 });
                setBall(harness, 110, 95, 0, 0);
                controller.onGround = true;
                controller.groundPlatform = nodes.platform1;
            },
        },
        {
            id: "D-disappear-platform-highlight",
            coverage: ["disappear-trigger", "second-timer-read", "counting", "hidden", "visible-collidable", "mid-frame-highlight", "sprite-create", "addChild", "reference-assignment", "graphics-color"],
            frames: [frame(noInput, 1000, 1001), frame(noInput, 1201), frame(noInput, 1801), frame(noInput, 1817)],
            configure(harness) {
                configureCommon(harness);
                const { controller, nodes } = harness;
                moveUnusedPlatforms(harness, ["Platform_1"]);
                Object.assign(nodes.platform1, { x: 100, y: 100, width: 100, height: 1 });
                nodes.platform1.graphics = createGraphics("#00ff00");
                controller.disappearConfigs.set(nodes.platform1, { state: "idle", triggerAt: 0 });
                setBall(harness, 150, 94, 0, 1);
            },
        },
        {
            id: "E1-right-wall-bounce",
            coverage: ["x-integrate", "hazards-before-clamp", "right-wall-bounce", "sprite-writeback"],
            frames: [frame(noInput, 3000), frame(noInput, 3016)],
            configure(harness) {
                configureCommon(harness);
                moveUnusedPlatforms(harness, []);
                setBall(harness, 1298, 300, 5, 0);
            },
        },
        {
            id: "E2-spike-death-order",
            coverage: ["x-integrate", "hazard-hit", "death-before-release-and-clamp", "death-rng", "respawn", "sprite-writeback"],
            frames: [frame(noInput, 4000)],
            configure(harness) {
                configureCommon(harness);
                const { nodes } = harness;
                moveUnusedPlatforms(harness, []);
                Object.assign(nodes.spike, { x: 195, y: 96, width: 20, height: 8, visible: true });
                nodes.spike.graphics = createGraphics("#ff0000");
                setBall(harness, 200, 100, 0, 0);
            },
        },
        {
            id: "F-ground-death-mid-platform-loop",
            coverage: ["ground-death-not-last", "handleDeath", "death-sfx", "randomizePlatforms", "randomizeHazards", "rng-order", "respawn", "score-reset", "loop-continues", "highlight-after-death", "x-hazards-release-clamp-sprite-after-death"],
            score: { score: 2, scoredPlatforms: ["Platform_4", "Platform_5"] },
            frames: [frame(noInput, 5000)],
            configure(harness) {
                configureCommon(harness);
                const { controller, nodes } = harness;
                controller.platforms = [nodes.platform1, nodes.ground, nodes.platform2, nodes.platform3, nodes.platform4, nodes.platform5];
                moveUnusedPlatforms(harness, []);
                nodes.ground.y = 720;
                setBall(harness, 667, 714, 0, 1);
                controller.platformsActive = true;
                controller.deathEnabled = true;
            },
        },
    ];
}

function invokeProductionOnUpdate(harness, frameIndex, frameDefinition) {
    const frameContext = {
        frame: frameIndex,
        input: frameDefinition.input,
        timerValues: frameDefinition.timerValues,
        inputReads: [],
        timerReads: [],
        rngCalls: [],
        scoreCalls: [],
        sfxCalls: [],
        events: [],
        nextSequence: 0,
    };
    harness.frameContext = frameContext;
    harness.phase = "onUpdate-main";
    activeHarness = harness;

    const originalConsoleLog = console.log;
    const originalStepPhysics = harness.controller.stepPhysics;
    let frameStepPhysicsCalls = 0;
    assert.equal(originalStepPhysics, BallController.prototype.stepPhysics, "stepPhysics was replaced before production onUpdate");
    harness.controller.stepPhysics = function observedStepPhysics(...args) {
        frameStepPhysicsCalls++;
        harness.stepPhysicsCalls++;
        return originalStepPhysics.apply(this, args);
    };
    console.log = (...args) => record("consoleLog", { args: args.map((value) => String(value)) });
    try {
        assert.equal(harness.controller.onUpdate, BallController.prototype.onUpdate, "onUpdate was replaced by the harness");
        harness.onUpdateCalls++;
        BallController.prototype.onUpdate.call(harness.controller);
    } finally {
        harness.controller.stepPhysics = originalStepPhysics;
        console.log = originalConsoleLog;
        activeHarness = null;
        harness.phase = "idle";
    }

    assert.equal(frameStepPhysicsCalls, 1, `${harness.scenarioId} frame ${frameIndex}: production onUpdate must call stepPhysics exactly once`);

    assert.deepStrictEqual(
        frameContext.inputReads.map((entry) => entry.key),
        expectedInputKeys(frameDefinition.input),
        `${harness.scenarioId} frame ${frameIndex}: production input read order changed`,
    );
    assert.equal(
        frameContext.timerReads.length,
        frameContext.timerValues.length,
        `${harness.scenarioId} frame ${frameIndex}: ${frameContext.timerValues.length - frameContext.timerReads.length} timer values were not consumed`,
    );

    return {
        scenarioId: harness.scenarioId,
        frame: frameIndex,
        input: frameDefinition.input,
        inputReads: frameContext.inputReads,
        timerReads: frameContext.timerReads,
        rngCalls: frameContext.rngCalls,
        scoreCalls: frameContext.scoreCalls,
        sfxCalls: frameContext.sfxCalls,
        events: frameContext.events,
        state: captureState(harness),
    };
}

function assertScenarioCoverage(trace) {
    const frames = trace.frames;
    const events = frames.flatMap((entry) => entry.events);
    const states = frames.map((entry) => entry.state);
    const methodEvents = events.filter((entry) => entry.type === "method");

    if (trace.scenarioId === "A-basic-input-jump-edge") {
        assert.ok(states.some((state) => state.ball.vx === -5), "scenario A did not hit negative vx clamp");
        assert.ok(states.some((state) => state.ball.vx === 5), "scenario A did not hit positive vx clamp");
        assert.equal(frames.filter((entry) => entry.sfxCalls.includes("jump")).length, 2, "scenario A must produce exactly two jump edges");
        assert.ok(states.some((state) => state.ball.onGround), "scenario A did not land");
    }
    if (trace.scenarioId === "B-platform-landing-and-edge-release") {
        assert.equal(states[0].score.hasWon, true, "scenario B score win was not synchronous");
        assert.ok(frames[0].sfxCalls.includes("clear"), "scenario B did not emit clear SFX");
        assert.ok(states.some((state) => state.ball.groundPlatformId === "Platform_1"), "scenario B did not record platform reference");
        assert.ok(states.some((state) => !state.ball.onGround), "scenario B did not leave the platform edge");
    }
    if (trace.scenarioId === "C-moving-platform-order-and-turn") {
        assert.ok(states.some((state) => state.platforms[0].moving.direction === -1), "scenario C did not turn at rangeMax");
        const platformCalls = methodEvents.filter((event) => event.platformId === "Platform_1");
        for (let index = 0; index < frames.length; index++) {
            const calls = platformCalls.filter((event) => event.frame === index).map((event) => event.method);
            assert.deepStrictEqual(calls.slice(0, 2), ["updateMovingPlatform", "resolveVerticalCollision"], `scenario C frame ${index}: moving/collision order changed`);
        }
        assert.equal(states[0].ball.centerX, 110, "scenario C unexpectedly carried ball horizontally");
    }
    if (trace.scenarioId === "D-disappear-platform-highlight") {
        assert.equal(frames[0].timerReads.length, 2, "scenario D first frame must consume two timer reads");
        assert.equal(states[0].platforms[0].disappear.triggerAt, 1001, "scenario D triggerAt did not use second timer read");
        assert.equal(states[2].platforms[0].disappear.state, "hidden", "scenario D did not hide platform");
        assert.ok(events.some((event) => event.type === "newSprite"), "scenario D did not create highlight Sprite");
        assert.ok(events.some((event) => event.type === "addChild" && event.childId === "DisappearHighlightBar"), "scenario D did not add highlight bar to parent");
        assert.ok(events.some((event) => event.type === "highlightReferenceAssigned"), "scenario D did not assign highlight reference");
    }
    if (trace.scenarioId === "E1-right-wall-bounce") {
        assert.ok(events.some((event) => event.type === "wallBounce" && event.side === "right"), "scenario E1 did not bounce off right wall");
    }
    if (trace.scenarioId === "E2-spike-death-order") {
        assert.ok(events.some((event) => event.type === "hazardHit"), "scenario E2 did not hit spike");
        assert.ok(frames[0].rngCalls.length > 0, "scenario E2 death did not consume RNG");
    }
    if (trace.scenarioId === "F-ground-death-mid-platform-loop") {
        const groundResolve = methodEvents.find((event) => event.method === "resolveVerticalCollision" && event.platformId === "Ground");
        const laterPlatform = methodEvents.find((event) => event.sequence > groundResolve.sequence && event.platformId === "Platform_2");
        assert.ok(groundResolve, "scenario F did not process Ground");
        assert.ok(laterPlatform, "scenario F did not continue platform loop after Ground death");
        assert.ok(events.some((event) => event.type === "death" && event.reason === "groundCollision"), "scenario F did not record Ground death");
        assert.ok(frames[0].sfxCalls.includes("death"), "scenario F did not emit death SFX");
        assert.ok(frames[0].scoreCalls.some((call) => call.method === "reset"), "scenario F did not synchronously reset score");
        for (const method of ["randomizePlatforms", "randomizeHazards", "respawn", "syncDisappearHighlightBar", "checkHazards", "releaseGroundIfUnsupported", "clampToCanvas", "syncBallSprite"]) {
            assert.ok(methodEvents.some((event) => event.method === method), `scenario F did not execute ${method}`);
        }
        assert.ok(frames[0].rngCalls.length > 0, "scenario F did not record death RNG");
    }
}

function buildBaseline() {
    const definitions = scenarioDefinitions();
    const traces = [];
    const exportedDefinitions = [];

    for (const scenario of definitions) {
        const harness = createHarness(scenario);
        const initialState = captureState(harness);
        const frames = scenario.frames.map((entry, index) => invokeProductionOnUpdate(harness, index, entry));
        assert.equal(harness.onUpdateCalls, frames.length, `${scenario.id}: not every frame called production onUpdate`);
        assert.equal(harness.stepPhysicsCalls, frames.length, `${scenario.id}: not every frame called production stepPhysics`);
        const trace = { scenarioId: scenario.id, frames };
        assertScenarioCoverage(trace);
        traces.push(trace);
        exportedDefinitions.push({
            scenarioId: scenario.id,
            generationSeed: GENERATION_SEED,
            coverage: scenario.coverage,
            frameCount: scenario.frames.length,
            inputs: scenario.frames.map((entry) => entry.input),
            timerReadFlows: scenario.frames.map((entry) => entry.timerValues),
            initializationRngCalls: harness.initializationRngCalls,
            initialState,
            productionOnUpdateCalls: harness.onUpdateCalls,
        });
    }

    return {
        schemaVersion: SCHEMA_VERSION,
        baselineCommit: BASELINE_COMMIT,
        baselineCommitTitle: BASELINE_TITLE,
        branch: "main",
        productionSourcePath: "src/BallController.ts",
        productionSourceSha256: sha256File(SOURCE_PATH),
        captureToolSha256: sha256File(TOOL_PATH),
        generation: {
            algorithm: "mulberry32",
            seed: GENERATION_SEED,
            stageALayoutFixture: "tools/l4-layout.seed-1278501273.snapshot.json",
        },
        scenarioDefinitions: exportedDefinitions,
        traces,
    };
}

function canonicalize(value, valuePath = "$", seen = new Set()) {
    if (typeof value === "number") {
        assert.ok(Number.isFinite(value), `${valuePath}: non-finite number ${String(value)}`);
        return Object.is(value, -0) ? { $number: "-0" } : value;
    }
    if (value === null || typeof value === "string" || typeof value === "boolean") return value;
    if (Array.isArray(value)) return value.map((entry, index) => canonicalize(entry, `${valuePath}[${index}]`, seen));
    if (typeof value === "object") {
        assert.ok(!seen.has(value), `${valuePath}: cyclic object cannot be serialized`);
        seen.add(value);
        const result = {};
        for (const key of Object.keys(value).sort()) result[key] = canonicalize(value[key], `${valuePath}.${key}`, seen);
        seen.delete(value);
        return result;
    }
    throw new Error(`${valuePath}: unsupported value type ${typeof value}`);
}

function canonicalText(value) {
    return `${JSON.stringify(canonicalize(value), null, 2)}\n`;
}

function firstDifference(expected, actual, valuePath = "$") {
    if (Object.is(expected, actual)) return null;
    if (typeof expected !== typeof actual || expected === null || actual === null) return { path: valuePath, expected, actual };
    if (Array.isArray(expected) || Array.isArray(actual)) {
        if (!Array.isArray(expected) || !Array.isArray(actual)) return { path: valuePath, expected, actual };
        if (expected.length !== actual.length) return { path: `${valuePath}.length`, expected: expected.length, actual: actual.length };
        for (let index = 0; index < expected.length; index++) {
            const difference = firstDifference(expected[index], actual[index], `${valuePath}[${index}]`);
            if (difference) return difference;
        }
        return null;
    }
    if (typeof expected === "object") {
        const expectedKeys = Object.keys(expected);
        const actualKeys = Object.keys(actual);
        const keyDifference = firstDifference(expectedKeys, actualKeys, `${valuePath}.__keys`);
        if (keyDifference) return keyDifference;
        for (const key of expectedKeys) {
            const difference = firstDifference(expected[key], actual[key], `${valuePath}.${key}`);
            if (difference) return difference;
        }
        return null;
    }
    return { path: valuePath, expected, actual };
}

function strictCompare(expected, actual) {
    const difference = firstDifference(expected, actual);
    if (!difference) return;
    const frameMatch = difference.path.match(/^\$\.traces\[(\d+)\]\.frames\[(\d+)\]/);
    const context = {};
    if (frameMatch) {
        const scenarioIndex = Number(frameMatch[1]);
        const frameIndex = Number(frameMatch[2]);
        const expectedFrame = expected.traces[scenarioIndex]?.frames[frameIndex];
        const actualFrame = actual.traces[scenarioIndex]?.frames[frameIndex];
        context.scenario = actual.traces[scenarioIndex]?.scenarioId ?? expected.traces[scenarioIndex]?.scenarioId;
        context.firstDifferentFrame = frameIndex;
        context.previousFrame = frameIndex > 0 ? actual.traces[scenarioIndex]?.frames[frameIndex - 1]?.state : null;
        context.currentInput = actualFrame?.input;
        context.timerReads = actualFrame?.timerReads;
        context.rngCalls = actualFrame?.rngCalls;
        context.phaseEventSequence = actualFrame?.events;
        context.expectedFrame = expectedFrame;
    }
    console.error("[l4-physics] snapshot mismatch");
    console.error(JSON.stringify({ ...difference, context }, null, 2));
    throw new assert.AssertionError({
        message: `fixture differs at ${difference.path}`,
        actual: difference.actual,
        expected: difference.expected,
        operator: "Object.is/deep ordered equality",
    });
}

function projectFrozenTrajectoryForStrictComparison(value, label) {
    const requiredExcludedFields = ["productionSourceSha256", "captureToolSha256"];
    assert.equal(FROZEN_TRAJECTORY_EXCLUDED_FIELDS.length, 2, "frozen trajectory exclusion list must contain exactly two fields");
    assert.deepStrictEqual(
        [...FROZEN_TRAJECTORY_EXCLUDED_FIELDS],
        requiredExcludedFields,
        "frozen trajectory exclusion list changed",
    );
    assert.ok(value && typeof value === "object" && !Array.isArray(value), `${label} baseline must be a top-level object`);
    for (const field of requiredExcludedFields) {
        assert.ok(Object.prototype.hasOwnProperty.call(value, field), `${label} baseline lacks own top-level field ${field}`);
    }

    const projected = { ...value };
    for (const field of requiredExcludedFields) delete projected[field];
    return projected;
}

function strictCompareFrozenTrajectory(expected, actual) {
    assert.deepStrictEqual(
        Object.keys(actual),
        Object.keys(expected),
        "frozen and current baseline top-level fields differ before trajectory projection",
    );
    const projectedExpected = projectFrozenTrajectoryForStrictComparison(expected, "frozen fixture");
    const projectedActual = projectFrozenTrajectoryForStrictComparison(actual, "current generated");
    assert.deepStrictEqual(
        Object.keys(projectedActual),
        Object.keys(projectedExpected),
        "frozen and current baseline top-level fields differ after trajectory projection",
    );
    strictCompare(projectedExpected, projectedActual);
}

function stats(baseline) {
    const frames = baseline.traces.flatMap((trace) => trace.frames);
    return {
        scenarios: baseline.traces.length,
        frames: frames.length,
        timerReads: frames.reduce((sum, entry) => sum + entry.timerReads.length, 0),
        rngCalls: frames.reduce((sum, entry) => sum + entry.rngCalls.length, 0),
        events: frames.reduce((sum, entry) => sum + entry.events.length, 0),
        negativeZeroMarkers: (canonicalText(baseline).match(/\"\$number\": \"-0\"/g) ?? []).length,
    };
}

function parseMode(argv) {
    const write = argv.includes("--write");
    const verify = argv.includes("--verify");
    const overwrite = argv.includes("--overwrite");
    assert.notEqual(write, verify, "choose exactly one mode: --write or --verify");
    if (overwrite) assert.ok(write, "--overwrite is only valid with --write");
    return { write, verify, overwrite };
}

function main() {
    const mode = parseMode(process.argv.slice(2));
    let expected = null;
    let provenance = null;
    let repository = null;
    if (mode.verify) {
        assert.ok(fs.existsSync(FIXTURE_PATH), `${path.relative(ROOT, FIXTURE_PATH)} does not exist; run --write first`);
        expected = JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8"));
        provenance = verifyFrozenFixtureProvenance(expected);
        repository = provenance.repository;
    } else {
        repository = verifyRepositoryAnchor();
    }

    const generatedA = canonicalize(buildBaseline());
    const generatedB = canonicalize(buildBaseline());
    strictCompare(generatedA, generatedB);
    const summary = stats(generatedA);
    const currentProductionSourceSha256 = sha256File(SOURCE_PATH);
    const currentCaptureToolSha256 = sha256File(TOOL_PATH);
    assert.equal(generatedA.productionSourceSha256, currentProductionSourceSha256, "generated production source SHA-256 is not current");
    assert.equal(generatedA.captureToolSha256, currentCaptureToolSha256, "generated capture-tool SHA-256 is not current");

    console.log(`[l4-physics] mode: ${mode.write ? "write" : "verify"}`);
    console.log(`[l4-physics] fixture baseline: main ${BASELINE_COMMIT} ${BASELINE_TITLE}`);
    console.log(`[l4-physics] current HEAD: ${repository.head}`);
    console.log(`[l4-physics] current production source SHA-256: ${currentProductionSourceSha256}`);
    console.log(`[l4-physics] current capture tool SHA-256: ${currentCaptureToolSha256}`);
    if (provenance) {
        console.log(`[l4-physics] frozen fixture SHA-256 fixed: ${FROZEN_FIXTURE_SHA256}`);
        console.log(`[l4-physics] frozen fixture SHA-256 runtime: ${provenance.fixtureSha256}`);
        console.log("[l4-physics] baseline commit ancestry: PASS");
        console.log("[l4-physics] B1 fixture commit ancestry: PASS");
        console.log(`[l4-physics] baseline commit title: PASS (${repository.baselineTitle})`);
        console.log(`[l4-physics] B1 fixture commit title: PASS (${repository.b1FixtureTitle})`);
        console.log(`[l4-physics] baseline production blob object ID: ${provenance.baselineProductionBlobId}`);
        console.log(`[l4-physics] B1 production blob object ID: ${provenance.b1ProductionBlobId}`);
        console.log("[l4-physics] baseline-to-B1 production blob identity: PASS");
        console.log(`[l4-physics] canonical production blob fixed SHA-256: ${BASELINE_SOURCE_BLOB_SHA256}`);
        console.log(`[l4-physics] canonical production blob runtime SHA-256: ${provenance.productionCanonicalRuntimeSha256}`);
        console.log("[l4-physics] canonical production blob provenance: PASS");
        console.log(`[l4-physics] canonical capture-tool blob fixed SHA-256: ${BASELINE_CAPTURE_TOOL_BLOB_SHA256}`);
        console.log(`[l4-physics] canonical capture-tool blob runtime SHA-256: ${provenance.captureToolCanonicalRuntimeSha256}`);
        console.log("[l4-physics] canonical capture-tool blob provenance: PASS");
        console.log(`[l4-physics] legacy production fixture SHA-256: ${provenance.productionLegacy.fixtureHash}`);
        console.log(`[l4-physics] legacy production RAW_BLOB SHA-256: ${provenance.productionLegacy.rawBlobSha256}`);
        console.log(`[l4-physics] legacy production CRLF_MATERIALIZED SHA-256: ${provenance.productionLegacy.crlfMaterializedSha256}`);
        console.log(`[l4-physics] legacy production worktree hash reproduction: PASS (${provenance.productionLegacy.matchMode})`);
        console.log(`[l4-physics] legacy capture-tool fixture SHA-256: ${provenance.captureToolLegacy.fixtureHash}`);
        console.log(`[l4-physics] legacy capture-tool RAW_BLOB SHA-256: ${provenance.captureToolLegacy.rawBlobSha256}`);
        console.log(`[l4-physics] legacy capture-tool CRLF_MATERIALIZED SHA-256: ${provenance.captureToolLegacy.crlfMaterializedSha256}`);
        console.log(`[l4-physics] legacy capture-tool worktree hash reproduction: PASS (${provenance.captureToolLegacy.matchMode})`);
        console.log("[l4-physics] frozen fixture provenance verification: PASS");
    }
    console.log("[l4-physics] production BallController.prototype.onUpdate: CALLED");
    console.log(`[l4-physics] production stepPhysics calls: ${summary.frames}`);
    console.log("[l4-physics] in-memory current replay strict verification: PASS");
    console.log(`[l4-physics] scenarios: ${summary.scenarios}`);
    console.log(`[l4-physics] total frames: ${summary.frames}`);
    console.log(`[l4-physics] timer reads: ${summary.timerReads}`);
    console.log(`[l4-physics] RNG calls: ${summary.rngCalls}`);
    console.log(`[l4-physics] ordered events: ${summary.events}`);
    console.log(`[l4-physics] negative-zero markers: ${summary.negativeZeroMarkers}`);

    if (mode.write) {
        if (fs.existsSync(FIXTURE_PATH) && !mode.overwrite) {
            throw new Error(`${path.relative(ROOT, FIXTURE_PATH)} already exists; pass --overwrite to rebuild explicitly`);
        }
        fs.writeFileSync(FIXTURE_PATH, `${JSON.stringify(generatedA, null, 2)}\n`, "utf8");
        console.log(`[l4-physics] fixture written: ${path.relative(ROOT, FIXTURE_PATH)}`);
        return;
    }

    strictCompareFrozenTrajectory(expected, generatedA);
    console.log("[l4-physics] frozen fixture strict trajectory verification: PASS");
    console.log("[l4-physics] 字段差异: 0");
    console.log("[l4-physics] 事件顺序差异: 0");
    console.log("[l4-physics] 第一处轨迹差异: 无");
}

main();
