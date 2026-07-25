"use strict";

const CONTRACT_VERSION = 1;

const C1_FAMILY = "C1_VALIDATION_EXCEPTION";
const HARNESS_FAMILY = "HARNESS_INVALID_UNMODELED_RUNTIME";
const VERIFIER_FAMILY = "VERIFIER_ASSERTION_FAILURE";

const C1_CODES = Object.freeze([
    "AMBIGUOUS_HOST",
    "AMBIGUOUS_SPIKE_SIDE",
    "DUPLICATE_HAZARD_ID",
    "DUPLICATE_PLATFORM_ID",
    "DUPLICATE_PLATFORM_NAME",
    "DUPLICATE_PROGRESSION_ORDER",
    "DUPLICATE_SCENE_NODE",
    "INVALID_CLI_USAGE",
    "INVALID_DYNAMIC_FLAG",
    "INVALID_DYNAMIC_HOST",
    "INVALID_GEOMETRY",
    "INVALID_HAZARD_HOST",
    "INVALID_HAZARD_TYPE",
    "INVALID_LAYOUT",
    "INVALID_PROGRESSION_ORDER",
    "INVALID_SCENE_GEOMETRY",
    "INVALID_SCENE_JSON",
    "INVALID_SCENE_NODE",
    "INVALID_SNAPSHOT",
    "INVALID_SNAPSHOT_JSON",
    "MISSING_HOST",
    "MISSING_SCENE_NODE",
]);

const HARNESS_CODES = Object.freeze([
    "AMBIGUOUS_HORIZONTAL_DIRECTION",
    "DEATH_DURING_SETTLE",
    "HAZARD_HOST_MISMATCH",
    "INVALID_ACTION_FIELD",
    "INVALID_AFFECTED_ROLE",
    "INVALID_DIRECTION_RULE",
    "INVALID_HORIZON",
    "INVALID_OPPOSING_DIRECTIONS",
    "INVALID_SETTLE_COUNT",
    "INVALID_START_X",
    "LANDING_ROLE_HOST_MISMATCH",
    "MISSING_HAZARD_OBJECT",
    "MISSING_HOST_OBJECT",
    "MISSING_RECORD_FIELD",
    "MISSING_SOURCE_OBJECT",
    "MISSING_TARGET_OBJECT",
    "NON_ADJACENT_PROGRESSION",
    "SOURCE_ORDER_MISMATCH",
    "SPIKE_SIDE_MISMATCH",
    "START_OVERLAPS_HAZARD",
    "TAKEOFF_ROLE_HOST_MISMATCH",
    "TARGET_ORDER_MISMATCH",
    "UNSETTLED_SOURCE_STATE",
]);

const VERIFIER_CODES = Object.freeze([
    "MULTIPLE_DEATHS",
]);

const MULTIPLE_DEATHS_MESSAGE = "INVALID_UNMODELED code=MULTIPLE_DEATHS";
const INVALID_RESULT_STATUS = "INVALID_UNMODELED";

const EMITTER_SCOPE = Object.freeze([
    "tools/l4-affected-jumps.cjs",
    "tools/l4-step-harness.cjs",
    "tools/verify-l4-step-harness.cjs",
]);

const EXCLUDED_TRACKED_TREES = Object.freeze({
    engine: "c88dcef289beb6876cda5ec32ce998a888bfe2c1",
    bin: "ABSENT",
    release: "ABSENT",
});

const INVALID_HAZARD_HOST_PREDICATES = Object.freeze([
    "host.name===Ground",
    "host.order===0",
]);

const EXECUTABLE_EXTENSIONS = Object.freeze([
    ".js",
    ".cjs",
    ".mjs",
    ".ts",
    ".tsx",
    ".jsx",
    ".cts",
    ".mts",
]);

const NO_WRITE_CALL_NAMES = Object.freeze([
    "writeFile",
    "writeFileSync",
    "appendFile",
    "appendFileSync",
    "createWriteStream",
    "mkdir",
    "mkdirSync",
    "rm",
    "rmSync",
    "unlink",
    "unlinkSync",
    "rename",
    "renameSync",
]);

const FAMILY_LITERALS = Object.freeze([
    C1_FAMILY,
    HARNESS_FAMILY,
    VERIFIER_FAMILY,
]);

const DEPRECATED_FAMILY_LITERALS = Object.freeze([
    "C3_C4_" + "RUNTIME_INVALID_RESULT",
    "ASSERTION_" + "FAILURE_INVALID",
]);

const WITHHELD_HASH = "WITHHELD_UNTIL_ENFORCEMENT";
const CONTRACT_RELATIVE_PATH = "tools/l4-failure-code-contract.cjs";
const CANONICAL_REFERENCE_BINDING_NAMES = Object.freeze([
    "C1_CODES",
    "HARNESS_CODES",
    "VERIFIER_CODES",
    "C1_FAMILY",
    "HARNESS_FAMILY",
    "VERIFIER_FAMILY",
    "FAMILY_LITERALS",
    "DEPRECATED_FAMILY_LITERALS",
    "buildCodeToFamily",
    "codeToFamily",
]);

function compareCodePoint(left, right) {
    if (left === right) return 0;
    return left < right ? -1 : 1;
}

function normalizeRepositoryPath(value) {
    return value.replace(/\\/g, "/");
}

function getRepositoryRoot() {
    return require("node:path").resolve(__dirname, "..");
}

function stableType(value) {
    if (value === null) return "null";
    const primitiveType = typeof value;
    if (primitiveType !== "object") return primitiveType;
    try {
        return Array.isArray(value) ? "array" : "object";
    } catch (_error) {
        return "object";
    }
}

function sanitizeUnknownCode(code) {
    const truncated = code.length > 64;
    const limited = code.slice(0, 64);
    const sanitized = limited.replace(/[^A-Za-z0-9_]/g, "_");
    return {
        receivedCode: sanitized,
        receivedCodeTruncated: truncated,
        receivedCodeSanitized: /[^A-Za-z0-9_]/.test(code),
    };
}

class FailureCodeContractError extends Error {
    constructor(boundary, reason, details) {
        const safeBoundary = boundary === "harness" ? "harness" : "c1";
        const safeReason = reason === "UNKNOWN_CODE" && typeof details === "string"
            ? "UNKNOWN_CODE"
            : "INVALID_CODE_TYPE";
        if (safeReason === "UNKNOWN_CODE") {
            const safe = sanitizeUnknownCode(details);
            let message = `L4_FAILURE_CODE_CONTRACT_VIOLATION boundary=${safeBoundary} reason=${safeReason} code=${safe.receivedCode}`;
            if (safe.receivedCodeTruncated) message += " truncated=true";
            if (safe.receivedCodeSanitized) message += " sanitized=true";
            super(message);
            this.name = "FailureCodeContractError";
            this.boundary = safeBoundary;
            this.reason = safeReason;
            this.receivedCode = safe.receivedCode;
            this.receivedCodeTruncated = safe.receivedCodeTruncated;
            this.receivedCodeSanitized = safe.receivedCodeSanitized;
            return;
        }

        const receivedType = stableType(details);
        super(`L4_FAILURE_CODE_CONTRACT_VIOLATION boundary=${safeBoundary} reason=${safeReason} receivedType=${receivedType}`);
        this.name = "FailureCodeContractError";
        this.boundary = safeBoundary;
        this.reason = safeReason;
        this.receivedType = receivedType;
    }
}

function includesCode(codes, code) {
    return typeof code === "string" && codes.includes(code);
}

function isKnownC1FailureCode(code) {
    return includesCode(C1_CODES, code);
}

function isKnownHarnessFailureCode(code) {
    return includesCode(HARNESS_CODES, code);
}

function assertKnownCode(boundary, codes, code) {
    if (typeof code !== "string") {
        throw new FailureCodeContractError(boundary, "INVALID_CODE_TYPE", code);
    }
    if (!codes.includes(code)) {
        throw new FailureCodeContractError(boundary, "UNKNOWN_CODE", code);
    }
    return code;
}

function assertKnownC1FailureCode(code) {
    return assertKnownCode("c1", C1_CODES, code);
}

function assertKnownHarnessFailureCode(code) {
    return assertKnownCode("harness", HARNESS_CODES, code);
}

function contractCheck(condition, message) {
    if (!condition) throw new Error(`L4 failure-code contract check failed: ${message}`);
}

function isPlainObject(value) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

function assertExactKeys(value, expectedKeys, label) {
    contractCheck(isPlainObject(value), `${label} must be a plain object`);
    const actualKeys = Object.keys(value).sort(compareCodePoint);
    const sortedExpected = [...expectedKeys].sort(compareCodePoint);
    contractCheck(
        actualKeys.length === sortedExpected.length
            && actualKeys.every((key, index) => key === sortedExpected[index]),
        `${label} keys changed`,
    );
}

function assertAsciiString(value, label) {
    contractCheck(typeof value === "string", `${label} must be a string`);
    contractCheck(/^[\x20-\x7e]*$/.test(value), `${label} must contain printable ASCII only`);
    return value;
}

function assertNonNegativeInteger(value, label) {
    contractCheck(Number.isInteger(value) && value >= 0, `${label} must be a non-negative integer`);
    return value;
}

function normalizeStringArray(value, label, options = {}) {
    contractCheck(Array.isArray(value), `${label} must be an array`);
    const normalized = value.map((entry, index) => {
        const text = assertAsciiString(entry, `${label}[${index}]`);
        return options.paths ? normalizeRepositoryPath(text) : text;
    }).sort(compareCodePoint);
    for (let index = 1; index < normalized.length; index++) {
        contractCheck(normalized[index - 1] !== normalized[index], `${label} contains duplicate ${normalized[index]}`);
    }
    return normalized;
}

function deepFreeze(value) {
    if (value && typeof value === "object" && !Object.isFrozen(value)) {
        for (const child of Object.values(value)) deepFreeze(child);
        Object.freeze(value);
    }
    return value;
}

function buildCodeToFamily() {
    const entries = [];
    for (const code of C1_CODES) entries.push([code, C1_FAMILY]);
    for (const code of HARNESS_CODES) entries.push([code, HARNESS_FAMILY]);
    for (const code of VERIFIER_CODES) entries.push([code, VERIFIER_FAMILY]);
    entries.sort((left, right) => compareCodePoint(left[0], right[0]));

    const mapping = {};
    for (const [code, family] of entries) {
        contractCheck(!Object.prototype.hasOwnProperty.call(mapping, code), `code belongs to multiple families: ${code}`);
        mapping[code] = family;
    }
    return mapping;
}

function buildCanonicalContractPayload() {
    return deepFreeze({
        contractVersion: CONTRACT_VERSION,
        families: {
            [C1_FAMILY]: [...C1_CODES],
            [HARNESS_FAMILY]: [...HARNESS_CODES],
            [VERIFIER_FAMILY]: [...VERIFIER_CODES],
        },
        counts: {
            c1: 22,
            harnessRuntime: 23,
            verifierAssertion: 1,
            total: 46,
        },
        codeToFamily: buildCodeToFamily(),
        emitterScope: [...EMITTER_SCOPE],
        excludedTrackedTrees: {
            engine: EXCLUDED_TRACKED_TREES.engine,
            bin: EXCLUDED_TRACKED_TREES.bin,
            release: EXCLUDED_TRACKED_TREES.release,
        },
        exposure: {
            harnessInvalidRuntimeResult: true,
            normalizedVerifierInvalidReport: false,
        },
        structuralGuards: {
            invalidHazardHost: {
                originCount: 1,
                operator: "||",
                predicates: [...INVALID_HAZARD_HOST_PREDICATES],
            },
            multipleDeaths: {
                code: VERIFIER_CODES[0],
                exactMessage: MULTIPLE_DEATHS_MESSAGE,
                assertionOnly: true,
                harnessRuntime: false,
                normalizedReport: false,
            },
        },
        membershipEnforcementRequired: {
            c1Constructor: true,
            c1Parser: true,
            harnessResult: true,
        },
    });
}

function normalizeCanonicalPayload(payload) {
    assertExactKeys(payload, [
        "contractVersion",
        "families",
        "counts",
        "codeToFamily",
        "emitterScope",
        "excludedTrackedTrees",
        "exposure",
        "structuralGuards",
        "membershipEnforcementRequired",
    ], "payload");
    contractCheck(payload.contractVersion === CONTRACT_VERSION, "contractVersion changed");

    assertExactKeys(payload.families, [C1_FAMILY, HARNESS_FAMILY, VERIFIER_FAMILY], "families");
    const families = {
        [C1_FAMILY]: normalizeStringArray(payload.families[C1_FAMILY], `families.${C1_FAMILY}`),
        [HARNESS_FAMILY]: normalizeStringArray(payload.families[HARNESS_FAMILY], `families.${HARNESS_FAMILY}`),
        [VERIFIER_FAMILY]: normalizeStringArray(payload.families[VERIFIER_FAMILY], `families.${VERIFIER_FAMILY}`),
    };

    assertExactKeys(payload.counts, ["c1", "harnessRuntime", "verifierAssertion", "total"], "counts");
    const counts = {
        c1: assertNonNegativeInteger(payload.counts.c1, "counts.c1"),
        harnessRuntime: assertNonNegativeInteger(payload.counts.harnessRuntime, "counts.harnessRuntime"),
        verifierAssertion: assertNonNegativeInteger(payload.counts.verifierAssertion, "counts.verifierAssertion"),
        total: assertNonNegativeInteger(payload.counts.total, "counts.total"),
    };

    contractCheck(isPlainObject(payload.codeToFamily), "codeToFamily must be a plain object");
    const codeToFamily = {};
    for (const code of Object.keys(payload.codeToFamily).sort(compareCodePoint)) {
        assertAsciiString(code, `codeToFamily key ${code}`);
        const family = assertAsciiString(payload.codeToFamily[code], `codeToFamily.${code}`);
        contractCheck(FAMILY_LITERALS.includes(family), `codeToFamily.${code} has an unknown family`);
        codeToFamily[code] = family;
    }

    const emitterScope = normalizeStringArray(payload.emitterScope, "emitterScope", { paths: true });

    assertExactKeys(payload.excludedTrackedTrees, ["engine", "bin", "release"], "excludedTrackedTrees");
    const excludedTrackedTrees = {
        engine: assertAsciiString(payload.excludedTrackedTrees.engine, "excludedTrackedTrees.engine"),
        bin: assertAsciiString(payload.excludedTrackedTrees.bin, "excludedTrackedTrees.bin"),
        release: assertAsciiString(payload.excludedTrackedTrees.release, "excludedTrackedTrees.release"),
    };

    assertExactKeys(payload.exposure, ["harnessInvalidRuntimeResult", "normalizedVerifierInvalidReport"], "exposure");
    contractCheck(typeof payload.exposure.harnessInvalidRuntimeResult === "boolean", "harness exposure must be boolean");
    contractCheck(typeof payload.exposure.normalizedVerifierInvalidReport === "boolean", "verifier exposure must be boolean");
    const exposure = {
        harnessInvalidRuntimeResult: payload.exposure.harnessInvalidRuntimeResult,
        normalizedVerifierInvalidReport: payload.exposure.normalizedVerifierInvalidReport,
    };

    assertExactKeys(payload.structuralGuards, ["invalidHazardHost", "multipleDeaths"], "structuralGuards");
    assertExactKeys(payload.structuralGuards.invalidHazardHost, ["originCount", "operator", "predicates"], "invalidHazardHost");
    const invalidHazardHost = {
        originCount: assertNonNegativeInteger(payload.structuralGuards.invalidHazardHost.originCount, "invalidHazardHost.originCount"),
        operator: assertAsciiString(payload.structuralGuards.invalidHazardHost.operator, "invalidHazardHost.operator"),
        predicates: normalizeStringArray(payload.structuralGuards.invalidHazardHost.predicates, "invalidHazardHost.predicates"),
    };

    assertExactKeys(payload.structuralGuards.multipleDeaths, [
        "code",
        "exactMessage",
        "assertionOnly",
        "harnessRuntime",
        "normalizedReport",
    ], "multipleDeaths");
    const multipleDeathsSource = payload.structuralGuards.multipleDeaths;
    contractCheck(typeof multipleDeathsSource.assertionOnly === "boolean", "multipleDeaths.assertionOnly must be boolean");
    contractCheck(typeof multipleDeathsSource.harnessRuntime === "boolean", "multipleDeaths.harnessRuntime must be boolean");
    contractCheck(typeof multipleDeathsSource.normalizedReport === "boolean", "multipleDeaths.normalizedReport must be boolean");
    const multipleDeaths = {
        code: assertAsciiString(multipleDeathsSource.code, "multipleDeaths.code"),
        exactMessage: assertAsciiString(multipleDeathsSource.exactMessage, "multipleDeaths.exactMessage"),
        assertionOnly: multipleDeathsSource.assertionOnly,
        harnessRuntime: multipleDeathsSource.harnessRuntime,
        normalizedReport: multipleDeathsSource.normalizedReport,
    };

    assertExactKeys(payload.membershipEnforcementRequired, ["c1Constructor", "c1Parser", "harnessResult"], "membershipEnforcementRequired");
    for (const key of ["c1Constructor", "c1Parser", "harnessResult"]) {
        contractCheck(typeof payload.membershipEnforcementRequired[key] === "boolean", `${key} requirement must be boolean`);
    }
    const membershipEnforcementRequired = {
        c1Constructor: payload.membershipEnforcementRequired.c1Constructor,
        c1Parser: payload.membershipEnforcementRequired.c1Parser,
        harnessResult: payload.membershipEnforcementRequired.harnessResult,
    };

    return {
        contractVersion: payload.contractVersion,
        families,
        counts,
        codeToFamily,
        emitterScope,
        excludedTrackedTrees,
        exposure,
        structuralGuards: { invalidHazardHost, multipleDeaths },
        membershipEnforcementRequired,
    };
}

function serializeCanonicalContractPayload(payload = buildCanonicalContractPayload()) {
    return JSON.stringify(normalizeCanonicalPayload(payload));
}

function hashCanonicalContractPayload(payload = buildCanonicalContractPayload()) {
    const crypto = require("node:crypto");
    return crypto.createHash("sha256").update(serializeCanonicalContractPayload(payload), "utf8").digest("hex");
}

function clonePayload(payload) {
    return JSON.parse(JSON.stringify(payload));
}

function runGit(args, options = {}) {
    const { spawnSync } = require("node:child_process");
    const result = spawnSync("git", args, {
        cwd: getRepositoryRoot(),
        encoding: "utf8",
        windowsHide: true,
    });
    if (result.error) throw result.error;
    if (result.status !== 0 && !options.allowFailure) {
        throw new Error(`git ${args.join(" ")} failed: ${(result.stderr || result.stdout || "").trim()}`);
    }
    return {
        status: result.status,
        stdout: result.stdout || "",
        stderr: result.stderr || "",
    };
}

function gitOutput(args) {
    return runGit(args).stdout.trim();
}

