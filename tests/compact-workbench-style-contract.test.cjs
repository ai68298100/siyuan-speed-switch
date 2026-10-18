const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {readSourceText} = require('./source-scan.cjs');
const {declaresIn, findRules} = require('./css-block-scan.cjs');

const root = path.join(__dirname, '..');
const finalSurfaceStyle = readSourceText(path.join(root, 'src', 'styles', '_12-r54-surface-adapter.scss'));
const uiPolishStyle = readSourceText(path.join(root, 'src', 'styles', '_11-ui-polish.scss'));
const assembledStyles = readSourceText(path.join(root, 'src', 'index.scss'));

test('compact workbench preserves visual height tiers after the final polish layer (T-7278)', () => {
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
    assert.ok(declaresIn(finalSurfaceStyle, '.sw-home.sw-home--compact:not(.sw-home--mobile) > .sw-platform-chrome .sw-platform-header', /grid-template-areas:\s*"brand nav actions"/, {topLevel: true}),
        'compact host chrome must keep its navigation on one row');
    assert.ok(declaresIn(finalSurfaceStyle, '.sw-home.sw-home--compact:not(.sw-home--mobile) > .sw-platform-chrome .sw-platform-surface-nav__item', /min-height:\s*var\(--sw-control-h-sm,\s*28px\)/, {topLevel: true}),
        'compact host navigation must use a reduced row height');
    assert.ok(declaresIn(finalSurfaceStyle, '.sw-home.sw-home--compact .sw-home__quick-actions', /display:\s*none/, {topLevel: true}),
        'compact desktop workbench must remove the duplicate bottom action rail');
    assert.ok(declaresIn(finalSurfaceStyle, '.sw-home.sw-home--compact .sw-home__cell', /max-height:\s*none/, {topLevel: true}),
        'compact widget cards must not be flattened by a shared height cap');
    assert.ok(declaresIn(finalSurfaceStyle, '.sw-home.sw-home--compact .sw-home__grid', /grid-auto-rows:\s*28px/, {topLevel: true}),
        'compact widget rows must use a small track so declared spans remain visible');
    const compactCellRules = findRules(finalSurfaceStyle, '.sw-home.sw-home--compact .sw-home__cell', {topLevel: true});
    assert.ok(compactCellRules.length > 0, 'compact widget cell rule must be discoverable as one scoped block');
    assert.ok(compactCellRules.every((rule) => !/grid-row:\s*auto\s*!important/.test(rule.declarations)),
        'compact widget cards must preserve the renderer-provided multi-row spans');
    assert.ok(declaresIn(finalSurfaceStyle, '.sw-home.sw-home--compact .sw-home__cell', /overflow:\s*hidden/, {topLevel: true}),
        'compact widget cards must clip only within their declared content-sized span');
    assert.ok(declaresIn(finalSurfaceStyle, '.sw-home.sw-home--compact .sw__home-module-item-action', /min-height:\s*24px/, {topLevel: true}),
        'compact widget rows must stay visually small');
    assert.ok(declaresIn(finalSurfaceStyle, '.sw-home.sw-home--compact:not(.sw-home--mobile) > .sw-platform-chrome .sw-platform-header', /grid-template-areas:\s*"brand actions" "nav nav"/, {atRule: /@container sw-platform \(max-width: 760px\)/}),
        'narrow compact workbench chrome must use a two-row header');
    assert.ok(declaresIn(finalSurfaceStyle, '.sw-home.sw-home--compact > .sw-platform-chrome .sw-platform-status', /display:\s*none/, {atRule: /@container sw-platform \(max-width: 760px\)/}),
        'narrow compact workbench chrome must hide the duplicate status badge');
});

test('compact workbench keeps shell chrome lightweight while preserving labeled actions (T-7279)', () => {
    assert.ok(declaresIn(finalSurfaceStyle, '.sw-home.sw-home--compact:not(.sw-home--mobile) > .sw-platform-chrome .sw-platform-context', /display:\s*none/, {topLevel: true}),
        'compact workbench must remove the duplicate context breadcrumb from the height budget');
    assert.ok(declaresIn(finalSurfaceStyle, '.sw-home.sw-home--compact:not(.sw-home--mobile) > .sw-platform-chrome .sw-platform-header', /min-height:\s*36px/, {topLevel: true}),
        'compact platform header must fit a 36px single row');
    assert.ok(declaresIn(finalSurfaceStyle, '.sw-home.sw-home--compact:not(.sw-home--mobile) .sw-home__bar .sw-home__refresh', /(?:^|\n)\s*width:\s*28px/, {topLevel: true}),
        'compact refresh action must collapse to an icon target');
    assert.ok(declaresIn(finalSurfaceStyle, '.sw-home.sw-home--compact:not(.sw-home--mobile) .sw-home__bar .sw-home__refresh > span', /display:\s*none/, {topLevel: true}),
        'compact refresh must hide its duplicate label while retaining its icon');
    assert.ok(declaresIn(finalSurfaceStyle, '.sw-home.sw-home--compact:not(.sw-home--mobile) .sw-home__bar .sw-home__add > span', /display:\s*none/, {topLevel: true}),
        'compact store must hide its duplicate label while retaining its icon');
    assert.ok(declaresIn(finalSurfaceStyle, '.sw-home.sw-home--compact:not(.sw-home--mobile) .sw-home__receipt', /min-height:\s*24px/, {topLevel: true}),
        'compact health receipt must stay a short status row');
    assert.ok(declaresIn(finalSurfaceStyle, '.sw-home.sw-home--compact:not(.sw-home--mobile) .sw__home-source-health:is(.is-fresh, .is-cached)', /font-size:\s*0/, {topLevel: true}),
        'compact normal source health must reduce to a status dot while stale keeps its text');
});

