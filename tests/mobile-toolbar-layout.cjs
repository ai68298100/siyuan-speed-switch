// 真实 Chromium 布局门禁：手机端三处「首帧/窄屏」UI 缺陷的回归防线。
//
// 覆盖三个已验证的根因（每个都曾以真实截图暴露给用户）：
//   ① 顶栏芯片文字被裁 —— 旧版纯图标规则 width:34px 压住芯片规则，标签可用宽只剩 18px，
//      "收藏/设置"被 text-overflow: ellipsis 裁成单字。
//   ② 组件面板卡片高度塌陷 —— 手机端单列后 grid-row 归零，但网格仍是 grid-auto-rows: 40px，
//      每张卡片只剩一个 40px 行单元，叠加 overflow: hidden 后内容整片被裁，界面"显示不出来"。
//   ③ 裸 SVG 尺寸失控 —— 插件样式未作用到新插入节点时，<svg> 退回浏览器默认 300×150，
//      把顶栏撑成"巨型图标 + 控件竖排"（即用户反馈的"刚进去出现大图标"）。
//
// ③ 的验证用「同页对照」做因果证明：同一容器里放一个带 width/height 属性的 svg
// 和一个裸 svg，禁用插件样式表后前者必须保持小尺寸、后者必须退回 300×150——
// 若两者表现相同，说明测试环境没能真正复现"样式未就绪"，断言随即失败。
// 第三个探针把"裸 svg 落在 b3-button 内仍有宿主兜底（真机 16×16）"也变成测量，
// 这样"哪些容器可以不带显式尺寸"就不再依赖推断（详见 fixtures/siyuan-mobile-base.css 注）。
//
// 用法: npm run test:smoke:layout   （前提：已经 npm run build）

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {pathToFileURL} = require('node:url');

const repo = path.resolve(__dirname, '..');
const pluginCssPath = path.join(repo, 'dist', 'index.css');
const baseCssPath = process.env.SIYUAN_BASE_CSS || path.join(__dirname, 'fixtures', 'siyuan-mobile-base.css');
const screenshotPath = process.env.SMOKE_SCREENSHOT ? path.resolve(process.env.SMOKE_SCREENSHOT) : '';
const browserCandidates = [
    process.env.BROWSER_PATH,
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
].filter(Boolean);
const browserPaths = browserCandidates.filter((candidate) => fs.existsSync(candidate));

if (!browserPaths.length) {
    console.error('Chromium browser not found. Set BROWSER_PATH to Edge, Chrome, or Chromium.');
    process.exit(1);
}
for (const cssPath of [baseCssPath, pluginCssPath]) {
    if (!fs.existsSync(cssPath)) {
        console.error(`CSS file not found: ${cssPath}`);
        process.exit(1);
    }
}

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sw-mobile-layout-'));
const profileDir = path.join(tempDir, 'profile');
const htmlPath = path.join(tempDir, 'index.html');
const links = [baseCssPath, pluginCssPath]
    .map((cssPath, index) => `<link rel="stylesheet" id="css-${index}" href="${pathToFileURL(cssPath).href}">`)
    .join('\n');
const sprite = '<svg aria-hidden="true" style="display:none"><symbol id="iconSearch" viewBox="0 0 32 32"><path d="M4 4h24v24H4z"/></symbol>'
    + '<symbol id="iconFilter" viewBox="0 0 32 32"><path d="M4 4h24v24H4z"/></symbol>'
    + '<symbol id="iconStar" viewBox="0 0 32 32"><path d="M4 4h24v24H4z"/></symbol>'
    + '<symbol id="iconClock" viewBox="0 0 32 32"><path d="M4 4h24v24H4z"/></symbol>'
    + '<symbol id="iconSettings" viewBox="0 0 32 32"><path d="M4 4h24v24H4z"/></symbol></svg>';

