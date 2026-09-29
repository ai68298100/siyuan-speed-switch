// T-7054 A 批次：日进度条+昼夜指示器+偏移量透传契约
const test = require("node:test");
const assert = require("node:assert/strict");
const {readSourceFile, readStyleSource} = require("./source-scan.cjs");

const modelSource = readSourceFile("src/local-time-model.js");
const viewSource = readSourceFile("src/home-view.js");
const scss = readStyleSource("src/styles/_05-settings-widgets.scss");

test("local-time: dayProgress computed and passed through the view chain", () => {
    assert.match(modelSource, /const secondsToday = value\.getHours\(\) \* 3600 \+ value\.getMinutes\(\) \* 60 \+ value\.getSeconds\(\);/,
        "日进度必须基于时分秒计算");
    assert.match(modelSource, /const dayProgress = Math\.round\(\(secondsToday \/ 86400\) \* 100\);/,
        "日进度必须取整到百分比");
    assert.match(modelSource, /return \{stat, items, dayProgress\};/, "dayProgress 必须在返回值中");
    assert.match(viewSource, /dayProgress: Number\.isFinite\(rawSnapshot\.dayProgress\)/, "视图归一化必须透传 dayProgress");
    assert.match(viewSource, /dayProgress: Number\.isFinite\(normalized\.dayProgress\)/, "视图对象必须透传 dayProgress");
});

test("world-clock: day/night indicator and UTC offset in items", () => {
    assert.match(modelSource, /const isDay = zoneParts\.hour >= 6 && zoneParts\.hour < 18;/, "昼夜判定必须基于 6-18 时");
    assert.match(modelSource, /const utcOffset = offset \|\| "";/, "UTC 偏移必须在行数据中");
    assert.match(viewSource, /item\.isDay \? "is-day" : "is-night"/, "视图必须按 isDay 渲染昼夜指示器");
    assert.match(viewSource, /dn\.textContent = item\.isDay \? "☀" : "🌙";/, "昼夜指示器必须有可视符号");
});
