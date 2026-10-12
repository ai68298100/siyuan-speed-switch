const {readSourceText} = require("./source-scan.cjs");
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {declaresIn} = require('./css-block-scan.cjs');

const root = path.resolve(__dirname, '..');
const storeUiSource = readSourceText(path.join(root, 'src', 'home-store-ui.ts'));

test('component store guide is the single documented source for connectivity prerequisites', () => {
    const guide = fs.readFileSync(path.join(root, 'docs', 'component-store-guide.md'), 'utf8');
    for (const section of ['离线可用', '本机服务', '外部 API', 'ActivityWatch', 'Open-Meteo', 'DailyHotApi', 'NewsNow', 'Bangumi']) {
        assert.match(guide, new RegExp(section));
    }
});

test('store implementation exposes a guide entry point and jumpable guide dialog', () => {
    const source = readSourceText(path.join(root, 'src', 'index.ts'));
    assert.match(source, /homeStoreGuide/);
    assert.match(storeUiSource, /openHomeWidgetGuide/);
    assert.match(storeUiSource,/sw-home-store__guide/);
    assert.match(source, /external-component-installation\.md/);
    assert.match(source, /summarizeHomeStoreDependencies/);
});

test('GitHub candidate audit keeps at least ten explicit, linkable component sources', () => {
    const audit = fs.readFileSync(path.join(root, 'docs', 'external-widget-source-audit.md'), 'utf8');
    const links = audit.match(/https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+/g) || [];
    assert.ok(new Set(links).size >= 10);
    for (const name of ['Hacker News', 'FreshRSS', 'Miniflux', 'Uptime Kuma', 'Syncthing']) {
        assert.match(audit, new RegExp(name, 'i'));
    }
});

test('brand widget audit keeps at least ten scoped candidates without claiming fixed rankings', () => {
    const audit = fs.readFileSync(path.join(root, 'docs', 'external-widget-source-audit.md'), 'utf8');
    assert.match(audit, /手机品牌小组件候选池/);
    assert.match(audit, /不声称固定名次/);
    const rows = audit.split(/\r?\n/).filter((line) => /^\|[^|]+\|[^|]+\|/.test(line));
    assert.ok(rows.length >= 10);
    for (const brand of ['Apple', 'Huawei', 'OPPO', 'Xiaomi']) assert.match(audit, new RegExp(brand, 'i'));
});

test('mobile component panel is explicitly single-column', () => {
    const panelSource = readSourceText(path.join(root, 'src', 'second-panel-ui.ts'));
    // R4 重构（D-376）：设置页“主页”分节的构建在 settings-sections.ts。
    const sections = readSourceText(path.join(root, 'src', 'settings-sections.ts'));
    const styles = readSourceText(path.join(root, 'src', 'index.scss'));
    assert.match(panelSource, /this\.isMobile \? resolveMobileHomeSize\(supported\)/);
    assert.match(panelSource, /cell\.style\.setProperty\("--sw-home-span", String\(Math\.min\(12, preset\.w\)\)\)/);
    assert.match(panelSource, /cell\.style\.gridRow = this\.isMobile \? "auto" :/);
    assert.match(storeUiSource,/device === "mobile" \? \[resolveMobileHomeSize\(declaredSizes\)\]/);
    assert.match(sections, /mobileHomePanelFixed/);
    assert.equal(declaresIn(styles, '.sw-home--mobile .sw-home__grid', /grid-template-columns:\s*1fr !important/, {topLevel: true}), true);
    assert.equal(declaresIn(styles, '.sw-home--mobile .sw-home__grid', /grid-auto-rows:\s*auto !important/, {topLevel: true}), true);
    assert.equal(declaresIn(styles, '.sw-home--mobile .sw-home__cell', /grid-column:\s*1 \/ -1 !important/, {topLevel: true}), true);
    assert.equal(declaresIn(styles, '.sw-home--mobile .sw-home__cell', /grid-row:\s*auto !important/, {topLevel: true}), true);
    assert.equal(declaresIn(styles, '.sw-home--mobile .sw-home__cell', /min-height:\s*112px/, {topLevel: true}), true);
    for (const control of ['.sw__home-module-toggle', '.sw__home-module-retry', '.sw__home-module-item-action', '.sw-home__tool', '.sw-home__open']) {
        const selector = `.sw-home--mobile .sw-home__cell ${control}`;
        assert.equal(declaresIn(styles, selector, /min-height:\s*44px/, {topLevel: true}), true, selector);
        assert.equal(declaresIn(styles, selector, /touch-action:\s*manipulation/, {topLevel: true}), true, selector);
    }
});
