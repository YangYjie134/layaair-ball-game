const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const SCENE_PATH = path.join(ROOT, "assets", "Scene.ls");
const SNAPSHOT_PATH = path.join(__dirname, "l4-layout.seed-1278501273.snapshot.json");

/**
 * @typedef {Object} NormalizedPlatform
 * @property {string} id
 * @property {string} name
 * @property {number} order
 * @property {number} x
 * @property {number} y
 * @property {number} width
 * @property {number} height
 * @property {boolean} visible
 * @property {boolean} moving
 * @property {boolean} disappear
 */

/**
 * @typedef {Object} NormalizedHazard
 * @property {string} id
 * @property {"spike"} type
 * @property {boolean} visible
 * @property {number} x
 * @property {number} y
 * @property {number} width
 * @property {number} height
 */

/**
 * @typedef {Object} NormalizedL4Layout
 * @property {number|string} seed
 * @property {NormalizedPlatform[]} platforms
 * @property {NormalizedHazard[]} hazards
 */

/**
 * @typedef {Object} AffectedJumpRecord
 * @property {string} hazardId
 * @property {string} hostId
 * @property {string} sourceId
 * @property {string} targetId
 * @property {"left"|"right"} spikeSide
 * @property {"takeoff"|"landing"} affectedRole
 * @property {number} sourceOrder
 * @property {number} targetOrder
 */

class C1ValidationError extends Error {
    constructor(code, message, context = {}) {
        super(`${code}: ${message}`);
        this.name = "C1ValidationError";
        this.code = code;
        this.context = context;
    }
}

function fail(code, message, context = {}) {
    throw new C1ValidationError(code, message, context);
}

function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOwn(value, key) {
    return Object.prototype.hasOwnProperty.call(value, key);
}

function requireNonEmptyString(value, field, context = {}) {
    if (typeof value !== "string" || value.length === 0) {
        fail("INVALID_GEOMETRY", `${field} must be a non-empty string`, { ...context, field, value });
    }
    return value;
}

function requireFiniteNumber(value, field, context = {}) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
        fail("INVALID_GEOMETRY", `${field} must be a finite number`, { ...context, field, value: String(value) });
    }
    return value;
}

function requirePositiveNumber(value, field, context = {}) {
    const number = requireFiniteNumber(value, field, context);
    if (number <= 0) {
        fail("INVALID_GEOMETRY", `${field} must be greater than zero`, { ...context, field, value: number });
    }
    return number;
}

function requireBoolean(value, field, context = {}) {
    if (typeof value !== "boolean") {
        fail("INVALID_GEOMETRY", `${field} must be a boolean`, { ...context, field, value });
    }
    return value;
}

function parseJsonDocument(input, code, label) {
    if (typeof input !== "string") {
        if (!isObject(input)) fail(code, `${label} must be JSON text or an object`, { inputType: typeof input });
        return input;
    }

    try {
        return JSON.parse(input);
    } catch (error) {
        fail(code, `${label} is not valid JSON`, { cause: error.message });
    }
}

/**
 * Build a unique name-to-node index from a Laya scene document.
 * Geometry is kept as serialized data until normalization requests a node.
 */
function parseSceneGeometry(sceneInput) {
    const scene = parseJsonDocument(sceneInput, "INVALID_SCENE_JSON", "Scene document");
    const nodesByName = Object.create(null);

    function visit(node, pathParts) {
        if (!isObject(node)) {
            fail("INVALID_SCENE_NODE", "Scene child must be an object", { scenePath: pathParts.join("/") });
        }

        const name = node.name;
        const nextPath = typeof name === "string" && name.length > 0
            ? [...pathParts, name]
            : pathParts;

        if (typeof name === "string" && name.length > 0) {
            if (hasOwn(nodesByName, name)) {
                fail("DUPLICATE_SCENE_NODE", `Scene node name ${name} is duplicated`, {
                    nodeName: name,
                    scenePath: nextPath.join("/"),
                });
            }
            nodesByName[name] = node;
        }

        const children = node._$child;
        if (children !== undefined && !Array.isArray(children)) {
            fail("INVALID_SCENE_NODE", "_$child must be an array when present", {
                nodeName: typeof name === "string" ? name : null,
                scenePath: nextPath.join("/"),
            });
        }
        for (const child of children ?? []) visit(child, nextPath);
    }

    visit(scene, []);
    return {
        nodesByName,
        resolvedNames: Object.keys(nodesByName).sort((a, b) => a.localeCompare(b)),
    };
}