function readRepositoryFile(relativePath) {
    const fs = require("node:fs");
    const path = require("node:path");
    return fs.readFileSync(path.join(getRepositoryRoot(), relativePath), "utf8");
}

function readRepositoryPrefix(relativePath, length) {
    const fs = require("node:fs");
    const path = require("node:path");
    const descriptor = fs.openSync(path.join(getRepositoryRoot(), relativePath), "r");
    try {
        const buffer = Buffer.alloc(length);
        const count = fs.readSync(descriptor, buffer, 0, length, 0);
        return buffer.subarray(0, count);
    } finally {
        fs.closeSync(descriptor);
    }
}

function verifyPrecommitScope() {
    const records = runGit(["status", "--porcelain=v1", "-z", "--untracked-files=all"])
        .stdout.split("\0").filter(Boolean);
    contractCheck(records.length === 1, "Checkpoint A pre-commit scope must contain exactly one path");
    const record = records[0];
    contractCheck(record.length > 3 && record[2] === " ", "Checkpoint A pre-commit status record is invalid");
    const status = record.slice(0, 2);
    const relativePath = normalizeRepositoryPath(record.slice(3));
    contractCheck(["??", "A ", "AM"].includes(status), "Checkpoint A pre-commit path is not a new file");
    contractCheck(relativePath === CONTRACT_RELATIVE_PATH, "Checkpoint A pre-commit scope changed");
    return { status, relativePath };
}

function verifyCommitScope(ref) {
    contractCheck(
        typeof ref === "string" && ref.length > 0 && !ref.startsWith("-") && !/[\0\r\n]/.test(ref),
        "commit scope requires an explicit valid ref",
    );
    const resolved = runGit(["rev-parse", "--verify", "--end-of-options", `${ref}^{commit}`], { allowFailure: true });
    const commit = resolved.stdout.trim();
    contractCheck(resolved.status === 0 && /^[0-9a-f]{40}$/.test(commit), "commit scope ref does not resolve to a commit");

    const ancestry = runGit(["rev-list", "--parents", "-n", "1", commit, "--"])
        .stdout.trim().split(/\s+/).filter(Boolean);
    contractCheck(ancestry.length === 2 && ancestry[0] === commit, "commit scope requires exactly one parent");
    const parent = ancestry[1];

    const delta = runGit([
        "diff-tree",
        "--no-commit-id",
        "--name-status",
        "-r",
        "-z",
        "--no-renames",
        parent,
        commit,
        "--",
    ]).stdout.split("\0").filter(Boolean);
    contractCheck(delta.length === 2, "commit scope must contain exactly one changed path");
    const status = delta[0];
    const relativePath = normalizeRepositoryPath(delta[1]);
    contractCheck(status === "A", "commit scope contract path must be added");
    contractCheck(relativePath === CONTRACT_RELATIVE_PATH, "commit scope changed path is not the contract artifact");
    return { ref, commit, parent, status, relativePath };
}

function enumerateRepositoryFiles() {
    const fs = require("node:fs");
    const path = require("node:path");
    const root = getRepositoryRoot();
    const listed = runGit(["ls-files", "-z", "--cached", "--others", "--exclude-standard"])
        .stdout.split("\0").filter(Boolean).map(normalizeRepositoryPath);
    const paths = [...new Set(listed)].filter((relativePath) => {
        try {
            return fs.statSync(path.join(root, relativePath)).isFile();
        } catch (_error) {
            return false;
        }
    });
    paths.sort(compareCodePoint);
    return paths;
}

function getRepositoryFileMode(relativePath) {
    const fs = require("node:fs");
    const path = require("node:path");
    const stat = fs.lstatSync(path.join(getRepositoryRoot(), relativePath));
    if (stat.isSymbolicLink()) return "120000";
    return (stat.mode & 0o111) !== 0 ? "100755" : "100644";
}

function isExecutableCandidate(relativePath) {
    const path = require("node:path");
    const extension = path.extname(relativePath).toLowerCase();
    if (EXECUTABLE_EXTENSIONS.includes(extension)) return true;
    if (getRepositoryFileMode(relativePath) === "100755") return true;
    try {
        return readRepositoryPrefix(relativePath, 2).toString("utf8") === "#!";
    } catch (_error) {
        return false;
    }
}

function hashGitObject(type, content) {
    const crypto = require("node:crypto");
    return crypto.createHash("sha1").update(`${type} ${content.length}\0`).update(content).digest();
}

function compareGitTreeEntries(left, right) {
    const leftKey = Buffer.from(left.name + (left.mode === "40000" ? "/" : ""), "utf8");
    const rightKey = Buffer.from(right.name + (right.mode === "40000" ? "/" : ""), "utf8");
    return Buffer.compare(leftKey, rightKey);
}

function hashRepositoryContentTree(root, relativePaths) {
    const fs = require("node:fs");
    const path = require("node:path");
    const rootNode = { directories: new Map(), files: [] };

    for (const relativePath of relativePaths) {
        const prefix = `${root}/`;
        contractCheck(relativePath.startsWith(prefix), `${relativePath} escaped excluded-tree root ${root}`);
        const components = relativePath.slice(prefix.length).split("/");
        contractCheck(components.length > 0 && components.every(Boolean), `${relativePath} has an invalid tree path`);
        let node = rootNode;
        for (const component of components.slice(0, -1)) {
            if (!node.directories.has(component)) node.directories.set(component, { directories: new Map(), files: [] });
            node = node.directories.get(component);
        }
        node.files.push({ name: components[components.length - 1], relativePath });
    }

    function hashNode(node) {
        const entries = [];
        for (const [name, child] of node.directories) {
            entries.push({ name, mode: "40000", hash: hashNode(child) });
        }
        for (const file of node.files) {
            const mode = getRepositoryFileMode(file.relativePath);
            let hash;
            if (mode === "120000") {
                const target = fs.readlinkSync(path.join(getRepositoryRoot(), file.relativePath), "utf8");
                hash = hashGitObject("blob", Buffer.from(target, "utf8"));
            } else {
                const result = runGit(["hash-object", "--path", file.relativePath, "--", file.relativePath]);
                const hex = result.stdout.trim();
                contractCheck(/^[0-9a-f]{40}$/.test(hex), `${file.relativePath} content hash is invalid`);
                hash = Buffer.from(hex, "hex");
            }
            entries.push({ name: file.name, mode, hash });
        }
        entries.sort(compareGitTreeEntries);
        const content = [];
        for (const entry of entries) {
            content.push(Buffer.from(`${entry.mode} ${entry.name}\0`, "utf8"), entry.hash);
        }
        return hashGitObject("tree", Buffer.concat(content));
    }

    return hashNode(rootNode).toString("hex");
}

function verifyExcludedContentTrees(allPaths) {
    const actual = {};
    for (const root of Object.keys(EXCLUDED_TRACKED_TREES)) {
        const underPrefix = allPaths.filter((relativePath) => relativePath.startsWith(`${root}/`));
        actual[root] = underPrefix.length === 0 ? "ABSENT" : hashRepositoryContentTree(root, underPrefix);
        contractCheck(actual[root] === EXCLUDED_TRACKED_TREES[root], `${root} excluded content tree changed; SCOPE_EXPANSION_REQUIRED`);
    }
    return actual;
}

function parseJavaScript(relativePath, sourceText, ts) {
    const extension = require("node:path").extname(relativePath).toLowerCase();
    const scriptKind = [".ts", ".tsx", ".cts", ".mts"].includes(extension)
        ? (extension === ".tsx" ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
        : (extension === ".jsx" ? ts.ScriptKind.JSX : ts.ScriptKind.JS);
    const sourceFile = ts.createSourceFile(relativePath, sourceText, ts.ScriptTarget.Latest, true, scriptKind);
    contractCheck(sourceFile.parseDiagnostics.length === 0, `${relativePath} has TypeScript parse diagnostics`);
    return sourceFile;
}

function walkAst(ts, node, callback) {
    callback(node);
    ts.forEachChild(node, (child) => walkAst(ts, child, callback));
}

function lineOf(sourceFile, node) {
    return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function getUniqueTopLevelFunction(sourceFile, name, ts) {
    const matches = sourceFile.statements.filter((statement) => (
        ts.isFunctionDeclaration(statement) && statement.name?.text === name
    ));
    contractCheck(matches.length === 1, `${sourceFile.fileName} must contain one top-level ${name}`);
    return matches[0];
}

function getUniqueTopLevelClass(sourceFile, name, ts) {
    const matches = sourceFile.statements.filter((statement) => (
        ts.isClassDeclaration(statement) && statement.name?.text === name
    ));
    contractCheck(matches.length === 1, `${sourceFile.fileName} must contain one top-level class ${name}`);
    return matches[0];
}

function isWithin(node, ancestor) {
    return node.pos >= ancestor.pos && node.end <= ancestor.end;
}

function unwrapParentheses(node, ts) {
    let current = node;
    while (ts.isParenthesizedExpression(current)) current = current.expression;
    return current;
}

function propertyNameText(name, ts) {
    if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
    return null;
}

function findObjectProperty(objectLiteral, propertyName, ts) {
    return objectLiteral.properties.filter((property) => (
        ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property)
    ) && propertyNameText(property.name, ts) === propertyName);
}

function assertNoAliasOrShadow(sourceFile, targetName, topLevelDeclaration, ts) {
    walkAst(ts, sourceFile, (node) => {
        if (node === topLevelDeclaration || node === topLevelDeclaration.name) return;
        if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === targetName) {
            throw new Error(`${sourceFile.fileName} shadows ${targetName}; SCOPE_EXPANSION_REQUIRED`);
        }
        if (ts.isParameter(node) && ts.isIdentifier(node.name) && node.name.text === targetName) {
            throw new Error(`${sourceFile.fileName} shadows ${targetName}; SCOPE_EXPANSION_REQUIRED`);
        }
        if (ts.isVariableDeclaration(node) && node.initializer && ts.isIdentifier(node.initializer) && node.initializer.text === targetName) {
            throw new Error(`${sourceFile.fileName} aliases ${targetName}; SCOPE_EXPANSION_REQUIRED`);
        }
        if (ts.isBinaryExpression(node)
            && node.operatorToken.kind === ts.SyntaxKind.EqualsToken
            && ts.isIdentifier(node.right)
            && node.right.text === targetName) {
            throw new Error(`${sourceFile.fileName} aliases ${targetName}; SCOPE_EXPANSION_REQUIRED`);
        }
    });
}

function assertOnlyDirectFunctionCalls(sourceFile, targetName, topLevelDeclaration, ts) {
    walkAst(ts, sourceFile, (node) => {
        if (!ts.isIdentifier(node) || node.text !== targetName) return;
        if (node === topLevelDeclaration.name) return;
        if (ts.isCallExpression(node.parent) && node.parent.expression === node) return;
        throw new Error(`${sourceFile.fileName}:${lineOf(sourceFile, node)} uses ${targetName} outside a direct call; SCOPE_EXPANSION_REQUIRED`);
    });
    walkAst(ts, sourceFile, (node) => {
        if (!ts.isCallExpression(node)) return;
        if (ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === targetName) {
            throw new Error(`${sourceFile.fileName}:${lineOf(sourceFile, node)} uses a property-based ${targetName} call; SCOPE_EXPANSION_REQUIRED`);
        }
        if (ts.isElementAccessExpression(node.expression)
            && node.expression.argumentExpression
            && ts.isStringLiteral(node.expression.argumentExpression)
            && node.expression.argumentExpression.text === targetName) {
            throw new Error(`${sourceFile.fileName}:${lineOf(sourceFile, node)} uses a computed ${targetName} call; SCOPE_EXPANSION_REQUIRED`);
        }
    });
}

function compareExactCodeSet(actualCodes, expectedCodes, label) {
    const actual = [...new Set(actualCodes)].sort(compareCodePoint);
    const expected = [...expectedCodes].sort(compareCodePoint);
    const missing = expected.filter((code) => !actual.includes(code));
    const extra = actual.filter((code) => !expected.includes(code));
    contractCheck(missing.length === 0 && extra.length === 0, `${label} mismatch missing=${missing.join(",")} extra=${extra.join(",")}`);
    return actual;
}

function normalizeHazardPredicate(node, ts) {
    const expression = unwrapParentheses(node, ts);
    contractCheck(ts.isBinaryExpression(expression), "INVALID_HAZARD_HOST predicate must be binary");
    contractCheck(expression.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken, "INVALID_HAZARD_HOST predicate must use ===");
    const left = unwrapParentheses(expression.left, ts);
    const right = unwrapParentheses(expression.right, ts);
    contractCheck(ts.isPropertyAccessExpression(left) && ts.isIdentifier(left.expression) && left.expression.text === "host", "INVALID_HAZARD_HOST predicate receiver changed");
    if (left.name.text === "order" && ts.isNumericLiteral(right) && right.text === "0") return "host.order===0";
    if (left.name.text === "name" && ts.isStringLiteral(right) && right.text === "Ground") return "host.name===Ground";
    throw new Error("INVALID_HAZARD_HOST predicate changed");
}

function flattenLogicalOr(node, ts, output = []) {
    const expression = unwrapParentheses(node, ts);
    if (ts.isBinaryExpression(expression) && expression.operatorToken.kind === ts.SyntaxKind.BarBarToken) {
        flattenLogicalOr(expression.left, ts, output);
        flattenLogicalOr(expression.right, ts, output);
    } else {
        output.push(expression);
    }
    return output;
}

function extractC1Facts(sourceFile, ts) {
    const failFunction = getUniqueTopLevelFunction(sourceFile, "fail", ts);
    const parseFunction = getUniqueTopLevelFunction(sourceFile, "parseJsonDocument", ts);
    const errorClass = getUniqueTopLevelClass(sourceFile, "C1ValidationError", ts);
    assertNoAliasOrShadow(sourceFile, "fail", failFunction, ts);
    assertNoAliasOrShadow(sourceFile, "parseJsonDocument", parseFunction, ts);
    assertOnlyDirectFunctionCalls(sourceFile, "fail", failFunction, ts);
    assertOnlyDirectFunctionCalls(sourceFile, "parseJsonDocument", parseFunction, ts);

    const literalOrigins = [];
    const parseOrigins = [];
    const transports = [];
    const constructorCalls = [];

    walkAst(ts, sourceFile, (node) => {
        if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "fail") {
            contractCheck(!node.questionDotToken, "optional fail call is forbidden");
            const firstArgument = node.arguments[0];
            if (firstArgument && ts.isStringLiteral(firstArgument)) {
                literalOrigins.push({ code: firstArgument.text, node, line: lineOf(sourceFile, node) });
            } else if (isWithin(node, parseFunction)
                && firstArgument
                && ts.isIdentifier(firstArgument)
                && firstArgument.text === "code") {
                transports.push({ node, line: lineOf(sourceFile, node) });
            } else {
                throw new Error(`${sourceFile.fileName}:${lineOf(sourceFile, node)} has a forbidden non-literal fail call`);
            }
        }

        if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "parseJsonDocument") {
            contractCheck(!node.questionDotToken, "optional parseJsonDocument call is forbidden");
            const codeArgument = node.arguments[1];
            contractCheck(codeArgument && ts.isStringLiteral(codeArgument), `${sourceFile.fileName}:${lineOf(sourceFile, node)} parseJsonDocument code must be a string literal`);
            parseOrigins.push({ code: codeArgument.text, node, line: lineOf(sourceFile, node) });
        }

        if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "C1ValidationError") {
            constructorCalls.push(node);
        }
    });

    contractCheck(transports.length === 2, "parseJsonDocument must contain exactly two fail(code) transport sinks");
    contractCheck(parseOrigins.length === 2, "parseJsonDocument must have exactly two fixed-literal callers");
    contractCheck(constructorCalls.length === 1, "C1ValidationError must have exactly one construction site");
    const centralConstructor = constructorCalls[0];
    contractCheck(isWithin(centralConstructor, failFunction), "C1ValidationError construction escaped central fail");
    contractCheck(centralConstructor.arguments?.[0] && ts.isIdentifier(centralConstructor.arguments[0]) && centralConstructor.arguments[0].text === "code", "central C1 constructor code transport changed");
    contractCheck(errorClass.members.some((member) => ts.isConstructorDeclaration(member)), "C1ValidationError constructor is missing");

    const actualCodes = compareExactCodeSet(
        [...literalOrigins.map((origin) => origin.code), ...parseOrigins.map((origin) => origin.code)],
        C1_CODES,
        "C1 actual set",
    );

    const hazardOrigins = literalOrigins.filter((origin) => origin.code === C1_CODES[11]);
    contractCheck(hazardOrigins.length === 1, "INVALID_HAZARD_HOST must have exactly one true origin");
    let control = hazardOrigins[0].node.parent;
    while (control && !ts.isIfStatement(control)) control = control.parent;
    contractCheck(control && ts.isIfStatement(control), "INVALID_HAZARD_HOST has no controlling IfStatement");
    contractCheck(isWithin(hazardOrigins[0].node, control.thenStatement), "INVALID_HAZARD_HOST is not controlled by the IfStatement true branch");
    const condition = unwrapParentheses(control.expression, ts);
    contractCheck(ts.isBinaryExpression(condition) && condition.operatorToken.kind === ts.SyntaxKind.BarBarToken, "INVALID_HAZARD_HOST control root must be ||");
    const predicates = flattenLogicalOr(condition, ts).map((predicate) => normalizeHazardPredicate(predicate, ts)).sort(compareCodePoint);
    contractCheck(predicates.length === 2, "INVALID_HAZARD_HOST must have exactly two predicates");
    contractCheck(predicates.every((predicate, index) => predicate === INVALID_HAZARD_HOST_PREDICATES[index]), "INVALID_HAZARD_HOST predicate set changed");

    return {
        actualCodes,
        literalOriginCount: literalOrigins.length,
        parseOriginCount: parseOrigins.length,
        transportCount: transports.length,
        constructorCount: constructorCalls.length,
        invalidHazardHost: {
            originCount: hazardOrigins.length,
            operator: "||",
            predicates,
        },
    };
}

