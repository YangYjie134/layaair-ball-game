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

const EXPECTED_RECORD = Object.freeze({
    hazardId: "hazard:spike:0",
    hostId: "Platform_5",
    sourceId: "Platform_4",
    targetId: "Platform_5",
    spikeSide: "left",
    affectedRole: "landing",
    sourceOrder: 4,
    targetOrder: 5,
});
const EXPECTED_SPIKE = Object.freeze({
    x: 884,
    y: 116,
    width: 90,
    height: 8,
});
const EXPECTED_SEED_1_RECORD = Object.freeze({
    hazardId: "hazard:spike:0",
    hostId: "Platform_3",
    sourceId: "Platform_3",
    targetId: "Platform_4",
    spikeSide: "left",
    affectedRole: "takeoff",
    sourceOrder: 3,
    targetOrder: 4,
});
const EXPECTED_SEED_1_GEOMETRY = Object.freeze({
    source: { x: 460, y: 389, width: 200, height: 1 },
    target: { x: 433, y: 280, width: 200, height: 1 },
    hazard: { x: 460, y: 381, width: 90, height: 8 },
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
const EXPECTED_SEED_1_DIAGNOSTICS = Object.freeze({
    apex: { y: 208.5, frame: 26 },
    ballCenterX: {
        min: { value: 155.39999999999998, frame: 84 },
        max: { value: 560, frame: 0 },
    },
    targetXBeforeTermination: {
        min: { value: 304, frame: 85 },
        max: { value: 431.5, frame: 0 },
    },
    horizontalOverlap: {
        frameCount: 43,
        firstFrame: 0,
        lastFrame: 42,
        ever: true,
    },
    minimumHorizontalGap: { value: 0, frame: 0 },
});

function verifyInvalidSchema() {
    const details = {
        code: "INVALID_OPPOSING_DIRECTIONS",
        firstInvalidField: "action.left",
        frame: 0,
        phase: "setup",
        message: "Simultaneous left and right input is invalid, not neutral",
        context: {
            seed: 0,
            hazardId: EXPECTED_RECORD.hazardId,
            sourceId: EXPECTED_RECORD.sourceId,
            targetId: EXPECTED_RECORD.targetId,
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
    const respawnStart = events.find((event) => (
        sameStep(event)
        && event.type === "method-start"
        && event.method === "respawn"
        && event.sequence > deathEvent.sequence
    ));
    const stepEnd = events.find((event) => sameStep(event) && event.type === "step-end");
    assert.ok(stepStart && handleDeathStart && respawnStart && stepEnd,
        "death runtime bracket is incomplete");
    assert.ok(
        stepStart.sequence < handleDeathStart.sequence
        && handleDeathStart.sequence < deathEvent.sequence
        && deathEvent.sequence < respawnStart.sequence
        && respawnStart.sequence < stepEnd.sequence,
        "death runtime bracket order changed",
    );
    const commonBracket = {
        stepCallId: deathEvent.stepCallId,
        stepStartSequence: stepStart.sequence,
        handleDeathStartSequence: handleDeathStart.sequence,
        deathObserverSequence: deathEvent.sequence,
        respawnSequence: respawnStart.sequence,
        stepEndSequence: stepEnd.sequence,
        beforeRespawn: deathEvent.beforeRespawn,
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
        return {
            kind: "other",
            bracket: commonBracket,
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
            respawnSequence: commonBracket.respawnSequence,
            stepEndSequence: commonBracket.stepEndSequence,
            beforeRespawn: commonBracket.beforeRespawn,
            runtimeScoreIsWon: winGuard.value,
            orderValid: commonBracket.orderValid,
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
    let deathBracketing = "NOT_APPLICABLE";
    if (deathCount === 1) {
        assert.equal(smoke.runtimeAudit.deathEventsBracketedBeforeRespawn, true,
            `${label} death event is not bracketed before respawn`);
        deathBracketing = true;
    }
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
            deathEventsBracketedBeforeRespawn: deathBracketing,
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
        assert.equal(report.runtimeAudit.deathEventsBracketedBeforeRespawn, "NOT_APPLICABLE");
        assert.equal(report.deathEvidence, null);
        assert.equal(report.death.primary, null);
        assert.equal(report.death.bracket, null);
        assert.equal(report.preRespawn, null);
    } else {
        assert.equal(smoke.deathEvents.length, 1);
        assert.equal(smoke.runtimeAudit.deathEventsBracketedBeforeRespawn, true,
            "death evidence is not bracketed before respawn");
        assert.equal(report.runtimeAudit.deathEventsBracketedBeforeRespawn, true);
        assert.ok(report.deathEvidence);
        assert.ok(report.death.primary);
        assert.ok(report.death.bracket);
        assert.ok(report.preRespawn);
    }
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

function assertSeedZero(caseRun) {
    const { report, smoke } = caseRun;
    assert.equal(caseRun.records.length, 1, "seed 0 must produce exactly one affected record");
    assert.deepStrictEqual(report.record, EXPECTED_RECORD, "seed 0 affected record changed");
    assert.deepStrictEqual(report.initialGeometry.hazard, EXPECTED_SPIKE, "seed 0 spike geometry changed");
    assert.equal(smoke.stepPhysicsCallCount, 39);
    assert.equal(smoke.settleFramesRun, 1);
    assert.equal(smoke.actionFramesRun, 38);
    assert.equal(smoke.timerReadCount, 39);
    assert.deepStrictEqual(smoke.deathEvents, [{
        stepCallId: 39,
        frame: 38,
        phase: "flight",
        sequence: 1748,
        beforeRespawn: true,
        beforeState: {
            x: 915.6,
            y: 115.5,
            vx: 5,
            vy: 5.5,
            onGround: false,
            groundPlatform: null,
        },
    }]);
    assert.deepStrictEqual(report.preRespawn, {
        x: 915.6,
        y: 115.5,
        vx: 5,
        vy: 5.5,
        onGround: false,
        groundPlatform: null,
    });
    assert.equal(smoke.finalGroundPlatform, null);
    assert.equal(smoke.targetIdentityMatch, false);
    assert.equal(report.classification, "SEARCH_MISS");
    assert.deepStrictEqual(report.termination, { reason: "death-observer", deathCount: 1 });
    assert.equal(report.death.count, 1);
    assert.deepStrictEqual(report.death.primary, smoke.deathEvents[0]);
    assert.equal(report.deathEvidence.kind, "other");
    assert.deepStrictEqual(report.death.bracket, report.deathEvidence.bracket);
    assert.equal(report.finalBall.provenance, "pre-respawn");
    assert.deepStrictEqual(report.deathEvidence.nonCausalGroundObservation, {
        resolveGroundSequence: 1741,
        winGuardSequence: 1746,
        runtimeScoreIsWon: false,
    });
    assert.equal(smoke.filesWritten, 0);
    assert.equal(smoke.productionFairnessHelperDirectCalls, 0);
}

function assertSeedOneLong(caseRun) {
    const { report, smoke } = caseRun;
    assert.deepStrictEqual(report.record, EXPECTED_SEED_1_RECORD, "seed 1 affected record changed");
    assert.deepStrictEqual(report.initialGeometry, EXPECTED_SEED_1_GEOMETRY, "seed 1 initial geometry changed");
    assert.deepStrictEqual({ x: report.start.x, y: report.start.y }, { x: 560, y: 384 });
    assert.equal(report.start.horizontalSpikeClearance, 5);
    assert.equal(report.death.settleDeath, false);
    assert.equal(report.death.firstActionDeath, false);
    assert.deepStrictEqual(report.movingTargetObservations, {
        initialX: 433,
        settleX: 431.5,
        firstActionX: 430,
        finalObservedX: 304,
        preDeathFinalObservedX: 304,
        targetUpdateCalls: 86,
    });
    assert.equal(smoke.stepPhysicsCallCount, 86);
    assert.equal(smoke.settleFramesRun, 1);
    assert.equal(smoke.actionFramesRun, 85);
    assert.equal(smoke.timerReadCount, 86);
    assert.equal(report.stepAndTimerCounts.identityEvaluations, 86);
    assert.equal(report.stepAndTimerCounts.identityEverMatched, false);
    assert.deepStrictEqual(smoke.deathEvents, [{
        stepCallId: 86,
        frame: 85,
        phase: "flight",
        sequence: 3860,
        beforeRespawn: true,
        beforeState: {
            x: 155.39999999999998,
            y: 715,
            vx: -5,
            vy: 0,
            onGround: true,
            groundPlatform: "Ground",
        },
    }]);
    assert.deepStrictEqual(report.preRespawn, {
        x: 155.39999999999998,
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
    assert.deepStrictEqual(report.trajectoryDiagnostics, EXPECTED_SEED_1_DIAGNOSTICS);
}

function assertSeedOneShort(caseRun) {
    const { report, smoke } = caseRun;
    assert.equal(report.seed, 1);
    assert.equal(report.recordIndex, 0);
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
    assert.equal(report.preRespawn, null);
    assert.equal(smoke.finalGroundPlatform, null);
    assert.equal(smoke.targetIdentityMatch, false);
    assert.deepStrictEqual(report.finalBall, {
        provenance: "post-step",
        x: 559.3,
        y: 371,
        vx: -0.7,
        vy: -13,
        onGround: false,
        groundPlatform: null,
        prevJumpKey: true,
    });
    assert.deepStrictEqual(report.movingTargetObservations, {
        initialX: 433,
        settleX: 431.5,
        firstActionX: 430,
        finalObservedX: 430,
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
    assert.deepStrictEqual(orderA.seed0Long.report, orderB.seed0Long.report,
        "seed0-long changed between Order A and Order B");
    assert.deepStrictEqual(orderA.seed1Long.report, orderB.seed1Long.report,
        "seed1-long changed between Order A and Order B");
    assert.deepStrictEqual(orderA.seed1Short.report, orderB.seed1Short.report,
        "seed1-short changed between Order A and Order B");
    assert.equal(orderA.seed0Long.reportHash, orderB.seed0Long.reportHash);
    assert.equal(orderA.seed1Long.reportHash, orderB.seed1Long.reportHash);
    assert.equal(orderA.seed1Short.reportHash, orderB.seed1Short.reportHash);
    return {
        seed0Long: { equal: true, reportHash: orderA.seed0Long.reportHash },
        seed1Long: { equal: true, reportHash: orderA.seed1Long.reportHash },
        seed1Short: { equal: true, reportHash: orderA.seed1Short.reportHash },
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
        methodLine: 355,
        groundGuardLine: 403,
        conditionLine: 406,
        handleDeathLine: 407,
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
        deathObserverBeforeRespawnEvidence: runtimeEvidence.bracket,
    };
}

function assertBoundaryCounts(caseRuns) {
    const verifierSource = fs.readFileSync(__filename, "utf8");
    let parallelPhysicsDefinitions = 0;
    for (const name of ["stepPhysics", "executeProductionStep", "resolveVerticalCollision"]) {
        parallelPhysicsDefinitions += (verifierSource.match(new RegExp(`function\\s+${name}\\s*\\(`, "g")) ?? []).length;
    }
    const directStepCalls = (verifierSource.match(/(?:BallController(?:\.prototype)?|fixture\.controller|controller)\.stepPhysics\s*\(/g) ?? []).length;
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
    const smoke = orderA.seed0Long.smoke;
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
    console.log(`[c2-step] observer audit: ${JSON.stringify(smoke.runtimeAudit)}`);
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
    console.log(`[c2-step] seed 0 normalized report: ${JSON.stringify(orderA.seed0Long.report)}`);
    console.log(`[c2-step] seed 0 normalized report hash: ${orderA.seed0Long.reportHash}`);
    console.log(`[c2-step] seed 1 normalized report: ${JSON.stringify(orderA.seed1Long.report)}`);
    console.log(`[c2-step] seed 1 normalized report hash: ${orderA.seed1Long.reportHash}`);
    console.log(`[c2-step] seed 1 short normalized report: ${JSON.stringify(orderA.seed1Short.report)}`);
    console.log(`[c2-step] seed 1 short normalized report hash: ${orderA.seed1Short.reportHash}`);
    console.log(`[c2-step] fixture isolation: ${JSON.stringify(isolation)}`);
    console.log("[c2-step] fixture isolation scope: serial singleton-rebinding probe only; simultaneous live fixtures are not proven safe.");
    console.log("[c2-step] Order A case sequence: seed0-long -> seed1-long -> seed1-short");
    console.log("[c2-step] Order B case sequence: seed1-short -> seed1-long -> seed0-long");
    console.log(`[c2-step] order invariance: ${JSON.stringify(orderInvariance)}`);
    console.log(`[c2-step] runtime-derived death evidence: ${JSON.stringify({
        seed0Long: orderA.seed0Long.report.deathEvidence,
        seed1Long: orderA.seed1Long.report.deathEvidence,
        seed1Short: orderA.seed1Short.report.deathEvidence,
    })}`);
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
        seed0Long: runCase(
            0, 0, FIXED_ACTION_PLAN, EXPECTED_ACTION_PLAN_JSON, EXPECTED_ACTION_PLAN_HASH, stopReasonAudit,
        ),
        seed1Long: runCase(
            1, 0, FIXED_ACTION_PLAN, EXPECTED_ACTION_PLAN_JSON, EXPECTED_ACTION_PLAN_HASH, stopReasonAudit,
        ),
        seed1Short: runCase(
            1, 0, SHORT_ACTION_PLAN, EXPECTED_SHORT_ACTION_PLAN_JSON, EXPECTED_SHORT_ACTION_PLAN_HASH, stopReasonAudit,
        ),
    };
    const orderB = {
        seed1Short: runCase(
            1, 0, SHORT_ACTION_PLAN, EXPECTED_SHORT_ACTION_PLAN_JSON, EXPECTED_SHORT_ACTION_PLAN_HASH, stopReasonAudit,
        ),
        seed1Long: runCase(
            1, 0, FIXED_ACTION_PLAN, EXPECTED_ACTION_PLAN_JSON, EXPECTED_ACTION_PLAN_HASH, stopReasonAudit,
        ),
        seed0Long: runCase(
            0, 0, FIXED_ACTION_PLAN, EXPECTED_ACTION_PLAN_JSON, EXPECTED_ACTION_PLAN_HASH, stopReasonAudit,
        ),
    };
    const caseRuns = [
        orderA.seed0Long,
        orderA.seed1Long,
        orderA.seed1Short,
        orderB.seed1Short,
        orderB.seed1Long,
        orderB.seed0Long,
    ];
    assert.equal(caseRuns.length, 6);
    for (const caseRun of caseRuns) assertCommonSmoke(caseRun);

    assert.deepStrictEqual(orderB.seed0Long.fixture.layoutSnapshot, orderA.seed0Long.fixture.layoutSnapshot,
        "seed 0 production generation replay changed");
    assert.deepStrictEqual(orderB.seed0Long.records, orderA.seed0Long.records,
        "seed 0 C1 records changed between production replays");
    assert.deepStrictEqual(orderB.seed1Long.fixture.layoutSnapshot, orderA.seed1Long.fixture.layoutSnapshot,
        "seed 1 production generation replay changed");
    assert.deepStrictEqual(orderB.seed1Long.records, orderA.seed1Long.records,
        "seed 1 C1 records changed between production replays");
    assert.deepStrictEqual(orderA.seed1Short.fixture.layoutSnapshot, orderA.seed1Long.fixture.layoutSnapshot,
        "seed 1 short replay generation changed");
    assert.deepStrictEqual(orderB.seed1Short.records, orderB.seed1Long.records,
        "seed 1 short replay C1 records changed");
    assertSeedZero(orderA.seed0Long);
    assertSeedZero(orderB.seed0Long);
    assertSeedOneLong(orderA.seed1Long);
    assertSeedOneLong(orderB.seed1Long);
    assertSeedOneShort(orderA.seed1Short);
    assertSeedOneShort(orderB.seed1Short);
    assert.equal(orderA.seed0Long.report.actionPlan.resolvedDirection, "right");
    assert.equal(orderA.seed1Long.report.actionPlan.resolvedDirection, "left");
    assert.equal(orderA.seed1Short.report.actionPlan.resolvedDirection, "left");
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
    return orderA.seed0Long.smoke;
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
