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
    assert.match(ui, /sheet\.append\(head, recent, groupToolbar, filters, list, more\)/);
});

test('T-7027 surface navigation feedback is immediate and pressed state is explicit', () => {
    const css = readSourceText(path.join(root, 'src', 'styles', '_platform-shell.scss'));
    const base = {topLevel: true};
    assert.equal(declaresIn(css, '.sw-platform-surface-nav__item', /transition:\s*none\b/, base), true,
        'SurfaceNav must not defer pointer feedback through a transition');
    assert.equal(declaresIn(css, '.sw-platform-surface-nav__item:active', /background:\s*var\(--sw-platform-accent-pressed\)/, base), true,
        'pressed navigation state must use the pressed accent surface');
    assert.equal(declaresIn(css, '.sw-platform-surface-nav__item:active', /transform:\s*translateY\(1px\)/, base), true,
        'pressed navigation state must provide a visible down feedback');
    assert.equal(declaresIn(css, '.sw-platform-surface-nav__item:focus-visible', /outline:\s*2px solid var\(--sw-platform-accent\)/, base), true,
        'keyboard focus must remain explicit after the active state rule');
    assert.equal(declaresIn(css, '.sw-platform-surface-nav__item:active', /transform:\s*none\b/, {atRule: /prefers-reduced-motion/}), true,
        'reduced motion must remove pressed translation');
});
