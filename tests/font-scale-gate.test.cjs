// T-7206（R16）第一阶段：字号可读性底线与刻度门禁。
// 硬线：font-size < 10px 仅允许白名单豁免（日历格内标注、预览装饰 mock 等
// 受物理尺寸约束的场景），9px 一档已于本任务清零、禁止回归；
// 半像素值（10.5/11.5/12.5）登记为迁移债：计数只允许减少，不允许新增；
// 其余值必须落在当前刻度快照集合内，防止新碎裂值入场。
// 检测器自带注入自检（负向验证）：违规样例必须命中。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const styleDir = path.join(root, 'src', 'styles');
const extraStyles = ['src/index.scss'];

// 豁免：值 < 10px 的白名单条目，指纹 = 文件名 + 字号值。
// 每条豁免必须写明物理约束理由；新增豁免须同步补充理由并评审。
const SMALL_FONT_EXEMPTIONS = [
    {file: '_08-home-store-cards.scss', px: 7, reason: '商店预览 p-feed-list 序号红点（13px 圆内单数字，装饰性 mock）'},
    {file: '_09-store-preview-polish.scss', px: 7, reason: '日历格内节假日次级标注（格宽≈卡宽 1/7，ellipsis+弱化兜底，物理约束）'},
];

// 退役档（T-7206）：出现即失败。9px 已于第一阶段清零；半像素值（10.5/11.5/12.5）
// 已于第二阶段就近归档到整数刻度 token（10.5→xs、11.5→sm、12.5→md）。
const RETIRED_PX = ['9', '10.5', '11.5', '12.5'];

// 当前允许的字号值快照（px）。新值入场 = 刻度碎裂，须先过评审更新本集合。
// 字号一律优先写 var(--sw-font-*, 字面量) 形式（T-7206 刻度 token，
// 定义见 src/styles/_00-tokens.scss）；字面量仅允许作为 token 回退参数出现。
const ALLOWED_PX = new Set(['10', '11', '12', '13', '14', '15', '16', '17', '20', '22', '28', '36', '46', '7']);

// 刻度 token 清单（与 _00-tokens.scss 的 .speed-switch 块一一对应）。
const FONT_TOKENS = ['--sw-font-2xs', '--sw-font-xs', '--sw-font-sm', '--sw-font-md', '--sw-font-lg', '--sw-font-xl', '--sw-font-2xl'];

function findFontSizes(source) {
    const hits = [];
    const re = /font-size:\s*(\d+(?:\.\d+)?)px/g;
    let m;
    while ((m = re.exec(source)) !== null) hits.push(m[1]);
    return hits;
}

function findBelowThreshold(source, threshold) {
    return findFontSizes(source).filter((px) => Number.parseFloat(px) < threshold);
}

function collectStyleSources() {
    const files = fs.readdirSync(styleDir).filter((f) => f.endsWith('.scss')).map((f) => path.join(styleDir, f));
    for (const extra of extraStyles) files.push(path.join(root, extra));
    return files.map((file) => ({file: path.basename(file), source: fs.readFileSync(file, 'utf8')}));
}

test('detector self-check: sub-10px sample is caught (negative verification)', () => {
    assert.equal(findBelowThreshold('.x { font-size: 8px; }', 10).length, 1);
    assert.equal(findBelowThreshold('.x { font-size: 9px; }', 10).length, 1);
    assert.equal(findBelowThreshold('.x { font-size: 10px; }', 10).length, 0);
});

test('font scale: no font-size below 10px except registered exemptions', () => {
    for (const {file, source} of collectStyleSources()) {
        const small = findBelowThreshold(source, 10);
        const exemptCount = SMALL_FONT_EXEMPTIONS.filter((e) => e.file === file).reduce((sum, e) => sum + findBelowThreshold(source, 10).filter((px) => Number.parseFloat(px) === e.px).length, 0);
        const unexpected = small.filter((px) => !SMALL_FONT_EXEMPTIONS.some((e) => e.file === file && Number.parseFloat(px) === e.px));
        assert.deepEqual(unexpected, [], `${file}: 10px 以下字号必须登记豁免（发现 ${unexpected.join(', ') || '无'}）`);
        assert.equal(small.length, exemptCount, `${file}: 豁免条目与实际 <10px 出现数必须一致`);
    }
});

test('font scale: the retired 9px tier stays retired', () => {
    for (const {file, source} of collectStyleSources()) {
        const nines = findFontSizes(source).filter((px) => Number.parseFloat(px) === 9);
        assert.deepEqual(nines, [], `${file}: 9px 档已在 T-7206 清零（14 处提升至 10px），禁止回归`);
    }
});

test('font scale: retired half-pixel tiers stay retired', () => {
    for (const {file, source} of collectStyleSources()) {
        for (const retired of RETIRED_PX) {
            const hits = findFontSizes(source).filter((px) => Number.parseFloat(px) === Number.parseFloat(retired));
            assert.deepEqual(hits, [], `${file}: font-size: ${retired}px 已退役（T-7206 就近归档整数刻度），禁止回归`);
        }
    }
});

test('font scale: token scale is defined on the plugin root', () => {
    const tokens = fs.readFileSync(path.join(styleDir, '_00-tokens.scss'), 'utf8');
    for (const token of FONT_TOKENS) {
        assert.ok(tokens.includes(`${token}:`), `刻度 token ${token} 必须在 _00-tokens.scss 的 .speed-switch 块中定义`);
    }
    assert.ok(!/:\s*root\s*\{[^}]*--sw-font-/.test(tokens), '字号 token 不得写入 :root（ADR 0073 作用域纪律）');
});

test('font scale: no new fragmented values beyond the frozen scale', () => {
    for (const {file, source} of collectStyleSources()) {
        const unexpected = findFontSizes(source).filter((px) => !ALLOWED_PX.has(px));
        assert.deepEqual(unexpected, [], `${file}: 出现刻度快照之外的新字号值（${unexpected.join(', ')}），请改用既有刻度或先评审更新 ALLOWED_PX`);
    }
});