function extractHarnessFacts(sourceFile, ts) {
    const failInvalidFunction = getUniqueTopLevelFunction(sourceFile, "failInvalid", ts);
    const makeInvalidResultFunction = getUniqueTopLevelFunction(sourceFile, "makeInvalidResult", ts);
    const invalidErrorClass = getUniqueTopLevelClass(sourceFile, "C2InvalidUnmodeledError", ts);
    const runSmokeFunction = getUniqueTopLevelFunction(sourceFile, "runFixedActionSmoke", ts);
    assertNoAliasOrShadow(sourceFile, "failInvalid", failInvalidFunction, ts);
    assertNoAliasOrShadow(sourceFile, "makeInvalidResult", makeInvalidResultFunction, ts);
    assertOnlyDirectFunctionCalls(sourceFile, "failInvalid", failInvalidFunction, ts);

    const origins = [];
    const makeCalls = [];
    walkAst(ts, sourceFile, (node) => {
        if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "failInvalid") {
            contractCheck(!node.questionDotToken, "optional failInvalid call is forbidden");
            const details = node.arguments[0];
            contractCheck(details && ts.isObjectLiteralExpression(details), `${sourceFile.fileName}:${lineOf(sourceFile, node)} failInvalid requires an object literal`);
            let codeProperty = null;
            for (const property of details.properties) {
                contractCheck(!ts.isSpreadAssignment(property), `${sourceFile.fileName}:${lineOf(sourceFile, node)} failInvalid spread is forbidden`);
                contractCheck(!ts.isGetAccessorDeclaration(property) && !ts.isSetAccessorDeclaration(property) && !ts.isMethodDeclaration(property), `${sourceFile.fileName}:${lineOf(sourceFile, node)} failInvalid accessor/method is forbidden`);
                contractCheck(!property.name || !ts.isComputedPropertyName(property.name), `${sourceFile.fileName}:${lineOf(sourceFile, node)} failInvalid computed property is forbidden`);
                if (property.name && propertyNameText(property.name, ts) === "code") {
                    contractCheck(codeProperty === null, `${sourceFile.fileName}:${lineOf(sourceFile, node)} duplicate code property`);
                    contractCheck(ts.isPropertyAssignment(property), `${sourceFile.fileName}:${lineOf(sourceFile, node)} code shorthand is forbidden`);
                    contractCheck(ts.isStringLiteral(property.initializer), `${sourceFile.fileName}:${lineOf(sourceFile, node)} code must be a string literal`);
                    codeProperty = property;
                }
            }
            contractCheck(codeProperty !== null, `${sourceFile.fileName}:${lineOf(sourceFile, node)} failInvalid code is missing`);
            origins.push({ code: codeProperty.initializer.text, node, line: lineOf(sourceFile, node) });
        }
        if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "makeInvalidResult") {
            makeCalls.push(node);
        }
    });

    contractCheck(makeCalls.length === 1, "harness must have one central makeInvalidResult call");
    contractCheck(isWithin(makeCalls[0], failInvalidFunction), "makeInvalidResult call escaped failInvalid");
    contractCheck(makeCalls[0].arguments[0] && ts.isIdentifier(makeCalls[0].arguments[0]) && makeCalls[0].arguments[0].text === "details", "central makeInvalidResult transport changed");

    const actualCodes = compareExactCodeSet(origins.map((origin) => origin.code), HARNESS_CODES, "harness actual set");
    contractCheck(origins.length === 23, "harness failInvalid origin count changed");

    let resultObject = null;
    walkAst(ts, makeInvalidResultFunction, (node) => {
        if (!ts.isObjectLiteralExpression(node)) return;
        const status = findObjectProperty(node, "status", ts);
        if (status.length === 1 && ts.isPropertyAssignment(status[0]) && ts.isStringLiteral(status[0].initializer) && status[0].initializer.text === INVALID_RESULT_STATUS) {
            resultObject = node;
        }
    });
    contractCheck(resultObject !== null, "makeInvalidResult no longer constructs INVALID_UNMODELED");
    contractCheck(findObjectProperty(resultObject, "code", ts).length === 1, "makeInvalidResult result code property changed");
    contractCheck(findObjectProperty(resultObject, "deathEvents", ts).length === 0, "harness INVALID result unexpectedly exposes deathEvents");

    let storesResult = false;
    walkAst(ts, invalidErrorClass, (node) => {
        if (!ts.isBinaryExpression(node) || node.operatorToken.kind !== ts.SyntaxKind.EqualsToken) return;
        const left = node.left;
        storesResult = storesResult || (
            ts.isPropertyAccessExpression(left)
            && left.expression.kind === ts.SyntaxKind.ThisKeyword
            && left.name.text === "result"
            && ts.isIdentifier(node.right)
            && node.right.text === "result"
        );
    });
    contractCheck(storesResult, "C2InvalidUnmodeledError no longer stores result");

    let returnsErrorResult = false;
    walkAst(ts, runSmokeFunction, (node) => {
        if (!ts.isReturnStatement(node) || !node.expression || !ts.isPropertyAccessExpression(node.expression)) return;
        returnsErrorResult = returnsErrorResult || (
            ts.isIdentifier(node.expression.expression)
            && node.expression.expression.text === "error"
            && node.expression.name.text === "result"
        );
    });
    contractCheck(returnsErrorResult, "runFixedActionSmoke no longer returns C2 error.result");

    return {
        actualCodes,
        originCount: origins.length,
        makeInvalidResultCallCount: makeCalls.length,
        invalidResultHasDeathEvents: false,
        harnessInvalidRuntimeResult: true,
    };
}

function isRequiredAssertBinding(sourceFile, ts) {
    return sourceFile.statements.some((statement) => {
        if (!ts.isVariableStatement(statement)) return false;
        return statement.declarationList.declarations.some((declaration) => (
            ts.isIdentifier(declaration.name)
            && declaration.name.text === "assert"
            && declaration.initializer
            && ts.isCallExpression(declaration.initializer)
            && ts.isIdentifier(declaration.initializer.expression)
            && declaration.initializer.expression.text === "require"
            && declaration.initializer.arguments.length === 1
            && ts.isStringLiteral(declaration.initializer.arguments[0])
            && declaration.initializer.arguments[0].text === "node:assert/strict"
        ));
    });
}

function isDeathLengthExpression(node, ts) {
    const expression = unwrapParentheses(node, ts);
    if (!ts.isPropertyAccessExpression(expression) || expression.name.text !== "length") return false;
    const events = expression.expression;
    return ts.isPropertyAccessExpression(events)
        && events.name.text === "deathEvents"
        && ts.isIdentifier(events.expression)
        && events.expression.text === "smoke";
}

function extractVerifierFacts(sourceFile, ts) {
    contractCheck(isRequiredAssertBinding(sourceFile, ts), "verifier assert binding changed");
    const deathFunction = getUniqueTopLevelFunction(sourceFile, "assertModeledDeathCount", ts);
    const runCaseFunction = getUniqueTopLevelFunction(sourceFile, "runCase", ts);
    const assertionCalls = [];
    walkAst(ts, deathFunction, (node) => {
        if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) return;
        if (!ts.isIdentifier(node.expression.expression) || node.expression.expression.text !== "assert" || node.expression.name.text !== "ok") return;
        assertionCalls.push(node);
    });
    contractCheck(assertionCalls.length === 1, "assertModeledDeathCount must have exactly one assert.ok emission");
    const assertion = assertionCalls[0];
    contractCheck(assertion.arguments.length >= 2, "multiple-death assertion arguments changed");
    const condition = unwrapParentheses(assertion.arguments[0], ts);
    contractCheck(ts.isBinaryExpression(condition) && condition.operatorToken.kind === ts.SyntaxKind.LessThanEqualsToken, "multiple-death assertion operator changed");
    contractCheck(isDeathLengthExpression(condition.left, ts), "multiple-death assertion subject changed");
    contractCheck(ts.isNumericLiteral(condition.right) && condition.right.text === "1", "multiple-death assertion bound changed");
    contractCheck(ts.isStringLiteral(assertion.arguments[1]) && assertion.arguments[1].text === MULTIPLE_DEATHS_MESSAGE, "multiple-death assertion message changed");

    let smokeDeclaration = null;
    let assertionUse = null;
    let reportDeclaration = null;
    let invalidNormalizationBranch = false;
    walkAst(ts, runCaseFunction, (node) => {
        if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === "smoke"
            && node.initializer && ts.isCallExpression(node.initializer)
            && ts.isIdentifier(node.initializer.expression) && node.initializer.expression.text === "runFixedActionSmoke") {
            smokeDeclaration = node;
        }
        if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "assertModeledDeathCount"
            && node.arguments[0] && ts.isIdentifier(node.arguments[0]) && node.arguments[0].text === "smoke") {
            assertionUse = node;
        }
        if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === "report") reportDeclaration = node;
        if (ts.isStringLiteral(node) && node.text === INVALID_RESULT_STATUS) invalidNormalizationBranch = true;
    });
    contractCheck(smokeDeclaration && assertionUse && reportDeclaration, "runCase exposure anchors are incomplete");
    contractCheck(smokeDeclaration.pos < assertionUse.pos && assertionUse.pos < reportDeclaration.pos, "runCase exposure ordering changed");
    contractCheck(!invalidNormalizationBranch, "runCase added INVALID_UNMODELED normalization");

    let forbiddenHarnessEmission = false;
    walkAst(ts, sourceFile, (node) => {
        if (!ts.isCallExpression(node) || !ts.isIdentifier(node.expression)) return;
        if (node.expression.text !== "makeInvalidResult" && node.expression.text !== "failInvalid") return;
        walkAst(ts, node, (child) => {
            if (ts.isStringLiteral(child) && child.text === VERIFIER_CODES[0]) forbiddenHarnessEmission = true;
        });
    });
    contractCheck(!forbiddenHarnessEmission, "MULTIPLE_DEATHS entered a harness result constructor");
    contractCheck(!HARNESS_CODES.includes(VERIFIER_CODES[0]), "MULTIPLE_DEATHS entered the harness canonical set");

    return {
        actualCodes: [VERIFIER_CODES[0]],
        assertionCount: assertionCalls.length,
        exactMessage: assertion.arguments[1].text,
        normalizedVerifierInvalidReport: false,
    };
}

function isLiteralDataExpression(node, ts, allowFreeze = true) {
    if (ts.isStringLiteral(node) || ts.isNumericLiteral(node)
        || node.kind === ts.SyntaxKind.TrueKeyword
        || node.kind === ts.SyntaxKind.FalseKeyword
        || node.kind === ts.SyntaxKind.NullKeyword) return true;
    if (ts.isArrayLiteralExpression(node)) {
        return node.elements.every((element) => !ts.isSpreadElement(element) && isLiteralDataExpression(element, ts, false));
    }
    if (ts.isObjectLiteralExpression(node)) {
        return node.properties.every((property) => (
            ts.isPropertyAssignment(property)
            && !ts.isComputedPropertyName(property.name)
            && isLiteralDataExpression(property.initializer, ts, false)
        ));
    }
    if (allowFreeze && ts.isCallExpression(node)
        && !node.questionDotToken
        && ts.isPropertyAccessExpression(node.expression)
        && ts.isIdentifier(node.expression.expression)
        && node.expression.expression.text === "Object"
        && node.expression.name.text === "freeze"
        && node.arguments.length === 1) {
        return isLiteralDataExpression(node.arguments[0], ts, false);
    }
    return false;
}

function collectContractExpectedDataNodes(sourceFile, ts) {
    const nodes = [];
    for (const statement of sourceFile.statements) {
        if (!ts.isVariableStatement(statement)) continue;
        const isConst = (statement.declarationList.flags & ts.NodeFlags.Const) !== 0;
        if (!isConst) continue;
        for (const declaration of statement.declarationList.declarations) {
            if (declaration.initializer && isLiteralDataExpression(declaration.initializer, ts)) nodes.push(declaration.initializer);
        }
    }
    contractCheck(nodes.length > 0, "contract expected-data structural allowlist is empty");
    return nodes;
}

function nodeWithinAny(node, allowedNodes) {
    return allowedNodes.some((allowed) => isWithin(node, allowed));
}

function enclosingNamedFunction(node, ts) {
    let current = node.parent;
    while (current) {
        if (ts.isFunctionDeclaration(current)) return current.name?.text || null;
        if (ts.isFunctionExpression(current) || ts.isArrowFunction(current)) return current.name?.text || null;
        current = current.parent;
    }
    return null;
}

function enclosingTopLevelFunctionName(node, ts) {
    let functionName = null;
    let current = node.parent;
    while (current) {
        if (ts.isFunctionDeclaration(current)) functionName = current.name?.text || null;
        current = current.parent;
    }
    return functionName;
}

function enclosingFunctionLikeNode(node, ts) {
    let current = node.parent;
    while (current) {
        if (ts.isFunctionLike(current)) return current;
        current = current.parent;
    }
    return null;
}

function isIdentifierNamed(node, name, ts) {
    return Boolean(node && ts.isIdentifier(node) && node.text === name);
}

function isPropertyAccessPath(node, parts, ts) {
    if (parts.length === 1) return isIdentifierNamed(node, parts[0], ts);
    if (!node || !ts.isPropertyAccessExpression(node) || node.name.text !== parts[parts.length - 1]) return false;
    return isPropertyAccessPath(node.expression, parts.slice(0, -1), ts);
}

function collectBindingIdentifiers(name, identifiers, ts) {
    if (ts.isIdentifier(name)) {
        identifiers.push(name);
        return;
    }
    if (!ts.isObjectBindingPattern(name) && !ts.isArrayBindingPattern(name)) return;
    for (const element of name.elements) {
        if (ts.isBindingElement(element)) collectBindingIdentifiers(element.name, identifiers, ts);
    }
}

function findExpectedFactsDeclaration(sourceFile, bindingName, ts) {
    const expected = bindingName === "harnessFacts"
        ? { extractor: "extractHarnessFacts", source: "harnessSourceFile" }
        : bindingName === "c1Facts"
            ? { extractor: "extractC1Facts", source: "c1SourceFile" }
            : bindingName === "verifierFacts"
                ? { extractor: "extractVerifierFacts", source: "verifierSourceFile" }
                : null;
    if (!expected) return null;
    const functions = sourceFile.statements.filter((statement) => (
        ts.isFunctionDeclaration(statement) && statement.name?.text === "verifyRepositoryFailureCodeContract"
    ));
    if (functions.length !== 1 || !functions[0].body) return null;
    const candidates = [];
    for (const statement of functions[0].body.statements) {
        if (!ts.isVariableStatement(statement)
            || (statement.declarationList.flags & ts.NodeFlags.Const) === 0) continue;
        for (const declaration of statement.declarationList.declarations) {
            if (!isIdentifierNamed(declaration.name, bindingName, ts)
                || !ts.isCallExpression(declaration.initializer)
                || !isIdentifierNamed(declaration.initializer.expression, expected.extractor, ts)
                || declaration.initializer.arguments.length !== 2
                || !isIdentifierNamed(declaration.initializer.arguments[0], expected.source, ts)
                || !isIdentifierNamed(declaration.initializer.arguments[1], "ts", ts)) continue;
            candidates.push(declaration);
        }
    }
    return candidates.length === 1 ? candidates[0] : null;
}

function collectFactsBindingDeclarations(functionNode, bindingName, ts) {
    const declarations = [];
    walkAst(ts, functionNode, (node) => {
        const identifiers = [];
        if (ts.isVariableDeclaration(node) || ts.isParameter(node)) {
            collectBindingIdentifiers(node.name, identifiers, ts);
        } else if ((ts.isFunctionDeclaration(node)
                || ts.isFunctionExpression(node)
                || ts.isClassDeclaration(node)
                || ts.isClassExpression(node))
            && node.name) {
            collectBindingIdentifiers(node.name, identifiers, ts);
        }
        if (identifiers.some((identifier) => identifier.text === bindingName)) declarations.push(node);
    });
    return declarations;
}

function isExpectedFactsReceiver(sourceFile, node, bindingName, ts) {
    if (!isIdentifierNamed(node, bindingName, ts)) return false;
    const expectedDeclaration = findExpectedFactsDeclaration(sourceFile, bindingName, ts);
    if (!expectedDeclaration) return false;
    const functionNode = expectedDeclaration.parent.parent.parent.parent;
    if (!ts.isFunctionDeclaration(functionNode)
        || functionNode.name?.text !== "verifyRepositoryFailureCodeContract"
        || enclosingFunctionLikeNode(node, ts) !== functionNode
        || expectedDeclaration.pos >= node.pos) return false;
    const declarations = collectFactsBindingDeclarations(functionNode, bindingName, ts);
    return declarations.length === 1 && declarations[0] === expectedDeclaration;
}

function isFixedElementAccess(node, bindingName, indexText, ts) {
    return Boolean(ts.isElementAccessExpression(node)
        && isIdentifierNamed(node.expression, bindingName, ts)
        && ts.isNumericLiteral(node.argumentExpression)
        && node.argumentExpression.text === indexText);
}

function directCallName(call, ts) {
    if (!ts.isCallExpression(call)) return null;
    if (ts.isIdentifier(call.expression)) return call.expression.text;
    if (ts.isPropertyAccessExpression(call.expression)) return call.expression.name.text;
    return null;
}

function isDeclarationIdentifier(node, ts) {
    const parent = node.parent;
    return Boolean(parent && parent.name === node && (
        ts.isVariableDeclaration(parent)
        || ts.isFunctionDeclaration(parent)
        || ts.isFunctionExpression(parent)
        || ts.isParameter(parent)
        || ts.isClassDeclaration(parent)
    ));
}

function isNonComputedPropertyName(node, ts) {
    const parent = node.parent;
    if (!parent || parent.name !== node) return false;
    return ts.isPropertyAssignment(parent)
        || ts.isPropertyAccessExpression(parent)
        || ts.isMethodDeclaration(parent)
        || ts.isPropertyDeclaration(parent);
}

function hasIntermediateCall(node, targetCall, ts) {
    let current = node.parent;
    while (current && current !== targetCall) {
        if (ts.isCallExpression(current) || ts.isNewExpression(current)) return true;
        current = current.parent;
    }
    return current !== targetCall;
}

function findContainingCall(node, predicate, ts) {
    let current = node.parent;
    while (current) {
        if (ts.isCallExpression(current) && predicate(current)) return current;
        if (ts.isFunctionLike(current)) return null;
        current = current.parent;
    }
    return null;
}

function callArgumentIndexContaining(call, node) {
    return call.arguments.findIndex((argument) => isWithin(node, argument));
}

