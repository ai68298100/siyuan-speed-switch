const test = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const {JSDOM} = require('jsdom');
const {readSourceFile} = require('./source-scan.cjs');
const {bindSettingControlSemantics} = require('../src/settings-control-dom');

const source = readSourceFile('src/index.ts');
const ast = ts.createSourceFile('index.ts', source, ts.ScriptTarget.Latest, true);
const plugin = ast.statements.find((node) => ts.isClassDeclaration(node) && node.name?.text === 'SpeedSwitchPlugin');
assert.ok(plugin, 'test fixture must find the production plugin class');
const methodText = (name) => {
    const method = plugin.members.find((node) => ts.isMethodDeclaration(node) && node.name?.getText(ast) === name);
    assert.ok(method, `test fixture must find production method ${name}`);
    return method.getText(ast);
};
const compiled = ts.transpileModule(`class KeyboardHarness { ${methodText('bindKeydown')} ${methodText('cycleSearchChip')} } return KeyboardHarness;`, {
    compilerOptions: {target: ts.ScriptTarget.ES2020},
}).outputText;
const KeyboardHarness = new Function('getComputedStyle', compiled)((element) => ({gridTemplateColumns: element.dataset.columns || '1fr'}));

function keyboardFixture({cards = 2, chips = true} = {}) {
    const dom = new JSDOM('<!doctype html><body><section id="scroll"><input id="search"><div class="sw__search-chips">'
        + '<button class="sw__search-chip" data-chip="all"></button><button class="sw__search-chip" data-chip="tabs"></button>'
        + '<button class="sw__search-chip" data-chip="unified"></button><button class="sw__search-chip" data-chip="docs"></button></div>'
        + '<div class="sw__grid" data-columns="1fr 1fr"></div></section></body>');
    const document = dom.window.document;
    const scroll = document.querySelector('#scroll');
    const grid = scroll.querySelector('.sw__grid');
    const cardElements = Array.from({length: cards}, (_, index) => {
        const card = document.createElement('article');
        card.className = 'sw__card';
        card.tabIndex = 0;
        card.textContent = `Card ${index + 1}`;
        grid.appendChild(card);
        return card;
    });
    if (!chips) scroll.querySelector('.sw__search-chips').remove();
    const calls = {activated: 0, scrolled: 0};
    const harness = new KeyboardHarness();
    harness.docSearchState = {chipFilters: new Map()};
    harness.pickCardByPosition = () => null;
    harness.focusCard = (card) => {
        cardElements.forEach((item) => item.classList.toggle('sw__focused', item === card));
        card.focus();
    };
    harness.scrollIntoView = () => {calls.scrolled++;};
    harness.activateCardByElement = () => {calls.activated++;};
    harness.activateDocItemByDigit = () => false;
    harness.openCardMenu = () => {};
    harness.cardTabs = new Map();
    harness.cardMenuHandlers = new Map();
    harness.isMobile = false;
    harness.bindKeydown(scroll, () => {});
    const key = (target, value, options = {}) => {
        const event = new dom.window.KeyboardEvent('keydown', {key: value, bubbles: true, cancelable: true, ...options});
        target.dispatchEvent(event);
        return event;
    };
    return {dom, document, scroll, cardElements, calls, key};
}

test('switcher Tab and Shift+Tab preserve native focus order while arrows move cards', () => {
    const f = keyboardFixture();
    try {
        const first = f.cardElements[0];
        const tab = f.key(first, 'Tab');
        assert.equal(tab.defaultPrevented, false);
        const reverseTab = f.key(first, 'Tab', {shiftKey: true});
        assert.equal(reverseTab.defaultPrevented, false);
        first.classList.add('sw__focused');
        const right = f.key(first, 'ArrowRight');
        assert.equal(right.defaultPrevented, true);
        assert.equal(f.document.activeElement, f.cardElements[1]);
        const enter = f.key(f.cardElements[1], 'Enter');
        assert.equal(enter.defaultPrevented, true);
        assert.equal(f.calls.activated, 1);
    } finally {f.dom.window.close();}
});

test('Ctrl+Left and Ctrl+Right cycle result filters without changing the focused card', () => {
    const f = keyboardFixture();
    try {
        const card = f.cardElements[0];
        card.focus();
        const event = f.key(card, 'ArrowRight', {ctrlKey: true});
        assert.equal(event.defaultPrevented, true);
        assert.equal(f.document.activeElement, card);
        assert.equal(f.scroll.dataset.swChip, 'tabs');
        assert.equal(f.scroll.querySelector('[data-chip="tabs"]').getAttribute('aria-pressed'), 'true');
        assert.equal(f.scroll.querySelector('[data-chip="all"]').getAttribute('aria-pressed'), 'false');
    } finally {f.dom.window.close();}
});

test('Ctrl+arrows in the search input keep native caret behavior and empty results do not trap Tab', () => {
    const f = keyboardFixture({cards: 0});
    try {
        const input = f.document.querySelector('#search');
        const inputEvent = f.key(input, 'ArrowRight', {ctrlKey: true});
        assert.equal(inputEvent.defaultPrevented, false);
        const tab = f.key(f.scroll, 'Tab');
        assert.equal(tab.defaultPrevented, false);
    } finally {f.dom.window.close();}
});

test('settings controls receive names and descriptions, with distinct labels in compound rows', () => {
    const dom = new JSDOM('<!doctype html><body></body>');
    try {
        const document = dom.window.document;
        const item = document.createElement('div');
        const title = document.createElement('label');
        title.textContent = 'Thumbnail size';
        const description = document.createElement('div');
        description.textContent = 'Choose a size';
        const action = document.createElement('div');
        const range = document.createElement('input');
        range.type = 'range';
        range.setAttribute('aria-label', 'Existing explicit label');
        const number = document.createElement('input');
        number.type = 'number';
        action.append(range, number);
        item.append(title, description, action);
        bindSettingControlSemantics(item, title, description, action, {slider: 'Slider', number: 'Number'});
        assert.equal(action.getAttribute('role'), 'group');
        assert.equal(action.getAttribute('aria-labelledby'), title.id);
        assert.equal(range.getAttribute('aria-label'), 'Existing explicit label');
        assert.equal(number.getAttribute('aria-label'), 'Thumbnail size · Number');
        assert.equal(range.getAttribute('aria-describedby'), description.id);
        assert.equal(number.getAttribute('aria-describedby'), description.id);
    } finally {dom.window.close();}
});
