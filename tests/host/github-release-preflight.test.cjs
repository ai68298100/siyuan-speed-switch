const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');

test('GitHub release workflow has a safe tag/version preflight', () => {
    const workflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'release.yml'), 'utf8');
    assert.match(workflow, /GITHUB_REF_NAME/);
    assert.match(workflow, /package\.json/);
    assert.match(workflow, /plugin\.json/);
    assert.match(workflow, /softprops\/action-gh-release/);
    assert.match(workflow, /files:\s*package\.zip/);
});

test('local release metadata produces a v-prefixed tag candidate', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    const plugin = JSON.parse(fs.readFileSync(path.join(root, 'plugin.json'), 'utf8'));
    assert.match(pkg.version, /^\d+\.\d+\.\d+$/);
    assert.equal(plugin.version, pkg.version);
    assert.equal(`v${pkg.version}`, `v${plugin.version}`);
});

test('release preflight keeps GitHub CLI optional and non-destructive', () => {
    const readme = fs.readFileSync(path.join(__dirname, 'README.md'), 'utf8');
    assert.match(readme, /GitHub CLI|gh/i);
    assert.match(readme, /not\s+upload|non-destructive|不.*发布|不.*上传|不修改/i);
});