function requireSceneNode(sceneGeometry, name) {
    if (!isObject(sceneGeometry) || !isObject(sceneGeometry.nodesByName)) {
        fail("INVALID_SCENE_GEOMETRY", "Parsed Scene geometry is required", { nodeName: name });
    }
    if (!hasOwn(sceneGeometry.nodesByName, name)) {
        fail("MISSING_SCENE_NODE", `Scene node ${name} is missing`, { nodeName: name });
    }
    return sceneGeometry.nodesByName[name];
}

function readScenePosition(node, field, nodeName) {
    if (!hasOwn(node, field)) {
        // Laya scene serialization omits zero-valued positions. This explicit
        // serialized-zero rule is limited to x/y and is never used for sizes.
        return 0;
    }
    return requireFiniteNumber(node[field], field, { nodeName, source: "Scene" });
}

function readSceneSize(node, field, nodeName) {
    if (!hasOwn(node, field)) {
        fail("INVALID_GEOMETRY", `Scene node ${nodeName} is missing ${field}`, {
            nodeName,
            field,
            source: "Scene",
        });
    }
    return requirePositiveNumber(node[field], field, { nodeName, source: "Scene" });
}

function readSceneVisibility(node, nodeName) {
    if (!hasOwn(node, "visible")) return true;
    return requireBoolean(node.visible, "visible", { nodeName, source: "Scene" });
}

function parseProgressionOrder(name) {
    const match = /^Platform_([1-9]\d*)$/.exec(name);
    if (!match) {
        fail("INVALID_PROGRESSION_ORDER", `Snapshot platform ${name} does not have a canonical Platform_N name`, {
            platformName: name,
        });
    }
    const order = Number(match[1]);
    if (!Number.isSafeInteger(order)) {
        fail("INVALID_PROGRESSION_ORDER", `Snapshot platform ${name} has an unsafe progression number`, {
            platformName: name,
        });
    }
    return order;
}

/**
 * Combine Stage A positions with static Scene sizes using exact node names.
 * @returns {NormalizedL4Layout}
 */
function normalizeLayout(snapshotInput, sceneGeometry) {
    const snapshot = parseJsonDocument(snapshotInput, "INVALID_SNAPSHOT_JSON", "Stage A snapshot");
    if (!Array.isArray(snapshot.platforms)) {
        fail("INVALID_SNAPSHOT", "Snapshot platforms must be an array");
    }
    if (!isObject(snapshot.spike)) {
        fail("INVALID_SNAPSHOT", "Snapshot spike data is missing");
    }
    if (!((typeof snapshot.seed === "number" && Number.isFinite(snapshot.seed)) || typeof snapshot.seed === "string")) {
        fail("INVALID_SNAPSHOT", "Snapshot seed must be a finite number or string", { seed: snapshot.seed });
    }

    const groundNode = requireSceneNode(sceneGeometry, "Ground");
    const platforms = [{
        id: "Ground",
        name: "Ground",
        order: 0,
        x: readScenePosition(groundNode, "x", "Ground"),
        y: readScenePosition(groundNode, "y", "Ground"),
        width: readSceneSize(groundNode, "width", "Ground"),
        height: readSceneSize(groundNode, "height", "Ground"),
        visible: readSceneVisibility(groundNode, "Ground"),
        moving: false,
        disappear: false,
    }];

    const snapshotNames = new Set();
    for (const entry of snapshot.platforms) {
        if (!isObject(entry)) fail("INVALID_SNAPSHOT", "Snapshot platform entry must be an object");
        const name = requireNonEmptyString(entry.name, "name", { source: "snapshot platform" });
        if (snapshotNames.has(name)) {
            fail("DUPLICATE_PLATFORM_NAME", `Snapshot platform name ${name} is duplicated`, { platformName: name });
        }
        snapshotNames.add(name);

        const sceneNode = requireSceneNode(sceneGeometry, name);
        const order = parseProgressionOrder(name);
        const moving = entry.moving === null
            ? false
            : isObject(entry.moving)
                ? true
                : fail("INVALID_DYNAMIC_FLAG", `Snapshot platform ${name} has invalid moving data`, { platformName: name });

        platforms.push({
            id: name,
            name,
            order,
            x: requireFiniteNumber(entry.x, "x", { platformName: name, source: "snapshot" }),
            y: requireFiniteNumber(entry.y, "y", { platformName: name, source: "snapshot" }),
            width: readSceneSize(sceneNode, "width", name),
            height: readSceneSize(sceneNode, "height", name),
            visible: hasOwn(entry, "visible")
                ? requireBoolean(entry.visible, "visible", { platformName: name, source: "snapshot" })
                : readSceneVisibility(sceneNode, name),
            moving,
            disappear: requireBoolean(entry.disappear, "disappear", { platformName: name, source: "snapshot" }),
        });
    }

    platforms.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
    const spike = snapshot.spike;
    const normalized = {
        seed: snapshot.seed,
        platforms,
        hazards: [{
            id: "hazard:spike:0",
            type: "spike",
            visible: requireBoolean(spike.visible, "visible", { hazardId: "hazard:spike:0", source: "snapshot" }),
            x: requireFiniteNumber(spike.x, "x", { hazardId: "hazard:spike:0", source: "snapshot" }),
            y: requireFiniteNumber(spike.y, "y", { hazardId: "hazard:spike:0", source: "snapshot" }),
            width: requirePositiveNumber(spike.width, "width", { hazardId: "hazard:spike:0", source: "snapshot" }),
            height: requirePositiveNumber(spike.height, "height", { hazardId: "hazard:spike:0", source: "snapshot" }),
        }],
    };

    validateNormalizedLayout(normalized);
    return normalized;
}

