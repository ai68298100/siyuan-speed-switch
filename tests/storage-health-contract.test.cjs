// T-7004：存储页健康化契约——15 个持久化 key 分组双语标签、用量进度条（占比
// 进 aria）、schema 版本戳三态健康（D-401 降级证据如实展示）、缓存管理说明与
// 只清可重建缓存的清空入口（用户语义数据不在范围）。
// 注意：readSourceFile 已剥注释，"把调用写进注释"无法骗过本契约。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {readSourceFile} = require('./source-scan.cjs');
const {declaresIn} = require('./css-block-scan.cjs');

const sections = readSourceFile('src/settings-sections.ts');
const indexSource = readSourceFile('src/index.ts');
const css = readSourceFile('src/index.scss');
const base = {topLevel: true};

// 全部 18 个持久化 key（字面量 → constants 常量名，settings-sections 以常量登记）
const PERSISTENT_KEY_LITERALS = [
    ['sw_mru', 'MRU_KEY'], ['sw_open_history', 'HISTORY_KEY'], ['sw_closed_history', 'CLOSED_HISTORY_KEY'],
    ['sw_pinned', 'PINNED_KEY'], ['sw_favorites', 'FAV_KEY'], ['sw_fav_groups', 'FAV_GROUPS_KEY'],
    ['sw_fav_collapsed', 'FAV_COLLAPSED_KEY'], ['sw_home_state', 'HOME_STATE_KEY'], ['sw_thumb_cache', 'THUMB_CACHE_KEY'],
    ['sw_related_swr', 'RELATED_SWR_KEY'], ['sw_settings', 'SETTINGS_KEY'], ['sw_quick_actions', 'QUICK_ACTIONS_KEY'],
    ['sw_quick_actions_defaults', 'QUICK_ACTIONS_DEFAULTS_KEY'], ['sw_document_sets', 'DOCUMENT_SETS_KEY'],
    ['sw_rss_read', 'RSS_READ_KEY'], ['sw_schema_version', 'SCHEMA_VERSION_KEY'],
    ['sw_snippet_recycle', 'SNIPPET_RECYCLE_KEY'], ['sw_snippet_groups', 'SNIPPET_GROUPS_KEY'],
];
const KEY_LABEL_KEYS = {
    sw_mru: 'storageKeyMru', sw_open_history: 'storageKeyOpenHistory', sw_closed_history: 'storageKeyClosedHistory',
    sw_pinned: 'storageKeyPinned', sw_favorites: 'storageKeyFavorites', sw_fav_groups: 'storageKeyFavGroups',
    sw_fav_collapsed: 'storageKeyFavCollapsed', sw_home_state: 'storageKeyHomeState', sw_thumb_cache: 'storageKeyThumbCache',
    sw_related_swr: 'storageKeyRelatedSwr', sw_settings: 'storageKeySettings', sw_quick_actions: 'storageKeyQuickActions',
    sw_quick_actions_defaults: 'storageKeyQuickActionsDefaults', sw_document_sets: 'storageKeyDocumentSets',
    sw_rss_read: 'storageKeyRssRead', sw_schema_version: 'storageKeySchemaVersion',
    sw_snippet_recycle: 'storageKeySnippetRecycle', sw_snippet_groups: 'storageKeySnippetGroups',
};

