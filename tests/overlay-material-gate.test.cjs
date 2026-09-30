// T-7200：模态浮层遮罩材质门禁。
// 合同：所有模态遮罩（选择器名含 overlay/picker/scrim）的 background 必须
// 引用 --sw-overlay-* token（明暗主题、低能力引擎降级统一收口），
// 不得再写死 rgba()/rgb() 字面色；token 定义收口在 _00-tokens.scss；
// reduced-motion 必须覆盖移动排序 overlay 与商店详情 sheet 的进入动画。
// 检测器带注入自检（负向验证）。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const styleDir = path.resolve(__dirname, '..', 'src', 'styles');
const read = (f) => fs.readFileSync(path.join(styleDir, f), 'utf8');

// 找「选择器名含 overlay/picker/scrim 的规则块」中字面色 background。
// 块体取到第一个 '}' 为止（嵌套子块不含 background 声明，不影响判定）。
function findLiteralOverlayBackgrounds(source) {
    const hits = [];
    const re = /([^{}\n]*(?:overlay|picker|scrim)[^{}\n]*)\{([^}]*)\}/g;
    let m;
    while ((m = re.exec(source)) !== null) {
        const selector = m[1];
        const body = m[2];
        const bg = body.match(/background:\s*([^;]+);/);
        if (bg && /^rgba?\(/i.test(bg[1].trim())) {
            hits.push(`${selector.trim()} -> ${bg[1].trim()}`);
        }
    }
    return hits;
}

test('detector self-check: literal overlay scrim is caught (negative verification)', () => {
    const violation = '.sw-demo-overlay {\n  position: fixed;\n  background: rgba(0, 0, 0, 0.5);\n}';
    assert.equal(findLiteralOverlayBackgrounds(violation).length, 1, '字面遮罩色必须命中');
    const compliant = '.sw-demo-overlay {\n  background: var(--sw-overlay-scrim, rgba(0, 0, 0, 0.32));\n}';
    assert.equal(findLiteralOverlayBackgrounds(compliant).length, 0, 'token 形式（字面仅作回退）不报');
});

test('modal overlay backgrounds all reference the overlay tokens', () => {
    const files = fs.readdirSync(styleDir).filter((f) => f.endsWith('.scss'));
    for (const f of files) {
        const hits = findLiteralOverlayBackgrounds(read(f));
        assert.deepEqual(hits, [], `${f}: 遮罩 background 必须走 --sw-overlay-* token（发现 ${hits.join(' | ') || '无'}）`);
    }
});

test('overlay tokens are defined on the plugin root in _00-tokens', () => {
    const tokens = read('_00-tokens.scss');
    for (const token of ['--sw-overlay-scrim', '--sw-overlay-scrim-strong', '--sw-overlay-blur', '--sw-sheet-radius', '--sw-sheet-shadow']) {
        assert.ok(tokens.includes(`${token}:`), `浮层 token ${token} 必须在 _00-tokens.scss 定义`);
    }
});

test('reduced-motion covers mobile sort overlay and store detail sheet entry', () => {
    const s05 = read('_05-settings-widgets.scss');
    const rm = s05.slice(s05.indexOf('prefers-reduced-motion'));
    assert.ok(/\.sw__mobile-sort-overlay\b/.test(rm.slice(0, 600)), '排序 overlay 必须纳入 reduced-motion（T-7200 收口）');
    const s08 = read('_08-home-store-cards.scss');
    assert.match(s08, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?sw-store-sheet-up|@media \(prefers-reduced-motion: reduce\)[\s\S]*?animation: none;/, '商店 sheet 进入动画必须有 reduced-motion 降级');
    assert.ok(s08.includes('animation: sw-store-sheet-up'), '详情 sheet 必须有进入过渡');
    assert.ok(/\.sw-home-store__layout::after/.test(s08) && s08.includes('--sw-overlay-scrim'), '移动详情必须带遮罩 scrim（纯视觉层）');
});
