const {readSourceText} = require("./source-scan.cjs");
const {declaresIn} = require("./css-block-scan.cjs");
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const home = require("../src/home-model.js");
const store = require("../src/home-store-model.js");
const clock = require("../src/local-time-model.js");
const quote = require("../src/quote-model.js");

const LABELS = {
    hint: "请在配置中填写目标日期",
    untitled: "倒数日",
    remaining: "剩余 {n} 天",
    today: "就是今天",
    passed: "已过 {n} 天",
    yearly: "每年",
    elapsedDays: "已经 {n} 天",
};

// ---------- T-6455 countdown 累计模式 ----------
test("countdown elapsed mode counts days since the most recent occurrence", () => {
    const past = clock.buildCountdownSnapshot(
        new Date(2026, 8, 17),
        {targetDate: "2026-01-01", title: "开工", mode: "累计"},
        LABELS,
    );
    assert.equal(past.stat.value, "259"); // 2026-09-17 − 2026-01-01 的整天差
    assert.equal(past.stat.label, "已经 259 天");
    assert.equal(past.items[0].label, "开工 · 2026-01-01");
    const yearly = clock.buildCountdownSnapshot(
        new Date(2026, 5, 15),
        {targetDate: "2020-01-01", title: "纪念日", repeat: "每年", mode: "累计"},
        LABELS,
    );
    assert.equal(yearly.stat.value, "165", "每年重复取最近周年（2026-01-01）起算");
    assert.equal(yearly.items[0].label, "纪念日 · 每年 · 01-01");
    const future = clock.buildCountdownSnapshot(
        new Date(2026, 8, 17),
        {targetDate: "2027-05-01", title: "未到", mode: "累计"},
        LABELS,
    );
    assert.equal(future.stat.value, "0", "目标尚未到来时记 0，不伪造");
    assert.equal(clock.normalizeCountdownConfig({}).mode, "countdown");
    assert.equal(clock.normalizeCountdownConfig({mode: "累计"}).mode, "elapsed");
});

test("countdown countdown mode stays the default with unchanged output", () => {
    const standard = clock.buildCountdownSnapshot(
        new Date(2026, 8, 17),
        {targetDate: "2027-01-01", title: "DDL"},
        LABELS,
    );
    assert.equal(standard.stat.value, "106");
    assert.equal(standard.stat.label, "剩余 106 天");
    const explicit = clock.buildCountdownSnapshot(
        new Date(2026, 8, 17),
        {targetDate: "2027-01-01", title: "DDL", mode: "倒数"},
        LABELS,
    );
    assert.equal(explicit.stat.value, standard.stat.value);
    assert.equal(explicit.stat.label, standard.stat.label);
});

// ---------- T-6456 year-progress 周期 ----------
test("year progress supports year, quarter and month calendar windows", () => {
    const labels = {elapsed: "已过 {x}", remaining: "剩 {x}"};
    const at = new Date(2026, 8, 20); // 2026-09-20
    const year = clock.buildYearProgressSnapshot(at, {}, labels);
    assert.equal(year.stat.label, "2026");
    assert.equal(year.stat.arc.max, 365);
    const quarter = clock.buildYearProgressSnapshot(at, {period: "季度"}, labels);
    assert.equal(quarter.stat.label, "2026 Q3");
    assert.equal(quarter.stat.arc.max, 92); // 7 月 31 + 8 月 31 + 9 月 30
    assert.equal(quarter.stat.arc.value, 82); // 62（7、8 月）+ 20
    assert.equal(quarter.stat.progress, Math.round(82 / 92 * 100));
    const month = clock.buildYearProgressSnapshot(at, {period: "月份"}, labels);
    assert.equal(month.stat.label, "2026-09");
    assert.equal(month.stat.arc.max, 30);
    assert.equal(month.stat.arc.value, 20);
    assert.equal(month.items.map((item) => item.label).join("|"), "已过 20|剩 10");
    assert.equal(clock.normalizeYearProgressConfig({}).period, "年度");
    assert.equal(clock.normalizeYearProgressConfig({period: "季度"}).period, "季度");
    // 闰年 2 月：窗口由日历给出
    const leapMonth = clock.buildYearProgressSnapshot(new Date(2024, 1, 29), {period: "月份"}, labels);
    assert.equal(leapMonth.stat.arc.max, 29);
    assert.equal(leapMonth.stat.arc.value, 29);
    assert.equal(leapMonth.stat.value, "100%");
});