function isAllowedEqualityReference(node, bindingName, ts) {
    const access = node.parent;
    if (!ts.isElementAccessExpression(access)) return false;
    const functionName = enclosingNamedFunction(node, ts);
    const topLevelFunctionName = enclosingTopLevelFunctionName(node, ts);
    if (functionName === "verifyCanonicalInvariants"
        && ["C1_FAMILY", "HARNESS_FAMILY", "VERIFIER_FAMILY"].includes(bindingName)
        && access.argumentExpression === node
        && isPropertyAccessPath(access.expression, ["normalized", "families"], ts)) {
        const lengthAccess = access.parent;
        const comparison = lengthAccess?.parent;
        const expectedCounts = { C1_FAMILY: "22", HARNESS_FAMILY: "23", VERIFIER_FAMILY: "1" };
        return Boolean(ts.isPropertyAccessExpression(lengthAccess)
            && lengthAccess.expression === access
            && lengthAccess.name.text === "length"
            && ts.isBinaryExpression(comparison)
            && comparison.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken
            && comparison.left === lengthAccess
            && ts.isNumericLiteral(comparison.right)
            && comparison.right.text === expectedCounts[bindingName]);
    }
    if (access.expression !== node) return false;
    const comparison = access.parent;
    if (!ts.isBinaryExpression(comparison)
        || comparison.operatorToken.kind !== ts.SyntaxKind.EqualsEqualsEqualsToken
        || comparison.right !== access) return false;
    if (topLevelFunctionName === "extractC1Facts"
        && bindingName === "C1_CODES"
        && isFixedElementAccess(access, "C1_CODES", "11", ts)) {
        const arrow = enclosingFunctionLikeNode(node, ts);
        const filterCall = arrow?.parent;
        return Boolean(ts.isArrowFunction(arrow)
            && arrow.body === comparison
            && ts.isCallExpression(filterCall)
            && filterCall.arguments[0] === arrow
            && ts.isPropertyAccessExpression(filterCall.expression)
            && isIdentifierNamed(filterCall.expression.expression, "literalOrigins", ts)
            && filterCall.expression.name.text === "filter"
            && isPropertyAccessPath(comparison.left, ["origin", "code"], ts));
    }
    if (topLevelFunctionName === "extractVerifierFacts"
        && bindingName === "VERIFIER_CODES"
        && isFixedElementAccess(access, "VERIFIER_CODES", "0", ts)) {
        const arrow = enclosingFunctionLikeNode(node, ts);
        const walkCall = arrow?.parent;
        return Boolean(ts.isArrowFunction(arrow)
            && ts.isBlock(arrow.body)
            && isWithin(comparison, arrow.body)
            && ts.isCallExpression(walkCall)
            && isIdentifierNamed(walkCall.expression, "walkAst", ts)
            && isIdentifierNamed(walkCall.arguments[0], "ts", ts)
            && isIdentifierNamed(walkCall.arguments[1], "node", ts)
            && walkCall.arguments[2] === arrow
            && isPropertyAccessPath(comparison.left, ["child", "text"], ts));
    }
    if (functionName === "verifyCanonicalInvariants"
        && bindingName === "VERIFIER_CODES"
        && isFixedElementAccess(access, "VERIFIER_CODES", "0", ts)) {
        return isPropertyAccessPath(comparison.left, ["normalized", "structuralGuards", "multipleDeaths", "code"], ts);
    }
    if (functionName === "runFailureCodeContractErrorProbes"
        && bindingName === "C1_CODES"
        && isFixedElementAccess(access, "C1_CODES", "0", ts)) {
        return ts.isCallExpression(comparison.left)
            && isIdentifierNamed(comparison.left.expression, "assertKnownC1FailureCode", ts)
            && comparison.left.arguments.length === 1
            && isFixedElementAccess(comparison.left.arguments[0], "C1_CODES", "0", ts);
    }
    if (functionName === "runFailureCodeContractErrorProbes"
        && bindingName === "HARNESS_CODES"
        && isFixedElementAccess(access, "HARNESS_CODES", "0", ts)) {
        return ts.isCallExpression(comparison.left)
            && isIdentifierNamed(comparison.left.expression, "assertKnownHarnessFailureCode", ts)
            && comparison.left.arguments.length === 1
            && isFixedElementAccess(comparison.left.arguments[0], "HARNESS_CODES", "0", ts);
    }
    return false;
}

function isAllowedMembershipReference(node, bindingName, ts) {
    const call = findContainingCall(node, (candidate) => (
        ts.isPropertyAccessExpression(candidate.expression)
        && candidate.expression.name.text === "includes"
    ), ts);
    if (!call || hasIntermediateCall(node, call, ts) || call.arguments.length !== 1) return false;
    const receiver = call.expression.expression;
    const argument = call.arguments[0];
    const functionName = enclosingNamedFunction(node, ts);
    const topLevelFunctionName = enclosingTopLevelFunctionName(node, ts);

    if (functionName === "normalizeCanonicalPayload"
        && bindingName === "FAMILY_LITERALS"
        && receiver === node) {
        return isIdentifierNamed(argument, "family", ts);
    }
    if (functionName === "extractVerifierFacts"
        && isIdentifierNamed(receiver, "HARNESS_CODES", ts)
        && isFixedElementAccess(argument, "VERIFIER_CODES", "0", ts)) {
        return (bindingName === "HARNESS_CODES" && receiver === node)
            || (bindingName === "VERIFIER_CODES" && argument.expression === node);
    }
    if (topLevelFunctionName === "verifyFamilyLiteralBoundaries"
        && bindingName === "FAMILY_LITERALS"
        && receiver === node) {
        const arrow = enclosingFunctionLikeNode(node, ts);
        const walkCall = arrow?.parent;
        return Boolean(ts.isArrowFunction(arrow)
            && isWithin(call, arrow.body)
            && ts.isCallExpression(walkCall)
            && isIdentifierNamed(walkCall.expression, "walkAst", ts)
            && isIdentifierNamed(walkCall.arguments[0], "ts", ts)
            && (isIdentifierNamed(walkCall.arguments[1], "contractSourceFile", ts)
                || isIdentifierNamed(walkCall.arguments[1], "sourceFile", ts))
            && walkCall.arguments[2] === arrow
            && isPropertyAccessPath(argument, ["node", "text"], ts));
    }
    if (functionName === "verifyRepositoryFailureCodeContract"
        && bindingName === "VERIFIER_CODES"
        && isPropertyAccessPath(receiver, ["harnessFacts", "actualCodes"], ts)) {
        return isExpectedFactsReceiver(node.getSourceFile(), receiver.expression, "harnessFacts", ts)
            && isFixedElementAccess(argument, "VERIFIER_CODES", "0", ts)
            && argument.expression === node;
    }
    if (functionName === "verifyRepositoryFailureCodeContract"
        && bindingName === "C1_CODES"
        && isPropertyAccessPath(receiver, ["c1Facts", "actualCodes"], ts)) {
        return isExpectedFactsReceiver(node.getSourceFile(), receiver.expression, "c1Facts", ts)
            && isFixedElementAccess(argument, "C1_CODES", "20", ts)
            && argument.expression === node;
    }
    return false;
}

function isAllowedComparisonHelperArgument(node, bindingName, ts) {
    const call = findContainingCall(node, (candidate) => ts.isIdentifier(candidate.expression), ts);
    if (!call || hasIntermediateCall(node, call, ts)) return false;
    const callee = call.expression.text;
    const argumentIndex = callArgumentIndexContaining(call, node);
    const functionName = enclosingNamedFunction(node, ts);

    if (callee === "includesCode"
        && call.arguments.length === 2
        && argumentIndex === 0
        && call.arguments[0] === node
        && isIdentifierNamed(call.arguments[1], "code", ts)) {
        return (functionName === "isKnownC1FailureCode" && bindingName === "C1_CODES")
            || (functionName === "isKnownHarnessFailureCode" && bindingName === "HARNESS_CODES");
    }
    if (callee === "assertKnownCode"
        && call.arguments.length === 3
        && argumentIndex === 1
        && call.arguments[1] === node
        && isIdentifierNamed(call.arguments[2], "code", ts)) {
        return (functionName === "assertKnownC1FailureCode"
                && bindingName === "C1_CODES"
                && ts.isStringLiteral(call.arguments[0])
                && call.arguments[0].text === "c1")
            || (functionName === "assertKnownHarnessFailureCode"
                && bindingName === "HARNESS_CODES"
                && ts.isStringLiteral(call.arguments[0])
                && call.arguments[0].text === "harness");
    }
    if (callee === "compareExactCodeSet"
        && call.arguments.length === 3
        && argumentIndex === 1
        && call.arguments[1] === node
        && ts.isStringLiteral(call.arguments[2])) {
        if (functionName === "extractC1Facts" && bindingName === "C1_CODES") {
            return ts.isArrayLiteralExpression(call.arguments[0]) && call.arguments[2].text === "C1 actual set";
        }
        if (functionName === "extractHarnessFacts" && bindingName === "HARNESS_CODES") {
            const actual = call.arguments[0];
            return ts.isCallExpression(actual)
                && ts.isPropertyAccessExpression(actual.expression)
                && isIdentifierNamed(actual.expression.expression, "origins", ts)
                && actual.expression.name.text === "map"
                && actual.arguments.length === 1
                && ts.isArrowFunction(actual.arguments[0])
                && call.arguments[2].text === "harness actual set";
        }
        if (functionName === "verifyRepositoryFailureCodeContract" && bindingName === "VERIFIER_CODES") {
            return isPropertyAccessPath(call.arguments[0], ["verifierFacts", "actualCodes"], ts)
                && isExpectedFactsReceiver(node.getSourceFile(), call.arguments[0].expression, "verifierFacts", ts)
                && call.arguments[2].text === "verifier assertion actual set";
        }
    }

    if (functionName === "runFailureCodeContractErrorProbes"
        && callee === "assertKnownC1FailureCode"
        && bindingName === "C1_CODES"
        && argumentIndex === 0
        && isFixedElementAccess(call.arguments[0], "C1_CODES", "0", ts)) {
        return call.arguments[0].expression === node;
    }
    if (functionName === "runFailureCodeContractErrorProbes"
        && callee === "assertKnownHarnessFailureCode"
        && bindingName === "HARNESS_CODES"
        && argumentIndex === 0
        && isFixedElementAccess(call.arguments[0], "HARNESS_CODES", "0", ts)) {
        return call.arguments[0].expression === node;
    }

    if (functionName === "normalizeCanonicalPayload"
        && callee === "assertExactKeys"
        && argumentIndex === 1
        && ["C1_FAMILY", "HARNESS_FAMILY", "VERIFIER_FAMILY"].includes(bindingName)) {
        const expectedNames = ["C1_FAMILY", "HARNESS_FAMILY", "VERIFIER_FAMILY"];
        const array = call.arguments[1];
        return call.arguments.length === 3
            && isPropertyAccessPath(call.arguments[0], ["payload", "families"], ts)
            && ts.isStringLiteral(call.arguments[2])
            && call.arguments[2].text === "families"
            && ts.isArrayLiteralExpression(array)
            && array.elements.length === expectedNames.length
            && array.elements.every((element, index) => isIdentifierNamed(element, expectedNames[index], ts));
    }
    return false;
}

function propertyNameLabel(name, ts) {
    if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
    if (ts.isComputedPropertyName(name)) return "[computed]";
    return "[unknown]";
}

function containingPropertyPath(node, ts) {
    const parts = [];
    let current = node.parent;
    while (current && !ts.isFunctionLike(current)) {
        if (ts.isPropertyAssignment(current)) parts.unshift(propertyNameLabel(current.name, ts));
        current = current.parent;
    }
    return parts.join(".");
}

function findVariableDeclaration(node, variableName, ts) {
    let current = node.parent;
    while (current && !ts.isFunctionLike(current)) {
        if (ts.isVariableDeclaration(current) && ts.isIdentifier(current.name) && current.name.text === variableName) return current;
        current = current.parent;
    }
    return null;
}

function isAllowedTopLevelFamilySetReference(node, bindingName, ts) {
    if (!["C1_FAMILY", "HARNESS_FAMILY", "VERIFIER_FAMILY"].includes(bindingName)) return false;
    const declaration = findVariableDeclaration(node, "FAMILY_LITERALS", ts);
    return Boolean(declaration
        && ts.isCallExpression(declaration.initializer)
        && ts.isPropertyAccessExpression(declaration.initializer.expression)
        && ts.isIdentifier(declaration.initializer.expression.expression)
        && declaration.initializer.expression.expression.text === "Object"
        && declaration.initializer.expression.name.text === "freeze"
        && declaration.initializer.arguments.length === 1
        && ts.isArrayLiteralExpression(declaration.initializer.arguments[0]));
}

function isAllowedCodeToFamilyBuilderReference(node, bindingName, ts) {
    if (enclosingNamedFunction(node, ts) !== "buildCodeToFamily") return false;
    if (["C1_CODES", "HARNESS_CODES", "VERIFIER_CODES"].includes(bindingName)) {
        return ts.isForOfStatement(node.parent) && node.parent.expression === node;
    }
    if (["C1_FAMILY", "HARNESS_FAMILY", "VERIFIER_FAMILY"].includes(bindingName)) {
        const array = node.parent;
        const call = array?.parent;
        return Boolean(ts.isArrayLiteralExpression(array)
            && ts.isCallExpression(call)
            && ts.isPropertyAccessExpression(call.expression)
            && ts.isIdentifier(call.expression.expression)
            && call.expression.expression.text === "entries"
            && call.expression.name.text === "push"
            && call.arguments[0] === array);
    }
    return false;
}

function isAllowedPayloadBuilderReference(node, bindingName, ts) {
    if (enclosingNamedFunction(node, ts) !== "buildCanonicalContractPayload") return false;
    const propertyPath = containingPropertyPath(node, ts);
    if (["C1_FAMILY", "HARNESS_FAMILY", "VERIFIER_FAMILY"].includes(bindingName)) {
        return propertyPath === "families.[computed]" && ts.isComputedPropertyName(node.parent);
    }
    if (["C1_CODES", "HARNESS_CODES", "VERIFIER_CODES"].includes(bindingName)) {
        if (propertyPath === "families.[computed]") return ts.isSpreadElement(node.parent);
        return bindingName === "VERIFIER_CODES"
            && propertyPath === "structuralGuards.multipleDeaths.code"
            && ts.isElementAccessExpression(node.parent)
            && node.parent.expression === node;
    }
    if (bindingName === "buildCodeToFamily") {
        return propertyPath === "codeToFamily"
            && ts.isCallExpression(node.parent)
            && node.parent.expression === node;
    }
    return false;
}

function isAllowedNormalizerReference(node, bindingName, ts) {
    if (enclosingNamedFunction(node, ts) !== "normalizeCanonicalPayload") return false;
    if (["C1_FAMILY", "HARNESS_FAMILY", "VERIFIER_FAMILY"].includes(bindingName)) {
        const declaration = findVariableDeclaration(node, "families", ts);
        if (!declaration || !declaration.initializer || !isWithin(node, declaration.initializer)) return false;
        return ts.isComputedPropertyName(node.parent)
            || (ts.isElementAccessExpression(node.parent) && node.parent.argumentExpression === node)
            || ts.isTemplateSpan(node.parent);
    }
    if (bindingName === "codeToFamily") {
        if (ts.isElementAccessExpression(node.parent) && node.parent.expression === node) {
            const assignment = node.parent.parent;
            return ts.isBinaryExpression(assignment)
                && assignment.operatorToken.kind === ts.SyntaxKind.EqualsToken
                && assignment.left === node.parent;
        }
        return ts.isShorthandPropertyAssignment(node.parent);
    }
    return false;
}

function isAllowedVerifierActualSetReference(node, bindingName, ts) {
    if (bindingName !== "VERIFIER_CODES" || enclosingNamedFunction(node, ts) !== "extractVerifierFacts") return false;
    if (!ts.isElementAccessExpression(node.parent) || node.parent.expression !== node) return false;
    let current = node.parent.parent;
    while (current && !ts.isFunctionLike(current)) {
        if (ts.isPropertyAssignment(current)
            && propertyNameLabel(current.name, ts) === "actualCodes"
            && ts.isArrayLiteralExpression(current.initializer)
            && isWithin(node, current.initializer)) return true;
        current = current.parent;
    }
    return false;
}

function isAllowedOwnGuardReference(node, bindingName, ts) {
    if (!["C1_CODES", "HARNESS_CODES", "VERIFIER_CODES"].includes(bindingName)
        || enclosingNamedFunction(node, ts) !== "verifyContractOwnFile"
        || !ts.isSpreadElement(node.parent)) return false;
    const declaration = findVariableDeclaration(node, "canonicalExpectedLiterals", ts);
    return Boolean(declaration && ts.isNewExpression(declaration.initializer));
}

function isAllowedFamilyBoundaryReference(node, bindingName, ts) {
    if (!["FAMILY_LITERALS", "DEPRECATED_FAMILY_LITERALS"].includes(bindingName)
        || enclosingNamedFunction(node, ts) !== "verifyFamilyLiteralBoundaries") return false;
    return ts.isForOfStatement(node.parent) && node.parent.expression === node;
}

function isAllowedSerializationProbeReference(node, bindingName, ts) {
    if (enclosingNamedFunction(node, ts) !== "runCanonicalSerializationProbes") return false;
    if (["C1_FAMILY", "HARNESS_FAMILY", "VERIFIER_FAMILY"].includes(bindingName)
        && ts.isElementAccessExpression(node.parent)
        && node.parent.argumentExpression === node) {
        const reverseAccess = node.parent.parent;
        const reverseCall = reverseAccess?.parent;
        return Boolean(ts.isPropertyAccessExpression(reverseAccess)
            && reverseAccess.name.text === "reverse"
            && ts.isCallExpression(reverseCall)
            && reverseCall.expression === reverseAccess);
    }
    return false;
}

function isAllowedActualMappingReference(node, bindingName, ts) {
    if (!["C1_FAMILY", "HARNESS_FAMILY", "VERIFIER_FAMILY"].includes(bindingName)
        || enclosingNamedFunction(node, ts) !== "verifyRepositoryFailureCodeContract") return false;
    const assignment = node.parent;
    return Boolean(ts.isBinaryExpression(assignment)
        && assignment.operatorToken.kind === ts.SyntaxKind.EqualsToken
        && assignment.right === node
        && ts.isElementAccessExpression(assignment.left)
        && ts.isIdentifier(assignment.left.expression)
        && assignment.left.expression.text === "actualMapping");
}

function isAllowedBuildMappingCallReference(node, bindingName, ts) {
    if (bindingName !== "buildCodeToFamily" || !ts.isCallExpression(node.parent) || node.parent.expression !== node) return false;
    const functionName = enclosingNamedFunction(node, ts);
    if (functionName === "buildCanonicalContractPayload") return containingPropertyPath(node, ts) === "codeToFamily";
    if (functionName === "verifyCanonicalInvariants") {
        const declaration = node.parent.parent;
        return ts.isVariableDeclaration(declaration)
            && ts.isIdentifier(declaration.name)
            && declaration.name.text === "expectedMapping"
            && declaration.initializer === node.parent;
    }
    if (functionName === "verifyRepositoryFailureCodeContract") {
        const stringifyCall = node.parent.parent;
        return Boolean(ts.isCallExpression(stringifyCall)
            && ts.isPropertyAccessExpression(stringifyCall.expression)
            && ts.isIdentifier(stringifyCall.expression.expression)
            && stringifyCall.expression.expression.text === "JSON"
            && stringifyCall.expression.name.text === "stringify");
    }
    return false;
}

