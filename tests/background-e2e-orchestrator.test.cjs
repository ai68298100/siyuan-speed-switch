const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {pathToFileURL} = require("node:url");

const root = path.resolve(__dirname, "..");

async function loadOrchestrator() {
    return import(pathToFileURL(path.join(root, "scripts", "e2e", "background-orchestrator.mjs")).href);
}

test("background E2E normalizes unique jobs and rejects unsafe ids", async () => {
    const {normalizeJobs} = await loadOrchestrator();
    const jobs = normalizeJobs([
        {id: "speed-switch", repoRoot: root, pluginName: "siyuan-speed-switch", command: ["pnpm", "test:e2e"]},
        {id: "calendar", repoRoot: root, pluginName: "calendar", command: ["pnpm", "test:e2e"]},
    ]);
    assert.deepEqual(jobs.map((job) => job.id), ["speed-switch", "calendar"]);
    assert.equal(process.platform === "win32" ? jobs[0].command[0] === process.execPath || jobs[0].command[0].endsWith("pnpm.cmd") : jobs[0].command[0] === "pnpm", true);
    assert.throws(() => normalizeJobs([{id: "../shared", repoRoot: root}]), /任务 id 非法/);
    assert.throws(() => normalizeJobs([{id: "same", repoRoot: root}, {id: "same", repoRoot: root}]), /任务 id 重复/);
});

test("background E2E snapshot is content-addressed and detects mutation", async () => {
    const {createPluginSnapshot, assertSnapshotUnchanged} = await loadOrchestrator();
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), "swss-background-contract-"));
    const dist = path.join(temp, "dist");
    const snapshotRoot = path.join(temp, "snapshot");
    fs.mkdirSync(dist, {recursive: true});
    fs.writeFileSync(path.join(dist, "index.js"), "plugin-js\n");
    fs.writeFileSync(path.join(dist, "index.css"), "plugin-css\n");
    fs.writeFileSync(path.join(dist, "plugin.json"), JSON.stringify({name: "fixture-plugin", version: "1.0.0"}));
    try {
        const snapshot = createPluginSnapshot({repoRoot: temp, distDir: dist, snapshotRoot});
        assert.equal(snapshot.pluginName, "fixture-plugin");
        assert.equal(assertSnapshotUnchanged(snapshot).sha256, snapshot.sha256);
        fs.appendFileSync(path.join(snapshot.distDir, "index.js"), "mutated\n");
        assert.throws(() => assertSnapshotUnchanged(snapshot), /固定构建快照被修改/);
    } finally {
        fs.rmSync(temp, {recursive: true, force: true});
    }
});

test("background E2E port leases do not overlap and release for the next run", async () => {
    const {acquirePortLease} = await loadOrchestrator();
    const leaseRoot = fs.mkdtempSync(path.join(os.tmpdir(), "swss-background-ports-"));
    try {
        const first = await acquirePortLease({basePort: 19000, scanLimit: 4, leaseRoot, owner: "contract:first"});
        const second = await acquirePortLease({basePort: 19000, scanLimit: 4, leaseRoot, owner: "contract:second"});
        assert.notEqual(first.port, second.port);
        first.release();
        const third = await acquirePortLease({basePort: 19000, scanLimit: 4, leaseRoot, owner: "contract:third"});
        assert.equal(third.port, first.port);
        second.release();
        third.release();
    } finally {
        fs.rmSync(leaseRoot, {recursive: true, force: true});
    }
});

test("background E2E dry-run allocates isolated workspace, port, artifact, and snapshot plans", async () => {
    const {normalizeJobs, createRunPlan} = await loadOrchestrator();
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), "swss-background-plan-"));
    const dist = path.join(temp, "dist");
    fs.mkdirSync(dist, {recursive: true});
    fs.writeFileSync(path.join(dist, "index.js"), "plugin-js\n");
    fs.writeFileSync(path.join(dist, "index.css"), "plugin-css\n");
    fs.writeFileSync(path.join(dist, "plugin.json"), JSON.stringify({name: "fixture-plugin", version: "1.0.0"}));
    try {
        const jobs = normalizeJobs([
            {id: "one", repoRoot: temp, distDir: dist, command: ["node", "-e", "process.exit(0)"]},
            {id: "two", repoRoot: temp, distDir: dist, command: ["node", "-e", "process.exit(0)"]},
        ]);
        const run = await createRunPlan({jobs, runRoot: path.join(temp, "runs"), workspaceRoot: path.join(temp, "workspaces"), basePort: 19100, portScanLimit: 4});
        assert.notEqual(run.plans[0].workspace, run.plans[1].workspace);
        assert.notEqual(run.plans[0].artifactDir, run.plans[1].artifactDir);
        assert.notEqual(run.plans[0].port, run.plans[1].port);
        assert.equal(run.plans[0].snapshot.sha256, run.plans[1].snapshot.sha256);
        assert.equal(fs.existsSync(path.join(run.root, "run.json")), true);
        run.leases.forEach((lease) => lease.release());
    } finally {
        fs.rmSync(temp, {recursive: true, force: true});
    }
});
