const {readSourceText} = require("./source-scan.cjs");
const {test} = require('node:test');
const assert = require('node:assert/strict');
const home = require('../src/home-model.js');

test("insight-style widgets are registered with bounded sizes", () => {
    const modules = home.registerModules([]);
    const byId = new Map(modules.map((m) => [m.moduleId, m]));
    const noteStats = byId.get("note-stats");
    assert.ok(noteStats, "note-stats registered");
    assert.deepEqual(noteStats.sizes, ["small", "medium"]);
    assert.deepEqual(noteStats.configSchema, [{key: "notebook", label: "限定笔记本", type: "notebook"}]);
    const yearProgress = byId.get("year-progress");
    assert.ok(yearProgress, "year-progress registered");
    assert.deepEqual(yearProgress.sizes, ["xs", "small"]);
    const recentEdits = byId.get("recent-edits");
    assert.ok(recentEdits, "recent-edits registered");
    assert.deepEqual(recentEdits.sizes, ["medium", "wide", "large"]);
    assert.deepEqual(recentEdits.configSchema, [
        {key: "limit", label: "条数上限", type: "number", min: 1, max: 20, defaults: 10},
        {key: "notebook", label: "限定笔记本", type: "notebook"},
    ]);
    const todayWriting = byId.get("today-writing");
    assert.deepEqual(todayWriting.configSchema, [{key: "notebook", label: "限定笔记本", type: "notebook"}]);
    const monthly = byId.get("journal-monthly");
    assert.equal(monthly.configSchema[0].max, 20);
    assert.equal(monthly.configSchema[1].type, "notebook");
    const onThisDay = byId.get("on-this-day");
    assert.equal(onThisDay.configSchema[0].max, 20);
    assert.equal(onThisDay.configSchema[1].type, "notebook");
    const clipped = byId.get("clipped-unread");
    assert.equal(clipped.configSchema[2].type, "notebook");
    const writing = byId.get("recent-writing-activity");
    assert.ok(writing, "recent writing activity registered");
    assert.deepEqual(writing.configSchema, [
        {key: "days", label: "统计天数", type: "number", min: 7, max: 30, defaults: 7},
        {key: "notebook", label: "限定笔记本", type: "notebook"},
    ]);
    const daily = byId.get("recent-daily-notes");
    assert.ok(daily, "recent daily notes registered");
    assert.equal(daily.configSchema.length, 3);
    assert.deepEqual(daily.configSchema[2], {key: "notebook", label: "限定笔记本", type: "notebook"});
    assert.equal(daily.readOnly, true);
    const relations = byId.get("document-relations-summary");
    assert.ok(relations, "document relations summary registered");
    assert.deepEqual(relations.sizes, ["small", "medium", "wide"]);
    assert.equal(relations.configSchema[0].max, 12);
    const outline = byId.get("current-document-outline");
    assert.ok(outline, "current document outline registered");
    assert.deepEqual(outline.sizes, ["small", "medium", "tall", "wide"]);
    assert.equal(outline.configSchema[0].max, 12);
    assert.equal(outline.readOnly, true);
    const reservations = byId.get("today-reservations");
    assert.ok(reservations, "today reservations registered");
    assert.equal(reservations.configSchema[0].max, 14);
    assert.equal(reservations.configSchema[2].type, "notebook");
    assert.equal(reservations.readOnly, true);
});

test("year progress percentage stays within bounds for leap and non-leap years", () => {
    // 与适配器同口径的纯计算（闰年 366 天 / 平年 365 天）
    const percentFor = (year, month, day) => {
        const start = new Date(year, 0, 1);
        const end = new Date(year + 1, 0, 1);
        const dayMs = 86400000;
        const total = Math.round((end.getTime() - start.getTime()) / dayMs);
        const elapsed = Math.min(total, Math.floor((new Date(year, month, day).getTime() - start.getTime()) / dayMs) + 1);
        return {total, percent: Math.round(elapsed / total * 100), elapsed, remaining: total - elapsed};
    };
    assert.equal(percentFor(2024, 0, 1).total, 366); // 闰年
    assert.equal(percentFor(2025, 0, 1).total, 365); // 平年
    assert.equal(percentFor(2025, 0, 1).percent, 0);   // 元旦约为 0%（1/365 → 0）
    assert.equal(percentFor(2025, 11, 31).percent, 100); // 年末 100%
    const mid = percentFor(2025, 5, 30);
    assert.ok(mid.percent > 40 && mid.percent < 60);
    assert.ok(mid.elapsed + mid.remaining === mid.total);
});

