const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {readSourceText} = require('./source-scan.cjs');
const {declaresIn} = require('./css-block-scan.cjs');

const root = path.join(__dirname, '..');
const finalSurfaceStyle = readSourceText(path.join(root, 'src', 'styles', '_12-r54-surface-adapter.scss'));
const assembledStyles = readSourceText(path.join(root, 'src', 'index.scss'));

test('compact workbench styles override the final polish layer (T-7274)', () => {
    assert.ok(assembledStyles.lastIndexOf('.sw-home {') < assembledStyles.indexOf('.sw-home.sw-home--compact'),
        'the compact overrides must follow the workbench cell rules in the assembled cascade');
    assert.ok(declaresIn(finalSurfaceStyle, '.sw-home.sw-home--compact .sw-home__grid', /gap:\s*var\(--sw-space-sm,\s*6px\)/, {topLevel: true}),
        'compact workbench grid gap must be 6px after the last-loaded polish layer');
    assert.ok(declaresIn(finalSurfaceStyle, '.sw-home.sw-home--compact .sw-home__cell', /padding:\s*var\(--sw-space-xs,\s*4px\) var\(--sw-space-sm,\s*6px\)/, {topLevel: true}),
        'compact widget cards must reduce outer padding');
    assert.ok(declaresIn(finalSurfaceStyle, '.sw-home.sw-home--compact .sw-home__cell', /(?:^|\n)\s*backdrop-filter:\s*none/, {topLevel: true}),
        'compact widget cards must remove the glass blur');
    assert.ok(declaresIn(finalSurfaceStyle, '.sw-home.sw-home--compact .sw-home__cell-body', /padding:\s*var\(--sw-space-xs,\s*4px\) var\(--sw-space-sm,\s*6px\)/, {topLevel: true}),
        'compact widget content must not inherit the larger polish padding');
    assert.ok(declaresIn(finalSurfaceStyle, '.sw-home.sw-home--compact .sw-home__cell:hover', /transform:\s*none/, {topLevel: true}),
        'hover must not lift compact cards and make the grid feel heavy');
    assert.ok(declaresIn(finalSurfaceStyle, '.sw-home.sw-home--compact > .sw-platform-chrome .sw-platform-header', /grid-template-areas:\s*"brand nav actions"/, {topLevel: true}),
        'compact host chrome must keep its navigation on one row');
    assert.ok(declaresIn(finalSurfaceStyle, '.sw-home.sw-home--compact > .sw-platform-chrome .sw-platform-surface-nav__item', /min-height:\s*var\(--sw-control-h-sm,\s*28px\)/, {topLevel: true}),
        'compact host navigation must use a reduced row height');
    assert.ok(declaresIn(finalSurfaceStyle, '.sw-home.sw-home--compact .sw-home__quick-actions', /display:\s*none/, {topLevel: true}),
        'compact desktop workbench must remove the duplicate bottom action rail');
    assert.ok(declaresIn(finalSurfaceStyle, '.sw-home.sw-home--compact .sw-home__cell', /max-height:\s*68px/, {topLevel: true}),
        'compact widget cards must keep a bounded readable height');
    assert.ok(declaresIn(finalSurfaceStyle, '.sw-home.sw-home--compact .sw-home__grid', /grid-auto-rows:\s*auto/, {topLevel: true}),
        'compact widget rows must follow content instead of the 40px layout grid');
    assert.ok(declaresIn(finalSurfaceStyle, '.sw-home.sw-home--compact .sw-home__cell', /grid-row:\s*auto\s*!important/, {topLevel: true}),
        'compact widget cards must release their multi-row desktop spans');
    assert.ok(declaresIn(finalSurfaceStyle, '.sw-home.sw-home--compact .sw__home-module-item-action', /min-height:\s*24px/, {topLevel: true}),
        'compact widget rows must stay visually small');
    assert.match(finalSurfaceStyle, /@container sw-platform \(max-width: 760px\)[\s\S]*?grid-template-areas:\s*"brand actions" "nav nav"/,
        'narrow compact workbench chrome must use a two-row header');
    assert.match(finalSurfaceStyle, /@container sw-platform \(max-width: 760px\)[\s\S]*?\.sw-platform-status\s*\{\s*display:\s*none/,
        'narrow compact workbench chrome must hide the duplicate status badge');
});
