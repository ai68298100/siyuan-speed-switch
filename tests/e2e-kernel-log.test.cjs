// T-7245: exercise the real E2E log classifier, including conservative teardown boundaries.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {pathToFileURL} = require("node:url");

const root = path.resolve(__dirname, "..");
const loadClassifier = () => import(pathToFileURL(path.join(root, "scripts", "e2e", "lib.mjs")).href);
const exited = "I 2026/10/12 12:20:44 conf.go:1156: exited kernel";
const started = "I 2026/10/12 12:20:44 operation_watchdog.go:79: operation [exit kernel servers], stage [close HTTP server] started";
const cmux = "E 2026/10/12 12:20:44 cmux.go:59: multiplexed HTTPS server error: mux: server closed";
const finished = "I 2026/10/12 12:20:44 operation_watchdog.go:91: operation [exit kernel servers], stage [close HTTP server] finished, elapsed [1.0914ms], total [504.9445ms]";

test("E2E log classifier ignores cmux only within a completed graceful HTTP shutdown", async () => {
    const {kernelErrorLines} = await loadClassifier();
    assert.deepEqual(kernelErrorLines([exited, started, cmux, finished]), []);
    assert.deepEqual(kernelErrorLines(), []);
});

test("E2E log classifier retains cmux when shutdown context is absent or incomplete", async () => {
    const {kernelErrorLines} = await loadClassifier();
    for (const lines of [[cmux], [started, cmux, finished], [exited, cmux, finished], [exited, started, cmux]]) {
        assert.deepEqual(kernelErrorLines(lines), [cmux], JSON.stringify(lines));
    }
});

test("E2E log classifier retains cmux when shutdown markers arrive out of order", async () => {
    const {kernelErrorLines} = await loadClassifier();
    for (const lines of [[started, exited, cmux, finished], [exited, cmux, started, finished], [exited, started, finished, cmux], [finished, started, cmux, exited]]) {
        assert.deepEqual(kernelErrorLines(lines), [cmux], JSON.stringify(lines));
    }
});

test("E2E log classifier preserves other errors and rejects cmux lookalikes", async () => {
    const {kernelErrorLines} = await loadClassifier();
    const errors = [
        "E 2026/10/12 12:20:44 database.go:23: write failed",
        "[E] network unavailable",
        "PANIC unexpected nil pointer",
        "F [fatal] kernel stopped",
        cmux.replace("cmux.go", "other.go"),
        cmux + " unexpectedly",
        cmux.replace("mux: server closed", "mux: listener failed"),
    ];
    assert.deepEqual(kernelErrorLines([exited, started, cmux, ...errors, finished]), errors);
});

test("E2E log classifier does not reuse shutdown context across separate close attempts", async () => {
    const {kernelErrorLines} = await loadClassifier();
    const outside = cmux.replace("12:20:44", "12:20:45");
    assert.deepEqual(kernelErrorLines([exited, started, cmux, finished, started, outside, finished]), [outside]);
    assert.deepEqual(kernelErrorLines([exited, started, cmux, started, finished]), [cmux]);
});

test("E2E log classifier retains its existing workspace-lock exclusion", async () => {
    const {kernelErrorLines} = await loadClassifier();
    assert.deepEqual(kernelErrorLines([
        "E 2026/10/12 12:20:44 lock.go:23: lock: another process is using this workspace",
        "E 2026/10/12 12:20:44 lock.go:24: workspace is being locked",
        cmux,
    ]), [cmux]);
});

test("E2E log classifier audits the available real kernel shutdown log", async (t) => {
    // Artifacts are optional observations, never a required fixture or release prerequisite.
    const logPath = path.join(root, ".artifacts", "e2e", "kernel.log");
    if (!fs.existsSync(logPath)) return t.skip("No local E2E kernel log is available.");
    const lines = fs.readFileSync(logPath, "utf8").split(/\r?\n/);
    const exitIndex = lines.lastIndexOf(exited);
    const startIndex = lines.indexOf(started, exitIndex + 1);
    const cmuxIndex = lines.indexOf(cmux, startIndex + 1);
    const finishIndex = lines.indexOf(finished, cmuxIndex + 1);
    if (exitIndex < 0 || startIndex <= exitIndex || cmuxIndex <= startIndex || finishIndex <= cmuxIndex) {
        return t.skip("The local artifact does not contain this run's known shutdown sequence.");
    }
    const {kernelErrorLines} = await loadClassifier();
    assert.deepEqual(kernelErrorLines(lines.slice(exitIndex, finishIndex + 1)), []);
    assert.deepEqual(kernelErrorLines([lines[cmuxIndex]]), [cmux]);
    t.diagnostic("Audited the real kernel.log shutdown at lines " + (exitIndex + 1) + "–" + (finishIndex + 1) + "; the raw log remains unchanged.");
});
