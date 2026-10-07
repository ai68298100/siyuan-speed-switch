const test = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const {JSDOM} = require('jsdom');
const {readSourceFile} = require('./source-scan.cjs');

const source = readSourceFile('src/mobile-switcher-ui.ts');
const ast = ts.createSourceFile('mobile-switcher-ui.ts', source, ts.ScriptTarget.Latest, true);
const names = new Set(['bindMobileSwitcherToolbarActions', 'openMobileSwitcherDialog']);
const functions = ast.statements.filter((node) => ts.isFunctionDeclaration(node) && names.has(node.name?.text));
assert.equal(functions.length, names.size, 'the fixture must execute both production functions');
const compiled = ts.transpileModule(functions.map((node) => node.getText(ast).replace(/^export\s+/, '')).join('\n'), {
    compilerOptions: {target: ts.ScriptTarget.ES2020},
}).outputText;

function fixture({groupBy = 'favorites', sortBy = 'titleAsc', useOpen = false} = {}) {
    const dom = new JSDOM('<!doctype html><body><main id="workspace"><button id="background">Workspace action</button></main><aside id="old-state" inert="original" aria-hidden="false"></aside></body>');
    const document = dom.window.document;
    const root = document.createElement('div');
    root.innerHTML = '<div class="b3-dialog__container"><div class="b3-dialog__body"><div class="sw__mobile"><div class="sw__mobile-toolbar"><input class="sw__search"><button class="sw__sort-btn">Sort</button><select class="sw__sort"><option value="mru">MRU</option><option value="layout">Layout</option><option value="layoutDesc">Layout reverse</option><option value="updatedDesc">Updated</option><option value="titleAsc">Title A-Z</option><option value="titleDesc">Title Z-A</option></select><button class="sw__mobile-close-btn">Close switcher</button></div><div class="sw__scroll"></div></div></div></div>';
    document.body.appendChild(root);
    const frames = [];
    const settings = {groupBy, sortBy};
    const calls = {parentClose: 0, filterDispose: 0, rendered: 0, searched: 0, fabRelease: 0, refreshRelease: 0, patches: []};
    let release = () => {};
    const dialog = {element: root, destroy: () => {calls.parentClose++; release(); root.remove();}};
    const host = {
        i18n: {setSortBy: 'Sort', mobileSortAndGroupTitle: 'Sort and group', groupModeTitle: 'Grouping', groupSortTitle: 'Within group', groupNotebook: 'Notebook', groupFavorites: 'Favorites', groupCreatedMonth: 'Month created', groupNone: 'No grouping', sortMru: 'Recent use', sortLayout: 'Tab order', sortLayoutDesc: 'Reverse tab order', sortUpdatedDesc: 'Last updated', sortTitleAsc: 'Title A-Z', sortTitleDesc: 'Title Z-A', close: 'Close'},
        isMobile: true,
        getSettings: () => settings,
        updateSettings: (patch) => {Object.assign(settings, patch); calls.patches.push(patch);},
        applySearch: () => {calls.searched++;},
        bindSearchInputComposition: () => {},
        scheduleAnimationFrame: (callback) => {frames.push(callback); return frames.length;},
        getMobileActiveTabId: () => undefined,
        createMobileSwitcherDialog: (holder) => {release = () => holder.fn(); return dialog;},
        suspendFABForDialog: () => () => {calls.fabRelease++;},
        pruneThumbCache: () => {},
        registerSwitcherRefresh: () => () => {calls.refreshRelease++;},
        renderMobileSwitcherList: () => ({renderMobileList: () => {calls.rendered++;}}),
        setupOpenHistoryDropdown: () => () => {},
        renderQuickActions: () => {},
        mobileSwitcherDialog: null,
    };
    const api = new Function('document', 'window', 'HTMLElement', 'Event', 'bindDocSearchFilter', 'requestAnimationFrame', 'cancelAnimationFrame', 'disposeDocSearchSession', 'hasDocSearchFilter', compiled + '\nreturn {bindMobileSwitcherToolbarActions, openMobileSwitcherDialog};')(
        document, dom.window, dom.window.HTMLElement, dom.window.Event,
        () => () => {calls.filterDispose++;},
        (callback) => {frames.push(callback); return frames.length;}, () => {}, () => {}, () => false,
    );
    const input = root.querySelector('.sw__search');
    const select = root.querySelector('.sw__sort');
    select.value = sortBy;
    const trigger = root.querySelector('.sw__sort-btn');
    let dispose;
    if (useOpen) {
        api.openMobileSwitcherDialog.call(host, []);
        dispose = () => release();
    } else {
        dispose = api.bindMobileSwitcherToolbarActions.call(host, dialog, input, select, root.querySelector('.sw__scroll'), () => dialog.destroy(), () => {calls.rendered++;});
        release = dispose;
    }
    return {
        dom, document, root, trigger, select, input, calls, settings, dispose, dialog,
        open: () => {trigger.focus(); trigger.click(); return [...document.querySelectorAll('.sw__mobile-sort-overlay')].at(-1);},
        key: (key, shiftKey = false, target = document.activeElement) => {
            const event = new dom.window.KeyboardEvent('keydown', {key, shiftKey, bubbles: true, cancelable: true});
            target.dispatchEvent(event);
            return event;
        },
        flush: () => {const pending = frames.splice(0); pending.forEach((callback) => callback());},
        cleanup: () => {dispose(); dom.window.close();},
    };
}

