const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const {readSourceText} = require("./source-scan.cjs");
const {declaresIn, findRules} = require("./css-block-scan.cjs");

const scss = readSourceText(path.join(__dirname, "..", "src", "styles", "_12-r54-surface-adapter.scss"));
const assembled = readSourceText(path.join(__dirname, "..", "src", "index.scss"));
const weather = '.sw-home.sw-home--compact:not(.sw-home--mobile) .sw-home__cell[data-module-id="external-weather-open-meteo"]';
const countdown = '.sw-home.sw-home--compact:not(.sw-home--mobile) .sw-home__cell[data-module-id="countdown"]';
const optional = '.sw-home.sw-home--compact:not(.sw-home--mobile) .sw-home__cell:is([data-module-id="external-weather-open-meteo"], [data-module-id="countdown"])';

test("compact optional cards use the final surface layer and a neutral weather surface", () => {
    assert.ok(assembled.lastIndexOf(".sw-home {") < assembled.indexOf(".sw-home.sw-home--compact"),
        "optional compact overrides must load after the base workbench skin");
    assert.ok(declaresIn(scss, optional, /background:\s*var\(--b3-theme-background\)/, {topLevel: true}),
        "compact optional cards must replace poster surfaces with a theme surface");
    assert.ok(declaresIn(scss, optional, /background-image:\s*none/, {topLevel: true}),
        "compact optional cards must explicitly clear material gradient layers");
    assert.ok(declaresIn(scss, optional, /border:\s*1px solid var\(--b3-border-color\)/, {topLevel: true}),
        "compact optional cards must keep a light structural edge");
    const weatherRules = findRules(scss, weather, {topLevel: true});
    assert.equal(weatherRules.length, 1, "compact weather must have one base rule block");
    assert.doesNotMatch(weatherRules[0].declarations, /(?:linear|radial)-gradient\(/,
        "compact weather must not reintroduce the large gradient treatment");
});

test("compact weather uses a small value and bounded forecast rows", () => {
    assert.ok(declaresIn(scss, `${optional} .sw__home-stat-value`, /font-size:\s*var\(--sw-font-2xl,\s*20px\)/, {topLevel: true}),
        "weather temperature must use the compact 20px value tier");
    assert.ok(declaresIn(scss, `${weather} .sw__home-module-list`, /grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/, {topLevel: true}),
        "weather forecast must remain a bounded four-column strip");
    assert.ok(declaresIn(scss, `${weather} .sw__home-module-item-action`, /text-overflow:\s*ellipsis/, {topLevel: true}),
        "weather labels must not push the compact card wider");
    assert.ok(declaresIn(scss, `${weather} .sw__home-module-item-action`, /min-height:\s*16px/, {topLevel: true}),
        "weather forecast rows must fit the compact height track");
    assert.ok(declaresIn(scss, `${weather} .sw__home-module-item-action`, /line-height:\s*1/, {topLevel: true}),
        "weather forecast rows must use a single compact line");
    assert.ok(declaresIn(scss, `${weather} .sw__home-module-context`, /background:\s*transparent/, {topLevel: true}),
        "weather location context must not retain the dark poster pill");
    assert.ok(declaresIn(scss, `${weather} .sw__home-module-item-secondary`, /margin-left:\s*var\(--sw-space-2xs,\s*2px\)/, {topLevel: true}),
        "weather secondary copy must stay available beside the compact label");
    assert.ok(declaresIn(scss, `${weather} .sw__home-module-item.has-link`, /grid-column:\s*1 \/ -1/, {topLevel: true}),
        "weather attribution must occupy a full compact row");
    assert.ok(declaresIn(scss, `${weather} .sw__home-module-item.has-link .sw__home-module-item-action`, /min-height:\s*12px/, {topLevel: true}),
        "weather attribution must use the remaining compact row");
});

test("compact countdown keeps the number, target line and milestone in one light row", () => {
    assert.ok(declaresIn(scss, optional, /background:\s*var\(--b3-theme-background\)/, {topLevel: true}),
        "compact countdown must use the same neutral surface as the other summary cards");
    assert.ok(declaresIn(scss, optional, /background-image:\s*none/, {topLevel: true}),
        "compact countdown must explicitly clear material gradient layers");
    assert.ok(declaresIn(scss, optional, /border:\s*1px solid var\(--b3-border-color\)/, {topLevel: true}),
        "compact countdown must keep a light structural edge");
    assert.ok(declaresIn(scss, `${optional} .sw__home-stat-value`, /font-size:\s*var\(--sw-font-2xl,\s*20px\)/, {topLevel: true}),
        "countdown must cap the large 2em value at the compact tier");
    assert.ok(declaresIn(scss, `${countdown} .sw__home-stat-milestone`, /margin:\s*0 0 0 auto/, {topLevel: true}),
        "countdown milestone must sit beside the number without a vertical gap");
    assert.ok(declaresIn(scss, `${countdown} .sw__home-stat`, /min-height:\s*var\(--sw-control-h-md,\s*26px\)/, {topLevel: true}),
        "countdown hero row must reserve a short compact track");
    assert.ok(declaresIn(scss, `${countdown} .sw__home-stat-label`, /white-space:\s*nowrap/, {topLevel: true}),
        "countdown target copy must stay a single bounded line");
});

test("optional compact cards share 24px controls and preserve stale text", () => {
    const toggle = '.sw-home.sw-home--compact:not(.sw-home--mobile) .sw-home__cell:is([data-module-id="external-weather-open-meteo"], [data-module-id="countdown"]) .sw__home-module-toggle';
    assert.ok(declaresIn(scss, toggle, /width:\s*24px/, {topLevel: true}),
        "optional compact cards must keep a reachable 24px fold control");
    assert.ok(declaresIn(scss, `${optional} .sw__home-module-meta:not(.is-stale)`, /clip-path:\s*inset\(50%\)/, {topLevel: true}),
        "fresh metadata can collapse visually while remaining available to assistive technology");
});
