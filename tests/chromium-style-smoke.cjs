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
const browserPaths = browserCandidates.filter((candidate) => fs.existsSync(candidate));
const cssPaths = [baseCssPath, pluginCssPath, ...themeCssPaths];

if (!browserPaths.length) {
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
const calendarCells = Array.from({length: 42}, (_, index) => `<span class="sw__home-calendar-cell${index < 2 || index > 32 ? ' is-outside' : ''}${index === 10 ? ' is-today has-journal' : ''}${index === 15 ? ' is-holiday' : ''}"><span class="sw__home-calendar-primary">${(index % 31) + 1}</span>${index === 10 ? '<span class="sw__home-calendar-marker"></span>' : ''}${index === 15 ? '<span class="sw__home-calendar-secondary">国庆节</span>' : ''}</span>`).join('');
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
  <div class="sw__doc-results sw__group">
    <div class="sw__window-label">Workspace documents · 1</div>
    <div class="sw__doc-grid">
      <button type="button" class="sw__doc-item">
        <span class="sw__doc-icon"><svg><use href="#iconFile"></use></svg></span>
        <span class="sw__doc-copy">
          <span class="sw__doc-title">A long document title that can wrap across lines</span>
          <span class="sw__doc-path">/Notebook/Projects/A long document title</span>
        </span>
      </button>
    </div>
  </div>
</div>
<div class="b3-dialog"><div class="sw-settings__item">
  <div class="sw-settings__item-main"><div class="sw-settings__item-title">Setting</div></div>
  <div class="sw-settings__item-action"><label class="b3-switch sw-switch"><input type="checkbox"><span></span></label></div>
</div></div>
<div class="sw-home"><section class="sw-home__cell" data-size="large" data-module-id="journal-calendar"><div class="sw-home__cell-body">
  <section class="sw__home-module" data-module-id="journal-calendar">
    <div class="sw__home-module-body">
      <div class="sw__home-calendar-nav"><button>‹</button><strong class="sw__home-calendar-period">2026年9月</strong><button>今天</button><button>›</button></div>
      <div class="sw__home-calendar"><span class="sw__home-calendar-head">一</span><span class="sw__home-calendar-head">二</span><span class="sw__home-calendar-head">三</span><span class="sw__home-calendar-head">四</span><span class="sw__home-calendar-head">五</span><span class="sw__home-calendar-head">六</span><span class="sw__home-calendar-head">日</span>${calendarCells}</div>
    </div>
  </section>
</div></section></div>
<div class="sw-home"><section class="sw-home__cell" data-size="large" data-module-id="external-weather-open-meteo"><div class="sw-home__cell-body">
  <section class="sw__home-module" data-module-id="external-weather-open-meteo">
    <div class="sw__home-module-header"><strong class="sw__home-module-title">近期天气</strong></div>
    <div class="sw__home-module-context">北京 · 中国</div>
    <div class="sw__home-module-body"><div class="sw__home-stat"><strong class="sw__home-stat-value">21°</strong><span class="sw__home-stat-label">⛅ 多云</span></div>
      <ul class="sw__home-module-list">${Array.from({length: 4}, (_, index) => `<li class="sw__home-module-item"><span class="sw__home-module-item-action"><span class="sw__home-module-item-label">周${index + 1} 18° / 27°</span><span class="sw__home-module-item-secondary">降水 10%</span></span></li>`).join('')}</ul>
    </div>
  </section>
</div></section></div>
</div>
<script>
window.addEventListener('load', () => {
  const measure = (selector) => {
    const element = document.querySelector(selector);
    const style = getComputedStyle(element);
    return {tag: element.tagName, width: style.width, height: style.height, minHeight: style.minHeight, position: style.position, display: style.display, visibility: style.visibility, opacity: style.opacity};
  };
  const result = {
    pin: measure('.sw__pin'),
    favorite: measure('.sw__fav-btn'),
    close: measure('.sw__close'),
    settingSwitch: measure('.sw-switch'),
    docGrid: measure('.sw__doc-grid'),
    docItem: measure('.sw__doc-item'),
    docTitleClamp: getComputedStyle(document.querySelector('.sw__doc-title')).webkitLineClamp,
    calendarGrid: measure('.sw__home-calendar'),
    calendarColumns: getComputedStyle(document.querySelector('.sw__home-calendar')).gridTemplateColumns.split(' ').filter(Boolean).length,
    calendarCells: document.querySelectorAll('.sw__home-calendar-cell').length,
    calendarPeriod: document.querySelector('.sw__home-calendar-period').textContent,
    calendarTodayRadius: getComputedStyle(document.querySelector('.is-today .sw__home-calendar-primary')).borderRadius,
    calendarMarkerWidth: getComputedStyle(document.querySelector('.sw__home-calendar-marker')).width,
    calendarHolidayColor: getComputedStyle(document.querySelector('.is-holiday .sw__home-calendar-primary')).color,
    weatherBackground: getComputedStyle(document.querySelector('[data-module-id="external-weather-open-meteo"].sw-home__cell')).backgroundImage,
    weatherGrid: measure('[data-module-id="external-weather-open-meteo"] .sw__home-module-list'),
    weatherColumnsValue: getComputedStyle(document.querySelector('[data-module-id="external-weather-open-meteo"] .sw__home-module-list')).gridTemplateColumns,
    weatherTemperature: getComputedStyle(document.querySelector('[data-module-id="external-weather-open-meteo"] .sw__home-stat-value')).fontSize,
  };
  document.body.dataset.result = btoa(unescape(encodeURIComponent(JSON.stringify(result))));
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
    // A freshly auto-updated headless browser can exit cleanly with empty or
    // attribute-less output; fall through to the next installed Chromium.
    let match = null;
    let lastError = null;
    for (const [index, browserPath] of browserPaths.entries()) {
        // Each attempt needs its own profile dir: a browser that stays
        // resident after --dump-dom would otherwise lock the next attempt's
        // profile and the final temp-dir cleanup.
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
    const actionOk = ['pin', 'favorite', 'close'].every((key) => {
        const item = result[key];
        return item.tag === 'BUTTON' && item.width === '28px' && item.height === '28px'
            && item.position === 'absolute' && item.display === 'flex'
            && item.visibility === 'visible' && item.opacity !== '0';
    });
    const switchOk = result.settingSwitch.width === '42px'
        && result.settingSwitch.height === '24px'
        && result.settingSwitch.position === 'relative';
    const docCardsOk = result.docGrid.display === 'grid'
        && result.docItem.tag === 'BUTTON'
        && result.docItem.display === 'grid'
        && result.docItem.minHeight === '84px'
        && result.docTitleClamp === '2';
    const calendarOk = result.calendarGrid.display === 'grid'
        && result.calendarColumns === 7
        && result.calendarCells === 42
        && result.calendarPeriod === '2026年9月'
        && result.calendarTodayRadius === '50%'
        && result.calendarMarkerWidth === '4px'
        && result.calendarHolidayColor !== '';
    const weatherOk = result.weatherBackground.includes('gradient')
        && result.weatherGrid.display === 'grid'
        && result.weatherColumnsValue.split(' ').filter(Boolean).length === 2
        && parseFloat(result.weatherTemperature) >= 34;
    console.log(JSON.stringify(result, null, 2));
    console.log(`${actionOk ? 'PASS' : 'FAIL'} Chromium mobile card actions`);
    console.log(`${switchOk ? 'PASS' : 'FAIL'} Chromium settings switch`);
    console.log(`${docCardsOk ? 'PASS' : 'FAIL'} Chromium document search cards`);
    console.log(`${calendarOk ? 'PASS' : 'FAIL'} Chromium six-week calendar widget`);
    console.log(`${weatherOk ? 'PASS' : 'FAIL'} Chromium responsive weather widget`);
    process.exitCode = actionOk && switchOk && docCardsOk && calendarOk && weatherOk ? 0 : 1;
} catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
} finally {
    // Resident headless browsers may still hold locks briefly; a failed
    // cleanup must not fail an otherwise green run (dir lives in os.tmpdir).
    for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
            fs.rmSync(tempDir, {recursive: true, force: true});
            break;
        } catch (error) {
            if (attempt === 2) {
                console.warn(`smoke temp dir left behind: ${tempDir} (${error.message})`);
            } else {
                Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
            }
        }
    }
}
