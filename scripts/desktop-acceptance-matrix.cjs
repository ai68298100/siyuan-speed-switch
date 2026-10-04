const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const MATRIX_PATH = path.join(ROOT, "tests", "fixtures", "desktop-acceptance-matrix.json");
const LOCAL_STATUSES = new Set(["verified", "prepared"]);
const HOST_STATUSES = new Set(["verified", "partial", "pending"]);
const EVIDENCE_KINDS = new Set(["acceptance-template", "chromium", "contract", "design", "real-host-api", "real-host-e2e"]);

function fail(message) {
    throw new Error(`desktop-acceptance-matrix: ${message}`);
}

function readMatrix(filePath = MATRIX_PATH) {
    try {
        return JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch (error) {
        fail(`矩阵无法解析：${error.message}`);
    }
}

function validateEvidence(entries, label) {
    if (!Array.isArray(entries) || entries.length === 0) fail(`${label} 必须有 evidence`);
    for (const entry of entries) {
        if (!entry || typeof entry !== "object") fail(`${label} evidence 项必须是对象`);
        if (typeof entry.path !== "string" || !entry.path || path.isAbsolute(entry.path)) fail(`${label} evidence 路径非法`);
        if (!EVIDENCE_KINDS.has(entry.kind)) fail(`${label} evidence kind 非法：${entry.kind}`);
        if (!fs.existsSync(path.resolve(ROOT, entry.path))) fail(`${label} evidence 不存在：${entry.path}`);
    }
}

function validateMatrix(matrix) {
    if (!matrix || typeof matrix !== "object" || Array.isArray(matrix)) fail("矩阵根必须是对象");
    if (matrix.schemaVersion !== 1) fail("schemaVersion 必须为 1");
    if (matrix.task !== "T-7115") fail("task 必须为 T-7115");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(matrix.updated)) fail("updated 必须为 YYYY-MM-DD");
    if (matrix.policy?.browserEvidence !== "local_only") fail("browserEvidence 必须明确为 local_only");
    if (!Array.isArray(matrix.cases) || matrix.cases.length < 8) fail("cases 数量不足");
    const ids = new Set();
    const areas = new Set();
    let pending = 0;
    let partial = 0;
    let localVerified = 0;
    for (const item of matrix.cases) {
        if (!item || typeof item !== "object" || !item.id || ids.has(item.id)) fail(`case id 非法或重复：${item?.id}`);
        ids.add(item.id);
        areas.add(item.area);
        if (typeof item.requirement !== "string" || item.requirement.length < 20) fail(`${item.id} requirement 过短`);
        if (!LOCAL_STATUSES.has(item.local?.status)) fail(`${item.id} local status 非法`);
        validateEvidence(item.local.evidence, `${item.id}.local`);
        if (!HOST_STATUSES.has(item.host?.status)) fail(`${item.id} host status 非法`);
        if (item.local.status === "verified") localVerified++;
        if (item.host.status === "pending") {
            pending++;
            if (!Array.isArray(item.host.blockers) || item.host.blockers.length === 0) fail(`${item.id} pending 必须有 blockers`);
            if (item.host.evidence !== undefined) fail(`${item.id} pending 不得伪造 host evidence`);
            for (const blocker of item.host.blockers) {
                if (typeof blocker !== "string" || !fs.readFileSync(path.join(ROOT, "BLOCKERS.md"), "utf8").includes(blocker)) fail(`${item.id} blocker 不在 BLOCKERS.md：${blocker}`);
            }
        } else {
            partial += item.host.status === "partial" ? 1 : 0;
            validateEvidence(item.host.evidence, `${item.id}.host`);
            if (item.host.status === "verified" && item.host.evidence.every((entry) => entry.kind === "chromium")) fail(`${item.id} 不得用 Chromium 单独宣称 host verified`);
        }
    }
    for (const requiredArea of ["path_filter", "narrow_sidebar", "desktop_visual", "keyboard", "screen_reader", "responsive", "lifecycle", "failure_paths"]) {
        if (!areas.has(requiredArea)) fail(`缺少验收区域：${requiredArea}`);
    }
    return {cases: matrix.cases.length, areas: areas.size, localVerified, partialHost: partial, pendingHost: pending};
}

if (require.main === module) {
    try {
        const summary = validateMatrix(readMatrix());
        console.log(`desktop-acceptance-matrix: ${summary.cases} cases valid`);
        console.log(JSON.stringify(summary));
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}

module.exports = {MATRIX_PATH, readMatrix, validateMatrix};
