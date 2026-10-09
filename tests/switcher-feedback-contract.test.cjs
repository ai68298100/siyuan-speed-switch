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
    assert.equal(declaresIn(css, '.sw-platform-surface-nav__item', /pointer-events:\s*auto\b/, base), true,
        'surface navigation controls must retain their own hit target');
    assert.equal(declaresIn(css, '.sw-platform-surface-nav__item', /touch-action:\s*manipulation\b/, base), true,
        'surface navigation controls must avoid delayed touch activation');
});

test('T-7228 surface navigation labels expose purpose and current state', () => {
    const source = readSourceText(path.join(root, 'src', 'index.ts'));
    assert.match(source, /const surfaceHint = options\.labels\.hints\[surface\]/);
    assert.match(source, /control\.setAttribute\("title", surfaceHint/);
    assert.match(source, /control\.setAttribute\("aria-label", `\$\{options\.labels\.surfaces\[surface\]\}（当前）`\)/,
        'current surface should announce its state');
    const missingTitle = source.replace('control.setAttribute("title", surfaceHint', 'control.setAttribute("title", /* deleted */ surfaceHint');
    assert.doesNotMatch(missingTitle, /control\.setAttribute\("title", surfaceHint/,
        '删除入口 title 绑定后门禁必须失败');
    const missingCurrent = source.replace('control.setAttribute("aria-label", `${options.labels.surfaces[surface]}（当前）`);', '/* deleted current state */');
    assert.doesNotMatch(missingCurrent, /control\.setAttribute\("aria-label", `\$\{options\.labels\.surfaces\[surface\]\}（当前）`\)/,
        '删除当前状态播报后门禁必须失败');
});

test('T-7228 hit-layer declarations remain guarded by negative probes', () => {
    const source = readSourceText(path.join(root, 'src', 'styles', '_platform-shell.scss'));
    const navBlock = (value) => {
        const navMarker = value.indexOf('.sw-platform-surface-nav::-webkit-scrollbar');
        const start = value.indexOf('.sw-platform-surface-nav__item {', navMarker);
        const end = value.indexOf('\n}', start);
        return start >= 0 && end > start ? value.slice(start, end) : '';
    };
    const original = navBlock(source);
    assert.match(original, /pointer-events:\s*auto;/);
    assert.match(original, /touch-action:\s*manipulation;/);
    const missingPointerEvents = original.replace('pointer-events: auto;', '');
    assert.doesNotMatch(missingPointerEvents, /pointer-events:\s*auto;/,
        '删除顶栏入口命中层后门禁必须失败');
    const missingTouchAction = original.replace('touch-action: manipulation;', '');
    assert.doesNotMatch(missingTouchAction, /touch-action:\s*manipulation;/,
        '删除顶栏触控语义后门禁必须失败');
});
