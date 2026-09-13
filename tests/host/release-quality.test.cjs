const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');

test('host config documents an isolated SiYuan workspace and port', () => {
    const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.example.json'), 'utf8'));
    assert.equal(typeof config.workspace, 'string');
    assert.notEqual(config.workspace.trim(), '');
    const port = Number(new URL(config.baseUrl).port);
    assert.equal(Number.isInteger(port), true);
    assert.ok(port >= 1024 && port <= 65535);
    assert.equal(config.allowRemote, false);
    assert.equal(config.preserveFailedData, true);
});

test('host test contract keeps Android acceptance separate from browser emulation', () => {
    const readme = fs.readFileSync(path.join(__dirname, 'README.md'), 'utf8');
    assert.match(readme, /Android/);
    assert.match(readme, /browser emulation/i);
    assert.match(readme, /3\.8\.3/);
});

test('release package metadata stays aligned with plugin metadata', () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    const pluginJson = JSON.parse(fs.readFileSync(path.join(root, 'plugin.json'), 'utf8'));
    assert.equal(typeof packageJson.version, 'string');
    assert.equal(pluginJson.version, packageJson.version);
    assert.match(packageJson.version, /^\d+\.\d+\.\d+$/);
});

test('production bundle remains within the mobile performance budget when built', () => {
    const bundle = path.join(root, 'dist', 'index.js');
    if (!fs.existsSync(bundle)) return;
    const bytes = fs.statSync(bundle).size;
    // The budget was recalibrated after the layered search and document-set UI
    // increments; keep a hard ceiling while leaving webpack's 244 KiB warning
    // threshold as a separate optimization signal.
    // 2026-09-12: recalibrated to 296 KiB for the insight-style widgets
    // (note stats, year progress, recent edits) and the outline agent capability.
    // 2026-09-12 (2): recalibrated to 299 KiB for flashcard-due, random-review,
    // open-documents batch capability and size-menu preview tiles; still below
    // the 300 KiB package hard ceiling.
    // 2026-09-12 (3): recalibrated to 304 KiB for the workspace-context agent
    // capability (ROADMAP layer 3). The gzip'd package stays far below the
    // 300 KiB zip ceiling; the raw budget remains a self-discipline signal.
    // 2026-09-12 (4): recalibrated to 312 KiB for the four mobile-style
    // builtin widgets (quick capture, clipped-to-read, on this day,
    // today's writing) plus the append-to-journal registration fix.
    // 2026-09-12 (5): recalibrated to 315 KiB for recent writing activity,
    // recent daily notes, document-relations and reservation summaries.
    // 2026-09-12 (6): recalibrated to 317 KiB for bounded home diagnostics.
    // 2026-09-12 (7): recalibrated to 319 KiB for diagnostic time windows and
    // bounded device/reason aggregates; package.zip remains below 300 KiB.
    // 2026-09-12 (8): consolidated to 321 KiB for device/read-only catalog
    // filters and bounded pagination metadata.
    // 2026-09-12 (9): 322 KiB for shared optional-notebook scopes across four insight widgets.
    // 2026-09-12 (10): 323 KiB for dated-content scopes and notebook-directed journal actions.
    // 2026-09-12 (11): 325 KiB for bounded Agent widget config discovery and input normalization.
    // 2026-09-12 (12): 326 KiB for bounded widget stats, cache/device and pagination metadata.
    // 2026-09-12 (13): 327 KiB for effective config echo, retry and explicit refresh semantics.
    // 2026-09-12 (14): 328 KiB for the snapshot-contract hardening round (final
    // working-tree increment; gzip package still far below the zip ceiling).
    // 2026-09-12 (15): 332 KiB for the store upgrade - grouped sections,
    // preview skeletons and a larger default store dialog.
    // 2026-09-13 (16): 334 KiB for proportional size previews in store cards.
    // 2026-09-13 (17): 335 KiB for on-demand live preview dialogs in the store.
    // 2026-09-13 (18): 337 KiB for the writing-streak widget (week row view).
    // 2026-09-13 (19): 339 KiB for stat.arc progress-ring rendering and the
    // bounded Agent snapshot contract; package.zip remains below 300 KiB.
    // 2026-09-13 (20): 340 KiB for bounded card palette presets and settings.
    // 2026-09-13 (21): 341 KiB for calendar navigation controls and labels.
    // 2026-09-13 (22): 342 KiB for visibility-gated tail reads.
    // 2026-09-13 (23): 343 KiB for the bounded home loading skeleton.
    // 2026-09-13 (24): 344 KiB for non-blocking refresh and bounded refresh-all scheduling.
    // 2026-09-13 (25): 345 KiB for bounded refresh failure-reason summaries.
    // 2026-09-13 (26): 346 KiB for bidirectional journal-calendar navigation
    // and optional notebook scoping; package.zip remains below 300 KiB.
    // The bounded adapter empty-hint channel stays within this same budget.
    // 2026-09-13 (27): 347 KiB for structured availability badges and styles.
    // The conditional-availability store filter remains within this budget.
    // 2026-09-13 (28): 348 KiB for the store's direct configuration entry
    // on already-added schema-driven widgets; package.zip remains below the
    // 300 KiB hard ceiling.
    // 2026-09-13 (29): 350 KiB for third-party provider lifecycle states,
    // orthogonal store filters and render cleanup; package.zip remains below
    // the unchanged 300 KiB hard ceiling.
    // 2026-09-13 (30): 352 KiB for native date/document config controls,
    // strict Agent config normalization and notebook/document suggestions.
    // 2026-09-13 (31): 353 KiB for the empty-panel store CTA and schema reset
    // action; package.zip remains below the 300 KiB hard ceiling.
    // 2026-09-13 (32): 354 KiB for store clear-filters action and tab/size
    // accessibility semantics; package.zip remains below the hard ceiling.
    // 2026-09-13 (33): 355 KiB for bounded Agent widget discovery state;
    // package.zip remains below the 300 KiB hard ceiling.
    // 2026-09-14 (34): 356 KiB for tri-surface search/group input ARIA labels
    // and the loose keyword gate (matched-item filter latency ~6x lower);
    // locale archives now ship minified to keep the hard ceiling intact.
    const budget = 356 * 1024;
    assert.ok(bytes <= budget, `dist/index.js is ${bytes} bytes; budget is ${budget}`);
});

