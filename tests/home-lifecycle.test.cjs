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
