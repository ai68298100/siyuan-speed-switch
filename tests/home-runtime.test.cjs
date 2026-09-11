const test = require("node:test");
const assert = require("node:assert/strict");
const {createHomeRuntime} = require("../src/home-runtime.js");

test("home runtime registers a device-scoped read-only module and reads bounded data", async () => {
    const runtime = createHomeRuntime();
    const registration = runtime.registerAdapter({moduleId: "demo-module", title: "Demo", supportedDevices: ["desktop", "mobile"], read: async () => ({title: "Demo", items: [{label: "Ready", value: "1"}]})});
    assert.equal(registration.registered, true);
    assert.equal(runtime.listModules("sidebar").some((item) => item.moduleId === "demo-module"), false);
    assert.equal(runtime.listModules("mobile").find((item) => item.moduleId === "demo-module").title, "Demo");
    assert.equal((await runtime.read("demo-module", "mobile")).snapshot.items[0].label, "Ready");
    runtime.dispose();
    assert.equal((await runtime.read("demo-module", "mobile")).ok, false);
});

test("home runtime preserves bounded protocol metadata for discovery", () => {
    const runtime = createHomeRuntime();
    const registration = runtime.registerAdapter({
        moduleId: "meta-module",
        title: "Meta module",
        description: "A discoverable module",
        icon: "iconInfo",
        category: "plugin",
        supportedDevices: ["desktop"],
        sizes: ["small", "wide", "invalid"],
        protocolVersion: 2,
        author: "Example",
        homepage: "https://example.com/widget",
        clickCommand: "example::open",
        configSchema: [{key: "limit", label: "Limit", type: "number", min: 1, max: 8, defaults: 4}],
        refreshOn: ["loaded-protyle", "unsafe-event"],
        read: () => ({}),
    });
    const definition = runtime.listModules("desktop").find((item) => item.moduleId === "meta-module");
    assert.equal(registration.registered, true);
    assert.equal(definition.description, "A discoverable module");
    assert.deepEqual(definition.sizes, ["small", "wide"]);
    assert.equal(definition.protocolVersion, 2);
    assert.deepEqual(definition.configSchema[0].key, "limit");
    assert.deepEqual(definition.refreshOn, ["loaded-protyle"]);
    assert.equal(definition.readOnly, true);
    runtime.dispose();
});

test("home runtime replacement invalidates the previous registration", () => {
    const runtime = createHomeRuntime();
    const first = runtime.registerAdapter({moduleId: "replace", title: "First", supportedDevices: ["desktop"], read: () => ({})});
    const second = runtime.registerAdapter({moduleId: "replace", title: "Second", supportedDevices: ["desktop"], read: () => ({})});
    assert.equal(first.unregister(), false);
    assert.equal(runtime.listModules("desktop").find((item) => item.moduleId === "replace").title, "Second");
    assert.equal(second.unregister(), true);
    runtime.dispose();
});

test("home runtime unregister removes dynamic modules from device listings", () => {
    const runtime = createHomeRuntime([{moduleId: "built-in", title: "Built in", supportedDevices: ["desktop"], read: () => ({})}]);
    const registration = runtime.registerAdapter({moduleId: "dynamic", title: "Dynamic", supportedDevices: ["desktop"], read: () => ({})});
    assert.equal(runtime.listModules("desktop").some((item) => item.moduleId === "dynamic"), true);
    assert.equal(registration.unregister(), true);
    assert.equal(runtime.listModules("desktop").some((item) => item.moduleId === "dynamic"), false);
    assert.equal(runtime.listModules("desktop").some((item) => item.moduleId === "built-in"), true);
    runtime.dispose();
});

test("home runtime forces third-party module definitions to remain read-only", () => {
    const runtime = createHomeRuntime();
    const registration = runtime.registerAdapter({
        moduleId: "writable-claim",
        title: "Writable claim",
        supportedDevices: ["desktop"],
        readOnly: false,
        read: () => ({}),
    });
    assert.equal(registration.registered, true);
    assert.equal(runtime.listModules("desktop").find((item) => item.moduleId === "writable-claim").readOnly, true);
    runtime.dispose();
});

test("home runtime distinguishes an unregistered module from an unsupported device", async () => {
    const runtime = createHomeRuntime();
    assert.equal((await runtime.read("missing-module", "desktop")).reason, "unregistered");
    runtime.registerAdapter({moduleId: "desktop-only", title: "Desktop", supportedDevices: ["desktop"], read: () => ({})});
    assert.equal((await runtime.read("desktop-only", "mobile")).reason, "unsupported");
    runtime.dispose();
});

test("home runtime rejects adapter ids that would normalize to another id", () => {
    const runtime = createHomeRuntime();
    const spaced = runtime.registerAdapter({moduleId: "bad id", title: "Bad", supportedDevices: ["desktop"], read: () => ({})});
    const scripted = runtime.registerAdapter({moduleId: "<script>", title: "Bad", supportedDevices: ["desktop"], read: () => ({})});
    assert.equal(spaced.registered, false);
    assert.equal(scripted.registered, false);
    assert.equal(runtime.listModules("desktop").some((item) => item.moduleId === "badid"), false);
    runtime.dispose();
});