// ---------- schema/section contracts ----------
test("second-round schemas land in semantic sections and stay bounded", () => {
    const modules = home.registerModules([]);
    const byId = new Map(modules.map((m) => [m.moduleId, m]));
    assert.deepEqual(byId.get("countdown").configSchema.map((f) => f.key), ["title", "targetDate", "mode", "repeat", "showTargetDate", "emphasis"]);
    assert.deepEqual(byId.get("year-progress").configSchema.map((f) => f.key), ["period", "showElapsed", "showRemaining"]);
    assert.equal(store.resolveHomeConfigSection("countdown", "mode"), "display");
    assert.equal(store.resolveHomeConfigSection("year-progress", "period"), "range");
    for (const id of ["countdown", "year-progress"]) {
        assert.ok(byId.get(id).configSchema.length <= 12, `${id} stays within the protocol v2 field budget`);
    }
});

test("ADR 0062 recalibrates the raw bundle self-discipline line", () => {
    const gate = readSourceText(path.join(__dirname, "host", "release-quality.test.cjs"));
    assert.match(gate, /const budget = 832 \* 1024;/);
    // 校准日期备注本身就在注释里——按门禁清单 D-395 例外用原始文本断言注释
    const gateRaw = fs.readFileSync(path.join(__dirname, "host", "release-quality.test.cjs"), "utf8");
    assert.match(gateRaw, /2026-09-19 \(ADR 0062\)/);
    const adr = fs.readFileSync(path.join(__dirname, "..", "docs", "adr", "0062-raw-bundle-line-recalibration.md"), "utf8");
    assert.match(adr, /832 KiB/);
    assert.match(adr, /512 KiB/);
    const zh = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "src", "i18n", "zh-CN.json"), "utf8"));
    const en = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "src", "i18n", "en.json"), "utf8"));
    assert.equal(zh.homeCountdownElapsed, "已经 {n} 天");
    assert.equal(en.homeCountdownElapsed, "{n} days since");
});

// ---------- T-6457 display 覆盖试点（时间/倒数/引言） ----------
test("display override emphasis tokens flow into stat snapshots", () => {
    const at = new Date(2026, 8, 17, 15, 5);
    const plain = clock.buildLocalTimeSnapshot(at, "en-US", {}, {});
    assert.equal(plain.stat.emphasis, undefined, "标准档不携带令牌");
    const large = clock.buildLocalTimeSnapshot(at, "en-US", {}, {emphasis: "大"});
    assert.equal(large.stat.emphasis, "large");
    const xl = clock.buildLocalTimeSnapshot(at, "en-US", {}, {emphasis: "特大"});
    assert.equal(xl.stat.emphasis, "xl");
    assert.equal(clock.buildLocalTimeSnapshot(at, "en-US", {}, {emphasis: "hack"}).stat.emphasis, undefined);
    const countdown = clock.buildCountdownSnapshot(
        new Date(2026, 8, 17),
        {targetDate: "2027-01-01", title: "DDL", emphasis: "特大"},
        LABELS,
    );
    assert.equal(countdown.stat.emphasis, "xl");
    const elapsed = clock.buildCountdownSnapshot(
        new Date(2026, 8, 17),
        {targetDate: "2026-01-01", mode: "累计", emphasis: "大"},
        LABELS,
    );
    assert.equal(elapsed.stat.emphasis, "large");
    const quoteSnapshot = quote.buildDailyQuoteSnapshot(new Date(2026, 8, 17), {emphasis: "大"}, {title: "每日引言"});
    assert.equal(quoteSnapshot.stat.emphasis, "large");
    const quotePlain = quote.buildDailyQuoteSnapshot(new Date(2026, 8, 17), {}, {title: "每日引言"});
    assert.equal(quotePlain.stat.emphasis, undefined);
});

test("display override has a whitelisted view path and real css rules", () => {
    const view = readSourceText(path.join(__dirname, "..", "src", "home-view.js"));
    assert.match(view, /\["large", "xl"\]\.includes\(rawSnapshot\.stat\.emphasis\)/, "归一层白名单必须存在");
    assert.match(view, /sw__home-stat--\$\{view\.stat\.emphasis\}/, "渲染层按令牌拼修饰类");
    const css = readSourceText(path.join(__dirname, "..", "src", "styles", "_07-sidebar-panel-store.scss"));
    assert.ok(declaresIn(css, ".sw__home-stat--large .sw__home-stat-value", /font-size: 36px/), "large 修饰类必须自己声明字号");
    assert.ok(declaresIn(css, ".sw__home-stat--xl .sw__home-stat-value", /font-size: 46px/), "xl 修饰类必须自己声明字号");
    const schema = home.registerModules([]).filter((m) => ["external-local-time", "countdown", "external-quote-daily"].includes(m.moduleId));
    for (const def of schema) {
        const emphasis = def.configSchema.find((f) => f.key === "emphasis");
        assert.ok(emphasis, `${def.moduleId} exposes the emphasis field`);
        assert.deepEqual(emphasis.options, ["标准", "大", "特大"]);
    }
    assert.equal(store.resolveHomeConfigSection("external-local-time", "emphasis"), "display");
});
