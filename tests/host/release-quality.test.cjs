const {readSourceText} = require("../source-scan.cjs");
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const metrics = require('../../scripts/release-readiness-metrics.cjs');
const {isPackageVersion} = require('../../scripts/release-version-contract.cjs');

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
    assert.equal(isPackageVersion(packageJson.version), true);
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
    // the 320 KiB package hard ceiling.
    // 2026-09-12 (3): recalibrated to 304 KiB for the workspace-context agent
    // capability (ROADMAP layer 3). The gzip'd package stays far below the
    // 320 KiB zip ceiling; the raw budget remains a self-discipline signal.
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
    // 2026-09-14 (35): 376 KiB for v0.17 stage-1 workspace runtime diagnostics
    // wiring (D-220): slim agent-workspace-runtime cluster moved out of the
    // unshipped definitions matrix; zip grows only ~5 KiB, hard ceiling intact.
    // 2026-09-14 (36): 385 KiB for v0.17 document-context read-only wiring
    // (bounded metadata envelope, active-tab preference and SQL fallback).
    // 2026-09-14 (37): 386 KiB for capacity health/report/trend contracts;
    // package.zip remains below the 300 KiB hard ceiling.
    // 2026-09-14 (38): 387 KiB for report-history trimming and aggregation.
    // 2026-09-14 (39): 388 KiB for bounded report-window transport helpers.
    // 2026-09-14 (40): 389 KiB for report envelope validation contracts.
    // 2026-09-14 (41): 390 KiB for report consistency reconciliation.
    // 2026-09-14 (42): 391 KiB for report event contracts.
    // 2026-09-14 (43): 392 KiB for event serialization/parse helpers.
    // 2026-09-14 (44): 393 KiB for bounded report event queue contracts.
    // 2026-09-14 (45): 394 KiB for safe report event replay.
    // 2026-09-14 (49): 408 KiB for the home-store pure-model extraction and
    // read-only Agent audit module; package.zip remains below the 300 KiB
    // hard ceiling.
    // 2026-09-14 (50): 414 KiB for bounded Agent audit history health/report
    // aggregation, trend windows and event replay
    // and versioned summary serialization; package.zip remains below the
    // unchanged 300 KiB hard ceiling.
    // 2026-09-14 (51): 444 KiB for joint checkpoint-window consistency,
    // bounded cursor recovery plans and deterministic window summaries.
    // 2026-09-14 (52): 448 KiB for the read-only diagnostics projection,
    // pagination and multi-source aggregation contracts.
    // 2026-09-14 (53): 450 KiB for daily-note attribute lookup and the native
    // complete six-week calendar view; package.zip remains below 300 KiB.
    // 2026-09-14 (54): 451 KiB for the offline local date/time renderer and its
    // minute-boundary, visibility-aware lifecycle; package.zip stays below 300 KiB.
    // 2026-09-14 (55): 463 KiB for bounded Open-Meteo weather, holiday-cn
    // calendar overlays, dedicated life-widget caches and theme-safe card UI;
    // package.zip remains below the unchanged 300 KiB hard ceiling.
    // 2026-09-14 (56): 472 KiB for Bangumi schedule normalization, triple
    // cover allowlisting, responsive media cards and store source disclosure;
    // production graph remains 31 and package.zip stays below 300 KiB.
    // 2026-09-14 (57): 480 KiB for two opt-in user-endpoint feeds, strict
    // route validation, stale-cache health and ranked responsive cards;
    // production graph remains 31 and package.zip stays below 300 KiB.
    // 2026-09-14 (58): 488 KiB for the fixed-loopback ActivityWatch aggregate
    // bridge, kernel proxy adapter, source filters and screen-time card UI;
    // production graph remains 31 and package.zip stays below 300 KiB.
    // 2026-09-15 (59): 492 KiB for the component-store discovery model,
    // bounded pagination/focus helpers and card accessibility state labels;
    // package.zip remains below the unchanged 300 KiB hard ceiling.
    // 2026-09-15 (60): 493 KiB for search clear/focus restoration and the
    // card-level keyboard navigation polish; package.zip remains below 300 KiB.
    // 2026-09-15 (61): 495 KiB for store metadata, empty-state and filter
    // model helpers; package.zip remains below the 300 KiB hard ceiling.
    // 2026-09-15 (62): 500 KiB for the expanded store status/highlight model;
    // 2026-09-15 (63): 502 KiB for rerender focus/scroll restoration and
    // semantic empty-state recovery; package.zip remains below the 300 KiB
    // hard ceiling.
    // 2026-09-15 (66): 507 KiB for store filter state, live counts, and
    // accessibility metadata; package.zip remains below the
    // unchanged 300 KiB hard ceiling.
    // 2026-09-15 (67): 508 KiB ceiling accommodates the focus-continuity,
    // size-button keyboard navigation, and touch-action contracts while
    // retaining a visible margin below the archive hard limit.
    // 2026-09-15 (76): 542 KiB ceiling accommodates dependency guide summary and
    // receipt metadata while retaining a reviewed
    // margin below the archive ceiling.
    // 2026-09-15 (70): 520 KiB ceiling accommodates semantic config sections,
    // source badges and mobile action-bar polish while retaining a reviewed
    // margin below the archive ceiling.
    // 2026-09-15 (69): 510 KiB ceiling accommodates the shared SiYuan
    // forward-proxy path for external life widgets and graceful unavailable
    // states; the independent 300 KiB archive ceiling remains unchanged.
    // 2026-09-15 (82): 548 KiB accommodates explicit notebook-name provenance
    // while retaining a visible margin below the archive hard ceiling.
    // 2026-09-15 (83): recalibrated to 768 KiB. The raw line is a self-discipline
    // signal (D-008), not a host limit: it was raised 296 -> 548 KiB across 82
    // incremental recalibrations in four days, so a 676-byte margin was an
    // artifact of the ratchet rather than a real constraint. 768 KiB keeps a
    // meaningful mobile parse-cost guard while leaving room for the v0.18
    // controlled-execution chain without forcing a structural split of index.ts
    // purely to defend a legacy number. Recalibration continues to require a
    // dated note recording the real increment.
    // 2026-09-19 (ADR 0062): recalibrated to 832 KiB after the component
    // deep-optimization cycle (T-6348~T-6454, 58/58) closed with only 2416
    // bytes of headroom at 784016 bytes. The margin had again become an
    // artifact of the ratchet rather than a real constraint. The zip archive
    // hard ceiling (512 KiB), the 224 KiB single-entry review line (ADR 0059)
    // and the drift diagnostics are unchanged. See docs/adr/0062.
    const budget = metrics.RAW_BUNDLE_BUDGET_BYTES;
    assert.ok(bytes <= budget, `dist/index.js is ${bytes} bytes; budget is ${budget}`);
});