function orderedProgression(layout) {
    return [...layout.platforms].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}

function resolveHazardPlacement(layout, hazard) {
    const hazardRight = hazard.x + hazard.width;
    const hazardBottom = hazard.y + hazard.height;
    const candidates = layout.platforms.filter((platform) => {
        const platformRight = platform.x + platform.width;
        return hazardBottom === platform.y
            && hazard.x >= platform.x
            && hazardRight <= platformRight;
    });

    if (candidates.length === 0) {
        fail("MISSING_HOST", `Visible hazard ${hazard.id} has no exact host`, {
            hazardId: hazard.id,
            hazardGeometry: { x: hazard.x, y: hazard.y, width: hazard.width, height: hazard.height },
        });
    }
    if (candidates.length > 1) {
        fail("AMBIGUOUS_HOST", `Visible hazard ${hazard.id} matches multiple hosts`, {
            hazardId: hazard.id,
            hostIds: candidates.map((platform) => platform.id).sort((a, b) => a.localeCompare(b)),
        });
    }

    const host = candidates[0];
    if (host.order === 0 || host.name === "Ground") {
        fail("INVALID_HAZARD_HOST", `Visible hazard ${hazard.id} cannot use Ground as its host`, {
            hazardId: hazard.id,
            hostId: host.id,
        });
    }
    if (host.moving || host.disappear) {
        fail("INVALID_DYNAMIC_HOST", `Visible hazard ${hazard.id} uses a moving or disappearing host`, {
            hazardId: hazard.id,
            hostId: host.id,
            moving: host.moving,
            disappear: host.disappear,
        });
    }

    const hostRight = host.x + host.width;
    const leftAligned = hazard.x === host.x;
    const rightAligned = hazardRight === hostRight;
    if (leftAligned === rightAligned) {
        fail("AMBIGUOUS_SPIKE_SIDE", `Visible hazard ${hazard.id} does not align with exactly one host edge`, {
            hazardId: hazard.id,
            hostId: host.id,
            leftAligned,
            rightAligned,
        });
    }

    return { host, side: leftAligned ? "left" : "right" };
}

/**
 * Validate normalized structure and every visible hazard placement.
 * Returns the same object after validation; it does not normalize or mutate.
 * @param {NormalizedL4Layout} layout
 * @returns {NormalizedL4Layout}
 */
