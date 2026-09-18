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
    assert.deepEqual(noteStats.configSchema.map((field) => field.key), ["notebook", "days", "primaryMetric", "showTrend"]);
    assert.equal(noteStats.configSchema.find((field) => field.key === "days").max, 90);
    const yearProgress = byId.get("year-progress");
    assert.ok(yearProgress, "year-progress registered");
    assert.deepEqual(yearProgress.sizes, ["xs", "small"]);
    const recentEdits = byId.get("recent-edits");
    assert.ok(recentEdits, "recent-edits registered");
    assert.deepEqual(recentEdits.sizes, ["medium", "wide", "large"]);
    assert.deepEqual(recentEdits.configSchema.map((field) => field.key), [
        "limit", "notebook", "days", "query", "showPath", "showUpdated", "showRank",
    ]);
    assert.equal(recentEdits.configSchema.find((field) => field.key === "days").defaults, 30);
    assert.equal(recentEdits.configSchema.find((field) => field.key === "showPath").defaults, "是");
    const todayWriting = byId.get("today-writing");
    assert.deepEqual(todayWriting.configSchema.map((field) => field.key), ["notebook", "goal", "showBlocks", "showNewDocs", "showEditedDocs"]);
    const todayJournal = byId.get("today-journal");
    assert.deepEqual(todayJournal.configSchema, [{key: "notebook", label: "日记笔记本", type: "notebook"}]);
    const monthly = byId.get("journal-monthly");
    assert.equal(monthly.configSchema[0].max, 20);
    assert.equal(monthly.configSchema[1].type, "notebook");
    const onThisDay = byId.get("on-this-day");
    assert.equal(onThisDay.configSchema[0].max, 20);
    assert.equal(onThisDay.configSchema[1].type, "notebook");
    assert.deepEqual(onThisDay.configSchema.map((field) => field.key), ["limit", "notebook", "yearRange", "sortBy", "showYear", "showPath", "showRank"]);
    const clipped = byId.get("clipped-unread");
    assert.equal(clipped.configSchema[2].type, "notebook");
    assert.deepEqual(clipped.configSchema.map((field) => field.key), ["tag", "limit", "notebook", "sortBy", "showPath", "showUpdated", "showRank"]);
    const writing = byId.get("recent-writing-activity");
    assert.ok(writing, "recent writing activity registered");
    assert.deepEqual(writing.configSchema.map((field) => field.key), ["days", "notebook", "metric", "density", "showZero", "showAverage"]);
    assert.equal(writing.configSchema[0].max, 90);
    assert.deepEqual(byId.get("writing-streak").configSchema.map((field) => field.key), [
        "notebook", "windowDays", "metric", "dailyGoal", "weekStart", "todayGrace",
    ]);
    const daily = byId.get("recent-daily-notes");
    assert.ok(daily, "recent daily notes registered");
    assert.deepEqual(daily.configSchema.map((field) => field.key), ["days", "limit", "notebook", "sortBy", "showPath", "showUpdated", "showRank"]);
    assert.deepEqual(daily.configSchema[2], {key: "notebook", label: "限定笔记本", type: "notebook"});
    assert.equal(daily.readOnly, true);
    const relations = byId.get("document-relations-summary");
    assert.ok(relations, "document relations summary registered");
    assert.deepEqual(relations.sizes, ["small", "medium", "wide"]);
    assert.deepEqual(relations.configSchema.map((field) => field.key), ["limit", "relation", "query", "showType", "showRank"]);
    assert.deepEqual(relations.configSchema.find((field) => field.key === "relation").options, ["全部", "子块", "引用"]);
    const outline = byId.get("current-document-outline");
    assert.ok(outline, "current document outline registered");
    assert.deepEqual(outline.sizes, ["small", "medium", "tall", "wide"]);
    assert.deepEqual(outline.configSchema.map((field) => field.key), ["limit", "query", "maxDepth", "showLevel", "showRank"]);
    assert.equal(outline.configSchema.find((field) => field.key === "maxDepth").max, 8);
    assert.equal(outline.readOnly, true);
    const tags = byId.get("tags");
    const bookmarks = byId.get("bookmarks");
    assert.deepEqual(tags.configSchema.map((field) => field.key), ["limit", "query", "sortBy", "showCount", "showHierarchy", "showRank"]);
    assert.deepEqual(bookmarks.configSchema.map((field) => field.key), ["limit", "query", "sortBy", "showCount", "showEmpty", "showRank"]);
    const reservations = byId.get("today-reservations");
    assert.ok(reservations, "today reservations registered");
    assert.equal(reservations.configSchema[0].max, 14);
    assert.equal(reservations.configSchema[3].type, "notebook");
    assert.deepEqual(reservations.configSchema.map((field) => field.key), [
        "days", "overdueDays", "limit", "notebook", "query", "sortBy", "showDate", "showStatus", "showPath", "showRank",
    ]);
    assert.equal(reservations.readOnly, true);
    assert.deepEqual(byId.get("quick-capture").configSchema.map((field) => field.key), ["notebook", "initialText", "includeTime"]);
    assert.deepEqual(byId.get("plugin-commands").configSchema.map((field) => field.key), ["limit", "query", "plugin", "sortBy", "showPlugin", "showRank"]);
    assert.deepEqual(byId.get("inbox-shorthands").configSchema.map((field) => field.key), ["page", "limit", "query", "showPreview", "showLinkHost", "showRank"]);
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
    assert.match(source, /flattenOutline\(json\.data, 64\)/);
    assert.match(source, /buildOutlineWidgetSnapshot\(headings, config/);
    assert.match(source, /homeCurrentDocumentMissing/);
});

