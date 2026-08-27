const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const {
    C2InvalidUnmodeledError,
    INPUT_READ_ORDER,
    RECORD_FIELDS,
    createSeedFixture,
    deriveAffectedRecords,
    makeInvalidResult,
    runFixedActionSmoke,
    validateInvalidResult,
    validateSingleFrameAction,
} = require("./l4-step-harness.cjs");

const EXPECTED_SPIKE_RECORDS = Object.freeze([
    Object.freeze({
        hazardId: "hazard:spike:0",
        hostId: "Platform_3",
        sourceId: "Platform_2",
        targetId: "Platform_3",
        spikeSide: "left",
        affectedRole: "landing",
        sourceOrder: 2,
        targetOrder: 3,
    }),
    Object.freeze({
        hazardId: "hazard:spike:0",
        hostId: "Platform_3",
        sourceId: "Platform_3",
        targetId: "Platform_4",
        spikeSide: "left",
        affectedRole: "takeoff",
        sourceOrder: 3,
        targetOrder: 4,
    }),
]);
const EXPECTED_SPIKE_RECORD = EXPECTED_SPIKE_RECORDS[0];
const EXPECTED_SPIKE_GEOMETRY = Object.freeze({
    source: { x: 739, y: 491, width: 200, height: 1 },
    target: { x: 838, y: 389, width: 200, height: 1 },
    hazard: { x: 838, y: 381, width: 90, height: 8 },
});
const EXPECTED_GROUND_RECORDS = Object.freeze([
    Object.freeze({
        hazardId: "hazard:spike:0",
        hostId: "Platform_4",
        sourceId: "Platform_3",
        targetId: "Platform_4",
        spikeSide: "left",
        affectedRole: "landing",
        sourceOrder: 3,
        targetOrder: 4,
    }),
    Object.freeze({
        hazardId: "hazard:spike:0",
        hostId: "Platform_4",
        sourceId: "Platform_4",
        targetId: "Platform_5",
        spikeSide: "left",
        affectedRole: "takeoff",
        sourceOrder: 4,
        targetOrder: 5,
    }),
]);
const EXPECTED_GROUND_RECORD = EXPECTED_GROUND_RECORDS[1];
const EXPECTED_GROUND_GEOMETRY = Object.freeze({
    source: { x: 783, y: 271, width: 200, height: 1 },
    target: { x: 483, y: 133, width: 200, height: 1 },
    hazard: { x: 783, y: 263, width: 90, height: 8 },
});
const FIXED_ACTION_PLAN = Object.freeze({
    directionRule: "relative-platform-centers",
    settleFrames: 1,
    horizonFrames: 120,
});
const SHORT_ACTION_PLAN = Object.freeze({
    directionRule: "relative-platform-centers",
    settleFrames: 1,
    horizonFrames: 1,
});
const EXPECTED_ACTION_PLAN_JSON = "{\"directionRule\":\"relative-platform-centers\",\"settleFrames\":1,\"horizonFrames\":120}";
const EXPECTED_ACTION_PLAN_HASH = "96b732c738e48ba09d5d074dea40a270bbe52910ca1ccfe9eaa39cdc7f2ad641";
const EXPECTED_SHORT_ACTION_PLAN_JSON = "{\"directionRule\":\"relative-platform-centers\",\"settleFrames\":1,\"horizonFrames\":1}";
const EXPECTED_SHORT_ACTION_PLAN_HASH = "f9ec33297f1563eb1322c1932e1482807870d3144e12ec80ce895bf5cf11cffc";
const EXPECTED_V3_TIMING = Object.freeze({
    logicalRespawnMs: 300,
    worldMaterializationMs: 2100,
    coreReassemblyMs: 2550,
    completionMs: 3000,
});
const V3_LIFECYCLE_UPDATE_OFFSETS = Object.freeze([
    299,
    EXPECTED_V3_TIMING.logicalRespawnMs,
    301,
    2099,
    EXPECTED_V3_TIMING.worldMaterializationMs,
    2101,
    EXPECTED_V3_TIMING.coreReassemblyMs,
    2999,
    EXPECTED_V3_TIMING.completionMs,
    3001,
]);
const ORDINARY_GAMEPLAY_METHODS = Object.freeze([
    "updateMovingPlatform",
    "resolveVerticalCollision",
    "syncDisappearHighlightBar",
    "checkHazards",
    "releaseGroundIfUnsupported",
    "clampToCanvas",
    "checkDeath",
]);
const FATAL_FRAME_FORBIDDEN_METHODS = Object.freeze([
    ...ORDINARY_GAMEPLAY_METHODS,
    "restartGame",
    "handleDeath",
    "respawn",
    "randomizePlatforms",
    "randomizeHazards",
    "syncBallSprite",
]);
const FAIRNESS_HELPER_NAMES = Object.freeze([
    "isSpikePlacementFair",
    "isAffectedJumpFair",
    "estimateJumpReachBySimulation",
    "getWorstCaseRequiredX",
    "getBestCaseRequiredX",
    "getPlatformSafeCenterInterval",
    "getCenterIntervalGap",
    "isNeighborOnSide",
]);
const EXPECTED_SPIKE_DIAGNOSTICS = Object.freeze({
    apex: { y: 387, frame: 9 },
    ballCenterX: {
        min: { value: 839, frame: 0 },
        max: { value: 868.6, frame: 9 },
    },
    targetXBeforeTermination: {
        min: { value: 838, frame: 0 },
        max: { value: 838, frame: 0 },
    },
    horizontalOverlap: {
        frameCount: 10,
        firstFrame: 0,
        lastFrame: 9,
        ever: true,
    },
    minimumHorizontalGap: { value: 0, frame: 0 },
});
const EXPECTED_GROUND_DIAGNOSTICS = Object.freeze({
    apex: { y: 90.5, frame: 26 },
    ballCenterX: {
        min: { value: 518.4, frame: 76 },
        max: { value: 883, frame: 0 },
    },
    targetXBeforeTermination: {
        min: { value: 366, frame: 77 },
        max: { value: 481.5, frame: 0 },
    },
    horizontalOverlap: {
        frameCount: 17,
        firstFrame: 61,
        lastFrame: 77,
        ever: true,
    },
    minimumHorizontalGap: { value: 0, frame: 61 },
});

function verifyInvalidSchema() {
    const details = {
        code: "INVALID_OPPOSING_DIRECTIONS",
        firstInvalidField: "action.left",
        frame: 0,
        phase: "setup",
        message: "Simultaneous left and right input is invalid, not neutral",
        context: {
            seed: 1,
            hazardId: EXPECTED_SPIKE_RECORD.hazardId,
            sourceId: EXPECTED_SPIKE_RECORD.sourceId,
            targetId: EXPECTED_SPIKE_RECORD.targetId,
        },
    };
    const first = makeInvalidResult(details);
    const second = makeInvalidResult(details);
    assert.deepStrictEqual(second, first, "same invalid condition must produce the same machine result");
    assert.equal(validateInvalidResult(first), true);
    assert.throws(
        () => validateSingleFrameAction(
            { left: true, right: true, jumpDown: false, restartDown: false },
            details.context,
            0,
            "setup",
        ),
        (error) => {
            assert.ok(error instanceof C2InvalidUnmodeledError);
            assert.deepStrictEqual(error.result, first);
            return true;
        },
    );
    return { stableCase: first };
}

function countDirectFairnessHelperCalls() {
    const sources = [
        {
            fileLabel: "tools/l4-step-harness.cjs",
            source: fs.readFileSync(path.join(__dirname, "l4-step-harness.cjs"), "utf8"),
        },
        {
            fileLabel: "tools/verify-l4-step-harness.cjs",
            source: fs.readFileSync(__filename, "utf8"),
        },
    ];
    const hits = [];
    const countsByFile = new Map(sources.map(({ fileLabel }) => [fileLabel, 0]));
    for (const { fileLabel, source } of sources) {
        for (const helper of FAIRNESS_HELPER_NAMES) {
            const count = (source.match(new RegExp(`\\.${helper}\\s*\\(`, "g")) ?? []).length;
            countsByFile.set(fileLabel, countsByFile.get(fileLabel) + count);
            if (count > 0) hits.push({ fileLabel, helper, count });
        }
    }
    const harnessDirectCalls = countsByFile.get("tools/l4-step-harness.cjs");
    const verifierDirectCalls = countsByFile.get("tools/verify-l4-step-harness.cjs");
    const result = {
        harnessDirectCalls,
        verifierDirectCalls,
        totalDirectCalls: harnessDirectCalls + verifierDirectCalls,
        hits,
    };
    assert.deepStrictEqual(result, {
        harnessDirectCalls: 0,
        verifierDirectCalls: 0,
        totalDirectCalls: 0,
        hits: [],
    }, "direct production fairness-helper call audit failed");
    return result;
}

