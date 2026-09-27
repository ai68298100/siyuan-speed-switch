// T-6971 批次②：日历与日程规格接线契约——月头导航、六周网格、iCal 有界窗口
// 与失败回退必须真实接线；readSourceFile 已剥注释。
const test = require('node:test');
const assert = require('node:assert/strict');
const {readSourceFile} = require('./source-scan.cjs');

const homeView = readSourceFile('src/home-view.js');
const adapters = readSourceFile('src/home-external-adapters.ts');
const icalModel = readSourceFile('src/ical-model.js');

test('calendar spec: month navigation with prev/today/next focus keys is wired', () => {
    assert.match(homeView, /nav\.className = "sw__home-calendar-nav";/, '月头导航容器必须存在');
    assert.match(homeView, /calendar-prev/, '上一月焦点键');
    assert.match(homeView, /calendar-today/, '回到今天焦点键');
    assert.match(homeView, /calendar-next/, '下一月焦点键');
    assert.match(homeView, /sw__home-calendar-period/, '月份标题（period）必须渲染');
});

test('calendar spec: weekday labels come from the bounded snapshot or host labels', () => {
    assert.match(homeView, /view\.calendarWeekdays/, '星期行必须取自快照或宿主标签');
});

test('ical spec: bounded window and cache TTL stay within the audited envelope', () => {
    assert.match(adapters, /timeoutMs: 8500, cacheTtlMs: 30 \* 60 \* 1000/, 'iCal 抓取超时与缓存口径');
    assert.match(icalModel, /ICAL_MAX_SOURCE_BYTES = 256 \* 1024/, '源体积上限');
    assert.match(icalModel, /ICAL_MAX_EVENTS = 500/, '事件解析上限');
    assert.match(icalModel, /ICAL_DEFAULT_WINDOW_DAYS = 14/, '默认窗口 14 天');
    assert.match(icalModel, /ICAL_MAX_WINDOW_DAYS = 60/, '窗口上限 60 天');
});

test('ical spec: failures degrade to empty-hint with retry instead of raw errors', () => {
    assert.match(adapters, /homeIcalEmpty} · \$\{this\.i18n\.homeRetry\}/, '失败必须给重试出口的空态文案');
    assert.match(adapters, /homeIcalConfigHint/, '未配置 = 配置指引空态');
});
