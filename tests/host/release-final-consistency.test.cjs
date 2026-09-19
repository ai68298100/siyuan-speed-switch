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
    for (const marker of [/Verify tag version/, /pnpm test/, /pnpm repro:audit/, /Reproducible package build/, /Package integrity gate/, /files: package\.zip/]) {
        assert.match(workflow, marker);
    }
});

test('final consistency diagnostics stay bounded', () => {
    // 原实现自造三个诊断字符串再断言其拼接长度 < 256，恒真且与真实诊断无关
    // （见 docs/host-gate-audit.md）。现改用真实诊断实现，并以极端输入检验有界性：
    // 50 条超长失败信息必须仍被截断到有界输出，否则诊断本身会成为日志炸弹。
    const {formatReleaseDiagnostics} = require('./release-diagnostics.cjs');
    const stress = Array.from({length: 50}, (unused, index) => ({
        kind: 'resource',
        message: `missing very-long-resource-name-${index}-${'x'.repeat(200)}.js`,
    }));
    const result = formatReleaseDiagnostics(stress);
    assert.ok(result.length > 0, 'diagnostics must not be empty for a non-empty failure list');
    assert.ok(result.length <= 480, `diagnostics must stay bounded under load, got ${result.length} chars`);
});
