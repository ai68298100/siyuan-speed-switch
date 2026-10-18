"use strict";

const {test} = require("node:test");
const assert = require("node:assert/strict");
const {
    RAIKIRI_BRIDGE_PROTOCOL,
    RAIKIRI_BRIDGE_NAME,
    RAIKIRI_CAPABILITIES,
    GLOBAL_BRIDGE_ALIASES,
    mountRaikiriBridge,
    dispatchRaikiriNavigatedEvent,
} = require("../src/api/external-bridge.js");

test("小驴雷切对外服务桥 · 协议规范与能力声明 (Epoch 6)", () => {
    assert.equal(RAIKIRI_BRIDGE_PROTOCOL, 1, "小驴雷切对外桥协议版本必须为 1");
    assert.equal(RAIKIRI_BRIDGE_NAME, "siyuan-speed-switch", "对外桥标识名对齐插件名称");
    assert.ok(Array.isArray(RAIKIRI_CAPABILITIES), "能力声明必须为数组");
    const requiredCapabilities = [
        "whenReady",
        "openSwitcher",
        "openWorkbench",
        "openStudio",
        "getNavigationContext",
        "getWorkspaceStats",
        "searchDocuments",
    ];
    for (const cap of requiredCapabilities) {
        assert.ok(RAIKIRI_CAPABILITIES.includes(cap), `能力声明必须包含 ${cap}`);
    }
});

test("小驴雷切对外服务桥 · 多别名挂载与旧实例融合 (Epoch 6)", () => {
    const mockWindow = {};
    const originalWindow = global.window;
    global.window = mockWindow;

    try {
        const legacyTarget = {
            whenReady: () => true,
            openSwitcher: () => "legacy-called",
        };
        mockWindow.siyuanSpeedSwitch = legacyTarget;

        let switcherCalled = false;
        let workbenchCalled = false;
        let studioCalled = false;

        const handlers = {
            openSwitcher: (focusSearch) => { switcherCalled = focusSearch; },
            openWorkbench: (_ctx) => { workbenchCalled = true; },
            openStudio: (_ctx) => { studioCalled = true; },
            getNavigationContext: () => ({
                device: "desktop",
                activeDocument: { id: "20261019-doc1", title: "测试文档" },
                openTabs: [{ id: "tab-1", title: "测试文档", source: "tabs" }],
                closedTabs: [],
                documentSets: [{ name: "核心工作区", count: 1 }],
                availableSurfaces: ["switcher", "workbench", "studio"],
                syncing: false,
            }),
            getWorkspaceStats: () => ({
                openTabCount: 1,
                closedTabCount: 0,
                documentSetCount: 1,
                availableSurfaces: ["switcher", "workbench", "studio"],
                isMobile: false,
            }),
            searchDocuments: async (args) => {
                if (!args.query) return { error: "query is required" };
                return { docs: [{ id: "doc-1", title: "文档1" }] };
            },
        };

        const dispose = mountRaikiriBridge(handlers, legacyTarget);

        for (const alias of GLOBAL_BRIDGE_ALIASES) {
            assert.ok(mockWindow[alias], `全局别名 ${alias} 必须已挂载`);
            assert.equal(mockWindow[alias].protocol, 1);
            assert.equal(mockWindow[alias].protocolName, "siyuan-speed-switch");
            assert.equal(mockWindow[alias].whenReady(), true);
        }

        // 测试 openSwitcher
        const swRes = mockWindow.xiaolvSpeedSwitch.openSwitcher(false);
        assert.deepEqual(swRes, { ok: true, data: true });
        assert.equal(switcherCalled, false);

        // 测试 openWorkbench
        const wbRes = mockWindow.siyuanSpeedSwitch.openWorkbench({ entry: "test" });
        assert.deepEqual(wbRes, { ok: true, data: true });
        assert.equal(workbenchCalled, true);

        // 测试 openStudio
        const stRes = mockWindow.xiaolvRaikiri.openStudio();
        assert.deepEqual(stRes, { ok: true, data: true });
        assert.equal(studioCalled, true);

        // 测试 getNavigationContext
        const navRes = mockWindow.lvRaikiri.getNavigationContext();
        assert.equal(navRes.ok, true);
        assert.equal(navRes.data.device, "desktop");
        assert.equal(navRes.data.activeDocument.id, "20261019-doc1");
        assert.equal(navRes.data.openTabs.length, 1);

        // 测试 getWorkspaceStats
        const statsRes = mockWindow.siyuanSpeedSwitch.getWorkspaceStats();
        assert.equal(statsRes.ok, true);
        assert.equal(statsRes.data.openTabCount, 1);
        assert.equal(statsRes.data.isMobile, false);

        // 卸载与清理测试
        dispose();
        for (const alias of GLOBAL_BRIDGE_ALIASES) {
            assert.equal(mockWindow[alias], undefined, `卸载后别名 ${alias} 必须被清除`);
        }
    } finally {
        global.window = originalWindow;
    }
});

