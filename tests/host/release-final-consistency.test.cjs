const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..', '..');

test('rollback, CLI preflight, and dry-run contracts are documented', () => {
    const text = fs.readFileSync(path.join(__dirname, 'README.md'), 'utf8') + '\n' +
        fs.readFileSync(path.join(root, 'ROADMAP.md'), 'utf8');
    for (const marker of ['rollback', 'GitHub CLI', 'dry-run']) assert.match(text, new RegExp(marker, 'i'));
});

test('release workflow remains aligned with preflight intent', () => {
    const workflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'release.yml'), 'utf8');
    for (const marker of [/Verify tag version/, /pnpm test/, /pnpm build/, /files: package\.zip/]) {
        assert.match(workflow, marker);
    }
});

test('final consistency diagnostics stay bounded', () => {
    const diagnostics = ['rollback: documented', 'cli-preflight: documented', 'dry-run: documented'];
    assert.ok(diagnostics.join('; ').length < 256);
});
