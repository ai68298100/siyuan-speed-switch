const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const {readSourceText} = require("./source-scan.cjs");
const {normalizeOfficialRecentHistory} = require("../src/recent-closed.js");

const source = readSourceText(path.join(__dirname, "..", "src", "index.ts"));
const start = source.indexOf("private setupOpenHistoryDropdown(");
const end = source.indexOf("private renderOpenHistoryPanel(", start);
assert.ok(start >= 0 && end > start, "history dropdown method must remain discoverable");
const body = source.slice(start, end);
const renderStart = end;
const renderEnd = source.indexOf("private bindHistoryItemActions(", renderStart);
assert.ok(renderEnd > renderStart, "history list renderer must remain discoverable");
const renderBody = source.slice(renderStart, renderEnd);
const syncStart = source.indexOf("private async syncOfficialRecentHistory", start);
const syncEnd = source.indexOf("private positionOpenHistoryPanel", syncStart);
assert.ok(syncStart >= 0 && syncEnd > syncStart, "history sync method must remain discoverable");
const syncBody = source.slice(syncStart, syncEnd);
const changedFetchStart = source.indexOf("private async fetchDocUpdatedMap(", start);
const changedFetchEnd = source.indexOf("private async syncOfficialRecentHistory", changedFetchStart);
assert.ok(changedFetchStart >= 0 && changedFetchEnd > changedFetchStart, "changed-history fetch must remain discoverable");
const changedFetchBody = source.slice(changedFetchStart, changedFetchEnd);

test("recent history sync distinguishes failure and empty result", () => {
    const valid = (id) => /^20260906120000-[a-z0-9]{7}$/.test(id);
    assert.equal(normalizeOfficialRecentHistory(null, valid, 100).status, "failed");
    assert.equal(normalizeOfficialRecentHistory({}, valid, 100).status, "failed");
    assert.equal(normalizeOfficialRecentHistory({data: []}, valid, 100).status, "empty");
    assert.equal(normalizeOfficialRecentHistory({data: [{rootID: "20260906120000-aaaaaaa", title: "A"}]}, valid, 100).status, "success");
    assert.equal(normalizeOfficialRecentHistory({data: [{rootID: "malformed"}]}, valid, 100).status, "failed");
    assert.match(source, /normalizeOfficialRecentHistory\(json,/);
    assert.match(syncBody, /result\.status === "success"/);
});

test("recent history sync failure renders an actionable retry", () => {
    assert.match(body, /historySyncFailed/);
    assert.match(body, /historySyncRetry/);
    assert.match(body, /sw__history-sync-retry/);
    assert.match(body, /trigger\.click\(\)/);
    const missingRetry = body.replace("trigger.click();", "/* injected violation */");
    assert.doesNotMatch(missingRetry, /trigger\.click\(\)/, "failure state must keep a retry path");
});

test("changed-only failure unlocks safely and offers retry and show-all recovery", () => {
    assert.match(body, /toggle\.disabled = true;/);
    assert.match(body, /toggle\.setAttribute\("aria-busy", "true"\)/);
    assert.match(body, /catch \(error\)[\s\S]*?changedOnly = false;[\s\S]*?changedOnlyLoadFailed = true;/);
    assert.match(body, /historyChangedLoadFailed/);
    assert.match(body, /historyChangedRetry/);
    assert.match(body, /changedOnlyLoadFailed = false;[\s\S]*?toggle\.click\(\)/);
    assert.match(renderBody, /historyChangedShowAll/);
    assert.match(renderBody, /entryFilter \? this\.i18n\.historyChangedEmpty/);
    assert.match(changedFetchBody, /throw new Error\("history-updated-query-unavailable"\)/);
    assert.match(changedFetchBody, /throw new Error\("history-updated-row-invalid"\)/);
});