test("小驴雷切对外服务桥 · 搜索接口与错误防护 (Epoch 6)", async () => {
    const mockWindow = {};
    const originalWindow = global.window;
    global.window = mockWindow;

    try {
        const handlers = {
            openSwitcher: () => {},
            openWorkbench: () => {},
            openStudio: () => {},
            getNavigationContext: () => ({ device: "desktop" }),
            getWorkspaceStats: () => ({ openTabCount: 0 }),
            searchDocuments: async (args) => {
                if (args.query === "error-trigger") {
                    return { error: "invalid search filter" };
                }
                if (args.query === "throw-trigger") {
                    throw new Error("fatal search crash");
                }
                return { docs: [{ id: "matched-doc" }] };
            },
        };

        const dispose = mountRaikiriBridge(handlers);
        const bridge = mockWindow.siyuanSpeedSwitch;

        // 成功搜索
        const normalRes = await bridge.searchDocuments({ query: "keyword" });
        assert.equal(normalRes.ok, true);
        assert.deepEqual(normalRes.data, { docs: [{ id: "matched-doc" }] });

        // 业务校验失败
        const failRes = await bridge.searchDocuments({ query: "error-trigger" });
        assert.equal(failRes.ok, false);
        assert.equal(failRes.code, "SEARCH_FAILED");
        assert.equal(failRes.message, "invalid search filter");

        // 异常捕获兜底
        const crashRes = await bridge.searchDocuments({ query: "throw-trigger" });
        assert.equal(crashRes.ok, false);
        assert.equal(crashRes.code, "SEARCH_EXCEPTION");
        assert.ok(crashRes.message.includes("fatal search crash"));

        dispose();
    } finally {
        global.window = originalWindow;
    }
});

test("小驴雷切对外服务桥 · 跨插件 DOM 事件广播与幂等键 (Epoch 6)", () => {
    const events = [];
    const mockWindow = {
        dispatchEvent: (evt) => {
            events.push(evt);
        },
    };
    const originalWindow = global.window;
    const originalCustomEvent = global.CustomEvent;

    global.window = mockWindow;
    global.CustomEvent = class CustomEvent {
        constructor(type, init) {
            this.type = type;
            this.detail = init?.detail;
        }
    };

    try {
        const fixedTs = 1760889600000;
        dispatchRaikiriNavigatedEvent({
            surface: "workbench",
            action: "open",
            entry: "quick-action",
            ts: fixedTs,
        });

        assert.equal(events.length, 1, "必须广播 1 个 CustomEvent");
        const evt = events[0];
        assert.equal(evt.type, "lv-raikiri:navigated");
        assert.equal(evt.detail.plugin, "siyuan-speed-switch");
        assert.equal(evt.detail.v, 1);
        assert.equal(evt.detail.surface, "workbench");
        assert.equal(evt.detail.action, "open");
        assert.equal(evt.detail.entry, "quick-action");
        assert.equal(evt.detail.idempotencyKey, `workbench:open:${fixedTs}`);
        assert.equal(evt.detail.occurredAt, new Date(fixedTs).toISOString());
    } finally {
        global.window = originalWindow;
        global.CustomEvent = originalCustomEvent;
    }
});
