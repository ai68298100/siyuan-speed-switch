const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {classifyReleaseFailure, formatReleaseDiagnostics} = require('./release-diagnostics.cjs');

const root = path.resolve(__dirname, '..', '..');

test('release quality report exposes all required gate categories', () => {
    const categories = ['package', 'manifest', 'drift', 'resource'];
    const report = categories.map((category) => ({category, status: 'pass'}));
    assert.deepEqual(report.map((item) => item.category), categories);
    assert.equal(report.every((item) => item.status === 'pass'), true);
});

test('missing release resources produce bounded actionable attribution', () => {
    const required = ['plugin.json', 'package.json', 'ROADMAP.md'];
    const failures = required.filter((file) => !fs.existsSync(path.join(root, file)))
        .map((file) => ({kind: 'resource', message: `missing ${file}`}));
    const diagnostics = formatReleaseDiagnostics(failures);
    if (failures.length === 0) assert.equal(diagnostics, 'RELEASE_OK');
    else assert.match(diagnostics, /RESOURCE_MISSING/);
    assert.ok(diagnostics.length <= 480);
});

test('quality report preserves stable error code mapping', () => {
    assert.equal(classifyReleaseFailure({kind: 'package', message: 'bad archive'}).code, 'RELEASE_UNKNOWN');
    assert.equal(classifyReleaseFailure({kind: 'drift', message: 'changed hash'}).code, 'RELEASE_UNKNOWN');
    assert.equal(classifyReleaseFailure({kind: 'resource', message: 'missing css'}).code, 'RESOURCE_MISSING');
});
