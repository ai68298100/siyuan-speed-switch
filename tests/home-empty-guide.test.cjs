// T-7033：空工作台引导契约
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {readSourceFile} = require('./source-scan.cjs');

const panelSource = readSourceFile('src/second-panel-ui.ts');
const zh = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'i18n', 'zh-CN.json'), 'utf8'));
const en = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'i18n', 'en.json'), 'utf8'));

test('empty workbench: layered states, recommendations and default-restore (T-7033)', () => {
    // 分层：无组件源 vs 有源未添加
    assert.match(panelSource, /const hasSources = defs\.size > 0;/, '空态必须分层判定');
    assert.match(panelSource, /hasSources \? this\.i18n\.homeEmpty : this\.i18n\.homeEmptyNoSource/, '无源态必须有独立文案');
    // 三推荐：目录序前 3、排除已添加、走商店同管线（默认档解析）
    assert.match(panelSource, /\.slice\(0, 3\);/, '推荐必须有界三项');
    assert.match(panelSource, /resolveHomeTileDefaultSize\(moduleId, supported, "medium"\)/, '推荐添加必须走默认档解析器');
    assert.match(panelSource, /layoutOpLabel = this\.i18n\.homeHistoryUpdate;/, '推荐/恢复必须入布局历史记账');
    // 恢复默认：仅重建默认模块、已存在实例不重复创建
    assert.match(panelSource, /restore\.textContent = this\.i18n\.homeEmptyRestoreDefault;/, '恢复默认按钮必须存在');
    assert.match(panelSource, /if \(!seenModules\.has\(candidate\.moduleId\)\) \{/, '恢复默认不得重复创建已存在实例');
    // 说明行：材质/档位指针
    assert.match(panelSource, /tierHint\.textContent = this\.i18n\.homeEmptyTierHint;/, '必须给材质/档位说明行');
    for (const key of ['homeEmptyNoSource', 'homeEmptyRecommended', 'homeEmptyRestoreDefault', 'homeEmptyTierHint']) {
        assert.ok(zh[key] && en[key], `i18n 键 ${key} 必须双语齐备`);
    }
});