test('mobile sort modal has a name and immediately focuses the current grouping choice', () => {
    const f = fixture();
    try {
        const overlay = f.open();
        const sheet = overlay.querySelector('[role="dialog"]');
        assert.equal(sheet.getAttribute('aria-label'), 'Sort and group');
        assert.equal(sheet.getAttribute('aria-modal'), 'true');
        assert.equal(sheet.querySelector('.sw__mobile-sheet-title').textContent, 'Sort and group');
        assert.equal(f.document.activeElement.textContent, 'Favorites');
        assert.equal(f.document.activeElement.getAttribute('aria-checked'), 'true');
        assert.equal(f.trigger.getAttribute('aria-haspopup'), 'dialog');
        assert.equal(f.trigger.getAttribute('aria-expanded'), 'true');
        f.flush();
        assert.equal(f.document.activeElement.textContent, 'Favorites');
    } finally {f.cleanup();}
});

for (const [section, selected, last] of [[0, 'Favorites', 'No grouping'], [1, 'Title A-Z', 'Title Z-A']]) {
    test(`mobile sort menu ${section} supports arrows, boundaries and one tab stop without changing settings`, () => {
        const f = fixture();
        try {
            const menu = f.open().querySelectorAll('[role="menu"]')[section];
            const items = [...menu.querySelectorAll('button')];
            items.find((item) => item.textContent === selected).focus();
            f.key('End');
            assert.equal(f.document.activeElement.textContent, last);
            f.key('ArrowDown');
            assert.equal(f.document.activeElement, items[0]);
            f.key('ArrowUp');
            assert.equal(f.document.activeElement, items.at(-1));
            f.key('Home');
            assert.equal(f.document.activeElement, items[0]);
            f.key('ArrowRight');
            assert.equal(f.document.activeElement, items[1]);
            f.key('ArrowLeft');
            assert.equal(f.document.activeElement, items[0]);
            assert.equal(items.filter((item) => item.tabIndex === 0).length, 1);
            assert.equal(menu.querySelector('[aria-checked="true"]').textContent, selected);
            assert.deepEqual(f.calls.patches, []);
        } finally {f.cleanup();}
    });
}

test('mobile sort Tab and Shift+Tab stay in the two menus and explicit close control', () => {
    const f = fixture();
    try {
        const overlay = f.open();
        const close = overlay.querySelector('.sw__mobile-sort-close');
        assert.equal(f.key('Tab').defaultPrevented, true);
        assert.equal(f.document.activeElement.textContent, 'Title A-Z');
        f.key('Tab');
        assert.equal(f.document.activeElement, close);
        f.key('Tab');
        assert.equal(f.document.activeElement.textContent, 'Favorites');
        f.key('Tab', true);
        assert.equal(f.document.activeElement, close);
        f.key('Tab', true);
        assert.equal(f.document.activeElement.textContent, 'Title A-Z');
        f.key('ArrowDown');
        f.key('Tab');
        f.key('Tab');
        f.key('Tab');
        assert.equal(f.document.activeElement.textContent, 'Title Z-A');
    } finally {f.cleanup();}
});

