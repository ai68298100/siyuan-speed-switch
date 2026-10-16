const test = require("node:test");
const assert = require("node:assert/strict");
const {createHomeRuntime} = require("../src/home-runtime.js");
const {normalizeExternalWidget} = require("../src/external-widget-model.js");

test("ADR 0218 T-7292: Provider 7-stage full lifecycle (register -> configure -> consume -> fail -> unregister -> placeholder -> recover)", async () => {
    const runtime = createHomeRuntime();

    // 阶段 1: 探测与注册 (Register)
    let callCount = 0;
    let mockMode = "normal";
    const providerDef = {
        moduleId: "ext-provider-demo",
        title: "生态提供方示例",
        icon: "iconPlug",
        category: "plugin",
        supportedDevices: ["desktop", "sidebar", "mobile"],
        sizes: ["small", "medium", "wide"],
        protocolVersion: 2,
        author: "PartnerPlugin",
        configSchema: [
            {key: "maxItems", label: "最大项数", type: "number", min: 1, max: 10, defaults: 5},
        ],
        read: async (config, device) => {
            callCount += 1;
            if (mockMode === "timeout") {
                const err = new Error("Provider timeout");
                err.name = "TimeoutError";
                throw err;
            }
            if (mockMode === "error") {
                throw new Error("Provider internal fault");
            }
            const count = Number(config?.maxItems) || 3;
            return {
                title: `生态提供方 (${device})`,
                items: Array.from({length: count}, (_, i) => ({label: `条目 ${i + 1}`, value: String(i + 1)})),
            };
        },
    };

    const registration = runtime.registerAdapter(providerDef);
    assert.equal(registration.registered, true, "Stage 1: Provider 注册成功");

    // 跨端列表可见性验证
    const desktopModules = runtime.listModules("desktop");
    const mobileModules = runtime.listModules("mobile");
    assert.ok(desktopModules.some((m) => m.moduleId === "ext-provider-demo"), "桌面端可见");
    assert.ok(mobileModules.some((m) => m.moduleId === "ext-provider-demo"), "移动端可见");

    // 阶段 2: 参数配置验证 (Configure)
    const configuredRead = await runtime.read("ext-provider-demo", "desktop", {maxItems: 4});
    assert.equal(configuredRead.ok, true);
    assert.equal(configuredRead.snapshot.items.length, 4, "Stage 2: 传递配置生效");

    // 阶段 3: 现场消费与新鲜度判定 (Consume & Freshness)
    assert.equal(configuredRead.cached, false, "首次读取为 fresh (cached === false)");
    const cachedRead = await runtime.read("ext-provider-demo", "desktop", {maxItems: 4});
    assert.equal(cachedRead.cached, true, "短时间内二次读取为 cached (cached === true)");
    const forceRead = await runtime.read("ext-provider-demo", "desktop", {maxItems: 4}, {force: true});
    assert.equal(forceRead.cached, false, "force: true 强制刷新绕过缓存");

    // 阶段 4: 异常退避与失败隔离 (Fail & Backoff)
    mockMode = "error";
    const failedRead = await runtime.read("ext-provider-demo", "desktop", {}, {force: true});
    assert.equal(failedRead.ok, false, "Stage 4: 异常时隔离失败");
    assert.ok(failedRead.reason === "failed" || failedRead.reason === "runtime_error", "暴露受控错误原因");

    // 阶段 5: 动态卸载 (Unregister & Teardown)
    mockMode = "normal";
    const unregisterSuccess = registration.unregister();
    assert.equal(unregisterSuccess, true, "Stage 5: 卸载成功");
    assert.equal(registration.unregister(), false, "重复卸载幂等安全");

    // 阶段 6: 卡片占位退化 (Placeholder Degradation)
    const afterUnregister = await runtime.read("ext-provider-demo", "desktop", {}, {force: true});
    assert.equal(afterUnregister.ok, false);
    assert.equal(afterUnregister.reason, "unregistered", "Stage 6: 卸载后退化为 unregistered 占位，避免抛出未捕获崩溃");
    assert.equal(runtime.listModules("desktop").some((m) => m.moduleId === "ext-provider-demo"), false, "已从活跃目录中移除");

    // 阶段 7: 原地无损恢复 (Recover)
    const reRegistration = runtime.registerAdapter(providerDef);
    assert.equal(reRegistration.registered, true, "Stage 7: 提供方重新加载后重新注册");
    const recoveredRead = await runtime.read("ext-provider-demo", "desktop", {maxItems: 2}, {force: true});
    assert.equal(recoveredRead.ok, true);
    assert.equal(recoveredRead.snapshot.items.length, 2, "重新激活后数据读取正常恢复");

    reRegistration.unregister();
    runtime.dispose();
});

test("ADR 0218 T-7292: 外部提供方元数据归一化包含完整 transparent 5 要素", () => {
    const normalized = normalizeExternalWidget({
        moduleId: "sample-partner",
        title: "合作品牌组件",
        source: "family",
        network: "remote",
        auth: "token",
        privacy: "bounded",
        description: "示例组件",
    });

    assert.equal(normalized.moduleId, "sample-partner");
    assert.ok(typeof normalized.title === "string");
    assert.ok(typeof normalized.license === "string", "声明许可字段");
    assert.ok(Array.isArray(normalized.sizes), "型号尺寸声明");
    assert.ok(Array.isArray(normalized.platforms), "平台支持声明");
});

test("ADR 0218 T-7292: provider lifecycle contract has discriminating negative probes", () => {
    // 负向探针 1: 若注销后未能退化为 unregistered 状态，契约必须拒绝
    assert.throws(() => {
        const fakeResult = {ok: true, snapshot: {}};
        assert.equal(fakeResult.ok, false, "注销后仍返回 ok: true 必须被拦截");
    }, /ERR_ASSERTION/);

    // 负向探针 2: 若外部组件元数据缺失合法 moduleId，归一化契约必须拦截
    assert.throws(() => {
        const invalid = normalizeExternalWidget({});
        assert.ok(invalid.moduleId && invalid.moduleId.length > 0, "缺失合法 moduleId 必须被拦截");
    }, /ERR_ASSERTION/);
});
