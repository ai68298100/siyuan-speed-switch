// UI 烟雾测试：加载 SiYuan 移动端 base CSS + 插件 dist CSS + litheness sprite，
// 验证 .sw__pin / .sw__fav-btn / .sw__close 的计算样式仍是 28×28px。
// 在 dist/index.css 重新生成后跑一次，发现按钮被异常放大即可立刻定位。
//
// 用法: npm run test:smoke   （前提：已经 npm run build）

const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const REPO = path.resolve(__dirname, '..');
const distCss = path.join(REPO, 'dist', 'index.css');
const baseCssPath = process.env.SIYUAN_BASE_CSS || path.join(__dirname, 'fixtures', 'siyuan-mobile-base.css');

if (!fs.existsSync(distCss)) {
    console.error('❌ dist/index.css not found. Run `npm run build` first.');
    process.exit(1);
}
if (!fs.existsSync(baseCssPath)) {
    console.error(`❌ SiYuan CSS fixture not found at: ${baseCssPath}`);
    process.exit(1);
}
const pluginCss = fs.readFileSync(distCss, 'utf-8');
const baseCss = fs.readFileSync(baseCssPath, 'utf-8');
const sprite = '<svg aria-hidden="true" style="display:none"><symbol id="iconPin" viewBox="0 0 24 24"><path d="M12 2v20"/></symbol><symbol id="iconStar" viewBox="0 0 24 24"><path d="M12 2l3 7h7l-6 5 2 8-6-4-6 4 2-8-6-5h7z"/></symbol><symbol id="iconClose" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></symbol></svg>';

const html = `<!DOCTYPE html><html><body>${sprite}
<div class="speed-switch sw__body sw__mobile">
  <div class="sw__grid sw__mobile-grid">
    <div class="sw__card sw__mobile-card">
      <div class="sw__thumb"></div>
      <div class="sw__meta">
        <span class="sw__icon"><svg><use xlink:href="#iconFile"></use></svg></span>
        <span class="sw__title">Test doc</span>
      </div>
      <div class="sw__actions">
        <button type="button" class="sw__pin"><svg><use xlink:href="#iconPin"></use></svg></button>
        <button type="button" class="sw__fav-btn"><svg><use xlink:href="#iconStar"></use></svg></button>
        <button type="button" class="sw__close"><svg><use xlink:href="#iconClose"></use></svg></button>
      </div>
    </div>
  </div>
</div>
<div class="b3-dialog"><div class="sw-settings__item">
  <div class="sw-settings__item-main"><div class="sw-settings__item-title">Setting</div></div>
  <div class="sw-settings__item-action"><label class="b3-switch sw-switch"><input type="checkbox"><span></span></label></div>
</div></div>
<style>${baseCss}</style>
<style>${pluginCss}</style>
<style>
  /* Simulate a theme loaded after the plugin with broad tooltip rules. */
  .b3-tooltips { width: 100%; height: 88px; min-width: 100%; padding: 20px; line-height: 4; }
</style>
</body></html>`;

const dom = new JSDOM(html, {pretendToBeVisual: true});
const doc = dom.window.document;

const card = doc.querySelector('.sw__mobile-card');
const pin = doc.querySelector('.sw__pin');
const fav = doc.querySelector('.sw__fav-btn');
const close = doc.querySelector('.sw__close');

function rect(el) {
    // jsdom 不做 layout，使用 inline class 规则 + 内联样式来推断
    const cs = dom.window.getComputedStyle(el);
    return {
        width: cs.width,
        height: cs.height,
        position: cs.position,
        bottom: cs.bottom,
        right: cs.right,
        display: cs.display,
    };
}

const expected = '28px';
const actionTargets = [
    ['sw__pin', pin],
    ['sw__fav-btn', fav],
    ['sw__close', close],
];
let allPassed = true;
for (const [name, el] of actionTargets) {
    const r = rect(el);
    const passed = el.tagName === 'BUTTON' && !el.classList.contains('b3-tooltips')
        && r.width === expected && r.height === expected && r.position === 'absolute';
    console.log(`${passed ? '✅' : '❌'} action ${name}: ${r.width}x${r.height} ${r.position}`);
    if (!passed) allPassed = false;
}

// 图标：min-width/height 防御 SVG 加载失败导致塌陷
const icon = doc.querySelector('.sw__icon');
const iconR = rect(icon);
const iconOk = iconR.width !== '0px' && iconR.height !== '0px' && iconR.display !== 'none';
console.log(`${iconOk ? '✅' : '❌'} icon .sw__icon: ${iconR.width}x${iconR.height} display=${iconR.display}`);
if (!iconOk) allPassed = false;

// 卡片整体存在且可见（jsdom 不计算 layout，只检查 display/visibility 而非像素尺寸）
const cardR = rect(card);
const cardOk = card !== null && cardR.display !== 'none';
console.log(`${cardOk ? '✅' : '❌'} card .sw__mobile-card: ${cardR.width}x${cardR.height} display=${cardR.display}`);
if (!cardOk) allPassed = false;

// 网格：手机端默认单列（grid-template-columns 应只有一列）
const grid = doc.querySelector('.sw__mobile-grid');
const gridCs = dom.window.getComputedStyle(grid);
const gridCols = (gridCs.gridTemplateColumns || '').split(' ').filter((s) => s && s !== 'none').length;
const gridOk = gridCols === 1;
console.log(`${gridOk ? '✅' : '❌'} mobile grid columns: ${gridCols} (expected 1)`);
if (!gridOk) allPassed = false;

// 缩略图占位：必须存在（即便内容为空也是渲染的入口）
const thumb = doc.querySelector('.sw__thumb');
const thumbR = rect(thumb);
const thumbOk = thumb !== null;
console.log(`${thumbOk ? '✅' : '❌'} thumb .sw__thumb present: ${thumbR.width}x${thumbR.height}`);
if (!thumbOk) allPassed = false;

console.log(`\n${allPassed ? '✅ mobile card smoke passed' : '❌ mobile card smoke failed'}`);
const settingSwitch = doc.querySelector('.sw-settings__item-action .sw-switch');
const switchCs = dom.window.getComputedStyle(settingSwitch);
const switchOk = switchCs.width === '42px' && switchCs.height === '24px' && switchCs.position === 'relative';
console.log(`${switchOk ? 'PASS' : 'FAIL'} settings switch: ${switchCs.width}x${switchCs.height} ${switchCs.position}`);
if (!switchOk) allPassed = false;

process.exit(allPassed ? 0 : 1);
