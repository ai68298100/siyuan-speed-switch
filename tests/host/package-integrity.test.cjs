const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {listZipEntryNames} = require(path.join(__dirname, 'lib', 'zip.cjs'));
const {ARCHIVE_BUDGET_BYTES, headroom} = require('../../scripts/release-readiness-metrics.cjs');

const root = path.resolve(__dirname, '..', '..');

function filesInZip(zipPath) {
    return listZipEntryNames(fs.readFileSync(zipPath));
}

test('package.zip, when present, contains only release files', (t) => {
    const zip = path.join(root, 'package.zip');
    if (!fs.existsSync(zip)) {
        if (process.env.SW_REQUIRE_PACKAGE === '1') {
            assert.fail('package.zip is required for the release archive gate');
        }
        return;
    }
    const bytes = fs.statSync(zip).size;
    // Reviewed release ceiling: 512 KiB. SiYuan imposes no size limit on
    // package.zip (plugin-sample only caps icon.png at 20 KB and preview.png at
    // 200 KB) and GitHub Release assets allow 2 GB. The earlier 300 KiB and
    // 320 KiB figures were self-imposed and predated the semantic home-config
    // and store surfaces. Raised 2026-09-15 so the v0.18 controlled-execution
    // chain has room without another content-trimming decision. The allowlist,
    // metadata, duplicate-entry and remote-dependency gates are unchanged;
    // only the byte ceiling moves.
    const budget = ARCHIVE_BUDGET_BYTES;
    const remaining = headroom(budget, bytes);
    if (remaining >= 0 && remaining < 1024) {
        t.diagnostic(`package.zip headroom is only ${remaining} bytes; keep future UI changes within the hard budget`);
    }
    assert.ok(bytes <= budget, `package.zip is ${bytes} bytes; budget is ${budget}; headroom is ${remaining} bytes`);
    // D-219: ROADMAP.md left the release archive (repo-only dev doc);
    // re-adding it must go through a new budget decision.
    const allowed = /^(index\.js|index\.css|icon\.png|preview\.png|README(?:\.en-US)?\.md|plugin\.json|i18n\/(?:en|zh-CN)\.json|docs\/(?:architecture|interface-map)\.svg|docs\/(?:component-store-guide|agent-document-context-m2)\.md)$/;
    const files = filesInZip(zip);
    assert.ok(files.length > 0);
    assert.equal(new Set(files).size, files.length, 'package.zip must not contain duplicate entries');
    assert.equal(files.some((file) => file.startsWith('/') || /^[A-Za-z]:/.test(file)), false,
        'package.zip entries must be relative paths');
    assert.deepEqual(files.filter((file) => !allowed.test(file)), [], 'unexpected files in package.zip');
});

test('built JavaScript references only local or core icon resources', () => {
    const bundle = path.join(root, 'dist', 'index.js');
    if (!fs.existsSync(bundle)) return;
    const source = fs.readFileSync(bundle, 'utf8');
    const runtime = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    assert.doesNotMatch(runtime, /https?:\/\//, 'runtime code must not require remote resources');
});

test('release diagnostics identify the exact workspace and artifact paths', () => {
    assert.ok(fs.existsSync(path.join(root, 'plugin.json')));
    assert.ok(fs.existsSync(path.join(root, 'package.json')));
    assert.ok(fs.existsSync(path.join(root, 'ROADMAP.md')));
});
