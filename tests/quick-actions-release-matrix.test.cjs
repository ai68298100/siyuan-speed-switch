const test = require("node:test");
const assert = require("node:assert/strict");
const {createQuickActionRegistry, normalizeProvider, sanitizeQuickActions} = require("../src/quick-actions.js");

test("release matrix: legacy capability aliases and unknown surfaces normalize consistently", () => {
    for (const field of ["targets", "supportedSurfaces", "supportedDevices"]) {
        const provider = normalizeProvider({id: `p-${field}`, name: "P", [field]: ["desktop", "mobile", "unknown"]});
        assert.deepEqual(provider.targets, ["desktop", "mobile"]);
    }
});

test("release matrix: serialized candidates never contain executable callbacks", () => {
    const registry = createQuickActionRegistry();
    registry.register({id: "p", name: "P", targets: ["desktop"], actions: [{value: "open", callback: () => "bad"}]}, () => "ok");
    const candidate = registry.list()[0];
    assert.equal(Object.prototype.hasOwnProperty.call(candidate, "callback"), false);
    assert.doesNotThrow(() => JSON.stringify(candidate));
});

test("release matrix: unknown icon and legacy iconCommand normalize to safe values", () => {
    const output = sanitizeQuickActions([
        {id: "a", kind: "command", value: "a", label: "A", icon: "iconCommand"},
        {id: "b", kind: "command", value: "b", label: "B", icon: "not valid"},
    ]).items;
    assert.deepEqual(output.map((item) => item.icon), ["iconPlugin", "iconPlugin"]);
});

test("release matrix: unregister then re-register does not retain stale handler", () => {
    const registry = createQuickActionRegistry();
    const action = {id: "p", name: "P", actions: [{value: "open"}]};
    registry.register(action, () => "old");
    const candidate = registry.list()[0];
    registry.unregister("p");
    registry.register(action, () => "new");
    assert.deepEqual(registry.invoke(candidate), {ok: true, result: "new"});
});
