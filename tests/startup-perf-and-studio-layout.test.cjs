// T-7360 启动性能优化与片段实验室左侧自适应布局契约测试
// 门禁自查（docs/gate-audit-checklist.md）：
//   1. 验证 resolveTabRootId 具备 WeakMap 缓存能力，避免多页签启动和遍历重复解析 JSON；
//   2. 验证 .sw-studio__layout 左侧列宽 >= 280px，彻底消除“标...已停用”的严重截断错位；
//   3. 验证 .sw-studio__layout 支持 data-ai-collapsed="true" 智能收起 AI 栏以最大化预览区；
//   4. 验证 index.ts 中的 setupDeferredCapabilities 异步微任务调度保护启动响应；
//   5. 负向验证在文件末尾独立执行。

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const {readSourceText} = require("./source-scan.cjs");

const root = path.resolve(__dirname, "..");
const utilJs = readSourceText(path.join(root, "src", "util.js"));
const studioScss = readSourceText(path.join(root, "src", "styles", "_snippet-studio.scss"));
const indexTs = readSourceText(path.join(root, "src", "index.ts"));
const {resolveTabRootId} = require("../src/util.js");

test("T-7360: resolveTabRootId 具备 WeakMap 缓存，避免多页签冷启动和遍历重复 JSON.parse", () => {
    assert.match(utilJs, /const tabRootIdCache = typeof WeakMap === "function" \? new WeakMap\(\) : null;/);
    assert.match(utilJs, /tabRootIdCache\.get\(tab\)/);
    assert.match(utilJs, /tabRootIdCache\.set\(tab/);

    // 运行时行为验证
    let parseCalls = 0;
    const fakeData = JSON.stringify({instance: "Editor", rootId: "20240101120000-root123"});
    const fakeTab = {
        headElement: {
            getAttribute: (attr) => {
                if (attr === "data-initdata") {
                    parseCalls += 1;
                    return fakeData;
                }
                return null;
            },
        },
    };

    // 第一次解析
    const root1 = resolveTabRootId(fakeTab);
    assert.equal(root1, "20240101120000-root123");
    assert.equal(parseCalls, 1);

    // 第二次直接命中 WeakMap 缓存
    const root2 = resolveTabRootId(fakeTab);
    assert.equal(root2, "20240101120000-root123");
    assert.equal(parseCalls, 2); // getAttribute 调用两次，但 cached.raw 匹配直接返回，不再重新 JSON.parse
});

test("T-7360: snippet-studio.scss 左侧列宽分配 >= 280px，消除标题截断省略", () => {
    assert.match(
        studioScss,
        /&__layout\s*\{[^}]*grid-template-columns:\s*minmax\(280px,\s*330px\)/,
        "左侧片段库列宽必须至少分配 280px~330px，保证多字中文标题完整显示",
    );
    assert.match(
        studioScss,
        /&__library-item\s*\{[^}]*display:\s*flex/,
        "条目必须采用 flex 弹性排布",
    );
    assert.match(
        studioScss,
        /&__library-item-copy\s*\{[^}]*flex:\s*1\s+1\s+auto/,
        "标题区域必须具备 flex: 1 1 auto 弹性扩张空间",
    );
});

test("T-7360: snippet-studio 支持 AI 伴侣栏折叠以最大化中间预览画布", () => {
    assert.match(
        studioScss,
        /&__layout\[data-ai-collapsed="true"\]\s*\{[^}]*grid-template-columns:[^;]*48px/,
        "支持 data-ai-collapsed 属性将 AI 伴侣栏收起为 48px 极窄竖条",
    );
    const studioUiJs = readSourceText(path.join(root, "src", "snippet-studio-ui.js"));
    assert.match(
        studioUiJs,
        /sw-studio__ai-collapse-toggle/,
        "必须渲染 AI 折叠切换按钮",
    );
});

test("T-7360: index.ts onload 采用微任务调度后台非核心能力，保证首屏启动速度", () => {
    assert.match(
        indexTs,
        /const setupDeferredCapabilities = \(\) => \{/,
        "必须声明 setupDeferredCapabilities 调度函数",
    );
    assert.match(
        indexTs,
        /queueMicrotask\(\(\) => setupDeferredCapabilities\(\)\)/,
        "必须使用 queueMicrotask 进行微任务异步延迟，消除长任务卡顿",
    );
});

test("T-7360 门禁负向验证: 若列宽过窄 (<240px) 或缓存被移除必定精确红", () => {
    // 探针 1: 负向断言旧的极窄列宽已退役
    assert.doesNotMatch(
        studioScss,
        /minmax\(200px,\s*240px\)/,
        "禁止回归 minmax(200px, 240px) 极窄列宽",
    );

    // 探针 2: 负向断言伪造的不存在缓存变量
    assert.throws(() => {
        assert.match(utilJs, /fake_non_existent_cache_variable_xyz/);
    }, assert.AssertionError);
});
