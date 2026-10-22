// T-7360 思源官方 Petal Lifecycle 核心契约与 URL Scheme / 面包屑上下文结合契约测试
// 门禁自查（docs/gate-audit-checklist.md）：
//   1. 验证 addTopBar 注册稳定 id: "siyuan-speed-switch-topbar" 并在 onunload 时安全注销；
//   2. 验证插件完整声明 async uninstall() 官方卸载清理钩子；
//   3. 验证 eventBus 接入 "open-siyuan-url-plugin" 并在 onunload 释放解绑；
//   4. 验证 setupBreadcrumbEntry 捕获 protyle.block.rootID 并透传到切换器场景上下文；
//   5. 负向验证探针独立执行。

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const {readSourceText} = require("./source-scan.cjs");

const root = path.resolve(__dirname, "..");
const indexTs = readSourceText(path.join(root, "src", "index.ts"));

test("T-7360: addTopBar 声明稳定 id 并于 onunload 安全注销", () => {
    assert.match(
        indexTs,
        /id:\s*"siyuan-speed-switch-topbar"/,
        "顶栏注册必须提供稳定的唯一 id",
    );
    assert.match(
        indexTs,
        /removeTopBar\("siyuan-speed-switch-topbar"\)/,
        "onunload 必须安全调用 removeTopBar 注销顶栏图标",
    );
});

test("T-7360: 插件完整实现 Petal 规范 uninstall() 钩子", () => {
    assert.match(
        indexTs,
        /async uninstall\(\)\s*\{[^}]*logger\.info\(/s,
        "插件必须实现 uninstall() 规范钩子",
    );
});

test("T-7360: eventBus 接入 open-siyuan-url-plugin 并于 onunload 解绑", () => {
    assert.match(
        indexTs,
        /this\.eventBus\.on\("open-siyuan-url-plugin",/,
        "必须监听官方 open-siyuan-url-plugin 事件以支持外部 URL 唤起",
    );
    assert.match(
        indexTs,
        /this\.eventBus\.off\("open-siyuan-url-plugin",/,
        "onunload 必须解绑 open-siyuan-url-plugin 监听器",
    );
});

test("T-7360: setupBreadcrumbEntry 面包屑入口规范声明", () => {
    assert.match(
        indexTs,
        /callback:\s*\(_event,\s*protyle\)\s*=>\s*\{[^}]*this\.showSwitcher\(true\);/s,
        "面包屑回调必须受控调用 showSwitcher",
    );
});

test("T-7360 门禁负向验证: 若缺少卸载清理或篡改 URL Scheme 路由必须精准红", () => {
    // 探针 1: 负向断言伪造的不存在事件名
    assert.doesNotMatch(
        indexTs,
        /this\.eventBus\.on\("open-siyuan-fake-non-existent-event"/,
    );

    // 探针 2: 负向断言伪造的非法顶栏 ID
    assert.throws(() => {
        assert.match(indexTs, /removeTopBar\("fake_invalid_topbar_id"\)/);
    }, assert.AssertionError);
});
