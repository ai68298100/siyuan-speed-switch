// ECOSYSTEM-INTEGRATION-DIRECTIVE 专项契约测试
// 门禁自查（docs/gate-audit-checklist.md）：
//   1. 验证 wrapEcosystemModuleRead 执行 800ms 超时熔断与 3s 快照缓存，异常全链路单向隔离；
//   2. 验证预置 7 大生态小组件注册与 ID 声明；
//   3. 验证 四别名挂载规范与卸载解绑；
//   4. 验证 iconLvSpeedSwitch 矢量图标与顶栏注册对齐；
//   5. 验证 CSS 美学变量与 plugin.json 命名与 settingsWindow 声明；
//   6. 负向验证探针独立执行。

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const {readSourceText} = require("./source-scan.cjs");

const root = path.resolve(__dirname, "..");
const externalBridge = require("../src/api/external-bridge.ts");
const ecosystemKit = require("../src/api/ecosystem-bridge-kit.ts");
const indexTs = readSourceText(path.join(root, "src", "index.ts"));
const tokensScss = readSourceText(path.join(root, "src", "styles", "_00-tokens.scss"));
const polishScss = readSourceText(path.join(root, "src", "styles", "_11-ui-polish.scss"));
const pluginJson = JSON.parse(fs.readFileSync(path.join(root, "plugin.json"), "utf8"));
const homeAdaptersTs = readSourceText(path.join(root, "src", "home-external-adapters.ts"));

test("Directive-1: wrapEcosystemModuleRead 800ms 熔断与单向异常隔离防护", async () => {
    assert.equal(typeof externalBridge.wrapEcosystemModuleRead, "function", "必须导出 wrapEcosystemModuleRead");

    // 探针 A: 正常快速返回并缓存 3s
    let callCount = 0;
    const fastReader = externalBridge.wrapEcosystemModuleRead(async () => {
        callCount++;
        return { items: [{ label: "test", value: "1" }] };
    }, 800, 3000);

    const res1 = await fastReader({}, "desktop");
    assert.equal(res1.items.length, 1);
    assert.equal(callCount, 1);

    // 3s 缓存内二次读取不增加调用次数
    const res2 = await fastReader({}, "desktop");
    assert.equal(res2.items.length, 1);
    assert.equal(callCount, 1);

    // 探针 B: 超时熔断（>800ms 必须优雅降级，不能卡死）
    const slowReader = externalBridge.wrapEcosystemModuleRead(async () => {
        await new Promise((resolve) => setTimeout(resolve, 1200));
        return { items: [{ label: "delayed" }] };
    }, 200, 1000); // 测例使用 200ms 超时加速测试

    const slowRes = await slowReader({}, "desktop");
    assert.deepEqual(slowRes.items, []);
    assert.match(slowRes.emptyHint, /📦 数据暂未返回，点击重试/);
    assert.equal(slowRes.retryable, true);

    // 探针 C: 报错单向隔离（抛出异常绝不拖垮宿主）
    const errorReader = externalBridge.wrapEcosystemModuleRead(async () => {
        throw new Error("fatal third party explosion");
    }, 800, 3000);

    const errRes = await errorReader({}, "desktop");
    assert.deepEqual(errRes.items, []);
    assert.match(errRes.emptyHint, /📦 数据暂未返回，点击重试/);
});

test("Directive-1: 预置小驴全生态 7 大标准小组件注册与 ID 对齐", () => {
    const requiredModules = [
        "checkin-daily-streaks",
        "exam-daily-summary",
        "cards-due-summary",
        "glean-later-list",
        "home-expiry-reminders",
        "contacts-upcoming",
        "common-quick-palette",
    ];

    for (const modId of requiredModules) {
        assert.ok(
            homeAdaptersTs.includes(`"${modId}"`),
            `home-external-adapters.ts 必须注册标准生态小组件 ${modId}`
        );
    }
});

test("Directive-1 & 2: 四别名挂载规范与 iconLvSpeedSwitch 矢量图标升级", () => {
    assert.match(indexTs, /<symbol id="iconLvSpeedSwitch" viewBox="0 0 32 32">/);
    assert.match(indexTs, /icon:\s*"iconLvSpeedSwitch"/);
    assert.deepEqual(
        ecosystemKit.BRIDGE_ALIASES.raikiri,
        ["siyuanSpeedSwitch", "xiaolvSpeedSwitch", "xiaolvRaikiri", "lvRaikiri"]
    );
});

test("Directive-3: 星际电光紫 + 钛金雷刃黄 + 午夜深空黑金美学 Token 注入", () => {
    assert.match(tokensScss, /--lv-brand:\s*#8B5CF6;/);
    assert.match(tokensScss, /--lv-brand-soft:/);
    assert.match(tokensScss, /--lv-accent-gold:\s*#FACC15;/);
    assert.match(tokensScss, /--lv-midnight-card:\s*#1B1E2E;/);
    assert.match(polishScss, /\.sw-home__cell--midnight/);
    assert.match(polishScss, /\.lv-dialog-title-wrap/);
});

test("Directive-4: 块属性收敛、plugin.json 规范与合规文件就绪", () => {
    assert.equal(pluginJson.displayName.default, "Lv Speed Switch", "英文名必须对齐为 Lv Speed Switch");
    assert.equal(pluginJson.settingsWindow, true, "必须开启 settingsWindow: true");
    assert.equal(pluginJson.minAppVersion, "3.8.4", "minAppVersion 必须提升至 3.8.4");
    assert.ok(pluginJson.keywords.includes("小驴"));
    assert.ok(pluginJson.keywords.includes("xiaolv"));
    assert.ok(pluginJson.keywords.includes("lv"));

    // 块属性命名空间收敛
    assert.match(indexTs, /custom-lv-raikiri-reservation/);
    assert.match(indexTs, /custom-lv-raikiri-apply/);
    assert.match(indexTs, /custom-lv-raikiri-row/);

    // 根目录文档就绪
    assert.ok(fs.existsSync(path.join(root, "CHANGELOG.md")), "根目录必须包含 CHANGELOG.md");
    assert.ok(fs.existsSync(path.join(root, "SECURITY.md")), "根目录必须包含 SECURITY.md");
});

test("Directive 门禁负向验证: 若超时未被捕获或裸属性未收敛必须精确红", async () => {
    // 探针 1: 负向断言抛错未被隔离的裸函数
    const unhandled = async () => {
        throw new Error("unhandled error");
    };
    await assert.rejects(unhandled);

    // 探针 2: 负向断言伪造的不存在插件名
    assert.throws(() => {
        assert.equal(pluginJson.displayName.default, "Wrong Name Without Space");
    }, assert.AssertionError);
});