function validateNormalizedLayout(layout) {
    if (!isObject(layout)) fail("INVALID_LAYOUT", "Normalized layout must be an object");
    if (!((typeof layout.seed === "number" && Number.isFinite(layout.seed)) || typeof layout.seed === "string")) {
        fail("INVALID_LAYOUT", "Normalized seed must be a finite number or string", { seed: layout.seed });
    }
    if (!Array.isArray(layout.platforms) || !Array.isArray(layout.hazards)) {
        fail("INVALID_LAYOUT", "Normalized layout requires platform and hazard arrays");
    }

    const platformIds = new Set();
    const platformNames = new Set();
    const platformOrders = new Set();
    for (const platform of layout.platforms) {
        if (!isObject(platform)) fail("INVALID_LAYOUT", "Platform entry must be an object");
        const id = requireNonEmptyString(platform.id, "id", { entity: "platform" });
        const name = requireNonEmptyString(platform.name, "name", { platformId: id });
        if (platformIds.has(id)) fail("DUPLICATE_PLATFORM_ID", `Platform id ${id} is duplicated`, { platformId: id });
        if (platformNames.has(name)) fail("DUPLICATE_PLATFORM_NAME", `Platform name ${name} is duplicated`, { platformName: name });
        if (!Number.isSafeInteger(platform.order) || platform.order < 0) {
            fail("INVALID_PROGRESSION_ORDER", `Platform ${id} has invalid order`, { platformId: id, order: platform.order });
        }
        if (platformOrders.has(platform.order)) {
            fail("DUPLICATE_PROGRESSION_ORDER", `Progression order ${platform.order} is duplicated`, {
                platformId: id,
                order: platform.order,
            });
        }

        requireFiniteNumber(platform.x, "x", { platformId: id });
        requireFiniteNumber(platform.y, "y", { platformId: id });
        requirePositiveNumber(platform.width, "width", { platformId: id });
        requirePositiveNumber(platform.height, "height", { platformId: id });
        requireBoolean(platform.visible, "visible", { platformId: id });
        requireBoolean(platform.moving, "moving", { platformId: id });
        requireBoolean(platform.disappear, "disappear", { platformId: id });

        platformIds.add(id);
        platformNames.add(name);
        platformOrders.add(platform.order);
    }

    const progression = orderedProgression(layout);
    if (progression.length < 2) {
        fail("INVALID_PROGRESSION_ORDER", "Progression requires Ground and at least Platform_1");
    }
    if (progression[0].name !== "Ground" || progression[0].order !== 0) {
        fail("INVALID_PROGRESSION_ORDER", "Progression must start with Ground at order 0", {
            firstId: progression[0]?.id ?? null,
            firstName: progression[0]?.name ?? null,
            firstOrder: progression[0]?.order ?? null,
        });
    }
    for (let order = 1; order < progression.length; order++) {
        const expectedName = `Platform_${order}`;
        const platform = progression[order];
        if (platform.order !== order || platform.name !== expectedName) {
            fail("INVALID_PROGRESSION_ORDER", `Progression requires ${expectedName} at order ${order}`, {
                expectedName,
                expectedOrder: order,
                actualId: platform.id,
                actualName: platform.name,
                actualOrder: platform.order,
            });
        }
    }

    const hazardIds = new Set();
    for (const hazard of layout.hazards) {
        if (!isObject(hazard)) fail("INVALID_LAYOUT", "Hazard entry must be an object");
        const id = requireNonEmptyString(hazard.id, "id", { entity: "hazard" });
        if (hazardIds.has(id)) fail("DUPLICATE_HAZARD_ID", `Hazard id ${id} is duplicated`, { hazardId: id });
        if (hazard.type !== "spike") {
            fail("INVALID_HAZARD_TYPE", `Hazard ${id} must have type spike`, { hazardId: id, type: hazard.type });
        }
        requireBoolean(hazard.visible, "visible", { hazardId: id });
        requireFiniteNumber(hazard.x, "x", { hazardId: id });
        requireFiniteNumber(hazard.y, "y", { hazardId: id });
        requirePositiveNumber(hazard.width, "width", { hazardId: id });
        requirePositiveNumber(hazard.height, "height", { hazardId: id });
        hazardIds.add(id);
    }

    for (const hazard of layout.hazards) {
        if (hazard.visible) resolveHazardPlacement(layout, hazard);
    }
    return layout;
}

function horizontalSide(host, neighbor) {
    const hostCenter = host.x + host.width / 2;
    const neighborCenter = neighbor.x + neighbor.width / 2;
    if (neighborCenter < hostCenter) return "left";
    if (neighborCenter > hostCenter) return "right";
    return null;
}

function recordKey(record) {
    return [
        record.hazardId,
        record.hostId,
        record.sourceId,
        record.targetId,
        record.spikeSide,
        record.affectedRole,
        record.sourceOrder,
        record.targetOrder,
    ].join("\u0000");
}

function sortAndDedupeRecords(records) {
    const byKey = new Map();
    for (const record of records) byKey.set(recordKey(record), record);
    return [...byKey.values()].sort((a, b) => (
        a.sourceOrder - b.sourceOrder
        || a.targetOrder - b.targetOrder
        || a.affectedRole.localeCompare(b.affectedRole)
        || a.hazardId.localeCompare(b.hazardId)
        || a.hostId.localeCompare(b.hostId)
    ));
}

/**
 * Identify directed progression-adjacent jumps affected by visible spikes.
 * Structural validation is repeated at the boundary so invalid data never
 * degrades into a silent empty result.
 * @param {NormalizedL4Layout} normalizedLayout
 * @returns {AffectedJumpRecord[]}
 */