function enumerateHarnessStopReasons() {
    const harnessPath = path.join(__dirname, "l4-step-harness.cjs");
    const lines = fs.readFileSync(harnessPath, "utf8").split(/\r?\n/);
    const expected = [
        {
            literal: "horizon",
            anchor: "let stopReason = \"horizon\";",
            triggerCondition: "default before the fixed action loop exhausts horizonFrames",
        },
        {
            literal: "target-identity-landing",
            anchor: "stopReason = \"target-identity-landing\";",
            triggerCondition: "post-step target object identity matches while onGround is true",
        },
        {
            literal: "death-observer",
            anchor: "stopReason = \"death-observer\";",
            triggerCondition: "the production step reports a death observer event",
        },
        {
            literal: "non-target-landing",
            anchor: "stopReason = \"non-target-landing\";",
            triggerCondition: "post-step landing is on a non-target platform object",
        },
    ];
    const emittedAssignments = [];
    for (let index = 0; index < lines.length; index++) {
        const match = /^(?:let\s+)?stopReason\s*=\s*"([^"]+)";$/.exec(lines[index].trim());
        if (match) emittedAssignments.push({ literal: match[1], line: index + 1 });
    }
    assert.equal(emittedAssignments.length, expected.length, "harness stopReason assignment count changed");
    const result = expected.map(({ literal, anchor, triggerCondition }) => {
        const matches = lines
            .map((line, index) => ({ text: line.trim(), line: index + 1 }))
            .filter((candidate) => candidate.text === anchor);
        assert.equal(matches.length, 1, `harness stopReason anchor changed for ${literal}`);
        return {
            literal,
            function: "runFixedActionSmoke",
            line: matches[0].line,
            triggerCondition,
        };
    });
    assert.deepStrictEqual(
        emittedAssignments,
        result.map(({ literal, line }) => ({ literal, line })),
        "verifier stopReason inventory diverged from harness literals",
    );
    return result;
}