function isAllowedCodeToFamilyPropertyReference(node, ts) {
    const functionName = enclosingNamedFunction(node, ts);
    if (functionName === "normalizeCanonicalPayload") {
        if (!isPropertyAccessPath(node, ["payload", "codeToFamily"], ts)) return false;
        const parent = node.parent;
        if (ts.isElementAccessExpression(parent) && parent.expression === node) {
            const call = parent.parent;
            return Boolean(ts.isCallExpression(call)
                && isIdentifierNamed(call.expression, "assertAsciiString", ts)
                && call.arguments[0] === parent);
        }
        const call = findContainingCall(node, () => true, ts);
        if (!call || hasIntermediateCall(node, call, ts)) return false;
        if (isIdentifierNamed(call.expression, "isPlainObject", ts)) return call.arguments[0] === node;
        return ts.isPropertyAccessExpression(call.expression)
            && isIdentifierNamed(call.expression.expression, "Object", ts)
            && call.expression.name.text === "keys"
            && call.arguments[0] === node;
    }
    if (functionName === "verifyCanonicalInvariants") {
        if (!isPropertyAccessPath(node, ["normalized", "codeToFamily"], ts)) return false;
        const call = findContainingCall(node, () => true, ts);
        if (!call || hasIntermediateCall(node, call, ts)
            || !ts.isPropertyAccessExpression(call.expression)
            || call.arguments[0] !== node) return false;
        return (isIdentifierNamed(call.expression.expression, "Object", ts) && call.expression.name.text === "keys")
            || (isIdentifierNamed(call.expression.expression, "JSON", ts) && call.expression.name.text === "stringify");
    }
    if (functionName === "runCanonicalSerializationProbes") {
        if (!isPropertyAccessPath(node, ["reordered", "codeToFamily"], ts)) return false;
        const parent = node.parent;
        if (ts.isBinaryExpression(parent)
            && parent.operatorToken.kind === ts.SyntaxKind.EqualsToken
            && parent.left === node) return true;
        const call = findContainingCall(node, () => true, ts);
        return Boolean(call
            && !hasIntermediateCall(node, call, ts)
            && ts.isPropertyAccessExpression(call.expression)
            && isIdentifierNamed(call.expression.expression, "Object", ts)
            && call.expression.name.text === "entries"
            && call.arguments[0] === node);
    }
    return false;
}

function isAllowedVisibleOutputGuardReference(node, bindingName, ts) {
    if (bindingName !== "DEPRECATED_FAMILY_LITERALS"
        || enclosingNamedFunction(node, ts) !== "inspectVisibleOutputLines"
        || !ts.isSpreadElement(node.parent)) return false;
    const declaration = findVariableDeclaration(node, "familyVocabulary", ts);
    return Boolean(declaration && ts.isArrayLiteralExpression(declaration.initializer));
}

function isAllowedCanonicalReference(node, bindingName, ts) {
    return isAllowedEqualityReference(node, bindingName, ts)
        || isAllowedMembershipReference(node, bindingName, ts)
        || isAllowedComparisonHelperArgument(node, bindingName, ts)
        || isAllowedTopLevelFamilySetReference(node, bindingName, ts)
        || isAllowedCodeToFamilyBuilderReference(node, bindingName, ts)
        || isAllowedPayloadBuilderReference(node, bindingName, ts)
        || isAllowedNormalizerReference(node, bindingName, ts)
        || isAllowedVerifierActualSetReference(node, bindingName, ts)
        || isAllowedOwnGuardReference(node, bindingName, ts)
        || isAllowedFamilyBoundaryReference(node, bindingName, ts)
        || isAllowedSerializationProbeReference(node, bindingName, ts)
        || isAllowedActualMappingReference(node, bindingName, ts)
        || isAllowedBuildMappingCallReference(node, bindingName, ts)
        || isAllowedVisibleOutputGuardReference(node, bindingName, ts);
}

function isExpectedCanonicalBindingDeclaration(sourceFile, node, ts) {
    const parent = node.parent;
    if (node.text === "buildCodeToFamily") {
        return ts.isFunctionDeclaration(parent) && parent.name === node && parent.parent === sourceFile;
    }
    if (!ts.isVariableDeclaration(parent) || parent.name !== node) return false;
    const declarationList = parent.parent;
    const statement = declarationList?.parent;
    const isConst = ts.isVariableDeclarationList(declarationList)
        && (declarationList.flags & ts.NodeFlags.Const) !== 0;
    if (node.text === "codeToFamily") {
        return isConst
            && enclosingNamedFunction(node, ts) === "normalizeCanonicalPayload"
            && ts.isObjectLiteralExpression(parent.initializer);
    }
    if (!isConst || !ts.isVariableStatement(statement) || statement.parent !== sourceFile) return false;
    if (["C1_FAMILY", "HARNESS_FAMILY", "VERIFIER_FAMILY"].includes(node.text)) {
        return ts.isStringLiteral(parent.initializer);
    }
    if (["C1_CODES", "HARNESS_CODES", "VERIFIER_CODES", "FAMILY_LITERALS", "DEPRECATED_FAMILY_LITERALS"].includes(node.text)) {
        return Boolean(ts.isCallExpression(parent.initializer)
            && ts.isPropertyAccessExpression(parent.initializer.expression)
            && isIdentifierNamed(parent.initializer.expression.expression, "Object", ts)
            && parent.initializer.expression.name.text === "freeze"
            && parent.initializer.arguments.length === 1
            && ts.isArrayLiteralExpression(parent.initializer.arguments[0]));
    }
    return false;
}

function verifyCanonicalReferenceContexts(sourceFile, ts) {
    const protectedNames = new Set(CANONICAL_REFERENCE_BINDING_NAMES);
    const violations = [];
    let referenceCount = 0;
    walkAst(ts, sourceFile, (node) => {
        if (ts.isPropertyAccessExpression(node) && node.name.text === "codeToFamily") {
            referenceCount++;
            if (!isAllowedCodeToFamilyPropertyReference(node, ts)) {
                violations.push({ binding: "codeToFamily", line: lineOf(sourceFile, node), context: ts.SyntaxKind[node.parent.kind] });
            }
            return;
        }
        if (!ts.isIdentifier(node) || !protectedNames.has(node.text)) return;
        if (isDeclarationIdentifier(node, ts)) {
            if (!isExpectedCanonicalBindingDeclaration(sourceFile, node, ts)) {
                violations.push({ binding: node.text, line: lineOf(sourceFile, node), context: "UnexpectedBindingDeclaration" });
            }
            return;
        }
        if (isNonComputedPropertyName(node, ts)) return;
        referenceCount++;
        if (!isAllowedCanonicalReference(node, node.text, ts)) {
            violations.push({ binding: node.text, line: lineOf(sourceFile, node), context: ts.SyntaxKind[node.parent.kind] });
        }
    });
    contractCheck(
        violations.length === 0,
        `canonical direct reference escaped context whitelist: ${violations.slice(0, 5).map((entry) => `${entry.binding}@${entry.line}:${entry.context}`).join(",")}`,
    );
    return { referenceCount, violations: [] };
}

function runWholeFunctionExemptionSweep(sourceFile, ts) {
    const startIndex = sourceFile.statements.findIndex((statement) => (
        ts.isFunctionDeclaration(statement) && statement.name?.text === "isAllowedEqualityReference"
    ));
    const endIndex = sourceFile.statements.findIndex((statement) => (
        ts.isFunctionDeclaration(statement) && statement.name?.text === "verifyContractOwnFile"
    ));
    contractCheck(startIndex >= 0 && endIndex >= startIndex, "canonical-reference function sweep anchors changed");
    const functionNames = sourceFile.statements
        .slice(startIndex, endIndex + 1)
        .filter((statement) => ts.isFunctionDeclaration(statement) && statement.name)
        .map((statement) => statement.name.text);
    const bindingNames = CANONICAL_REFERENCE_BINDING_NAMES.filter((bindingName) => bindingName !== "codeToFamily");
    const astShapes = [
        { name: "bareReturn", render: (bindingName) => `return ${bindingName};` },
        { name: "elementAccess", render: (bindingName) => `return ${bindingName}[0];` },
        { name: "arrayElement", render: (bindingName) => `return [${bindingName}];` },
        { name: "objectValue", render: (bindingName) => `return { value: ${bindingName} };` },
        { name: "unknownCallArgument", render: (bindingName) => `return unknown(${bindingName});` },
        { name: "aliasInitializer", render: (bindingName) => `const alias = ${bindingName}; return alias;` },
        { name: "throwExpression", render: (bindingName) => `throw ${bindingName};` },
        { name: "spreadElement", render: (bindingName) => `return [...${bindingName}];` },
        { name: "nestedObjectValue", render: (bindingName) => `return ({ nested: { value: ${bindingName} } }).nested.value;` },
    ];
    contractCheck(bindingNames.length === 9 && astShapes.length === 9, "whole-function sweep dimensions changed");
    let parseDiagnostics = 0;
    let acceptedCount = 0;
    let rejectedCount = 0;
    let caseCount = 0;
    for (const functionName of functionNames) {
        for (const bindingName of bindingNames) {
            for (const astShape of astShapes) {
                const fixtureSourceFile = ts.createSourceFile(
                    `whole-function-${functionName}-${bindingName}-${astShape.name}.cjs`,
                    `function ${functionName}() { ${astShape.render(bindingName)} }`,
                    ts.ScriptTarget.Latest,
                    true,
                    ts.ScriptKind.JS,
                );
                caseCount++;
                parseDiagnostics += fixtureSourceFile.parseDiagnostics.length;
                try {
                    verifyCanonicalReferenceContexts(fixtureSourceFile, ts);
                    acceptedCount++;
                } catch (_error) {
                    rejectedCount++;
                }
            }
        }
    }
    const expectedCaseCount = functionNames.length * bindingNames.length * astShapes.length;
    const caseCountFormulaMatches = caseCount === expectedCaseCount;
    const allCasesAccountedFor = acceptedCount + rejectedCount === caseCount;
    contractCheck(parseDiagnostics === 0, "whole-function exemption sweep fixtures have parse diagnostics");
    contractCheck(caseCountFormulaMatches, "whole-function exemption sweep case formula changed");
    contractCheck(acceptedCount === 0 && rejectedCount === caseCount && allCasesAccountedFor, "whole-function exemption sweep accepted a canonical reference");
    return {
        functionNames,
        protectedBindingNames: bindingNames,
        astShapeNames: astShapes.map((astShape) => astShape.name),
        functionCount: functionNames.length,
        protectedBindingCount: bindingNames.length,
        astShapeCount: astShapes.length,
        expectedCaseCount,
        caseCount,
        caseCountFormulaMatches,
        acceptedCount,
        rejectedCount,
        allCasesAccountedFor,
        wholeFunctionExemption: acceptedCount !== 0,
        parseDiagnostics,
    };
}