// 顶栏结构逐字取自 index.ts::buildMobileSwitcherHtml（含显式 width/height 兜底属性）
const toolbarHtml = `<div class="speed-switch sw__body sw__mobile">
  <div class="sw__toolbar sw__mobile-toolbar">
    <div class="sw__search-wrap">
      <svg class="sw__search-icon" width="14" height="14"><use xlink:href="#iconSearch"></use></svg>
      <input class="b3-text-field sw__search" placeholder="搜索页签或全库文档…" />
      <button type="button" class="sw__search-filter-btn b3-tooltips b3-tooltips__s" aria-label="筛选">
        <svg width="15" height="15"><use xlink:href="#iconFilter"></use></svg>
      </button>
    </div>
    <button type="button" class="b3-button b3-button--text sw__sort-btn" aria-label="排序"></button>
    <button type="button" class="b3-button b3-button--text sw__icon-btn sw__mobile-close-btn" aria-label="关闭">
      <svg width="16" height="16"><use xlink:href="#iconClose"></use></svg>
    </button>
    <div class="sw__toolbar-row2">
      <button type="button" class="b3-button b3-button--text sw__icon-btn sw__mobile-fav-btn" aria-label="收藏">
        <svg width="16" height="16"><use xlink:href="#iconStar"></use></svg><span class="sw__mobile-chip-label">收藏</span>
      </button>
      <div class="sw__history-dd"><button type="button" class="sw__history-trigger" aria-label="最近打开">
        <svg width="13" height="13"><use xlink:href="#iconClock"></use></svg><span class="sw__history-trigger-text">最近打开</span><span class="sw__history-badge">24</span>
      </button></div>
      <button type="button" class="b3-button b3-button--text sw__icon-btn sw__settings-btn" aria-label="设置">
        <svg width="16" height="16"><use xlink:href="#iconSettings"></use></svg><span class="sw__mobile-chip-label">设置</span>
      </button>
    </div>
  </div>
</div>`;

// 组件画布：两根卡片，模拟渲染层写入的 gridColumn/gridRow 内联样式
const homeCell = (title, rows) => `<section class="sw-home__cell" data-size="medium" style="grid-column: 1 / -1; grid-row: auto;">
  <div class="sw-home__cell-body">
    <section class="sw__home-module" data-status="ready">
      <div class="sw__home-module-header">
        <svg class="sw__home-module-icon" width="28" height="28" aria-hidden="true"><use xlink:href="#iconStar"></use></svg>
        <h3 class="sw__home-module-title">${title}</h3>
      </div>
      <div class="sw__home-module-body"><ul class="sw__home-module-list">
        ${Array.from({length: rows}, (_, index) => `<li class="sw__home-module-item"><button class="sw__home-module-item-action"><span class="sw__home-module-item-label">条目 ${index + 1}</span></button></li>`).join('')}
      </ul></div>
    </section>
  </div>
</section>`;

const homeHtml = `<div class="sw-home sw-home--mobile">
  <div class="sw-home__grid">${homeCell('条目较多的组件', 4)}${homeCell('条目较少的组件', 1)}
    <section class="sw-home__cell" data-size="medium" style="grid-column: 1 / -1; grid-row: auto;">
      <div class="sw-home__cell-body"><section class="sw__home-module" data-status="loading">
        <div class="sw__home-module-header"><h3 class="sw__home-module-title">加载中的组件</h3></div>
        <div class="sw__home-module-body"><div class="sw__home-loading-skeleton"><span class="sw__home-loading-skeleton-line is-wide"></span><span class="sw__home-loading-skeleton-line is-medium"></span></div></div>
      </section></div>
    </section>
  </div>
</div>`;

// 因果对照：同一容器内，带属性 svg 与裸 svg 在样式失效时的表现必须不同。
// 结构刻意与生产一致（.sw__search-wrap 是 .sw__search-icon 尺寸规则的前置祖先），
// 否则对照组自身就先失控、无法证明"属性兜底"起作用。
//
// 第三个探针 #hosted-bare 用来测量审计判据①：**裸 svg 放在 b3-button 里是有兜底的**。
// 它把"带 b3-button 的容器可以不带显式尺寸"这条前提变成可执行事实——若 fixture 丢了
// 真机那条 .b3-button svg 尺寸规则（或思源改了它），本探针会退回 300×150 并失败。
const controlHtml = `<div class="speed-switch sw__body sw__mobile"><div class="sw__toolbar sw__mobile-toolbar">
  <div class="sw__search-wrap">
    <svg id="with-attr" class="sw__search-icon" width="14" height="14"><use xlink:href="#iconSearch"></use></svg>
    <svg id="bare" class="sw__search-icon"><use xlink:href="#iconSearch"></use></svg>
  </div>
  <button type="button" class="b3-button b3-button--text" id="hosted"><svg id="hosted-bare"><use xlink:href="#iconFilter"></use></svg></button>
</div></div>`;

