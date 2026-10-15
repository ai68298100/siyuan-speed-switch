const test = require("node:test");
const assert = require("node:assert/strict");
const net = require("node:net");
const path = require("node:path");
const {pathToFileURL} = require("node:url");

const root = path.resolve(__dirname, "..");
const loadE2e = () => import(pathToFileURL(path.join(root, "scripts", "e2e", "lib.mjs")).href);

test("E2E port guard rejects foreign listeners and accepts only the child kernel PID", async () => {
    const {assertPortOwnedByChild, assertPortUnoccupied, listeningOwners, waitForPortOwnedByChild} = await loadE2e();
    const server = net.createServer();
    await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", resolve);
    });
    const port = server.address().port;
    try {
        assert.ok(listeningOwners(port).has(process.pid), "the real listener is attributed to this process");
        assert.throws(() => assertPortUnoccupied(port), /拒绝启动 E2E.*占用/);
        assert.doesNotThrow(() => assertPortOwnedByChild(port, process.pid));
        assert.throws(() => assertPortOwnedByChild(port, process.pid + 1), /不属于本轮唯一内核进程/);
        await assert.rejects(waitForPortOwnedByChild(port, process.pid + 1, 250), /被其他进程占用/);
    } finally {
        await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
    assert.doesNotThrow(() => assertPortUnoccupied(port));
});