function runCanonicalReferenceContextFixtures(sourceFile, ts) {
    const cases = [
        {
            key: "elementAccessSink",
            sourceText: "console.error(C1_CODES[0]);",
            expectedPass: false,
        },
        {
            key: "bareAlias",
            sourceText: "const x = HARNESS_CODES[3];",
            expectedPass: false,
        },
        {
            key: "receiverEvilIncludes",
            sourceText: "evilSink.includes(C1_CODES[0]);",
            expectedPass: false,
        },
        {
            key: "receiverLoggerHas",
            sourceText: "logger.has(HARNESS_CODES[0]);",
            expectedPass: false,
        },
        {
            key: "receiverExfilIncludes",
            sourceText: "exfil.includes(C1_CODES);",
            expectedPass: false,
        },
        {
            key: "receiverAnyObjectHelper",
            sourceText: "anyObj.includesCode(C1_CODES);",
            expectedPass: false,
        },
        {
            key: "receiverWeirdComparison",
            sourceText: "weird.compareExactCodeSet(x, HARNESS_CODES, 'l');",
            expectedPass: false,
        },
        {
            key: "shadowedReceiverBinding",
            sourceText: "function extractVerifierFacts() { const HARNESS_CODES = []; return HARNESS_CODES.includes(VERIFIER_CODES[0]); }",
            expectedPass: false,
        },
        {
            key: "propertyPathConstShadow",
            sourceText: "function verifyRepositoryFailureCodeContract() { const harnessFacts = extractHarnessFacts(harnessSourceFile, ts); { const harnessFacts = fake; return harnessFacts.actualCodes.includes(VERIFIER_CODES[0]); } }",
            expectedPass: false,
        },
        {
            key: "propertyPathLetShadow",
            sourceText: "function verifyRepositoryFailureCodeContract() { const harnessFacts = extractHarnessFacts(harnessSourceFile, ts); { let harnessFacts = fake; return harnessFacts.actualCodes.includes(VERIFIER_CODES[0]); } }",
            expectedPass: false,
        },
        {
            key: "propertyPathForOfShadow",
            sourceText: "function verifyRepositoryFailureCodeContract() { const harnessFacts = extractHarnessFacts(harnessSourceFile, ts); for (const harnessFacts of values) { harnessFacts.actualCodes.includes(VERIFIER_CODES[0]); } }",
            expectedPass: false,
        },
        {
            key: "propertyPathCatchShadow",
            sourceText: "function verifyRepositoryFailureCodeContract() { const c1Facts = extractC1Facts(c1SourceFile, ts); try {} catch (c1Facts) { c1Facts.actualCodes.includes(C1_CODES[20]); } }",
            expectedPass: false,
        },
        {
            key: "propertyPathObjectReceiverShadow",
            sourceText: "function verifyRepositoryFailureCodeContract() { const c1Facts = extractC1Facts(c1SourceFile, ts); { const c1Facts = { actualCodes: evilSink }; return c1Facts.actualCodes.includes(C1_CODES[20]); } }",
            expectedPass: false,
        },
        {
            key: "propertyPathVerifierComparisonShadow",
            sourceText: "function verifyRepositoryFailureCodeContract() { const verifierFacts = extractVerifierFacts(verifierSourceFile, ts); { const verifierFacts = fake; return compareExactCodeSet(verifierFacts.actualCodes, VERIFIER_CODES, 'verifier assertion actual set'); } }",
            expectedPass: false,
        },
        {
            key: "propertyPathParameterShadow",
            sourceText: "function verifyRepositoryFailureCodeContract(harnessFacts) { return harnessFacts.actualCodes.includes(VERIFIER_CODES[0]); }",
            expectedPass: false,
        },
        {
            key: "propertyPathVarShadow",
            sourceText: "function verifyRepositoryFailureCodeContract() { var harnessFacts = fake; return harnessFacts.actualCodes.includes(VERIFIER_CODES[0]); }",
            expectedPass: false,
        },
        {
            key: "propertyPathForInShadow",
            sourceText: "function verifyRepositoryFailureCodeContract() { const harnessFacts = extractHarnessFacts(harnessSourceFile, ts); for (const harnessFacts in values) { harnessFacts.actualCodes.includes(VERIFIER_CODES[0]); } }",
            expectedPass: false,
        },
        {
            key: "propertyPathDestructuringShadow",
            sourceText: "function verifyRepositoryFailureCodeContract() { const harnessFacts = extractHarnessFacts(harnessSourceFile, ts); { const { harnessFacts } = fake; return harnessFacts.actualCodes.includes(VERIFIER_CODES[0]); } }",
            expectedPass: false,
        },
        {
            key: "propertyPathFunctionDeclarationShadow",
            sourceText: "function verifyRepositoryFailureCodeContract() { const harnessFacts = extractHarnessFacts(harnessSourceFile, ts); { function harnessFacts() {} return harnessFacts.actualCodes.includes(VERIFIER_CODES[0]); } }",
            expectedPass: false,
        },
        {
            key: "propertyPathClassDeclarationShadow",
            sourceText: "function verifyRepositoryFailureCodeContract() { const harnessFacts = extractHarnessFacts(harnessSourceFile, ts); { class harnessFacts {} return harnessFacts.actualCodes.includes(VERIFIER_CODES[0]); } }",
            expectedPass: false,
        },
        {
            key: "propertyPathNamedFunctionExpressionShadow",
            sourceText: "function verifyRepositoryFailureCodeContract() { const verifierFacts = extractVerifierFacts(verifierSourceFile, ts); const invoke = function verifierFacts() { return compareExactCodeSet(verifierFacts.actualCodes, VERIFIER_CODES, 'verifier assertion actual set'); }; return invoke(); }",
            expectedPass: false,
        },
        {
            key: "propertyPathNestedBlockShadow",
            sourceText: "function verifyRepositoryFailureCodeContract() { const c1Facts = extractC1Facts(c1SourceFile, ts); { let c1Facts = fake; return c1Facts.actualCodes.includes(C1_CODES[20]); } }",
            expectedPass: false,
        },
        {
            key: "propertyPathWrongRoot",
            sourceText: "function verifyRepositoryFailureCodeContract() { const harnessFacts = extractHarnessFacts(harnessSourceFile, ts); return other.actualCodes.includes(VERIFIER_CODES[0]); }",
            expectedPass: false,
        },
        {
            key: "propertyPathDeeperWrongRoot",
            sourceText: "function verifyRepositoryFailureCodeContract() { const harnessFacts = extractHarnessFacts(harnessSourceFile, ts); return a.harnessFacts.actualCodes.includes(VERIFIER_CODES[0]); }",
            expectedPass: false,
        },
        {
            key: "propertyPathComputedProperty",
            sourceText: "function verifyRepositoryFailureCodeContract() { const harnessFacts = extractHarnessFacts(harnessSourceFile, ts); return harnessFacts['actualCodes'].includes(VERIFIER_CODES[0]); }",
            expectedPass: false,
        },
        {
            key: "propertyPathComputedMethod",
            sourceText: "function verifyRepositoryFailureCodeContract() { const harnessFacts = extractHarnessFacts(harnessSourceFile, ts); return harnessFacts.actualCodes['includes'](VERIFIER_CODES[0]); }",
            expectedPass: false,
        },
        {
            key: "propertyPathWrongProperty",
            sourceText: "function verifyRepositoryFailureCodeContract() { const harnessFacts = extractHarnessFacts(harnessSourceFile, ts); return harnessFacts.codes.includes(VERIFIER_CODES[0]); }",
            expectedPass: false,
        },
        {
            key: "propertyPathWrongMethod",
            sourceText: "function verifyRepositoryFailureCodeContract() { const harnessFacts = extractHarnessFacts(harnessSourceFile, ts); return harnessFacts.actualCodes.indexOf(VERIFIER_CODES[0]); }",
            expectedPass: false,
        },
        {
            key: "propertyPathWrongArgumentIndex",
            sourceText: "function verifyRepositoryFailureCodeContract() { const c1Facts = extractC1Facts(c1SourceFile, ts); return c1Facts.actualCodes.includes(other, C1_CODES[20]); }",
            expectedPass: false,
        },
        {
            key: "propertyPathSwappedRootBinding",
            sourceText: "function verifyRepositoryFailureCodeContract() { const harnessFacts = extractHarnessFacts(harnessSourceFile, ts); return harnessFacts.actualCodes.includes(C1_CODES[20]); }",
            expectedPass: false,
        },
        {
            key: "propertyPathSpreadArgument",
            sourceText: "function verifyRepositoryFailureCodeContract() { const harnessFacts = extractHarnessFacts(harnessSourceFile, ts); return harnessFacts.actualCodes.includes(...VERIFIER_CODES); }",
            expectedPass: false,
        },
        {
            key: "propertyPathTwoArgumentIncludes",
            sourceText: "function verifyRepositoryFailureCodeContract() { const harnessFacts = extractHarnessFacts(harnessSourceFile, ts); return harnessFacts.actualCodes.includes(VERIFIER_CODES[0], extra); }",
            expectedPass: false,
        },
        {
            key: "propertyPathWrongTopLevelFunction",
            sourceText: "function wrongContext() { const harnessFacts = extractHarnessFacts(harnessSourceFile, ts); return harnessFacts.actualCodes.includes(VERIFIER_CODES[0]); }",
            expectedPass: false,
        },
        {
            key: "propertyPathOtherFunctionParameter",
            sourceText: "function otherFunction(harnessFacts) { return harnessFacts.actualCodes.includes(VERIFIER_CODES[0]); }",
            expectedPass: false,
        },
        {
            key: "propertyPathNonExpectedDeclaration",
            sourceText: "function verifyRepositoryFailureCodeContract() { const harnessFacts = extractC1Facts(c1SourceFile, ts); return harnessFacts.actualCodes.includes(VERIFIER_CODES[0]); }",
            expectedPass: false,
        },
        {
            key: "propertyPathHarnessLegal",
            sourceText: "function verifyRepositoryFailureCodeContract() { const harnessFacts = extractHarnessFacts(harnessSourceFile, ts); return !harnessFacts.actualCodes.includes(VERIFIER_CODES[0]); }",
            expectedPass: true,
        },
        {
            key: "propertyPathC1Legal",
            sourceText: "function verifyRepositoryFailureCodeContract() { const c1Facts = extractC1Facts(c1SourceFile, ts); return c1Facts.actualCodes.includes(C1_CODES[20]); }",
            expectedPass: true,
        },
        {
            key: "propertyPathVerifierLegal",
            sourceText: "function verifyRepositoryFailureCodeContract() { const verifierFacts = extractVerifierFacts(verifierSourceFile, ts); return compareExactCodeSet(verifierFacts.actualCodes, VERIFIER_CODES, 'verifier assertion actual set'); }",
            expectedPass: true,
        },
        {
            key: "unknownCall",
            sourceText: "unknownCall(VERIFIER_CODES[0]);",
            expectedPass: false,
        },
        {
            key: "directAlias",
            sourceText: "const x = C1_CODES[0];",
            expectedPass: false,
        },
        {
            key: "mappingAlias",
            sourceText: "const x = codeToFamily;",
            expectedPass: false,
        },
        {
            key: "returnEscape",
            sourceText: "function wrongContext() { return C1_CODES[0]; }",
            expectedPass: false,
        },
        {
            key: "throwEscape",
            sourceText: "function wrongContext() { throw HARNESS_CODES[0]; }",
            expectedPass: false,
        },
        {
            key: "membershipLegal",
            sourceText: "function extractVerifierFacts() { return HARNESS_CODES.includes(VERIFIER_CODES[0]); }",
            expectedPass: true,
        },
        {
            key: "equalityLegal",
            sourceText: "function verifyCanonicalInvariants() { return normalized.structuralGuards.multipleDeaths.code === VERIFIER_CODES[0]; }",
            expectedPass: true,
        },
        {
            key: "comparisonHelperLegal",
            sourceText: "function extractHarnessFacts() { return compareExactCodeSet(origins.map((origin) => origin.code), HARNESS_CODES, 'harness actual set'); }",
            expectedPass: true,
        },
        {
            key: "payloadBuilderLegal",
            sourceText: "function buildCanonicalContractPayload() { return { families: { [C1_FAMILY]: [...C1_CODES], [HARNESS_FAMILY]: [...HARNESS_CODES], [VERIFIER_FAMILY]: [...VERIFIER_CODES] }, codeToFamily: buildCodeToFamily(), structuralGuards: { multipleDeaths: { code: VERIFIER_CODES[0] } } }; }",
            expectedPass: true,
        },
        {
            key: "payloadBuilderWrongFunction",
            sourceText: "function wrongPayloadBuilder() { return { families: { [C1_FAMILY]: [...C1_CODES] } }; }",
            expectedPass: false,
        },
        {
            key: "guardSelfReadLegal",
            sourceText: "function verifyContractOwnFile() { const canonicalExpectedLiterals = new Set([...C1_CODES, ...HARNESS_CODES, ...VERIFIER_CODES]); return canonicalExpectedLiterals; }",
            expectedPass: true,
        },
        {
            key: "guardSelfReadWrongContext",
            sourceText: "function wrongGuard() { const canonicalExpectedLiterals = new Set([...C1_CODES, ...HARNESS_CODES, ...VERIFIER_CODES]); return canonicalExpectedLiterals; }",
            expectedPass: false,
        },
    ];
    const results = {};
    let fixtureParseDiagnosticsTotal = 0;
    for (const fixture of cases) {
        const fixtureSourceFile = ts.createSourceFile(
            `canonical-reference-${fixture.key}.cjs`,
            fixture.sourceText,
            ts.ScriptTarget.Latest,
            true,
            ts.ScriptKind.JS,
        );
        fixtureParseDiagnosticsTotal += fixtureSourceFile.parseDiagnostics.length;
        let passed = true;
        try {
            verifyCanonicalReferenceContexts(fixtureSourceFile, ts);
        } catch (_error) {
            passed = false;
        }
        contractCheck(passed === fixture.expectedPass, `canonical reference fixture ${fixture.key} result changed`);
        results[fixture.key] = passed ? "PASS_EXPECTED" : "FAIL_EXPECTED";
    }
    const receiverEscapeKeys = [
        "receiverEvilIncludes",
        "receiverLoggerHas",
        "receiverExfilIncludes",
        "receiverAnyObjectHelper",
        "receiverWeirdComparison",
        "shadowedReceiverBinding",
    ];
    const positiveControlKeys = [
        "membershipLegal",
        "equalityLegal",
        "comparisonHelperLegal",
        "payloadBuilderLegal",
        "guardSelfReadLegal",
    ];
    const propertyPathLegalKeys = [
        "propertyPathHarnessLegal",
        "propertyPathC1Legal",
        "propertyPathVerifierLegal",
    ];
    const propertyPathShadowKeys = [
        "propertyPathConstShadow",
        "propertyPathLetShadow",
        "propertyPathForOfShadow",
        "propertyPathCatchShadow",
        "propertyPathObjectReceiverShadow",
        "propertyPathVerifierComparisonShadow",
        "propertyPathParameterShadow",
        "propertyPathVarShadow",
        "propertyPathForInShadow",
        "propertyPathDestructuringShadow",
        "propertyPathFunctionDeclarationShadow",
        "propertyPathClassDeclarationShadow",
        "propertyPathNamedFunctionExpressionShadow",
        "propertyPathNestedBlockShadow",
    ];
    const propertyPathWrongRootKeys = [
        "propertyPathWrongRoot",
        "propertyPathDeeperWrongRoot",
    ];
    const propertyPathComputedAccessKeys = [
        "propertyPathComputedProperty",
        "propertyPathComputedMethod",
    ];
    const propertyPathNegativeKeys = [
        ...propertyPathShadowKeys,
        ...propertyPathWrongRootKeys,
        ...propertyPathComputedAccessKeys,
        "propertyPathWrongProperty",
        "propertyPathWrongMethod",
        "propertyPathWrongArgumentIndex",
        "propertyPathSwappedRootBinding",
        "propertyPathSpreadArgument",
        "propertyPathTwoArgumentIncludes",
        "propertyPathWrongTopLevelFunction",
        "propertyPathOtherFunctionParameter",
        "propertyPathNonExpectedDeclaration",
    ];
    const wholeFunctionSweep = runWholeFunctionExemptionSweep(sourceFile, ts);
    fixtureParseDiagnosticsTotal += wholeFunctionSweep.parseDiagnostics;
    const propertyPathLegalPassCount = propertyPathLegalKeys
        .filter((key) => results[key] === "PASS_EXPECTED").length;
    const propertyPathNegativeRejectedCount = propertyPathNegativeKeys
        .filter((key) => results[key] === "FAIL_EXPECTED").length;
    contractCheck(fixtureParseDiagnosticsTotal === 0, "canonical reference fixtures have parse diagnostics");
    contractCheck(propertyPathLegalPassCount === propertyPathLegalKeys.length, "property-path positive control failed");
    return {
        elementAccessSink: results.elementAccessSink,
        bareAlias: results.bareAlias,
        legalContext: results.membershipLegal,
        membershipLegal: results.membershipLegal,
        equalityLegal: results.equalityLegal,
        comparisonHelperLegal: results.comparisonHelperLegal,
        payloadBuilderLegal: results.payloadBuilderLegal,
        payloadBuilderWrongFunction: results.payloadBuilderWrongFunction,
        guardSelfReadLegal: results.guardSelfReadLegal,
        guardSelfReadWrongContext: results.guardSelfReadWrongContext,
        receiverEscapeSuitePass: receiverEscapeKeys.every((key) => results[key] === "FAIL_EXPECTED"),
        positiveControlSuitePass: positiveControlKeys.every((key) => results[key] === "PASS_EXPECTED"),
        fixtureCaseCount: cases.length + wholeFunctionSweep.caseCount,
        fixtureParseDiagnosticsTotal,
        positiveControlCaseCount: propertyPathLegalKeys.length,
        positiveControlPassCount: propertyPathLegalPassCount,
        negativeControlCaseCount: propertyPathNegativeKeys.length,
        negativeControlRejectedCount: propertyPathNegativeRejectedCount,
        fixtureUsesProductionCore: true,
        fixtureConstantPass: cases.every((fixture) => results[fixture.key] === "PASS_EXPECTED"),
        fixtureConstantFail: cases.every((fixture) => results[fixture.key] === "FAIL_EXPECTED"),
        propertyPathLegalCaseCount: propertyPathLegalKeys.length,
        propertyPathLegalPassCount,
        propertyPathLegalPass: propertyPathLegalPassCount === propertyPathLegalKeys.length,
        propertyPathNegativeCaseCount: propertyPathNegativeKeys.length,
        propertyPathNegativeRejectedCount,
        propertyPathShadowRejected: propertyPathShadowKeys.every((key) => results[key] === "FAIL_EXPECTED"),
        propertyPathWrongRootRejected: propertyPathWrongRootKeys.every((key) => results[key] === "FAIL_EXPECTED"),
        propertyPathComputedAccessRejected: propertyPathComputedAccessKeys.every((key) => results[key] === "FAIL_EXPECTED"),
        propertyPathBindingIdentityEnforced: propertyPathShadowKeys.every((key) => results[key] === "FAIL_EXPECTED")
            && propertyPathLegalPassCount === propertyPathLegalKeys.length,
        propertyPathNegativeSuitePass: propertyPathNegativeRejectedCount === propertyPathNegativeKeys.length,
        sweepFunctionNames: wholeFunctionSweep.functionNames,
        sweepProtectedBindingNames: wholeFunctionSweep.protectedBindingNames,
        sweepAstShapeNames: wholeFunctionSweep.astShapeNames,
        sweepFunctionCount: wholeFunctionSweep.functionCount,
        sweepProtectedBindingCount: wholeFunctionSweep.protectedBindingCount,
        sweepAstShapeCount: wholeFunctionSweep.astShapeCount,
        sweepExpectedCaseCount: wholeFunctionSweep.expectedCaseCount,
        sweepCaseCount: wholeFunctionSweep.caseCount,
        sweepCaseCountFormulaMatches: wholeFunctionSweep.caseCountFormulaMatches,
        sweepAcceptedCount: wholeFunctionSweep.acceptedCount,
        sweepRejectedCount: wholeFunctionSweep.rejectedCount,
        sweepAllCasesAccountedFor: wholeFunctionSweep.allCasesAccountedFor,
        wholeFunctionExemption: wholeFunctionSweep.wholeFunctionExemption,
        suitePass: cases.every((fixture) => results[fixture.key] === (fixture.expectedPass ? "PASS_EXPECTED" : "FAIL_EXPECTED")),
    };
}

function verifyProductionOutputEmitterGuard(sourceFile, ts) {
    const emitter = getUniqueTopLevelFunction(sourceFile, "emitValidatedCliOutput", ts);
    const outputCalls = [];
    const bypasses = [];
    walkAst(ts, sourceFile, (node) => {
        if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) return;
        const receiver = node.expression.expression;
        if (isIdentifierNamed(receiver, "console", ts)) {
            bypasses.push({ kind: `console.${node.expression.name.text}`, line: lineOf(sourceFile, node) });
            return;
        }
        if (!ts.isPropertyAccessExpression(receiver)
            || !isIdentifierNamed(receiver.expression, "process", ts)
            || !["stdout", "stderr"].includes(receiver.name.text)
            || node.expression.name.text !== "write") return;
        outputCalls.push(node);
        if (!isWithin(node, emitter)) {
            bypasses.push({ kind: `process.${receiver.name.text}.write`, line: lineOf(sourceFile, node) });
        }
    });

    const validationCalls = [];
    walkAst(ts, emitter, (node) => {
        if (ts.isCallExpression(node) && isIdentifierNamed(node.expression, "validateVisibleOutputLines", ts)) {
            validationCalls.push(node);
        }
    });
    contractCheck(bypasses.length === 0, `production output bypassed the validated emitter: ${JSON.stringify(bypasses)}`);
    contractCheck(outputCalls.length === 2, "validated emitter must own exactly stdout.write and stderr.write");
    contractCheck(validationCalls.length === 1, "validated emitter must invoke one shared vocabulary validator");
    contractCheck(outputCalls.every((call) => validationCalls[0].pos < call.pos), "validated emitter writes before vocabulary validation");
    return { passed: true, outputCallCount: outputCalls.length, validatorCallCount: validationCalls.length };
}

function verifyContractOwnFile(sourceFile, ts) {
    const canonicalReferences = verifyCanonicalReferenceContexts(sourceFile, ts);
    const canonicalReferenceFixtures = runCanonicalReferenceContextFixtures(sourceFile, ts);
    const productionOutputEmitterGuard = verifyProductionOutputEmitterGuard(sourceFile, ts);
    const expectedDataNodes = collectContractExpectedDataNodes(sourceFile, ts);
    const canonicalExpectedLiterals = new Set([
        ...C1_CODES,
        ...HARNESS_CODES,
        ...VERIFIER_CODES,
        MULTIPLE_DEATHS_MESSAGE,
        INVALID_RESULT_STATUS,
    ]);
    let throwCount = 0;
    let assertionCallCount = 0;
    let classifiedContractErrors = 0;
    const forbiddenWriteCalls = [];
    const unexpectedRuntimeEmitters = [];

    walkAst(ts, sourceFile, (node) => {
        if (ts.isStringLiteral(node) && canonicalExpectedLiterals.has(node.text)) {
            contractCheck(nodeWithinAny(node, expectedDataNodes), `${node.text} escaped the structural expected-data allowlist`);
        }
        if (ts.isThrowStatement(node)) {
            throwCount++;
            if (node.expression && ts.isNewExpression(node.expression)
                && ts.isIdentifier(node.expression.expression)
                && node.expression.expression.text === "FailureCodeContractError") {
                classifiedContractErrors++;
            }
        }
        if (ts.isCallExpression(node)) {
            let callName = null;
            if (ts.isIdentifier(node.expression)) callName = node.expression.text;
            if (ts.isPropertyAccessExpression(node.expression)) callName = node.expression.name.text;
            if (callName && NO_WRITE_CALL_NAMES.includes(callName)) forbiddenWriteCalls.push({ callName, line: lineOf(sourceFile, node) });
            if (ts.isPropertyAccessExpression(node.expression)
                && ts.isIdentifier(node.expression.expression)
                && node.expression.expression.text === "assert") {
                assertionCallCount++;
                const message = node.arguments[1];
                if ((message && ts.isStringLiteral(message) && message.text === MULTIPLE_DEATHS_MESSAGE)
                    || (message && ts.isIdentifier(message) && message.text === "MULTIPLE_DEATHS_MESSAGE")) {
                    unexpectedRuntimeEmitters.push({ callName: "assert-emission", line: lineOf(sourceFile, node) });
                }
            }
            if (["fail", "failInvalid", "makeInvalidResult", "parseJsonDocument"].includes(callName)) {
                unexpectedRuntimeEmitters.push({ callName, line: lineOf(sourceFile, node) });
            }
        }
        if (ts.isNewExpression(node) && ts.isIdentifier(node.expression)
            && ["C1ValidationError", "C2InvalidUnmodeledError"].includes(node.expression.text)) {
            unexpectedRuntimeEmitters.push({ callName: node.expression.text, line: lineOf(sourceFile, node) });
        }
        if (ts.isObjectLiteralExpression(node)) {
            const statuses = findObjectProperty(node, "status", ts);
            const codes = findObjectProperty(node, "code", ts);
            const constructsInvalidResult = statuses.some((property) => (
                ts.isPropertyAssignment(property)
                && ((ts.isStringLiteral(property.initializer) && property.initializer.text === INVALID_RESULT_STATUS)
                    || (ts.isIdentifier(property.initializer) && property.initializer.text === "INVALID_RESULT_STATUS"))
            )) && codes.length > 0;
            if (constructsInvalidResult) {
                unexpectedRuntimeEmitters.push({ callName: "invalid-result-construction", line: lineOf(sourceFile, node) });
            }
        }
    });

    contractCheck(forbiddenWriteCalls.length === 0, `contract contains file-write calls: ${JSON.stringify(forbiddenWriteCalls)}`);
    contractCheck(unexpectedRuntimeEmitters.length === 0, `contract contains a runtime failure emitter: ${JSON.stringify(unexpectedRuntimeEmitters)}`);
    contractCheck(classifiedContractErrors >= 2, "contract violation throws were not structurally classified");
    return {
        expectedDataNodes,
        throwCount,
        assertionCallCount,
        classifiedContractErrors,
        canonicalReferences,
        canonicalReferenceFixtures,
        productionOutputEmitterGuard,
    };
}

function hasSuspiciousFailureCarrier(sourceFile, ts) {
    const candidates = [];
    walkAst(ts, sourceFile, (node) => {
        if (ts.isNewExpression(node) && ts.isIdentifier(node.expression)
            && ["C1ValidationError", "C2InvalidUnmodeledError"].includes(node.expression.text)) {
            candidates.push({ kind: "error-construction", line: lineOf(sourceFile, node) });
        }
        if (ts.isCallExpression(node)) {
            let callName = null;
            if (ts.isIdentifier(node.expression)) callName = node.expression.text;
            if (ts.isPropertyAccessExpression(node.expression)) callName = node.expression.name.text;
            if (["failInvalid", "makeInvalidResult", "parseJsonDocument", "assertModeledDeathCount"].includes(callName)) {
                candidates.push({ kind: callName, line: lineOf(sourceFile, node) });
            }
            if (callName === "fail" && node.arguments[0] && ts.isStringLiteral(node.arguments[0])
                && /^[A-Z][A-Z0-9_]*$/.test(node.arguments[0].text)) {
                candidates.push({ kind: "fail-literal", line: lineOf(sourceFile, node) });
            }
        }
        if (ts.isObjectLiteralExpression(node)) {
            const statuses = findObjectProperty(node, "status", ts);
            const codes = findObjectProperty(node, "code", ts);
            if (statuses.some((property) => ts.isPropertyAssignment(property)
                && ts.isStringLiteral(property.initializer)
                && property.initializer.text === INVALID_RESULT_STATUS) && codes.length > 0) {
                candidates.push({ kind: "invalid-result", line: lineOf(sourceFile, node) });
            }
        }
        if (ts.isClassDeclaration(node) && node.heritageClauses?.some((clause) => (
            clause.token === ts.SyntaxKind.ExtendsKeyword
            && clause.types.some((type) => ts.isIdentifier(type.expression) && type.expression.text === "Error")
        ))) {
            let assignsCode = false;
            walkAst(ts, node, (child) => {
                if (!ts.isBinaryExpression(child) || child.operatorToken.kind !== ts.SyntaxKind.EqualsToken) return;
                const left = child.left;
                assignsCode = assignsCode || (
                    ts.isPropertyAccessExpression(left)
                    && left.expression.kind === ts.SyntaxKind.ThisKeyword
                    && left.name.text === "code"
                );
            });
            if (assignsCode) candidates.push({ kind: "coded-error-class", line: lineOf(sourceFile, node) });
        }
    });
    return candidates;
}

