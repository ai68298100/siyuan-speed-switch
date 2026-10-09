// 第一面板回归合同：分组/排序/窗口变化必须维持搜索现场与浮层可达性。
// 负向注入验证见各测试末尾，避免源码扫描门禁出现恒真绿灯。
const test = require('node:test');
const assert = require('node:assert/strict');
const {readSourceFile} = require('./source-scan.cjs');

const source = readSourceFile('src/index.ts');
const toolbarStart = source.indexOf('private bindSwitcherToolbarActions(');
const sortMenuStart = source.indexOf('private bindSortTriggerMenu(');
const applySearchStart = source.indexOf('private applySearch(', sortMenuStart);
assert.ok(toolbarStart >= 0 && sortMenuStart > toolbarStart, '测试夹具必须找到第一面板工具栏方法');
const toolbar = source.slice(toolbarStart, sortMenuStart);

test('group changes replay the active search/filter scene after list redraw', () => {
    assert.match(toolbar, /const applyGroupChange = \(nextGroup: TabGroupMode\)/);
    assert.match(toolbar, /this\.renderList\(scrollElement, getAllTabs\(\), this\.getActiveTab\(\), listOpts, this\.getSettings\(\)\.sortBy, updatedMap\);/);
    assert.match(toolbar, /hasDocSearchFilter\.call\(this, scrollElement\)/,
        '分组变更必须重放有查询或筛选的搜索现场');
    const broken = toolbar.replace('if (searchInput && (searchInput.value.trim() !== "" || hasDocSearchFilter.call(this, scrollElement))) {', 'if (false) {');
    assert.doesNotMatch(broken, /hasDocSearchFilter\.call\(this, scrollElement\)/,
        '负向注入：移除现场重放后必须被门禁识别');
});

test('body-level sort menu repositions on viewport resize and still disposes listener', () => {
    assert.ok(applySearchStart > sortMenuStart, '测试夹具必须找到搜索方法边界');
    const menu = source.slice(sortMenuStart, applySearchStart);
    assert.match(menu, /resizeHandler = positionPanel;/);
    assert.match(menu, /window\.addEventListener\("resize", resizeHandler\);/);
    assert.match(menu, /window\.removeEventListener\("resize", resizeHandler\);/);
    const broken = menu.replace('window.addEventListener("resize", resizeHandler);', '');
    assert.doesNotMatch(broken, /window\.addEventListener\("resize", resizeHandler\);/,
        '负向注入：删除 resize 监听后必须被门禁识别');
});

test('favorite group dialogs keep readable titles and tear down malformed shells', () => {
    const groupDialog = source.slice(source.indexOf('private openGroupDialog('), source.indexOf('private openFavoriteGroupDialog('));
    const favoriteDialog = source.slice(source.indexOf('private openFavoriteGroupDialog('), source.indexOf('private jumpToFavorite('));
    assert.doesNotMatch(groupDialog, /title: `\$\{this\.i18n\.setGroup\} · \$\{this\.escapeAttr\(this\.titleOf\(tab\)\)\}`/,
        '文档标题在 Dialog 文本属性中不得显示 HTML 转义实体');
    assert.doesNotMatch(favoriteDialog, /title: `\$\{this\.i18n\.setGroup\} · \$\{this\.escapeAttr\(fav\.title\)\}`/,
        '收藏标题在 Dialog 文本属性中不得显示 HTML 转义实体');
    for (const [label, section, anchor] of [
        ['页签分组', groupDialog, 'const input = dialog.element.querySelector<HTMLInputElement>(".sw__group-input");'],
        ['收藏分组', favoriteDialog, 'const input = dialog.element.querySelector<HTMLInputElement>(".sw__group-input");'],
    ]) {
        assert.match(section, /if \(!input\) \{\s*dialog\.destroy\(\);\s*return;\s*\}/,
            `${label}缺少输入节点失败清理`);
        const injected = section.replace('dialog.destroy();', '// injected violation');
        assert.doesNotMatch(injected, /if \(!input\) \{\s*dialog\.destroy\(\);\s*return;\s*\}/,
            `删除${label}空壳销毁动作后门禁必须失败`);
        assert.ok(section.includes(anchor), `${label}测试夹具必须锚定真实输入节点`);
    }
});

test('switcher tears down a malformed host dialog before child assembly', () => {
    const showSwitcher = source.slice(source.indexOf('private showSwitcher('), source.indexOf('private createSwitcherDialog('));
    const pattern = /const dialog = this\.createSwitcherDialog\([\s\S]*?if \(!dialog\.element\.querySelector<HTMLElement>\('\[data-sw-surface="switcher"\]'\)\) \{\s*dialog\.destroy\(\);\s*return;\s*\}/;
    assert.match(showSwitcher, pattern, '切换器根节点缺失时必须在子模块装配前销毁空 Dialog');
    const matched = showSwitcher.match(pattern)?.[0];
    const injected = showSwitcher.replace(matched, matched.replace('dialog.destroy();', '// injected violation'));
    assert.doesNotMatch(injected, pattern, '删除切换器空壳销毁动作后门禁必须失败');
});
