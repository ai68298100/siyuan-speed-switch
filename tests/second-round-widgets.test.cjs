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
const releaseMetrics = require("../scripts/release-readiness-metrics.cjs");

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

test("ADR 0077 recalibrates the raw bundle self-discipline line for the navigation-context batches", () => {
    const gate = readSourceText(path.join(__dirname, "host", "release-quality.test.cjs"));
    assert.match(gate, /metrics\.RAW_BUNDLE_BUDGET_BYTES/);
    assert.equal(releaseMetrics.RAW_BUNDLE_BUDGET_BYTES, 1024 * 1024);
    // 校准日期备注本身就在注释里——按门禁清单 D-395 例外用原始文本断言注释
    const gateRaw = fs.readFileSync(path.join(__dirname, "host", "release-quality.test.cjs"), "utf8");
    assert.match(gateRaw, /2026-09-23 \(ADR 0074\)/);
    assert.match(gateRaw, /2026-09-24 \(ADR 0077\)/);
    const adr = fs.readFileSync(path.join(__dirname, "..", "docs", "adr", "0077-raw-bundle-line-recalibration.md"), "utf8");
    assert.match(adr, /1024 KiB/);
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

// ---------- T-6458/T-6459 写作强度分与 12 个月回看（recent-writing-activity） ----------
const kernel = require("../src/kernel-widget-model.js");

test("writing strength is a bounded exponential smoothing of daily activity", () => {
    const now = new Date(2026, 8, 18, 12).getTime();
    const dayAt = (offsetFromEnd) => {
        const d = new Date(now - offsetFromEnd * 86400000);
        return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
    };
    const labels = {blocks: "块", strength: "写作强度", strengthHalfLife: "半衰期"};
    // 7 天全活跃：解析解 (1 - k^7) = 1 - 0.5^(7/14) ≈ 29%
    const rows = [];
    for (let i = 0; i < 7; i += 1) rows.push({day: dayAt(i), blocks: 2});
    const all = kernel.buildRecentWritingActivitySnapshot(rows, {days: 7, showStrength: "是"}, labels, now);
    const head = all.items[0];
    assert.equal(head.label, "写作强度");
    assert.equal(head.value, `${Math.round((1 - Math.pow(0.5, 0.5)) * 100)}%`, "全活跃 7 天的解析解");
    assert.match(head.secondary, /14 天$/);
    // 只有最早一天活跃：解析解 (1-k)·k^6
    const sparse = kernel.buildRecentWritingActivitySnapshot(
        [{day: dayAt(6), blocks: 2}],
        {days: 7, showStrength: "是"},
        labels,
        now,
    );
    const k = Math.pow(0.5, 1 / 14);
    assert.equal(sparse.items[0].value, `${Math.round((1 - k) * Math.pow(k, 6) * 100)}%`, "首日活跃后衰减 6 天");
    // 关闭开关：不产生强度行（默认）
    const off = kernel.buildRecentWritingActivitySnapshot(rows, {}, labels, now);
    assert.equal(off.items.find((item) => item.label === "写作强度"), undefined);
    // 全零窗口：强度 0%，不是缺测
    const zero = kernel.buildRecentWritingActivitySnapshot([], {days: 7, showStrength: "是", showZero: "是"}, labels, now);
    assert.equal(zero.items[0].value, "0%");
});

test("writing activity window extends to 366 days without truncating recent days", () => {
    assert.equal(kernel.normalizeRecentWritingActivityConfig({days: 999}).days, 366);
    const now = new Date(2026, 8, 18, 12).getTime();
    const keyOf = (offsetFromEnd) => {
        const d = new Date(now - offsetFromEnd * 86400000);
        return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
    };
    // 365 行（模拟 SQL 按 day ASC 返回整年）：旧行数帽 100 会截掉最近日期
    const rows = [];
    for (let offset = 364; offset >= 0; offset -= 1) rows.push({day: keyOf(offset), blocks: 1});
    const snapshot = kernel.buildRecentWritingActivitySnapshot(rows, {days: 366, density: "紧凑", showZero: "是"}, {}, now);
    assert.equal(snapshot.stat.value, "365", "长窗口下最近日期必须计入总量");
    const strength = kernel.buildRecentWritingActivitySnapshot(rows, {days: 366, density: "紧凑", showZero: "是", showStrength: "是"}, {
        strength: "写作强度", strengthHalfLife: "半衰期",
    }, now);
    assert.equal(strength.items.find((item) => item.label === "写作强度").value, `${Math.round((1 - Math.pow(0.5, 365 / 14)) * 100)}%`, "连续 365 天活跃趋近满强度（解析解 1-k^365）");
});

// ---------- T-6460 iCal TZID 解析与有界 RRULE 展开 ----------
const ical = require("../src/ical-model.js");
const icsCalendarOf = (...vevents) => ["BEGIN:VCALENDAR", "VERSION:2.0", ...vevents, "END:VCALENDAR"].join("\r\n");
const icsEvent = (lines) => ["BEGIN:VEVENT", ...lines, "END:VEVENT"].join("\r\n");

test("ical TZID wall-clock times resolve through the named zone", () => {
    const text = icsCalendarOf(icsEvent([
        "DTSTART;TZID=America/New_York:20260920T080000",
        "DTEND;TZID=America/New_York:20260920T090000",
        "SUMMARY:上海晨会",
    ]));
    const parsed = ical.parseIcsEvents(text, {now: Date.parse("2026-09-19T00:00:00Z")});
    assert.equal(parsed.events.length, 1);
    // 纽约 9 月为 UTC-4（夏令时）：当地 08:00 = UTC 12:00，与本机时区无关
    assert.equal(parsed.events[0].start, Date.parse("2026-09-20T12:00:00Z"));
    assert.equal(parsed.events[0].end, Date.parse("2026-09-20T13:00:00Z"));
    // 无效时区回退浮动本地解析，不抛错也不丢事件
    const bad = ical.parseIcsEvents(icsCalendarOf(icsEvent([
        "DTSTART;TZID=Not/AZone:20260920T080000",
        "SUMMARY:坏时区",
    ])), {now: Date.parse("2026-09-19T00:00:00Z")});
    assert.equal(bad.events.length, 1);
});

test("ical rrule daily expansion respects count and stops at the horizon", () => {
    const now = Date.parse("2026-09-20T10:00:00Z");
    const text = icsCalendarOf(icsEvent([
        "DTSTART:20260910T080000Z",
        "DTEND:20260910T083000Z",
        "RRULE:FREQ=DAILY;COUNT=5",
        "SUMMARY:打卡提醒",
    ]));
    const parsed = ical.parseIcsEvents(text, {now});
    assert.equal(parsed.events.length, 5, "COUNT=5 → 恰 5 次发生");
    assert.equal(parsed.events[0].start, Date.parse("2026-09-10T08:00:00Z"));
    const infinite = ical.parseIcsEvents(icsCalendarOf(icsEvent([
        "DTSTART:20260910T080000Z",
        "RRULE:FREQ=DAILY",
        "SUMMARY:无限日程",
    ])), {now});
    const horizon = now + 60 * 86400000;
    assert.ok(infinite.events.every((event) => event.start <= horizon), "无 COUNT/UNTIL 的重复按 60 天地平线截断");
    assert.equal(infinite.events.length, 71, `锚点 2026-09-10 至地平线（now+60 天）逐日发生 ${infinite.events.length}`);
});

test("ical past-dated recurring events become visible inside the window", () => {
    const now = Date.parse("2026-09-20T10:00:00Z");
    const text = icsCalendarOf(icsEvent([
        "DTSTART:20250105T100000Z",
        "DTEND:20250105T110000Z",
        "RRULE:FREQ=WEEKLY;BYDAY=MO",
        "SUMMARY:周一例会",
    ]));
    const parsed = ical.parseIcsEvents(text, {now});
    const inWindow = parsed.events.filter((event) => event.start >= now && event.start <= now + 14 * 86400000);
    assert.ok(inWindow.length >= 2, "过去起点的每周例会必须在未来窗口出现");
    assert.ok(inWindow.every((event) => (new Date(event.start)).getUTCDay() === 1), "全部落在周一");
});

test("ical rrule until, unsupported rules and non-recurring stay single", () => {
    const now = Date.parse("2026-09-20T10:00:00Z");
    const until = ical.parseIcsEvents(icsCalendarOf(icsEvent([
        "DTSTART:20260915T080000Z",
        "RRULE:FREQ=DAILY;UNTIL=20260917T080000Z",
        "SUMMARY:有终点",
    ])), {now});
    assert.equal(until.events.length, 3, "UNTIL 含当日，三次后停止");
    const unsupported = ical.parseIcsEvents(icsCalendarOf(icsEvent([
        "DTSTART:20260101T080000Z",
        "RRULE:FREQ=YEARLY;BYMONTHDAY=1",
        "SUMMARY:年度事件",
    ])), {now});
    assert.equal(unsupported.events.length, 1, "不支持的规则按单次呈现，不猜测语义");
    const plain = ical.parseIcsEvents(icsCalendarOf(icsEvent([
        "DTSTART:20260921T080000Z",
        "SUMMARY:单次",
    ])), {now});
    assert.equal(plain.events.length, 1);
});

test("ical rrule engine is wired with bounded expansion", () => {
    const source = readSourceText(path.join(__dirname, "..", "src", "ical-model.js"));
    assert.match(source, /function expandIcalRrule\(fields, rrule, horizonMs\)/);
    assert.match(source, /ICAL_RRULE_MAX_OCCURRENCES = 120/);
    assert.match(source, /fields\.rrule\s*\?\s*expandIcalRrule\(fields, fields\.rrule, horizon\)/);
});

// ---------- T-6461 切换器动作面板键（Shift+F10 / ContextMenu） ----------
test("switcher keyboard action panel key opens the focused card menu", () => {
    const indexTs = readSourceText(path.join(__dirname, "..", "src", "index.ts"));
    // 键盘分支存在且使用标准上下文菜单键
    const branch = indexTs.indexOf('key === "ContextMenu" || (key === "F10" && event.shiftKey)');
    assert.ok(branch > 0, "action panel key branch must exist");
    assert.ok(indexTs.indexOf("private bindKeydown") > -1 && indexTs.indexOf("private bindKeydown") < branch, "branch lives inside the keydown handler");
    // handlers 在卡片构建时缓存，按键分支取用并复用同一菜单打开函数
    assert.match(indexTs, /cardMenuHandlers\.set\(card, handlers\)/);
    assert.match(indexTs, /const menuHandlers = this\.cardMenuHandlers\.get\(target\);/);
    assert.match(indexTs, /this\.openCardMenu\(tab, target, menuHandlers, rect\.left \+ 16, rect\.top \+ 16\)/);
    // 双语文档提示该按键
    for (const name of ["README.md", "README.en-US.md"]) {
        const readme = fs.readFileSync(path.join(__dirname, "..", name), "utf8");
        assert.match(readme, /Shift\+F10/, `${name} documents the action panel key`);
    }
});

// ---------- T-6462 iCal EXDATE / RDATE ----------
test("ical exdate removes specific occurrences from a recurrence set", () => {
    const now = Date.parse("2026-09-20T10:00:00Z");
    const text = icsCalendarOf(icsEvent([
        "DTSTART:20260915T080000Z",
        "DTEND:20260915T083000Z",
        "RRULE:FREQ=DAILY;COUNT=4",
        "EXDATE:20260917T080000Z",
        "SUMMARY:三次例会",
    ]));
    const parsed = ical.parseIcsEvents(text, {now});
    assert.equal(parsed.events.length, 3, "COUNT=4 生成 4 次，EXDATE 剔除 1 次");
    assert.equal(parsed.events.some((event) => event.start === Date.parse("2026-09-17T08:00:00Z")), false, "被剔除日期不得出现");
    assert.deepEqual(parsed.events.map((event) => event.start), [
        Date.parse("2026-09-15T08:00:00Z"),
        Date.parse("2026-09-16T08:00:00Z"),
        Date.parse("2026-09-18T08:00:00Z"),
    ]);
});

test("ical rdate appends extra occurrences and exdate still applies", () => {
    const now = Date.parse("2026-09-20T10:00:00Z");
    const text = icsCalendarOf(icsEvent([
        "DTSTART:20260921T080000Z",
        "DTEND:20260921T090000Z",
        "RDATE:20260923T100000Z",
        "SUMMARY:单次加补场",
    ]));
    const parsed = ical.parseIcsEvents(text, {now});
    assert.equal(parsed.events.length, 2, "主事件 + RDATE 补场");
    assert.equal(parsed.events[1].start, Date.parse("2026-09-23T10:00:00Z"));
    assert.equal(parsed.events[1].end, Date.parse("2026-09-23T11:00:00Z"), "补场时长与主事件一致");
});

// ---------- T-6463 存储用量透明化 ----------
test("storage usage formatting and summary stay pure and bounded", () => {
    const settings = require("../src/settings-model.js");
    assert.equal(settings.formatStorageBytes(0), "0 B");
    assert.equal(settings.formatStorageBytes(512), "512 B");
    assert.equal(settings.formatStorageBytes(2048), "2 KB");
    assert.equal(settings.formatStorageBytes(15872), "15.5 KB");
    assert.equal(settings.formatStorageBytes(-5), "0 B");
    assert.equal(settings.formatStorageBytes(Number.NaN), "0 B");
    const summary = settings.buildStorageUsageSummary([
        {key: "sw_mru", bytes: 120},
        {key: "sw_thumb_cache", bytes: 40000},
        {key: "sw_settings", bytes: 300},
        {key: "", bytes: 10},
        {key: "bad", bytes: -1},
        null,
    ]);
    assert.deepEqual(summary.rows.map((row) => row.key), ["sw_thumb_cache", "sw_settings", "sw_mru"], "非法条目丢弃并按占用降序");
    assert.equal(summary.total, 40420);
});

test("storage usage section is wired to host measurement and registry", () => {
    const indexSource = readSourceText(path.join(__dirname, "..", "src", "index.ts"));
    assert.match(indexSource, /async measureStorageUsage\(\): Promise<Array<\{key: string, bytes: number\}>>/);
    assert.match(indexSource, /new TextEncoder\(\)/);
    assert.match(indexSource, /encoder\.encode\(json\)\.length/);
    const sections = readSourceText(path.join(__dirname, "..", "src", "settings-sections.ts"));
    assert.match(sections, /export function buildSettingsStorage\(this: SettingsSectionsHost\)/);
    assert.match(sections, /buildStorageUsageSummary\(entries\)/);
    assert.match(sections, /THUMB_CACHE_KEY, label: "缩略图缓存"/);
    const indexSource2 = readSourceText(path.join(__dirname, "..", "src", "index.ts"));
    assert.match(indexSource2, /storage: \(\) => buildSettingsStorage\.call\(this\)/);
    assert.match(indexSource2, /storage: this\.i18n\.secStorage/);
});

// ---------- T-6465 用户内容排序确定性（localeCompare 漂移治理） ----------
test("user-content sorting pins the zh collator across kernel models", () => {
    const kernelSource = readSourceText(path.join(__dirname, "..", "src", "kernel-widget-model.js"));
    // 仅 updated/date 等纯数字时间戳允许保留 localeCompare（各 locale 下事实一致）；
    // 用户内容（名称/标题/标签/路径/文档名）一律 compareText（zh 拼音钉定）
    const bare = [...kernelSource.matchAll(/localeCompare\((?!right\.updated|left\.date|right\.date|left\.updated)[^\n]*/g)]
        .map((m) => m[0]);
    assert.deepEqual(bare, [], "kernel model must not sort user content with bare localeCompare");
    assert.match(kernelSource, /const \{compareText\} = require\("\.\/util\.js"\);/);
    const utilSource = readSourceText(path.join(__dirname, "..", "src", "util.js"));
    assert.match(utilSource, /new Intl\.Collator\("zh-Hans-CN", \{numeric: true\}\)/);
    assert.match(utilSource, /new Intl\.Collator\("zh-Hans-CN"\)/);
});

// ---------- T-6470 数据库表格两级取数（嵌入/镜像库修复） ----------
test("database table adapter resolves embedded database ids via getAttributeView", () => {
    const indexTs = readSourceText(path.join(__dirname, "..", "src", "index.ts"));
    assert.match(indexTs, /"\/api\/av\/renderAttributeView",\s*"\/api\/av\/getAttributeView",/, "getAttributeView 必须进 KERNEL_ENDPOINTS 白名单（紧邻 renderAttributeView）");
    assert.match(indexTs, /case "\/api\/av\/getAttributeView":/, "字面量 switch 必须登记该端点");
    assert.match(indexTs, /\/api\/av\/renderAttributeView", \{id, pageSize: 100, \.\.\.extra\}/, "取数必须带 pageSize");
    assert.match(indexTs, /const full = await this\.fetchKernelJson\("\/api\/av\/getAttributeView", \{id: normalized\.blockId\}\)/, "0 行时必须经 getAttributeView 解析库 ID");
    assert.match(indexTs, /fetchView\(dbId, \{viewID\}\)/, "必须以库 ID + viewID 重试");
    const form = readSourceText(path.join(__dirname, "..", "src", "home-config-form.ts"));
    assert.ok(form.includes('directId = /^\\d{14}-[0-9a-z]+$/i.test(query)'), "配置表单支持粘贴库 ID 直连");
});

// ---------- T-6471 数据健康点击入口 ----------
test("data health missing assets link to their referencing blocks", () => {
    const snapshot = kernel.buildDataHealthSnapshot(
        {data: [
            {name: "missing.png", item: "assets/missing.png", blockIDs: ["20260918120000-abcdef", "20260918120001-zzzzzz"]},
            {name: "orphan.png"},
        ]},
        {limit: 8, showRank: "是"},
        {title: "数据健康", stat: "缺失资源", statMany: "缺失资源（较多）"},
    );
    assert.equal(snapshot.items[0].label, "missing.png");
    assert.equal(snapshot.items[0].value, "20260918120000-abcdef", "点击打开首个引用块所在文档");
    assert.equal(snapshot.items[0].secondary, "assets/missing.png", "引用路径默认展示");
    assert.equal(snapshot.items[1].value, "", "无引用块的条目不产生点击目标");
});

// ---------- T-6472 热力图色阶图例（可及性） ----------
test("heatmap legend explains the color scale with swatches and text", () => {
    const view = readSourceText(path.join(__dirname, "..", "src", "home-view.js"));
    assert.match(view, /sw__home-heatmap-legend/);
    assert.match(view, /labels\.heatmapLegend/);
    assert.match(view, /aria-hidden", "true"\);\n\s*legend\.appendChild\(swatch\)/, "装饰色块对读屏隐藏");
    const css = readSourceText(path.join(__dirname, "..", "src", "styles", "_08-home-store-cards.scss"));
    assert.ok(declaresIn(css, ".sw__home-heatmap .sw__home-heatmap-legend", /font-size: 11px/), "图例文字样式必须存在");
    assert.ok(declaresIn(css, ".sw__home-heatmap .sw__home-heatmap-legend .sw__home-heatmap-legend-swatch.is-level-4", /background/), "最高档色块样式必须存在");
});

// ---------- T-6473 头部瘦身 + 图标首帧兜底 + 分组标签恢复 ----------
test("card header compresses config button and meta without losing semantics", () => {
    const view = readSourceText(path.join(__dirname, "..", "src", "home-view.js"));
    assert.match(view, /sw__home-module-config/, "配置按钮改为齿轮图标类");
    assert.match(view, /#iconSettings/, "齿轮图标使用 iconSettings");
    assert.doesNotMatch(view, /configButton\.textContent = labels\.config/, "不再渲染 Configure 文字按钮");
    assert.match(view, /meta\.setAttribute\("title"/, "更新时间前缀移入 tooltip");
    const css = readSourceText(path.join(__dirname, "..", "src", "styles", "_05-settings-widgets.scss"));
    assert.ok(declaresIn(css, ".sw__home-module-header .sw__home-module-config", /width: 22px/), "齿轮按钮尺寸必须钉住");
    assert.ok(declaresIn(css, ".sw__home-module-header .sw__home-module-meta", /max-width: 40%/), "meta 必须可收缩截断");
});

test("toolbar svgs carry intrinsic sizes and config dialog joins the clamp coverage", () => {
    const indexTs = readSourceText(path.join(__dirname, "..", "src", "index.ts"));
    for (const icon of ["iconCalendar", "iconRefresh", "iconSettings", "iconSort", "iconFilter"]) {
        assert.ok(
            indexTs.includes(`<svg width="16" height="16"><use xlink:href="#${icon}"></use></svg>`)
                || indexTs.includes(`<svg width="14" height="14"><use xlink:href="#${icon}"></use></svg>`),
            `${icon} 工具栏 svg 必须带显式尺寸`,
        );
    }
    const form = readSourceText(path.join(__dirname, "..", "src", "home-config-form.ts"));
    assert.match(form, /iconClampObserver\.observe\(root/, "配置弹窗必须接入图标钳制观察器");
    assert.match(form, /import \{clampOversizedIcons\} from "\.\/util"/);
});

test("notebook group labels recover from tab metadata when the cache misses", () => {
    const indexTs = readSourceText(path.join(__dirname, "..", "src", "index.ts"));
    const block = indexTs.slice(indexTs.indexOf("notebookNameOf: (id: string) =>"));
    assert.match(block, /for \(const tab of tabs\)/, "必须扫描页签自身元数据");
    assert.match(block, /t\.notebookName \|\| t\.notebook \|\| t\.boxName/, "回退链必须覆盖三种字段名");
    assert.match(block, /resolveSearchNotebookId\(tab as unknown\) !== id\) continue/, "必须按笔记本 ID 匹配");
});

// ---------- T-6475 笔记本分组富化（幻影 ID 纠正） ----------
test("notebook grouping enriches phantom ids from the kernel box mapping", () => {
    const indexTs = readSourceText(path.join(__dirname, "..", "src", "index.ts"));
    assert.match(indexTs, /private rootNotebookCache: \{\[rootId: string\]: string\} = \{\}/, "rootId→box 缓存必须存在");
    assert.match(indexTs, /if \(!notebookMap\.has\(resolved\)\) \{[\s\S]*?rootNotebookCache\[rootIdOf\(tab\)\]/, "幻影 ID 必须经缓存纠正");
    assert.match(indexTs, /private async loadRootNotebookMap\(rootIds: string\[\]\)/, "富化方法必须存在");
    const loader = indexTs.slice(indexTs.indexOf("private async loadRootNotebookMap"));
    assert.match(loader, /BLOCK_ID_RE\.test\(id\)\)\.slice\(0, 32\)/, "请求必须按块 ID 白名单过滤且有界");
    assert.match(loader, /SELECT id, box FROM blocks WHERE type='d' AND id IN/, "SQL 必须按 blocks.box 恢复真实归属");
    assert.match(loader, /BLOCK_ID_RE\.test\(box\) \? box : ""/, "响应 box 必须校验后落缓存");
    // 富化触发条件：笔记本分组 + 清单就绪 + 存在未知归属的页签
    const enrichment = indexTs.slice(indexTs.indexOf("if (groupMode === \"notebook\") {", indexTs.indexOf("rootNotebookCache:")));
    assert.match(enrichment, /loadRootNotebookMap\(unknownRoots\)/);
    assert.match(enrichment, /rootId in this\.rootNotebookCache\) continue/, "已富化过的 rootId 不重复请求");
    assert.match(enrichment, /known\.has\(resolved\)\) continue/, "真实笔记本 ID 不触发富化");
    assert.match(enrichment, /const enrich = unknownRoots\.length > 0/, "富化触发条件必须钉住（防死代码化）");
});
