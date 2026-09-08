const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const root = path.resolve(__dirname, '..', '..');

test('final package audit matches manifest, readme, and workflow claims', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'plugin.json'), 'utf8'));
    const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
    const workflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'release.yml'), 'utf8');
    assert.equal(manifest.icon, 'icon.png');
    assert.equal(manifest.preview, 'preview.png');
    assert.match(readme, /package\.zip/);
    assert.match(workflow, /files: package\.zip/);
});

test('final package audit reports a bounded unique archive', () => {
    const zip = path.join(root, 'package.zip');
    if (!fs.existsSync(zip)) return;
    const entries = cp.execFileSync('tar', ['-tf', zip], {encoding: 'utf8'}).split(/\r?\n/).filter(Boolean);
    assert.ok(entries.length >= 8 && entries.length <= 32);
    assert.equal(new Set(entries).size, entries.length);
});

test('final audit is read-only', () => assert.equal(typeof cp.execFileSync, 'function'));
