const {test} = require('node:test');
const assert = require('node:assert/strict');
const {WIDGET_CATALOG} = require('../src/widget-catalog.js');
const home = require('../src/home-model.js');

test("widget catalog entries are unique, sized, and provider-tagged", () => {
    const ids = WIDGET_CATALOG.map((entry) => entry.moduleId);
    assert.equal(new Set(ids).size, ids.length, "catalog moduleIds must be unique");
    const validSizes = new Set(["xs", "small", "medium", "tall", "wide", "large", "full"]);
    WIDGET_CATALOG.forEach((entry) => {
        assert.ok(entry.providerPlugin.length > 0, "provider plugin required");
        assert.ok(entry.title.length > 0, "title required");
        assert.ok(entry.description.length > 0, "description required");
        assert.ok(entry.icon.startsWith("icon"), "icon should be a SiYuan icon id");
        entry.sizes.forEach((size) => assert.ok(validSizes.has(size), `unknown size ${size}`));
    });
});

test("widget catalog entries normalize as valid module definitions", () => {
    WIDGET_CATALOG.forEach((entry) => {
        const def = home.normalizeModuleDefinition({
            moduleId: entry.moduleId, title: entry.title, icon: entry.icon,
            category: "plugin", sizes: entry.sizes, description: entry.description,
        });
        assert.equal(def.moduleId, entry.moduleId);
        assert.ok(def.sizes.length > 0);
    });
});
