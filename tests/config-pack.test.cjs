// T-6824 可迁移配置包：构造白名单化 + 导入校验（原子应用的前置）。
const test = require("node:test");
const assert = require("node:assert/strict");
const {
    CONFIG_PACK_SCHEMA_VERSION,
    CONFIG_PACK_SETTINGS_KEYS,
    buildConfigPack,
    normalizeConfigPackImport,
} = require("../src/config-pack-model.js");

test("config pack: build whitelists settings keys and stamps version (T-6824)", () => {
    const pack = buildConfigPack(
        {density: "compact", skin: "fusion", secretToken: "should-not-travel", documentSets: {schemaVersion: 1, sets: []}},
        {now: 1000, note: "我的迁移包"},
    );
    assert.equal(pack.schemaVersion, 1);
    assert.equal(pack.app, "siyuan-speed-switch");
    assert.equal(pack.generatedAt, 1000);
    assert.equal(pack.note, "我的迁移包");
    assert.deepEqual(Object.keys(pack.settings).sort(), ["density", "skin"]);
    assert.equal(pack.settings.secretToken, undefined, "白名单外键不得进入包");
    assert.deepEqual(pack.documentSets, {schemaVersion: 1, sets: []});
});

test("config pack: import validation is atomic-gated and rejects foreign/unsupported", () => {
    const good = buildConfigPack({density: "compact"}, {now: 1});
    assert.equal(normalizeConfigPackImport(good).ok, true);
    // 非本插件包拒绝
    assert.equal(normalizeConfigPackImport({app: "other", schemaVersion: 1, settings: {}}).ok, false);
    // 版本高于当前拒绝
    assert.equal(normalizeConfigPackImport({app: "siyuan-speed-switch", schemaVersion: 99, settings: {}}).ok, false);
    // settings 缺失拒绝
    assert.equal(normalizeConfigPackImport({app: "siyuan-speed-switch", schemaVersion: 1}).ok, false);
    // documentSets 形态校验（可为 null，可为 {schemaVersion, sets}，不可为乱对象）
    const bad = normalizeConfigPackImport({app: "siyuan-speed-switch", schemaVersion: 1, settings: {}, documentSets: {sets: "x"}});
    assert.equal(bad.ok, false);
    // 白名单外键不进入导入结果
    const result = normalizeConfigPackImport({app: "siyuan-speed-switch", schemaVersion: 1, settings: {density: "compact", evil: 1}});
    assert.deepEqual(result.settings, {density: "compact"});
    // 白名单完整性：档位键都能被构造与校验
    for (const key of CONFIG_PACK_SETTINGS_KEYS) {
        const pack = buildConfigPack({[key]: undefined}, {now: 1});
        assert.equal(pack.settings[key], undefined);
    }
    assert.equal(CONFIG_PACK_SCHEMA_VERSION >= 1, true);
});
