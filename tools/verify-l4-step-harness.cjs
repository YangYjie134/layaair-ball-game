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
const EXPECTED_ACTION_PLAN_JSON = "{\"directionRule\":\"relative-platform-centers\",\"settleFrames\":1,\"horizonFrames\":120}";
const EXPECTED_ACTION_PLAN_HASH = "96b732c738e48ba09d5d074dea40a270bbe52910ca1ccfe9eaa39cdc7f2ad641";
const EXPECTED_SEED_1_DIAGNOSTICS = Object.freeze({
    apex: { y: 208.5, frame: 26 },
    ballCenterX: {
        min: { value: 155.39999999999998, frame: 84 },
        max: { value: 560, frame: 0 },
    },
    targetXBeforeDeath: {
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

function assertNoDirectFairnessHelperCalls() {
    const source = fs.readFileSync(path.join(__dirname, "l4-step-harness.cjs"), "utf8");
    const helperNames = [
        "isSpikePlacementFair",
        "isAffectedJumpFair",
        "estimateJumpReachBySimulation",
        "getWorstCaseRequiredX",
        "getBestCaseRequiredX",
        "getPlatformSafeCenterInterval",
        "getCenterIntervalGap",
        "isNeighborOnSide",
    ];
    for (const helper of helperNames) {
        assert.equal(new RegExp(`\\.${helper}\\s*\\(`).test(source), false, `core adapter directly calls ${helper}`);
    }
    return 0;
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

    fixture.controller.syncBallSprite = function observedSyncBallSprite(...args) {
        const result = originalSyncBallSprite.apply(this, args);
        const activeStep = fixture.runtime?.activeStep;
        const deathObserved = activeStep && fixture.runtime.deathEvents.some(
            (event) => event.stepCallId === activeStep.stepCallId,
        );
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
    return samples.reduce((best, sample) => (
        compare(sample[field], best[field]) ? sample : best
    ));
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
        targetXBeforeDeath: {
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

function buildDeathBracket(fixture, deathEvent) {
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
    assert.ok(stepStart && groundResolution && winGuard && handleDeathStart && respawnStart && stepEnd,
        "ground-death runtime bracket is incomplete");
    assert.equal(winGuard.value, false, "Ground death win guard must observe isWon=false");
    assert.ok(
        stepStart.sequence < groundResolution.sequence
        && groundResolution.sequence < winGuard.sequence
        && winGuard.sequence < handleDeathStart.sequence
        && handleDeathStart.sequence < deathEvent.sequence
        && deathEvent.sequence < respawnStart.sequence
        && respawnStart.sequence < stepEnd.sequence,
        "ground-death runtime bracket order changed",
    );
    return {
        stepCallId: deathEvent.stepCallId,
        stepStartSequence: stepStart.sequence,
        resolveGroundSequence: groundResolution.sequence,
        winGuardSequence: winGuard.sequence,
        handleDeathStartSequence: handleDeathStart.sequence,
        deathObserverSequence: deathEvent.sequence,
        respawnSequence: respawnStart.sequence,
        stepEndSequence: stepEnd.sequence,
        beforeRespawn: deathEvent.beforeRespawn,
        runtimeScoreIsWon: winGuard.value,
        orderValid: true,
    };
}

function runCase(seed, recordIndex) {
    const planBefore = {
        content: JSON.stringify(FIXED_ACTION_PLAN),
        hash: sha256Json(FIXED_ACTION_PLAN),
    };
    assert.equal(planBefore.content, EXPECTED_ACTION_PLAN_JSON);
    assert.equal(planBefore.hash, EXPECTED_ACTION_PLAN_HASH);

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
    const smoke = runFixedActionSmoke(fixture, record, FIXED_ACTION_PLAN);

    const planAfter = {
        content: JSON.stringify(FIXED_ACTION_PLAN),
        hash: sha256Json(FIXED_ACTION_PLAN),
    };
    assert.deepStrictEqual(planAfter, planBefore, `seed ${seed} polluted the shared action plan`);
    assert.equal(planAfter.hash, EXPECTED_ACTION_PLAN_HASH);

    assert.equal(observers.preDeathSamples.length, 1, `seed ${seed} must have one pre-respawn observer sample`);
    const trajectorySamples = [...observers.samples, ...observers.preDeathSamples]
        .sort((left, right) => left.stepCallId - right.stepCallId);
    assert.equal(trajectorySamples.length, smoke.stepPhysicsCallCount,
        `seed ${seed} must have one trajectory observation per production step`);
    assert.equal(new Set(trajectorySamples.map((sample) => sample.stepCallId)).size, smoke.stepPhysicsCallCount,
        `seed ${seed} trajectory stepCallId values are not unique`);
    const settleSample = trajectorySamples.find((sample) => sample.frame === 0);
    const firstActionSample = trajectorySamples.find((sample) => sample.frame === 1);
    const preDeathSample = observers.preDeathSamples[0];
    assert.ok(settleSample && firstActionSample && preDeathSample);

    const postStepIdentityEvents = fixture.runtime.events.filter((event) => event.type === "post-step-landing");
    const targetUpdateEvents = fixture.runtime.events.filter((event) => (
        event.type === "method-start"
        && event.method === "updateMovingPlatform"
        && event.platform === target.name
    ));
    const deathEvent = smoke.deathEvents[0];
    assert.ok(deathEvent, `seed ${seed} did not produce the expected death observer`);
    const deathBracket = buildDeathBracket(fixture, deathEvent);
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
            definition: { ...FIXED_ACTION_PLAN },
            hash: planAfter.hash,
            resolvedDirection: smoke.actionPlan.resolvedDirection,
            unchangedBeforeAfter: true,
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
            preDeathFinalObservedX: preDeathSample.targetX,
            targetUpdateCalls: targetUpdateEvents.length,
        },
        death: {
            settleDeath: smoke.deathEvents.some((event) => event.frame === 0),
            firstActionDeath: smoke.deathEvents.some((event) => event.frame === 1),
            events: smoke.deathEvents,
            bracket: deathBracket,
        },
        preRespawn: deathEvent.beforeState,
        classification: smoke.status,
        trajectoryDiagnostics: diagnostics,
        runtimeAudit: {
            stepBracketsValid: smoke.runtimeAudit.stepBracketsValid,
            postStepLandingOnly: smoke.runtimeAudit.postStepLandingOnly,
            deathEventsBracketedBeforeRespawn: smoke.runtimeAudit.deathEventsBracketedBeforeRespawn,
            firstStepSequence: smoke.runtimeAudit.firstStepSequence,
            lastStepEndSequence: smoke.runtimeAudit.lastStepEndSequence,
        },
        productionFairnessHelperDirectCalls: smoke.productionFairnessHelperDirectCalls,
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
        planReference: FIXED_ACTION_PLAN,
        planBefore,
        planAfter,
        preDeathSample,
        report,
        reportHash: sha256Json(report),
    };
}

function assertCommonSmoke(caseRun) {
    const { fixture, record, smoke } = caseRun;
    assert.notEqual(smoke.status, "INVALID_UNMODELED", `normal fixed smoke became invalid: ${smoke.code ?? "unknown"}`);
    assert.strictEqual(smoke.record, record, "smoke must consume the C1 record object returned by this replay");
    assert.ok(smoke.stepPhysicsCallCount > 0, "production stepPhysics was not called");
    assert.equal(smoke.stepPhysicsCallCount, smoke.framesRun, "every reported frame must be one production step");
    assert.deepStrictEqual(smoke.inputReadOrder, [...INPUT_READ_ORDER]);
    assert.equal(smoke.runtimeAudit.stepBracketsValid, true, "step start/end brackets are incomplete");
    assert.equal(smoke.runtimeAudit.postStepLandingOnly, true, "landing observation escaped the post-step boundary");
    assert.equal(smoke.runtimeAudit.deathEventsBracketedBeforeRespawn, true, "death evidence is not bracketed before respawn");
    assert.equal(new Set(smoke.runtimeAudit.stepCallIds).size, smoke.stepPhysicsCallCount, "stepCallId values are not unique");
    assert.equal(smoke.filesWritten, 0, "C2 verifier wrote files");
    assert.equal(smoke.productionFairnessHelperDirectCalls, 0);
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
    assert.equal(smoke.filesWritten, 0);
    assert.equal(smoke.productionFairnessHelperDirectCalls, 0);
}

function assertSeedOne(caseRun) {
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
    assert.deepStrictEqual(report.trajectoryDiagnostics, EXPECTED_SEED_1_DIAGNOSTICS);
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
    assert.deepStrictEqual(orderA.seed0.report, orderB.seed0.report, "seed 0 changed between Order A and Order B");
    assert.deepStrictEqual(orderA.seed1.report, orderB.seed1.report, "seed 1 changed between Order A and Order B");
    assert.equal(orderA.seed0.reportHash, orderB.seed0.reportHash);
    assert.equal(orderA.seed1.reportHash, orderB.seed1.reportHash);
    return {
        seed0: { equal: true, reportHash: orderA.seed0.reportHash },
        seed1: { equal: true, reportHash: orderA.seed1.reportHash },
    };
}

function locateGroundDeathProductionEvidence(caseRun) {
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
        deathObserverBeforeRespawnEvidence: caseRun.report.death.bracket,
    };
}

function assertBoundaryCounts(caseRuns) {
    const verifierSource = fs.readFileSync(__filename, "utf8");
    const parallelPhysicsDefinitions = ["stepPhysics", "executeProductionStep", "resolveVerticalCollision"]
        .reduce((count, name) => count + (verifierSource.match(new RegExp(`function\\s+${name}\\s*\\(`, "g")) ?? []).length, 0);
    const directStepCalls = (verifierSource.match(/(?:BallController(?:\.prototype)?|fixture\.controller|controller)\.stepPhysics\s*\(/g) ?? []).length;
    const manualMovingUpdates = (verifierSource.match(/\.updateMovingPlatform\s*\(/g) ?? []).length;
    const teleports = (verifierSource.match(/(?:fixture\.controller|controller|ball|source|target)\.(?:centerX|centerY|vx|vy|x|y)\s*=(?!=)/g) ?? []).length;
    const fileWriteCalls = ["writeFile", "writeFileSync", "appendFile", "appendFileSync", "createWriteStream"]
        .reduce((count, name) => count + (verifierSource.match(new RegExp(`fs\\.${name}\\s*\\(`, "g")) ?? []).length, 0);
    const productionFairnessHelperDirectCalls = assertNoDirectFairnessHelperCalls();
    for (const caseRun of caseRuns) {
        assert.equal(caseRun.smoke.productionFairnessHelperDirectCalls, 0);
        assert.equal(caseRun.smoke.filesWritten, 0);
    }
    assert.equal(parallelPhysicsDefinitions + directStepCalls, 0, "verifier added a parallel/direct physics path");
    assert.equal(manualMovingUpdates, 0, "verifier manually updates moving platforms");
    assert.equal(teleports, 0, "verifier teleports runtime objects");
    assert.equal(fileWriteCalls, 0, "verifier contains a repository file-write call");
    return {
        productionFairnessHelperDirectCalls,
        parallelPhysicsImplementations: parallelPhysicsDefinitions + directStepCalls,
        manualMovingUpdates,
        teleports,
        unexpectedRepositoryFilesWritten: fileWriteCalls,
    };
}

function printReport(orderA, orderB, invalidAudit, isolation, orderInvariance, groundDeathEvidence, boundaryCounts) {
    const smoke = orderA.seed0.smoke;
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
    console.log(`[c2-step] direct production fairness-helper calls: ${smoke.productionFairnessHelperDirectCalls}`);
    console.log(`[c2-step] files written: ${smoke.filesWritten}`);
    if (smoke.status === "SEARCH_MISS") {
        console.log("[c2-step] SEARCH_MISS means only that this one fixed action produced no witness.");
    }
    console.log(`[c2-step] shared action plan: ${EXPECTED_ACTION_PLAN_JSON}`);
    console.log(`[c2-step] shared action plan hash: ${EXPECTED_ACTION_PLAN_HASH}`);
    console.log(`[c2-step] seed 0 normalized report: ${JSON.stringify(orderA.seed0.report)}`);
    console.log(`[c2-step] seed 0 normalized report hash: ${orderA.seed0.reportHash}`);
    console.log(`[c2-step] seed 1 normalized report: ${JSON.stringify(orderA.seed1.report)}`);
    console.log(`[c2-step] seed 1 normalized report hash: ${orderA.seed1.reportHash}`);
    console.log(`[c2-step] fixture isolation: ${JSON.stringify(isolation)}`);
    console.log(`[c2-step] Order A seed sequence: ${orderA.seed0.report.seed} -> ${orderA.seed1.report.seed}`);
    console.log(`[c2-step] Order B seed sequence: ${orderB.seed1.report.seed} -> ${orderB.seed0.report.seed}`);
    console.log(`[c2-step] order invariance: ${JSON.stringify(orderInvariance)}`);
    console.log(`[c2-step] ground-death production evidence: ${JSON.stringify(groundDeathEvidence)}`);
    console.log(`[c2-step] boundary counts: ${JSON.stringify(boundaryCounts)}`);
    console.log("[c2-step] verification: PASS");
}

function runVerification() {
    const orderA = {
        seed0: runCase(0, 0),
        seed1: runCase(1, 0),
    };
    const orderB = {
        seed1: runCase(1, 0),
        seed0: runCase(0, 0),
    };
    const caseRuns = [orderA.seed0, orderA.seed1, orderB.seed1, orderB.seed0];
    for (const caseRun of caseRuns) assertCommonSmoke(caseRun);

    assert.deepStrictEqual(orderB.seed0.fixture.layoutSnapshot, orderA.seed0.fixture.layoutSnapshot,
        "seed 0 production generation replay changed");
    assert.deepStrictEqual(orderB.seed0.records, orderA.seed0.records,
        "seed 0 C1 records changed between production replays");
    assert.deepStrictEqual(orderB.seed1.fixture.layoutSnapshot, orderA.seed1.fixture.layoutSnapshot,
        "seed 1 production generation replay changed");
    assert.deepStrictEqual(orderB.seed1.records, orderA.seed1.records,
        "seed 1 C1 records changed between production replays");
    assertSeedZero(orderA.seed0);
    assertSeedZero(orderB.seed0);
    assertSeedOne(orderA.seed1);
    assertSeedOne(orderB.seed1);
    assert.equal(orderA.seed0.report.actionPlan.resolvedDirection, "right");
    assert.equal(orderA.seed1.report.actionPlan.resolvedDirection, "left");
    for (const caseRun of caseRuns) {
        assert.strictEqual(caseRun.planReference, FIXED_ACTION_PLAN);
        assert.deepStrictEqual(caseRun.planAfter, caseRun.planBefore);
    }

    const isolation = assertFixtureIsolation(caseRuns);
    const orderInvariance = assertOrderInvariance(orderA, orderB);
    const groundDeathEvidence = locateGroundDeathProductionEvidence(orderA.seed1);
    assert.deepStrictEqual(locateGroundDeathProductionEvidence(orderB.seed1), groundDeathEvidence,
        "ground-death production evidence changed between orders");
    const invalidAudit = verifyInvalidSchema();
    const boundaryCounts = assertBoundaryCounts(caseRuns);
    printReport(orderA, orderB, invalidAudit, isolation, orderInvariance, groundDeathEvidence, boundaryCounts);
    return orderA.seed0.smoke;
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
