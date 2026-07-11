const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "..");
const SNAPSHOT_SEED = 1278501273;
const REPLAY_SEEDS = [0, 1, SNAPSHOT_SEED, 1278501821, 0xffffffff].map((seed) => seed >>> 0);
const SNAPSHOT_PATH = path.join(__dirname, "l4-layout.seed-1278501273.snapshot.json");
const SEARCH_MAX_SEED = 9999;

assert.equal(new Set(REPLAY_SEEDS).size, REPLAY_SEEDS.length, "replay seeds must normalize to distinct values");

class Script {
    constructor() {
        this.owner = null;
    }
}

class DrawRectCmd {
    constructor(fillColor = "#ffffff") {
        this.fillColor = fillColor;
    }
}

class Sprite {
    constructor() {
        this.graphics = createGraphics();
    }
}

function createGraphics(fillColor = "#ffffff") {
    return {
        cmds: [new DrawRectCmd(fillColor)],
        clear() {
            this.cmds = [];
        },
        drawRect(_x, _y, _width, _height, color) {
            this.cmds = [new DrawRectCmd(color)];
        },
        repaint() {},
    };
}

global.Laya = {
    DrawRectCmd,
    InputManager: { hasKeyDown: () => false },
    Keyboard: {},
    Script,
    Sprite,
    SoundManager: {},
    Text: class {},
    regClass: () => (target) => target,
    stage: { width: 1334, height: 750, addChild() {} },
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

const BallController = require(path.join(ROOT, "src", "BallController.ts")).default;

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

function createPlatform(name, x, y, width, height) {
    return {
        name,
        x,
        y,
        width,
        height,
        visible: true,
        zOrder: 0,
        graphics: createGraphics(),
    };
}

function createBaseline(seed, options = {}) {
    const normalizedSeed = seed >>> 0;
    const startX = options.startX ?? 667;
    const platformWidth = options.platformWidth ?? 200;
    const leftWallX = options.leftWallX ?? 30;
    const rightWallX = options.rightWallX ?? 1334;
    const controller = new BallController();
    const platforms = [
        createPlatform("Platform_1", 70, 552, platformWidth, 1),
        createPlatform("Platform_2", 280, 409, platformWidth, 1),
        createPlatform("Platform_3", 649, 326, platformWidth, 1),
        createPlatform("Platform_4", 272, 221, platformWidth, 1),
        createPlatform("Platform_5", 536, 113, platformWidth, 1),
    ];
    const ground = createPlatform("Ground", 0, 720, 1334, 30);
    const spike = {
        name: "Spike_1",
        x: 0,
        y: 0,
        width: 80,
        height: 8,
        visible: false,
        zOrder: 1,
        graphics: createGraphics("#ff0000"),
    };
    const randomValues = [];
    const seededRng = createSeededRng(normalizedSeed);

    controller.owner = { x: startX, y: 713, width: 10, height: 10 };
    controller.currentLevel = 4;
    controller.startX = startX;
    controller.startY = 713;
    controller.platforms = [...platforms, ground];
    controller.spikes = [spike];
    controller.topWall = { x: 0, y: 0, width: 1334, height: 30, rotation: 0 };
    controller.leftWall = { x: leftWallX, y: 0, width: 1334, height: 30, rotation: 90 };
    controller.rightWall = { x: rightWallX, y: 0, width: 1334, height: 30, rotation: 90 };
    controller.setRandomSource(() => {
        const value = seededRng();
        randomValues.push(value);
        return value;
    });

    assert.equal(controller.movingConfigs.size, 0, "movingConfigs baseline must be empty");
    assert.equal(controller.disappearConfigs.size, 0, "disappearConfigs baseline must be empty");
    assert.equal(spike.visible, false, "spike baseline must be hidden");
    assert.ok(platforms.every((platform) => platform.visible), "all baseline platforms must be visible");

    return { controller, platforms, randomValues, spike };
}

function captureLayout(seed, fixture) {
    const { controller, platforms, spike } = fixture;
    const host = spike.visible
        ? platforms.find((platform) => (
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
        platforms: platforms.map((platform) => {
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

function generateLayout(seed, options = {}) {
    const fixture = createBaseline(seed, options);
    fixture.controller.randomizePlatforms();
    fixture.controller.randomizeHazards();
    return captureLayout(seed, fixture);
}

function hashGeneratedLayout(layout) {
    const generatedState = { platforms: layout.platforms, spike: layout.spike };
    return crypto.createHash("sha256").update(JSON.stringify(generatedState)).digest("hex").slice(0, 16);
}

function observeVariableBranches(seed, options = {}) {
    const fixture = createBaseline(seed, options);
    const { controller, platforms, randomValues, spike } = fixture;
    const originalPickPlatform1 = controller.pickPlatform1CenterX;
    let platform1RandomCalls = null;

    controller.pickPlatform1CenterX = function observePlatform1(...args) {
        const before = randomValues.length;
        const result = originalPickPlatform1.apply(this, args);
        platform1RandomCalls = randomValues.length - before;
        return result;
    };

    controller.randomizePlatforms();
    const firstMovingIndex = Math.floor(randomValues[0] * platforms.length);
    const secondMovingIndex = Math.floor(randomValues[1] * platforms.length);
    const movingSetRedraw = firstMovingIndex === secondMovingIndex;
    const hazardCallsBefore = randomValues.length;
    controller.randomizeHazards();
    const hazardRandomCalls = randomValues.length - hazardCallsBefore;

    return {
        movingSetRedraw,
        platform1Fallback: platform1RandomCalls === 0,
        hazardEmptyCandidates: hazardRandomCalls === 0 && spike.visible === false,
    };
}

const observedHashes = new Set();
let snapshotLayout = null;

for (const seed of REPLAY_SEEDS) {
    const runA = generateLayout(seed);
    const runB = generateLayout(seed);
    let replayResult = "PASS";

    try {
        assert.deepStrictEqual(runB, runA, `seed ${seed} produced different layouts`);
    } catch (error) {
        replayResult = "FAIL";
        console.log(`[l4-generation] seed: ${seed}`);
        console.log(`[l4-generation] run A vs run B: ${replayResult}`);
        throw error;
    }

    const hash = hashGeneratedLayout(runA);
    observedHashes.add(hash);
    if (seed === SNAPSHOT_SEED) snapshotLayout = runA;
    console.log(`[l4-generation] seed: ${seed}`);
    console.log(`[l4-generation] run A vs run B: ${replayResult}`);
    console.log(`[l4-generation] snapshot hash: ${hash}`);
}

const expected = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, "utf8"));
assert.deepStrictEqual(snapshotLayout, expected, "generated layout does not match the stable snapshot");
console.log(`[l4-generation] stable snapshot seed ${SNAPSHOT_SEED}: PASS`);
console.log("[l4-generation] all same-seed replay checks: PASS");
console.log(`[l4-generation] distinct layouts observed: ${observedHashes.size} / ${REPLAY_SEEDS.length}`);

let movingRedrawSeed = null;
let platform1FallbackSeed = null;
let hazardEmptySeed = null;

for (let seed = 0; seed <= SEARCH_MAX_SEED; seed++) {
    const observed = observeVariableBranches(seed);
    if (movingRedrawSeed === null && observed.movingSetRedraw) movingRedrawSeed = seed;
    if (platform1FallbackSeed === null && observed.platform1Fallback) platform1FallbackSeed = seed;
    if (hazardEmptySeed === null && observed.hazardEmptyCandidates) hazardEmptySeed = seed;
}

console.log(`[l4-branches] production Scene fixture search: 0..${SEARCH_MAX_SEED}`);
console.log(`[l4-branches] moving Set redraw: ${movingRedrawSeed === null ? "NOT OBSERVED" : `PASS (seed ${movingRedrawSeed})`}`);
console.log(`[l4-branches] Platform_1 ranges.length === 0: ${platform1FallbackSeed === null ? "NOT OBSERVED" : `PASS (seed ${platform1FallbackSeed})`}`);
console.log(`[l4-branches] hazard candidates.length === 0: ${hazardEmptySeed === null ? "NOT OBSERVED" : `PASS (seed ${hazardEmptySeed})`}`);

if (platform1FallbackSeed === null) {
    const dedicatedFallback = observeVariableBranches(0, {
        startX: 667,
        platformWidth: 100,
        leftWallX: 600,
        rightWallX: 734,
    });
    assert.equal(dedicatedFallback.platform1Fallback, true, "dedicated narrow-playfield fixture did not reach Platform_1 fallback");
    console.log("[l4-branches] Platform_1 fallback dedicated narrow-playfield fixture: PASS (seed 0)");
}

if (hazardEmptySeed === null) {
    const dedicatedEmptyHazard = observeVariableBranches(0, { platformWidth: 20 });
    assert.equal(dedicatedEmptyHazard.hazardEmptyCandidates, true, "dedicated narrow-platform fixture did not produce empty hazard candidates");
    console.log("[l4-branches] empty hazard dedicated narrow-platform fixture: PASS (seed 0)");
}
