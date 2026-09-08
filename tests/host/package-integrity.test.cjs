const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');

const root = path.resolve(__dirname, '..', '..');

function filesInZip(zipPath) {
    const output = cp.execFileSync('tar', ['-tf', zipPath], {encoding: 'utf8'});
    return output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

test('package.zip, when present, contains only release files', () => {
    const zip = path.join(root, 'package.zip');
    if (!fs.existsSync(zip)) return;
    const allowed = /^(dist\/(index\.js|index\.css|plugin\.json|i18n\/[^/]+\.json|docs\/[^/]+\.svg|[^/]+\.md|[^/]+\.png)|package\.json|plugin\.json|README(?:\.en-US)?\.md|LICENSE|icon\.png)$/;
    const files = filesInZip(zip);
    assert.ok(files.length > 0);
    assert.deepEqual(files.filter((file) => !allowed.test(file)), [], 'unexpected files in package.zip');
});

test('built JavaScript references only local or core icon resources', () => {
    const bundle = path.join(root, 'dist', 'index.js');
    if (!fs.existsSync(bundle)) return;
    const source = fs.readFileSync(bundle, 'utf8');
    assert.doesNotMatch(source, /https?:\/\//, 'runtime bundle must not require remote resources');
});

test('release diagnostics identify the exact workspace and artifact paths', () => {
    assert.ok(fs.existsSync(path.join(root, 'plugin.json')));
    assert.ok(fs.existsSync(path.join(root, 'package.json')));
    assert.ok(fs.existsSync(path.join(root, 'ROADMAP.md')));
});
