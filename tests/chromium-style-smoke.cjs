const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {pathToFileURL} = require('node:url');

const repo = path.resolve(__dirname, '..');
const pluginCssPath = path.join(repo, 'dist', 'index.css');
const baseCssPath = process.env.SIYUAN_BASE_CSS || path.join(__dirname, 'fixtures', 'siyuan-mobile-base.css');
const themeCssPaths = (process.env.SIYUAN_THEME_CSS || '').split(path.delimiter).filter(Boolean);
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
const browserPath = browserCandidates.find((candidate) => fs.existsSync(candidate));
const cssPaths = [baseCssPath, pluginCssPath, ...themeCssPaths];

if (!browserPath) {
    console.error('Chromium browser not found. Set BROWSER_PATH to Edge, Chrome, or Chromium.');
    process.exit(1);
}
for (const cssPath of cssPaths) {
    if (!fs.existsSync(cssPath)) {
        console.error(`CSS file not found: ${cssPath}`);
        process.exit(1);
    }
}

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'siyuan-speed-switch-smoke-'));
const profileDir = path.join(tempDir, 'profile');
const htmlPath = path.join(tempDir, 'index.html');
const links = cssPaths.map((cssPath) => `<link rel="stylesheet" href="${pathToFileURL(cssPath).href}">`).join('\n');
const html = `<!doctype html>
<html class="neo-mobile neo-mode-dark" data-theme-mode="dark">
<head>
<meta charset="utf-8">
${links}
<style>
.b3-tooltips{width:100%;height:88px;min-width:100%;padding:20px;line-height:4}
.smoke-layout{display:grid;gap:24px;padding:16px;max-width:358px}
</style>
</head>
<body class="neo-mobile neo-mode-dark">
<div class="smoke-layout">
<div class="speed-switch sw__body sw__mobile">
  <div class="sw__grid sw__mobile-grid">
    <div class="sw__card sw__mobile-card">
      <div class="sw__thumb"></div>
      <div class="sw__meta"><span class="sw__icon">A</span><span class="sw__title">Test doc</span></div>
      <div class="sw__actions">
        <button type="button" class="sw__pin" aria-label="Pin"><svg viewBox="0 0 24 24"><path d="M12 2v20" stroke="currentColor"/></svg></button>
        <button type="button" class="sw__fav-btn" aria-label="Favorite"><svg viewBox="0 0 24 24"><path d="M12 2l3 7h7l-6 5 2 8-6-4-6 4 2-8-6-5h7z" fill="none" stroke="currentColor"/></svg></button>
        <button type="button" class="sw__close" aria-label="Close"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor"/></svg></button>
      </div>
    </div>
  </div>
</div>
<div class="b3-dialog"><div class="sw-settings__item">
  <div class="sw-settings__item-main"><div class="sw-settings__item-title">Setting</div></div>
  <div class="sw-settings__item-action"><label class="b3-switch sw-switch"><input type="checkbox"><span></span></label></div>
</div></div>
</div>
<script>
window.addEventListener('load', () => {
  const measure = (selector) => {
    const element = document.querySelector(selector);
    const style = getComputedStyle(element);
    return {tag: element.tagName, width: style.width, height: style.height, position: style.position, display: style.display, visibility: style.visibility, opacity: style.opacity};
  };
  const result = {
    pin: measure('.sw__pin'),
    favorite: measure('.sw__fav-btn'),
    close: measure('.sw__close'),
    settingSwitch: measure('.sw-switch'),
  };
  document.body.dataset.result = btoa(JSON.stringify(result));
});
</script>
</body>
</html>`;

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
    if (screenshotPath) {
        args.push(`--screenshot=${screenshotPath}`);
    }
    args.push(pathToFileURL(htmlPath).href);
    const output = execFileSync(browserPath, args, {encoding: 'utf8', timeout: 30000});
    const match = output.match(/data-result="([^"]+)"/);
    if (!match) {
        throw new Error('Browser did not return computed styles');
    }
    const result = JSON.parse(Buffer.from(match[1], 'base64').toString('utf8'));
    const actionOk = ['pin', 'favorite', 'close'].every((key) => {
        const item = result[key];
        return item.tag === 'BUTTON' && item.width === '28px' && item.height === '28px'
            && item.position === 'absolute' && item.display === 'flex'
            && item.visibility === 'visible' && item.opacity !== '0';
    });
    const switchOk = result.settingSwitch.width === '42px'
        && result.settingSwitch.height === '24px'
        && result.settingSwitch.position === 'relative';
    console.log(JSON.stringify(result, null, 2));
    console.log(`${actionOk ? 'PASS' : 'FAIL'} Chromium mobile card actions`);
    console.log(`${switchOk ? 'PASS' : 'FAIL'} Chromium settings switch`);
    process.exitCode = actionOk && switchOk ? 0 : 1;
} catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
} finally {
    fs.rmSync(tempDir, {recursive: true, force: true});
}