function identifyAffectedJumps(normalizedLayout) {
    validateNormalizedLayout(normalizedLayout);
    const progression = orderedProgression(normalizedLayout);
    const platformIndex = new Map(progression.map((platform, index) => [platform.id, index]));
    const records = [];
    const hazards = [...normalizedLayout.hazards].sort((a, b) => a.id.localeCompare(b.id));

    for (const hazard of hazards) {
        if (!hazard.visible) continue;
        const { host, side } = resolveHazardPlacement(normalizedLayout, hazard);
        const hostIndex = platformIndex.get(host.id);
        if (!Number.isInteger(hostIndex)) {
            fail("MISSING_HOST", `Host ${host.id} is absent from progression`, {
                hazardId: hazard.id,
                hostId: host.id,
            });
        }

        const previous = hostIndex > 0 ? progression[hostIndex - 1] : null;
        const next = hostIndex < progression.length - 1 ? progression[hostIndex + 1] : null;

        if (previous && horizontalSide(host, previous) === side) {
            records.push({
                hazardId: hazard.id,
                hostId: host.id,
                sourceId: previous.id,
                targetId: host.id,
                spikeSide: side,
                affectedRole: "landing",
                sourceOrder: previous.order,
                targetOrder: host.order,
            });
        }
        if (next && horizontalSide(host, next) === side) {
            records.push({
                hazardId: hazard.id,
                hostId: host.id,
                sourceId: host.id,
                targetId: next.id,
                spikeSide: side,
                affectedRole: "takeoff",
                sourceOrder: host.order,
                targetOrder: next.order,
            });
        }
    }

    return sortAndDedupeRecords(records);
}

function syntheticPlatform(name, order, x, y, width = 137, height = 11) {
    return {
        id: name,
        name,
        order,
        x,
        y,
        width,
        height,
        visible: true,
        moving: false,
        disappear: false,
    };
}

function syntheticProgression(xs = [91, 317, 543]) {
    return [
        syntheticPlatform("Ground", 0, -43, 607, 887, 37),
        syntheticPlatform("Platform_1", 1, xs[0], 493, 131, 9),
        syntheticPlatform("Platform_2", 2, xs[1], 371, 149, 13),
        syntheticPlatform("Platform_3", 3, xs[2], 257, 127, 15),
    ];
}

function syntheticSpike(host, side, id = "hazard:test", visible = true) {
    const width = 31;
    const height = 17;
    return {
        id,
        type: "spike",
        visible,
        x: side === "left" ? host.x : host.x + host.width - width,
        y: host.y - height,
        width,
        height,
    };
}

function syntheticLayout(platforms, hazards, seed = "synthetic") {
    return { seed, platforms, hazards };
}

function expectedRecord(hazard, host, source, target, side, role) {
    return {
        hazardId: hazard.id,
        hostId: host.id,
        sourceId: source.id,
        targetId: target.id,
        spikeSide: side,
        affectedRole: role,
        sourceOrder: source.order,
        targetOrder: target.order,
    };
}

function verifyRecordCase(name, layout, expected) {
    const actual = identifyAffectedJumps(layout);
    assert.deepStrictEqual(actual, expected, `${name}: directed records changed`);
    console.log(`[c1-synthetic] ${name}: PASS (${actual.length} records)`);
    return actual;
}

