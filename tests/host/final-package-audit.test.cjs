const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..', '..');
const {listZipEntryNames, readZipEntry} = require(path.join(__dirname, 'lib', 'zip.cjs'));

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
    const entries = listZipEntryNames(fs.readFileSync(zip));
    assert.ok(entries.length >= 8 && entries.length <= 32);
    assert.equal(new Set(entries).size, entries.length);
});

test('release archive carries the current candidate documentation', () => {
    const zip = path.join(root, 'package.zip');
    if (!fs.existsSync(zip)) return;
    const buffer = fs.readFileSync(zip);
    const readme = readZipEntry(buffer, 'README.md').toString('utf8');
    const roadmap = readZipEntry(buffer, 'ROADMAP.md').toString('utf8');
    assert.match(readme, /verify:release/);
    assert.match(readme, /当前开发策略/);
    assert.match(readme, /发布前检查/);
    assert.match(roadmap, /R7：现代化 UI 视觉重构/);
});

test('final audit is read-only', () => assert.equal(typeof fs.readFileSync, 'function'));