test("current document outline adapter reuses bounded outline data", () => {
    const fs = require("node:fs");
    const path = require("node:path");
    const source = readSourceText(path.join(__dirname, "..", "src", "index.ts"));
    assert.match(source, /register\("current-document-outline"/);
    assert.match(source, /fetchKernelJson\("\/api\/outline\/getDocOutline", \{id: rootId, preview: false\}\)/);
    assert.match(source, /flattenOutline\(Array\.isArray\(json\?\.data\) \? json\.data : \[\], limit\)/);
});

test("writing activity and daily-note adapters validate optional notebook SQL scope", () => {
    const fs = require("node:fs");
    const path = require("node:path");
    const source = readSourceText(path.join(__dirname, "..", "src", "index.ts"));
    const writing = source.slice(
        source.indexOf('register("recent-writing-activity"'),
        source.indexOf('register("recent-daily-notes"'),
    );
    const daily = source.slice(
        source.indexOf('register("recent-daily-notes"'),
        source.indexOf('register("document-relations-summary"'),
    );
    for (const adapter of [writing, daily]) {
        assert.match(adapter, /buildNotebookBoxScope\(config\.notebook\)/);
    }
    assert.match(writing, /created >= '\$\{since\}'\$\{notebookScope\}/);
    assert.match(daily, /type='d'\$\{notebookScope\}/);
});

test("date-based widget labels format YYYYMMDD values for users", () => {
    const fs = require("node:fs");
    const path = require("node:path");
    const source = readSourceText(path.join(__dirname, "..", "src", "index.ts"));
    const writing = source.slice(
        source.indexOf('register("recent-writing-activity"'),
        source.indexOf('register("recent-daily-notes"'),
    );
    const reservations = source.slice(
        source.indexOf('register("today-reservations"'),
        source.indexOf('register("quick-capture"'),
    );
    for (const adapter of [writing, reservations]) {
        assert.match(adapter, /\/\^\\d\{8\}\$\//);
        assert.match(adapter, /slice\(0, 4\).*slice\(4, 6\).*slice\(6, 8\)/s);
    }
});

test("journal calendar supports notebook scope and bidirectional month navigation", () => {
    const fs = require("node:fs");
    const path = require("node:path");
    const source = readSourceText(path.join(__dirname, "..", "src", "index.ts"));
    const panelSource = readSourceText(path.join(__dirname, "..", "src", "second-panel-ui.ts"));
    const calendar = source.slice(
        source.indexOf('register("journal-calendar"'),
        source.indexOf('register("recent-writing-activity"'),
    );
    assert.match(calendar, /buildNotebookBoxScope\(config\.notebook, "b"\)/);
    assert.match(calendar, /type='d'\$\{notebookScope\}/);
    assert.match(calendar, /custom-dailynote-/);
    assert.match(calendar, /LEFT JOIN attributes/);
    assert.match(calendar, /index < 42/);
    assert.match(calendar, /outside: true/);
    assert.match(calendar, /homeCalendarMonthFormat/);
    assert.match(panelSource, /Math\.min\(24, Math\.max\(-24, current \+ \(direction < 0 \? -1 : 1\)\)\)/);
});

test("today tasks default to today's journal and expose an explicit empty hint", () => {
    const fs = require("node:fs");
    const path = require("node:path");
    const source = readSourceText(path.join(__dirname, "..", "src", "index.ts"));
    const tasks = source.slice(
        source.indexOf('register("today-tasks"'),
        source.indexOf('register("tags"'),
    );
    assert.match(tasks, /attributes WHERE name=\x27\$\{todayAttr\}\x27/);
    assert.match(tasks, /d\.content LIKE \x27\$\{todayTitle\}%\x27/);
    assert.match(tasks, /blocks b JOIN blocks d ON d\.id=b\.root_id AND d\.type=\x27d\x27/);
    assert.match(tasks, /emptyHint: !scanAll && total === 0/);
    assert.match(tasks, /b\.type=\x27i\x27 AND b\.subtype=\x27t\x27/);
    assert.match(tasks, /taskPattern\.test/);
});

test("today tasks accepts common checkbox markdown variants", () => {
    const fs = require("node:fs");
    const path = require("node:path");
    const source = readSourceText(path.join(__dirname, "..", "src", "index.ts"));
    const tasks = source.slice(source.indexOf('register("today-tasks"'), source.indexOf('register("tags"'));
    assert.match(tasks, /markdown LIKE '%\[ \]%'/);
    assert.ok(tasks.includes('const taskPattern = /\\[[ xX]\\](?:\\s|$)/;'));
});

test("calendar rendering declares a seven-column grid", () => {
    const fs = require("node:fs");
    const path = require("node:path");
    const source = readSourceText(path.join(__dirname, "..", "src", "index.scss"));
    const calendar = source.slice(source.indexOf(".sw__home-calendar {"), source.indexOf(".sw__home-calendar-head {"));
    assert.match(calendar, /display: grid/);
    assert.match(calendar, /repeat\(7, minmax\(0, 1fr\)\)/);
});

test("insight adapters share validated notebook scope without changing default queries", () => {
    const fs = require("node:fs");
    const path = require("node:path");
    const source = readSourceText(path.join(__dirname, "..", "src", "index.ts"));
    const slice = (start, end) => source.slice(source.indexOf(`register("${start}"`), source.indexOf(`register("${end}"`));
    const adapters = [
        slice("note-stats", "year-progress"),
        slice("recent-edits", "flashcard-due"),
        slice("random-review", "clipped-unread"),
        slice("today-writing", "recent-writing-activity"),
    ];
    adapters.forEach((adapter) => {
        assert.match(adapter, /buildNotebookBoxScope\(config\.notebook\)/);
        assert.match(adapter, /\$\{notebookScope\}/);
    });
    assert.match(adapters[1], /Math\.min\(20, Math\.max\(1, Math\.trunc\(Number\(config\.limit\) \|\| 10\)\)\)/);
});

test("journal and dated-content adapters use bounded notebook-aware actions", () => {
    const fs = require("node:fs");
    const path = require("node:path");
    const source = readSourceText(path.join(__dirname, "..", "src", "index.ts"));
    const slice = (start, end) => source.slice(source.indexOf(`register("${start}"`), source.indexOf(`register("${end}"`));
    const monthly = slice("journal-monthly", "note-stats");
    const clipped = slice("clipped-unread", "on-this-day");
    const memory = slice("on-this-day", "today-writing");
    const reservations = slice("today-reservations", "plugin-commands");
    assert.match(monthly, /action:journal:\$\{notebook\}/);
    assert.match(monthly, /buildNotebookBoxScope\(notebook\)/);
    assert.match(clipped, /buildNotebookBoxScope\(config\.notebook, "b"\)/);
    assert.match(memory, /buildNotebookBoxScope\(config\.notebook\)/);
    assert.match(reservations, /buildNotebookBoxScope\(config\.notebook, "B"\)/);
    assert.match(reservations, /Number\.isFinite\(configuredDays\)/);
    assert.match(source, /this\.openJournal\(journalNotebook\)/);
});

test("plugin command adapter provides an explicit empty-state hint", () => {
    const fs = require("node:fs");
    const path = require("node:path");
    const source = readSourceText(path.join(__dirname, "..", "src", "index.ts"));
    const commands = source.slice(source.indexOf('register("plugin-commands"'), source.indexOf("private getHomeState"));
    assert.match(commands, /emptyHint: commands\.length > 0 \? \"\" : this\.i18n\.homePluginCommandsEmpty/);
});
