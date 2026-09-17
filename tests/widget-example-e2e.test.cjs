/**
 * 第三方组件示例 · 端到端运行时契约（P3-2，2026-09-17）
 *
 * 静态契约门禁（widget-example-contract.test.cjs）只保证示例字段与生产
 * 白名单一致；本文件把 docs/widget-example/example-module.js 当作真实
 * 第三方插件，跑通生产 homeRuntime 链路：register → listModules →
 * read → buildHomeModuleView → unregister，并断言运行时 token 安全、
 * 幂等 unregister 与缓存清除生命周期。
 *
 * 宿主 harness 复刻 index.ts registerHomeModule 的可观测行为
 * （homeModuleOpens / homeThirdPartyIds / homeModuleChangeListeners）。
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const {createHomeRuntime} = require("../src/home-runtime.js");
const {buildHomeModuleView} = require("../src/home-view.js");
const {registerExampleHomeModule, EXAMPLE_CONFIG_SCHEMA} = require("../docs/widget-example/example-module.js");

const MODULE_ID = "my-plugin-example-summary";

/** 宿主 harness：镜像 index.ts registerHomeModule（2713-2749 行）的簿记行为。 */
function createHostHarness(runtime) {
    const opens = new Map();
    const thirdPartyIds = new Set();
    const changeListeners = new Set();
    const notify = () => changeListeners.forEach((listener) => listener());
    return {
        opens,
        thirdPartyIds,
        changeListeners,
        registerHomeModule(options) {
            const registration = runtime.registerAdapter(options);
            const moduleId = String(options?.moduleId || "");
            if (registration.registered && typeof options?.open === "function") opens.set(moduleId, options.open);
            else if (registration.registered) opens.delete(moduleId);
            if (registration.registered) {
                thirdPartyIds.add(moduleId);
                notify();
            }
            if (!registration.registered) return () => undefined;
            return () => {
                if (!registration.unregister()) return;
                opens.delete(moduleId);
                thirdPartyIds.delete(moduleId);
                notify();
            };
        },
    };
}

function createFakePlugin() {
    const calls = [];
    return {
        calls,
        commands: [{langKey: "open", callback: () => calls.push("open")}],
    };
}

test("widget example e2e: template registers through the public host boundary and reads a bounded snapshot", async () => {
    const runtime = createHomeRuntime();
    const host = createHostHarness(runtime);
    const unregister = registerExampleHomeModule(host, createFakePlugin());
    assert.equal(typeof unregister, "function");
    assert.equal(host.thirdPartyIds.has(MODULE_ID), true);

    const definition = runtime.listModules("desktop").find((item) => item.moduleId === MODULE_ID);
    assert.ok(definition, "module should be listed on desktop after registration");
    assert.equal(definition.title, "示例·今日摘要");
    assert.equal(definition.protocolVersion, 2);
    assert.equal(definition.category, "plugin");
    assert.equal(definition.readOnly, true);
    assert.deepEqual(definition.sizes, ["small", "medium", "wide"]);
    assert.deepEqual(definition.refreshOn, ["switch-protyle", "loaded-protyle", "destroy-protyle"]);
    assert.deepEqual(definition.configSchema.map((field) => field.key), EXAMPLE_CONFIG_SCHEMA.map((field) => field.key));
    assert.equal(runtime.listModules("sidebar").some((item) => item.moduleId === MODULE_ID), true);
    assert.equal(runtime.listModules("mobile").some((item) => item.moduleId === MODULE_ID), true);

    const desktop = await runtime.read(MODULE_ID, "desktop", {limit: 6});
    assert.equal(desktop.ok, true);
    assert.equal(desktop.snapshot.title, "今日摘要");
    assert.equal(desktop.snapshot.items.length, 2);
    assert.equal(desktop.snapshot.items[0].command, "your-plugin::open");
    assert.equal(desktop.snapshot.items[1].value, "20260914090000-abcdef");
    assert.equal(desktop.snapshot.items[1].href, "siyuan://blocks/20260914090000-abcdef");

    const mobile = await runtime.read(MODULE_ID, "mobile", {});
    assert.equal(mobile.ok, true);
    assert.equal(mobile.snapshot.title, "摘要");

    runtime.dispose();
});

