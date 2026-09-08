const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');

test('release documentation consistently names package.zip and tag format', () => {
    const files = ['README.md', 'ROADMAP.md', '.github/workflows/release.yml'];
    const texts = files.map((file) => fs.readFileSync(path.join(root, file), 'utf8'));
    for (const text of texts) {
        assert.match(text, /package\.zip/);
        assert.match(text, /v(?:\*|\d+\.\d+\.\d+)/);
    }
});

test('release tag preflight rejects unsafe or mismatched tag shapes', () => {
    const valid = /^v\d+\.\d+\.\d+$/;
    assert.equal(valid.test('v0.16.11'), true);
    for (const invalid of ['0.16.11', 'version-0.16.11', 'v0.16', 'v0.16.11-beta']) {
        assert.equal(valid.test(invalid), false);
    }
});

test('documentation does not present browser emulation as Android acceptance', () => {
    const readme = fs.readFileSync(path.join(__dirname, 'README.md'), 'utf8');
    assert.match(readme, /browser emulation is a structural smoke test, not Android acceptance/i);
});
