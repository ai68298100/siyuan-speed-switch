// Real Chromium acceptance for the production floating-ball controller, panel,
// and complete stylesheet. This is an isolated browser fixture, not SiYuan or
// Android evidence. Run: node tests/floating-ball-browser-smoke.cjs [--negative]
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {spawn} = require("node:child_process");
const {createRequire} = require("node:module");
const sass = require("sass");
const esbuild = createRequire(require.resolve("esbuild-loader"))("esbuild");

const repo = path.resolve(__dirname, "..");
const artifactDir = path.join(repo, ".tmp", "floating-ball-browser");
const candidates = [process.env.BROWSER_PATH,
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser",
].filter(Boolean);
const browserPath = candidates.find((candidate) => fs.existsSync(candidate));
if (!browserPath) throw new Error("Chromium not found; set BROWSER_PATH to Edge, Chrome, or Chromium.");
fs.mkdirSync(artifactDir, {recursive: true});
const profile = fs.mkdtempSync(path.join(artifactDir, "profile-"));
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const css = fs.readFileSync(path.join(__dirname, "fixtures/siyuan-mobile-base.css"), "utf8")
    + sass.compile(path.join(repo, "src/index.scss"), {style: "compressed", logger: {warn() {}, debug() {}}}).css;
const bundle = esbuild.buildSync({stdin: {
    contents: `window.__fab = {...require('./floating-ball-ui.ts'), ...require('./floating-ball-panel.js'),
        ...require('./floating-ball-model.js'), ...require('./quick-actions.js')};`,
    resolveDir: path.join(repo, "src"), loader: "js",
}, bundle: true, format: "iife", platform: "browser", write: false}).outputFiles[0].text;
// The isolated page has no SiYuan sprite. These small fixture-only symbols
// make screenshots readable; layout and handlers still come from production.
const iconPaths = {
    iconLayout: '<path d="M3 3h18v18H3zM10 3v18M10 10h11"/>',
    iconSearch: '<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',
    iconCalendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 2v6M17 2v6M3 11h18M7 15h3M14 15h3"/>',
    iconSettings: '<circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4M5 5l3 3M16 16l3 3M19 5l-3 3M8 16l-3 3"/>',
    iconLayoutHome: '<path d="m2 11 10-9 10 9M5 9v12h14V9M10 21v-7h4v7"/>',
    iconPlugin: '<path d="M5 5h14v14H5zM12 2v6M12 16v6M2 12h6M16 12h6"/>',
    iconMore: '<circle cx="4" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="20" cy="12" r="1"/>',
};
const sprite = '<svg aria-hidden="true" style="position:absolute;width:0;height:0;overflow:hidden">'
    + Object.entries(iconPaths).map(([id, content])=>`<symbol id="${id}" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="1.7">${content}</g></symbol>`).join("") + '</svg>';

