// T-7031：工作台状态与数据生命周期契约——配置保存失败/现场变化不丢编辑现场、
// provider 卸载渲染诚实占位（布局保留+编辑态可移除）。
const test = require('node:test');
const assert = require('node:assert/strict');
const {readSourceFile} = require('./source-scan.cjs');

const formSource = readSourceFile('src/home-config-form.ts');
const panelSource = readSourceFile('src/second-panel-ui.ts');
const zh = JSON.parse(require('node:fs').readFileSync(path0(), 'utf8'));
function path0() {
    return require('node:path').join(__dirname, '..', 'src', 'i18n', 'zh-CN.json');
}
const en = JSON.parse(require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'src', 'i18n', 'en.json'), 'utf8'));

test('lifecycle: config save keeps the form open on missing instance or failed persist', () => {
    // 现场已变：不 destroy、不 onSaved，给诚实回执
    assert.match(formSource, /if \(!instance\) \{\s*\n\s*showBlocked\(this\.i18n\.homeConfigSaveMissed\);\s*\n\s*return;\s*\n\s*\}/,
        '实例缺失必须停留表单并给回执（不得静默丢弃修改）');
    // 落盘失败：try/catch 包裹，失败停留
    assert.match(formSource, /try \{\s*\n\s*instance\.config = \{\.\.\.draft\};\s*\n\s*this\.saveHomeState\(next\);\s*\n\s*\} catch \(_\) \{\s*\n\s*showBlocked\(this\.i18n\.homeConfigSaveFailed\);\s*\n\s*return;/,
        '落盘异常必须停留表单并给回执');
    // 回执元素必须 role=alert 且只创建一次（重复保存复用同一节点更新文案）
    assert.match(formSource, /alert\.setAttribute\("role", "alert"\);/, '回执必须 role=alert');
    assert.match(formSource, /dialog\.destroy\(\);\s*\n\s*onSaved\(\);/, '仅成功路径销毁弹窗并回调');
});

test('lifecycle: uninstalled providers render an honest unavailable cell', () => {
    assert.match(panelSource, /if \(!def\) \{\s*\n\s*const ghost = document\.createElement\("div"\);\s*\n\s*ghost\.className = "sw-home__cell sw-home__cell--unavailable";/,
        'provider 缺定义必须渲染不可用占位而非静默消失');
    assert.match(panelSource, /ghostLabel\.textContent = this\.i18n\.homeCellUnavailable;/, '占位必须给诚实文案');
    assert.match(panelSource, /layout\.w \|\| 4/, '占位必须沿用布局宽度（重装后原位恢复）');
    assert.match(panelSource, /ghostRemove\.textContent = this\.i18n\.homeRemove;/, '编辑态占位必须提供移除出口');
    for (const key of ['homeCellUnavailable', 'homeConfigSaveFailed', 'homeConfigSaveMissed']) {
        assert.ok(zh[key] && en[key], `i18n 键 ${key} 必须双语齐备`);
    }
});

test('lifecycle: refreshOn debounce is cancelled with deferred refresh handles', () => {
    // 事件刷新与首开延迟刷新共享清理集合；否则重绘/销毁后迟到回调会触碰已释放 controller。
    assert.match(panelSource,
        /const refreshHandle = window\.setTimeout\(\(\) => \{\s*const position = homeRefreshTimers\.indexOf\(refreshHandle\);\s*if \(position >= 0\) homeRefreshTimers\.splice\(position, 1\);\s*homeFlushRefresh\(\);\s*\}, 500\);\s*homeRefreshTimer = refreshHandle;\s*homeRefreshTimers\.push\(refreshHandle\);/,
        'refreshOn 防抖句柄必须登记到统一清理集合');
    assert.match(panelSource,
        /const clearDeferredRefreshes = \(\) => \{\s*homeRefreshTimers\.splice\(0\)\.forEach\(\(handle\) => \{\s*const cancelIdle = \(window as any\)\.cancelIdleCallback;\s*if \(typeof cancelIdle === "function"\) cancelIdle\(handle\);\s*window\.clearTimeout\(handle\);/,
        '统一清理必须取消已登记的 refreshOn 句柄');
});

test('lifecycle: home config form disposes search timers and ignores late option responses', () => {
    assert.match(formSource,
        /const configFormCleanups: Array<\(\) => void> = \[\];\s*let configFormDisposed = false;\s*const registerConfigFormCleanup = \(cleanup: \(\) => void\) => \{\s*configFormCleanups\.push\(cleanup\);\s*\};\s*let releaseConfigForm: \(\) => void = \(\) => \{\s*configFormDisposed = true;/,
        '配置表单销毁必须标记 disposed 并运行统一清理集合');
    assert.match(formSource,
        /registerConfigFormCleanup\(\(\) => \{\s*requestGeneration \+= 1;\s*if \(queryTimer !== null\) \{\s*window\.clearTimeout\(queryTimer\);\s*queryTimer = null;\s*\}\s*\}\);/,
        '文档搜索防抖必须登记并在销毁时清理，同时作废迟到请求');
    assert.match(formSource,
        /let allItems: Array<\{id: string; title: string\}> = \[\];\s*registerConfigFormCleanup\(\(\) => \{\s*if \(queryTimer !== null\) \{\s*window\.clearTimeout\(queryTimer\);\s*queryTimer = null;\s*\}\s*\}\);/,
        '数据库搜索防抖必须登记到配置表单清理集合');
    assert.match(formSource,
        /if \(configFormDisposed \|\| generation !== requestGeneration\) return;/,
        '文档搜索迟到响应必须在销毁后丢弃');
    assert.match(formSource,
        /input\.addEventListener\("sw-config-reset", \(\) => \{\s*requestGeneration \+= 1;\s*if \(queryTimer !== null\) \{\s*window\.clearTimeout\(queryTimer\);/,
        '文档搜索重置必须取消已经排队的旧查询');
    assert.match(formSource,
        /loadHomeDatabaseOptions\(\)\.then\(\(items\) => \{\s*if \(configFormDisposed\) return;/,
        '数据库选项迟到响应必须在销毁后丢弃');
    assert.match(formSource,
        /loadNotebooks\(\)\.then\(\(notebooks\) => \{\s*if \(configFormDisposed\) return;/,
        '笔记本选项迟到响应必须在销毁后丢弃');
    assert.match(formSource,
        /if \(!configFormDisposed && generation === loadGeneration && blockId === String\(draft\.blockId \|\| ""\)\) render\(items\);/,
        '数据库列迟到响应必须在销毁后丢弃');
    assert.match(formSource,
        /loadMinifluxCategoryOptions\(String\(draft\.endpoint \|\| ""\), String\(draft\.token \|\| ""\)\)\.then\(\(categories\) => \{\s*if \(configFormDisposed\) return;/,
        'Miniflux 分类迟到响应必须在销毁后丢弃');
    assert.match(formSource,
        /loadActivityWatchBuckets\(String\(draft\.endpoint \|\| ""\)\)\s*:\s*Promise\.resolve\(\[\]\)\)\.then\(\(buckets\) => \{\s*if \(configFormDisposed\) return;/,
        'ActivityWatch 桶迟到响应必须在销毁后丢弃');
    assert.match(formSource,
        /input\.addEventListener\("sw-config-reset", \(\) => \{\s*if \(queryTimer !== null\) \{\s*window\.clearTimeout\(queryTimer\);/,
        '数据库搜索重置必须取消已经排队的旧过滤');
    assert.match(formSource,
        /let initialFocusTimer: number \| null = window\.setTimeout\(\(\) => \{\s*initialFocusTimer = null;\s*const first = controls\.values\(\)\.next\(\)\.value;\s*if \(root\.isConnected\) first\?\.focus\(\);\s*\}, 0\);\s*registerConfigFormCleanup\(\(\) => \{\s*if \(initialFocusTimer !== null\) \{\s*window\.clearTimeout\(initialFocusTimer\);/,
        '首焦点 timer 必须随配置表单销毁清理');
});
