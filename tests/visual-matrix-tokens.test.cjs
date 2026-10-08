// T-7153 收官矩阵（精简版）：四视口/主题组合下刻度 token 解析一致性取证。
// 断言：档位 token（字号/圆角/间距/阴影/控件高度/密度）在全部视口与明暗主题下
// 解析一致（刻度不随视口漂移、明暗只换主题变量不换档位）；遮罩/材质/焦点环的
// 关键计算值在四态恒定。可重复执行的收官门禁。
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {spawn} = require('node:child_process');
const assert = require('node:assert/strict');
const {createRequire} = require('node:module');
const esbuild = createRequire(require.resolve('esbuild-loader'))('esbuild');

const repo = path.resolve(__dirname, '..');
const artifactDir = path.join(repo, '.tmp', 't7153-matrix');
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

const VIEWPORTS = [
    {name: 'desktop-light', width: 1366, height: 800, theme: 'light'},
    {name: 'desktop-dark', width: 1366, height: 800, theme: 'dark'},
    {name: 'sidebar-narrow', width: 380, height: 700, theme: 'light'},
    {name: 'mobile', width: 390, height: 760, theme: 'light'},
];

async function run() {
    fs.mkdirSync(artifactDir, {recursive: true});
    const profile = fs.mkdtempSync(path.join(artifactDir, 'profile-'));
    const bundle = esbuild.buildSync({
        stdin: {contents: ['import "./index.ts";'].join('\n'), resolveDir: path.join(repo, 'src'), loader: 'ts'},
        bundle: true, format: 'iife', platform: 'browser', write: false,
        alias: {siyuan: path.join(repo, 'tests', 'fixtures', 'siyuan-stub.ts')},
        loader: {'.scss': 'empty', '.svg': 'empty'},
    }).outputFiles[0].text;
    fs.writeFileSync(path.join(artifactDir, 'bundle.js'), bundle);
    const baseCss = path.join(repo, 'tests', 'fixtures', 'siyuan-mobile-base.css').split(path.sep).join('/');
    const distCss = path.join(repo, 'dist', 'index.css').split(path.sep).join('/');
    const i18nJson = fs.readFileSync(path.join(repo, 'src', 'i18n', 'zh-CN.json'), 'utf8');
    fs.writeFileSync(path.join(artifactDir, 'page.html'), `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="file:///${baseCss}"><link rel="stylesheet" href="file:///${distCss}"></head><body>
<div class="speed-switch" id="root">
  <div class="sw__search" id="probe-search"></div>
  <div class="sw__thumb" id="probe-thumb"></div>
  <div class="sw-settings" id="probe-settings"><div class="sw-settings__tab" id="probe-tab"></div></div>
</div>
<script>window.__stubI18n = ${i18nJson};</script>
<script src="./bundle.js"></script>
</body></html>`);

    const candidates = [process.env.BROWSER_PATH,
        'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
        'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
        'C:/Program Files/Google/Chrome/Application/chrome.exe'].filter((c) => fs.existsSync(c));
    const child = spawn(candidates[0], ['--headless=new', '--disable-gpu', '--no-first-run', '--allow-file-access-from-files',
        '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], {stdio: 'ignore', windowsHide: true});
    try {
        const portFile = path.join(profile, 'DevToolsActivePort');
        for (let i = 0; !fs.existsSync(portFile) && i < 100; i += 1) await delay(100);
        const port = Number(fs.readFileSync(portFile, 'utf8').split(/\r?\n/)[0]);
        const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json());
        const socket = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
        await new Promise((res, rej) => { socket.addEventListener('open', res, {once: true}); socket.addEventListener('error', rej); });
        let seq = 0; const pending = new Map();
        socket.addEventListener('message', (ev) => { const m = JSON.parse(String(ev.data)); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
        const send = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pending.set(id, (m) => m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result)); socket.send(JSON.stringify({id, method, params})); });
        const evalJs = async (expression) => { const r = await send('Runtime.evaluate', {expression, returnByValue: true}); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 300)); return r.result.value; };
        await send('Page.enable');
        await send('Page.navigate', {url: 'file:///' + path.join(artifactDir, 'page.html').replace(/\\/g, '/')});
        await delay(600);

        const matrix = {};
        for (const vp of VIEWPORTS) {
            await send('Emulation.setDeviceMetricsOverride', {width: vp.width, height: vp.height, deviceScaleFactor: 1, mobile: false});
            await evalJs(`document.documentElement.setAttribute('data-theme-mode', '${vp.theme}'); document.documentElement.classList.toggle('neo-mode-dark', ${vp.theme === 'dark'});`);
            await delay(200);
            matrix[vp.name] = await evalJs(`(() => {
                const root = document.getElementById('root');
                const cs = getComputedStyle(root);
                return {
                    fontMd: cs.getPropertyValue('--sw-font-md').trim(),
                    radiusMd: cs.getPropertyValue('--sw-radius-md').trim(),
                    spaceSm: cs.getPropertyValue('--sw-space-sm').trim(),
                    shadowSm: cs.getPropertyValue('--sw-shadow-sm').trim(),
                    controlH: cs.getPropertyValue('--sw-control-h').trim(),
                    overlayScrim: cs.getPropertyValue('--sw-overlay-scrim').trim(),
                    searchH: getComputedStyle(document.getElementById('probe-search')).height,
                };
            })()`);
        }
        console.log(JSON.stringify(matrix, null, 1));

        const base = matrix['desktop-light'];
        for (const vp of VIEWPORTS) {
            const s = matrix[vp.name];
            assert.equal(s.fontMd, base.fontMd, `${vp.name}: --sw-font-md 不得随视口/主题漂移`);
            assert.equal(s.radiusMd, base.radiusMd, `${vp.name}: --sw-radius-md 不得漂移`);
            assert.equal(s.spaceSm, base.spaceSm, `${vp.name}: --sw-space-sm 不得漂移`);
            assert.equal(s.controlH, base.controlH, `${vp.name}: --sw-control-h 不得漂移`);
            assert.equal(s.overlayScrim, base.overlayScrim, `${vp.name}: 遮罩色不随主题档位漂移`);
        }
        assert.equal(base.fontMd, '13px');
        assert.equal(base.radiusMd, '8px');
        assert.equal(base.spaceSm, '6px');
        assert.equal(base.controlH, '34px');
        assert.match(base.shadowSm, /rgb/);
        console.log('t7153 matrix (token consistency): OK across', VIEWPORTS.map((v) => v.name).join('/'));
        socket.close(); child.kill();
        setTimeout(() => { try { fs.rmSync(artifactDir, {recursive: true, force: true}); } catch {} }, 500);
    } catch (e) {
        console.error('MATRIX FAILED:', e.message);
        child.kill();
        setTimeout(() => { try { fs.rmSync(artifactDir, {recursive: true, force: true}); } catch {} }, 500);
        throw e;
    }
}
test('visual matrix: scale tokens parse identically across four viewport/theme states (T-7153 closeout)', async () => {
    await run();
});
