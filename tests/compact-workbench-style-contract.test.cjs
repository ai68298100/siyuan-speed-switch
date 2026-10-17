const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {readSourceText} = require('./source-scan.cjs');
const {declaresIn, findRules} = require('./css-block-scan.cjs');

const root = path.join(__dirname, '..');
const finalSurfaceStyle = readSourceText(path.join(root, 'src', 'styles', '_12-r54-surface-adapter.scss'));
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
    assert.ok(declaresIn(finalSurfaceStyle, '.sw-home__grid', /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/, {atRule: /@container sw-r54-surface \(max-width:\s*560px\)/}),
        'narrow container must use a 2-column mobile dual bento grid instead of full row stacking');
    assert.ok(declaresIn(finalSurfaceStyle, '.sw-home__cell\[data-size="xs"\]', /grid-column:\s*span 1/, {atRule: /@container sw-r54-surface \(max-width:\s*560px\)/}),
        'xs micro-tiles must pair up into a 2-column layout on mobile screens');
    assert.ok(declaresIn(finalSurfaceStyle, '.sw-home.sw-home--compact .sw-home__cell', /will-change:\s*transform/, {topLevel: true}),
        'compact cells must declare will-change transform for GPU composite layer isolation');
    assert.ok(declaresIn(finalSurfaceStyle, '.sw-home .sw-home__cell:active', /transform:\s*scale\(0\.985\)/, {atRule: /@media \(pointer:\s*coarse\)/}),
        'touch devices must receive zero-cpu hardware accelerated press feedback');
});

test('platform surfaces receive progressive sensory polish without losing legacy functions (T-7291)', () => {
    const polishStyle = readSourceText(path.join(root, 'src', 'styles', '_11-ui-polish.scss'));
    const storeStyle = readSourceText(path.join(root, 'src', 'styles', '_06-widgets-store.scss'));
    const sidebarStyle = readSourceText(path.join(root, 'src', 'styles', '_07-sidebar-panel-store.scss'));

    assert.ok(declaresIn(polishStyle, '.speed-switch .sw__card', /box-shadow:\s*var\(--sw-rim-light,\s*none\)/),
        'first panel switcher cards must consume sw-rim-light without breaking legacy DOM');
    assert.ok(declaresIn(storeStyle, '.sw-home-store__card', /box-shadow:\s*var\(--sw-rim-light,\s*none\)/, {topLevel: true}),
        'widget store cards must consume sw-rim-light for gallery tactile polish');
    assert.ok(declaresIn(sidebarStyle, '.sw__home-progress .sw__home-progress-fill::after', /animation:\s*sw-progress-shimmer\s*2\.8s\s*infinite/),
        'progress fill must carry futuristic shimmer ray micro-animation');
});

test('compact core widgets enforce decoupled glance headers and monospace figures (T-7144)', () => {
    assert.ok(declaresIn(finalSurfaceStyle, '.sw-home.sw-home--compact:not(.sw-home--mobile) .sw-home__cell[data-module-id="external-local-time"]:not(.is-editing) .sw__home-module-header .sw__home-module-title', /display:\s*none/),
        'local time widget in view mode must hide redundant title for content-first glance layout');
    assert.ok(declaresIn(finalSurfaceStyle, '.sw-home.sw-home--compact:not(.sw-home--mobile) .sw-home__cell[data-module-id="external-local-time"] .sw__home-stat .sw__home-stat-value', /font-variant-numeric:\s*tabular-nums/),
        'local time digits must declare tabular-nums for zero layout jitter');
    assert.ok(declaresIn(finalSurfaceStyle, '.sw-home.sw-home--compact:not(.sw-home--mobile) .sw-home__cell[data-module-id="external-weather-open-meteo"] .sw__home-stat-value', /font-variant-numeric:\s*tabular-nums/),
        'weather temperature must declare tabular-nums for precision layout');
});

test('all platform surfaces declare consistent 1px crystalline rim-light and tactile bevels (T-7144)', () => {
    const polishStyle = readSourceText(path.join(root, 'src', 'styles', '_11-ui-polish.scss'));
    const studioStyle = readSourceText(path.join(root, 'src', 'styles', '_snippet-studio.scss'));
    const storeStyle = readSourceText(path.join(root, 'src', 'styles', '_06-widgets-store.scss'));

    assert.ok(declaresIn(polishStyle, '.sw-home .sw-home__cell:hover', /box-shadow:\s*var\(--sw-rim-light,\s*none\),\s*var\(--sw-polish-shadow-card\)/),
        'workbench cells on hover must retain crystalline rim light alongside card shadow');
    assert.ok(declaresIn(polishStyle, '.speed-switch .sw__doc-preview', /box-shadow:\s*var\(--sw-rim-light,\s*none\),\s*var\(--sw-polish-shadow-card\)/),
        'switcher preview pane must declare crystalline rim light');
    assert.ok(declaresIn(studioStyle, '.sw-studio__preview-section', /box-shadow:\s*var\(--sw-rim-light,\s*none\),\s*var\(--studio-shadow-card\)/),
        'studio preview section must declare crystalline rim light');
    assert.ok(declaresIn(polishStyle, '.speed-switch .sw__search-wrap .sw__search:focus', /box-shadow:\s*0\s*0\s*0\s*1px\s*var\(--b3-theme-background\),\s*var\(--sw-focus-glow/),
        'switcher search bar focus must trigger dual-layer glow ring');
    assert.ok(declaresIn(storeStyle, '.sw-home-store__size', /font-variant-numeric:\s*tabular-nums/),
        'store size pills must declare tabular-nums for industrial capsule layout');
    assert.ok(declaresIn(polishStyle, '.sw-studio .sw-studio__editor-frame .sw-studio__line-numbers', /font-variant-numeric:\s*tabular-nums/),
        'studio line numbers must declare tabular-nums for monospace alignment');
});