test('compact workbench decuples view and edit state while reducing shell chrome (T-7291)', () => {
    const secondPanelSource = readSourceText(path.join(root, 'src', 'second-panel-ui.ts'));
    assert.ok(secondPanelSource.includes('root.dataset.mode = editing ? "edit" : "view";'),
        'second panel must explicitly set dataset.mode for view/edit decoupling');
    assert.ok(secondPanelSource.includes('root.classList.toggle("is-editing", editing);'),
        'second panel must toggle is-editing class on the container');
    assert.ok(declaresIn(finalSurfaceStyle, '.sw-home.sw-home--compact:not(.sw-home--mobile):not(.is-editing) .sw-home__bar', /margin-bottom:\s*var\(--sw-space-2xs,\s*2px\)/, {topLevel: true}),
        'compact workbench must tighten bar margin in view mode to save vertical budget');
    assert.ok(declaresIn(finalSurfaceStyle, '.sw-home.sw-home--compact:not(.sw-home--mobile) .sw-home__receipt[data-state="ready"]', /border-top-color:\s*transparent/, {topLevel: true}),
        'compact receipt must reduce to a lightweight status row when all modules are ready');
    assert.ok(declaresIn(finalSurfaceStyle, '.sw-home.sw-home--compact:not(.sw-home--mobile) .sw-home__receipt[data-state="error"]', /border-top-color:/, {topLevel: true}),
        'compact receipt must retain prominent border when an error occurs');
});

test('compact workbench enforces mobile dual bento and GPU touch performance guardrails (T-7291)', () => {
    assert.ok(declaresIn(finalSurfaceStyle, '.sw-home.sw-home--mobile .sw-home__grid', /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)\s*!important/, {atRule: /@container sw-r54-surface \(max-width:\s*560px\)/}),
        'narrow container must override the legacy !important stack with a 2-column mobile dual bento grid');
    assert.ok(declaresIn(finalSurfaceStyle, '.sw-home.sw-home--mobile .sw-home__cell\[data-size="xs"\]', /grid-column:\s*span 1\s*!important/, {atRule: /@container sw-r54-surface \(max-width:\s*560px\)/}),
        'xs micro-tiles must pair up into a 2-column layout on mobile screens');
    assert.ok(declaresIn(finalSurfaceStyle, '.sw-home.sw-home--compact .sw-home__cell', /will-change:\s*transform/, {topLevel: true}),
        'compact cells must declare will-change transform for GPU composite layer isolation');
    assert.ok(declaresIn(finalSurfaceStyle, '.sw-home .sw-home__cell:active', /transform:\s*scale\(0\.985\)/, {atRule: /@media \(pointer:\s*coarse\)/}),
        'touch devices must receive zero-cpu hardware accelerated press feedback');
});

test('narrow unavailable workbench ghosts fill the diagnostic work area', () => {
    assert.ok(declaresIn(finalSurfaceStyle, '.sw-home__grid--unavailable .sw-home__cell--unavailable', /grid-column:\s*1\s*\/\s*-1\s*!important/, {atRule: /@container sw-r54-surface \(max-width:\s*560px\)/}),
        'narrow unavailable ghost cards must span the full diagnostic grid');
    assert.ok(declaresIn(finalSurfaceStyle, '.sw-home__grid--unavailable .sw-home__cell--unavailable', /width:\s*100%/, {atRule: /@container sw-r54-surface \(max-width:\s*560px\)/}),
        'narrow unavailable ghost cards must fill the work area width');
    assert.ok(declaresIn(finalSurfaceStyle, '.sw-home__grid--unavailable .sw-home__cell--unavailable', /min-width:\s*0/, {atRule: /@container sw-r54-surface \(max-width:\s*560px\)/}),
        'narrow unavailable ghost cards must remain shrinkable');
});

test('workbench content rows retain a visible keyboard focus ring', () => {
    assert.ok(declaresIn(uiPolishStyle, '.sw-home .sw-home__cell .sw__home-module-item-action:focus-visible', /outline:\s*2px solid var\(--sw-platform-accent,\s*var\(--b3-theme-primary\)\)/, {topLevel: true}),
        'workbench content rows must keep a visible focus ring in the final polish layer');
    assert.ok(declaresIn(uiPolishStyle, '.sw-home .sw-home__cell .sw__home-module-item-action:focus-visible', /outline-offset:\s*-2px/, {topLevel: true}),
        'focus ring must stay inside compact cards so overflow cannot clip it');
});
