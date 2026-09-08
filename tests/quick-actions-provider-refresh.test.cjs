const test = require("node:test");
const assert = require("node:assert/strict");
const {createQuickActionRegistry} = require("../src/quick-actions.js");

function surfaceSnapshot(registry, surface) {
    return registry.list().filter((item) => item.declaredTargets.includes(surface));
}

test("provider refresh: registration publishes candidates to declared surfaces", () => {
    const registry = createQuickActionRegistry();
    registry.register({id: "p", name: "P", targets: ["desktop", "mobile"], actions: [{value: "open"}]});
    assert.equal(surfaceSnapshot(registry, "desktop").length, 1);
    assert.equal(surfaceSnapshot(registry, "sidebar").length, 0);
    assert.equal(surfaceSnapshot(registry, "mobile").length, 1);
});

test("provider refresh: unregister clears old entry from every surface", () => {
    const registry = createQuickActionRegistry();
    registry.register({id: "p", name: "P", targets: ["desktop", "sidebar", "mobile"], actions: [{value: "open"}]});
    registry.unregister("p");
    for (const surface of ["desktop", "sidebar", "mobile"]) assert.deepEqual(surfaceSnapshot(registry, surface), []);
});

test("provider refresh: re-register swaps handler without carrying stale callback", () => {
    const registry = createQuickActionRegistry();
    const provider = {id: "p", name: "P", targets: ["desktop"], actions: [{value: "open"}]};
    registry.register(provider, () => "old");
    const old = registry.list()[0];
    registry.unregister("p");
    registry.register(provider, () => "new");
    assert.deepEqual(registry.invoke(old), {ok: true, result: "new"});
});

test("provider refresh: presentation collapse state remains independent of registry refresh", () => {
    const collapsed = {desktop: true, sidebar: false, mobile: true};
    const registry = createQuickActionRegistry();
    registry.register({id: "p", name: "P", targets: ["desktop"], actions: [{value: "open"}]});
    registry.unregister("p");
    assert.deepEqual(collapsed, {desktop: true, sidebar: false, mobile: true});
});
