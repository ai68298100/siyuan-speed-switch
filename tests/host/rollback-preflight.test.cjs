const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {isPackageVersion} = require('../../scripts/release-version-contract.cjs');

const root = path.resolve(__dirname, '..', '..');

test('release manifest schema and version metadata are internally consistent', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    const plugin = JSON.parse(fs.readFileSync(path.join(root, 'plugin.json'), 'utf8'));
    assert.equal(plugin.version, pkg.version);
    assert.match(plugin.minAppVersion, /^\d+\.\d+\.\d+$/);
    assert.ok(Array.isArray(plugin.backends));
    assert.ok(Array.isArray(plugin.frontends));
    assert.equal(typeof plugin.readme?.['zh-CN'], 'string');
});

test('rollback preflight requires a recoverable release reference', () => {
    const roadmap = fs.readFileSync(path.join(root, 'ROADMAP.md'), 'utf8');
    const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
    assert.match(roadmap, /回滚|rollback/i);
    assert.match(readme, /Releases|版本|package\.zip/i);
});

test('invalid version metadata is rejected before release', () => {
    for (const version of ['', 'dev', '1.2', '1.2.3-beta']) assert.equal(isPackageVersion(version), false);
    assert.equal(isPackageVersion('0.16.11'), true);
});
