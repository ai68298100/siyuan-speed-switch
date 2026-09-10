const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {listZipEntryNames} = require(path.join(__dirname, 'lib', 'zip.cjs'));

const root = path.resolve(__dirname, '..', '..');

function filesInZip(zipPath) {
    return listZipEntryNames(fs.readFileSync(zipPath));
}

test('package.zip, when present, contains only release files', () => {
    const zip = path.join(root, 'package.zip');
    if (!fs.existsSync(zip)) {
        if (process.env.SW_REQUIRE_PACKAGE === '1') {
            assert.fail('package.zip is required for the release archive gate');
        }
        return;
    }
    const bytes = fs.statSync(zip).size;
    assert.ok(bytes <= 300 * 1024, `package.zip is ${bytes} bytes; budget is 307200`);
    const allowed = /^(index\.js|index\.css|icon\.png|preview\.png|README(?:\.en-US)?\.md|ROADMAP\.md|plugin\.json|i18n\/(?:en|zh-CN)\.json|docs\/(?:architecture|interface-map)\.svg)$/;
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
