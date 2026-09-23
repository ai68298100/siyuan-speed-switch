// T-6819 provider 协议：第三方提供方元数据（版本/动作描述）的归一化与注册表
// 往返测试；协议自描述 describeProviderProtocol 供 SDK 文档与诊断复用。
const test = require("node:test");
const assert = require("node:assert/strict");
const {
    normalizeProvider,
    describeProviderProtocol,
    QUICK_ACTION_PROVIDER_PROTOCOL_VERSION,
    createQuickActionRegistry,
} = require("../src/quick-actions.js");

test("provider protocol: metadata normalizes with version and action description (T-6819)", () => {
    const provider = normalizeProvider({
        id: "com.example.capture",
        name: "示例提供方",
        version: "1.2",
        targets: ["desktop"],
        actions: [{value: "cap.text", label: "捕获文本", description: "把选中文本写入示例目标"}, {value: "", label: "无效项"}],
    });
    assert.equal(provider.id, "com.example.capture");
    assert.equal(provider.version, "1.2", "协议版本有界保留");
    assert.equal(provider.actions.length, 1, "无 value 的动作丢弃");
    assert.equal(provider.actions[0].description, "把选中文本写入示例目标");
    assert.equal(provider.actions[0].kind, "adapter", "未知提供方默认 kind=adapter（保持可见）");
});

test("provider protocol: registry roundtrip preserves new fields and unregister restores", () => {
    const registry = createQuickActionRegistry();
    const reg = registry.register({
        id: "com.example.capture",
        name: "示例",
        version: "2.0",
        targets: ["desktop", "mobile"],
        actions: [{value: "cap", label: "捕获", description: "示例描述"}],
    }, () => ({ok: true}));
    assert.equal(reg.registered, true);
    assert.equal(reg.provider.version, "2.0", "版本号经注册表往返保留");
    assert.equal(reg.provider.actions[0].description, "示例描述", "动作描述经注册表往返保留");
    registry.unregister("com.example.capture");
    assert.deepEqual(registry.snapshot(), [], "卸载恢复注册前状态");
    // 协议自描述
    const spec = describeProviderProtocol();
    assert.equal(spec.protocolVersion, QUICK_ACTION_PROVIDER_PROTOCOL_VERSION);
    assert.ok(Array.isArray(spec.guarantees) && spec.guarantees.length >= 3, "协议必须声明展示/执行分离等保证");
    assert.doesNotThrow(() => JSON.stringify(spec));
});
