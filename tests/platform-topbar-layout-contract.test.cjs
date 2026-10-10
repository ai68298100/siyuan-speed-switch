const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {readSourceText} = require('./source-scan.cjs');
const {declaresIn} = require('./css-block-scan.cjs');

const root = path.resolve(__dirname, '..');
const css = readSourceText(path.join(root, 'src', 'styles', '_platform-shell.scss'));

test('T-7232 desktop header centers navigation between brand and actions', () => {
    const base = {topLevel: true};
    assert.equal(declaresIn(css, '.sw-platform-header', /display:\s*grid/, base), true);
    assert.equal(declaresIn(css, '.sw-platform-header', /grid-template-areas:\s*"brand nav actions"/, base), true);
    assert.equal(declaresIn(css, '.sw-platform-surface-nav', /justify-self:\s*center/, base), true);
    assert.equal(declaresIn(css, '.sw-platform-header__actions', /justify-self:\s*end/, base), true);
    assert.equal(declaresIn(css, '.sw-platform-header__close-group', /border-left:\s*1px solid/, base), true);
});

test('T-7232 surface entries keep a stable pointer target', () => {
    const base = {topLevel: true};
    assert.equal(declaresIn(css, '.sw-platform-surface-nav__item', /min-height:\s*48px/, base), true);
    assert.equal(declaresIn(css, '.sw-platform-surface-nav__item', /flex:\s*1 1 0/, base), true);
});

test('T-7232 compact viewports give navigation its own row and keep close controls reachable', () => {
    assert.equal(declaresIn(css, '.sw-platform-header', /grid-template-areas:\s*"brand actions" "nav nav"/, {atRule: /max-width:\s*960px/}), true);
    assert.equal(declaresIn(css, '.sw-platform-surface-nav__icon', /display:\s*none/, {atRule: /max-width:\s*560px/}), true);
    assert.equal(declaresIn(css, '.sw-platform-header__close', /min-width:\s*44px/, {atRule: /max-width:\s*560px/}), true);
    assert.equal(declaresIn(css, '.sw-platform-header__icon-action', /min-width:\s*44px/, {atRule: /max-width:\s*560px/}), true);
});

test('T-7232 compact custom dialogs follow the chrome container width', () => {
    const container960 = {atRule: /@container\s+sw-platform\s+\(max-width:\s*960px\)/};
    const container560 = {atRule: /@container\s+sw-platform\s+\(max-width:\s*560px\)/};
    const compactHeader = '.sw-platform-surface:not(.sw--sidebar) > .sw-platform-chrome .sw-platform-header';
    const compactNav = '.sw-platform-surface:not(.sw--sidebar) > .sw-platform-chrome .sw-platform-surface-nav';
    const compactIcon = '.sw-platform-surface:not(.sw--sidebar) > .sw-platform-chrome .sw-platform-surface-nav__icon';
    const compactClose = '.sw-platform-surface:not(.sw--sidebar) > .sw-platform-chrome .sw-platform-header__close';

    assert.equal(declaresIn(css, compactHeader, /grid-template-areas:\s*"brand actions" "nav nav"/, container960), true);
    assert.equal(declaresIn(css, compactNav, /justify-self:\s*stretch/, container960), true);
    assert.equal(declaresIn(css, compactIcon, /display:\s*none/, container560), true);
    assert.equal(declaresIn(css, compactClose, /min-width:\s*44px/, container560), true);

    // Negative probes: deleting the container-specific stack or hit target
    // must make this contract fail even though viewport media rules remain.
    const withoutContainerStack = css.replaceAll('grid-template-areas: "brand actions" "nav nav";', '');
    assert.equal(declaresIn(withoutContainerStack, compactHeader, /grid-template-areas:\s*"brand actions" "nav nav"/, container960), false,
        'container stack deletion must fail');
    const withoutContainerClose = css.replaceAll('min-width: 44px;', '');
    assert.equal(declaresIn(withoutContainerClose, compactClose, /min-width:\s*44px/, container560), false,
        'container close hit target deletion must fail');
});

test('T-7232 sidebar keeps actions above a full-width surface navigation row', () => {
    const base = {topLevel: true};
    const sidebarHeader = '.sw--sidebar > .sw-platform-chrome .sw-platform-header';
    assert.equal(declaresIn(css, sidebarHeader, /grid-template-areas:\s*"actions" "nav"/, base), true);
    assert.equal(declaresIn(css, '.sw--sidebar > .sw-platform-chrome .sw-platform-surface-nav__icon', /display:\s*none/, {atRule: /container sw-platform/}), true);
    assert.equal(declaresIn(css, '.sw--sidebar > .sw-platform-chrome .sw-platform-surface-nav__item', /padding-inline:\s*4px/, {atRule: /container sw-platform/}), true);
    const withoutSidebarPadding = css.replace('padding-inline: 4px;', 'padding-inline: 6px;');
    assert.equal(declaresIn(withoutSidebarPadding, '.sw--sidebar > .sw-platform-chrome .sw-platform-surface-nav__item', /padding-inline:\s*4px/, {atRule: /container sw-platform/}), false,
        'sidebar container padding deletion must fail');
});
