const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {spawnSync} = require("node:child_process");

const root = path.resolve(__dirname, "..");
const indexPath = path.join(root, "docs", "current-status-index.json");
const auditPath = path.join(root, "scripts", "current-status-audit.cjs");
function audit() { return spawnSync(process.execPath, [auditPath], {cwd: root, encoding: "utf8"}); }

test("current status index is valid and points to existing evidence", () => {
    const result = audit();
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /current-status-audit: 10 tasks valid/);
    assert.match(result.stdout, /"completed":4/);
    assert.match(result.stdout, /"in_progress":1/);
});

test("current status audit rejects an in-progress task without evidence", () => {
    const backup = fs.readFileSync(indexPath);
    try {
        const index = JSON.parse(backup);
        index.tasks.find((item) => item.id === "T-7113").evidence = [];
        fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));
        const result = audit();
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, /T-7113 必须有 evidence/);
    } finally { fs.writeFileSync(indexPath, backup); }
});

test("current status audit rejects blocked tasks without a blocker", () => {
    const backup = fs.readFileSync(indexPath);
    try {
        const index = JSON.parse(backup);
        index.tasks.find((item) => item.id === "T-7116").blockedBy = [];
        fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));
        const result = audit();
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, /T-7116 blocked 必须有 blockedBy/);
    } finally { fs.writeFileSync(indexPath, backup); }
});

test("current status audit rejects a missing mainline merge guard", () => {
    const backup = fs.readFileSync(indexPath);
    try {
        const index = JSON.parse(backup);
        delete index.global.mainlineMerge;
        fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));
        const result = audit();
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, /必须明确禁止自动合并主线/);
    } finally { fs.writeFileSync(indexPath, backup); }
});
