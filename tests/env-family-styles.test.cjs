// T-7054 C 批次：天气/环境家族 SCSS 视觉增强契约
const test = require("node:test");
const assert = require("node:assert/strict");
const {readStyleSource} = require("./source-scan.cjs");

const scss = readStyleSource("src/styles/_05-settings-widgets.scss");

test("C batch: all four environment components have specific styles", () => {
    for (const id of ["external-weather-open-meteo", "external-air-quality", "external-device-battery", "external-status-uptimekuma"]) {
        assert.match(scss, new RegExp(`\\[data-module-id="${id}"\\]`), `${id} 必须有专属样式`);
    }
});

test("C batch: numeric emphasis and typography are present", () => {
    assert.match(scss, /\[data-module-id="external-weather-open-meteo"\][\s\S]*?font-size: 1\.8em/, "天气温度大号突出");
    assert.match(scss, /\[data-module-id="external-air-quality"\][\s\S]*?font-variant-numeric: tabular-nums/, "AQI 数字排版");
});