function runSyntheticVerification() {
    let assertions = 0;

    {
        const scene = parseSceneGeometry({
            name: "SyntheticScene",
            _$child: [
                { name: "Ground", y: 701, width: 923, height: 41 },
                { name: "Platform_1", x: 17, y: 19, width: 143, height: 7 },
                { name: "Platform_2", x: 23, y: 29, width: 157, height: 9 },
            ],
        });
        const normalized = normalizeLayout({
            seed: "normalization",
            platforms: [
                { name: "Platform_2", x: 503, y: 277, moving: null, disappear: false },
                { name: "Platform_1", x: 211, y: 419, moving: null, disappear: false },
            ],
            spike: { visible: false, x: 211, y: 402, width: 31, height: 17 },
        }, scene);
        assert.deepStrictEqual(normalized.platforms.map((platform) => platform.name), [
            "Ground",
            "Platform_1",
            "Platform_2",
        ]);
        assert.deepStrictEqual(normalized.platforms.map((platform) => platform.order), [0, 1, 2]);
        assert.equal(normalized.platforms[1].x, 211, "snapshot x must win during normalization");
        assert.equal(normalized.platforms[1].y, 419, "snapshot y must win during normalization");
        assert.equal(normalized.platforms[1].width, 143, "Scene width must win during normalization");
        assert.equal(normalized.platforms[1].height, 7, "Scene height must win during normalization");
        console.log("[c1-synthetic] in-memory-normalization: PASS");
        assertions++;
    }
    {
        const platforms = syntheticProgression();
        const hazard = syntheticSpike(platforms[2], "left", "hazard:hidden", false);
        verifyRecordCase("hidden-spike", syntheticLayout(platforms, [hazard]), []);
        assertions++;
    }
    {
        const platforms = syntheticProgression([83, 331, 577]);
        const host = platforms[2];
        const hazard = syntheticSpike(host, "left", "hazard:left-landing");
        verifyRecordCase("left-landing-middle", syntheticLayout(platforms, [hazard]), [
            expectedRecord(hazard, host, platforms[1], host, "left", "landing"),
        ]);
        assertions++;
    }
    {
        const platforms = syntheticProgression([579, 331, 79]);
        const host = platforms[2];
        const hazard = syntheticSpike(host, "right", "hazard:right-landing");
        verifyRecordCase("right-landing-middle", syntheticLayout(platforms, [hazard]), [
            expectedRecord(hazard, host, platforms[1], host, "right", "landing"),
        ]);
        assertions++;
    }
    {
        const platforms = syntheticProgression([579, 331, 79]);
        const host = platforms[2];
        const hazard = syntheticSpike(host, "left", "hazard:left-takeoff");
        verifyRecordCase("left-takeoff-middle", syntheticLayout(platforms, [hazard]), [
            expectedRecord(hazard, host, host, platforms[3], "left", "takeoff"),
        ]);
        assertions++;
    }
    {
        const platforms = syntheticProgression([79, 331, 579]);
        const host = platforms[2];
        const hazard = syntheticSpike(host, "right", "hazard:right-takeoff");
        verifyRecordCase("right-takeoff-middle", syntheticLayout(platforms, [hazard]), [
            expectedRecord(hazard, host, host, platforms[3], "right", "takeoff"),
        ]);
        assertions++;
    }
    let twoRecordLayout;
    let twoRecordExpected;
    {
        const platforms = syntheticProgression([77, 339, 101]);
        const host = platforms[2];
        const hazard = syntheticSpike(host, "left", "hazard:both");
        twoRecordLayout = syntheticLayout(platforms, [hazard]);
        twoRecordExpected = [
            expectedRecord(hazard, host, platforms[1], host, "left", "landing"),
            expectedRecord(hazard, host, host, platforms[3], "left", "takeoff"),
        ];
        verifyRecordCase("incoming-and-outgoing", twoRecordLayout, twoRecordExpected);
        assertions++;
    }
    {
        const platforms = syntheticProgression([307, 89, 601]);
        platforms[0].x = 523;
        platforms[0].width = 97;
        const host = platforms[1];
        const hazard = syntheticSpike(host, "right", "hazard:first-host");
        verifyRecordCase("first-host-ground-incoming", syntheticLayout(platforms, [hazard]), [
            expectedRecord(hazard, host, platforms[0], host, "right", "landing"),
        ]);
        assertions++;
    }
    {
        const platforms = syntheticProgression([71, 301, 557]);
        const host = platforms[3];
        const hazard = syntheticSpike(host, "left", "hazard:last-host");
        verifyRecordCase("last-host-no-outgoing", syntheticLayout(platforms, [hazard]), [
            expectedRecord(hazard, host, platforms[2], host, "left", "landing"),
        ]);
        assertions++;
    }
    {
        const platforms = syntheticProgression([581, 327, 73]);
        const host = platforms[2];
        const hazard = syntheticSpike(host, "right", "hazard:interleaved");
        verifyRecordCase("interleaved-horizontal-order", syntheticLayout(platforms, [hazard]), [
            expectedRecord(hazard, host, platforms[1], host, "right", "landing"),
        ]);
        assertions++;
    }
    {
        const runA = identifyAffectedJumps(twoRecordLayout);
        const runB = identifyAffectedJumps(twoRecordLayout);
        assert.deepStrictEqual(runB, runA, "same normalized input must be deterministic");
        assert.equal(JSON.stringify(runB), JSON.stringify(runA), "serialized record order must be deterministic");
        console.log("[c1-synthetic] deterministic-repeat: PASS");
        assertions++;
    }
    {
        const duplicated = [twoRecordExpected[0], { ...twoRecordExpected[0] }];
        const deduped = sortAndDedupeRecords(duplicated);
        assert.deepStrictEqual(deduped, [twoRecordExpected[0]], "duplicate logical records must collapse");
        const uniqueKeys = new Set(identifyAffectedJumps(twoRecordLayout).map(recordKey));
        assert.equal(uniqueKeys.size, twoRecordExpected.length, "core result contains duplicate records");
        console.log("[c1-synthetic] duplicate-path-deduplication: PASS");
        assertions++;
    }

    return { assertions };
}

function expectValidationCode(name, expectedCode, callback) {
    assert.throws(callback, (error) => {
        assert.ok(error instanceof C1ValidationError, `${name}: expected a C1ValidationError`);
        assert.equal(error.code, expectedCode, `${name}: validation code changed`);
        assert.ok(error.message.includes(expectedCode), `${name}: error message must include its code`);
        return true;
    });
    console.log(`[c1-invalid] ${name}: PASS (${expectedCode})`);
}

