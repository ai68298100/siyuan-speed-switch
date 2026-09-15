const test = require("node:test");
const assert = require("node:assert/strict");
const external = require("../src/external-widget-model.js");
const home = require("../src/home-model.js");

// T-6193：EXTERNAL_WIDGET_CATALOG 是纯契约/文档登记面（不进生产 UI），
// DEFAULT_MODULES 是商店尺寸选择的唯一权威。两处 sizes 必须逐条一致，
// 防止目录文档与真实可用的尺寸按钮漂移。
test("external catalog sizes match the authoritative DEFAULT_MODULES", () => {
    const definitions = new Map(home.registerModules([])
        .map((item) => [item.moduleId, item]));
    for (const entry of external.listExternalWidgetCatalog()) {
        const definition = definitions.get(entry.moduleId);
        if (!definition) continue; // 纯候选条目（尚未接入 DEFAULT_MODULES）跳过
        assert.deepEqual(entry.sizes, definition.sizes,
            `${entry.moduleId} sizes must match DEFAULT_MODULES`);
    }
});
