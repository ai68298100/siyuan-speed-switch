// T-6316 宿主动作加固契约：document-actions（移动/桌面打开路径与回退语义）
// 与 favorite-actions（收藏条目纯函数）中既有套件未覆盖的真实行为。
const test = require('node:test');
const assert = require('node:assert/strict');
const {isDocumentOpenSuccess, openDocumentOnMobile, openDocumentOnDesktop} = require('../src/document-actions.js');
const {removeFavoriteEntry, setFavoriteEntryGroup, migrateFavoriteEntry} = require('../src/favorite-actions.js');

// ---------- isDocumentOpenSuccess ----------
test('open success covers the three legacy truthy shapes only', () => {
    assert.equal(isDocumentOpenSuccess(undefined), true);
    assert.equal(isDocumentOpenSuccess(true), true);
    assert.equal(isDocumentOpenSuccess("success"), true);
    for (const bad of [false, "ok", "Success", 0, null]) {
        assert.equal(isDocumentOpenSuccess(bad), false, `${String(bad)} 不算成功`);
    }
});

// ---------- openDocumentOnMobile ----------
test('mobile open prefers MobileTabs and reports non-success results', async () => {
    const openTab = async () => { throw new Error("must not fall through"); };
    const warnings = [];
    const ok = await openDocumentOnMobile({rootId: "20260917-root", tabs: {open: () => "success"}, openTab});
    assert.equal(ok, true);
    const partial = await openDocumentOnMobile({rootId: "20260917-root", tabs: {open: () => false}, openTab, logger: {warn: (m) => warnings.push(m)}});
    assert.equal(partial, false, "非既定成功值必须按失败处理");
    assert.equal(warnings.length, 1);
});

test('mobile open falls back to plugin openTab only without MobileTabs', async () => {
    const calls = [];
    const ok = await openDocumentOnMobile({rootId: "20260917-root", openTab: async (options) => { calls.push(options); }});
    assert.equal(ok, true);
    assert.deepEqual(calls, [{app: undefined, doc: {id: "20260917-root"}}]);
    const failing = await openDocumentOnMobile({rootId: "20260917-root", openTab: async () => { throw new Error("boom"); }, onFailure: (error) => calls.push(`failure:${error.message}`)});
    assert.equal(failing, false);
    assert.deepEqual(calls.slice(-1), ["failure:boom"]);
    assert.equal(await openDocumentOnMobile({rootId: "", openTab: async () => {}}), false, "空 rootId 不发起调用");
});

// ---------- openDocumentOnDesktop ----------
test('desktop open on a search hit scrolls to the hit then falls back to root', async () => {
    const calls = [];
    const openTab = async (options) => { calls.push(options); };
    assert.equal(await openDocumentOnDesktop({rootId: "20260917-root", hitId: "20260917-hit1", openTab}), true);
    assert.equal(calls[0].doc.action.includes("cb-get-scroll"), true);
    assert.equal(calls[0].doc.id, "20260917-hit1");
    assert.equal(await openDocumentOnDesktop({rootId: "20260917-root", openTab}), true, "无命中时直接开根文档");
    assert.equal(Object.keys(calls[1].doc).includes("action"), false, "根文档不带滚动定位参数");
});

test('desktop hit failure falls back to the root document once', async () => {
    const calls = [];
    const openTab = async (options) => {
        calls.push(options.doc.id);
        if (options.doc.id === "20260917-hit1") throw new Error("stale hit");
    };
    const warnings = [];
    const ok = await openDocumentOnDesktop({rootId: "20260917-root", hitId: "20260917-hit1", openTab, logger: {warn: (m) => warnings.push(m)}});
    assert.equal(ok, true);
    assert.deepEqual(calls, ["20260917-hit1", "20260917-root"]);
    assert.equal(warnings.length, 1);
    const doubleFail = await openDocumentOnDesktop({rootId: "20260917-root", openTab: async () => { throw new Error("dead"); }});
    assert.equal(doubleFail, false);
});

test('hitId identical to rootId skips the scroll action entirely', async () => {
    const calls = [];
    await openDocumentOnDesktop({rootId: "20260917-root", hitId: "20260917-root", openTab: async (options) => { calls.push(options); }});
    assert.equal(calls.length, 1);
    assert.equal(calls[0].doc.id, "20260917-root");
    assert.equal(calls[0].doc.action, undefined);
});

// ---------- favorite actions ----------
const favorite = (key, group = "") => ({key, group});

test('removeFavoriteEntry reports whether anything changed', () => {
    const result = removeFavoriteEntry([favorite("a"), favorite("b")], "a");
    assert.equal(result.changed, true);
    assert.deepEqual(result.items.map((entry) => entry.key), ["b"]);
    assert.equal(removeFavoriteEntry([favorite("a")], "zzz").changed, false);
    assert.equal(removeFavoriteEntry("not-a-list", "a").items.length, 0);
});

test('setFavoriteEntryGroup trims the group and never mutates entries', () => {
    const original = favorite("a", " 旧 ");
    const originalCopy = {...original};
    const result = setFavoriteEntryGroup([original], "a", " 新组 ");
    assert.equal(result.changed, true);
    assert.equal(result.items[0].group, "新组");
    assert.deepEqual(original, originalCopy, "原条目必须保持不可变");
    const same = setFavoriteEntryGroup([favorite("a", "已有")], "a", "已有");
    assert.equal(same.changed, false);
    assert.equal(same.items[0], favorite("a", "已有") && same.items[0], "未变更时保持原引用");
});

test('migrateFavoriteEntry rekeys to root ids and resolves duplicates by dropping the legacy row', () => {
    const migrated = migrateFavoriteEntry([favorite("legacy-key")], "legacy-key", "20260917-root");
    assert.equal(migrated.migrated, true);
    assert.equal(migrated.duplicate, false);
    assert.deepEqual(migrated.items.map((entry) => entry.key), ["20260917-root"]);

    const withExisting = migrateFavoriteEntry([favorite("legacy-key"), favorite("20260917-root")], "legacy-key", "20260917-root");
    assert.equal(withExisting.duplicate, true);
    assert.equal(withExisting.items.length, 1, "目标已存在时删除遗留行避免双份");

    const noOp = migrateFavoriteEntry([favorite("k")], "k", "k");
    assert.equal(noOp.migrated, false, "新旧 key 相同不是迁移");
    assert.equal(migrateFavoriteEntry([favorite("k")], "k", "").migrated, false, "空目标 rootId 不迁移");
});