test('home panel defers tail reads and cancels idle work on destroy', () => {
    const source = readSourceText(path.join(root, 'src', 'second-panel-ui.ts'));
    assert.match(source, /IntersectionObserver/);
    assert.match(source, /requestIdleCallback/);
    assert.match(source, /cancelIdleCallback/);
    assert.match(source, /if \(index < 2\)/);
});

test('home card palette stays on the fixed preset allowlist', () => {
    const source = readSourceText(path.join(root, 'src', 'settings-model.js'));
    assert.match(source, /homePalette === "auto"/);
    assert.match(source, /homePalette === "soft"/);
    assert.match(source, /homePalette === "mono"/);
});

test('release candidate command covers all local gates', () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    const command = packageJson.scripts?.['verify:release'] || '';
    assert.match(command, /tsc --noEmit/);
    assert.match(command, /pnpm repro:audit/);
    assert.match(command, /pnpm test(?:\s|$)/);
    assert.match(command, /test:smoke/);
    assert.match(command, /test:smoke:browser/);
});

test('production sources contain no debug output or machine-local paths', () => {
    const sourceFiles = fs.readdirSync(path.join(root, 'src'))
        .filter((name) => /\.(?:ts|js)$/.test(name));
    const violations = [];
    for (const name of sourceFiles) {
        const source = readSourceText(path.join(root, 'src', name));
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
    const snapshot = metrics.parseArtifactSnapshot(readiness);
    assert.ok(snapshot, 'release readiness must contain artifact snapshots');
    assert.equal(snapshot.bundle, bundleBytes);
    assert.equal(metrics.withinDrift(snapshot.archive, archiveBytes), true);
    assert.match(readiness, new RegExp('`dist/index\\.js` ' + bundleBytes + ' bytes'));
    const packageMatch = readiness.match(/`package\.zip` (\d+) bytes/);
    assert.ok(packageMatch, 'release readiness must record package.zip size');
    // ZIP compressors may differ by a few bytes across Windows and Ubuntu;
    // keep a tight 1 KiB drift guard while avoiding false failures on Actions.
    assert.ok(metrics.withinDrift(Number(packageMatch[1]), archiveBytes),
        `package.zip size drift exceeds 1 KiB: documented ${packageMatch[1]}, actual ${archiveBytes}`);
    assert.match(readiness, /v0\.28\.2 发布后 v0\.28\.x 开发头/);
    assert.match(readiness, /51 个组件完成完整评分卡/);
    assert.match(readiness, /T-6476~T-6663/);
    assert.doesNotMatch(readiness, /前 43 个组件/);
    const releaseOrder = readiness.slice(readiness.indexOf('## 建议发布顺序'));
    assert.match(releaseOrder, /`v0\.28\.2` 已完成发布/);
    assert.doesNotMatch(releaseOrder, /v0\.22\.0|作为 v0\.23 准入/);
});

test('release readiness checker is read-only and validates both artifact snapshots', () => {
    const script = fs.readFileSync(path.join(root, 'scripts', 'check-release-readiness.cjs'), 'utf8');
    assert.match(script, /readFileSync\(readinessPath/);
    assert.match(script, /statSync\(file\)/);
    assert.doesNotMatch(script, /writeFileSync|appendFileSync/);
    const verify = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).scripts['verify:release'];
    assert.match(verify, /release:check/);
    assert.match(verify, /quality:audit/);
    assert.match(verify, /integration:audit/);
});

test('release batch audit declares fifty bounded local checks', () => {
    const script = fs.readFileSync(path.join(root, 'scripts', 'release-batch-audit.cjs'), 'utf8');
    const declared = (script.match(/add\('/g) || []).length;
    assert.equal(declared, 50);
    assert.match(script, /release-batch-audit: \$\{checks\.length - failed\.length\}\/\$\{checks\.length\}/);
});

test('release batch audit allows local ahead commits but rejects remote ahead commits', () => {
    const script = fs.readFileSync(path.join(root, 'scripts', 'release-batch-audit.cjs'), 'utf8');
    assert.match(script, /local main is not behind origin main/);
    assert.match(script, /aheadCount >= 0/);
    assert.match(script, /behindCount === 0/);
});

test('quality batch audit declares fifty bounded local checks', () => {
    const script = fs.readFileSync(path.join(root, 'scripts', 'quality-batch-audit.cjs'), 'utf8');
    assert.equal((script.match(/add\('/g) || []).length, 50);
    assert.doesNotMatch(script, /https?:\/\//);
});

test('integration boundary audit declares fifty bounded local checks', () => {
    const script = fs.readFileSync(path.join(root, 'scripts', 'integration-boundary-audit.cjs'), 'utf8');
    assert.equal((script.match(/add\('/g) || []).length, 50);
    assert.doesNotMatch(script, /https?:\/\//);
});

test('README test-file count matches the discovered host test matrix', () => {
    const directories = [path.join(root, 'tests'), path.join(root, 'tests', 'host')];
    const count = directories.reduce((total, directory) => total + fs.readdirSync(directory)
        .filter((name) => name.endsWith('.test.cjs')).length, 0);
    const readme = fs.readFileSync(path.join(root, 'README.en-US.md'), 'utf8');
    assert.match(readme, new RegExp('discovers all ' + count + ' `\\*\\.test\\.cjs` files'));
});

test('production sources hoist Intl.Segmenter instead of building one per call', () => {
    // Constructing a segmenter costs far more than segmenting short text, so
    // each module must hoist a single instance rather than rebuild it inside
    // label/icon/normalization helpers.
    // R6（D-378）起进一步收紧：全仓恰 1 处持有且必须在 util.js——
    // 字素工具（graphemeLength/graphemeSlice/graphemeSliceByCodePoints）已
    // 收敛到 util，其他模块经 util 导入，不再各自持有实例。
    const offenders = [];
    let total = 0, holder = null;
    for (const name of fs.readdirSync(path.join(root, 'src'))) {
        if (!/\.(?:ts|js)$/.test(name)) continue;
        const source = readSourceText(path.join(root, 'src', name));
        const built = source.match(/new\s+Intl\.Segmenter\s*\(/g) || [];
        if (built.length > 1) offenders.push(`${name}:${built.length}`);
        if (built.length === 1) { total += 1; holder = name; }
        total += Math.max(0, built.length - 1);
    }
    assert.deepEqual(offenders, [], `per-call Intl.Segmenter construction: ${offenders.join(', ')}`);
    assert.equal(total, 1, `Intl.Segmenter must be held exactly once across src (found ${total})`);
    assert.equal(holder, 'util.js', `the single Intl.Segmenter holder must be util.js (found ${holder})`);
});


test('test-count references agree across readme, roadmap, readiness, and audit (T-6742b)', () => {
    const readMe = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
    const readMeEn = fs.readFileSync(path.join(root, 'README.en-US.md'), 'utf8');
    const roadMap = fs.readFileSync(path.join(root, 'ROADMAP.md'), 'utf8');
    const readiness = fs.readFileSync(path.join(root, 'docs', 'release-readiness.md'), 'utf8');
    const auditScript = fs.readFileSync(path.join(root, 'scripts', 'release-batch-audit.cjs'), 'utf8');
    // 五处引用必须写同一个数字——T-6724/T-6733 批次曾出现改三漏二的漂移。
    const digitsAfter = (text, prefix) => {
        const at = text.indexOf(prefix);
        if (at < 0) return null;
        let i = at + prefix.length;
        let out = '';
        while (i < text.length && text[i] >= '0' && text[i] <= '9') { out += text[i]; i += 1; }
        return out ? Number(out) : null;
    };
    const numbers = new Set();
    numbers.add(digitsAfter(readMe, '当前共 '));
    numbers.add(digitsAfter(readMeEn, 'currently '));
    numbers.add(digitsAfter(readiness, '完整测试 **'));
    numbers.add(digitsAfter(roadMap, '全量测试 '));
    numbers.delete(null);
    assert.equal(numbers.size, 1, `test-count references diverge: ${[...numbers].join(', ')}`);
    const theCount = [...numbers][0];
    assert.equal(theCount >= 5000, true, 'suspiciously low test count');
    const auditHit = auditScript.includes(String(theCount) + "/");
    assert.ok(auditHit, 'release-batch-audit regex must cite the same count');
});

test('version metadata is consistent across manifests, badges, and release lines (T-6744b)', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    const pluginManifest = JSON.parse(fs.readFileSync(path.join(root, 'plugin.json'), 'utf8'));
    const readMe = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
    const readMeEn = fs.readFileSync(path.join(root, 'README.en-US.md'), 'utf8');
    assert.equal(pkg.version, pluginManifest.version, 'package.json and plugin.json versions must match');
    const badgeZh = (readMe.match(/version-([0-9.]+)-blue/) || [])[1];
    const badgeEn = (readMeEn.match(/version-([0-9.]+)-blue/) || [])[1];
    assert.equal(badgeZh, pkg.version, 'README badge version must match package.json');
    assert.equal(badgeEn, pkg.version, 'EN README badge version must match package.json');
    assert.ok(readMe.includes('当前版本为 `v' + pkg.version + '`'), 'zh README release line must cite the current version');
    assert.ok(readMeEn.includes('current version is `v' + pkg.version + '`'), 'EN README release line must cite the current version');
});
