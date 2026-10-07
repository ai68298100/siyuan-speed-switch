const test = require("node:test");
const assert = require("node:assert/strict");
const {JSDOM} = require("jsdom");
const {PROBE_SOURCE} = require("./e2e/resource-trend.cjs");

function makeWindow() {
    const dom = new JSDOM("<!doctype html><body><main id='app'></main></body>", {
        runScripts: "dangerously",
        pretendToBeVisual: true,
    });
    let resolveFetch;
    dom.window.fetch = () => new Promise((resolve) => { resolveFetch = resolve; });
    dom.window.eval(PROBE_SOURCE);
    return {dom, resolveFetch: () => resolveFetch({ok: true})};
}

test("T-7153 probe reports observed listener, timer, fetch and DOM deltas", async () => {
    const {dom, resolveFetch} = makeWindow();
    const {window} = dom;
    const probe = window.__swssResourceTrendProbe;
    assert.ok(probe);

    const baseline = probe.sample("baseline");
    assert.equal(baseline.memory, null, "jsdom must not invent a memory measurement");

    const listener = () => undefined;
    window.document.addEventListener("swss-probe", listener);
    const timeout = window.setTimeout(() => undefined, 30_000);
    const interval = window.setInterval(() => undefined, 30_000);
    void window.fetch("/probe");
    const node = window.document.createElement("div");
    node.className = "swss-probe-node";
    window.document.body.appendChild(node);
    const active = probe.sample("active");
    assert.equal(active.listenerActivity.activeObservedRegistrations, 1);
    assert.equal(active.timers.pendingObserved, 2);
    assert.equal(active.fetch.inFlightObserved, 1);
    assert.equal(active.dom.elementCount, baseline.dom.elementCount + 1);

    window.clearTimeout(timeout);
    window.clearInterval(interval);
    window.document.removeEventListener("swss-probe", listener);
    node.remove();
    resolveFetch();
    await new Promise((resolve) => setImmediate(resolve));
    const settled = probe.sample("settled");
    assert.equal(settled.listenerActivity.activeObservedRegistrations, 0);
    assert.equal(settled.timers.pendingObserved, 0);
    assert.equal(settled.fetch.inFlightObserved, 0);
    assert.equal(settled.fetch.started, 1);
    assert.equal(settled.fetch.settled, 1);
    assert.equal(settled.dom.elementCount, baseline.dom.elementCount);

    probe.dispose();
    assert.equal(window.__swssResourceTrendProbe, undefined);
    dom.window.close();
});

test("T-7153 probe source keeps evidence boundaries explicit", () => {
    assert.match(PROBE_SOURCE, /performance\?\.memory/);
    assert.match(PROBE_SOURCE, /memorySnapshot[\s\S]*?\n\s*: null/);
    assert.match(PROBE_SOURCE, /observed registrations only/);
    assert.match(PROBE_SOURCE, /elementCount/);
    assert.match(PROBE_SOURCE, /inFlightObserved/);
});
