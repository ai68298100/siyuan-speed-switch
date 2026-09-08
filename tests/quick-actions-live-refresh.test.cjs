const test = require("node:test");
const assert = require("node:assert/strict");
const {sanitizeQuickActions} = require("../src/quick-actions.js");

function publish(config, surfaces) {
    const normalized = sanitizeQuickActions(config).items;
    return Object.fromEntries(surfaces.map((surface) => [surface, normalized.filter((item) => item.targets.includes(surface))]));
}

test("live refresh: one save publishes normalized state to all surfaces", () => {
    const state = publish([
        {id: "j", kind: "builtin", value: "journal", label: "日记", targets: ["desktop", "mobile"]},
        {id: "s", kind: "builtin", value: "settings", label: "设置", targets: ["desktop", "sidebar", "mobile"]},
    ], ["desktop", "sidebar", "mobile"]);
    assert.deepEqual(state.desktop.map((x) => x.id), ["j", "s"]);
    assert.deepEqual(state.sidebar.map((x) => x.id), ["s"]);
    assert.deepEqual(state.mobile.map((x) => x.id), ["j", "s"]);
});

test("live refresh: removed entries disappear without affecting remaining surfaces", () => {
    const state = publish([{id: "s", kind: "builtin", value: "settings", label: "设置", targets: ["desktop", "mobile"]}], ["desktop", "sidebar", "mobile"]);
    assert.deepEqual(state.desktop.map((x) => x.id), ["s"]);
    assert.deepEqual(state.sidebar, []);
    assert.deepEqual(state.mobile.map((x) => x.id), ["s"]);
});

test("live refresh: collapsed presentation state is local and survives config migration", () => {
    const config = [{id: "s", kind: "builtin", value: "settings", label: "设置", targets: ["desktop"]}];
    const collapsed = {desktop: true, sidebar: false, mobile: true};
    const migrated = sanitizeQuickActions(config).items;
    assert.equal(migrated.length, 1);
    assert.deepEqual(collapsed, {desktop: true, sidebar: false, mobile: true});
});
