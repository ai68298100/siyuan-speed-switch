// T-7198：elevation 阴影刻度门禁。
// 合同：中性蓝灰/黑调 elevation 阴影必须引用 --sw-shadow-xs/sm/md（或既有
// --sw-card/float/sheet-shadow 族）；退役清单（T-7198 已归档的精确字面串）
// 零出现。语义环（0 0 0 Npx）、指示条（inset Npx 0 0 语义色）、主题色阴影
//（color-mix primary）、皮肤专属阴影与 FAB 材质阴影不入此刻度。
// 检测器带注入自检（负向验证）。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const styleDir = path.resolve(__dirname, '..', 'src', 'styles');
const read = (f) => fs.readFileSync(path.join(styleDir, f), 'utf8');

// T-7198 已归档的精确字面串（含小数格式变体）。出现即失败。
const RETIRED_SHADOWS = [
    'box-shadow: 0 1px 3px rgba(35, 42, 75, .05)',
    'box-shadow: 0 1px 4px rgba(35, 42, 75, .06)',
    'box-shadow: 0 1px 3px rgba(0, 0, 0, .12)',
    'box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12)',
    'box-shadow: 0 1px 2px rgba(0, 0, 0, 0.25)',
    'box-shadow: 0 2px 8px rgba(70, 78, 110, .05)',
    'box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04), 0 4px 12px rgba(0, 0, 0, 0.03)',
    'box-shadow: 0 2px 6px rgba(0, 0, 0, 0.06), 0 8px 24px rgba(0, 0, 0, 0.06)',
    'box-shadow: 0 3px 14px rgba(65, 74, 108, .08)',
    'box-shadow: 0 5px 16px rgba(35, 42, 75, .16)',
    'box-shadow: 0 3px 12px rgba(0, 0, 0, .2), 0 1px 4px rgba(0, 0, 0, .1)',
    'box-shadow: 0 3px 12px rgba(0, 0, 0, 0.2), 0 1px 4px rgba(0, 0, 0, 0.1)',
    'box-shadow: 0 8px 24px rgba(35, 42, 75, .08)',
    'box-shadow: 0 7px 20px rgba(35, 42, 75, .2)',
    'box-shadow: 0 5px 16px rgba(0, 0, 0, .24), 0 2px 6px rgba(0, 0, 0, .12)',
    'box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2)',
    'box-shadow: 0 2px 8px rgba(0, 0, 0, .2)',
    'box-shadow: 0 2px 8px rgba(0, 0, 0, .18)',
    '0 5px 16px rgba(70, 78, 110, .05)',
    'box-shadow: 0 1px 3px rgb(51 58 83 / 14%)',
    'box-shadow: 0 1px 3px rgba(35, 42, 75, .14)',
];

test('detector self-check: retired literal shadow is caught (negative verification)', () => {
    const violation = '.x { box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12); }';
    assert.equal(RETIRED_SHADOWS.some((s) => violation.includes(s.replace('box-shadow: ', ''))), true, '退役字面必须命中清单');
    const compliant = '.x { box-shadow: var(--sw-shadow-xs); }';
    assert.equal(RETIRED_SHADOWS.some((s) => compliant.includes(s.replace('box-shadow: ', ''))), false, 'token 形式不报');
});

test('retired literal elevation shadows stay retired', () => {
    const files = fs.readdirSync(styleDir).filter((f) => f.endsWith('.scss'));
    for (const f of files) {
        const source = read(f);
        const hits = RETIRED_SHADOWS.filter((s) => source.includes(s));
        assert.deepEqual(hits, [], `${f}: 已归档的中性 elevation 字面阴影回归（${hits[0] || ''}）——请改用 --sw-shadow-xs/sm/md`);
    }
});

test('elevation tokens are defined on the plugin root in _00-tokens', () => {
    const tokens = read('_00-tokens.scss');
    for (const token of ['--sw-shadow-xs', '--sw-shadow-sm', '--sw-shadow-md']) {
        assert.ok(tokens.includes(`${token}:`), `阴影 token ${token} 必须在 _00-tokens.scss 定义`);
    }
});
