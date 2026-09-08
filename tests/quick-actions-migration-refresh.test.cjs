const test = require("node:test");
const assert = require("node:assert/strict");
const {createQuickActionRegistry, sanitizeQuickActions} = require("../src/quick-actions.js");

test("migration refresh: imported provider metadata is available on all declared surfaces after re-register", () => {
    const registry = createQuickActionRegistry();
    const imported = sanitizeQuickActions([{id: "p", kind: "adapter", value: "p/open", label: "入口", targets: ["desktop", "mobile"]}]).items[0];
    registry.register({id: "p", name: "P", targets: imported.targets, actions: [{value: imported.value}]}, () => "ok");
    assert.deepEqual(registry.list().map((item) => item.declaredTargets), [["desktop", "mobile"]]);
});

test("migration refresh: old callback is isolated after imported provider re-registration", () => {
    const registry = createQuickActionRegistry();
    const provider = {id: "p", name: "P", actions: [{value: "open"}]};
    let oldCalls = 0;
    registry.register(provider, () => { oldCalls += 1; return "old"; });
    const candidate = registry.list()[0];
    registry.unregister("p");
    registry.register(provider, () => "new");
    assert.deepEqual(registry.invoke(candidate), {ok: true, result: "new"});
    assert.equal(oldCalls, 0);
});

test("migration refresh: each surface sees the same post-import candidate snapshot", () => {
    const registry = createQuickActionRegistry();
    registry.register({id: "p", name: "P", targets: ["desktop", "sidebar", "mobile"], actions: [{value: "open"}]});
    const counts = ["desktop", "sidebar", "mobile"].map((surface) => registry.list().filter((item) => item.declaredTargets.includes(surface)).length);
    assert.deepEqual(counts, [1, 1, 1]);
});
