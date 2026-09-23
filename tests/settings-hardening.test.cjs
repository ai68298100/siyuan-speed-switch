// T-6313 设置模型加固契约：只补 settings-model.test.cjs 未覆盖的真实行为——
// 遗留 fullscreen 布尔迁移、显示三态枚举、排除 dock 的类型过滤、custom 模式的
// 非法数值兜底与 320px 下限语义。
const test = require('node:test');
const assert = require('node:assert/strict');
const {normalizeSettings, resolvePanelSize} = require('../src/settings-model.js');

const DEFAULTS = {panelScale: 100, dialogWidth: 800, dialogHeight: 600, columns: 3};

const normalize = (saved, extra = {}) => normalizeSettings(saved, {
    defaults: DEFAULTS,
    ranges: {dialogWidth: [400, 1600], columns: [1, 8], panelScale: [50, 150]},
    sortBy: ["mru", "title"],
    dockDisplay: ["list", "icon"],
    sidebarLayout: ["cards", "list"],
    ...extra,
});

test('legacy boolean fullscreen migrates into the fullscreen panel size mode', () => {
    assert.equal(normalize({fullscreen: true}).panelSizeMode, "fullscreen", "旧数据只带布尔时提升为模式");
    assert.equal(normalize({fullscreen: true}).fullscreen, true);
    assert.equal(normalize({fullscreen: false}).panelSizeMode, "adaptive");
    assert.equal(normalize({panelSizeMode: "custom", fullscreen: true}).panelSizeMode, "custom", "显式模式优先于遗留布尔");
    assert.equal(normalize({}).panelSizeMode, "adaptive");
});

test('quick action display accepts exactly the three-state enum', () => {
    const saved = {quickActionsDisplayDesktop: "icons", quickActionsDisplaySidebar: "hidden", quickActionsDisplayMobile: "nonsense"};
    const settings = normalize(saved);
    assert.equal(settings.quickActionsDisplayDesktop, "icons");
    assert.equal(settings.quickActionsDisplaySidebar, "hidden");
    assert.equal(settings.quickActionsDisplayMobile, "full", "非法值回退 defaults 缺省 full");
});

test('excludedDocks keeps strings only and never inherits defaults', () => {
    const settings = normalize({excludedDocks: ["graph", 42, null, "outline"]});
    assert.deepEqual(settings.excludedDocks, ["graph", "outline"]);
    assert.deepEqual(normalize({}).excludedDocks, []);
});

test('default clamp only absorbs nullish values - real ranges need the injected clamp', () => {
    // 默认 clamp 是 `value ?? fallback`：字符串 "abc" 非 nullish 会穿透保存，
    // resolvePanelSize 侧再由 Number(...)||0 兜底为 0。该行为钉住"为什么调用方
    // 必须注入真 clamp"——本测试就是它的文档。
    const settings = normalize({panelSizeMode: "custom", dialogWidth: "abc", dialogHeight: null});
    assert.equal(settings.dialogWidth, "abc");
    assert.equal(settings.dialogHeight, DEFAULTS.dialogHeight);
    const size = resolvePanelSize(settings, {width: 1920, height: 1080});
    assert.deepEqual(size, {width: 0, height: 600});
    const withRealClamp = normalize({panelSizeMode: "custom", dialogWidth: "abc"}, {
        clamp: (value, min, max, fallback) => {
            const num = Math.trunc(Number(value));
            return Number.isFinite(num) ? Math.min(max, Math.max(min, num)) : fallback;
        },
    });
    assert.equal(withRealClamp.dialogWidth, DEFAULTS.dialogWidth, "注入真 clamp 后非法值回退默认");
});

test('resolvePanelSize enforces the 320px floor only against the scaled value', () => {
    const scaled = resolvePanelSize({panelSizeMode: "adaptive", panelScale: 10}, {width: 2000, height: 1000, minWidth: 500, minHeight: 400});
    assert.deepEqual(scaled, {width: 500, height: 400}, "10% 缩放被调用方下限托住");
    const hugeViewport = resolvePanelSize({panelSizeMode: "adaptive", panelScale: 100}, {width: 8000, height: 3000});
    assert.deepEqual(hugeViewport, {width: 8000, height: 3000}, "100% 时不小于视口也不裁剪视口");
    const zeroViewport = resolvePanelSize({panelSizeMode: "adaptive", panelScale: 80}, {width: 0, height: 0});
    assert.ok(zeroViewport.width >= 320 && zeroViewport.height >= 320, "视口未知时仍保持可用下限");
});

test('custom mode rounds fractional persisted sizes', () => {
    const settings = normalize({panelSizeMode: "custom", dialogWidth: 812.6, dialogHeight: 599.4});
    const size = resolvePanelSize(settings, {width: 1920, height: 1080});
    assert.deepEqual(size, {width: 813, height: 599});
});

test('excluded docks survive without range validators (pure passthrough field)', () => {
    const settings = normalizeSettings({excludedDocks: ["a", "b"]}, {});
    assert.deepEqual(settings.excludedDocks, ["a", "b"]);
});

test('saved searches are bounded, sanitized and deduplicated (T-6827)', () => {
    const raw = [
        {id: "sw-1", name: "  项目路线图  ", query: " 路线图 "},
        {id: "sw-2", name: "工作区文档", query: "工作区", notebook: "20260924100000-notebook"},
        {id: "", name: "无 id", query: "x"},
        {id: "sw-4", name: "", query: "x"},
        {id: "sw-5", name: "空查询", query: "   "},
        {name: "缺 id", query: "x"},
        "junk",
        {id: "sw-8", name: "重复", query: "重复"},
        {id: "sw-8", name: "撞 id", query: "别的"},
    ];
    const saved = normalize({savedSearches: raw}).savedSearches;
    assert.equal(saved.length, 3, "畸形项丢弃、撞 id 去重");
    assert.deepEqual(saved[0], {id: "sw-1", name: "项目路线图", query: "路线图"});
    assert.deepEqual(saved[1], {id: "sw-2", name: "工作区文档", query: "工作区", notebook: "20260924100000-notebook"});
    assert.equal(saved[2].name, "重复");
    // 超长字段裁剪 + 同（名称+查询）去重
    const saved2 = normalize({savedSearches: [
        {id: "a", name: "n".repeat(60), query: "q".repeat(200)},
        {id: "b", name: "n".repeat(60), query: "q".repeat(200)},
    ]}).savedSearches;
    assert.equal(saved2.length, 1, "同（名称+查询）去重");
    assert.equal(saved2[0].name.length, 40);
    assert.equal(saved2[0].query.length, 120);
    // 容量上限 16
    const bulk = Array.from({length: 20}, (_, index) => ({id: `k${index}`, name: `n${index}`, query: `q${index}`}));
    assert.equal(normalize({savedSearches: bulk}).savedSearches.length, 16);
    // 非数组与缺省安全
    assert.deepEqual(normalize({savedSearches: "bad"}).savedSearches, []);
    assert.deepEqual(normalize({}).savedSearches, []);
});