test("document navigation adapters use bounded models and short caches", () => {
    const fs = require("node:fs");
    const path = require("node:path");
    const source = readSourceText(path.join(__dirname, "..", "src", "index.ts"));
    for (const [moduleId, builder] of [
        ["tags", "buildTagListSnapshot"],
        ["bookmarks", "buildBookmarkListSnapshot"],
        ["document-relations-summary", "buildDocumentRelationsSnapshot"],
        ["current-document-outline", "buildOutlineWidgetSnapshot"],
    ]) {
        const start = source.indexOf(`register("${moduleId}"`);
        assert.ok(start > 0, `${moduleId} adapter registered`);
        const window = source.slice(start, start + 2400);
        assert.match(window, new RegExp(`${builder}\\(`), `${moduleId} must use ${builder}`);
        assert.match(window, /timeoutMs: 1200, cacheTtlMs: (?:1000|2000)/, `${moduleId} must use a bounded cache`);
    }
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
        assert.match(adapter, /buildNotebookBoxScope\((?:config|normalized)\.notebook/);
    }
    assert.match(writing, /created >= '\$\{since\}'\$\{notebookScope\}/);
    assert.match(daily, /type='d'\$\{notebookScope\}/);
});

test("date-based widget labels format YYYYMMDD values for users", () => {
    const fs = require("node:fs");
    const path = require("node:path");
    const source = readSourceText(path.join(__dirname, "..", "src", "index.ts"));
    const reservationModel = readSourceText(path.join(__dirname, "..", "src", "kernel-widget-model.js"));
    assert.match(reservationModel, /function formatDateKey/);
    assert.match(reservationModel, /date\.slice\(0, 4\).*date\.slice\(4, 6\).*date\.slice\(6, 8\)/s);
    assert.match(reservationModel, /buildRecentWritingActivitySnapshot[\s\S]*formatDateKey\(first\)/);
});