function sha256Json(value) {
    return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function compactGeometry(node) {
    return {
        x: node.x,
        y: node.y,
        width: node.width,
        height: node.height,
    };
}

function horizontalClearance(centerX, radius, hazard) {
    const ballLeft = centerX - radius;
    const ballRight = centerX + radius;
    const hazardLeft = hazard.x;
    const hazardRight = hazard.x + hazard.width;
    if (ballRight <= hazardLeft) return hazardLeft - ballRight;
    if (ballLeft >= hazardRight) return ballLeft - hazardRight;
    return 0;
}

function captureTrajectorySample(fixture, target, activeStep, observer) {
    const controller = fixture.controller;
    return {
        frame: activeStep.frame,
        phase: activeStep.phase,
        stepCallId: activeStep.stepCallId,
        observer,
        x: controller.centerX,
        y: controller.centerY,
        vx: controller.vx,
        vy: controller.vy,
        prevJumpKey: controller.prevJumpKey,
        onGround: controller.onGround,
        groundPlatform: controller.groundPlatform?.name ?? null,
        deathEnabled: controller.deathEnabled,
        scoreHasWon: fixture.scoreState.hasWon,
        targetX: target.x,
    };
}

function installTrajectoryObservers(fixture, target) {
    const samples = [];
    const preDeathSamples = [];
    const originalSyncBallSprite = fixture.controller.syncBallSprite;
    const originalHandleDeath = fixture.controller.handleDeath;

    // These verifier wrappers are installed first. The harness later installs its
    // outer runtime wrappers around them, so the effective chain is harness audit
    // wrapper -> verifier sample wrapper -> unchanged production method.
    fixture.controller.syncBallSprite = function observedSyncBallSprite(...args) {
        const result = originalSyncBallSprite.apply(this, args);
        const activeStep = fixture.runtime?.activeStep;
        const deathObserved = activeStep
            && fixture.runtime.deathEvents.length > 0
            && fixture.runtime.deathEvents.some((event) => event.stepCallId === activeStep.stepCallId);
        if (activeStep && !deathObserved) {
            samples.push(captureTrajectorySample(fixture, target, activeStep, "post-production-sync"));
        }
        return result;
    };

    fixture.controller.handleDeath = function observedHandleDeath(...args) {
        const activeStep = fixture.runtime?.activeStep;
        if (activeStep) {
            preDeathSamples.push(captureTrajectorySample(fixture, target, activeStep, "death-before-respawn"));
        }
        return originalHandleDeath.apply(this, args);
    };

    for (const method of ["startDeathReconstruction", "completeDeathReconstruction"]) {
        const original = fixture.controller[method];
        assert.equal(typeof original, "function", `production V3 method ${method} is unavailable`);
        fixture.controller[method] = function observedV3LifecycleMethod(...args) {
            const runtime = fixture.runtime;
            const startEvent = runtime?.record("v3-lifecycle-start", {
                method,
                phaseBefore: this.deathReconstructionPhase,
            }) ?? null;
            try {
                return original.apply(this, args);
            } finally {
                runtime?.record("v3-lifecycle-end", {
                    method,
                    startSequence: startEvent?.sequence ?? null,
                    phaseAfter: this.deathReconstructionPhase,
                });
            }
        };
    }

    return { samples, preDeathSamples };
}

function selectExtreme(samples, field, compare) {
    assert.ok(samples.length > 0, `cannot select ${field} from an empty sample set`);
    return samples.reduce((best, sample) => (
        compare(sample[field], best[field]) ? sample : best
    ));
}

function provenanceForFinalSample(finalSample) {
    if (finalSample.observer === "death-before-respawn") return "pre-respawn";
    if (finalSample.observer === "post-production-sync") return "post-step";
    assert.fail(`unsupported finalSample observer: ${finalSample.observer}`);
}

function buildTrajectoryDiagnostics(samples, targetWidth, radius) {
    assert.ok(samples.length > 0, "trajectory observer produced no samples");
    const rows = samples.map((sample) => {
        const ballLeft = sample.x - radius;
        const ballRight = sample.x + radius;
        const targetLeft = sample.targetX;
        const targetRight = sample.targetX + targetWidth;
        return {
            ...sample,
            horizontalOverlap: ballRight >= targetLeft && ballLeft <= targetRight,
            horizontalGap: Math.max(targetLeft - ballRight, ballLeft - targetRight, 0),
        };
    });
    const apex = selectExtreme(rows, "y", (value, best) => value < best);
    const minBallX = selectExtreme(rows, "x", (value, best) => value < best);
    const maxBallX = selectExtreme(rows, "x", (value, best) => value > best);
    const minTargetX = selectExtreme(rows, "targetX", (value, best) => value < best);
    const maxTargetX = selectExtreme(rows, "targetX", (value, best) => value > best);
    const overlaps = rows.filter((row) => row.horizontalOverlap);
    const minGap = selectExtreme(rows, "horizontalGap", (value, best) => value < best);
    return {
        apex: { y: apex.y, frame: apex.frame },
        ballCenterX: {
            min: { value: minBallX.x, frame: minBallX.frame },
            max: { value: maxBallX.x, frame: maxBallX.frame },
        },
        targetXBeforeTermination: {
            min: { value: minTargetX.targetX, frame: minTargetX.frame },
            max: { value: maxTargetX.targetX, frame: maxTargetX.frame },
        },
        horizontalOverlap: {
            frameCount: overlaps.length,
            firstFrame: overlaps[0]?.frame ?? null,
            lastFrame: overlaps[overlaps.length - 1]?.frame ?? null,
            ever: overlaps.length > 0,
        },
        minimumHorizontalGap: { value: minGap.horizontalGap, frame: minGap.frame },
    };
}

function assertModeledDeathCount(smoke, observers, label) {
    assert.ok(smoke.deathEvents.length <= 1, "INVALID_UNMODELED code=MULTIPLE_DEATHS");
    assert.equal(
        observers.preDeathSamples.length,
        smoke.deathEvents.length,
        `${label} preDeathSamples must match deathEvents`,
    );
}

function verifyMultipleDeathAssertionShape() {
    let caught = null;
    try {
        assertModeledDeathCount(
            { deathEvents: [{}, {}] },
            { preDeathSamples: [{}, {}] },
            "synthetic assertion probe",
        );
    } catch (error) {
        caught = error;
    }
    assert.ok(caught instanceof assert.AssertionError, "multiple-death guard must fail as an assertion");
    assert.equal(caught.message, "INVALID_UNMODELED code=MULTIPLE_DEATHS");
    assert.equal(caught.message.includes(["INVALID_UNMODELED", "MULTIPLE_DEATHS"].join("_")), false);
    return {
        mechanism: "assertion failure",
        statusFamily: "INVALID_UNMODELED",
        code: "MULTIPLE_DEATHS",
        message: caught.message,
    };
}

function buildRuntimeDeathEvidence(fixture, deathEvent, preDeathSample) {
    if (deathEvent === null) {
        assert.equal(preDeathSample, null, "zero-death trial unexpectedly has a pre-respawn sample");
        return null;
    }
    assert.ok(preDeathSample, "death event is missing its pre-respawn sample");
    assert.equal(preDeathSample.stepCallId, deathEvent.stepCallId,
        "death event and pre-respawn sample came from different production steps");
    assert.equal(preDeathSample.observer, "death-before-respawn");
    assert.equal(deathEvent.beforeRespawn, true, "death observer did not run before respawn");
    const events = fixture.runtime.events;
    const sameStep = (event) => event.stepCallId === deathEvent.stepCallId;
    const stepStart = events.find((event) => sameStep(event) && event.type === "step-start");
    const groundResolution = events.filter((event) => (
        sameStep(event)
        && event.type === "method-start"
        && event.method === "resolveVerticalCollision"
        && event.platform === "Ground"
        && event.sequence < deathEvent.sequence
    )).pop();
    const winGuard = events.filter((event) => (
        sameStep(event)
        && event.type === "score-call"
        && event.method === "isWon"
        && event.sequence > groundResolution?.sequence
        && event.sequence < deathEvent.sequence
    )).pop();
    const handleDeathStart = events.find((event) => (
        sameStep(event)
        && event.type === "method-start"
        && event.method === "handleDeath"
        && event.sequence < deathEvent.sequence
    ));
    const reconstructionStart = events.find((event) => (
        sameStep(event)
        && event.type === "v3-lifecycle-start"
        && event.method === "startDeathReconstruction"
        && event.sequence > deathEvent.sequence
    ));
    const reconstructionEnd = events.find((event) => (
        sameStep(event)
        && event.type === "v3-lifecycle-end"
        && event.method === "startDeathReconstruction"
        && event.startSequence === reconstructionStart?.sequence
    ));
    const handleDeathEnd = events.find((event) => (
        sameStep(event)
        && event.type === "method-end"
        && event.method === "handleDeath"
        && event.sequence > deathEvent.sequence
    ));
    const stepEnd = events.find((event) => sameStep(event) && event.type === "step-end");
    assert.ok(stepStart && handleDeathStart && reconstructionStart && reconstructionEnd && handleDeathEnd && stepEnd,
        "same-frame death containment bracket is incomplete");
    assert.ok(
        stepStart.sequence < handleDeathStart.sequence
        && handleDeathStart.sequence < deathEvent.sequence
        && deathEvent.sequence < reconstructionStart.sequence
        && reconstructionStart.sequence < reconstructionEnd.sequence
        && reconstructionEnd.sequence < handleDeathEnd.sequence
        && handleDeathEnd.sequence < stepEnd.sequence,
        "same-frame death containment order changed",
    );
    const handleDeathStarts = events.filter((event) => (
        sameStep(event)
        && event.type === "method-start"
        && event.method === "handleDeath"
    ));
    const reconstructionStarts = events.filter((event) => (
        sameStep(event)
        && event.type === "v3-lifecycle-start"
        && event.method === "startDeathReconstruction"
    ));
    assert.equal(handleDeathStarts.length, 1, "fatal frame re-entered handleDeath");
    assert.equal(reconstructionStarts.length, 1, "fatal frame started V3 reconstruction more than once");
    const forbiddenStartsAfterFatal = events.filter((event) => (
        sameStep(event)
        && event.type === "method-start"
        && event.sequence > deathEvent.sequence
        && event.sequence < stepEnd.sequence
        && FATAL_FRAME_FORBIDDEN_METHODS.includes(event.method)
    ));
    assert.deepStrictEqual(forbiddenStartsAfterFatal, [],
        "ordinary gameplay or lifecycle work escaped after the fatal event");
    assert.equal(fixture.controller.deathReconstructionPhase, "DECONSTRUCTING");
    assert.equal(fixture.controller.deathLogicalRespawnDone, false);
    assert.equal(fixture.controller.deathWorldGenerationDone, false);
    assert.equal(
        fixture.controller.deathReconstructionUntilMs - fixture.controller.deathReconstructionStartedAt,
        EXPECTED_V3_TIMING.completionMs,
    );
    const commonBracket = {
        stepCallId: deathEvent.stepCallId,
        stepStartSequence: stepStart.sequence,
        handleDeathStartSequence: handleDeathStart.sequence,
        deathObserverSequence: deathEvent.sequence,
        reconstructionStartSequence: reconstructionStart.sequence,
        reconstructionEndSequence: reconstructionEnd.sequence,
        handleDeathEndSequence: handleDeathEnd.sequence,
        stepEndSequence: stepEnd.sequence,
        beforeRespawn: deathEvent.beforeRespawn,
        respawnInFatalFrame: false,
        platformRerollInFatalFrame: false,
        hazardRerollInFatalFrame: false,
        ordinaryMethodStartsAfterFatal: [],
        orderValid: true,
    };
    const runtimeGroundState = preDeathSample.groundPlatform === "Ground"
        && preDeathSample.deathEnabled === true
        && preDeathSample.scoreHasWon === false;
    const orderedGroundChain = Boolean(
        groundResolution
        && winGuard
        && winGuard.value === false
        && stepStart.sequence < groundResolution.sequence
        && groundResolution.sequence < winGuard.sequence
        && winGuard.sequence < handleDeathStart.sequence,
    );
    if (!runtimeGroundState || !orderedGroundChain) {
        const spikeCheckStart = events.filter((event) => (
            sameStep(event)
            && event.type === "method-start"
            && event.method === "checkHazards"
            && event.sequence < handleDeathStart.sequence
        )).pop();
        const spikeCheckEnd = events.find((event) => (
            sameStep(event)
            && event.type === "method-end"
            && event.method === "checkHazards"
            && event.sequence > handleDeathEnd.sequence
        ));
        assert.ok(spikeCheckStart && spikeCheckEnd,
            "non-Ground death is not bracketed by the production spike check");
        return {
            kind: "spike",
            bracket: commonBracket,
            spikeSource: {
                checkHazardsStartSequence: spikeCheckStart.sequence,
                checkHazardsEndSequence: spikeCheckEnd.sequence,
                containsHandleDeath: spikeCheckStart.sequence < handleDeathStart.sequence
                    && handleDeathEnd.sequence < spikeCheckEnd.sequence,
            },
            nonCausalGroundObservation: groundResolution && winGuard
                ? {
                    resolveGroundSequence: groundResolution.sequence,
                    winGuardSequence: winGuard.sequence,
                    runtimeScoreIsWon: winGuard.value,
                }
                : null,
        };
    }
    return {
        kind: "ground",
        bracket: {
            stepCallId: commonBracket.stepCallId,
            stepStartSequence: commonBracket.stepStartSequence,
            resolveGroundSequence: groundResolution.sequence,
            winGuardSequence: winGuard.sequence,
            handleDeathStartSequence: commonBracket.handleDeathStartSequence,
            deathObserverSequence: commonBracket.deathObserverSequence,
            reconstructionStartSequence: commonBracket.reconstructionStartSequence,
            reconstructionEndSequence: commonBracket.reconstructionEndSequence,
            handleDeathEndSequence: commonBracket.handleDeathEndSequence,
            stepEndSequence: commonBracket.stepEndSequence,
            beforeRespawn: commonBracket.beforeRespawn,
            respawnInFatalFrame: commonBracket.respawnInFatalFrame,
            platformRerollInFatalFrame: commonBracket.platformRerollInFatalFrame,
            hazardRerollInFatalFrame: commonBracket.hazardRerollInFatalFrame,
            ordinaryMethodStartsAfterFatal: commonBracket.ordinaryMethodStartsAfterFatal,
            runtimeScoreIsWon: winGuard.value,
            orderValid: commonBracket.orderValid,
        },
    };
}

function captureV3LifecycleState(fixture) {
    const { controller, ball, runtime } = fixture;
    const methodCount = (method) => runtime.events.filter((event) => (
        event.type === "method-start" && event.method === method
    )).length;
    const lifecycleCount = (method) => runtime.events.filter((event) => (
        event.type === "v3-lifecycle-start" && event.method === method
    )).length;
    return {
        phase: controller.deathReconstructionPhase,
        locked: controller.deathReconstructionPhase !== "IDLE"
            && controller.deathReconstructionUntilMs > 0,
        counts: {
            handleDeath: methodCount("handleDeath"),
            reconstructionStart: lifecycleCount("startDeathReconstruction"),
            respawn: methodCount("respawn"),
            randomizePlatforms: methodCount("randomizePlatforms"),
            randomizeHazards: methodCount("randomizeHazards"),
            reconstructionComplete: lifecycleCount("completeDeathReconstruction"),
        },
        logicalState: {
            centerX: controller.centerX,
            centerY: controller.centerY,
            previousY: controller.previousY,
            vx: controller.vx,
            vy: controller.vy,
            onGround: controller.onGround,
            groundPlatform: controller.groundPlatform?.name ?? null,
            platformsActive: controller.platformsActive,
            deathEnabled: controller.deathEnabled,
            ballX: ball.x,
            ballY: ball.y,
        },
    };
}

function advanceV3LifecycleUpdate(fixture, startedAt, elapsedMs) {
    const { controller, runtime } = fixture;
    assert.equal(runtime.activeStep, null, "V3 lifecycle update overlapped a fixed-action step");
    const activeStep = {
        stepCallId: runtime.nextStepCallId++,
        frame: null,
        phase: "v3-lifecycle",
        timeMs: startedAt + elapsedMs,
        inputReads: [],
        timerReads: [],
    };
    runtime.activeStep = activeStep;
    global.Laya.timer.currTimer = activeStep.timeMs;
    const updateStart = runtime.record("v3-update-start", {
        elapsedMs,
        phaseBefore: controller.deathReconstructionPhase,
    });
    const originalConsoleLog = console.log;
    let completed = false;
    console.log = (...args) => runtime.record("console-log", { args: args.map((value) => String(value)) });
    try {
        assert.equal(controller.onUpdate, Object.getPrototypeOf(controller).onUpdate,
            "production onUpdate was replaced");
        controller.onUpdate();
        completed = true;
    } finally {
        console.log = originalConsoleLog;
        runtime.record("v3-update-end", {
            elapsedMs,
            completed,
            phaseAfter: controller.deathReconstructionPhase,
        });
        runtime.activeStep = null;
    }
    assert.equal(completed, true, `V3 lifecycle update failed at ${elapsedMs}ms`);
    const updateEvents = runtime.events.filter((event) => event.stepCallId === activeStep.stepCallId);
    return {
        elapsedMs,
        updateStartSequence: updateStart.sequence,
        updateEndSequence: updateEvents[updateEvents.length - 1].sequence,
        ordinaryGameplayMethodStarts: updateEvents
            .filter((event) => event.type === "method-start" && ORDINARY_GAMEPLAY_METHODS.includes(event.method))
            .map((event) => ({ method: event.method, sequence: event.sequence })),
        lifecycleMethodStarts: updateEvents
            .filter((event) => event.type === "method-start" || event.type === "v3-lifecycle-start")
            .map((event) => ({ method: event.method, sequence: event.sequence })),
        state: captureV3LifecycleState(fixture),
    };
}

function verifyPhasedV3Lifecycle(fixture, deathEvent, deathEvidence) {
    const { controller, runtime } = fixture;
    const productionTiming = {
        logicalRespawnMs: controller.constructor.DEATH_DECONSTRUCT_END_MS,
        worldMaterializationMs: controller.constructor.DEATH_WORLD_MATERIALIZE_START_MS,
        coreReassemblyMs: controller.constructor.DEATH_CORE_REASSEMBLY_START_MS,
        completionMs: controller.constructor.DEATH_RECONSTRUCTION_DURATION_MS,
    };
    assert.deepStrictEqual(productionTiming, EXPECTED_V3_TIMING, "production V3 timing constants changed");

    const fatalState = captureV3LifecycleState(fixture);
    assert.equal(fatalState.phase, "DECONSTRUCTING");
    assert.equal(fatalState.locked, true);
    assert.deepStrictEqual(fatalState.counts, {
        handleDeath: 1,
        reconstructionStart: 1,
        respawn: 0,
        randomizePlatforms: 0,
        randomizeHazards: 0,
        reconstructionComplete: 0,
    });

    const startedAt = controller.deathReconstructionStartedAt;
    const updates = V3_LIFECYCLE_UPDATE_OFFSETS.map((elapsedMs) => (
        advanceV3LifecycleUpdate(fixture, startedAt, elapsedMs)
    ));
    const at = (elapsedMs) => {
        const update = updates.find((candidate) => candidate.elapsedMs === elapsedMs);
        assert.ok(update, `missing V3 lifecycle update at ${elapsedMs}ms`);
        return update;
    };
    const beforeRespawn = at(299);
    const respawnBoundary = at(EXPECTED_V3_TIMING.logicalRespawnMs);
    const bufferAfterRespawn = at(301);
    const beforeWorld = at(2099);
    const worldBoundary = at(EXPECTED_V3_TIMING.worldMaterializationMs);
    const worldAfterBoundary = at(2101);
    const coreBoundary = at(EXPECTED_V3_TIMING.coreReassemblyMs);
    const beforeCompletion = at(2999);
    const completionBoundary = at(EXPECTED_V3_TIMING.completionMs);
    const afterCompletion = at(3001);

    assert.deepStrictEqual(beforeRespawn.state.counts, fatalState.counts,
        "lifecycle action occurred before the 300ms threshold");
    assert.equal(respawnBoundary.state.counts.respawn, 1);
    assert.equal(respawnBoundary.state.phase, "BUFFERING");
    assert.equal(respawnBoundary.state.locked, true);
    assert.deepStrictEqual(respawnBoundary.state.logicalState, {
        centerX: controller.startX,
        centerY: controller.startY,
        previousY: controller.startY,
        vx: 0,
        vy: 0,
        onGround: false,
        groundPlatform: null,
        platformsActive: false,
        deathEnabled: false,
        ballX: controller.startX,
        ballY: controller.startY,
    });
    for (const update of [respawnBoundary, bufferAfterRespawn, beforeWorld]) {
        assert.equal(update.state.counts.respawn, 1, "logical respawn repeated during the Buffer");
        assert.equal(update.state.counts.randomizePlatforms, 0, "platform reroll occurred before 2100ms");
        assert.equal(update.state.counts.randomizeHazards, 0, "hazard reroll occurred before 2100ms");
    }

    assert.equal(worldBoundary.state.counts.respawn, 1);
    assert.equal(worldBoundary.state.counts.randomizePlatforms, 1);
    assert.equal(worldBoundary.state.counts.randomizeHazards, 1);
    const platformReroll = runtime.events.find((event) => (
        event.type === "method-start" && event.method === "randomizePlatforms"
    ));
    const hazardReroll = runtime.events.find((event) => (
        event.type === "method-start" && event.method === "randomizeHazards"
    ));
    assert.ok(platformReroll && hazardReroll && platformReroll.sequence < hazardReroll.sequence,
        "V3 world-generation order changed");
    for (const update of [worldAfterBoundary, coreBoundary, beforeCompletion]) {
        assert.deepStrictEqual(update.state.counts, worldBoundary.state.counts,
            "V3 lifecycle action repeated before reconstruction completion");
    }
    assert.equal(coreBoundary.state.phase, "CORE_REASSEMBLING");

    for (const update of updates.filter((candidate) => candidate.elapsedMs < EXPECTED_V3_TIMING.completionMs)) {
        assert.equal(update.state.locked, true, `gameplay unlocked early at ${update.elapsedMs}ms`);
        assert.deepStrictEqual(update.ordinaryGameplayMethodStarts, [],
            `ordinary gameplay escaped the reconstruction lock at ${update.elapsedMs}ms`);
    }
    assert.equal(completionBoundary.state.phase, "IDLE");
    assert.equal(completionBoundary.state.locked, false);
    assert.ok(completionBoundary.ordinaryGameplayMethodStarts.length > 0,
        "normal gameplay did not resume on the first eligible completion update");
    assert.deepStrictEqual(completionBoundary.state.counts, {
        handleDeath: 1,
        reconstructionStart: 1,
        respawn: 1,
        randomizePlatforms: 1,
        randomizeHazards: 1,
        reconstructionComplete: 1,
    });
    assert.deepStrictEqual(afterCompletion.state.counts, completionBoundary.state.counts,
        "V3 lifecycle action repeated after completion");
    assert.equal(afterCompletion.state.phase, "IDLE");

    const reconstructionStart = runtime.events.find((event) => (
        event.type === "v3-lifecycle-start" && event.method === "startDeathReconstruction"
    ));
    const respawn = runtime.events.find((event) => event.type === "method-start" && event.method === "respawn");
    const completion = runtime.events.find((event) => (
        event.type === "v3-lifecycle-start" && event.method === "completeDeathReconstruction"
    ));
    assert.ok(
        deathEvent.sequence < reconstructionStart.sequence
        && reconstructionStart.sequence < respawn.sequence
        && respawn.sequence < platformReroll.sequence
        && platformReroll.sequence < hazardReroll.sequence
        && hazardReroll.sequence < completion.sequence
        && completion.sequence < completionBoundary.updateEndSequence,
        "phased V3 lifecycle event order changed",
    );
    assert.equal(deathEvidence.bracket.respawnInFatalFrame, false);

    return {
        timingMs: productionTiming,
        firstEligibleUpdates: {
            respawn: respawnBoundary.elapsedMs,
            worldGeneration: worldBoundary.elapsedMs,
            completion: completionBoundary.elapsedMs,
        },
        fatal: {
            state: fatalState,
            deathObserverSequence: deathEvent.sequence,
            reconstructionStartSequence: reconstructionStart.sequence,
            sameFrameContainment: deathEvidence.bracket,
        },
        beforeRespawn,
        respawnBoundary,
        bufferBeforeWorld: beforeWorld,
        worldBoundary,
        coreBoundary,
        beforeCompletion,
        completionBoundary,
        afterCompletion,
        eventOrder: {
            death: deathEvent.sequence,
            reconstructionStart: reconstructionStart.sequence,
            respawn: respawn.sequence,
            randomizePlatforms: platformReroll.sequence,
            randomizeHazards: hazardReroll.sequence,
            reconstructionComplete: completion.sequence,
            gameplayUnlocked: completionBoundary.updateEndSequence,
        },
    };
}

function runCase(seed, recordIndex, actionPlan, expectedPlanJson, expectedPlanHash, stopReasonAudit) {
    const label = `seed ${seed} record ${recordIndex} horizon ${actionPlan.horizonFrames}`;
    const planBefore = {
        content: JSON.stringify(actionPlan),
        hash: sha256Json(actionPlan),
    };
    assert.equal(planBefore.content, expectedPlanJson);
    assert.equal(planBefore.hash, expectedPlanHash);

    const fixture = createSeedFixture(seed);
    const records = deriveAffectedRecords(fixture);
    assert.ok(recordIndex >= 0 && recordIndex < records.length, `seed ${seed} recordIndex ${recordIndex} is unavailable`);
    const record = records[recordIndex];
    const source = fixture.gamePlatforms.find((platform) => platform.name === record.sourceId);
    const target = fixture.gamePlatforms.find((platform) => platform.name === record.targetId);
    assert.ok(source && target, `seed ${seed} record objects are unavailable`);
    const initialGeometry = {
        source: compactGeometry(source),
        target: compactGeometry(target),
        hazard: compactGeometry(fixture.spike),
    };
    const observers = installTrajectoryObservers(fixture, target);
    const smoke = runFixedActionSmoke(fixture, record, actionPlan);

    const planAfter = {
        content: JSON.stringify(actionPlan),
        hash: sha256Json(actionPlan),
    };
    assert.deepStrictEqual(planAfter, planBefore, `${label} polluted its shared action plan`);
    assert.equal(planAfter.hash, expectedPlanHash);

    assertModeledDeathCount(smoke, observers, label);
    const deathCount = smoke.deathEvents.length;
    const deathEvent = smoke.deathEvents[0] ?? null;
    const preDeathSample = observers.preDeathSamples[0] ?? null;
    const trajectorySamples = [...observers.samples, ...observers.preDeathSamples]
        .sort((left, right) => left.stepCallId - right.stepCallId);
    assert.equal(trajectorySamples.length, smoke.stepPhysicsCallCount,
        `${label} must have one trajectory observation per production step`);
    assert.equal(new Set(trajectorySamples.map((sample) => sample.stepCallId)).size, smoke.stepPhysicsCallCount,
        `${label} trajectory stepCallId values are not unique`);
    const settleSample = trajectorySamples.find((sample) => sample.frame === 0);
    const firstActionSample = trajectorySamples.find((sample) => sample.frame === 1);
    const finalSample = trajectorySamples[trajectorySamples.length - 1];
    assert.ok(settleSample && firstActionSample && finalSample);

    const postStepIdentityEvents = fixture.runtime.events.filter((event) => event.type === "post-step-landing");
    assert.equal(postStepIdentityEvents.length, smoke.stepPhysicsCallCount,
        `${label} post-step identity observation count changed`);
    assert.ok(postStepIdentityEvents.length > 0, `${label} has no post-step identity observations`);
    const targetUpdateEvents = fixture.runtime.events.filter((event) => (
        event.type === "method-start"
        && event.method === "updateMovingPlatform"
        && event.platform === target.name
    ));
    const deathEvidence = buildRuntimeDeathEvidence(fixture, deathEvent, preDeathSample);
    const lifecycleEvidence = deathCount === 1
        ? verifyPhasedV3Lifecycle(fixture, deathEvent, deathEvidence)
        : null;
    const deathContainment = deathCount === 1 ? true : "NOT_APPLICABLE";
    const phasedLifecycle = deathCount === 1 ? true : "NOT_APPLICABLE";
    const stopReason = smoke.trajectorySummary.stopReason;
    assert.ok(stopReasonAudit.length > 0, "harness stopReason inventory is empty");
    assert.equal(
        stopReasonAudit.some((entry) => entry.literal === stopReason),
        true,
        `${label} consumed a stopReason not emitted by the harness`,
    );
    const diagnostics = buildTrajectoryDiagnostics(trajectorySamples, initialGeometry.target.width, smoke.startState.radius);
    const report = {
        seed,
        recordIndex,
        record: { ...record },
        initialGeometry,
        start: {
            x: smoke.startState.x,
            y: smoke.startState.y,
            radius: smoke.startState.radius,
            horizontalSpikeClearance: horizontalClearance(
                smoke.startState.x,
                smoke.startState.radius,
                initialGeometry.hazard,
            ),
        },
        actionPlan: {
            definition: { ...actionPlan },
            hash: planAfter.hash,
            resolvedDirection: smoke.actionPlan.resolvedDirection,
            unchangedBeforeAfter: true,
        },
        termination: {
            reason: stopReason,
            deathCount,
        },
        stepAndTimerCounts: {
            framesRun: smoke.framesRun,
            settleFramesRun: smoke.settleFramesRun,
            actionFramesRun: smoke.actionFramesRun,
            stepPhysicsCalls: smoke.stepPhysicsCallCount,
            timerReads: smoke.timerReadCount,
            identityEvaluations: postStepIdentityEvents.length,
            identityEverMatched: postStepIdentityEvents.some((event) => event.targetIdentityMatch),
        },
        movingTargetObservations: {
            initialX: initialGeometry.target.x,
            settleX: settleSample.targetX,
            firstActionX: firstActionSample.targetX,
            finalObservedX: finalSample.targetX,
            preDeathFinalObservedX: preDeathSample?.targetX ?? null,
            targetUpdateCalls: targetUpdateEvents.length,
        },
        death: {
            count: deathCount,
            settleDeath: deathCount > 0 && smoke.deathEvents.some((event) => event.frame === 0),
            firstActionDeath: deathCount > 0 && smoke.deathEvents.some((event) => event.frame === 1),
            events: smoke.deathEvents,
            primary: deathEvent,
            bracket: deathEvidence?.bracket ?? null,
        },
        deathEvidence,
        phasedV3Lifecycle: lifecycleEvidence,
        preRespawn: deathEvent?.beforeState ?? null,
        finalBall: {
            provenance: provenanceForFinalSample(finalSample),
            x: finalSample.x,
            y: finalSample.y,
            vx: finalSample.vx,
            vy: finalSample.vy,
            onGround: finalSample.onGround,
            groundPlatform: finalSample.groundPlatform,
            prevJumpKey: finalSample.prevJumpKey,
        },
        classification: smoke.status,
        trajectoryDiagnostics: diagnostics,
        runtimeAudit: {
            stepBracketsValid: smoke.runtimeAudit.stepBracketsValid,
            postStepLandingOnly: smoke.runtimeAudit.postStepLandingOnly,
            sameFrameDeathContainment: deathContainment,
            phasedV3Lifecycle: phasedLifecycle,
            legacySameFrameRespawnAudit: {
                value: smoke.runtimeAudit.deathEventsBracketedBeforeRespawn,
                authoritative: false,
                supersededBy: "runtimeAudit.phasedV3Lifecycle",
            },
            firstStepSequence: smoke.runtimeAudit.firstStepSequence,
            lastStepEndSequence: smoke.runtimeAudit.lastStepEndSequence,
        },
        legacyProductionFairnessHelperDirectCalls: {
            value: smoke.productionFairnessHelperDirectCalls,
            authoritative: false,
            supersededBy: "boundaryCounts.helperGuard",
        },
        filesWritten: smoke.filesWritten,
    };

    return {
        fixture,
        controller: fixture.controller,
        ball: fixture.ball,
        source,
        target,
        records,
        record,
        smoke,
        planReference: actionPlan,
        planBefore,
        planAfter,
        preDeathSample,
        finalSample,
        lifecycleEvidence,
        report,
        reportHash: sha256Json(report),
    };
}

function assertCommonSmoke(caseRun) {
    const { fixture, record, report, smoke } = caseRun;
    assert.notEqual(smoke.status, "INVALID_UNMODELED", `normal fixed smoke became invalid: ${smoke.code ?? "unknown"}`);
    assert.strictEqual(smoke.record, record, "smoke must consume the C1 record object returned by this replay");
    assert.ok(smoke.stepPhysicsCallCount > 0, "production stepPhysics was not called");
    assert.equal(smoke.stepPhysicsCallCount, smoke.framesRun, "every reported frame must be one production step");
    assert.deepStrictEqual(smoke.inputReadOrder, [...INPUT_READ_ORDER]);
    assert.equal(smoke.runtimeAudit.stepBracketsValid, true, "step start/end brackets are incomplete");
    assert.equal(smoke.runtimeAudit.postStepLandingOnly, true, "landing observation escaped the post-step boundary");
    if (smoke.deathEvents.length === 0) {
        assert.equal(report.runtimeAudit.sameFrameDeathContainment, "NOT_APPLICABLE");
        assert.equal(report.runtimeAudit.phasedV3Lifecycle, "NOT_APPLICABLE");
        assert.equal(report.deathEvidence, null);
        assert.equal(report.phasedV3Lifecycle, null);
        assert.equal(report.death.primary, null);
        assert.equal(report.death.bracket, null);
        assert.equal(report.preRespawn, null);
    } else {
        assert.equal(smoke.deathEvents.length, 1);
        assert.equal(smoke.runtimeAudit.deathEventsBracketedBeforeRespawn, false,
            "legacy harness audit unexpectedly still found same-frame respawn");
        assert.equal(report.runtimeAudit.sameFrameDeathContainment, true);
        assert.equal(report.runtimeAudit.phasedV3Lifecycle, true);
        assert.ok(report.deathEvidence);
        assert.ok(report.phasedV3Lifecycle);
        assert.ok(report.death.primary);
        assert.ok(report.death.bracket);
        assert.ok(report.preRespawn);
    }
    assert.equal(Object.prototype.hasOwnProperty.call(report.runtimeAudit, "deathEventsBracketedBeforeRespawn"), false);
    assert.equal(new Set(smoke.runtimeAudit.stepCallIds).size, smoke.stepPhysicsCallCount, "stepCallId values are not unique");
    assert.equal(smoke.filesWritten, 0, "C2 verifier wrote files");
    assert.equal(smoke.productionFairnessHelperDirectCalls, 0);
    assert.deepStrictEqual(report.legacyProductionFairnessHelperDirectCalls, {
        value: 0,
        authoritative: false,
        supersededBy: "boundaryCounts.helperGuard",
    });
    assert.equal(Object.prototype.hasOwnProperty.call(report, "productionFairnessHelperDirectCalls"), false);
    assert.equal(smoke.startState.adapterPreconditions.platformsActive, true);
    assert.equal(smoke.startState.adapterPreconditions.deathEnabled, true);
    assert.equal(smoke.startState.settledAfterProductionStep.onGround, true);
    assert.equal(smoke.startState.settledAfterProductionStep.groundPlatformIdentityMatch, true);
    assert.equal(smoke.startState.settledAfterProductionStep.vy, 0);
    assert.equal(smoke.startState.settledAfterProductionStep.prevJumpKey, false);
    assert.equal(smoke.actionPlan.feedbackControl, false);
    assert.equal(smoke.actionPlan.jumpPressFrames, 1);
    assert.equal(smoke.actionPlan.jumpReleaseAfterPress, true);
    for (const field of RECORD_FIELDS) assert.equal(smoke.recordFieldUsage[field], true, `record field ${field} was not consumed`);
    if (smoke.status === "REACHABLE") {
        assert.equal(smoke.targetIdentityMatch, true, "reachable result lacks target object identity");
        assert.strictEqual(smoke.target, fixture.controller.groundPlatform);
    } else {
        assert.equal(smoke.status, "SEARCH_MISS", "fixed smoke returned an unsupported status");
    }
}

function assertSpikeLong(caseRun) {
    const { report, smoke } = caseRun;
    assert.equal(report.seed, 1);
    assert.equal(report.recordIndex, 0);
    assert.deepStrictEqual(caseRun.records, EXPECTED_SPIKE_RECORDS, "spike fixture affected records changed");
    assert.deepStrictEqual(report.record, EXPECTED_SPIKE_RECORD, "spike fixture selected record changed");
    assert.deepStrictEqual(report.initialGeometry, EXPECTED_SPIKE_GEOMETRY, "spike fixture geometry changed");
    assert.equal(smoke.stepPhysicsCallCount, 10);
    assert.equal(smoke.settleFramesRun, 1);
    assert.equal(smoke.actionFramesRun, 9);
    assert.equal(smoke.timerReadCount, 11);
    assert.deepStrictEqual(smoke.deathEvents, [{
        stepCallId: 10,
        frame: 9,
        phase: "flight",
        sequence: 444,
        beforeRespawn: true,
        beforeState: {
            x: 868.6,
            y: 387,
            vx: 5,
            vy: -9,
            onGround: false,
            groundPlatform: null,
        },
    }]);
    assert.deepStrictEqual(report.preRespawn, {
        x: 868.6,
        y: 387,
        vx: 5,
        vy: -9,
        onGround: false,
        groundPlatform: null,
    });
    assert.equal(smoke.finalGroundPlatform, null);
    assert.equal(smoke.targetIdentityMatch, false);
    assert.equal(report.classification, "SEARCH_MISS");
    assert.deepStrictEqual(report.termination, { reason: "death-observer", deathCount: 1 });
    assert.equal(report.death.count, 1);
    assert.deepStrictEqual(report.death.primary, smoke.deathEvents[0]);
    assert.equal(report.deathEvidence.kind, "spike");
    assert.equal(report.deathEvidence.spikeSource.containsHandleDeath, true);
    assert.deepStrictEqual(report.death.bracket, report.deathEvidence.bracket);
    assert.equal(report.finalBall.provenance, "pre-respawn");
    assert.deepStrictEqual(report.deathEvidence.nonCausalGroundObservation, {
        resolveGroundSequence: 437,
        winGuardSequence: 442,
        runtimeScoreIsWon: false,
    });
    assert.deepStrictEqual(report.trajectoryDiagnostics, EXPECTED_SPIKE_DIAGNOSTICS);
    assert.equal(smoke.filesWritten, 0);
    assert.equal(smoke.productionFairnessHelperDirectCalls, 0);
}

function assertGroundLong(caseRun) {
    const { report, smoke } = caseRun;
    assert.equal(report.seed, 24);
    assert.equal(report.recordIndex, 1);
    assert.deepStrictEqual(caseRun.records, EXPECTED_GROUND_RECORDS, "Ground fixture affected records changed");
    assert.deepStrictEqual(report.record, EXPECTED_GROUND_RECORD, "Ground fixture selected record changed");
    assert.deepStrictEqual(report.initialGeometry, EXPECTED_GROUND_GEOMETRY, "Ground fixture geometry changed");
    assert.deepStrictEqual({ x: report.start.x, y: report.start.y }, { x: 883, y: 266 });
    assert.equal(report.start.horizontalSpikeClearance, 5);
    assert.equal(report.death.settleDeath, false);
    assert.equal(report.death.firstActionDeath, false);
    assert.deepStrictEqual(report.movingTargetObservations, {
        initialX: 483,
        settleX: 481.5,
        firstActionX: 480,
        finalObservedX: 366,
        preDeathFinalObservedX: 366,
        targetUpdateCalls: 78,
    });
    assert.equal(smoke.stepPhysicsCallCount, 78);
    assert.equal(smoke.settleFramesRun, 1);
    assert.equal(smoke.actionFramesRun, 77);
    assert.equal(smoke.timerReadCount, 78);
    assert.equal(report.stepAndTimerCounts.identityEvaluations, 78);
    assert.equal(report.stepAndTimerCounts.identityEverMatched, false);
    assert.deepStrictEqual(smoke.deathEvents, [{
        stepCallId: 78,
        frame: 77,
        phase: "flight",
        sequence: 3499,
        beforeRespawn: true,
        beforeState: {
            x: 518.4,
            y: 715,
            vx: -5,
            vy: 0,
            onGround: true,
            groundPlatform: "Ground",
        },
    }]);
    assert.deepStrictEqual(report.preRespawn, {
        x: 518.4,
        y: 715,
        vx: -5,
        vy: 0,
        onGround: true,
        groundPlatform: "Ground",
    });
    assert.equal(smoke.targetIdentityMatch, false);
    assert.equal(report.classification, "SEARCH_MISS");
    assert.deepStrictEqual(report.termination, { reason: "death-observer", deathCount: 1 });
    assert.equal(report.death.count, 1);
    assert.deepStrictEqual(report.death.primary, smoke.deathEvents[0]);
    assert.equal(report.deathEvidence.kind, "ground");
    assert.deepStrictEqual(report.death.bracket, report.deathEvidence.bracket);
    assert.equal(report.finalBall.provenance, "pre-respawn");
    assert.deepStrictEqual(report.trajectoryDiagnostics, EXPECTED_GROUND_DIAGNOSTICS);
}

function assertGroundShort(caseRun) {
    const { report, smoke } = caseRun;
    assert.equal(report.seed, 24);
    assert.equal(report.recordIndex, 1);
    assert.deepStrictEqual(caseRun.records, EXPECTED_GROUND_RECORDS, "Ground short fixture affected records changed");
    assert.deepStrictEqual(report.actionPlan.definition, SHORT_ACTION_PLAN);
    assert.equal(report.actionPlan.hash, EXPECTED_SHORT_ACTION_PLAN_HASH);
    assert.equal(smoke.status, "SEARCH_MISS");
    assert.equal(smoke.trajectorySummary.stopReason, "horizon");
    assert.equal(smoke.framesRun, 2);
    assert.equal(smoke.settleFramesRun, 1);
    assert.equal(smoke.actionFramesRun, 1);
    assert.equal(smoke.stepPhysicsCallCount, 2);
    assert.equal(smoke.timerReadCount, 2);
    assert.deepStrictEqual(smoke.deathEvents, []);
    assert.deepStrictEqual(report.termination, { reason: "horizon", deathCount: 0 });
    assert.deepStrictEqual(report.death, {
        count: 0,
        settleDeath: false,
        firstActionDeath: false,
        events: [],
        primary: null,
        bracket: null,
    });
    assert.equal(report.deathEvidence, null);
    assert.equal(report.phasedV3Lifecycle, null);
    assert.equal(report.preRespawn, null);
    assert.equal(smoke.finalGroundPlatform, null);
    assert.equal(smoke.targetIdentityMatch, false);
    assert.deepStrictEqual(report.finalBall, {
        provenance: "post-step",
        x: 882.3,
        y: 253,
        vx: -0.7,
        vy: -13,
        onGround: false,
        groundPlatform: null,
        prevJumpKey: true,
    });
    assert.deepStrictEqual(report.movingTargetObservations, {
        initialX: 483,
        settleX: 481.5,
        firstActionX: 480,
        finalObservedX: 480,
        preDeathFinalObservedX: null,
        targetUpdateCalls: 2,
    });
    assert.equal(report.filesWritten, 0);
}

function assertFixtureIsolation(caseRuns) {
    const fields = ["fixture", "controller", "ball", "source", "target"];
    for (const field of fields) {
        assert.equal(new Set(caseRuns.map((caseRun) => caseRun[field])).size, caseRuns.length,
            `${field} object leaked across cases`);
    }
    const allPlatformObjects = caseRuns.flatMap((caseRun) => [caseRun.source, caseRun.target]);
    assert.equal(new Set(allPlatformObjects).size, allPlatformObjects.length,
        "source/target objects leaked across cases");
    return {
        cases: caseRuns.length,
        fixtureDistinct: true,
        controllerDistinct: true,
        ballDistinct: true,
        sourceDistinct: true,
        targetDistinct: true,
        allSourceTargetObjectsDistinct: true,
    };
}

function assertOrderInvariance(orderA, orderB) {
    assert.deepStrictEqual(orderA.spikeLong.report, orderB.spikeLong.report,
        "spike-long changed between Order A and Order B");
    assert.deepStrictEqual(orderA.groundLong.report, orderB.groundLong.report,
        "ground-long changed between Order A and Order B");
    assert.deepStrictEqual(orderA.groundShort.report, orderB.groundShort.report,
        "ground-short changed between Order A and Order B");
    assert.equal(orderA.spikeLong.reportHash, orderB.spikeLong.reportHash);
    assert.equal(orderA.groundLong.reportHash, orderB.groundLong.reportHash);
    assert.equal(orderA.groundShort.reportHash, orderB.groundShort.reportHash);
    return {
        spikeLong: { equal: true, reportHash: orderA.spikeLong.reportHash },
        groundLong: { equal: true, reportHash: orderA.groundLong.reportHash },
        groundShort: { equal: true, reportHash: orderA.groundShort.reportHash },
    };
}

function locateGroundDeathProductionEvidence(caseRun) {
    const runtimeEvidence = caseRun.report.deathEvidence;
    assert.equal(runtimeEvidence?.kind, "ground",
        "production Ground source evidence requires a runtime-derived Ground death");
    const productionFile = path.join(__dirname, "..", "src", "BallController.ts");
    const lines = fs.readFileSync(productionFile, "utf8").split(/\r?\n/);
    const findUniqueLine = (text) => {
        const matches = lines
            .map((line, index) => ({ line: line.trim(), number: index + 1 }))
            .filter((candidate) => candidate.line === text);
        assert.equal(matches.length, 1, `production anchor is not unique: ${text}`);
        return matches[0].number;
    };
    const methodLine = findUniqueLine("private resolveVerticalCollision(platform: any, time: BallPhysicsTime): void {");
    const groundGuardLine = findUniqueLine("if (platformName === \"Ground\") {");
    const conditionLine = findUniqueLine("if (this.deathEnabled && !ScoreManager.instance.isWon()) {");
    const handleDeathLine = conditionLine + 1;
    assert.equal(lines[handleDeathLine - 1].trim(), "this.handleDeath();");
    assert.deepStrictEqual({ methodLine, groundGuardLine, conditionLine, handleDeathLine }, {
        methodLine: 401,
        groundGuardLine: 449,
        conditionLine: 452,
        handleDeathLine: 453,
    });
    assert.equal(caseRun.preDeathSample.deathEnabled, true);
    assert.equal(caseRun.preDeathSample.scoreHasWon, false);
    assert.equal(caseRun.preDeathSample.groundPlatform, "Ground");
    return {
        productionFile: "src/BallController.ts",
        method: "resolveVerticalCollision",
        methodLine,
        line: conditionLine,
        condition: "platformName === \"Ground\" && this.deathEnabled && !ScoreManager.instance.isWon()",
        guardLines: { ground: groundGuardLine, deathEnabledAndNotWon: conditionLine, handleDeath: handleDeathLine },
        runtimePreRespawnState: caseRun.report.preRespawn,
        runtimeConditionState: {
            platformName: caseRun.preDeathSample.groundPlatform,
            deathEnabled: caseRun.preDeathSample.deathEnabled,
            scoreIsWon: caseRun.preDeathSample.scoreHasWon,
        },
        fatalFrameContainmentEvidence: runtimeEvidence.bracket,
    };
}

function assertBoundaryCounts(caseRuns) {
    const verifierSource = fs.readFileSync(__filename, "utf8");
    let parallelPhysicsDefinitions = 0;
    for (const name of ["stepPhysics", "executeProductionStep", "resolveVerticalCollision"]) {
        parallelPhysicsDefinitions += (verifierSource.match(new RegExp(`function\\s+${name}\\s*\\(`, "g")) ?? []).length;
    }
    const directStepCalls = (verifierSource.match(/(?:BallController(?:\.prototype)?|fixture\.controller|controller)\.stepPhysics\s*\(/g) ?? []).length;
    const productionOnUpdateCalls = (verifierSource.match(/(?:fixture\.controller|controller)\.onUpdate\s*\(/g) ?? []).length;
    const directLifecycleMethodCalls = (verifierSource.match(
        /(?:fixture\.controller|controller)\.(?:startDeathReconstruction|updateDeathReconstruction|completeDeathReconstruction)\s*\(/g,
    ) ?? []).length;
    const manualMovingUpdates = (verifierSource.match(/\.updateMovingPlatform\s*\(/g) ?? []).length;
    const teleports = (verifierSource.match(/(?:fixture\.controller|controller|ball|source|target)\.(?:centerX|centerY|vx|vy|x|y)\s*=(?!=)/g) ?? []).length;
    let fileWriteCalls = 0;
    for (const name of ["writeFile", "writeFileSync", "appendFile", "appendFileSync", "createWriteStream"]) {
        fileWriteCalls += (verifierSource.match(new RegExp(`fs\\.${name}\\s*\\(`, "g")) ?? []).length;
    }
    const helperGuard = countDirectFairnessHelperCalls();
    for (const caseRun of caseRuns) {
        assert.equal(caseRun.smoke.productionFairnessHelperDirectCalls, 0);
        assert.equal(caseRun.smoke.filesWritten, 0);
    }
    assert.equal(parallelPhysicsDefinitions + directStepCalls, 0, "verifier added a parallel/direct physics path");
    assert.equal(productionOnUpdateCalls, 1, "V3 lifecycle must advance through one production onUpdate call site");
    assert.equal(directLifecycleMethodCalls, 0, "verifier directly invokes a private V3 lifecycle method");
    assert.equal(manualMovingUpdates, 0, "verifier manually updates moving platforms");
    assert.equal(teleports, 0, "verifier teleports runtime objects");
    assert.equal(fileWriteCalls, 0, "verifier contains a repository file-write call");
    return {
        helperGuard,
        harnessLegacyHelperCount: {
            field: "productionFairnessHelperDirectCalls",
            assertedValue: 0,
            status: "legacy",
            authoritative: false,
            auditEvidence: "deprecated",
        },
        parallelPhysicsImplementations: parallelPhysicsDefinitions + directStepCalls,
        productionOnUpdateCallSites: productionOnUpdateCalls,
        directLifecycleMethodCalls,
        manualMovingUpdates,
        teleports,
        unexpectedRepositoryFilesWritten: fileWriteCalls,
    };
}

function printReport(
    orderA,
    orderB,
    invalidAudit,
    multipleDeathAudit,
    stopReasonAudit,
    isolation,
    orderInvariance,
    groundDeathEvidence,
    boundaryCounts,
) {
    const smoke = orderA.spikeLong.smoke;
    console.log(`[c2-step] seed: ${smoke.seed}`);
    console.log(`[c2-step] affected record: ${JSON.stringify(smoke.record)}`);
    console.log(`[c2-step] start state: ${JSON.stringify(smoke.startState)}`);
    console.log(`[c2-step] fixed action plan: ${JSON.stringify(smoke.actionPlan)}`);
    console.log(`[c2-step] frames run: ${smoke.framesRun} (settle ${smoke.settleFramesRun}, action ${smoke.actionFramesRun})`);
    console.log(`[c2-step] stepPhysics call count: ${smoke.stepPhysicsCallCount}`);
    console.log(`[c2-step] input read order: ${smoke.inputReadOrder.join(" -> ")}`);
    console.log(`[c2-step] timer read count: ${smoke.timerReadCount}`);
    console.log(`[c2-step] final status: ${smoke.status}`);
    console.log(`[c2-step] final ground platform: ${smoke.finalGroundPlatform ?? "null"}`);
    console.log(`[c2-step] target identity match: ${smoke.targetIdentityMatch}`);
    console.log(`[c2-step] death events: ${JSON.stringify(smoke.deathEvents)}`);
    console.log(`[c2-step] trajectory summary: ${JSON.stringify(smoke.trajectorySummary)}`);
    console.log(`[c2-step] legacy fixed-step observer audit: ${JSON.stringify(smoke.runtimeAudit)}`);
    console.log(`[c2-step] invalid schema stable case: ${JSON.stringify(invalidAudit.stableCase)}`);
    console.log(`[c2-step] legacy harness fairness-helper count (non-authoritative, deprecated as audit evidence): ${smoke.productionFairnessHelperDirectCalls}`);
    console.log(`[c2-step] files written: ${smoke.filesWritten}`);
    if (smoke.status === "SEARCH_MISS") {
        console.log("[c2-step] SEARCH_MISS means only that this one fixed action produced no witness.");
    }
    console.log(`[c2-step] shared action plan: ${EXPECTED_ACTION_PLAN_JSON}`);
    console.log(`[c2-step] shared action plan hash: ${EXPECTED_ACTION_PLAN_HASH}`);
    console.log(`[c2-step] short action plan: ${EXPECTED_SHORT_ACTION_PLAN_JSON}`);
    console.log(`[c2-step] short action plan hash: ${EXPECTED_SHORT_ACTION_PLAN_HASH}`);
    console.log(`[c2-step] spike long normalized report: ${JSON.stringify(orderA.spikeLong.report)}`);
    console.log(`[c2-step] spike long normalized report hash: ${orderA.spikeLong.reportHash}`);
    console.log(`[c2-step] Ground long normalized report: ${JSON.stringify(orderA.groundLong.report)}`);
    console.log(`[c2-step] Ground long normalized report hash: ${orderA.groundLong.reportHash}`);
    console.log(`[c2-step] Ground short normalized report: ${JSON.stringify(orderA.groundShort.report)}`);
    console.log(`[c2-step] Ground short normalized report hash: ${orderA.groundShort.reportHash}`);
    console.log(`[c2-step] fixture isolation: ${JSON.stringify(isolation)}`);
    console.log("[c2-step] fixture isolation scope: serial singleton-rebinding probe only; simultaneous live fixtures are not proven safe.");
    console.log("[c2-step] Order A case sequence: spike-long -> Ground-long -> Ground-short");
    console.log("[c2-step] Order B case sequence: Ground-short -> Ground-long -> spike-long");
    console.log(`[c2-step] order invariance: ${JSON.stringify(orderInvariance)}`);
    console.log(`[c2-step] runtime-derived death evidence: ${JSON.stringify({
        spikeLong: orderA.spikeLong.report.deathEvidence,
        groundLong: orderA.groundLong.report.deathEvidence,
        groundShort: orderA.groundShort.report.deathEvidence,
    })}`);
    console.log(`[v3-death] spike phased lifecycle: ${JSON.stringify(orderA.spikeLong.report.phasedV3Lifecycle)}`);
    console.log(`[v3-death] Ground phased lifecycle: ${JSON.stringify(orderA.groundLong.report.phasedV3Lifecycle)}`);
    console.log("[v3-death] source coverage: spike + Ground; fall/out-of-bounds has no existing fixed-action fixture in this verifier.");
    console.log(`[c2-step] ground-death production evidence: ${JSON.stringify(groundDeathEvidence)}`);
    console.log(`[c2-step] multiple-death assertion guard: ${JSON.stringify(multipleDeathAudit)}`);
    console.log(`[c2-step] harness stopReason literals: ${JSON.stringify(stopReasonAudit)}`);
    console.log(`[c2-step] authoritative cross-file helper guard: ${JSON.stringify(boundaryCounts.helperGuard)}`);
    console.log("[c2-step] helper guard limitations: alias, bracket notation, destructuring references, and dynamic dispatch are not covered; this is not an AST audit.");
    console.log(`[c2-step] boundary counts: ${JSON.stringify(boundaryCounts)}`);
    console.log("[c2-step] verification: PASS");
}

function runVerification() {
    const stopReasonAudit = enumerateHarnessStopReasons();
    const orderA = {
        spikeLong: runCase(
            1, 0, FIXED_ACTION_PLAN, EXPECTED_ACTION_PLAN_JSON, EXPECTED_ACTION_PLAN_HASH, stopReasonAudit,
        ),
        groundLong: runCase(
            24, 1, FIXED_ACTION_PLAN, EXPECTED_ACTION_PLAN_JSON, EXPECTED_ACTION_PLAN_HASH, stopReasonAudit,
        ),
        groundShort: runCase(
            24, 1, SHORT_ACTION_PLAN, EXPECTED_SHORT_ACTION_PLAN_JSON, EXPECTED_SHORT_ACTION_PLAN_HASH, stopReasonAudit,
        ),
    };
    const orderB = {
        groundShort: runCase(
            24, 1, SHORT_ACTION_PLAN, EXPECTED_SHORT_ACTION_PLAN_JSON, EXPECTED_SHORT_ACTION_PLAN_HASH, stopReasonAudit,
        ),
        groundLong: runCase(
            24, 1, FIXED_ACTION_PLAN, EXPECTED_ACTION_PLAN_JSON, EXPECTED_ACTION_PLAN_HASH, stopReasonAudit,
        ),
        spikeLong: runCase(
            1, 0, FIXED_ACTION_PLAN, EXPECTED_ACTION_PLAN_JSON, EXPECTED_ACTION_PLAN_HASH, stopReasonAudit,
        ),
    };
    const caseRuns = [
        orderA.spikeLong,
        orderA.groundLong,
        orderA.groundShort,
        orderB.groundShort,
        orderB.groundLong,
        orderB.spikeLong,
    ];
    assert.equal(caseRuns.length, 6);
    for (const caseRun of caseRuns) assertCommonSmoke(caseRun);

    assert.deepStrictEqual(orderB.spikeLong.fixture.layoutSnapshot, orderA.spikeLong.fixture.layoutSnapshot,
        "spike fixture production generation replay changed");
    assert.deepStrictEqual(orderB.spikeLong.records, orderA.spikeLong.records,
        "spike fixture C1 records changed between production replays");
    assert.deepStrictEqual(orderB.groundLong.fixture.layoutSnapshot, orderA.groundLong.fixture.layoutSnapshot,
        "Ground fixture production generation replay changed");
    assert.deepStrictEqual(orderB.groundLong.records, orderA.groundLong.records,
        "Ground fixture C1 records changed between production replays");
    assert.deepStrictEqual(orderA.groundShort.fixture.layoutSnapshot, orderA.groundLong.fixture.layoutSnapshot,
        "Ground short replay generation changed");
    assert.deepStrictEqual(orderB.groundShort.records, orderB.groundLong.records,
        "Ground short replay C1 records changed");
    assertSpikeLong(orderA.spikeLong);
    assertSpikeLong(orderB.spikeLong);
    assertGroundLong(orderA.groundLong);
    assertGroundLong(orderB.groundLong);
    assertGroundShort(orderA.groundShort);
    assertGroundShort(orderB.groundShort);
    assert.equal(orderA.spikeLong.report.actionPlan.resolvedDirection, "right");
    assert.equal(orderA.groundLong.report.actionPlan.resolvedDirection, "left");
    assert.equal(orderA.groundShort.report.actionPlan.resolvedDirection, "left");
    for (const caseRun of caseRuns) {
        assert.ok(caseRun.planReference === FIXED_ACTION_PLAN || caseRun.planReference === SHORT_ACTION_PLAN);
        assert.deepStrictEqual(caseRun.planAfter, caseRun.planBefore);
    }

    const isolation = assertFixtureIsolation(caseRuns);
    const orderInvariance = assertOrderInvariance(orderA, orderB);
    const groundDeathRuns = caseRuns.filter((caseRun) => caseRun.report.deathEvidence?.kind === "ground");
    assert.equal(groundDeathRuns.length, 2, "runtime-derived Ground death run count changed");
    const groundDeathEvidence = locateGroundDeathProductionEvidence(groundDeathRuns[0]);
    assert.deepStrictEqual(locateGroundDeathProductionEvidence(groundDeathRuns[1]), groundDeathEvidence,
        "ground-death production evidence changed between orders");
    const invalidAudit = verifyInvalidSchema();
    const multipleDeathAudit = verifyMultipleDeathAssertionShape();
    const boundaryCounts = assertBoundaryCounts(caseRuns);
    printReport(
        orderA,
        orderB,
        invalidAudit,
        multipleDeathAudit,
        stopReasonAudit,
        isolation,
        orderInvariance,
        groundDeathEvidence,
        boundaryCounts,
    );
    return orderA.spikeLong.smoke;
}

if (require.main === module) {
    try {
        if (process.argv.length !== 3 || process.argv[2] !== "--verify") {
            throw new Error("Usage: node tools/verify-l4-step-harness.cjs --verify");
        }
        runVerification();
    } catch (error) {
        console.error(`[c2-step] verification failed: ${error.stack || error.message || String(error)}`);
        process.exitCode = 1;
    }
}

module.exports = { runVerification };