test('storage usage table registers every persistent key in bilingual groups (T-7004)', () => {
    for (const [literal, constantName] of PERSISTENT_KEY_LITERALS) {
        assert.ok(sections.includes(`key: ${constantName},`) || sections.includes(`key: ${constantName}\n`),
            `${literal} (${constantName}) 必须登记进 STORAGE_KEY_GROUPS`);
    }
    for (const locale of ['zh-CN', 'en']) {
        const data = JSON.parse(fs.readFileSync(`src/i18n/${locale}.json`, 'utf8'));
        for (const labelKey of Object.values(KEY_LABEL_KEYS)) {
            assert.ok(typeof data[labelKey] === 'string' && data[labelKey].length > 0, `${locale} must carry ${labelKey}`);
        }
        for (const groupKey of ['storageGroupWorkspace', 'storageGroupFavorites', 'storageGroupPanels', 'storageGroupConfig', 'storageGroupSystem', 'storageGroupOther']) {
            assert.ok(typeof data[groupKey] === 'string' && data[groupKey].length > 0, `${locale} must carry ${groupKey}`);
        }
    }
    // 标签必须走 i18n 静态映射（动态方括号访问被门禁禁止；原先硬编码中文在英文界面是缺口）
    assert.match(sections, /const storageLabels: Record<string, string> = \{\s*\n\s*storageGroupWorkspace: this\.i18n\.storageGroupWorkspace,/);
    assert.doesNotMatch(sections, /label: "最近使用页签"/, '旧硬编码中文标签必须移除');
    assert.doesNotMatch(sections, /this\.i18n\[item\.labelKey\]/, '不得动态索引 i18n');
    assert.doesNotMatch(sections, /this\.i18n\[group\.labelKey\]/, '不得动态索引 i18n');
});

test('usage rows carry a bounded bar with share in the accessible name (T-7004)', () => {
    assert.match(sections, /sw-settings__usage-bar/);
    assert.match(sections, /fill\.style\.width = `\$\{Math\.max\(2, Math\.min\(100, Math\.round\(bytes \/ summary\.total \* 100\)\)\)\}%`;/,
        '条宽必须按占合计百分比钳制（2-100）');
    assert.match(sections, /storageUsageShare\.replace\("\{x\}", String\(percent\)\)/,
        '占比必须进 aria 文本（颜色之外必有文字）');
    assert.match(sections, /sw-settings__storage-group/, '分组标题必须渲染');
    // 未登记 key 诚实兜底（不静默丢弃）
    assert.match(sections, /const unknown = summary\.rows\.filter\(\(row\) => !knownKeys\.has\(row\.key\)\);/);
    assert.ok(declaresIn(css, '.sw-settings .sw-settings__usage-bar', /height: 4px/, base), '用量条样式必须存在');
    assert.ok(declaresIn(css, '.sw-settings .sw-settings__storage-group', /text-transform: uppercase/, base));
});

test('schema health shows stored/current/downgrade three states read-only (T-7004)', () => {
    assert.match(indexSource, /getStorageSchemaHealth\(\): \{stored: number \| null; current: number; downgradeFrom: number \| null\}/,
        '宿主必须暴露 schema 健康读取');
    assert.match(indexSource, /downgradeFrom: this\.storageSchemaDowngradeFrom,/, '降级证据（D-401）必须透出');
    assert.match(sections, /sw-settings__storage-schema/);
    assert.match(sections, /storageSchemaOk/);
    assert.match(sections, /storageSchemaMissing/);
    assert.match(sections, /storageSchemaNewer/);
    // 三态以 data-state 表达且样式分色（newer 用警示色 + 文字并存）
    assert.match(sections, /schemaValue\.dataset\.state = health\.downgradeFrom \|\| \(health\.stored !== null && health\.stored > health\.current\)\s*\n\s*\? "newer"/);
    assert.ok(declaresIn(css, '.sw-settings .sw-settings__storage-schema[data-state="newer"]', /color: var\(--b3-theme-warning/, base));
    assert.match(sections, /storageSchemaTip/, '健康行必须说明「只读展示，不触发写入」');
});

test('cache management explains bounds and clears only rebuildable data (T-7004)', () => {
    assert.match(indexSource, /clearThumbCache\(\) \{\s*\n\s*this\.data\[THUMB_CACHE_KEY\] = \{\};/,
        '清空必须只作用于缩略图缓存');
    assert.doesNotMatch(indexSource, /clearThumbCache\(\) \{[\s\S]{0,200}RSS_READ_KEY/,
        'RSS 已读是用户语义数据，不得进清空范围');
    assert.match(sections, /storageCacheNote/, '必须有缓存上界与自动淘汰说明');
    assert.match(sections, /storageCacheClearConfirm/, '清空必须二次确认');
    assert.match(sections, /if \(!confirm\(this\.i18n\.storageCacheClearConfirm\)\) return;/);
});
