const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const matrix = fs.readFileSync('docs/support-matrix-2026-10-06.md', 'utf8');
const manifest = JSON.parse(fs.readFileSync('plugin.json', 'utf8'));

test('support matrix is grounded in manifest frontends and minimum version', () => {
    assert.match(matrix, new RegExp(`最低 ${manifest.minAppVersion}`));
    for (const frontend of manifest.frontends) assert.match(matrix, new RegExp(frontend.replace('-', '\\-')));
    assert.match(matrix, /不等同于每个平台已经完成验收/);
});

test('support matrix keeps unresolved host boundaries explicit', () => {
    for (const marker of ['B-004', 'B-005', 'B-007～B-011', '待验证', '部分验证', 'JS runner 关闭']) {
        assert.match(matrix, new RegExp(marker.replace(/[～-]/g, '\\$&')));
    }
    assert.match(matrix, /不能据此推断 Android/);
    assert.match(matrix, /不把 fixture 结果改成全兼容/);
});
