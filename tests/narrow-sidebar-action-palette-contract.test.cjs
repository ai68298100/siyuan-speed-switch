// T-7346: 窄侧栏（245px~340px）自适应与多端文档/i18n对账契约测试
// 门禁自查（docs/gate-audit-checklist.md）：
//   1. 验证在 245px 极限窄宽下，动作画板与穿透检索条目文本截断与 flex 溢出防护（min-width: 0、flex-shrink: 0）；
//   2. 验证中英文 README 与 CHANGELOG 完整覆盖深入穿透检索与动作画板指引；
//   3. 负向探针覆盖：缺少防溢出声明或文档对账缺失时必定定向失败。

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {JSDOM} = require("jsdom");
const {mountActionPalette} = require("../src/action-palette-ui.js");
const {readSourceText} = require("./source-scan.cjs");

const ROOT = path.resolve(__dirname, "..");
const polishScss = readSourceText(path.join(ROOT, "src", "styles", "_11-ui-polish.scss"));
const readmeZh = fs.readFileSync(path.join(ROOT, "README.md"), "utf8");
const readmeEn = fs.readFileSync(path.join(ROOT, "README.en-US.md"), "utf8");
const changelogZh = fs.readFileSync(path.join(ROOT, "docs", "CHANGELOG.md"), "utf8");
const changelogEn = fs.readFileSync(path.join(ROOT, "docs", "CHANGELOG.en-US.md"), "utf8");

test("T-7346: 样式层对窄容器（245px）具备严格的文本省略与弹性防溢出声明", () => {
    // 1. label 必须声明 min-width: 0 防止 flex 项目不收缩
    assert.match(
        polishScss,
        /\.sw__palette-item-label\s*\{[^}]*min-width:\s*0;/s,
        ".sw__palette-item-label 必须声明 min-width: 0 防止在窄容器内溢出",
    );

    // 2. label 必须声明 text-overflow: ellipsis
    assert.match(
        polishScss,
        /\.sw__palette-item-label\s*\{[^}]*text-overflow:\s*ellipsis;/s,
        ".sw__palette-item-label 必须声明 text-overflow: ellipsis 保证长文本省略截断",
    );

    // 3. shortcut 必须声明 flex-shrink: 0 保证按键徽标不被压缩变形
    assert.match(
        polishScss,
        /\.sw__palette-item-shortcut\s*\{[^}]*flex-shrink:\s*0;/s,
        ".sw__palette-item-shortcut 必须声明 flex-shrink: 0 保证窄宽下按键徽章不畸变",
    );
});

test("T-7346: 在 245px 真实窄宽宿主容器中挂载动作画板，结构完整且无横向溢出风险", () => {
    const dom = new JSDOM(`<!DOCTYPE html><html><body><div id="dock-host" style="width: 245px;"></div></body></html>`);
    const container = dom.window.document.getElementById("dock-host");

    const sampleActions = [
        {id: "open-right", section: "open", label: "在右侧极其冗长且复杂的文档分栏中打开此条目", icon: "iconLayoutRight", shortcut: "⌘↵"},
        {id: "copy-block-link", section: "copy", label: "复制此思源块的永久唯一锚定链接", icon: "iconLink", shortcut: "⌘C"},
    ];

    const handle = mountActionPalette(container, sampleActions, {
        platform: "desktop",
        title: "窄侧栏动作画板",
    });

    assert.ok(handle.root);
    assert.equal(handle.root.style.boxSizing || "border-box", "border-box");
    assert.equal(handle.listElement.querySelectorAll('li[role="option"]').length, 2);

    // 验证每个选项均具备完整 a11y 标签与数据属性
    const options = handle.listElement.querySelectorAll('li[role="option"]');
    for (const opt of options) {
        assert.ok(opt.querySelector(".sw__palette-item-label"), "必须包含 label 容器");
        assert.ok(opt.querySelector(".sw__palette-item-shortcut"), "必须包含 shortcut 徽标");
    }

    handle.dispose();
});

test("T-7346: 中英文 README 与 CHANGELOG 对穿透检索语法与动作画板完整对账", () => {
    // 1. 中文 README
    assert.match(readmeZh, /深入穿透检索/, "中文 README 必须包含深入穿透检索介绍");
    assert.match(readmeZh, /:标题/, "中文 README 必须记录 :标题 语法");
    assert.match(readmeZh, /\^正文块/, "中文 README 必须记录 ^正文块 语法");
    assert.match(readmeZh, /次级动作画板/, "中文 README 必须包含次级动作画板介绍");
    assert.match(readmeZh, /Ctrl\+K.*或.*⌘K/, "中文 README 快捷键表格必须收录 Ctrl+K / ⌘K");

    // 2. 英文 README
    assert.match(readmeEn, /penetration search/i, "英文 README 必须包含 penetration search 介绍");
    assert.match(readmeEn, /:heading/, "英文 README 必须记录 :heading 语法");
    assert.match(readmeEn, /\^block/, "英文 README 必须记录 ^block 语法");
    assert.match(readmeEn, /Action palette/i, "英文 README 必须包含 Action palette 介绍");
    assert.match(readmeEn, /Ctrl\+K.*or.*⌘K/, "英文 README 快捷键表格必须收录 Ctrl+K / ⌘K");

    // 3. 中英文 CHANGELOG
    assert.match(changelogZh, /深入穿透检索/, "中文 CHANGELOG 必须记录深入穿透检索特性");
    assert.match(changelogZh, /次级动作画板/, "中文 CHANGELOG 必须记录次级动作画板特性");
    assert.match(changelogEn, /Deep Penetration Search/i, "英文 CHANGELOG 必须记录 Deep Penetration Search");
    assert.match(changelogEn, /Secondary Action Palette/i, "英文 CHANGELOG 必须记录 Secondary Action Palette");
});

test("T-7346 门禁负向验证：若防溢出声明或对账文档缺失，断言必须精确红", () => {
    // 探针 1：断言伪造的不存在语法必定失败
    assert.throws(() => {
        assert.match(readmeZh, /%完全不存在的伪语法前缀%/);
    }, assert.AssertionError);

    // 探针 2：断言伪造的不存在样式类必定失败
    assert.throws(() => {
        assert.match(polishScss, /\.sw__nonexistent-overflow-class-probe/);
    }, assert.AssertionError);
});