function verifyFamilyLiteralBoundaries(allPaths, parsedFiles, contractOwnFacts, ts) {
    const fs = require("node:fs");
    const path = require("node:path");
    const root = getRepositoryRoot();
    const contractSourceFile = parsedFiles.get(CONTRACT_RELATIVE_PATH);
    const allowedNodes = contractOwnFacts.expectedDataNodes;

    for (const literal of FAMILY_LITERALS) {
        const occurrences = [];
        for (const relativePath of allPaths) {
            const buffer = fs.readFileSync(path.join(root, relativePath));
            if (buffer.includes(Buffer.from(literal, "ascii"))) occurrences.push(relativePath);
        }
        contractCheck(occurrences.length === 1 && occurrences[0] === CONTRACT_RELATIVE_PATH, `${literal} leaked outside contract expected data`);
        const literalNodes = [];
        walkAst(ts, contractSourceFile, (node) => {
            if (ts.isStringLiteral(node) && node.text === literal) literalNodes.push(node);
        });
        contractCheck(literalNodes.length === 1 && nodeWithinAny(literalNodes[0], allowedNodes), `${literal} is outside the structural expected-data allowlist`);
    }

    for (const literal of DEPRECATED_FAMILY_LITERALS) {
        for (const relativePath of allPaths) {
            const buffer = fs.readFileSync(path.join(root, relativePath));
            contractCheck(!buffer.includes(Buffer.from(literal, "ascii")), `${literal} deprecated family literal is present`);
        }
    }

    for (const relativePath of EMITTER_SCOPE) {
        const sourceFile = parsedFiles.get(relativePath);
        let familyCount = 0;
        walkAst(ts, sourceFile, (node) => {
            if (ts.isStringLiteral(node) && FAMILY_LITERALS.includes(node.text)) familyCount++;
        });
        contractCheck(familyCount === 0, `${relativePath} contains an audit family literal`);
    }
}

function verifyRepositoryScope(ts, parsedAuditedFiles, contractOwnFacts) {
    const allPaths = enumerateRepositoryFiles();
    contractCheck(allPaths.includes(CONTRACT_RELATIVE_PATH), "contract artifact is absent from repository content");
    contractCheck(!allPaths.some((relativePath) => relativePath.startsWith("node_modules/")), "node_modules content is forbidden");
    const excludedTrees = verifyExcludedContentTrees(allPaths);

    const executablePaths = [];
    for (const relativePath of allPaths) {
        if (["engine", "bin", "release"].some((root) => relativePath === root || relativePath.startsWith(`${root}/`))) continue;
        if (isExecutableCandidate(relativePath)) executablePaths.push(relativePath);
    }

    const parsedFiles = new Map(parsedAuditedFiles);
    for (const relativePath of executablePaths) {
        if (!parsedFiles.has(relativePath)) parsedFiles.set(relativePath, parseJavaScript(relativePath, readRepositoryFile(relativePath), ts));
    }

    const suspiciousByFile = {};
    for (const [relativePath, sourceFile] of parsedFiles) {
        if (EMITTER_SCOPE.includes(relativePath) || relativePath === CONTRACT_RELATIVE_PATH) continue;
        const candidates = hasSuspiciousFailureCarrier(sourceFile, ts);
        if (candidates.length > 0) suspiciousByFile[relativePath] = candidates;
    }
    contractCheck(Object.keys(suspiciousByFile).length === 0, `SCOPE_EXPANSION_REQUIRED ${JSON.stringify(suspiciousByFile)}`);

    verifyFamilyLiteralBoundaries(allPaths, parsedFiles, contractOwnFacts, ts);
    return {
        trackedFileCount: allPaths.length,
        executableFileCount: executablePaths.length,
        executablePaths,
        excludedTrees,
        suspiciousByFile,
        scopeClosed: true,
    };
}

function findContractImports(sourceFile, ts) {
    const imports = new Map();
    for (const statement of sourceFile.statements) {
        if (!ts.isVariableStatement(statement)) continue;
        for (const declaration of statement.declarationList.declarations) {
            if (!ts.isObjectBindingPattern(declaration.name) || !declaration.initializer || !ts.isCallExpression(declaration.initializer)) continue;
            const call = declaration.initializer;
            if (!ts.isIdentifier(call.expression) || call.expression.text !== "require" || call.arguments.length !== 1 || !ts.isStringLiteral(call.arguments[0])) continue;
            if (!normalizeRepositoryPath(call.arguments[0].text).endsWith("l4-failure-code-contract.cjs")) continue;
            for (const element of declaration.name.elements) {
                if (!ts.isIdentifier(element.name)) continue;
                const imported = element.propertyName && ts.isIdentifier(element.propertyName) ? element.propertyName.text : element.name.text;
                imports.set(imported, element.name.text);
            }
        }
    }
    return imports;
}

function isIdentifierCall(statement, localName, argumentMatcher, ts) {
    if (!ts.isExpressionStatement(statement) || !ts.isCallExpression(statement.expression)) return false;
    const call = statement.expression;
    return ts.isIdentifier(call.expression)
        && call.expression.text === localName
        && call.arguments.length === 1
        && argumentMatcher(call.arguments[0]);
}

function detectEnforcementWiring(c1SourceFile, harnessSourceFile, ts) {
    const c1Imports = findContractImports(c1SourceFile, ts);
    const harnessImports = findContractImports(harnessSourceFile, ts);
    const c1Local = c1Imports.get("assertKnownC1FailureCode") || null;
    const harnessLocal = harnessImports.get("assertKnownHarnessFailureCode") || null;

    const c1Class = getUniqueTopLevelClass(c1SourceFile, "C1ValidationError", ts);
    const constructor = c1Class.members.find((member) => ts.isConstructorDeclaration(member));
    const constructorStatements = constructor?.body?.statements || [];
    const superIndex = constructorStatements.findIndex((statement) => (
        ts.isExpressionStatement(statement)
        && ts.isCallExpression(statement.expression)
        && statement.expression.expression.kind === ts.SyntaxKind.SuperKeyword
    ));
    const constructorCallIndex = c1Local ? constructorStatements.findIndex((statement) => (
        isIdentifierCall(statement, c1Local, (argument) => ts.isIdentifier(argument) && argument.text === "code", ts)
    )) : -1;
    const c1Constructor = constructorCallIndex >= 0 && superIndex >= 0 && constructorCallIndex < superIndex;

    const parseFunction = getUniqueTopLevelFunction(c1SourceFile, "parseJsonDocument", ts);
    const parseStatements = parseFunction.body?.statements || [];
    const c1Parser = Boolean(c1Local && parseStatements.length > 0 && isIdentifierCall(
        parseStatements[0],
        c1Local,
        (argument) => ts.isIdentifier(argument) && argument.text === "code",
        ts,
    ));

    const makeFunction = getUniqueTopLevelFunction(harnessSourceFile, "makeInvalidResult", ts);
    const makeStatements = makeFunction.body?.statements || [];
    const harnessResult = Boolean(harnessLocal && makeStatements.length > 0 && isIdentifierCall(
        makeStatements[0],
        harnessLocal,
        (argument) => (
            ts.isPropertyAccessExpression(argument)
            && ts.isIdentifier(argument.expression)
            && argument.expression.text === "details"
            && argument.name.text === "code"
        ),
        ts,
    ));

    return { c1Constructor, c1Parser, harnessResult };
}

function verifyCanonicalInvariants(payload) {
    const normalized = normalizeCanonicalPayload(payload);
    contractCheck(normalized.families[C1_FAMILY].length === 22, "C1 canonical count changed");
    contractCheck(normalized.families[HARNESS_FAMILY].length === 23, "harness canonical count changed");
    contractCheck(normalized.families[VERIFIER_FAMILY].length === 1, "verifier canonical count changed");
    contractCheck(Object.keys(normalized.codeToFamily).length === 46, "codeToFamily count changed");
    contractCheck(normalized.counts.c1 === 22
        && normalized.counts.harnessRuntime === 23
        && normalized.counts.verifierAssertion === 1
        && normalized.counts.total === 46, "redundant canonical counts changed");

    const expectedMapping = buildCodeToFamily();
    contractCheck(JSON.stringify(normalized.codeToFamily) === JSON.stringify(expectedMapping), "codeToFamily mapping changed");
    contractCheck(normalized.emitterScope.length === EMITTER_SCOPE.length
        && normalized.emitterScope.every((entry, index) => entry === EMITTER_SCOPE[index]), "emitter scope changed");
    contractCheck(normalized.exposure.harnessInvalidRuntimeResult === true
        && normalized.exposure.normalizedVerifierInvalidReport === false, "exposure contract changed");
    contractCheck(normalized.structuralGuards.multipleDeaths.code === VERIFIER_CODES[0]
        && normalized.structuralGuards.multipleDeaths.exactMessage === MULTIPLE_DEATHS_MESSAGE
        && normalized.structuralGuards.multipleDeaths.assertionOnly === true
        && normalized.structuralGuards.multipleDeaths.harnessRuntime === false
        && normalized.structuralGuards.multipleDeaths.normalizedReport === false, "MULTIPLE_DEATHS semantic guard changed");
    contractCheck(Object.values(normalized.membershipEnforcementRequired).every((value) => value === true), "membership enforcement target changed");
}

function expectContractError(callback, expected) {
    let caught = null;
    try {
        callback();
    } catch (error) {
        caught = error;
    }
    contractCheck(caught instanceof FailureCodeContractError, "expected FailureCodeContractError");
    contractCheck(caught.boundary === expected.boundary, "contract error boundary changed");
    contractCheck(caught.reason === expected.reason, "contract error reason changed");
    return caught;
}

function runFailureCodeContractErrorProbes() {
    contractCheck(assertKnownC1FailureCode(C1_CODES[0]) === C1_CODES[0], "known C1 code probe failed");
    contractCheck(assertKnownHarnessFailureCode(HARNESS_CODES[0]) === HARNESS_CODES[0], "known harness code probe failed");

    const ordinary = expectContractError(
        () => assertKnownC1FailureCode("UNKNOWN_BUT_VALID"),
        { boundary: "c1", reason: "UNKNOWN_CODE" },
    );
    contractCheck(ordinary.receivedCode === "UNKNOWN_BUT_VALID", "unknown code diagnostic changed");

    const long = expectContractError(
        () => assertKnownHarnessFailureCode("A".repeat(1000)),
        { boundary: "harness", reason: "UNKNOWN_CODE" },
    );
    contractCheck(long.receivedCode.length === 64 && long.receivedCodeTruncated === true, "long code was not safely truncated");

    const unsafe = expectContractError(
        () => assertKnownC1FailureCode("BAD\n\r\t\u001b[31m"),
        { boundary: "c1", reason: "UNKNOWN_CODE" },
    );
    contractCheck(unsafe.receivedCodeSanitized === true && /^[A-Za-z0-9_]+$/.test(unsafe.receivedCode), "unsafe code was not sanitized");
    contractCheck(!/[\n\r\t\u001b]/.test(unsafe.message), "unsafe controls leaked into contract error message");

    let toStringCalled = false;
    const hostile = {
        toString() {
            toStringCalled = true;
            throw new Error("must not be called");
        },
    };
    const hostileError = expectContractError(
        () => assertKnownC1FailureCode(hostile),
        { boundary: "c1", reason: "INVALID_CODE_TYPE" },
    );
    contractCheck(!toStringCalled && hostileError.receivedType === "object", "hostile object diagnostics executed user code");
    contractCheck(!Object.prototype.hasOwnProperty.call(hostileError, "receivedCode"), "invalid type retained a receivedCode");
    contractCheck(!Object.values(hostileError).includes(hostile), "contract error retained the original object");

    const typeCases = [
        [null, "null"],
        [[], "array"],
        [{}, "object"],
        [function probe() {}, "function"],
        [Symbol("probe"), "symbol"],
        [1, "number"],
        [true, "boolean"],
        [undefined, "undefined"],
        [1n, "bigint"],
    ];
    for (const [value, expectedType] of typeCases) {
        const error = expectContractError(
            () => assertKnownHarnessFailureCode(value),
            { boundary: "harness", reason: "INVALID_CODE_TYPE" },
        );
        contractCheck(error.receivedType === expectedType, `stable type label changed for ${expectedType}`);
    }

    const revocable = Proxy.revocable({}, {});
    revocable.revoke();
    const revokedError = expectContractError(
        () => assertKnownC1FailureCode(revocable.proxy),
        { boundary: "c1", reason: "INVALID_CODE_TYPE" },
    );
    contractCheck(revokedError.receivedType === "object", "revoked Proxy type fallback changed");
    return { passed: true, probeCount: 16 };
}

function runCanonicalSerializationProbes(payload) {
    const serializationA = serializeCanonicalContractPayload(payload);
    const serializationB = serializeCanonicalContractPayload(payload);
    contractCheck(serializationA === serializationB, "canonical serialization is not byte-identical");
    const hashA = hashCanonicalContractPayload(payload);
    const hashB = hashCanonicalContractPayload(payload);
    contractCheck(hashA === hashB && /^[0-9a-f]{64}$/.test(hashA), "canonical hash is not deterministic lowercase SHA-256");

    const wrapper = { semantic: payload, diagnostics: { line: 1 } };
    const beforeDiagnostics = hashCanonicalContractPayload(wrapper.semantic);
    wrapper.diagnostics.line = 999;
    wrapper.diagnostics.extra = "changed";
    const afterDiagnostics = hashCanonicalContractPayload(wrapper.semantic);
    contractCheck(beforeDiagnostics === afterDiagnostics, "diagnostics polluted canonical hash");

    const reordered = clonePayload(payload);
    reordered.families[C1_FAMILY].reverse();
    reordered.families[HARNESS_FAMILY].reverse();
    reordered.emitterScope.reverse();
    reordered.structuralGuards.invalidHazardHost.predicates.reverse();
    reordered.codeToFamily = Object.fromEntries(Object.entries(reordered.codeToFamily).reverse());
    contractCheck(serializeCanonicalContractPayload(reordered) === serializationA, "canonicalization did not normalize input ordering");

    const changed = clonePayload(payload);
    changed.exposure.normalizedVerifierInvalidReport = true;
    contractCheck(hashCanonicalContractPayload(changed) !== hashA, "semantic mutation did not change canonical hash");

    const extraKey = clonePayload(payload);
    extraKey.diagnostics = {};
    let rejectedExtra = false;
    try {
        serializeCanonicalContractPayload(extraKey);
    } catch (_error) {
        rejectedExtra = true;
    }
    contractCheck(rejectedExtra, "canonical serializer accepted a diagnostics key");
    return { canonicalSha256: hashA, serializedByteLength: Buffer.byteLength(serializationA, "utf8") };
}

function inspectVisibleOutputLines(lines, payload) {
    contractCheck(Array.isArray(lines) && lines.length > 0, "visible output lines must be a non-empty array");
    contractCheck(lines.every((line) => typeof line === "string" && !/[\r\n]/.test(line)), "visible output lines must be newline-free strings");
    const canonicalCodes = Object.values(payload.families).flat();
    const familyVocabulary = [...Object.keys(payload.families), ...DEPRECATED_FAMILY_LITERALS];
    const visibleText = lines.join("\n");
    const canonicalCodeHits = canonicalCodes.filter((code) => visibleText.includes(code)).length;
    const familyHits = familyVocabulary.filter((family) => visibleText.includes(family)).length;
    const canonicalSha256 = hashCanonicalContractPayload(payload);
    const realCanonicalSha256Hits = visibleText.includes(canonicalSha256) ? 1 : 0;
    const hashClaims = [...visibleText.matchAll(/canonicalSha256=([^\s]+)/g)].map((match) => match[1]);
    const hashWithheld = hashClaims.length > 0 && hashClaims.every((value) => value === WITHHELD_HASH);
    return {
        canonicalCodeHits,
        familyHits,
        realCanonicalSha256Hits,
        vocabularyDisjoint: canonicalCodeHits === 0 && familyHits === 0,
        hashWithheld,
    };
}

function validateVisibleOutputLines(lines, payload) {
    const inspection = inspectVisibleOutputLines(lines, payload);
    contractCheck(inspection.canonicalCodeHits === 0, "visible output exposed canonical failure-code vocabulary");
    contractCheck(inspection.familyHits === 0, "visible output exposed canonical family vocabulary");
    contractCheck(inspection.realCanonicalSha256Hits === 0, "visible output exposed the real canonical SHA-256");
    contractCheck(inspection.hashWithheld, "visible output omitted or exposed a non-withheld canonical hash");
    return inspection;
}

function formatPrecommitScopeSuccess(scope) {
    return [
        "L4_FAILURE_CODE_PRECOMMIT_SCOPE_PASS",
        `path=${scope.relativePath}`,
        `canonicalSha256=${WITHHELD_HASH}`,
    ];
}

function formatCommitScopeSuccess(scope) {
    return [
        "L4_FAILURE_CODE_COMMIT_SCOPE_PASS",
        `ref=${scope.ref}`,
        `commit=${scope.commit}`,
        `path=${scope.relativePath}`,
        `canonicalSha256=${WITHHELD_HASH}`,
    ];
}

function formatMigrationIncomplete(missing, mode = null) {
    const lines = ["L4_FAILURE_CODE_CONTRACT_MIGRATION_INCOMPLETE"];
    if (mode !== null) lines.push(`mode=${mode}`);
    lines.push(`missing=${missing.join(",")}`);
    lines.push(`canonicalSha256=${WITHHELD_HASH}`);
    return lines;
}

function formatInvalidCli() {
    return [
        "L4_FAILURE_CODE_CONTRACT_CLI_ERROR",
        "usage=--verify-artifact|--verify-precommit-scope|--verify-commit-scope <ref>|--verify-c1-wiring|--verify",
        `canonicalSha256=${WITHHELD_HASH}`,
    ];
}

