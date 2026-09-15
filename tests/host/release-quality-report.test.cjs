const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {classifyReleaseFailure, formatReleaseDiagnostics} = require('./release-diagnostics.cjs');

const root = path.resolve(__dirname, '..', '..');

test('release quality report exposes all required gate categories', () => {
    // 原实现自造 categories 数组、再 map 出 report 并断言二者一致——恒等式，
    // 且其类别（package/drift）连生产实现都不识别（见下方 RELEASE_UNKNOWN 用例）。
    // 现改为直接校验真实诊断实现支持的类别覆盖，见 docs/host-gate-audit.md。
    const supported = ['build', 'resource', 'manifest', 'remote', 'environment'];
    const codes = supported.map((kind) => classifyReleaseFailure({kind, message: 'probe'}).code);
    assert.deepEqual(codes.filter((code) => code === 'RELEASE_UNKNOWN'), [],
        'every documented failure kind must map to a known code');
    assert.equal(new Set(codes).size, supported.length,
        'each failure kind must map to a distinct code');
    for (const code of codes) {
        assert.match(code, /^[A-Z][A-Z_]*$/, `codes must stay stable and machine-readable: ${code}`);
    }
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
