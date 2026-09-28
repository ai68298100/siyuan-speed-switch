// T-6980 / T-6971 批次⑧：导航与历史组件照卡施工契约。
// 规格来源：docs/design/component-specs-08-navigation.html
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {readSourceText} = require('./source-scan.cjs');
const home = require('../src/home-model.js');
const kernel = require('../src/kernel-widget-model.js');
const documentWidgets = require('../src/document-widget-model.js');

const root = path.join(__dirname, '..');
const indexSource = readSourceText(path.join(root, 'src', 'index.ts'));
const kernelSource = readSourceText(path.join(root, 'src', 'kernel-widget-model.js'));
const homeStyleSource = readSourceText(path.join(root, 'src', 'styles', '_07-sidebar-panel-store.scss'));

const NAVIGATION_DEFAULTS = {
    'recent-documents': 'wide',
    'pinned-docs': 'medium',
    favorites: 'medium',
    tags: 'small',
    bookmarks: 'small',
    'document-sets': 'medium',
    'fixed-document': 'small',
    'current-document-outline': 'wide',
    'document-relations-summary': 'medium',
};

test('navigation components declare the batch-8 default size and plain material fallback', () => {
    for (const [moduleId, expected] of Object.entries(NAVIGATION_DEFAULTS)) {
        assert.equal(home.HOME_TILE_DEFAULT_SIZES[moduleId], expected, `${moduleId} 默认档必须与规格卡一致`);
        assert.equal(home.resolveHomeTileMaterial(moduleId), 'plain', `${moduleId} 未获显式彩色材质时必须回退 plain`);
        const definition = home.registerModules([]).find((item) => item.moduleId === moduleId);
        assert.ok(definition, `${moduleId} 目录条目存在`);
        assert.ok(definition.sizes.includes(expected), `${moduleId} 支持声明的默认档`);
    }
});

test('navigation list row caps are enforced by production projection models', () => {
    assert.equal(kernel.normalizeHostRecentDocsConfig({limit: 99}).limit, 8);
    assert.equal(kernel.normalizePinnedDocsConfig({limit: 99}).limit, 6);
    assert.equal(documentWidgets.normalizeFavoritesWidgetConfig({limit: 99}).limit, 8);
    assert.equal(documentWidgets.normalizeDocumentSetsWidgetConfig({limit: 99}).limit, 5);
    assert.equal(kernel.normalizeTagListConfig({limit: 99}).limit, 12);
    assert.equal(kernel.normalizeBookmarkListConfig({limit: 99}).limit, 6);
    assert.equal(kernel.normalizeOutlineWidgetConfig({limit: 99}).limit, 8);
    assert.equal(kernel.normalizeDocumentRelationsConfig({limit: 99}).limit, 6);
});

test('recent documents validate current metadata and retain unavailable history rows', () => {
    const registration = indexSource.slice(indexSource.indexOf('register("recent-documents"'), indexSource.indexOf('register("favorites"'));
    assert.match(registration, /\/api\/storage\/getRecentDocs/);
    assert.match(registration, /\/api\/query\/sql/);
    assert.match(registration, /SELECT id FROM blocks WHERE type='d'/);
    assert.match(registration, /homeRecentUnavailable/);
    assert.match(kernelSource, /availableIds instanceof Set/);
    assert.match(kernelSource, /已失效/);
});

test('batch-8 interaction contracts keep block bookmark targeting and fixed invalid placeholders', () => {
    assert.match(indexSource, /bookmark-block:\(\\d\{14\}-\[0-9a-z\]\+\):\(\\d\{14\}-\[0-9a-z\]\+\)/i);
    const bookmark = kernel.buildBookmarkListSnapshot([{
        name: '阅读', count: 1, blocks: [{id: '20260918120000-blockaa', rootID: '20260918120001-rootaa'}],
    }], {}, {}, Date.now());
    assert.equal(bookmark.items[0].value, 'bookmark-block:20260918120000-blockaa:20260918120001-rootaa');
    const fixed = documentWidgets.buildFixedDocumentSnapshot([], {docId: '20260918120001-rootaa'}, {
        unavailable: '已失效', reconfigure: '请重新指定',
    });
    assert.deepEqual(fixed.items, [{label: '已失效', value: '', disabled: true, secondary: '请重新指定'}]);
});

test('tags discard zero-count entries before rendering the tag cloud', () => {
    const snapshot = kernel.buildTagListSnapshot([
        {name: '空标签', count: 0},
        {name: '工作', count: 3},
    ], {}, {blocks: '个块'});
    assert.deepEqual(snapshot.items.map((item) => item.label), ['工作']);
});

test('navigation rows expose the shared icon, truncation, divider, and inert-state style contract', () => {
    assert.match(homeStyleSource, /data-module-id="recent-documents"/);
    assert.match(homeStyleSource, /grid-template-columns: 24px minmax\(0, 1fr\) auto/);
    assert.match(homeStyleSource, /\.sw__home-module-item \+ \.sw__home-module-item \{ border-top:/);
    assert.match(homeStyleSource, /\.sw__home-module-item-action:disabled \{ cursor: default; opacity:/);
    const renderedSource = readSourceText(path.join(root, 'src', 'home-view.js'));
    assert.match(renderedSource, /NAVIGATION_LIST_MODULES/);
    assert.match(renderedSource, /sw__home-module-item-icon/);
});
