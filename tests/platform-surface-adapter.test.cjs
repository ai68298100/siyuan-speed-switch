const test = require("node:test");
const assert = require("node:assert/strict");
const {createPlatformSurfaceAdapter} = require("../src/platform-surface-model.js");

test("platform surface adapter isolates 216 device and navigation compositions", () => {
    const devices = ["desktop", "mobile"];
    const surfaces = ["switcher", "workbench", "studio"];
    const returnTargets = ["switcher", "workbench", "studio"];
    const contexts = [
        null,
        {entry: "toolbar"},
        {entry: "surface-nav", objectKind: "document", objectId: "doc-1"},
        {entry: "back", objectKind: "widget", objectId: "widget-1", query: "alpha"},
        {entry: "fab", query: "beta"},
        {entry: "command", focusSource: "search-input"},
        {entry: "external", objectId: "external-1"},
        {entry: "quick-action", objectKind: "snippet", objectId: "snippet-1"},
        {entry: "floating-ball", query: "gamma"},
        {entry: "plugin-command", objectKind: "document", objectId: "doc-2"},
        {entry: "breadcrumb", objectKind: "widget", objectId: "widget-2"},
        {entry: "topbar-context-menu", focusSource: "object:widget-3"},
    ];
    let scenarios = 0;
    for (const device of devices) {
        for (const surface of surfaces) {
            const calls = [];
            const adapter = createPlatformSurfaceAdapter({
                switcher: (returnTo, context) => calls.push({surface: "switcher", device, returnTo, context}),
                workbench: (returnTo, context) => calls.push({surface: "workbench", device, returnTo, context}),
                studio: (returnTo, context) => calls.push({surface: "studio", device, returnTo, context}),
            });
            for (const returnTo of returnTargets) {
                for (const context of contexts) {
                    calls.length = 0;
                    assert.equal(adapter(surface, returnTo, context), true);
                    assert.deepEqual(calls, [{surface, device, returnTo, context}], `${device}/${surface}/${returnTo}`);
                    scenarios += 1;
                }
            }
        }
    }
    assert.equal(scenarios, 216);
});

test("platform surface adapter rejects unknown or missing routes without invoking a handler", () => {
    let calls = 0;
    const adapter = createPlatformSurfaceAdapter({switcher: () => { calls += 1; }});
    for (const surface of ["unknown", "constructor", "toString", "valueOf", "__proto__", null, undefined, [], {}]) {
        assert.equal(adapter(surface, "switcher", null), false);
    }
    assert.equal(adapter("workbench", "switcher", null), false);
    assert.equal(calls, 0);
});
