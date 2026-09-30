// T-7198：间距刻度门禁（gap/padding/margin 族）。
// 合同：间距值走偶数节奏（2/4/6/8/10/12/14/16/18/20/22/24/28/34px…），
// 奇数 px 仅允许 1px 微调（hairline 间隙）与快照遗留定位值；碎片档
// 3/5/7/9/11/13/15px 已于 T-7198 退役到最近偶数档（163 处），出现即失败。
// 检测器带注入自检（负向验证）。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const styleDir = path.resolve(__dirname, '..', 'src', 'styles');
const read = (f) => fs.readFileSync(path.join(styleDir, f), 'utf8');

// 快照遗留（既有定位值，非节奏值；处置说明后随归档批次移除）
const ODD_EXEMPT = new Set(['-25', '35']);
const SPACING_PROP = /(?:^|[{;\s])(gap|row-gap|column-gap|padding|margin)(?:-(?:top|right|bottom|left|inline|block))?\s*:\s*([^;}]+)/g;

// 返回间距声明中的奇数 px 值（含负号；1px 豁免）。
function findOddSpacingValues(source) {
    const hits = [];
    let m;
    while ((m = SPACING_PROP.exec(source)) !== null) {
        const values = m[2];
        const nums = values.matchAll(/(?<![\w.-])(-?\d+(?:\.\d+)?)px/g);
        for (const n of nums) {
            const abs = Math.abs(Number.parseFloat(n[1]));
            if (!Number.isInteger(abs) || abs % 2 === 0) continue;
            if (abs === 1) continue;
            const key = n[1].replace('.0', '');
            if (ODD_EXEMPT.has(key) || ODD_EXEMPT.has(String(Math.trunc(n[1])))) continue;
            hits.push(`${m[1]}: ... ${n[0]} ...`);
        }
    }
    return hits;
}

test('detector self-check: odd spacing fragment is caught (negative verification)', () => {
    const violation = '.x {\n  gap: 7px;\n  padding: 6px 13px;\n}';
    const hits = findOddSpacingValues(violation);
    assert.equal(hits.length, 2, '碎片档 7px/13px 必须各命中一次');
    assert.equal(findOddSpacingValues('.x { gap: 8px; margin-top: -1px; }').length, 0, '偶数与 1px 豁免不报');
});

test('spacing values follow the even rhythm (odd fragments retired)', () => {
    const files = fs.readdirSync(styleDir).filter((f) => f.endsWith('.scss'));
    for (const f of files) {
        const hits = findOddSpacingValues(read(f));
        assert.deepEqual(hits, [], `${f}: 间距出现奇数碎片值（${hits.join(' | ') || '无'}）——T-7198 已退役到最近偶数档`);
    }
});
