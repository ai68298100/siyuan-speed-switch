const test = require("node:test");
const assert = require("node:assert/strict");
const {readSourceFile} = require("./source-scan.cjs");

const settingsStyles = readSourceFile("src/styles/_02-settings.scss");
const widgetStyles = readSourceFile("src/styles/_05-settings-widgets.scss");

test("settings rail keeps keyboard focus and mobile touch targets", () => {
    assert.match(settingsStyles, /\.sw-settings__tab\s*\{[\s\S]*?min-height:\s*36px/);
    assert.match(settingsStyles, /\.sw-settings__tab\s*\{[\s\S]*?min-height:\s*44px[\s\S]*?touch-action:\s*manipulation/);
    assert.match(settingsStyles, /\.sw-settings__tab\s*\{[\s\S]*?:focus-visible[\s\S]*?box-shadow:\s*var\(--sw-settings-focus-ring\)/);
});

test("settings long copy and actions can shrink without horizontal spill", () => {
    assert.match(settingsStyles, /\.sw-settings__item-action\s*\{[\s\S]*?min-width:\s*0[\s\S]*?max-width:\s*100%/);
    assert.match(settingsStyles, /\.sw-settings__item-action\s*\{[\s\S]*?min-width:\s*0[\s\S]*?max-width:\s*100%[\s\S]*?>\s*\*\s*\{[\s\S]*?min-width:\s*0[\s\S]*?max-width:\s*100%/);
    assert.match(settingsStyles, /\.sw-settings__item-title,[\s\S]*?\.sw-settings__item-desc\s*\{[\s\S]*?overflow-wrap:\s*anywhere/);
});

test("settings search and recovery actions preserve narrow touch targets", () => {
    assert.match(settingsStyles, /\.sw-settings__search-clear\s*\{[\s\S]*?width:\s*44px[\s\S]*?height:\s*44px/);
    assert.match(settingsStyles, /\.sw-settings__search-option\s*\{[\s\S]*?min-height:\s*44px[\s\S]*?touch-action:\s*manipulation/);
    assert.match(settingsStyles, /\.sw-settings__search-clear,[\s\S]*?\.sw-settings__range-number \.sw-settings__range-value\s*\{[\s\S]*?:focus-visible[\s\S]*?outline:\s*2px solid/);
});

test("range control keeps a visible focus ring and a usable thumb", () => {
    assert.match(widgetStyles, /\.sw-settings__range-number \.sw-settings__range\s*\{[\s\S]*?height:\s*32px[\s\S]*?min-height:\s*32px[\s\S]*?touch-action:\s*manipulation/);
    assert.match(widgetStyles, /&::-webkit-slider-thumb\s*\{[\s\S]*?width:\s*22px[\s\S]*?height:\s*22px/);
    assert.match(widgetStyles, /&::-moz-range-thumb\s*\{[\s\S]*?width:\s*18px[\s\S]*?height:\s*18px/);
    assert.match(widgetStyles, /&:focus-visible\s*\{[\s\S]*?outline:\s*2px solid/);
});

test("mobile range value and slider remain usable in narrow panels", () => {
    assert.match(widgetStyles, /\.sw-settings__range-number \.sw-settings__range\s*\{\s*min-width:\s*0;\s*height:\s*44px;\s*min-height:\s*44px;\s*\}/);
    assert.match(widgetStyles, /\.sw-settings__range-number \.sw-settings__range-value\s*\{\s*flex-basis:\s*62px;\s*width:\s*62px;\s*min-height:\s*40px;\s*\}/);
});
