const test = require('node:test');
const assert = require('node:assert/strict');
const {classifyReleaseFailure, formatReleaseDiagnostics} = require('./release-diagnostics.cjs');

test('release failures map to stable bounded error codes', () => {
    assert.equal(classifyReleaseFailure({kind: 'build', message: 'webpack failed'}).code, 'BUILD_FAILED');
    assert.equal(classifyReleaseFailure({kind: 'resource', message: 'missing index.js'}).code, 'RESOURCE_MISSING');
    assert.equal(classifyReleaseFailure({kind: 'manifest', message: 'version mismatch'}).code, 'MANIFEST_MISMATCH');
    assert.equal(classifyReleaseFailure({kind: 'remote', message: 'remote dependency'}).code, 'REMOTE_DEPENDENCY');
    assert.equal(classifyReleaseFailure({kind: 'environment', message: 'node mismatch'}).code, 'ENVIRONMENT_DRIFT');
});

test('diagnostic output is concise and stable', () => {
    const result = formatReleaseDiagnostics([
        {kind: 'resource', message: 'missing index.js'},
        {kind: 'manifest', message: 'version mismatch'},
    ]);
    assert.match(result, /RESOURCE_MISSING/);
    assert.match(result, /MANIFEST_MISMATCH/);
    assert.ok(result.length < 512);
    assert.equal(formatReleaseDiagnostics([]), 'RELEASE_OK');
});
