// T-7349 版本号晋级与发布历史结转契约测试
// 门禁自查（docs/gate-audit-checklist.md）：
//   1. 验证 package.json 与 plugin.json 版本号精确对齐至 0.48.0；
//   2. 验证中英文 README 徽标、标题与链接精确反映 0.48.0；
//   3. 验证中英文 CHANGELOG 存在独立的 v0.48.0 章节并置于 v0.47.6 之前；
//   4. 验证 ROADMAP.md 基线版本精确对齐至 v0.48.0；
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

test("T-7349: package.json 与 plugin.json 版本号精确升级为 0.48.0", () => {
    assert.equal(pkg.version, "0.48.0", "package.json 版本号必须为 0.48.0");
    assert.equal(plugin.version, "0.48.0", "plugin.json 版本号必须为 0.48.0");
    assert.equal(pkg.version, plugin.version, "版本元数据必须 100% 对齐");
});

test("T-7349: 中英文 README 徽标、标题与说明精确对齐 0.48.0", () => {
    // 中文 README 对齐
    assert.match(readmeZh, /badge\/version-0\.48\.0-blue/, "中文 README 徽标必须为 0.48.0");
    assert.match(readmeZh, /最近正式版：v0\.48\.0（2026-10-20）/, "中文 README 最近正式版必须为 v0.48.0");
    assert.match(readmeZh, /## 本次更新（v0\.48\.0 · 2026-10-20）/, "中文 README 更新章节必须为 v0.48.0");
    assert.match(readmeZh, /当前版本为 `v0\.48\.0`/, "中文 README 底部版本声明必须为 v0.48.0");

    // 英文 README 对齐
    assert.match(readmeEn, /badge\/version-0\.48\.0-blue/, "英文 README 徽标必须为 0.48.0");
    assert.match(readmeEn, /Latest stable release: v0\.48\.0 \(2026-10-20\)/, "英文 README 最近正式版必须为 v0.48.0");
    assert.match(readmeEn, /## What's New In v0\.48\.0 \(2026-10-20\)/, "英文 README 更新章节必须为 v0.48.0");
    assert.match(readmeEn, /The current version is `v0\.48\.0`/, "英文 README 底部版本声明必须为 v0.48.0");
});

test("T-7349: 中英文 CHANGELOG 固化独立的 v0.48.0 章节并优先于 v0.47.6", () => {
    // 中文 CHANGELOG
    const zhPos48 = changelogZh.indexOf("### v0.48.0（2026-10-20）");
    const zhPos47 = changelogZh.indexOf("### v0.47.6（2026-10-19）");
    assert.ok(zhPos48 >= 0, "中文 CHANGELOG 必须包含 v0.48.0 发布章节");
    assert.ok(zhPos47 >= 0, "中文 CHANGELOG 必须包含历史 v0.47.6 章节");
    assert.ok(zhPos48 < zhPos47, "v0.48.0 章节必须排在 v0.47.6 之前");

    // 英文 CHANGELOG
    const enPos48 = changelogEn.indexOf("### v0.48.0 (2026-10-20)");
    const enPos47 = changelogEn.indexOf("### v0.47.6 (2026-10-19)");
    assert.ok(enPos48 >= 0, "英文 CHANGELOG 必须包含 v0.48.0 发布章节");
    assert.ok(enPos47 >= 0, "英文 CHANGELOG 必须包含历史 v0.47.6 章节");
    assert.ok(enPos48 < enPos47, "v0.48.0 章节必须排在 v0.47.6 之前");
});

test("T-7349: ROADMAP.md 基线版本精确结转为 v0.48.0", () => {
    assert.match(roadmap, /> 基线：`v0\.48\.0` 已就绪/);
    assert.match(roadmap, /最后更新：2026-10-20/);
});

test("T-7349 门禁负向验证：若版本号退化或发布章节倒序，断言必须精准红", () => {
    // 探针 1：模拟旧版本号比较必须失败
    assert.throws(() => {
        assert.equal(pkg.version, "0.47.6");
    }, assert.AssertionError);

    // 探针 2：模拟倒置的更新日志章节顺序必须失败
    assert.throws(() => {
        assert.ok(changelogZh.indexOf("### v0.47.6（2026-10-19）") < changelogZh.indexOf("### v0.48.0（2026-10-20）"));
    }, assert.AssertionError);
});
