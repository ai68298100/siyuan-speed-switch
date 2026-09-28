const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {readSourceText} = require('./source-scan.cjs');
const {declaresIn} = require('./css-block-scan.cjs');

const root = path.resolve(__dirname, '..');

test('T-6979 favorite overlay toolbar stacks above the thumbnail scroller', () => {
    const css = readSourceText(path.join(root, 'src', 'styles', '_03-switcher-mobile.scss'));
    assert.equal(declaresIn(css, '.speed-switch .sw__toolbar', /\bposition:\s*relative\b/, {topLevel: true}), true);
    assert.equal(declaresIn(css, '.speed-switch .sw__toolbar', /\bz-index:\s*3\b/, {topLevel: true}), true);
    assert.equal(declaresIn(css, '.speed-switch .sw__toolbar .sw__select-wrap .sw__fav-panel', /\bposition:\s*fixed\b/, {topLevel: true}), true);
});

test('T-6979 recent native snippets live inside the studio selector', () => {
    const ui = readSourceText(path.join(root, 'src', 'snippet-studio-ui.js'));
    assert.match(ui, /session\.recentIds = rememberRecentSnippet\(session\.recentIds, native\.id\)/);
    assert.match(ui, /recentItems = \(session\.recentIds \|\| \[\]\)\.map/);
    assert.match(ui, /guardLeave\(\(\) => \{ choose\(item, item\); closePicker\(\); \}\)/);
    assert.match(ui, /sheet\.append\(head, recent, filters, list, more\)/);
});