const html = `<!doctype html>
<html><head><meta charset="utf-8">
${links}
<style>
/* 贴近真机逻辑宽度（iPhone 390pt）：避免测量页自身被内容撑宽后，
   让 SMOKE_SCREENSHOT 产物与门禁都在一个"比手机更宽"的伪环境下评估。 */
html, body { margin: 0; padding: 0; max-width: 390px; overflow-x: hidden; }
</style>
</head><body>
${sprite}
${toolbarHtml}
<section class="sw-home-host">${homeHtml}</section>
${controlHtml}
<script>
window.addEventListener('load', () => {
  const rect = (selector) => {
    const element = document.querySelector(selector);
    if (!element) return null;
    const box = element.getBoundingClientRect();
    return {width: Math.round(box.width), height: Math.round(box.height), clientWidth: element.clientWidth, scrollWidth: element.scrollWidth};
  };
  const style = (selector, prop) => {
    const element = document.querySelector(selector);
    return element ? getComputedStyle(element)[prop] : null;
  };
  const oversized = () => Array.from(document.querySelectorAll('svg'))
    .filter((svg) => {
      const box = svg.getBoundingClientRect();
      return box.width > 32 || box.height > 32;
    })
    .map((svg) => (svg.getAttribute('class') || '') + ':' + Math.round(svg.getBoundingClientRect().width) + 'x' + Math.round(svg.getBoundingClientRect().height));

  const cells = Array.from(document.querySelectorAll('.sw-home__grid .sw-home__cell'));
  const result = {
    favButton: rect('.sw__mobile-fav-btn'),
    favLabel: rect('.sw__mobile-fav-btn .sw__mobile-chip-label'),
    settingsLabel: rect('.sw__settings-btn .sw__mobile-chip-label'),
    favIcon: rect('.sw__mobile-fav-btn > svg'),
    row2Height: rect('.sw__toolbar-row2'),
    historyTrigger: rect('.sw__history-trigger'),
    row2IconSizes: Array.from(document.querySelectorAll('.sw__toolbar-row2 svg')).map((svg) => Math.round(svg.getBoundingClientRect().width)),
    gridAutoRows: style('.sw-home__grid', 'gridAutoRows'),
    gridColumns: style('.sw-home__grid', 'gridTemplateColumns'),
    cellCount: cells.length,
    cellHeights: cells.map((cell) => Math.round(cell.getBoundingClientRect().height)),
    cellBodyClipped: cells.map((cell) => {
      const body = cell.querySelector('.sw-home__cell-body');
      return body ? body.scrollHeight > body.clientHeight + 2 : false;
    }),
    oversizedSvg: oversized(),
    // 阶段 B：断开插件样式表，模拟"样式尚未作用到新插入节点"
    withoutPluginCss: null,
  };

  const pluginSheet = document.getElementById('css-1');
  if (pluginSheet) pluginSheet.disabled = true;
  const withAttr = document.getElementById('with-attr').getBoundingClientRect();
  const bare = document.getElementById('bare').getBoundingClientRect();
  const hostedBare = document.getElementById('hosted-bare').getBoundingClientRect();
  result.withoutPluginCss = {
    withAttrWidth: Math.round(withAttr.width),
    withAttrHeight: Math.round(withAttr.height),
    bareWidth: Math.round(bare.width),
    bareHeight: Math.round(bare.height),
    // 探针：裸 svg 落在 b3-button 内时必须仍被真机基础样式兜底为 16×16
    hostedBareWidth: Math.round(hostedBare.width),
    hostedBareHeight: Math.round(hostedBare.height),
    toolbarHeight: Math.round(document.querySelector('.sw__toolbar').getBoundingClientRect().height),
  };
  // 测量已采集，恢复样式表后再落结果：--screenshot 拍的是页面最终状态，
  // 留着禁用态会让截图（和 SMOKE_SCREENSHOT 产物）呈现夸张的裸 svg，无法用于人工复核。
  if (pluginSheet) pluginSheet.disabled = false;
  document.body.dataset.result = btoa(unescape(encodeURIComponent(JSON.stringify(result))));
});
</script>
</body></html>`;

