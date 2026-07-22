const assert = require("node:assert/strict");
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
const FIXED_ACTION_PLAN = Object.freeze({
    directionRule: "relative-platform-centers",
    settleFrames: 1,
    horizonFrames: 120,
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
}

function printReport(smoke, invalidAudit) {
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
    console.log("[c2-step] verification: PASS");
}

function runVerification() {
    const firstFixture = createSeedFixture(0);
    const firstRecords = deriveAffectedRecords(firstFixture);
    const secondFixture = createSeedFixture(0);
    const secondRecords = deriveAffectedRecords(secondFixture);

    assert.deepStrictEqual(secondFixture.layoutSnapshot, firstFixture.layoutSnapshot, "seed 0 production generation replay changed");
    assert.deepStrictEqual(secondRecords, firstRecords, "seed 0 C1 records changed between production replays");
    assert.equal(secondRecords.length, 1, "seed 0 must produce exactly one affected record");
    assert.deepStrictEqual(secondRecords[0], EXPECTED_RECORD, "seed 0 affected record changed");
    assert.deepStrictEqual({
        x: secondFixture.spike.x,
        y: secondFixture.spike.y,
        width: secondFixture.spike.width,
        height: secondFixture.spike.height,
    }, EXPECTED_SPIKE, "seed 0 spike geometry changed");

    const generatedRecord = secondRecords[0];
    const smoke = runFixedActionSmoke(secondFixture, generatedRecord, FIXED_ACTION_PLAN);
    assert.notEqual(smoke.status, "INVALID_UNMODELED", `normal fixed smoke became invalid: ${smoke.code ?? "unknown"}`);
    assert.strictEqual(smoke.record, generatedRecord, "smoke must consume the C1 record object returned by this replay");
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
        assert.strictEqual(smoke.target, secondFixture.controller.groundPlatform);
    } else {
        assert.equal(smoke.status, "SEARCH_MISS", "fixed smoke returned an unsupported status");
    }

    const invalidAudit = verifyInvalidSchema();
    assertNoDirectFairnessHelperCalls();
    printReport(smoke, invalidAudit);
    return smoke;
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
