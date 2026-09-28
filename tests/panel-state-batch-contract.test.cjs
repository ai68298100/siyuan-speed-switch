// 面板状态批契约（T-7009 + T-7011；T-7008 审计销号见账本）。
// - T-7009：第一面板 renderList 重绘保持现场——滚动复位 + 焦点卡片按 tabId 找回 +
//   默认首卡焦点条件化（本表面内已有焦点时不得抢走）；
// - T-7011：工作台健康详情单项重试行级 busy——在途登记 + 双击防护 + 行 aria-busy，
//   settle 后重绘让行落回真实分组（= 单项结果）。
// 注意：readSourceFile 已剥注释，锚点全部钉代码形态；"把调用写进注释"无法骗过本契约。
const test = require('node:test');
const assert = require('node:assert/strict');
const {readSourceFile} = require('./source-scan.cjs');

const indexSource = readSourceFile('src/index.ts');
const panelSource = readSourceFile('src/second-panel-ui.ts');

test('renderList captures scroll and focus scene before clearing (T-7009)', () => {
    assert.match(indexSource, /cancelDocPreview\(scrollElement\);[\s\S]{0,160}?const scenePrevScrollTop = scrollElement\.scrollTop;/,
        '必须在清空列表前捕获滚动现场');
    assert.match(indexSource, /const sceneFocusTabId = sceneActive\?\.closest<HTMLElement>\("\.sw__card\[data-tab-id\]"\)\?\.dataset\.tabId \|\| "";/,
        '焦点卡片必须按 tabId 捕获');
    assert.match(indexSource, /const sceneFocusInSurface = !!\(document\.activeElement instanceof HTMLElement/,
        '必须捕获「焦点是否已在本表面内」供默认焦点条件化');
    // 恢复：滚动钳制 + 焦点卡片同 tabId 找回（找不到诚实放弃）
    assert.match(indexSource, /const restoreListScene = \(\) => \{[\s\S]{0,240}?scrollElement\.scrollTop = Math\.min\(scenePrevScrollTop, Math\.max\(0, scrollElement\.scrollHeight - scrollElement\.clientHeight\)\);/);
    assert.match(indexSource, /\.find\(\(card\) => card\.dataset\.tabId === sceneFocusTabId\);[\s\S]{0,60}restored\?\.focus\(\{preventScroll: true\}\);/);
    // 两个恢复点：空态分支 + 渲染尾部（updateDigitBadges 之后）
    assert.match(indexSource, /scrollElement\.appendChild\(this\.buildEmptyState\(\)\);\s*\n\s*restoreListScene\(\);\s*\n\s*return;/);
    assert.match(indexSource, /this\.updateDigitBadges\(scrollElement\);\s*\n\s*restoreListScene\(\);\s*\n\s*\}/);
});

test('default first-card focus is conditional on an empty surface focus (T-7009)', () => {
    assert.match(indexSource, /if \(!sceneFocusInSurface\) \{\s*\n\s*this\.focusCard\(all\[focusState\.defaultFocusIndex\]\?\.card, true\);\s*\n\s*\}/,
        '默认首卡焦点必须以「本表面内无焦点」为条件（异步重绘不得抢走搜索框/卡片焦点）');
});

test('health detail per-row retry tracks in-flight state and guards double clicks (T-7011)', () => {
    assert.match(panelSource, /const inFlightRetries = new Set<string>\(\);/, '在途登记集合必须存在');
    assert.match(panelSource, /if \(inFlightRetries\.has\(row\.instanceId\)\) return;/, '双击防护：在途不得重复触发');
    assert.match(panelSource, /inFlightRetries\.add\(row\.instanceId\);\s*\n\s*retryButton\.disabled = true;\s*\n\s*retryButton\.textContent = this\.i18n\.homeRefreshing;/,
        '在途行按钮禁用并显示刷新中');
    assert.match(panelSource, /line\.setAttribute\("aria-busy", "true"\);/, '在途行必须 aria-busy（读屏可感知）');
    assert.match(panelSource, /inFlightRetries\.delete\(row\.instanceId\);\s*\n\s*renderHealthList\(\);/,
        'settle 后必须移除在途登记并重绘（行落回真实分组）');
    // 「刷新列表」等重绘通道同样呈现在途行（重绘时的 busy 还原）
    assert.match(panelSource, /if \(inFlightRetries\.has\(row\.instanceId\)\) \{\s*\n\s*retryButton\.disabled = true;/);
});

test('external rebuild and undo paths stay intact alongside the scene work (regression guard)', () => {
    // T-7003 钩子与 T-7009 现场保持共存：设置页重建不依赖 renderList，互不覆盖
    assert.match(indexSource, /this\.settingsSceneReloader = rebuildActivePanelPreservingScene;/);
    assert.match(indexSource, /document\.dispatchEvent\(new Event\("sw-settings-updated"\)\);/);
});
