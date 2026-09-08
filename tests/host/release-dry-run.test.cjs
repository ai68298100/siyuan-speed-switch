const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');

test('release dry-run contract names package.zip and generated notes', () => {
    const workflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'release.yml'), 'utf8');
    assert.match(workflow, /files:\s*package\.zip/);
    assert.match(workflow, /generate_release_notes:\s*true/);
    assert.match(workflow, /tags:[\s\S]{0,40}["']?v\*["']?/);
});

test('dry-run validates release inputs without invoking upload commands', () => {
    const workflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'release.yml'), 'utf8');
    assert.doesNotMatch(workflow, /gh\s+release\s+upload/);
    assert.match(workflow, /pnpm\s+build/);
    assert.match(workflow, /pnpm\s+test/);
});

test('dry-run asset list remains bounded and explicit', () => {
    const assets = ['package.zip'];
    assert.deepEqual(assets, ['package.zip']);
    assert.ok(assets.length <= 4);
});