test('mobile sort blocks background actions and escaped focus, then restores original background attributes', () => {
    const f = fixture();
    try {
        const background = f.document.getElementById('background');
        const old = f.document.getElementById('old-state');
        let invoked = 0;
        background.addEventListener('click', () => invoked++);
        f.open();
        assert.equal(f.root.hasAttribute('inert'), true);
        assert.equal(f.document.getElementById('workspace').getAttribute('aria-hidden'), 'true');
        background.click();
        assert.equal(invoked, 0);
        background.focus();
        assert.equal(f.document.activeElement.textContent, 'Favorites');
        const backgroundKey = f.key('Enter', false, background);
        assert.equal(backgroundKey.defaultPrevented, true);
        f.key('Escape');
        assert.equal(f.root.hasAttribute('inert'), false);
        assert.equal(f.root.hasAttribute('aria-hidden'), false);
        assert.equal(old.getAttribute('inert'), 'original');
        assert.equal(old.getAttribute('aria-hidden'), 'false');
        background.click();
        assert.equal(invoked, 1);
        assert.equal(f.document.activeElement, f.trigger);
    } finally {f.cleanup();}
});

for (const method of ['Escape', 'backdrop', 'close']) {
    test(`mobile sort ${method} closes only its sheet and restores trigger focus`, () => {
        const f = fixture();
        try {
            const overlay = f.open();
            let leakedEscape = 0;
            f.document.addEventListener('keydown', (event) => {if (event.key === 'Escape') leakedEscape++;}, true);
            if (method === 'Escape') f.key('Escape');
            if (method === 'backdrop') overlay.click();
            if (method === 'close') {
                overlay.querySelector('.sw__mobile-sort-close').focus();
                f.key('Enter');
            }
            assert.equal(overlay.isConnected, false);
            assert.equal(f.root.isConnected, true);
            assert.equal(f.calls.parentClose, 0);
            assert.equal(leakedEscape, 0);
            assert.equal(f.document.activeElement, f.trigger);
            assert.equal(f.trigger.getAttribute('aria-expanded'), 'false');
            f.flush();
            assert.equal(f.document.activeElement, f.trigger);
        } finally {f.cleanup();}
    });
}

for (const [section, key, expected] of [[0, 'Enter', {groupBy: 'createdMonth'}], [1, ' ', {sortBy: 'titleDesc'}]]) {
    test(`mobile sort menu ${section} commits with ${key === ' ' ? 'Space' : key}, keeps the parent and returns focus`, () => {
        const f = fixture();
        try {
            const overlay = f.open();
            overlay.querySelectorAll('[role="menu"]')[section].querySelector('[aria-checked="true"]').focus();
            f.key('ArrowDown');
            assert.equal(f.key(key).defaultPrevented, true);
            assert.deepEqual(f.calls.patches, [expected]);
            assert.equal(f.calls.rendered, 1);
            assert.equal(f.calls.searched, 1);
            assert.equal(overlay.isConnected, false);
            assert.equal(f.calls.parentClose, 0);
            assert.equal(f.document.activeElement, f.trigger);
        } finally {f.cleanup();}
    });
}

test('mobile switcher owner disposal removes its own sheet, restores background and leaves other portals intact', () => {
    const f = fixture({useOpen: true});
    try {
        const other = f.document.createElement('div');
        other.className = 'sw__mobile-sort-overlay';
        f.document.body.appendChild(other);
        const overlay = f.open();
        // There are two real portals so a global query/remove cannot pass this test.
        assert.equal(f.document.querySelectorAll('.sw__mobile-sort-overlay').length, 2);
        f.dialog.destroy();
        assert.equal(overlay.isConnected, false);
        assert.equal(other.isConnected, true);
        assert.equal(other.hasAttribute('inert'), false);
        assert.equal(f.document.getElementById('workspace').hasAttribute('inert'), false);
        assert.equal(f.calls.filterDispose, 1);
        assert.equal(f.calls.fabRelease, 1);
        assert.equal(f.calls.refreshRelease, 1);
        f.dispose();
        assert.equal(f.calls.filterDispose, 1);
        assert.equal(f.key('Escape', false, f.document.body).defaultPrevented, false);
    } finally {f.cleanup();}
});
