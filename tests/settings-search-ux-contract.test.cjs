// T-7002：设置搜索体验收口契约——combobox ARIA 完整化（expanded/controls/activedescendant）、
// 首焦点（桌面）、`/` 与 Ctrl/Cmd+K 直达（页内监听不抢宿主键）、显式清空按钮、
// 分组过滤 chips 与「路径结果」（面板 > 分组二级徽标）。
// 注意：readSourceFile 已剥注释，"把调用写进注释"无法骗过本契约。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {readSourceFile} = require('./source-scan.cjs');

const indexSource = readSourceFile('src/index.ts');
const model = readSourceFile('src/settings-search-model.js');

function loadLocale(locale) {
    return JSON.parse(fs.readFileSync(`src/i18n/${locale}.json`, 'utf8'));
}

test('combobox semantics: expanded/controls/activedescendant are maintained (T-7002)', () => {
    assert.match(indexSource, /searchInput\.setAttribute\("role", "combobox"\)/);
    assert.match(indexSource, /searchInput\.setAttribute\("aria-autocomplete", "list"\)/);
    assert.match(indexSource, /searchInput\.setAttribute\("aria-controls", "sw-settings-search-results"\)/,
        '输入框必须 aria-controls 指向 listbox');
    assert.match(indexSource, /searchResults\.id = "sw-settings-search-results"/, 'listbox 必须有稳定 id');
    // expanded 随查询开合；activedescendant 跟随键盘选择、清空时移除
    assert.match(indexSource, /searchInput\.setAttribute\("aria-expanded", query\.trim\(\) \? "true" : "false"\)/);
    assert.match(indexSource, /if \(activeEl\?\.id\) searchInput\.setAttribute\("aria-activedescendant", activeEl\.id\);\s*\n\s*else searchInput\.removeAttribute\("aria-activedescendant"\)/);
    assert.match(indexSource, /option\.id = `sw-settings-search-option-\$\{index\}`/, 'option 必须有稳定 id 供 activedescendant 引用');
    assert.match(indexSource, /searchInput\.removeAttribute\("aria-activedescendant"\);\s*\n\s*\};/, '清空视图必须移除 activedescendant');
});

test('explicit clear button resets view and returns focus (T-7002)', () => {
    assert.match(indexSource, /const searchClear = document\.createElement\("button"\);[\s\S]*?searchClear\.textContent = "×";/);
    assert.match(indexSource, /searchClear\.addEventListener\("click", \(\) => \{\s*\n\s*searchInput\.value = "";\s*\n\s*renderSettingsSearchResults\(\);\s*\n\s*searchInput\.focus\(\{preventScroll: true\}\);\s*\n\s*\}\);/,
        '清空必须同时收起结果并回焦输入框');
    assert.match(indexSource, /searchClear\.hidden = !query;/, '空查询时清空按钮必须隐藏');
});

test('slash and Ctrl+K jump to search inside the settings page only (T-7002)', () => {
    assert.match(indexSource, /root\.addEventListener\("keydown", \(event\) => \{[\s\S]*?const jump = event\.key === "\/" && !editable[\s\S]*?\(event\.ctrlKey \|\| event\.metaKey\) && \(event\.key === "k" \|\| event\.key === "K"\)/,
        '快捷键判定必须含 `/` 与 Ctrl/Cmd+K 两路');
    assert.match(indexSource, /\["INPUT", "TEXTAREA", "SELECT"\]\.includes\(target\.tagName\)/,
        '焦点已在可编辑控件内时不得接管（不干扰正常输入）');
    assert.match(indexSource, /searchInput\.focus\(\{preventScroll: true\}\);\s*\n\s*searchInput\.select\(\);/,
        '直达后选中原查询便于整体替换');
});

test('first focus lands on search on desktop, never on mobile (T-7002)', () => {
    assert.match(indexSource, /if \(!this\.isMobile\) \{\s*\n\s*this\.scheduleAnimationFrame\(\(\) => \{\s*\n\s*if \(root\.isConnected && searchInput\.isConnected\) searchInput\.focus\(\{preventScroll: true\}\);/,
        '桌面端首焦点进搜索框；移动端不自动聚焦（软键盘）');
});

test('group filter chips stay outside the listbox and reset on query change (T-7002)', () => {
    assert.match(indexSource, /searchChips\.setAttribute\("role", "group"\);/, 'chips 行必须是 group 语义（不得混入 listbox）');
    assert.match(indexSource, /const groups = collectEntryGroups\(results, 6\);/, 'chips 取自结果集去重且有界');
    assert.match(indexSource, /searchGroupFilter = "";\s*\n\s*searchSelected = results\.length > 0 \? 0 : -1;/, '查询变化必须重置分组过滤');
    assert.match(indexSource, /const visible = searchGroupFilter\s*\n\s*\? searchMatches\.filter\(\(entry\) => entry\.group === searchGroupFilter\)\s*\n\s*: searchMatches;/,
        '键盘导航只遍历过滤后的可视结果集');
    // 路径结果：选项携带二级分组徽标
    assert.match(indexSource, /sw-settings__search-option-group/, '结果选项必须渲染分组徽标');
});

test('model collects the nearest group title and matches against it (T-7002)', () => {
    assert.match(model, /const container = item\.closest\("\.sw-settings__group-card"\) \|\| item;/,
        '分组归属必须从组卡容器向前找组标题（组内兄弟遍历出不了卡边界）');
    assert.match(model, /sibling\.classList\.contains\("sw-settings__group-title"\)/);
    assert.match(model, /entry\.group \|\| ""\}`\.toLocaleLowerCase\(\)/, '分组路径必须并入匹配词');
});

test('search ux i18n keys exist in both locales (T-7002)', () => {
    for (const locale of ['zh-CN', 'en']) {
        const data = loadLocale(locale);
        for (const key of ['settingsSearchClear', 'settingsSearchFilter', 'settingsSearchFilterAll']) {
            assert.ok(typeof data[key] === 'string' && data[key].length > 0, `${locale} must carry ${key}`);
        }
    }
});