try {
    fs.writeFileSync(htmlPath, html, 'utf8');
    const args = [
        '--headless=new',
        '--disable-gpu',
        '--disable-extensions',
        '--no-first-run',
        '--allow-file-access-from-files',
        `--user-data-dir=${profileDir}`,
        '--window-size=390,844',
        '--dump-dom',
    ];
    if (screenshotPath) args.push(`--screenshot=${screenshotPath}`);
    args.push(pathToFileURL(htmlPath).href);

    let match = null;
    let lastError = null;
    for (const [index, browserPath] of browserPaths.entries()) {
        const attemptProfileDir = `${profileDir}-${index}`;
        const attemptArgs = args.map((arg) => arg.startsWith('--user-data-dir=')
            ? `--user-data-dir=${attemptProfileDir}`
            : arg);
        try {
            const output = execFileSync(browserPath, attemptArgs, {encoding: 'utf8', timeout: 30000});
            match = output.match(/data-result="([^"]+)"/);
        } catch (error) {
            lastError = error;
        }
        if (match) break;
    }
    if (!match) {
        throw lastError || new Error('No candidate browser returned computed styles');
    }
    const result = JSON.parse(Buffer.from(match[1], 'base64').toString('utf8'));

    // ① 顶栏芯片：标签必须完整可见（可用宽 = 内容宽），按钮必须已脱离 34px 定宽
    const labelFits = (label) => !!label && label.clientWidth >= label.scrollWidth && label.width > 18;
    const chipOk = labelFits(result.favLabel)
        && labelFits(result.settingsLabel)
        && !!result.favButton && result.favButton.width > 34
        && !!result.favIcon && result.favIcon.width === 16 && result.favIcon.height === 16
        && !!result.historyTrigger && result.historyTrigger.height === result.row2Height.height;

    // ② 组件面板：单列 + 行高交还内容；卡片必须显著高于旧版 40px 行单元，
    //    且不同条目数的卡片高度必须不同（否则说明仍被固定行高钳制）
    const heights = result.cellHeights;
    const homeOk = result.gridColumns.split(' ').filter(Boolean).length === 1
        && result.gridAutoRows === 'auto'
        && result.cellCount === 3
        && heights.every((height) => height >= 100)
        && heights[0] > heights[1]
        && result.cellBodyClipped.every((clipped) => clipped === false);

    // ③ 图标尺寸：正常路径无超标图标；断开插件样式后三个探针必须按各自预期分化——
    //    带属性的 svg 保持 14×14、裸 svg 退回 300×150（证明对照环境真的复现了"样式未就绪"）、
    //    而落在 b3-button 里的裸 svg 仍被真机基础样式兜底为 16×16（把审计判据①变成测量）。
    const fallback = result.withoutPluginCss || {};
    const iconOk = result.oversizedSvg.length === 0
        && result.row2IconSizes.every((size) => size <= 18)
        && fallback.withAttrWidth === 14 && fallback.withAttrHeight === 14
        && fallback.bareWidth === 300 && fallback.bareHeight === 150
        && fallback.hostedBareWidth === 16 && fallback.hostedBareHeight === 16;

    console.log(JSON.stringify(result, null, 2));
    console.log(`${chipOk ? 'PASS' : 'FAIL'} mobile toolbar chip labels stay legible`);
    console.log(`${homeOk ? 'PASS' : 'FAIL'} mobile home grid keeps content height`);
    console.log(`${iconOk ? 'PASS' : 'FAIL'} mobile icons stay bounded without plugin css`);
    process.exitCode = chipOk && homeOk && iconOk ? 0 : 1;
} catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
} finally {
    try {
        fs.rmSync(tempDir, {recursive: true, force: true});
    } catch (_) {
        // 临时目录清理失败不影响门禁结论
    }
}
