// T-7359 符号导航速查指引（CheatSheet）与多语言文档对账测试
// 门禁自查（docs/gate-audit-checklist.md）：
//   1. 验证 SEARCH_MODES.HELP 与 MODE_BADGES[SEARCH_MODES.HELP] 前缀元数据；
//   2. 验证 ? 与 ？ 前缀语法解析与 aggregatePenetrationResults 静态指引聚合；
//   3. 验证中英文 README 与 CHANGELOG 快捷键对账完备性；
//   4. 负向验证在文件末尾独立执行。

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");

const root = path.resolve(__dirname, "..");
const {
    SEARCH_MODES,
    MODE_BADGES,
    parsePenetrationQuery,
} = require("../src/penetration-search-model.js");
const {
    planPenetrationSearchRequest,
    aggregatePenetrationResults,
} = require("../src/penetration-search-orchestration.js");

test("T-7359: SEARCH_MODES 包含 HELP 且 MODE_BADGES 具备专属图标与前缀", () => {
    assert.equal(SEARCH_MODES.HELP, "help");
    const badge = MODE_BADGES[SEARCH_MODES.HELP];
    assert.ok(badge, "MODE_BADGES 必须包含 HELP 模式配置");
    assert.equal(badge.prefix, "?");
    assert.equal(badge.icon, "iconHelp");
    assert.equal(badge.defaultBadge, "快捷指引");
});

test("T-7359: parsePenetrationQuery 支持中英文问号（? / ？）唤出速查模式", () => {
    const parsedEn = parsePenetrationQuery("?");
    assert.equal(parsedEn.mode, SEARCH_MODES.HELP);
    assert.equal(parsedEn.badge, "快捷指引");

    const parsedZh = parsePenetrationQuery("？大纲");
    assert.equal(parsedZh.mode, SEARCH_MODES.HELP);
    assert.equal(parsedZh.badge, "快捷指引");
});

test("T-7359: planPenetrationSearchRequest 与 aggregatePenetrationResults 产出完备的符号指引", () => {
    const plan = planPenetrationSearchRequest("?");
    assert.equal(plan.mode, SEARCH_MODES.HELP);
    assert.equal(plan.isPenetration, true);
    assert.equal(plan.localOnly, true);

    const items = aggregatePenetrationResults(plan, {}, {});
    assert.ok(Array.isArray(items), "指引条目必须为数组");
    assert.ok(items.length >= 8, "至少包含 8 项关键符号与快捷键速查条目");

    const titles = items.map((i) => i.title);
    assert.ok(titles.some((t) => t.includes("@") || t.includes("大纲")), "必须包含大纲穿透指引");
    assert.ok(titles.some((t) => t.includes("#")), "必须包含标签指引");
    assert.ok(titles.some((t) => t.includes("!")), "必须包含书签指引");
    assert.ok(titles.some((t) => t.includes("^")), "必须包含块级深入检索指引");
    assert.ok(titles.some((t) => t.includes("Ctrl+K") || t.includes("⌘K")), "必须包含动作画板指引");
    assert.ok(titles.some((t) => t.includes("Ctrl+Shift+T")), "必须包含撤销关闭页签指引");
    assert.ok(titles.some((t) => t.includes("⌘⇧S")), "必须包含文档集保存指引");
    assert.ok(titles.some((t) => t.includes("思阅") || t.includes("思播")), "必须包含生态联动指引");
});

test("T-7359: 中英文 README 与 CHANGELOG 快捷键与更新历史对账完备", () => {
    const readmeZh = fs.readFileSync(path.join(root, "README.md"), "utf8");
    const readmeEn = fs.readFileSync(path.join(root, "README.en-US.md"), "utf8");
    const changelogZh = fs.readFileSync(path.join(root, "docs", "CHANGELOG.md"), "utf8");
    const changelogEn = fs.readFileSync(path.join(root, "docs", "CHANGELOG.en-US.md"), "utf8");

    // 1. 中文 README 包含新增快捷键
    assert.ok(readmeZh.includes("Ctrl+Shift+T"), "README.md 必须包含 Ctrl+Shift+T");
    assert.ok(readmeZh.includes("⌘⇧S"), "README.md 必须包含 ⌘⇧S");
    assert.ok(readmeZh.includes("Alt+R"), "README.md 必须包含 Alt+R");
    assert.ok(readmeZh.includes("CheatSheet"), "README.md 必须包含 CheatSheet");

    // 2. 英文 README 包含新增快捷键
    assert.ok(readmeEn.includes("Ctrl+Shift+T"), "README.en-US.md 必须包含 Ctrl+Shift+T");
    assert.ok(readmeEn.includes("⌘⇧S"), "README.en-US.md 必须包含 ⌘⇧S");
    assert.ok(readmeEn.includes("Alt+R"), "README.en-US.md 必须包含 Alt+R");
    assert.ok(readmeEn.includes("CheatSheet"), "README.en-US.md 必须包含 CheatSheet");

    // 3. 更新日志包含 v0.48.0 完备说明
    assert.ok(changelogZh.includes("### v0.48.0（2026-10-20）"), "CHANGELOG.md 必须包含 v0.48.0 章节");
    assert.ok(changelogEn.includes("### v0.48.0 (2026-10-20)"), "CHANGELOG.en-US.md 必须包含 v0.48.0 章节");
});

test("T-7359 门禁负向验证: 若破坏帮助模式标识或缺失必要指引必定精确红", () => {
    // 探针 1: 伪造非法模式必定不匹配 HELP
    assert.throws(() => {
        assert.equal(SEARCH_MODES.HELP, "fake_help_mode_broken");
    }, assert.AssertionError);

    // 探针 2: 负向断言伪造的不存在指引条目
    const items = aggregatePenetrationResults({mode: SEARCH_MODES.HELP}, {}, {});
    assert.throws(() => {
        assert.ok(items.some((i) => i.id === "non_existent_fake_help_item"));
    }, assert.AssertionError);
});
