// T-7349/T-7365 版本号晋级与发布历史结转契约测试
// 门禁自查（docs/gate-audit-checklist.md）：
//   1. 验证 package.json 与 plugin.json 版本号精确对齐至 0.48.7；
//   2. 验证中英文 README 徽标、标题与链接精确反映 0.48.7；
//   3. 验证中英文 CHANGELOG 存在独立的 v0.48.7 章节并置于 v0.48.6 之前；
//   4. 验证 ROADMAP.md 基线版本精确对齐至 v0.48.7；
//   5. 负向探针覆盖：版本退化或文档缺少正式发布章节必定被安全拦截。

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
const plugin = JSON.parse(fs.readFileSync(path.join(ROOT, "plugin.json"), "utf8"));
const readmeZh = fs.readFileSync(path.join(ROOT, "README.md"), "utf8");
const readmeEn = fs.readFileSync(path.join(ROOT, "README.en-US.md"), "utf8");
const changelogZh = fs.readFileSync(path.join(ROOT, "docs", "CHANGELOG.md"), "utf8");
const changelogEn = fs.readFileSync(path.join(ROOT, "docs", "CHANGELOG.en-US.md"), "utf8");
const roadmap = fs.readFileSync(path.join(ROOT, "ROADMAP.md"), "utf8");

test("T-7365: package.json 与 plugin.json 版本号精确升级为 0.48.7", () => {
    assert.equal(pkg.version, "0.48.7", "package.json 版本号必须为 0.48.7");
    assert.equal(plugin.version, "0.48.7", "plugin.json 版本号必须为 0.48.7");
    assert.equal(pkg.version, plugin.version, "版本元数据必须 100% 对齐");
});

test("T-7365: 中英文 README 徽标、标题与说明精确对齐 0.48.7", () => {
    // 中文 README 对齐
    assert.match(readmeZh, /badge\/version-0\.48\.7-blue/, "中文 README 徽标必须为 0.48.7");
    assert.match(readmeZh, /最近正式版：v0\.48\.7（2026-10-23）/, "中文 README 最近正式版必须为 v0.48.7");
    assert.match(readmeZh, /## 本次更新（v0\.48\.7 · 2026-10-23）/, "中文 README 更新章节必须为 v0.48.7");
    assert.match(readmeZh, /当前版本为 `v0\.48\.7`/, "中文 README 底部版本声明必须为 v0.48.7");

    // 英文 README 对齐
    assert.match(readmeEn, /badge\/version-0\.48\.7-blue/, "英文 README 徽标必须为 0.48.7");
    assert.match(readmeEn, /Latest stable release: v0\.48\.7 \(2026-10-23\)/, "英文 README 最近正式版必须为 v0.48.7");
    assert.match(readmeEn, /## What's New In v0\.48\.7 \(2026-10-23\)/, "英文 README 更新章节必须为 v0.48.7");
    assert.match(readmeEn, /The current version is `v0\.48\.7`/, "英文 README 底部版本声明必须为 v0.48.7");
});

test("T-7365: 中英文 CHANGELOG 固化独立的 v0.48.7 章节并优先于 v0.48.6", () => {
    // 中文 CHANGELOG
    const zhPos487 = changelogZh.indexOf("### v0.48.7（2026-10-23）");
    const zhPos486 = changelogZh.indexOf("### v0.48.6（2026-10-23）");
    assert.ok(zhPos487 >= 0, "中文 CHANGELOG 必须包含 v0.48.7 发布章节");
    assert.ok(zhPos486 >= 0, "中文 CHANGELOG 必须包含历史 v0.48.6 章节");
    assert.ok(zhPos487 < zhPos486, "v0.48.7 章节必须排在 v0.48.6 之前");

    // 英文 CHANGELOG
    const enPos487 = changelogEn.indexOf("### v0.48.7 (2026-10-23)");
    const enPos486 = changelogEn.indexOf("### v0.48.6 (2026-10-23)");
    assert.ok(enPos487 >= 0, "英文 CHANGELOG 必须包含 v0.48.7 发布章节");
    assert.ok(enPos486 >= 0, "英文 CHANGELOG 必须包含历史 v0.48.6 章节");
    assert.ok(enPos487 < enPos486, "v0.48.7 章节必须排在 v0.48.6 之前");
});

test("T-7365: ROADMAP.md 基线版本精确结转为 v0.48.7", () => {
    assert.match(roadmap, /> 基线：`v0\.48\.7` 已就绪/);
    assert.match(roadmap, /最后更新：2026-10-23/);
});

test("T-7365 门禁负向验证：若版本号退化或发布章节倒序，断言必须精准红", () => {
    // 探针 1：模拟旧版本号比较必须失败
    assert.throws(() => {
        assert.equal(pkg.version, "0.48.6");
    }, assert.AssertionError);

    // 探针 2：模拟倒置的更新日志章节顺序必须失败
    assert.throws(() => {
        assert.ok(changelogZh.indexOf("### v0.48.6（2026-10-23）") < changelogZh.indexOf("### v0.48.7（2026-10-23）"));
    }, assert.AssertionError);
});
