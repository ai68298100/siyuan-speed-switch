// T-7198：圆角刻度门禁。
// 合同：border-radius 只允许 {2,3,4,6,8,10,12,14,16,18,999}px 字面（微件档
// 2/3/4 为视觉敏感保留档）、50%、0、token 引用（--sw-radius-*/--sw-sheet-radius/
// --sw-platform-radius-*/--studio-radius-*）；碎片档 5/7/9/11px 已退役（T-7198
// 就近归档：5→sm6、7→md8、9→control10、11→lg12），出现即失败；刻度外新值
// 入场 = 圆角碎裂，须先评审更新集合。检测器带注入自检（负向验证）。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const styleDir = path.resolve(__dirname, '..', 'src', 'styles');
const read = (f) => fs.readFileSync(path.join(styleDir, f), 'utf8');

const ALLOWED_PX = new Set(['2', '3', '4', '6', '8', '10', '12', '14', '16', '18', '999',
    // 快照遗留（T-7198 冻结，非新值）：1.5px = hairline 微件；22px = _05 既有面板顶角，
    // 迁移到 panel 档与否留 T-7198 后续批次决断，先拦截其他新值。
    // 99px = _09 pill 惯用大圆（与 999px 同义）；13px = _snippet-studio 既有块，
    // 后续归档 lg12/card14 时移除本条。
    '1.5', '22', '99', '13']);
const RETIRED_PX = ['5', '7', '9', '11'];

function findRadiusValues(source) {
    const hits = [];
    const re = /border-radius:\s*([^;]+);/g;
    let m;
    while ((m = re.exec(source)) !== null) hits.push(m[1].trim());
    return hits;
}

function offendingRadii(source) {
    return findRadiusValues(source).filter((v) => {
        if (v.includes('var(') || v === '0' || v === '50%' || v === 'inherit') return false;
        // 多值简写（如 "16px 16px 0 0"）逐值检查
        const parts = v.split(/\s+/);
        return parts.some((p) => {
            const num = p.match(/^(\d+(?:\.\d+)?)px$/);
            return num ? !ALLOWED_PX.has(num[1]) : false;
        });
    });
}

test('detector self-check: retired and unknown radii are caught (negative verification)', () => {
    assert.equal(offendingRadii('.x { border-radius: 5px; }').length, 1, '退役档 5px 必须命中');
    assert.equal(offendingRadii('.x { border-radius: 9px; }').length, 1, '退役档 9px 必须命中');
    assert.equal(offendingRadii('.x { border-radius: 21px; }').length, 1, '刻度外新值必须命中');
    assert.equal(offendingRadii('.x { border-radius: var(--sw-radius-md, 8px); }').length, 0);
    assert.equal(offendingRadii('.x { border-radius: 8px; }').length, 0);
    assert.equal(offendingRadii('.x { border-radius: 999px; }').length, 0);
});

test('no retired fragmented radii remain', () => {
    const files = fs.readdirSync(styleDir).filter((f) => f.endsWith('.scss'));
    for (const f of files) {
        const source = read(f);
        for (const retired of RETIRED_PX) {
            const hits = findRadiusValues(source).filter((v) => v === `${retired}px` || v.split(/\s+/).includes(`${retired}px`));
            assert.deepEqual(hits, [], `${f}: border-radius: ${retired}px 已退役（T-7198 就近归档 token），禁止回归`);
        }
    }
});

test('no radii beyond the frozen scale', () => {
    const files = fs.readdirSync(styleDir).filter((f) => f.endsWith('.scss'));
    for (const f of files) {
        const bad = offendingRadii(read(f));
        assert.deepEqual(bad, [], `${f}: 圆角超出刻度快照（${bad.join(' | ')}），请改用既有档位或先评审更新 ALLOWED_PX`);
    }
});

test('radius tokens are defined on the plugin root in _00-tokens', () => {
    const tokens = read('_00-tokens.scss');
    for (const token of ['--sw-radius-xs', '--sw-radius-sm', '--sw-radius-md', '--sw-radius-lg']) {
        assert.ok(tokens.includes(`${token}:`), `圆角 token ${token} 必须在 _00-tokens.scss 定义`);
    }
});
