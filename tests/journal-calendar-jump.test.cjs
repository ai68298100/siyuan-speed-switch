// T-6975：日记日历快跳契约
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {readSourceFile} = require('./source-scan.cjs');

const viewSource = readSourceFile('src/home-view.js');
const controllerSource = readSourceFile('src/home-controller.js');
const indexSource = readSourceFile('src/index.ts');
const panelSource = readSourceFile('src/second-panel-ui.ts');
const zh = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'i18n', 'zh-CN.json'), 'utf8'));
const en = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'i18n', 'en.json'), 'utf8'));

test('journal jump: view renders jump buttons and period select from options', () => {
    assert.match(viewSource, /control\.addEventListener\("click", \(\) => options\.onCalendarJump\?\.\(step, view\)\);/,
        '快跳按钮必须走 onCalendarJump 回调');
    assert.match(viewSource, /control\.textContent = step < 0 \? "«" : "»";/, '快跳按钮以 «/» 表达');
    assert.match(viewSource, /if \(option\.offset === view\.calendarOffset\) opt\.selected = true;/, '期间选择器必须回显当前偏移');
    assert.match(viewSource, /options\.onCalendarPeriod\?\.\(offset, view\);/, '期间选择必须走 onCalendarPeriod 回调');
    assert.match(viewSource, /calendarOffset: Number\.isFinite\(rawSnapshot\.calendarOffset\) \? Math\.trunc\(rawSnapshot\.calendarOffset\) : 0,/,
        '当前偏移必须从快照透传（选择器回显数据源）');
});

test('journal jump: controller passes callbacks and options through', () => {
    assert.match(controllerSource, /onCalendarJump: options\.onCalendarJump,/, 'controller 必须透传 onCalendarJump');
    assert.match(controllerSource, /onCalendarPeriod: options\.onCalendarPeriod,/, 'controller 必须透传 onCalendarPeriod');
    assert.match(controllerSource, /calendarPeriodOptions: options\.calendarPeriodOptions,/, 'controller 必须透传期间选项');
});

test('journal jump: host search is bounded and honest; payload carries offset and options', () => {
    assert.match(indexSource, /calendarOffset: normalized\.monthOffset,/, '载荷必须携带当前偏移');
    assert.match(panelSource, /for \(let offset = current \+ stepDirection; offset \* stepDirection <= 24; offset \+= stepDirection\) \{/,
        '探测循环必须 ±24 钳制');
    assert.match(panelSource, /LIMIT 1`/, '月探测必须是 LIMIT 1 轻查询');
    assert.match(panelSource, /applyJournalMonthOffset\(targetInst, targetController, offset\);/, '命中必须经同一应用函数');
    assert.match(panelSource, /showMessage\(this\.i18n\.homeCalendarJumpNone, 3000, "info"\);/, '找不到必须诚实回执');
    for (const key of ['homeCalendarJumpPrev', 'homeCalendarJumpNext', 'homeCalendarPeriodPicker', 'homeCalendarJumpNone']) {
        assert.ok(zh[key] && en[key], `i18n 键 ${key} 必须双语齐备`);
    }
});