async function main() {
    const child = spawn(browserPath, ["--headless=new", "--disable-gpu", "--disable-extensions", "--no-first-run",
        "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"], {stdio: "ignore", windowsHide: true});
    let socket;
    try {
        const portFile = path.join(profile, "DevToolsActivePort");
        for (let attempt = 0; !fs.existsSync(portFile) && attempt < 100; attempt += 1) await delay(100);
        assert.ok(fs.existsSync(portFile), "Chromium must publish its debugging port");
        const port = Number(fs.readFileSync(portFile, "utf8").split(/\r?\n/)[0]);
        const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json());
        const target = targets.find((entry) => entry.type === "page");
        assert.ok(target?.webSocketDebuggerUrl, "isolated Chromium page must exist");
        socket = new WebSocket(target.webSocketDebuggerUrl);
        await new Promise((resolve, reject) => {
            socket.addEventListener("open", resolve, {once: true});
            socket.addEventListener("error", reject, {once: true});
        });
        const pending = new Map();
        let id = 0;
        socket.addEventListener("message", (event) => {
            const result = JSON.parse(String(event.data));
            const request = pending.get(result.id);
            if (!request) return;
            pending.delete(result.id);
            clearTimeout(request.timer);
            if (result.error) request.reject(new Error(result.error.message));
            else request.resolve(result.result);
        });
        const command = (method, params = {}) => new Promise((resolve, reject) => {
            const requestId = ++id;
            const timer = setTimeout(() => { pending.delete(requestId); reject(new Error(`CDP timeout: ${method}`)); }, 10000);
            pending.set(requestId, {resolve, reject, timer});
            socket.send(JSON.stringify({id: requestId, method, params}));
        });
        const evaluate = async (expression) => {
            const value = await command("Runtime.evaluate", {expression, returnByValue: true, awaitPromise: true});
            if (value.exceptionDetails) throw new Error(value.exceptionDetails.exception?.description || value.exceptionDetails.text);
            return value.result.value;
        };
        const settle = () => evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
        const metrics = async (width, height) => {
            await command("Emulation.setDeviceMetricsOverride", {width, height, deviceScaleFactor: 1, mobile: false});
            await settle();
        };
        const mouse = (type, x, y, button = "left") => command("Input.dispatchMouseEvent", {type, x, y, button,
            buttons: type === "mouseReleased" ? 0 : (button === "right" ? 2 : 1), clickCount: type === "mouseMoved" ? 0 : 1});
        const key = async (key, code = key, modifiers = 0, windowsVirtualKeyCode) => {
            await command("Input.dispatchKeyEvent", {type: "keyDown", key, code, modifiers, windowsVirtualKeyCode});
            await command("Input.dispatchKeyEvent", {type: "keyUp", key, code, modifiers, windowsVirtualKeyCode});
        };
        const screenshot = async (name) => {
            const result = await command("Page.captureScreenshot", {format: "png", captureBeyondViewport: false});
            fs.writeFileSync(path.join(artifactDir, `${name}.png`), Buffer.from(result.data, "base64"));
        };
        await command("Runtime.enable");
        await command("Page.enable");
        await command("Emulation.setEmulatedMedia", {features: [{name: "prefers-reduced-motion", value: "reduce"}]});
        await evaluate(`document.head.innerHTML = '<meta name="viewport" content="width=device-width,initial-scale=1">';
            document.body.style.margin='0'; document.body.style.fontFamily='sans-serif';
            const style = document.createElement('style'); style.id='floating-ball-smoke-production'; style.textContent=${JSON.stringify(css)}; document.head.appendChild(style);`);
        await evaluate(bundle);
        await evaluate(`window.__mount = (options = {}) => {
            window.__current?.panel.destroy(); window.__current?.controller.destroy(); document.body.innerHTML=${JSON.stringify(sprite)};
            const f=window.__fab, config=f.createDefaultFloatingBallConfig(), surface=options.surface || 'desktop';
            const dark=Boolean(options.dark); document.documentElement.dataset.themeMode=dark?'dark':'light';
            document.documentElement.className=dark?'neo-mode-dark':'';
            config.enabled[surface]=true; config.behavior.snap=options.snap!==false;
            config.position[surface]={edge:options.edge||'right', yRatio:options.yRatio??0.72};
            if (options.xRatio!==undefined) config.position[surface].xRatio=options.xRatio;
            if(options.six) config.actions[surface].unshift({actionId:'switcher',enabled:true,firstLayer:true,order:0});
            const plugins=[{id:'weather-plugin',kind:'adapter',value:'weather/show',label:'Weather report',icon:'iconPlugin',
                providerName:'Weather Toolbox',targets:['desktop','sidebar','mobile'],enabled:true},
                {id:'notes-plugin',kind:'adapter',value:'notes/show',label:'Notebook tools',icon:'iconPlugin',
                providerName:'Notes Toolbox',targets:['desktop','sidebar','mobile'],enabled:true}];
            plugins.forEach((a,i)=>config.actions[surface].push({actionId:a.id,enabled:true,firstLayer:false,order:100+i}));
            const host=document.createElement('div'); document.body.appendChild(host);
            if(surface==='sidebar') host.style.cssText='position:absolute;left:40px;top:20px;width:184px;height:260px;border:1px solid var(--b3-border-color);';
            const state={executions:[],positions:[],switcher:0,managed:0,host,config}; let panel;
            const controller=f.createFloatingBallUi({document,surface,host,observeHost:false,halfHide:false,idleDelayMs:60000,
                position:config.position[surface],snap:config.behavior.snap,hideOnScroll:false,
                resolveBounds:surface==='sidebar'?()=>host.getBoundingClientRect():undefined,
                onOpenSwitcher:()=>state.switcher++,onOpenMore:()=>panel.openMore(),
                onPositionChange:p=>state.positions.push(p),onActionTarget:target=>target.click()});
            const root=controller.mount(); panel=f.createFloatingBallPanelController({document,container:root,surface,config,
                actions:[...f.getBuiltinQuickActions(),...plugins],resolveSupport:()=> 'supported',
                onOpenMore:()=>controller.setState('more'),onCloseMore:()=>controller.setState('docked'),
                onAction:a=>state.executions.push(a.actionId||a.id),onManageSettings:()=>state.managed++});
            panel.mount(); window.__current=Object.assign(state,{root,panel,controller}); return true;
        };
        window.__measure=()=>{
            const s=window.__current,rect=n=>{const r=n.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};};
            const buttons=[...s.root.querySelectorAll('.sw__floating-ball-first-layer button')].filter(n=>!n.hidden);
            const bounds=s.root.dataset.surface==='sidebar'?rect(s.host):{left:0,top:0,right:innerWidth,bottom:innerHeight};
            return {state:s.controller.getState(),ball:rect(s.root.querySelector('.sw-fab-trigger')),bounds,
                targets:buttons.map(n=>({id:n.dataset.actionId,...rect(n),visibility:getComputedStyle(n).visibility,
                    color:getComputedStyle(n).color,background:getComputedStyle(n).backgroundColor})),
                executions:s.executions,positions:s.positions,switcher:s.switcher};
        };`);
        const mount = async (options) => { await evaluate(`window.__mount(${JSON.stringify(options)})`); await settle(); };
        const beginDrag = async () => {
            const measurement = await evaluate("window.__measure()");
            const {ball} = measurement;
            const x = (ball.left + ball.right) / 2, y = (ball.top + ball.bottom) / 2;
            await mouse("mouseMoved", x, y);
            await mouse("mousePressed", x, y);
            await mouse("mouseMoved", x + (x > (measurement.bounds.left + measurement.bounds.right) / 2 ? -16 : 16), y);
            await settle();
            return evaluate("window.__measure()");
        };
        const assertTargets = (measurement, expectedCount, name) => {
            assert.equal(measurement.targets.length, expectedCount, `${name}: target count`);
            assert.ok(["dragging", "targeting"].includes(measurement.state), `${name}: pointer must enter drag state`);
            for (const rect of measurement.targets) {
                assert.ok(rect.width >= 43.5 && rect.height >= 43.5, `${name}: 44px target ${rect.id} (${rect.width}x${rect.height})`);
                assert.equal(rect.visibility, "visible", `${name}: target ${rect.id} visible`);
                assert.ok(rect.left >= measurement.bounds.left - 0.6 && rect.right <= measurement.bounds.right + 0.6
                    && rect.top >= measurement.bounds.top - 0.6 && rect.bottom <= measurement.bounds.bottom + 0.6,
                `${name}: target ${rect.id} remains inside bounds: ${JSON.stringify({rect,bounds:measurement.bounds})}`);
            }
        };
        const scenarios = [
            {name:"desktop-top",surface:"desktop",width:1024,height:768,edge:"right",yRatio:0},
            {name:"desktop-bottom",surface:"desktop",width:1024,height:768,edge:"left",yRatio:1},
            {name:"sidebar-top",surface:"sidebar",width:600,height:400,edge:"left",yRatio:0},
            {name:"sidebar-bottom",surface:"sidebar",width:600,height:400,edge:"right",yRatio:1},
            {name:"mobile-top",surface:"mobile",width:390,height:844,edge:"right",yRatio:0},
            {name:"mobile-bottom",surface:"mobile",width:390,height:844,edge:"left",yRatio:1},
            {name:"mobile-landscape",surface:"mobile",width:700,height:240,edge:"right",yRatio:1},
        ];
        const colors = {};
        let assertions = 0;
        for (const dark of [false,true]) for (const scenario of scenarios) {
            await metrics(scenario.width,scenario.height);
            await mount({...scenario,dark,six:true});
            const measurement=await beginDrag(), name=`${scenario.name}-${dark?'dark':'light'}`;
            assertTargets(measurement,6,name);
            if(scenario.name==='desktop-top') colors[dark?'dark':'light']=measurement.targets[0];
            await screenshot(name);
            await mouse("mouseReleased",(measurement.bounds.left+measurement.bounds.right)/2,
                (measurement.bounds.top+measurement.bounds.bottom)/2);
            console.log(`PASS ${name}: six targets, bounds, 44px`); assertions++;
        }
        assert.notEqual(colors.dark.color, colors.light.color,"theme changes target text color");
        assert.notEqual(colors.dark.background, colors.light.background,"theme changes target background");

        await metrics(1024,768); await mount({surface:"desktop",edge:"right",yRatio:0.5});
        const clickBall=(await evaluate("window.__measure()")).ball;
        await mouse("mousePressed",(clickBall.left+clickBall.right)/2,(clickBall.top+clickBall.bottom)/2);
        await mouse("mouseReleased",(clickBall.left+clickBall.right)/2,(clickBall.top+clickBall.bottom)/2);
        assert.equal(await evaluate("window.__current.switcher"),1,"an ordinary click must increment the observed switcher callback");
        console.log("PASS real click: observed switcher callback is live before no-click assertions");assertions++;
        await mount({surface:"desktop",edge:"right",yRatio:0.5});
        const initial = await beginDrag(); assertTargets(initial,5,"default-drag");
        const journal = initial.targets.find(entry=>entry.id==='journal'); assert.ok(journal,"default journal target exists");
        const x=(journal.left+journal.right)/2,y=(journal.top+journal.bottom)/2;
        await mouse("mouseMoved",x,y); await settle(); await mouse("mouseReleased",x,y); await settle();
        const activated=await evaluate("window.__measure()");
        assert.deepEqual(activated.executions,["journal"],"one drag executes the default journal exactly once");
        assert.equal(activated.switcher,0,"the synthetic post-drag click must not open switcher");
        assert.equal(activated.positions.length,0,"action selection preserves stored position");
        console.log("PASS real pointer drag: journal exactly once, no switcher or position side effect"); assertions++;
        for(let repeat=1;repeat<100;repeat++) {
            const again=await beginDrag(),target=again.targets.find(entry=>entry.id==='journal');
            const x=(target.left+target.right)/2,y=(target.top+target.bottom)/2;
            await mouse("mouseMoved",x,y);await mouse("mouseReleased",x,y);
        }
        const repeated=await evaluate("window.__measure()");
        assert.equal(repeated.executions.length,100,"100 drags execute exactly 100 actions");
        assert.ok(repeated.executions.every(id=>id==='journal'),"all repeated drags select the intended target");
        assert.equal(await evaluate("document.querySelectorAll('.sw-fab-root').length"),1,"repeated gestures keep one portal");
        assert.equal(repeated.switcher,0,"repeated gestures never leak a switcher click");
        console.log("PASS 100 real pointer drags: one execution per gesture and one portal");assertions++;

        await mount({surface:"desktop",edge:"right",snap:false}); await beginDrag();
        await mouse("mouseMoved",420,330); await mouse("mouseReleased",420,330); await settle();
        const free=await evaluate("window.__measure()");
        assert.equal(free.positions.length,1,"free drop stores one position");
        assert.ok(free.positions[0].xRatio>0.3&&free.positions[0].xRatio<0.5,"free horizontal ratio is retained");
        assert.ok(Math.abs((free.ball.left+free.ball.right)/2-420)<1,"free ball stays at the drop point");
        console.log("PASS free placement: actual drop geometry and one persistence callback"); assertions++;

        for (const surface of ["desktop","sidebar","mobile"]) {
            await metrics(surface==='mobile'?390:600,surface==='mobile'?844:400);
            await mount({surface,edge:"right",yRatio:1});
            await evaluate("window.__current.controller.focus()"); await key("ContextMenu","ContextMenu",0,93); await settle();
            const opened=await evaluate(`(()=>{const s=window.__current,drawer=s.root.querySelector('.sw__floating-ball-more'),r=drawer.getBoundingClientRect();
                return {open:s.panel.isMoreOpen(),focused:document.activeElement.className,left:r.left,right:r.right,top:r.top,bottom:r.bottom,
                    bounds:window.__measure().bounds,searchHeight:s.root.querySelector('input[type=search]').getBoundingClientRect().height};})()`);
            assert.equal(opened.open,true,`${surface}: keyboard opens more`);
            assert.equal(opened.focused,"sw__floating-ball-more-search",`${surface}: search receives focus`);
            assert.equal(await evaluate("window.__current.root.querySelector('.sw__floating-ball-more [data-action-id=search] .sw__floating-ball-action-label')?.textContent"),
                await evaluate("window.__fab.getBuiltinQuickActions().find(action=>action.id==='search').label"),
                `${surface}: search action keeps its name rather than the search-field placeholder`);
            assert.ok(opened.left>=opened.bounds.left-1&&opened.right<=opened.bounds.right+1&&opened.top>=opened.bounds.top-1&&opened.bottom<=opened.bounds.bottom+1,
                `${surface}: drawer stays within its host: ${JSON.stringify(opened)}`);
            await command("Input.insertText",{text:"Weather Toolbox"});
            const matches=await evaluate("[...document.querySelectorAll('.sw__floating-ball-more-row')].filter(n=>!n.hidden).map(n=>n.querySelector('button').dataset.actionId)");
            assert.deepEqual(matches,["weather-plugin"],`${surface}: searches provider name`);
            await key("Tab","Tab",0,9);
            assert.equal(await evaluate("document.activeElement.dataset.actionId"),"weather-plugin",`${surface}: keyboard reaches filtered result`);
            await screenshot(`${surface}-drawer-search`);
            await key("Escape","Escape",0,27); await settle();
            assert.equal(await evaluate("window.__current.panel.isMoreOpen()"),false,`${surface}: Escape closes`);
            assert.equal(await evaluate("document.activeElement.className"),"sw-fab-trigger",`${surface}: focus returns to ball`);
            console.log(`PASS ${surface} drawer: bounds, provider search, Tab and Escape focus`); assertions++;
        }

        // Real browser zoom changes visualViewport independently of innerHeight.
        // This covers the same geometry boundary used for an on-screen keyboard,
        // without claiming to simulate Android's keyboard or native touch input.
        await metrics(390,844); await mount({surface:"mobile",edge:"right",yRatio:1});
        await command("Emulation.setPageScaleFactor",{pageScaleFactor:1.5}); await settle();
        const visible=await evaluate(`(()=>{const r=window.__current.root.querySelector('.sw-fab-trigger').getBoundingClientRect();
            return {right:r.right,bottom:r.bottom,width:visualViewport.width,height:visualViewport.height,layoutHeight:innerHeight};})()`);
        assert.ok(visible.height<visible.layoutHeight,"visual viewport must actually shrink");
        assert.ok(visible.right<=visible.width+1&&visible.bottom<=visible.height-47,"ball remains above the visual viewport bottom reserve");
        await evaluate("window.__current.panel.openMore()");await settle();
        const visibleDrawer=await evaluate(`(()=>{const r=window.__current.root.querySelector('.sw__floating-ball-more').getBoundingClientRect();
            return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:visualViewport.width,height:visualViewport.height};})()`);
        assert.ok(visibleDrawer.left>=-1&&visibleDrawer.right<=visibleDrawer.width+1&&visibleDrawer.top>=-1&&visibleDrawer.bottom<=visibleDrawer.height+1,
            `mobile drawer must follow visual viewport: ${JSON.stringify(visibleDrawer)}`);
        await screenshot("mobile-visual-viewport");
        await command("Emulation.setPageScaleFactor",{pageScaleFactor:1});
        console.log("PASS visual viewport: real zoom shrink repositions ball within visible bounds"); assertions++;

        if(process.argv.includes("--negative")) {
            await metrics(1024,768); await mount({surface:"desktop",six:true}); await beginDrag();
            for(const injection of [
                {name:"negative-hit-area",rule:"width:20px!important;height:20px!important;min-width:20px!important;min-height:20px!important;padding:0!important;",expected:"44px target"},
                {name:"negative-target-bounds",rule:"top:-2000px!important;",expected:"remains inside bounds"},
            ]) {
                await evaluate(`(()=>{const violation=document.createElement('style');violation.id='negative-floating-rule';
                    violation.textContent=${JSON.stringify(".sw-fab-root.sw__fab .sw__floating-ball-action{")}+${JSON.stringify(injection.rule)}+'}';document.head.appendChild(violation);})()`);
                let failure;
                try { assertTargets(await evaluate("window.__measure()"),6,injection.name); } catch(error) { failure=error; }
                assert.ok(failure?.message.includes(injection.expected),`negative injection must fail the named ${injection.expected} assertion`);
                await evaluate("document.querySelector('#negative-floating-rule').remove()"); await settle();
                assert.equal(await evaluate("document.querySelector('#floating-ball-smoke-production').textContent"),css,"production CSS is restored byte for byte");
                assertTargets(await evaluate("window.__measure()"),6,`restored-${injection.name}`);
                console.log(`PASS NEGATIVE ${injection.name}: ${injection.expected}; injected style removed and original CSS passes`);
            }
        }
        console.log(`Floating-ball Chromium smoke: ${assertions} scenarios passed. Screenshots: ${artifactDir}`);
    } finally {
        socket?.close(); child.kill();
        // Only remove the exact profile created above, under this test's ignored
        // artifact directory. Screenshots remain available for visual review.
        await delay(200);
        if(path.dirname(profile)===artifactDir) try { fs.rmSync(profile,{recursive:true,force:true,maxRetries:2,retryDelay:100}); } catch {}
    }
}
main().catch((error)=>{console.error(error);process.exitCode=1;});