test("writing insights use deep bounded models, single aggregate queries, and short caches", () => {
    const path = require("node:path");
    const source = readSourceText(path.join(__dirname, "..", "src", "index.ts"));
    const slice = (start, end) => source.slice(source.indexOf(`register("${start}"`), source.indexOf(`register("${end}"`));
    const checks = [
        [slice("note-stats", "year-progress"), "buildNoteStatsSnapshot"],
        [slice("today-writing", "writing-streak"), "buildTodayWritingSnapshot"],
        [slice("writing-streak", "countdown"), "buildWritingStreakSnapshot"],
        [slice("recent-writing-activity", "recent-daily-notes"), "buildRecentWritingActivitySnapshot"],
    ];
    for (const [adapter, builder] of checks) {
        assert.match(adapter, new RegExp(`${builder}\\(`));
        assert.match(adapter, /timeoutMs: 1200, cacheTtlMs: 1000/);
        assert.equal((adapter.match(/fetchKernelJson\("\/api\/query\/sql"/g) || []).length, 1, `${builder} uses one SQL request`);
    }
    assert.match(checks[0][0], /previous_created/);
    assert.match(checks[1][0], /COUNT\(CASE WHEN type<>'d'/);
    assert.match(checks[2][0], /normalizeWritingStreakConfig\(config\)/);
    const model = readSourceText(path.join(__dirname, "..", "src", "kernel-widget-model.js"));
    assert.match(model, /totals\.get\(key\)\[metricKey\] >= normalized\.dailyGoal/);
    assert.match(checks[3][0], /COALESCE\(SUM\(length\), 0\) AS chars/);
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
    assert.match(calendar, /normalizeJournalCalendarConfig\(config\)/);
    assert.match(calendar, /buildNotebookBoxScope\(normalized\.notebook, "b"\)/);
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
    assert.match(tasks, /buildTodayTasksSnapshot\(/);
    assert.match(tasks, /empty: !scanAll \?/);
    assert.match(tasks, /b\.type=\x27i\x27 AND b\.subtype=\x27t\x27/);
    assert.match(tasks, /LIMIT 48/);
});

test("today tasks accepts common checkbox markdown variants", () => {
    const fs = require("node:fs");
    const path = require("node:path");
    const source = readSourceText(path.join(__dirname, "..", "src", "index.ts"));
    const tasks = source.slice(source.indexOf('register("today-tasks"'), source.indexOf('register("tags"'));
    assert.match(tasks, /markdown LIKE '%\[ \]%'/);
    const model = readSourceText(path.join(__dirname, "..", "src", "kernel-widget-model.js"));
    assert.ok(model.includes('/\\[[ xX]\\](?:\\s|$)/.test(markdown)'));
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
        assert.match(adapter, /buildNotebookBoxScope\((?:config|normalized)\.notebook\)/);
        assert.match(adapter, /\$\{notebookScope\}/);
    });
    assert.match(adapters[2], /normalized\.parentDocument \? "" : buildNotebookBoxScope/,
        "随机回顾的精确父文档范围优先于笔记本范围");
    assert.match(adapters[1], /normalizeRecentEditsConfig\(config\)/);
    assert.match(adapters[1], /taskWindowStart\(normalized\.days\)/);
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
    assert.match(monthly, /buildJournalMonthlySnapshot\(/);
    assert.match(monthly, /buildNotebookBoxScope\(notebook, "b"\)/);
    assert.match(clipped, /buildNotebookBoxScope\(normalized\.notebook, "b"\)/);
    assert.match(memory, /buildNotebookBoxScope\(normalized\.notebook\)/);
    assert.match(reservations, /normalizeTodayReservationsConfig\(config\)/);
    assert.match(reservations, /buildNotebookBoxScope\(normalized\.notebook, "B"\)/);
    assert.match(reservations, /buildTodayReservationsSnapshot\(/);
    assert.match(source, /this\.openJournal\(journalNotebook\)/);
});

test("dated widgets use pure projections, future-date guards, and bounded caches", () => {
    const fs = require("node:fs");
    const path = require("node:path");
    const source = readSourceText(path.join(__dirname, "..", "src", "index.ts"));
    const checks = [
        ["clipped-unread", "buildClippedUnreadSnapshot", /COUNT\(\*\) OVER\(\)/],
        ["on-this-day", "buildOnThisDaySnapshot", /content GLOB/],
        ["recent-daily-notes", "buildRecentDailyNotesSnapshot", /content < '\$\{today\}~/],
    ];
    for (const [moduleId, builder, query] of checks) {
        const start = source.indexOf(`register("${moduleId}"`);
        const end = source.indexOf("register(", start + 10);
        const window = source.slice(start, end > start ? end : start + 2600);
        assert.match(window, new RegExp(`${builder}\\(`), `${moduleId} must use its projection model`);
        assert.match(window, query, `${moduleId} must keep its bounded date/count query`);
        assert.match(window, /timeoutMs: 1200, cacheTtlMs: 1500/);
    }
    const journalStart = source.indexOf('register("today-journal"');
    const journal = source.slice(journalStart, journalStart + 900);
    assert.match(journal, /normalizeAgentNotebookId\(config\.notebook\)/);
    assert.match(journal, /action:journal:\$\{notebook\}/);
});

test("monthly journal, calendar, tasks, and flashcards use deep bounded projections", () => {
    const path = require("node:path");
    const source = readSourceText(path.join(__dirname, "..", "src", "index.ts"));
    const model = readSourceText(path.join(__dirname, "..", "src", "kernel-widget-model.js"));
    const home = require("../src/home-model.js");
    const slice = (start, end) => source.slice(source.indexOf(`register("${start}"`), source.indexOf(`register("${end}"`));
    const monthly = slice("journal-monthly", "note-stats");
    const cards = slice("flashcard-due", "random-review");
    const calendar = slice("journal-calendar", "recent-writing-activity");
    const tasks = slice("today-tasks", "tags");
    assert.match(monthly, /buildJournalMonthlySnapshot\(/);
    assert.match(monthly, /COUNT\(\*\) OVER\(\)/);
    assert.match(monthly, /timeoutMs: 1200, cacheTtlMs: 1500/);
    assert.match(tasks, /buildTodayTasksSnapshot\(/);
    assert.match(tasks, /d\.content AS document_title, d\.hpath/);
    assert.match(tasks, /timeoutMs: 1200, cacheTtlMs: 1000/);
    assert.match(cards, /buildFlashcardDueSnapshot\(/);
    assert.match(cards, /index \+= 4/);
    assert.match(cards, /timeoutMs: 2500, cacheTtlMs: 2000/);
    assert.match(calendar, /normalizeJournalCalendarConfig\(config\)/);
    assert.match(calendar, /calendarWeekdays/);
    assert.match(calendar, /weekend: date\.getDay\(\) === 0 \|\| date\.getDay\(\) === 6/);
    assert.match(model, /function buildTodayTasksSnapshot/);
    assert.match(model, /function buildFlashcardDueSnapshot/);
    assert.deepEqual(home.registerModules([]).find((item) => item.moduleId === "journal-monthly").configSchema.map((field) => field.key),
        ["limit", "notebook", "monthOffset", "sortBy", "showPath", "showUpdated", "showRank"]);
});

test("plugin command adapter provides an explicit empty-state hint", () => {
    const fs = require("node:fs");
    const path = require("node:path");
    const source = readSourceText(path.join(__dirname, "..", "src", "index.ts"));
    const commands = source.slice(source.indexOf('register("plugin-commands"'), source.indexOf("private getHomeState"));
    assert.match(commands, /buildPluginCommandsSnapshot\(this\.getPluginCommands\(\), config/);
    assert.match(commands, /empty: this\.i18n\.homePluginCommandsEmpty/);
    assert.match(commands, /emptyFiltered: this\.i18n\.homePluginCommandsFilteredEmpty/);
});
