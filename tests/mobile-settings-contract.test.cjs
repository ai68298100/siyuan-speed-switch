// T-7000：移动设置必须把已有字段接到可操作控件，并说明旧 FAB 迁移。
const test = require("node:test");
const assert = require("node:assert/strict");
const {readSourceFile} = require("./source-scan.cjs");

const sections = readSourceFile("src/settings-sections.ts");
const index = readSourceFile("src/index.ts");
const styles = readSourceFile("src/styles/_05-settings-widgets.scss");
const zh = require("../src/i18n/zh-CN.json");
const en = require("../src/i18n/en.json");

test("mobile settings bind thumbnail height to the bounded range-number control", () => {
    assert.ok(sections.includes("this.rangeNumber(s.mobileThumbHeight, MOBILE_THUMB_HEIGHT_MIN_PX, MOBILE_THUMB_HEIGHT_MAX_PX"));
    assert.ok(sections.includes("updateSettings({mobileThumbHeight: v})"));
});

test("mobile settings register a reset group for layout fields", () => {
    assert.ok(sections.includes('settingsGroupMobileLayout: ["mobileColumns", "mobileThumbHeight"]'));
    assert.ok(sections.includes('appendGroupResetButton.call(this, this.settingGroupTitle(this.i18n.settingsGroupMobileLayout'));
});

test("range-number production control contains synchronized slider and numeric input", () => {
    assert.ok(index.includes("private rangeNumber("));
    assert.ok(index.includes('range.type = "range"'));
    assert.ok(index.includes('numeric.type = "number"'));
    assert.ok(index.includes('range.addEventListener("input", () => sync(range.value))'));
    assert.ok(index.includes('range.addEventListener("change", () => apply(range.value))'));
    assert.ok(index.includes('numeric.addEventListener("change", () => apply(numeric.value))'));
});

test("mobile settings explain the legacy FAB migration in both locales", () => {
    assert.equal(typeof zh.mobileFabMigrationHint, "string");
    assert.equal(typeof en.mobileFabMigrationHint, "string");
    assert.ok(zh.mobileFabMigrationHint.length > 12);
    assert.ok(en.mobileFabMigrationHint.length > 24);
    assert.ok(sections.includes("this.i18n.mobileFabMigrationHint"));
});

test("mobile range control stays usable in narrow settings panels", () => {
    assert.ok(styles.includes(".sw-settings__range-number {\n        display: flex;\n        align-items: center;\n        gap: 8px;\n        min-width: 240px;"));
    assert.ok(styles.includes(".sw-settings__range-number { min-width: 0; width: 100%; gap: 6px; }"));
    assert.ok(styles.includes(".sw-settings__range-number .sw-settings__range-value { flex-basis: 62px; width: 62px; min-height: 40px; }"));
});
