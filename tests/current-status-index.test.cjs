const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {spawnSync} = require("node:child_process");

const root = path.resolve(__dirname, "..");
const indexPath = path.join(root, "docs", "current-status-index.json");
const auditPath = path.join(root, "scripts", "current-status-audit.cjs");
function audit(indexOverride = indexPath) {
    return spawnSync(process.execPath, [auditPath], {
        cwd: root,
        encoding: "utf8",
        env: {...process.env, SWSS_STATUS_INDEX_PATH: indexOverride},
    });
}

function withMutatedIndex(mutator) {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "swss-status-index-"));
    const tempPath = path.join(tempDir, "current-status-index.json");
    try {
        const index = JSON.parse(fs.readFileSync(indexPath, "utf8"));
        mutator(index);
        fs.writeFileSync(tempPath, JSON.stringify(index, null, 2));
        return audit(tempPath);
    } finally {
        fs.rmSync(tempDir, {recursive: true, force: true});
    }
}

test("current status index is valid and points to existing evidence", () => {
    const index = JSON.parse(fs.readFileSync(indexPath, "utf8"));
    const expectedStatuses = {completed: 0, in_progress: 0, planned: 0, blocked: 0, deferred: 0};
    for (const item of index.tasks) expectedStatuses[item.status] += 1;
    const result = audit();
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const report = result.stdout.trim().split(/\r?\n/);
    assert.equal(report[0], `current-status-audit: ${index.tasks.length} tasks valid`);
    assert.deepEqual(JSON.parse(report[1]), expectedStatuses);
});

test("current status audit rejects an in-progress task without evidence", () => {
    const result = withMutatedIndex((index) => { index.tasks.find((item) => item.id === "T-7113").evidence = []; });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /T-7113 必须有 evidence/);
});

test("current status audit rejects blocked tasks without a blocker", () => {
    const result = withMutatedIndex((index) => { index.tasks.find((item) => item.id === "T-7116").blockedBy = []; });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /T-7116 blocked 必须有 blockedBy/);
});

test("current status audit rejects a missing mainline merge guard", () => {
    const result = withMutatedIndex((index) => { delete index.global.mainlineMerge; });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /必须明确禁止自动合并主线/);
});
