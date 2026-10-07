// T-7017 项③：移动浮层视口比例高度契约
const test = require('node:test');
const assert = require('node:assert/strict');
const {readStyleSource} = require('./source-scan.cjs');

const scss = readStyleSource('src/styles/_03-switcher-mobile.scss');
const widgetScss = readStyleSource('src/styles/_05-settings-widgets.scss');

test('mobile panels: viewport-ratio height with dvh fallback and minimum (T-7017)', () => {
    // 两处浮层（收藏下拉/历史下拉）必须：旧 320px 回退在前、dvh 视口比例在后、最小高度兜底
    const favBlock = scss.slice(scss.indexOf('.sw__fav-panel'), scss.indexOf('.sw__fav-panel') + 700);
    assert.match(favBlock, /max-height: 320px;/, '收藏浮层必须保留旧 WebView 回退');
    assert.match(favBlock, /max-height: min\(60dvh, 480px\);/, '收藏浮层必须视口比例加高（dvh 跟随软键盘/横屏）');
    assert.match(favBlock, /min-height: 200px;/, '收藏浮层必须最小可用高度');
    const historyBlock = scss.slice(scss.indexOf('.sw__history-panel'), scss.indexOf('.sw__history-panel') + 700);
    assert.match(historyBlock, /max-height: 320px;/, '历史浮层必须保留旧 WebView 回退');
    assert.match(historyBlock, /max-height: min\(60dvh, 480px\);/, '历史浮层必须视口比例加高');
    assert.match(historyBlock, /min-height: 200px;/, '历史浮层必须最小可用高度');
    const sortSheetBlock = widgetScss.slice(widgetScss.indexOf('.sw__mobile-sort-sheet'), widgetScss.indexOf('.sw__mobile-sort-sheet') + 520);
    assert.match(sortSheetBlock, /max-height: min\(70vh, 520px\);/, '排序 sheet 必须保留旧 WebView 回退');
    assert.match(sortSheetBlock, /max-height: min\(70dvh, 520px\);/, '排序 sheet 必须跟随动态视口高度');
    const favSheetStart = widgetScss.indexOf('.sw__mobile-sheet {');
    const favSheetBlock = widgetScss.slice(favSheetStart, favSheetStart + 520);
    assert.match(favSheetBlock, /max-height: 65vh;/, '收藏 sheet 必须保留旧 WebView 回退');
    assert.match(favSheetBlock, /max-height: min\(65dvh, 520px\);/, '收藏 sheet 必须跟随动态视口高度');
});
