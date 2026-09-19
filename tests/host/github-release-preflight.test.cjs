const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
    isPackageVersion,
    tagForVersion,
    validateReleaseMetadata,
} = require('../../scripts/release-version-contract.cjs');

const root = path.resolve(__dirname, '..', '..');

test('GitHub release workflow has a safe tag/version preflight', () => {
    const workflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'release.yml'), 'utf8');
    assert.match(workflow, /release-version-preflight\.cjs/);
    const preflight = fs.readFileSync(path.join(root, 'scripts', 'release-version-preflight.cjs'), 'utf8');
    assert.match(preflight, /GITHUB_REF_NAME/);
    assert.match(preflight, /package\.json/);
    assert.match(preflight, /plugin\.json/);
    assert.match(workflow, /softprops\/action-gh-release/);
    assert.match(workflow, /files:\s*package\.zip/);
});

test('local release metadata produces a v-prefixed tag candidate', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    const plugin = JSON.parse(fs.readFileSync(path.join(root, 'plugin.json'), 'utf8'));
    assert.equal(isPackageVersion(pkg.version), true);
    assert.equal(plugin.version, pkg.version);
    assert.equal(tagForVersion(pkg.version), `v${plugin.version}`);
    assert.deepEqual(validateReleaseMetadata({
        packageVersion: pkg.version,
        pluginVersion: plugin.version,
        tag: tagForVersion(pkg.version),
    }), []);
    assert.ok(validateReleaseMetadata({
        packageVersion: pkg.version,
        pluginVersion: plugin.version,
        tag: 'v0.23',
    }).some((error) => /tag\/package/.test(error)));
});

test('release preflight keeps GitHub CLI optional and non-destructive', () => {
    const readme = fs.readFileSync(path.join(__dirname, 'README.md'), 'utf8');
    assert.match(readme, /GitHub CLI|gh/i);
    assert.match(readme, /not\s+upload|non-destructive|不.*发布|不.*上传|不修改/i);
});