function formatVerificationFailure(error, payload) {
    const detail = (error instanceof Error ? error.message : "unknown verification failure").replace(/[\r\n]+/g, " ");
    const candidate = [
        "L4_FAILURE_CODE_CONTRACT_VERIFICATION_FAILED",
        detail,
        `canonicalSha256=${WITHHELD_HASH}`,
    ];
    const inspection = inspectVisibleOutputLines(candidate, payload);
    if (inspection.vocabularyDisjoint && inspection.realCanonicalSha256Hits === 0 && inspection.hashWithheld) return candidate;
    return [
        "L4_FAILURE_CODE_CONTRACT_VERIFICATION_FAILED",
        "verification detail withheld by visible-output vocabulary guard",
        `canonicalSha256=${WITHHELD_HASH}`,
    ];
}

function emitValidatedCliOutput(streamName, lines, payload) {
    validateVisibleOutputLines(lines, payload);
    const text = `${lines.join("\n")}\n`;
    if (streamName === "stdout") {
        process.stdout.write(text);
    } else {
        contractCheck(streamName === "stderr", "validated emitter received an unknown stream");
        process.stderr.write(text);
    }
}

function expectVisibleOutputRejection(lines, payload, label) {
    let rejected = false;
    try {
        validateVisibleOutputLines(lines, payload);
    } catch (_error) {
        rejected = true;
    }
    contractCheck(rejected, `${label} visible-output negative probe was accepted`);
}

function runVisibleOutputVocabularyGuardProbes(payload) {
    const safeLines = ["L4_FAILURE_CODE_INTERNAL_OUTPUT_PROBE", `canonicalSha256=${WITHHELD_HASH}`];
    const safeInspection = validateVisibleOutputLines(safeLines, payload);
    const canonicalCodes = Object.values(payload.families).flat();
    const familyVocabulary = Object.keys(payload.families);
    expectVisibleOutputRejection([canonicalCodes[0], `canonicalSha256=${WITHHELD_HASH}`], payload, "canonical-code");
    expectVisibleOutputRejection([familyVocabulary[0], `canonicalSha256=${WITHHELD_HASH}`], payload, "family");
    expectVisibleOutputRejection([`canonicalSha256=${hashCanonicalContractPayload(payload)}`], payload, "canonical-sha256");
    return {
        canonicalCodeHits: safeInspection.canonicalCodeHits,
        familyHits: safeInspection.familyHits,
        realCanonicalSha256Hits: safeInspection.realCanonicalSha256Hits,
        vocabularyDisjoint: safeInspection.vocabularyDisjoint,
        hashWithholdingAllPaths: safeInspection.hashWithheld,
        negativeProbeSuitePass: true,
    };
}

function runVisibleOutputFormatterFixtures(payload) {
    const cases = [
        formatPrecommitScopeSuccess({ relativePath: CONTRACT_RELATIVE_PATH }),
        formatCommitScopeSuccess({ ref: "fixture-ref", commit: "fixture-commit", relativePath: CONTRACT_RELATIVE_PATH }),
        formatMigrationIncomplete(["fixture-a", "fixture-b"], "fixture-mode"),
        formatInvalidCli(),
        formatVerificationFailure(new Error("commit scope must contain exactly one changed path"), payload),
    ];
    for (const lines of cases) validateVisibleOutputLines(lines, payload);
    return { passed: true, caseCount: cases.length };
}

function buildDiagnostics(ts, c1Facts, harnessFacts, verifierFacts, scopeFacts, ownFacts) {
    return {
        typescriptVersion: ts.version,
        c1: {
            directLiteralOrigins: c1Facts.literalOriginCount,
            parseLiteralOrigins: c1Facts.parseOriginCount,
            parseTransportSinks: c1Facts.transportCount,
            expandedSyntacticPaths: c1Facts.literalOriginCount + c1Facts.parseOriginCount * c1Facts.transportCount,
        },
        harness: {
            literalOrigins: harnessFacts.originCount,
            makeInvalidResultCalls: harnessFacts.makeInvalidResultCallCount,
        },
        verifier: {
            assertionCount: verifierFacts.assertionCount,
        },
        repository: {
            trackedFileCount: scopeFacts.trackedFileCount,
            executableFileCount: scopeFacts.executableFileCount,
            excludedTrees: { ...scopeFacts.excludedTrees },
        },
        contractOwnFile: {
            throwCount: ownFacts.throwCount,
            assertionCallCount: ownFacts.assertionCallCount,
            classifiedContractErrors: ownFacts.classifiedContractErrors,
        },
    };
}

function verifyRepositoryFailureCodeContract() {
    const ts = require("typescript");
    contractCheck(ts.version === "6.0.3", `TypeScript 6.0.3 is required for this checkpoint, observed ${ts.version}`);

    const payload = buildCanonicalContractPayload();
    verifyCanonicalInvariants(payload);
    const errorProbes = runFailureCodeContractErrorProbes();
    const canonicalProbes = runCanonicalSerializationProbes(payload);

    const c1Path = "tools/l4-affected-jumps.cjs";
    const harnessPath = "tools/l4-step-harness.cjs";
    const verifierPath = "tools/verify-l4-step-harness.cjs";
    const contractPath = CONTRACT_RELATIVE_PATH;
    const c1SourceFile = parseJavaScript(c1Path, readRepositoryFile(c1Path), ts);
    const harnessSourceFile = parseJavaScript(harnessPath, readRepositoryFile(harnessPath), ts);
    const verifierSourceFile = parseJavaScript(verifierPath, readRepositoryFile(verifierPath), ts);
    const contractSourceFile = parseJavaScript(contractPath, readRepositoryFile(contractPath), ts);

    const c1Facts = extractC1Facts(c1SourceFile, ts);
    const harnessFacts = extractHarnessFacts(harnessSourceFile, ts);
    const verifierFacts = extractVerifierFacts(verifierSourceFile, ts);
    compareExactCodeSet(verifierFacts.actualCodes, VERIFIER_CODES, "verifier assertion actual set");
    contractCheck(!harnessFacts.actualCodes.includes(VERIFIER_CODES[0]), "MULTIPLE_DEATHS entered harness actual set");
    contractCheck(c1Facts.actualCodes.includes(C1_CODES[20]), "MISSING_HOST AJ:500 was removed from C1 actual set");

    const actualMapping = {};
    for (const code of c1Facts.actualCodes) actualMapping[code] = C1_FAMILY;
    for (const code of harnessFacts.actualCodes) {
        contractCheck(!Object.prototype.hasOwnProperty.call(actualMapping, code), `${code} appears in multiple actual families`);
        actualMapping[code] = HARNESS_FAMILY;
    }
    for (const code of verifierFacts.actualCodes) {
        contractCheck(!Object.prototype.hasOwnProperty.call(actualMapping, code), `${code} appears in multiple actual families`);
        actualMapping[code] = VERIFIER_FAMILY;
    }
    const normalizedActualMapping = Object.fromEntries(Object.entries(actualMapping).sort((left, right) => compareCodePoint(left[0], right[0])));
    contractCheck(JSON.stringify(normalizedActualMapping) === JSON.stringify(buildCodeToFamily()), "actual codeToFamily mapping changed");

    contractCheck(JSON.stringify(c1Facts.invalidHazardHost) === JSON.stringify(payload.structuralGuards.invalidHazardHost), "INVALID_HAZARD_HOST structural payload mismatch");
    contractCheck(verifierFacts.exactMessage === payload.structuralGuards.multipleDeaths.exactMessage, "MULTIPLE_DEATHS exact message payload mismatch");
    contractCheck(harnessFacts.harnessInvalidRuntimeResult === payload.exposure.harnessInvalidRuntimeResult, "harness exposure payload mismatch");
    contractCheck(verifierFacts.normalizedVerifierInvalidReport === payload.exposure.normalizedVerifierInvalidReport, "verifier exposure payload mismatch");

    const ownFacts = verifyContractOwnFile(contractSourceFile, ts);
    const parsedAuditedFiles = new Map([
        [c1Path, c1SourceFile],
        [harnessPath, harnessSourceFile],
        [verifierPath, verifierSourceFile],
        [contractPath, contractSourceFile],
    ]);
    const scopeFacts = verifyRepositoryScope(ts, parsedAuditedFiles, ownFacts);
    const wiring = detectEnforcementWiring(c1SourceFile, harnessSourceFile, ts);
    const diagnostics = buildDiagnostics(ts, c1Facts, harnessFacts, verifierFacts, scopeFacts, ownFacts);
    const visibleOutputVocabulary = runVisibleOutputVocabularyGuardProbes(payload);
    const visibleOutputFormatterFixtures = runVisibleOutputFormatterFixtures(payload);

    return {
        artifactValid: true,
        canonicalSha256: canonicalProbes.canonicalSha256,
        payload,
        wiring,
        scopeClosed: scopeFacts.scopeClosed,
        counts: { ...payload.counts },
        diagnostics,
        selfTests: {
            failureCodeContractError: errorProbes,
            canonicalSerialization: {
                passed: true,
                serializedByteLength: canonicalProbes.serializedByteLength,
            },
            canonicalReferenceContexts: ownFacts.canonicalReferences,
            canonicalReferenceFixtures: ownFacts.canonicalReferenceFixtures,
            productionOutputEmitterGuard: ownFacts.productionOutputEmitterGuard,
            visibleOutputVocabulary,
            visibleOutputFormatterFixtures,
        },
    };
}

function missingWiring(wiring, keys) {
    return keys.filter((key) => wiring[key] !== true);
}

function formatWithheldSummary(result, header, membershipEnforcement) {
    const lines = [
        header,
        `contractVersion=${CONTRACT_VERSION}`,
        `c1Count=${result.counts.c1}`,
        `harnessRuntimeCount=${result.counts.harnessRuntime}`,
        `verifierAssertionCount=${result.counts.verifierAssertion}`,
        `totalCount=${result.counts.total}`,
        `canonicalSha256=${WITHHELD_HASH}`,
        `scopeClosed=${result.scopeClosed}`,
        `membershipEnforcement=${membershipEnforcement}`,
    ];
    const referenceFixtures = result.selfTests.canonicalReferenceFixtures;
    lines.push(`canonicalReferenceFixtureElementAccessSink=${referenceFixtures.elementAccessSink}`);
    lines.push(`canonicalReferenceFixtureBareAlias=${referenceFixtures.bareAlias}`);
    lines.push(`canonicalReferenceFixtureLegalContext=${referenceFixtures.legalContext}`);
    lines.push(`canonicalReferenceFixtureMembershipLegal=${referenceFixtures.membershipLegal}`);
    lines.push(`canonicalReferenceFixtureEqualityLegal=${referenceFixtures.equalityLegal}`);
    lines.push(`canonicalReferenceFixtureComparisonHelperLegal=${referenceFixtures.comparisonHelperLegal}`);
    lines.push(`canonicalReferenceFixturePayloadBuilderLegal=${referenceFixtures.payloadBuilderLegal}`);
    lines.push(`canonicalReferenceFixturePayloadBuilderWrongFunction=${referenceFixtures.payloadBuilderWrongFunction}`);
    lines.push(`canonicalReferenceFixtureGuardSelfReadLegal=${referenceFixtures.guardSelfReadLegal}`);
    lines.push(`canonicalReferenceFixtureGuardSelfReadWrongContext=${referenceFixtures.guardSelfReadWrongContext}`);
    lines.push(`canonicalReferenceFixtureReceiverEscapeSuitePass=${referenceFixtures.receiverEscapeSuitePass}`);
    lines.push(`canonicalReferenceFixturePositiveControlSuitePass=${referenceFixtures.positiveControlSuitePass}`);
    lines.push(`canonicalReferenceFixtureSuitePass=${referenceFixtures.suitePass}`);
    lines.push(`canonicalReferenceCount=${result.selfTests.canonicalReferenceContexts.referenceCount}`);
    lines.push(`canonicalReferenceViolations=${result.selfTests.canonicalReferenceContexts.violations.length}`);
    lines.push(`unclassifiedReferences=${result.selfTests.canonicalReferenceContexts.violations.length}`);
    lines.push(`fixtureCaseCount=${referenceFixtures.fixtureCaseCount}`);
    lines.push(`fixtureParseDiagnosticsTotal=${referenceFixtures.fixtureParseDiagnosticsTotal}`);
    lines.push(`positiveControlCaseCount=${referenceFixtures.positiveControlCaseCount}`);
    lines.push(`positiveControlPassCount=${referenceFixtures.positiveControlPassCount}`);
    lines.push(`negativeControlCaseCount=${referenceFixtures.negativeControlCaseCount}`);
    lines.push(`negativeControlRejectedCount=${referenceFixtures.negativeControlRejectedCount}`);
    lines.push(`fixtureUsesProductionCore=${referenceFixtures.fixtureUsesProductionCore}`);
    lines.push(`fixtureConstantPass=${referenceFixtures.fixtureConstantPass}`);
    lines.push(`fixtureConstantFail=${referenceFixtures.fixtureConstantFail}`);
    lines.push(`propertyPathLegalCaseCount=${referenceFixtures.propertyPathLegalCaseCount}`);
    lines.push(`propertyPathLegalPassCount=${referenceFixtures.propertyPathLegalPassCount}`);
    lines.push(`propertyPathLegalPass=${referenceFixtures.propertyPathLegalPass}`);
    lines.push(`propertyPathNegativeCaseCount=${referenceFixtures.propertyPathNegativeCaseCount}`);
    lines.push(`propertyPathNegativeRejectedCount=${referenceFixtures.propertyPathNegativeRejectedCount}`);
    lines.push(`propertyPathShadowRejected=${referenceFixtures.propertyPathShadowRejected}`);
    lines.push(`propertyPathWrongRootRejected=${referenceFixtures.propertyPathWrongRootRejected}`);
    lines.push(`propertyPathComputedAccessRejected=${referenceFixtures.propertyPathComputedAccessRejected}`);
    lines.push(`propertyPathBindingIdentityEnforced=${referenceFixtures.propertyPathBindingIdentityEnforced}`);
    lines.push(`propertyPathNegativeSuitePass=${referenceFixtures.propertyPathNegativeSuitePass}`);
    lines.push(`sweepFunctionCount=${referenceFixtures.sweepFunctionCount}`);
    lines.push(`sweepFunctionNames=${JSON.stringify(referenceFixtures.sweepFunctionNames)}`);
    lines.push(`sweepProtectedBindingCount=${referenceFixtures.sweepProtectedBindingCount}`);
    lines.push(`sweepProtectedBindingNames=${JSON.stringify(referenceFixtures.sweepProtectedBindingNames)}`);
    lines.push(`sweepAstShapeCount=${referenceFixtures.sweepAstShapeCount}`);
    lines.push(`sweepAstShapeNames=${JSON.stringify(referenceFixtures.sweepAstShapeNames)}`);
    lines.push(`sweepExpectedCaseCount=${referenceFixtures.sweepExpectedCaseCount}`);
    lines.push(`sweepCaseCount=${referenceFixtures.sweepCaseCount}`);
    lines.push(`sweepCaseCountFormulaMatches=${referenceFixtures.sweepCaseCountFormulaMatches}`);
    lines.push(`sweepAcceptedCount=${referenceFixtures.sweepAcceptedCount}`);
    lines.push(`sweepRejectedCount=${referenceFixtures.sweepRejectedCount}`);
    lines.push(`sweepAllCasesAccountedFor=${referenceFixtures.sweepAllCasesAccountedFor}`);
    lines.push(`wholeFunctionExemption=${referenceFixtures.wholeFunctionExemption}`);
    lines.push(`visibleOutputProductionEmitterGuard=${result.selfTests.productionOutputEmitterGuard.passed}`);
    lines.push(`visibleOutputFormatterFixtureSuitePass=${result.selfTests.visibleOutputFormatterFixtures.passed}`);
    const visibleOutput = result.selfTests.visibleOutputVocabulary;
    lines.push(`visibleOutputCanonicalCodeHits=${visibleOutput.canonicalCodeHits}`);
    lines.push(`visibleOutputFamilyHits=${visibleOutput.familyHits}`);
    lines.push(`realCanonicalSha256Hits=${visibleOutput.realCanonicalSha256Hits}`);
    lines.push(`visibleOutputVocabularyDisjoint=${visibleOutput.vocabularyDisjoint}`);
    lines.push(`hashWithholdingAllPaths=${visibleOutput.hashWithholdingAllPaths}`);
    return lines;
}

function runCli() {
    const args = process.argv.slice(2);
    const mode = args[0] || null;
    const payload = buildCanonicalContractPayload();
    const noArgumentModes = ["--verify-artifact", "--verify-precommit-scope", "--verify-c1-wiring", "--verify"];
    const validInvocation = (noArgumentModes.includes(mode) && args.length === 1)
        || (mode === "--verify-commit-scope" && args.length === 2);
    if (!validInvocation) {
        emitValidatedCliOutput("stderr", formatInvalidCli(), payload);
        process.exitCode = 1;
        return;
    }

    try {
        if (mode === "--verify-precommit-scope") {
            const scope = verifyPrecommitScope();
            emitValidatedCliOutput("stdout", formatPrecommitScopeSuccess(scope), payload);
            return;
        }

        if (mode === "--verify-commit-scope") {
            const scope = verifyCommitScope(args[1]);
            emitValidatedCliOutput("stdout", formatCommitScopeSuccess(scope), payload);
            return;
        }

        const result = verifyRepositoryFailureCodeContract();
        if (mode === "--verify-artifact") {
            emitValidatedCliOutput("stdout", formatWithheldSummary(result, "L4_FAILURE_CODE_CONTRACT_ARTIFACT_PASS", "NOT_COMPLETE"), payload);
            return;
        }

        if (mode === "--verify-c1-wiring") {
            const missing = missingWiring(result.wiring, ["c1Constructor", "c1Parser"]);
            if (missing.length > 0) {
                emitValidatedCliOutput("stdout", formatMigrationIncomplete(missing, "c1-wiring"), payload);
                process.exitCode = 1;
                return;
            }
            emitValidatedCliOutput("stdout", formatWithheldSummary(result, "L4_FAILURE_CODE_C1_WIRING_PASS", "C1_COMPLETE"), payload);
            return;
        }

        const missing = missingWiring(result.wiring, ["c1Constructor", "c1Parser", "harnessResult"]);
        if (missing.length > 0) {
            emitValidatedCliOutput("stdout", formatMigrationIncomplete(missing), payload);
            process.exitCode = 1;
            return;
        }

        emitValidatedCliOutput("stdout", formatWithheldSummary(result, "L4_FAILURE_CODE_CONTRACT_PASS", "COMPLETE"), payload);
    } catch (error) {
        emitValidatedCliOutput("stderr", formatVerificationFailure(error, payload), payload);
        process.exitCode = 1;
    }
}

module.exports = {
    FailureCodeContractError,
    isKnownC1FailureCode,
    assertKnownC1FailureCode,
    isKnownHarnessFailureCode,
    assertKnownHarnessFailureCode,
    verifyRepositoryFailureCodeContract,
    verifyPrecommitScope,
    verifyCommitScope,
    buildCanonicalContractPayload,
    serializeCanonicalContractPayload,
    hashCanonicalContractPayload,
};

if (require.main === module) {
    runCli();
}
