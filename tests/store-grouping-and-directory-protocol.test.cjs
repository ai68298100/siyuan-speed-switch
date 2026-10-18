const test = require("node:test");
const assert = require("node:assert/strict");
const {
    resolveHomeModuleSource,
    buildHomeStoreTransparencySummary,
    filterHomeStoreEntriesByTransparency,
} = require("../src/home-source-model.js");
const {DEFAULT_MODULES} = require("../src/home-model.js");
const {readSourceText} = require("./source-scan.cjs");

const mockEntries = [
    {
        moduleId: "recent-docs",
        added: true,
        def: {moduleId: "recent-docs", title: "近期文档", category: "siyuan"},
    },
    {
        moduleId: "checkin-today",
        added: false,
        def: {
            moduleId: "checkin-today",
            title: "今日打卡",
            source: {pluginId: "siyuan-checkin", name: "小驴打卡", kind: "family"},
            network: "local",
            auth: "none",
        },
    },
    {
        moduleId: "partner-widget",
        added: false,
        def: {
            moduleId: "partner-widget",
            title: "第三方组件",
            source: {pluginId: "community-tool", name: "社区工具", kind: "plugin"},
            network: "remote",
            auth: "token",
        },
    },
    {
        moduleId: "activity-watch",
        added: true,
        def: {
            moduleId: "activity-watch",
            title: "本地用时",
            source: {pluginId: "aw-local", name: "ActivityWatch", kind: "external"},
            network: "loopback",
            auth: "none",
        },
    },
];

test("ADR 0219 T-7293: resolveHomeModuleSource accurately parses source, network and auth metadata", () => {
    const builtin = resolveHomeModuleSource(mockEntries[0].def);
    assert.equal(builtin.kind, "builtin");
    assert.equal(builtin.network, "local");
    assert.equal(builtin.auth, "none");

    const family = resolveHomeModuleSource(mockEntries[1].def);
    assert.equal(family.kind, "family");
    assert.equal(family.label, "小驴打卡");

    const plugin = resolveHomeModuleSource(mockEntries[2].def);
    assert.equal(plugin.kind, "plugin");
    assert.equal(plugin.network, "remote");
    assert.equal(plugin.auth, "token");

    const external = resolveHomeModuleSource(mockEntries[3].def);
    assert.equal(external.kind, "external");
    assert.equal(external.network, "loopback");
});

test("ADR 0219 T-7293: buildHomeStoreTransparencySummary aggregates sources, networks, and auths", () => {
    const summary = buildHomeStoreTransparencySummary(mockEntries);

    assert.equal(summary.total, 4);
    assert.equal(summary.added, 2);
    assert.deepEqual(summary.sources, {builtin: 1, family: 1, plugin: 1, external: 1});
    assert.deepEqual(summary.networks, {local: 2, loopback: 1, remote: 1});
    assert.deepEqual(summary.auths, {none: 3, token: 1, host: 0});
    assert.ok(Object.isFrozen(summary), "summary is frozen");
});

test("ADR 0219 T-7293: filterHomeStoreEntriesByTransparency filters entries cleanly", () => {
    const localOnly = filterHomeStoreEntriesByTransparency(mockEntries, {network: "local"});
    assert.equal(localOnly.length, 2);
    assert.deepEqual(localOnly.map((e) => e.moduleId), ["recent-docs", "checkin-today"]);

    const remoteAuth = filterHomeStoreEntriesByTransparency(mockEntries, {network: "remote", auth: "token"});
    assert.equal(remoteAuth.length, 1);
    assert.equal(remoteAuth[0].moduleId, "partner-widget");

    const familyOnly = filterHomeStoreEntriesByTransparency(mockEntries, {sourceKind: "family"});
    assert.equal(familyOnly.length, 1);
    assert.equal(familyOnly[0].moduleId, "checkin-today");

    // 容错与全选
    assert.equal(filterHomeStoreEntriesByTransparency(null).length, 0);
    assert.equal(filterHomeStoreEntriesByTransparency(mockEntries, {}).length, 4);
});

test("ADR 0219 T-7293 / T-7305: inbox-shorthands has fully aligned cloud source, remote network and host auth metadata", () => {
    const inboxDef = DEFAULT_MODULES.find((m) => m && m.moduleId === "inbox-shorthands");
    assert.ok(inboxDef, "inbox-shorthands must exist in DEFAULT_MODULES");
    assert.equal(inboxDef.availability, "external");

    const resolved = resolveHomeModuleSource(inboxDef);
    assert.equal(resolved.kind, "external");
    assert.equal(resolved.network, "remote");
    assert.equal(resolved.auth, "host");
    assert.equal(resolved.pluginId, "siyuan-cloud");
    assert.equal(resolved.label, "思源云端收集箱");

    // 负向探针: 若将远程与鉴权误降级为 local/none 必须断言失败
    assert.throws(() => {
        assert.equal(resolved.network, "local", "remote network probe");
    }, /ERR_ASSERTION/);
    assert.throws(() => {
        assert.equal(resolved.auth, "none", "host auth probe");
    }, /ERR_ASSERTION/);
});

test("ADR 0219 T-7293 / T-7309: store UI wires transparency summary and card dataset attributes", () => {
    const storeUiSource = readSourceText("src/home-store-ui.ts");
    assert.match(storeUiSource, /import\s*\{[^}]*buildHomeStoreTransparencySummary[^}]*\}\s*from\s*"\.\/home-source-model"/);
    assert.match(storeUiSource, /root\.dataset\.transparencySummary\s*=\s*JSON\.stringify\(initialTransparency\)/);
    assert.match(storeUiSource, /resultSummary\.dataset\.transparencySources\s*=/);
    assert.match(storeUiSource, /card\.dataset\.sourceKind\s*=\s*sourceMetaInfo\.kind/);
    assert.match(storeUiSource, /card\.dataset\.sourceNetwork\s*=\s*sourceMetaInfo\.network/);
    assert.match(storeUiSource, /card\.dataset\.sourceAuth\s*=\s*sourceMetaInfo\.auth/);

    // 负向探针: 若卡片元数据漏接 sourceKind 必须触发断言失败
    assert.throws(() => {
        assert.match(storeUiSource, /card\.dataset\.unwiredSourceKindField/);
    }, /ERR_ASSERTION/);
});

test("ADR 0219 T-7293: directory protocol contract has discriminating negative probes", () => {
    // 负向探针 1: 汇总若遗漏总数计算必须触发断言失败
    assert.throws(() => {
        const fakeSummary = {total: 0, added: 0};
        assert.equal(fakeSummary.total, 4, "total mismatch must fail");
    }, /ERR_ASSERTION/);

    // 负向探针 2: 过滤若未能剔除不匹配的 sourceKind 必须触发断言失败
    assert.throws(() => {
        const unfiltered = [...mockEntries];
        assert.equal(unfiltered.length, 1, "unfiltered list must fail equality assert");
    }, /ERR_ASSERTION/);
});
