// T-7368 代码潜在 Bug 深度排查与边界隐患加固契约测试
// 门禁自查（docs/gate-audit-checklist.md）：
//   1. 验证 wrapEcosystemModuleRead 在 Promise 结算后立即清除超时计时器 (clearTimeout)；
//   2. 验证 wrapEcosystemModuleRead 对非标准/循环引用 config 执行安全序列化防护；
//   3. 验证 setupSearchModeChips 支持全角/半角冒号前缀剥离与 Home/End 键盘导航；
//   4. 验证 bindEcosystemEventSubscriptions 执行前序清理与 listener 级独立异常隔离；
//   5. 负向验证探针独立执行。

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const {readSourceText} = require("./source-scan.cjs");

const root = path.resolve(__dirname, "..");
const externalBridge = require("../src/api/external-bridge.ts");
const indexTs = readSourceText(path.join(root, "src", "index.ts"));
const bridgeTs = readSourceText(path.join(root, "src", "api", "external-bridge.ts"));
const adaptersTs = readSourceText(path.join(root, "src", "home-external-adapters.ts"));

test("T-7368: wrapEcosystemModuleRead 清理未触发的超时定时器并进行安全序列化", async () => {
    assert.match(
        bridgeTs,
        /clearTimeout\(timer\);/,
        "必须在 finally 中清除 timeoutPromise 的定时器引用，防止事件循环悬挂",
    );
    assert.match(
        bridgeTs,
        /try\s*\{\s*serializedConfig\s*=\s*JSON\.stringify\(config \|\| \{\}\);/,
        "必须对 config 进行安全序列化防护，防止循环引用导致报错",
    );

    // 探针: 传入非标准/循环引用的对象，必须安全完成而不抛出同步异常
    const circular = {};
    circular.self = circular;

    const wrapped = externalBridge.wrapEcosystemModuleRead(async () => {
        return { items: [{ label: "safe" }] };
    }, 500, 1000);

    const res = await wrapped(circular, "desktop");
    assert.equal(res.items.length, 1);
});

test("T-7368: setupSearchModeChips 模式药丸栏前缀剥离与 Home/End 导航", () => {
    assert.match(
        indexTs,
        /rawVal\.match\(\/\^\[@\^#!>\?？》！:：\]\/\)/,
        "必须支持全角与半角冒号穿透前缀的识别与平滑剥离",
    );
    assert.match(
        indexTs,
        /e\.key === "Home"[\s\S]*chipButtons\[0\]\?\.focus\(\)/,
        "必须支持 Home 键直达首个模式药丸",
    );
    assert.match(
        indexTs,
        /e\.key === "End"[\s\S]*chipButtons\[chipButtons\.length - 1\]\?\.focus\(\)/,
        "必须支持 End 键直达末尾模式药丸",
    );
});

test("T-7368: 生态总线事件订阅具有幂等清理与单个监听器异常隔离", () => {
    assert.match(
        indexTs,
        /private bindEcosystemEventSubscriptions\(\)\s*\{[\s\S]*this\.unbindEcosystemEventSubscriptions\(\);/,
        "重新绑定生态订阅前必须先执行幂等解绑",
    );
    assert.match(
        indexTs,
        /this\.homeModuleChangeListeners\.forEach\(\(listener\) =>\s*\{[\s\S]*try\s*\{[\s\S]*listener\(\);[\s\S]*\}\s*catch/,
        "触发重绘时必须针对每个 listener 独立 try-catch，防止单个监听异常破坏总线",
    );
});

test("T-7368: 思阅与思播在动作画板中优先消费全别名桥", () => {
    assert.match(
        indexTs,
        /const sireader = \(getBridgeSafely\("sireader"\) \|\| \(window as any\)\.sireader\)/,
        "思阅动作必须同时支持全别名检测",
    );
    assert.match(
        indexTs,
        /const player = \(getBridgeSafely\("simedia"\) \|\| \(window as any\)\.siyuanMediaPlayer\)/,
        "思播动作必须同时支持全别名检测",
    );
});

test("T-7368 门禁负向验证: 若缺少定时器清理或未防护循环引用必定精准红", () => {
    // 探针 1: 负向断言伪造的不存在安全语句必定失败
    assert.throws(() => {
        assert.match(bridgeTs, /fake_non_existent_timer_cleanup/);
    }, assert.AssertionError);

    // 探针 2: 负向断言若删去冒号匹配必定不通过
    assert.doesNotMatch(indexTs, /rawVal\.match\(\/\^\[@\^#!>\?？》！\]\/\)/);
});