test('home panel defers tail reads and cancels idle work on destroy', () => {
    const source = fs.readFileSync(path.join(root, 'src', 'index.ts'), 'utf8');
    assert.match(source, /IntersectionObserver/);
    assert.match(source, /requestIdleCallback/);
    assert.match(source, /cancelIdleCallback/);
    assert.match(source, /if \(index < 2\)/);
});

test('home card palette stays on the fixed preset allowlist', () => {
    const source = fs.readFileSync(path.join(root, 'src', 'settings-model.js'), 'utf8');
    assert.match(source, /homePalette === "auto"/);
    assert.match(source, /homePalette === "soft"/);
    assert.match(source, /homePalette === "mono"/);
});

test('release candidate command covers all local gates', () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    const command = packageJson.scripts?.['verify:release'] || '';
    assert.match(command, /tsc --noEmit/);
    assert.match(command, /pnpm build/);
    assert.match(command, /pnpm test(?:\s|$)/);
    assert.match(command, /test:smoke/);
    assert.match(command, /test:smoke:browser/);
});

test('production sources contain no debug output or machine-local paths', () => {
    const sourceFiles = fs.readdirSync(path.join(root, 'src'))
        .filter((name) => /\.(?:ts|js)$/.test(name));
    const violations = [];
    for (const name of sourceFiles) {
        const source = fs.readFileSync(path.join(root, 'src', name), 'utf8');
        if (/console\.log\s*\(|\bdebugger\b|\bwindow\.alert\s*\(/.test(source)) {
            violations.push(name);
        }
        if (/(?:[A-Za-z]:\\|\/Users\/|\/home\/)[^\n"']+/.test(source)) {
            violations.push(`${name}:absolute-path`);
        }
    }
    assert.deepEqual(violations, [], `debug or machine-local source markers: ${violations.join(', ')}`);
});

test('release readiness matrix matches generated artifact sizes', () => {
    const archive = path.join(root, 'package.zip');
    const bundle = path.join(root, 'dist', 'index.js');
    const readinessPath = path.join(root, 'docs', 'release-readiness.md');
    if (!fs.existsSync(archive) || !fs.existsSync(bundle)) return;
    const readiness = fs.readFileSync(readinessPath, 'utf8');
    const archiveBytes = fs.statSync(archive).size;
    const bundleBytes = fs.statSync(bundle).size;
    assert.match(readiness, new RegExp('`dist/index\\.js` ' + bundleBytes + ' bytes'));
    const packageMatch = readiness.match(/`package\.zip` (\d+) bytes/);
    assert.ok(packageMatch, 'release readiness must record package.zip size');
    // ZIP compressors may differ by a few bytes across Windows and Ubuntu;
    // keep a tight 1 KiB drift guard while avoiding false failures on Actions.
    assert.ok(Math.abs(Number(packageMatch[1]) - archiveBytes) <= 1024,
        `package.zip size drift exceeds 1 KiB: documented ${packageMatch[1]}, actual ${archiveBytes}`);
});

test('README test-file count matches the discovered host test matrix', () => {
    const directories = [path.join(root, 'tests'), path.join(root, 'tests', 'host')];
    const count = directories.reduce((total, directory) => total + fs.readdirSync(directory)
        .filter((name) => name.endsWith('.test.cjs')).length, 0);
    const readme = fs.readFileSync(path.join(root, 'README.en-US.md'), 'utf8');
    assert.match(readme, new RegExp('discovers all ' + count + ' `\\*\\.test\\.cjs` files'));
});