function baseInvalidLayout(side = "left") {
    const platforms = syntheticProgression([87, 329, 571]);
    return syntheticLayout(platforms, [syntheticSpike(platforms[2], side, "hazard:invalid")], "invalid");
}

function runInvalidVerification() {
    const cases = [];

    cases.push(["missing-host", "MISSING_HOST", () => {
        const layout = baseInvalidLayout();
        layout.hazards[0].y -= 3;
        identifyAffectedJumps(layout);
    }]);
    cases.push(["ambiguous-host", "AMBIGUOUS_HOST", () => {
        const layout = baseInvalidLayout();
        Object.assign(layout.platforms[1], {
            x: layout.platforms[2].x,
            y: layout.platforms[2].y,
            width: layout.platforms[2].width,
        });
        identifyAffectedJumps(layout);
    }]);
    cases.push(["duplicate-platform-id", "DUPLICATE_PLATFORM_ID", () => {
        const layout = baseInvalidLayout();
        layout.platforms[2].id = layout.platforms[1].id;
        identifyAffectedJumps(layout);
    }]);
    cases.push(["duplicate-platform-name", "DUPLICATE_PLATFORM_NAME", () => {
        const layout = baseInvalidLayout();
        layout.platforms[2].name = layout.platforms[1].name;
        identifyAffectedJumps(layout);
    }]);
    cases.push(["duplicate-order", "DUPLICATE_PROGRESSION_ORDER", () => {
        const layout = baseInvalidLayout();
        layout.platforms[2].order = layout.platforms[1].order;
        identifyAffectedJumps(layout);
    }]);
    cases.push(["missing-geometry", "INVALID_GEOMETRY", () => {
        const layout = baseInvalidLayout();
        delete layout.platforms[2].width;
        identifyAffectedJumps(layout);
    }]);
    cases.push(["non-finite-geometry", "INVALID_GEOMETRY", () => {
        const layout = baseInvalidLayout();
        layout.platforms[2].x = Number.POSITIVE_INFINITY;
        identifyAffectedJumps(layout);
    }]);
    cases.push(["ambiguous-side", "AMBIGUOUS_SPIKE_SIDE", () => {
        const layout = baseInvalidLayout();
        const host = layout.platforms[2];
        layout.hazards[0].x = host.x + 19;
        identifyAffectedJumps(layout);
    }]);
    cases.push(["INVALID_HAZARD_HOST / Ground-as-host", "INVALID_HAZARD_HOST", () => {
        const platforms = syntheticProgression();
        const ground = platforms[0];
        const hazard = syntheticSpike(ground, "left", "hazard:ground-host");
        const layout = syntheticLayout(platforms, [hazard], "invalid-ground-host");
        try {
            identifyAffectedJumps(layout);
        } catch (error) {
            assert.ok(error instanceof C1ValidationError, "Ground-as-host: expected a C1ValidationError");
            assert.equal(error.code, "INVALID_HAZARD_HOST", "Ground-as-host: validation code changed");
            assert.ok(error.message.includes("Ground"), "Ground-as-host: error message must identify Ground");
            assert.equal(error.context.hazardId, hazard.id, "Ground-as-host: context must identify the hazard");
            assert.equal(error.context.hostId, ground.id, "Ground-as-host: context must identify Ground");
            throw error;
        }
    }]);
    cases.push(["moving-host", "INVALID_DYNAMIC_HOST", () => {
        const layout = baseInvalidLayout();
        layout.platforms[2].moving = true;
        identifyAffectedJumps(layout);
    }]);
    cases.push(["disappear-host", "INVALID_DYNAMIC_HOST", () => {
        const layout = baseInvalidLayout();
        layout.platforms[2].disappear = true;
        identifyAffectedJumps(layout);
    }]);
    cases.push(["missing-progression-neighbor", "INVALID_PROGRESSION_ORDER", () => {
        const layout = baseInvalidLayout();
        layout.platforms = layout.platforms.filter((platform) => platform.name !== "Platform_2");
        layout.hazards = [];
        identifyAffectedJumps(layout);
    }]);
    cases.push(["duplicate-hazard-id", "DUPLICATE_HAZARD_ID", () => {
        const layout = baseInvalidLayout();
        layout.hazards.push({ ...layout.hazards[0] });
        identifyAffectedJumps(layout);
    }]);
    cases.push(["missing-scene-node", "MISSING_SCENE_NODE", () => {
        const scene = parseSceneGeometry({
            name: "SyntheticScene",
            _$child: [
                { name: "Ground", y: 603, width: 887, height: 37 },
                { name: "Platform_1", x: 101, y: 481, width: 131, height: 9 },
            ],
        });
        normalizeLayout({
            seed: "missing-scene-node",
            platforms: [
                { name: "Platform_1", x: 101, y: 481, moving: null, disappear: false },
                { name: "Platform_2", x: 331, y: 367, moving: null, disappear: false },
            ],
            spike: { visible: false, x: 101, y: 464, width: 31, height: 17 },
        }, scene);
    }]);
    cases.push(["duplicate-scene-name", "DUPLICATE_SCENE_NODE", () => {
        parseSceneGeometry({
            name: "SyntheticScene",
            _$child: [
                { name: "Platform_1" },
                { name: "Platform_1" },
            ],
        });
    }]);

    for (const [name, code, callback] of cases) expectValidationCode(name, code, callback);
    return { assertions: cases.length };
}

