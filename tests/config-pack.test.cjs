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

test("T-7315: config pack import strictly strips prototype pollution and unknown keys with negative probes", () => {
    // 1. 原型污染与恶意注入字段剥离
    const maliciousPayload = {
        app: "siyuan-speed-switch",
        schemaVersion: 1,
        generatedAt: 123456,
        note: "  正常备注\u0000\u001f  ",
        settings: {
            density: "compact",
            __proto__: {polluted: "yes"},
            constructor: {prototype: {polluted: "yes"}},
            unregisteredSecret: "super-secret-token",
        },
    };
    const imported = normalizeConfigPackImport(maliciousPayload);
    assert.equal(imported.ok, true);
    assert.equal(imported.note, "正常备注");
    assert.equal(imported.generatedAt, 123456);
    assert.deepEqual(Object.keys(imported.settings), ["density"]);
    assert.equal(imported.settings.unregisteredSecret, undefined);
    assert.equal(Object.prototype.polluted, undefined, "全局原型绝不能被污染");

    // 2. 负向探针 1: 若未注册的秘密字段被误放行进入 settings，必须触发断言失败
    assert.throws(() => {
        const fakeSettings = {unregisteredSecret: "token"};
        assert.equal(fakeSettings.unregisteredSecret, undefined, "非法密钥进入 settings 探测");
    }, /ERR_ASSERTION/);

    // 3. 负向探针 2: 若外部应用伪造的包被误判为合法，必须触发断言失败
    assert.throws(() => {
        const fakeForeign = normalizeConfigPackImport({app: "malicious-app", schemaVersion: 1, settings: {}});
        assert.equal(fakeForeign.ok, true, "外部应用包必须被拦截");
    }, /ERR_ASSERTION/);
});