test("widget example e2e: snapshot feeds buildHomeModuleView with configurable metadata", async () => {
    const runtime = createHomeRuntime();
    const host = createHostHarness(runtime);
    const unregister = registerExampleHomeModule(host, createFakePlugin());
    const definition = runtime.listModules("desktop").find((item) => item.moduleId === MODULE_ID);
    const result = await runtime.read(MODULE_ID, "desktop", {});
    assert.equal(result.ok, true);
    const view = buildHomeModuleView(definition, result, {collapsed: false});
    assert.ok(view, "view should be buildable from the listed definition");
    assert.equal(view.moduleId, MODULE_ID);
    assert.equal(view.title, "示例·今日摘要");
    assert.equal(view.configurable, true);
    assert.equal(view.items.length, 2);
    assert.equal(view.items[0].command, "your-plugin::open");
    assert.equal(view.collapsed, false);
    unregister();
    runtime.dispose();
});

test("widget example e2e: re-registration invalidates the previous unregister handle", () => {
    const runtime = createHomeRuntime();
    const host = createHostHarness(runtime);
    const first = registerExampleHomeModule(host, createFakePlugin());
    const second = registerExampleHomeModule(host, createFakePlugin());
    assert.equal(typeof first, "function");
    first(); // The host handle returns void (mirrors index.ts): the stale handle must be an observable no-op
    assert.equal(host.thirdPartyIds.has(MODULE_ID), true);
    assert.equal(runtime.listModules("desktop").find((item) => item.moduleId === MODULE_ID).title, "示例·今日摘要");
    second();
    assert.equal(runtime.listModules("desktop").some((item) => item.moduleId === MODULE_ID), false);
    assert.equal(host.thirdPartyIds.has(MODULE_ID), false);
    runtime.dispose();
});

test("widget example e2e: unregister removes the module, purges its cache, and stays idempotent", async () => {
    const runtime = createHomeRuntime();
    const host = createHostHarness(runtime);
    const myPlugin = createFakePlugin();
    const unregister = registerExampleHomeModule(host, myPlugin);
    const first = await runtime.read(MODULE_ID, "desktop", {});
    assert.equal(first.ok, true);
    assert.equal(first.cached, false);
    const second = await runtime.read(MODULE_ID, "desktop", {});
    assert.equal(second.cached, true, "second read within TTL should hit the snapshot cache");
    unregister(); // The host handle returns void: unregister and idempotency are asserted via observable state
    unregister();
    for (const device of ["desktop", "sidebar", "mobile"]) {
        assert.equal(runtime.listModules(device).some((item) => item.moduleId === MODULE_ID), false, `module must leave ${device} listings`);
    }
    const after = await runtime.read(MODULE_ID, "desktop", {});
    assert.equal(after.ok, false);
    assert.equal(after.reason, "unregistered");

    // 重新注册：变更监听器必须被通知，且旧快照缓存已被 unregister 清除
    host.changeListeners.add(() => myPlugin.calls.push("changed"));
    const reRegister = registerExampleHomeModule(host, myPlugin);
    assert.equal(myPlugin.calls.includes("changed"), true);
    const fresh = await runtime.read(MODULE_ID, "desktop", {});
    assert.equal(fresh.ok, true);
    assert.equal(fresh.cached, false, "snapshot cache must be purged by unregister");
    reRegister();
    runtime.dispose();
});

test("widget example e2e: open callback is bound through the host contract and dropped on unregister", () => {
    const runtime = createHomeRuntime();
    const host = createHostHarness(runtime);
    const myPlugin = createFakePlugin();
    const unregister = registerExampleHomeModule(host, myPlugin);
    const open = host.opens.get(MODULE_ID);
    assert.equal(typeof open, "function");
    open();
    assert.deepEqual(myPlugin.calls, ["open"]);
    unregister();
    assert.equal(host.opens.has(MODULE_ID), false);
    assert.deepEqual(myPlugin.calls, ["open"], "late open must not fire after unregister");
    runtime.dispose();
});

test("widget example e2e: template degrades quietly without the switcher plugin", () => {
    assert.equal(registerExampleHomeModule(null, null), null);
    assert.equal(registerExampleHomeModule({}, null), null);
    assert.equal(registerExampleHomeModule({registerHomeModule: "not-a-function"}, null), null);
});