function runRealSnapshotSmoke() {
    const sceneText = fs.readFileSync(SCENE_PATH, "utf8");
    const snapshotText = fs.readFileSync(SNAPSHOT_PATH, "utf8");
    const sceneGeometry = parseSceneGeometry(sceneText);
    const snapshot = JSON.parse(snapshotText);
    const normalized = normalizeLayout(snapshot, sceneGeometry);
    const records = identifyAffectedJumps(normalized);
    const visibleHazards = normalized.hazards.filter((hazard) => hazard.visible);
    assert.equal(visibleHazards.length, 1, "regression smoke expects one visible hazard");

    const placement = resolveHazardPlacement(normalized, visibleHazards[0]);
    assert.equal(placement.host.id, "Platform_4", "regression smoke host changed");
    assert.equal(placement.side, "right", "regression smoke side changed");
    assert.deepStrictEqual(records, [], "regression smoke directed records changed");

    const requiredSceneNames = [
        "Ball",
        "Ground",
        ...snapshot.platforms.map((platform) => platform.name),
    ];
    for (const name of requiredSceneNames) requireSceneNode(sceneGeometry, name);
    const snapshotHash = crypto.createHash("sha256").update(snapshotText).digest("hex");
    const snapshotIdentity = path.relative(ROOT, SNAPSHOT_PATH).split(path.sep).join("/");

    console.log(`[c1-smoke] seed: ${String(normalized.seed)}`);
    console.log(`[c1-smoke] snapshot: ${snapshotIdentity}`);
    console.log(`[c1-smoke] snapshot sha256: ${snapshotHash}`);
    console.log(`[c1-smoke] Scene nodes resolved: ${requiredSceneNames.join(", ")}`);
    console.log(`[c1-smoke] visible hazard: ${visibleHazards[0].id}`);
    console.log(`[c1-smoke] host: ${placement.host.id}`);
    console.log(`[c1-smoke] side: ${placement.side}`);
    console.log(`[c1-smoke] affected records: ${JSON.stringify(records)}`);
    console.log("[c1-smoke] regression assertion scope: current Stage A snapshot only");

    return {
        seed: normalized.seed,
        snapshotIdentity,
        snapshotHash,
        sceneNodesResolved: requiredSceneNames,
        visibleHazardId: visibleHazards[0].id,
        hostId: placement.host.id,
        side: placement.side,
        records,
    };
}

function runVerification() {
    console.log("[c1] mode: verify");
    const synthetic = runSyntheticVerification();
    const invalid = runInvalidVerification();
    const smoke = runRealSnapshotSmoke();
    console.log(`[c1] synthetic assertions: ${synthetic.assertions}`);
    console.log(`[c1] invalid assertions: ${invalid.assertions}`);
    console.log(`[c1] smoke records: ${smoke.records.length}`);
    console.log("[c1] files written: 0");
    console.log("[c1] verification: PASS");
}

module.exports = {
    C1ValidationError,
    parseSceneGeometry,
    normalizeLayout,
    validateNormalizedLayout,
    identifyAffectedJumps,
};

if (require.main === module) {
    try {
        if (process.argv.length !== 3 || process.argv[2] !== "--verify") {
            fail("INVALID_CLI_USAGE", "Usage: node tools/l4-affected-jumps.cjs --verify");
        }
        runVerification();
    } catch (error) {
        if (error instanceof C1ValidationError) {
            console.error(`[c1] INVALID ${error.code}: ${error.message}`);
            console.error(`[c1] context: ${JSON.stringify(error.context)}`);
        } else {
            console.error(`[c1] verification failed: ${error.stack || error.message || String(error)}`);
        }
        process.exitCode = 1;
    }
}
