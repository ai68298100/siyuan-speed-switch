"use strict";

// Bounded, read-only Agent capability audit helpers. These functions never
// inspect handler closures or host error objects; they provide a stable,
// privacy-safe summary for registration diagnostics and future UI/Agent tools.

const DEVICES = Object.freeze(["desktop", "sidebar", "mobile"]);
const STATUS = Object.freeze(["ready", "unavailable", "failed", "cancelled", "timeout"]);
const REASONS = Object.freeze(["cancelled", "timeout", "permission_denied", "unavailable", "failed"]);
const SAFE_EFFECTS = Object.freeze(["localRead"]);
const MAX_ITEMS = 32;
const MAX_HISTORY_EVENTS = 8;
const AUDIT_HEALTH = Object.freeze(["empty", "healthy", "degraded", "unavailable"]);
const AUDIT_TRENDS = Object.freeze(["stable", "improving", "degrading"]);
const AUDIT_TRANSPORT_TYPES = Object.freeze(["report", "window", "recovery"]);
const AUDIT_TRANSPORT_STATUS = Object.freeze(["ok", "invalid", "oversized", "unavailable"]);
const MAX_TRANSPORT_ITEMS = 8;
const MAX_TRANSPORT_QUEUE = 16;

function text(value, max = 96) {
    if (typeof value !== "string") return "";
    return value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function normalizeAgentCapabilityName(value) { return text(value, 96).toLowerCase(); }
function normalizeAgentAuditDevice(value) { return DEVICES.includes(value) ? value : "desktop"; }
function normalizeAgentAuditStatus(value) { return STATUS.includes(value) ? value : "failed"; }
function normalizeAgentAuditReason(value) { return REASONS.includes(value) ? value : "failed"; }
function normalizeAgentAuditEffects(value) {
    if (!Array.isArray(value)) return [];
    return [...new Set(value.filter((item) => SAFE_EFFECTS.includes(item)))];
}
function normalizeAgentAuditDevices(value) {
    if (!Array.isArray(value)) return [...DEVICES];
    const result = [...new Set(value.filter((item) => DEVICES.includes(item)))];
    return result.length ? result : [...DEVICES];
}
function normalizeAgentAuditCount(value, max = MAX_ITEMS) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.min(max, Math.max(0, Math.trunc(parsed))) : 0;
}
function normalizeAgentAuditBoolean(value) { return value === true; }
function isReadOnlyAgentEffects(value) {
    const effects = Array.isArray(value) ? value : [];
    return effects.length === 1 && effects[0] === "localRead";
}
function redactAgentAuditError(value) {
    if (value && typeof value === "object" && typeof value.reason === "string") return normalizeAgentAuditReason(value.reason);
    return normalizeAgentAuditReason(value);
}
function normalizeAgentAuditResult(value) {
    const source = value && typeof value === "object" ? value : {};
    const status = normalizeAgentAuditStatus(source.status);
    return {status, reason: normalizeAgentAuditReason(source.reason || status), retryable: status === "timeout" || status === "unavailable" || status === "failed"};
}
function buildAgentCapabilityAuditItem(definition, options = {}) {
    const raw = definition && typeof definition === "object" ? definition : {};
    const source = raw.spec && typeof raw.spec === "object" ? raw.spec : raw;
    const effects = normalizeAgentAuditEffects(source.effects || options.effects || ["localRead"]);
    const devices = normalizeAgentAuditDevices(source.devices || options.devices);
    const name = normalizeAgentCapabilityName(source.name);
    const valid = !!name && isReadOnlyAgentEffects(effects) && devices.length > 0;
    return {name, valid, readOnly: isReadOnlyAgentEffects(effects), effects, devices};
}
function auditAgentCapabilityDefinition(definition, options = {}) {
    const item = buildAgentCapabilityAuditItem(definition, options);
    return {...item, reason: item.valid ? "" : (!item.name ? "missing_name" : (!item.readOnly ? "non_read_only" : "invalid_devices"))};
}
function auditAgentCapabilityDefinitions(definitions, options = {}) {
    const list = Array.isArray(definitions) ? definitions.slice(0, MAX_ITEMS) : [];
    const items = list.map((item) => auditAgentCapabilityDefinition(item?.spec || item, options));
    const names = new Set();
    let duplicates = 0;
    items.forEach((item) => { if (item.name && names.has(item.name)) duplicates += 1; else if (item.name) names.add(item.name); });
    const valid = items.every((item) => item.valid) && duplicates === 0;
    return {valid, total: items.length, validCount: items.filter((item) => item.valid).length, invalidCount: items.filter((item) => !item.valid).length, duplicates, items};
}
function summarizeAgentCapabilityAudit(audit) {
    const source = audit && typeof audit === "object" ? audit : {};
    return {valid: source.valid === true, total: normalizeAgentAuditCount(source.total), validCount: normalizeAgentAuditCount(source.validCount), invalidCount: normalizeAgentAuditCount(source.invalidCount), duplicates: normalizeAgentAuditCount(source.duplicates)};
}
function buildAgentReadOnlyAuditSnapshot(input = {}) {
    const source = input && typeof input === "object" ? input : {};
    const audit = source.audit || auditAgentCapabilityDefinitions(source.definitions, source);
    return {version: 1, device: normalizeAgentAuditDevice(source.device), audit: summarizeAgentCapabilityAudit(audit), status: normalizeAgentAuditStatus(source.status || "ready"), reason: normalizeAgentAuditReason(source.reason || "unavailable"), disposed: normalizeAgentAuditBoolean(source.disposed)};
}
function normalizeAgentReadOnlyAuditSnapshot(input) {
    const snapshot = buildAgentReadOnlyAuditSnapshot(input);
    return {...snapshot, audit: {...snapshot.audit, valid: snapshot.audit.valid && !snapshot.disposed}};
}
function isAgentReadOnlyAuditSnapshotCompatible(input) {
    const source = input && typeof input === "object" ? input : {};
    return source.version === 1 && DEVICES.includes(source.device) && STATUS.includes(source.status) && REASONS.includes(source.reason) && source.audit && typeof source.audit === "object";
}
function buildAgentAuditFailure(reason, options = {}) {
    const normalized = normalizeAgentAuditReason(reason);
    return {status: normalizeAgentAuditStatus(options.status || (normalized === "cancelled" ? "cancelled" : normalized === "timeout" ? "timeout" : "failed")), reason: normalized, retryable: normalized !== "permission_denied" && normalized !== "cancelled"};
}
function buildAgentAuditDeviceMatrix(definitions, devices = DEVICES) {
    const audit = auditAgentCapabilityDefinitions(definitions);
    const matrix = {};
    normalizeAgentAuditDevices(devices).forEach((device) => { matrix[device] = {total: audit.total, valid: audit.valid, readOnly: audit.items.every((item) => item.readOnly)}; });
    return matrix;
}
function diffAgentReadOnlyAuditSnapshots(previous, next) {
    const a = normalizeAgentReadOnlyAuditSnapshot(previous);
    const b = normalizeAgentReadOnlyAuditSnapshot(next);
    return {validChanged: a.audit.valid !== b.audit.valid, statusChanged: a.status !== b.status, reasonChanged: a.reason !== b.reason, deviceChanged: a.device !== b.device, disposedChanged: a.disposed !== b.disposed};
}
function normalizeAgentAuditEvent(value) {
    const source = value && typeof value === "object" ? value : {};
    return {type: text(source.type, 48) || "status_changed", status: normalizeAgentAuditStatus(source.status), reason: normalizeAgentAuditReason(source.reason)};
}
function buildAgentReadOnlyAuditEvents(previous, next) {
    const diff = diffAgentReadOnlyAuditSnapshots(previous, next);
    const result = [];
    if (diff.validChanged) result.push({type: "validity_changed"});
    if (diff.statusChanged || diff.reasonChanged) result.push({type: "status_changed"});
    if (diff.deviceChanged) result.push({type: "device_changed"});
    if (diff.disposedChanged) result.push({type: "disposed_changed"});
    return result.slice(0, 8);
}
function normalizeAgentReadOnlyAuditEvents(events) {
    if (!Array.isArray(events)) return [];
    const seen = new Set();
    return events.map(normalizeAgentAuditEvent).filter((event) => { const key = `${event.type}:${event.status}:${event.reason}`; if (seen.has(key)) return false; seen.add(key); return true; }).slice(0, 8);
}

function normalizeAgentAuditHistoryLimit(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.min(32, Math.max(1, Math.trunc(parsed))) : 8;
}

function createAgentReadOnlyAuditHistory(limit = 8) {
    const capacity = normalizeAgentAuditHistoryLimit(limit);
    let disposed = false;
    let sequence = 0;
    const entries = [];
    const events = [];
    return {
        record(snapshot) {
            if (disposed) return {accepted: false, sequence};
            const normalized = normalizeAgentReadOnlyAuditSnapshot(snapshot);
            const previous = entries.length ? entries[entries.length - 1].snapshot : null;
            const entry = Object.freeze({sequence: ++sequence, snapshot: normalized});
            entries.push(entry);
            events.push(Object.freeze(buildAgentAuditHistoryEvent(previous, normalized, entry.sequence)));
            while (entries.length > capacity) entries.shift();
            while (events.length > Math.min(capacity, MAX_HISTORY_EVENTS)) events.shift();
            return {accepted: true, sequence: entry.sequence};
        },
        list() {
            return entries.map((entry) => ({sequence: entry.sequence, snapshot: normalizeAgentReadOnlyAuditSnapshot(entry.snapshot)}));
        },
        latest() {
            const entry = entries[entries.length - 1];
            return entry ? {sequence: entry.sequence, snapshot: normalizeAgentReadOnlyAuditSnapshot(entry.snapshot)} : null;
        },
        since(cursor = 0) {
            const parsed = Number.isFinite(Number(cursor)) ? Math.max(0, Math.trunc(Number(cursor))) : 0;
            return entries.filter((entry) => entry.sequence > parsed).map((entry) => ({sequence: entry.sequence, snapshot: normalizeAgentReadOnlyAuditSnapshot(entry.snapshot)})).slice(0, capacity);
        },
        events(cursor = 0) {
            const parsed = normalizeAgentAuditCursor(cursor);
            return events.filter((event) => event.sequence > parsed).map(normalizeAgentAuditHistoryEvent).slice(0, MAX_HISTORY_EVENTS);
        },
        health() { return buildAgentReadOnlyAuditHistoryHealth(this); },
        eventSummary() { return buildAgentReadOnlyAuditEventSummary(this.events()); },
        status() { return {size: entries.length, capacity, disposed, latestSequence: sequence}; },
        dispose() { disposed = true; entries.length = 0; events.length = 0; },
    };
}

function buildAgentAuditLifecycleEvent(previous, next) {
    const events = buildAgentReadOnlyAuditEvents(previous, next);
    return {type: events.length ? events[0].type : "unchanged", count: events.length};
}

function normalizeAgentAuditCursor(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
}

function normalizeAgentAuditHistoryEventType(value) {
    const allowed = ["initial", "validity_changed", "status_changed", "device_changed", "disposed_changed", "unchanged"];
    return allowed.includes(value) ? value : "unchanged";
}

function buildAgentAuditHistoryEvent(previous, next, sequence = 0) {
    const event = buildAgentAuditLifecycleEvent(previous, next);
    return {sequence: normalizeAgentAuditCursor(sequence), type: normalizeAgentAuditHistoryEventType(previous ? event.type : "initial"), count: normalizeAgentAuditCount(event.count, MAX_HISTORY_EVENTS)};
}

function normalizeAgentAuditHistoryEvent(value) {
    const source = value && typeof value === "object" ? value : {};
    return {sequence: normalizeAgentAuditCursor(source.sequence), type: normalizeAgentAuditHistoryEventType(source.type), count: normalizeAgentAuditCount(source.count, MAX_HISTORY_EVENTS)};
}

function buildAgentReadOnlyAuditHistorySummary(history) {
    let status = {};
    let latest = null;
    try { status = history && typeof history.status === "function" ? history.status() : {}; } catch (_) { status = {}; }
    try { latest = history && typeof history.latest === "function" ? history.latest() : null; } catch (_) { latest = null; }
    return {size: normalizeAgentAuditCount(status.size, 32), capacity: normalizeAgentAuditHistoryLimit(status.capacity), latestSequence: normalizeAgentAuditCursor(status.latestSequence), disposed: normalizeAgentAuditBoolean(status.disposed), hasLatest: Boolean(latest && latest.snapshot)};
}

function normalizeAgentReadOnlyAuditHistorySummary(value) {
    const source = value && typeof value === "object" ? value : {};
    return {version: 1, size: normalizeAgentAuditCount(source.size, 32), capacity: normalizeAgentAuditHistoryLimit(source.capacity), latestSequence: normalizeAgentAuditCursor(source.latestSequence), disposed: normalizeAgentAuditBoolean(source.disposed), hasLatest: normalizeAgentAuditBoolean(source.hasLatest)};
}

function isAgentReadOnlyAuditHistorySummaryCompatible(value) {
    const summary = normalizeAgentReadOnlyAuditHistorySummary(value);
    return value && value.version === 1 && summary.size <= summary.capacity && summary.latestSequence >= summary.size;
}

function serializeAgentReadOnlyAuditHistorySummary(value) {
    return JSON.stringify(normalizeAgentReadOnlyAuditHistorySummary(value));
}

function parseAgentReadOnlyAuditHistorySummary(value) {
    if (typeof value !== "string" || value.length > 512) return normalizeAgentReadOnlyAuditHistorySummary({});
    try { return normalizeAgentReadOnlyAuditHistorySummary(JSON.parse(value)); } catch (_) { return normalizeAgentReadOnlyAuditHistorySummary({}); }
}

function selectAgentReadOnlyAuditHistoryEvents(events, cursor = 0, limit = MAX_HISTORY_EVENTS) {
    const max = Math.min(MAX_HISTORY_EVENTS, Math.max(1, normalizeAgentAuditCount(limit, MAX_HISTORY_EVENTS)));
    const parsed = normalizeAgentAuditCursor(cursor);
    return (Array.isArray(events) ? events : []).map(normalizeAgentAuditHistoryEvent).filter((event) => event.sequence > parsed).slice(0, max);
}

function normalizeAgentAuditHealth(value) { return AUDIT_HEALTH.includes(value) ? value : "unavailable"; }

function buildAgentReadOnlyAuditHistoryHealth(history) {
    const summary = buildAgentReadOnlyAuditHistorySummary(history);
    if (summary.disposed) return "unavailable";
    if (!summary.hasLatest || summary.size === 0) return "empty";
    if (summary.size > summary.capacity || summary.latestSequence < summary.size) return "degraded";
    return "healthy";
}

function buildAgentReadOnlyAuditEventSummary(events) {
    const counts = {initial: 0, validity_changed: 0, status_changed: 0, device_changed: 0, disposed_changed: 0, unchanged: 0};
    const list = Array.isArray(events) ? events.map(normalizeAgentAuditHistoryEvent).slice(0, MAX_HISTORY_EVENTS) : [];
    list.forEach((event) => { counts[event.type] += 1; });
    const latest = list.length ? list[list.length - 1] : null;
    return {total: list.length, latestType: latest ? latest.type : "unchanged", counts};
}

function normalizeAgentReadOnlyAuditEventSummary(value) {
    const source = value && typeof value === "object" ? value : {};
    const raw = source.counts && typeof source.counts === "object" ? source.counts : {};
    const counts = {};
    ["initial", "validity_changed", "status_changed", "device_changed", "disposed_changed", "unchanged"].forEach((type) => { counts[type] = normalizeAgentAuditCount(raw[type], MAX_HISTORY_EVENTS); });
    return {total: normalizeAgentAuditCount(source.total, MAX_HISTORY_EVENTS), latestType: normalizeAgentAuditHistoryEventType(source.latestType), counts};
}

function buildAgentReadOnlyAuditHistoryReport(history) {
    const summary = buildAgentReadOnlyAuditHistorySummary(history);
    let events = [];
    try { events = history && typeof history.events === "function" ? history.events() : []; } catch (_) { events = []; }
    return {version: 1, health: normalizeAgentAuditHealth(buildAgentReadOnlyAuditHistoryHealth(history)), summary, events: buildAgentReadOnlyAuditEventSummary(events)};
}

function normalizeAgentReadOnlyAuditHistoryReport(value) {
    const source = value && typeof value === "object" ? value : {};
    return {version: 1, health: normalizeAgentAuditHealth(source.health), summary: normalizeAgentReadOnlyAuditHistorySummary(source.summary), events: normalizeAgentReadOnlyAuditEventSummary(source.events)};
}

function isAgentReadOnlyAuditHistoryReportCompatible(value) {
    const report = normalizeAgentReadOnlyAuditHistoryReport(value);
    return value && value.version === 1 && AUDIT_HEALTH.includes(report.health) && isAgentReadOnlyAuditHistorySummaryCompatible({version: 1, ...report.summary});
}

function serializeAgentReadOnlyAuditHistoryReport(value) { return JSON.stringify(normalizeAgentReadOnlyAuditHistoryReport(value)); }

function parseAgentReadOnlyAuditHistoryReport(value) {
    if (typeof value !== "string" || value.length > 2048) return normalizeAgentReadOnlyAuditHistoryReport({});
    try { return normalizeAgentReadOnlyAuditHistoryReport(JSON.parse(value)); } catch (_) { return normalizeAgentReadOnlyAuditHistoryReport({}); }
}

function normalizeAgentAuditTrend(value) { return AUDIT_TRENDS.includes(value) ? value : "stable"; }
function auditHealthRank(value) { return {unavailable: 0, degraded: 1, empty: 2, healthy: 3}[normalizeAgentAuditHealth(value)]; }

function diffAgentReadOnlyAuditHistoryReports(previous, next) {
    const a = normalizeAgentReadOnlyAuditHistoryReport(previous);
    const b = normalizeAgentReadOnlyAuditHistoryReport(next);
    const healthDelta = auditHealthRank(b.health) - auditHealthRank(a.health);
    return {healthChanged: a.health !== b.health, healthDelta, sizeChanged: a.summary.size !== b.summary.size, sequenceChanged: a.summary.latestSequence !== b.summary.latestSequence, eventsChanged: a.events.total !== b.events.total, trend: normalizeAgentAuditTrend(healthDelta > 0 ? "improving" : healthDelta < 0 ? "degrading" : "stable")};
}

function buildAgentReadOnlyAuditHistoryReportEvents(previous, next) {
    const diff = diffAgentReadOnlyAuditHistoryReports(previous, next);
    const result = [];
    if (diff.healthChanged) result.push({type: "health_changed", trend: diff.trend});
    if (diff.sizeChanged) result.push({type: "size_changed", trend: "stable"});
    if (diff.sequenceChanged) result.push({type: "sequence_changed", trend: "stable"});
    if (diff.eventsChanged) result.push({type: "events_changed", trend: "stable"});
    return result.slice(0, MAX_HISTORY_EVENTS).map(normalizeAgentReadOnlyAuditHistoryReportEvent);
}

function normalizeAgentReadOnlyAuditHistoryReportEvent(value) {
    const source = value && typeof value === "object" ? value : {};
    const allowed = ["health_changed", "size_changed", "sequence_changed", "events_changed"];
    return {type: allowed.includes(source.type) ? source.type : "events_changed", trend: normalizeAgentAuditTrend(source.trend)};
}

function normalizeAgentReadOnlyAuditHistoryReportEvents(events) {
    if (!Array.isArray(events)) return [];
    const seen = new Set();
    return events.map(normalizeAgentReadOnlyAuditHistoryReportEvent).filter((event) => { if (seen.has(event.type)) return false; seen.add(event.type); return true; }).slice(0, MAX_HISTORY_EVENTS);
}

function summarizeAgentReadOnlyAuditHistoryReportEvents(events) {
    const list = normalizeAgentReadOnlyAuditHistoryReportEvents(events);
    return {total: list.length, improving: list.filter((event) => event.trend === "improving").length, degrading: list.filter((event) => event.trend === "degrading").length, stable: list.filter((event) => event.trend === "stable").length};
}

function buildAgentReadOnlyAuditHistoryWindow(reports, limit = 8) {
    const max = Math.min(MAX_HISTORY_EVENTS, Math.max(1, normalizeAgentAuditCount(limit, MAX_HISTORY_EVENTS)));
    return (Array.isArray(reports) ? reports : []).map(normalizeAgentReadOnlyAuditHistoryReport).slice(-max);
}

function normalizeAgentReadOnlyAuditHistoryWindow(value) {
    const source = value && typeof value === "object" ? value : {};
    const reports = buildAgentReadOnlyAuditHistoryWindow(source.reports, MAX_HISTORY_EVENTS);
    return {version: 1, reports};
}

function isAgentReadOnlyAuditHistoryWindowCompatible(value) {
    const window = normalizeAgentReadOnlyAuditHistoryWindow(value);
    return value && value.version === 1 && window.reports.length <= MAX_HISTORY_EVENTS && window.reports.every(isAgentReadOnlyAuditHistoryReportCompatible);
}

function serializeAgentReadOnlyAuditHistoryWindow(value) { return JSON.stringify(normalizeAgentReadOnlyAuditHistoryWindow(value)); }
function parseAgentReadOnlyAuditHistoryWindow(value) {
    if (typeof value !== "string" || value.length > 16384) return normalizeAgentReadOnlyAuditHistoryWindow({});
    try { return normalizeAgentReadOnlyAuditHistoryWindow(JSON.parse(value)); } catch (_) { return normalizeAgentReadOnlyAuditHistoryWindow({}); }
}

function summarizeAgentReadOnlyAuditHistoryWindow(value) {
    const window = normalizeAgentReadOnlyAuditHistoryWindow(value);
    const reports = window.reports;
    const latest = reports.length ? reports[reports.length - 1] : null;
    const previous = reports.length > 1 ? reports[reports.length - 2] : null;
    const diff = latest && previous ? diffAgentReadOnlyAuditHistoryReports(previous, latest) : {healthChanged: false, healthDelta: 0, sizeChanged: false, sequenceChanged: false, eventsChanged: false, trend: "stable"};
    return {version: 1, size: reports.length, latestHealth: latest ? latest.health : "empty", trend: diff.trend, healthChanged: diff.healthChanged};
}

function normalizeAgentAuditReportSequence(value) { return normalizeAgentAuditCursor(value); }

function dedupeAgentReadOnlyAuditHistoryReports(reports) {
    const seen = new Set();
    const list = Array.isArray(reports) ? reports.map(normalizeAgentReadOnlyAuditHistoryReport) : [];
    return list.filter((report) => {
        const sequence = normalizeAgentAuditReportSequence(report.summary.latestSequence);
        const key = sequence > 0 ? `seq:${sequence}` : `fallback:${report.health}:${report.summary.size}:${report.events.total}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function mergeAgentReadOnlyAuditHistoryWindows(left, right, limit = MAX_HISTORY_EVENTS) {
    const a = normalizeAgentReadOnlyAuditHistoryWindow(left).reports;
    const b = normalizeAgentReadOnlyAuditHistoryWindow(right).reports;
    return {version: 1, reports: buildAgentReadOnlyAuditHistoryWindow(dedupeAgentReadOnlyAuditHistoryReports([...a, ...b]).sort((x, y) => x.summary.latestSequence - y.summary.latestSequence), limit)};
}

function trimAgentReadOnlyAuditHistoryWindow(value, limit = MAX_HISTORY_EVENTS) {
    const window = normalizeAgentReadOnlyAuditHistoryWindow(value);
    return {version: 1, reports: buildAgentReadOnlyAuditHistoryWindow(window.reports, limit)};
}

function selectAgentReadOnlyAuditReportsByHealth(value, health = "healthy", limit = MAX_HISTORY_EVENTS) {
    const wanted = normalizeAgentAuditHealth(health);
    const max = Math.min(MAX_HISTORY_EVENTS, Math.max(1, normalizeAgentAuditCount(limit, MAX_HISTORY_EVENTS)));
    return normalizeAgentReadOnlyAuditHistoryWindow(value).reports.filter((report) => report.health === wanted).slice(-max);
}

function summarizeAgentReadOnlyAuditHistoryWindowHealth(value) {
    const reports = normalizeAgentReadOnlyAuditHistoryWindow(value).reports;
    const counts = {empty: 0, healthy: 0, degraded: 0, unavailable: 0};
    reports.forEach((report) => { counts[normalizeAgentAuditHealth(report.health)] += 1; });
    return {version: 1, total: reports.length, counts, latestHealth: reports.length ? reports[reports.length - 1].health : "empty"};
}

function normalizeAgentReadOnlyAuditHistoryWindowHealth(value) {
    const source = value && typeof value === "object" ? value : {};
    const raw = source.counts && typeof source.counts === "object" ? source.counts : {};
    const counts = {};
    ["empty", "healthy", "degraded", "unavailable"].forEach((health) => { counts[health] = normalizeAgentAuditCount(raw[health], MAX_HISTORY_EVENTS); });
    return {version: 1, total: normalizeAgentAuditCount(source.total, MAX_HISTORY_EVENTS), counts, latestHealth: normalizeAgentAuditHealth(source.latestHealth)};
}

function isAgentReadOnlyAuditHistoryWindowHealthCompatible(value) {
    const summary = normalizeAgentReadOnlyAuditHistoryWindowHealth(value);
    const sum = Object.values(summary.counts).reduce((total, count) => total + count, 0);
    return value && value.version === 1 && sum === summary.total;
}

function buildAgentReadOnlyAuditHistoryRecoveryPlan(value, cursor = 0, limit = MAX_HISTORY_EVENTS) {
    const window = normalizeAgentReadOnlyAuditHistoryWindow(value);
    const parsed = normalizeAgentAuditCursor(cursor);
    const reports = window.reports.filter((report) => report.summary.latestSequence > parsed).slice(0, Math.min(MAX_HISTORY_EVENTS, Math.max(1, normalizeAgentAuditCount(limit, MAX_HISTORY_EVENTS))));
    return {version: 1, cursor: parsed, nextCursor: reports.length ? reports[reports.length - 1].summary.latestSequence : parsed, reports, complete: reports.length < limit};
}

function normalizeAgentReadOnlyAuditHistoryRecoveryPlan(value) {
    const source = value && typeof value === "object" ? value : {};
    return {version: 1, cursor: normalizeAgentAuditCursor(source.cursor), nextCursor: normalizeAgentAuditCursor(source.nextCursor), reports: buildAgentReadOnlyAuditHistoryWindow(source.reports, MAX_HISTORY_EVENTS), complete: normalizeAgentAuditBoolean(source.complete)};
}

function isAgentReadOnlyAuditHistoryRecoveryPlanCompatible(value) {
    const plan = normalizeAgentReadOnlyAuditHistoryRecoveryPlan(value);
    return value && value.version === 1 && plan.nextCursor >= plan.cursor && plan.reports.every(isAgentReadOnlyAuditHistoryReportCompatible);
}

function serializeAgentReadOnlyAuditHistoryRecoveryPlan(value) { return JSON.stringify(normalizeAgentReadOnlyAuditHistoryRecoveryPlan(value)); }
function parseAgentReadOnlyAuditHistoryRecoveryPlan(value) {
    if (typeof value !== "string" || value.length > 16384) return normalizeAgentReadOnlyAuditHistoryRecoveryPlan({});
    try { return normalizeAgentReadOnlyAuditHistoryRecoveryPlan(JSON.parse(value)); } catch (_) { return normalizeAgentReadOnlyAuditHistoryRecoveryPlan({}); }
}

function normalizeAgentAuditTransportType(value) { return AUDIT_TRANSPORT_TYPES.includes(value) ? value : "report"; }
function normalizeAgentAuditTransportStatus(value) { return AUDIT_TRANSPORT_STATUS.includes(value) ? value : "invalid"; }
function normalizeAgentAuditRequestId(value) { return text(value, 64).replace(/[^a-z0-9._-]/gi, ""); }
function normalizeAgentAuditChecksum(value) { return text(value, 16).toLowerCase().replace(/[^a-f0-9]/g, ""); }
function checksumAgentAuditPayload(value) { const input = typeof value === "string" ? value : JSON.stringify(value ?? null); let hash = 2166136261; for (let i = 0; i < input.length; i += 1) { hash ^= input.charCodeAt(i); hash = Math.imul(hash, 16777619); } return (hash >>> 0).toString(16).padStart(8, "0"); }

function buildAgentReadOnlyAuditTransportEnvelope(type, payload, requestId = "") {
    const normalizedType = normalizeAgentAuditTransportType(type);
    const body = normalizedType === "report" ? normalizeAgentReadOnlyAuditHistoryReport(payload) : normalizedType === "window" ? normalizeAgentReadOnlyAuditHistoryWindow(payload) : normalizeAgentReadOnlyAuditHistoryRecoveryPlan(payload);
    const serialized = JSON.stringify(body);
    return {version: 1, type: normalizedType, status: "ok", requestId: normalizeAgentAuditRequestId(requestId), checksum: checksumAgentAuditPayload(serialized), payload: body};
}

function normalizeAgentReadOnlyAuditTransportEnvelope(value) {
    const source = value && typeof value === "object" ? value : {};
    const type = normalizeAgentAuditTransportType(source.type);
    const payload = type === "report" ? normalizeAgentReadOnlyAuditHistoryReport(source.payload) : type === "window" ? normalizeAgentReadOnlyAuditHistoryWindow(source.payload) : normalizeAgentReadOnlyAuditHistoryRecoveryPlan(source.payload);
    return {version: 1, type, status: normalizeAgentAuditTransportStatus(source.status), requestId: normalizeAgentAuditRequestId(source.requestId), checksum: normalizeAgentAuditChecksum(source.checksum), payload};
}

function isAgentReadOnlyAuditTransportEnvelopeCompatible(value) {
    const envelope = normalizeAgentReadOnlyAuditTransportEnvelope(value);
    if (!value || value.version !== 1 || !AUDIT_TRANSPORT_TYPES.includes(envelope.type) || !AUDIT_TRANSPORT_STATUS.includes(envelope.status)) return false;
    const payloadText = JSON.stringify(envelope.payload);
    return envelope.status !== "ok" || envelope.checksum === checksumAgentAuditPayload(payloadText);
}

function serializeAgentReadOnlyAuditTransportEnvelope(value) { return JSON.stringify(normalizeAgentReadOnlyAuditTransportEnvelope(value)); }
function parseAgentReadOnlyAuditTransportEnvelope(value) { if (typeof value !== "string" || value.length > 32768) return {version: 1, type: "report", status: "oversized", requestId: "", checksum: "", payload: normalizeAgentReadOnlyAuditHistoryReport({})}; try { return normalizeAgentReadOnlyAuditTransportEnvelope(JSON.parse(value)); } catch (_) { return {version: 1, type: "report", status: "invalid", requestId: "", checksum: "", payload: normalizeAgentReadOnlyAuditHistoryReport({})}; } }

function verifyAgentReadOnlyAuditTransportEnvelope(value) {
    const envelope = normalizeAgentReadOnlyAuditTransportEnvelope(value);
    if (!isAgentReadOnlyAuditTransportEnvelopeCompatible(value)) return {ok: false, status: envelope.status === "ok" ? "invalid" : envelope.status, requestId: envelope.requestId};
    return {ok: true, status: "ok", requestId: envelope.requestId};
}

function buildAgentReadOnlyAuditTransportBatch(items) { const list = Array.isArray(items) ? items.slice(0, MAX_TRANSPORT_ITEMS).map((item) => normalizeAgentReadOnlyAuditTransportEnvelope(item)) : []; return {version: 1, total: list.length, items: list}; }
function normalizeAgentReadOnlyAuditTransportBatch(value) { const source = value && typeof value === "object" ? value : {}; return {version: 1, total: normalizeAgentAuditCount(source.total, MAX_TRANSPORT_ITEMS), items: (Array.isArray(source.items) ? source.items : []).slice(0, MAX_TRANSPORT_ITEMS).map(normalizeAgentReadOnlyAuditTransportEnvelope)}; }
function isAgentReadOnlyAuditTransportBatchCompatible(value) { const batch = normalizeAgentReadOnlyAuditTransportBatch(value); return value && value.version === 1 && batch.total === batch.items.length && batch.items.every(isAgentReadOnlyAuditTransportEnvelopeCompatible); }
function serializeAgentReadOnlyAuditTransportBatch(value) { return JSON.stringify(normalizeAgentReadOnlyAuditTransportBatch(value)); }
function parseAgentReadOnlyAuditTransportBatch(value) { if (typeof value !== "string" || value.length > 65536) return {version: 1, total: 0, items: []}; try { return normalizeAgentReadOnlyAuditTransportBatch(JSON.parse(value)); } catch (_) { return {version: 1, total: 0, items: []}; } }
function summarizeAgentReadOnlyAuditTransportBatch(value) { const batch = normalizeAgentReadOnlyAuditTransportBatch(value); const statuses = {ok: 0, invalid: 0, oversized: 0, unavailable: 0}; batch.items.forEach((item) => { statuses[item.status] += 1; }); return {version: 1, total: batch.items.length, statuses, valid: batch.items.filter(isAgentReadOnlyAuditTransportEnvelopeCompatible).length}; }
function buildAgentReadOnlyAuditTransportFailure(status = "invalid", requestId = "") { const normalized = normalizeAgentAuditTransportStatus(status); return {version: 1, status: normalized, requestId: normalizeAgentAuditRequestId(requestId), retryable: normalized === "unavailable" || normalized === "oversized"}; }
function normalizeAgentReadOnlyAuditTransportFailure(value) { const source = value && typeof value === "object" ? value : {}; const result = buildAgentReadOnlyAuditTransportFailure(source.status, source.requestId); return result; }
function isAgentReadOnlyAuditTransportFailureRetryable(value) { return normalizeAgentReadOnlyAuditTransportFailure(value).retryable; }

function normalizeAgentAuditTransportCursor(value) { return normalizeAgentAuditCursor(value); }
function createAgentReadOnlyAuditTransportQueue(limit = MAX_TRANSPORT_QUEUE) {
    const capacity = Math.min(MAX_TRANSPORT_QUEUE, Math.max(1, normalizeAgentAuditCount(limit, MAX_TRANSPORT_QUEUE)));
    let sequence = 0; let disposed = false; const entries = [];
    return {
        enqueue(envelope) { if (disposed) return {accepted: false, sequence}; const entry = Object.freeze({sequence: ++sequence, envelope: normalizeAgentReadOnlyAuditTransportEnvelope(envelope)}); entries.push(entry); while (entries.length > capacity) entries.shift(); return {accepted: true, sequence: entry.sequence}; },
        list(cursor = 0) { const parsed = normalizeAgentAuditTransportCursor(cursor); return entries.filter((entry) => entry.sequence > parsed).map((entry) => ({sequence: entry.sequence, envelope: normalizeAgentReadOnlyAuditTransportEnvelope(entry.envelope)})); },
        latest() { const entry = entries[entries.length - 1]; return entry ? {sequence: entry.sequence, envelope: normalizeAgentReadOnlyAuditTransportEnvelope(entry.envelope)} : null; },
        acknowledge(cursor = 0) { const parsed = normalizeAgentAuditTransportCursor(cursor); const before = entries.length; while (entries.length && entries[0].sequence <= parsed) entries.shift(); return {acknowledged: before - entries.length, cursor: parsed}; },
        status() { return {size: entries.length, capacity, latestSequence: sequence, disposed}; },
        dispose() { disposed = true; entries.length = 0; },
    };
}
function buildAgentReadOnlyAuditTransportQueueSnapshot(queue) { let status = {}; try { status = queue && typeof queue.status === "function" ? queue.status() : {}; } catch (_) { status = {}; } return {version: 1, size: normalizeAgentAuditCount(status.size, MAX_TRANSPORT_QUEUE), capacity: Math.min(MAX_TRANSPORT_QUEUE, Math.max(1, normalizeAgentAuditCount(status.capacity, MAX_TRANSPORT_QUEUE))), latestSequence: normalizeAgentAuditTransportCursor(status.latestSequence), disposed: normalizeAgentAuditBoolean(status.disposed)}; }
function normalizeAgentReadOnlyAuditTransportQueueSnapshot(value) { const source = value && typeof value === "object" ? value : {}; return {version: 1, size: normalizeAgentAuditCount(source.size, MAX_TRANSPORT_QUEUE), capacity: Math.min(MAX_TRANSPORT_QUEUE, Math.max(1, normalizeAgentAuditCount(source.capacity, MAX_TRANSPORT_QUEUE))), latestSequence: normalizeAgentAuditTransportCursor(source.latestSequence), disposed: normalizeAgentAuditBoolean(source.disposed)}; }
function isAgentReadOnlyAuditTransportQueueSnapshotCompatible(value) { const snapshot = normalizeAgentReadOnlyAuditTransportQueueSnapshot(value); return value && value.version === 1 && snapshot.size <= snapshot.capacity && snapshot.latestSequence >= snapshot.size; }
function serializeAgentReadOnlyAuditTransportQueueSnapshot(value) { return JSON.stringify(normalizeAgentReadOnlyAuditTransportQueueSnapshot(value)); }
function parseAgentReadOnlyAuditTransportQueueSnapshot(value) { if (typeof value !== "string" || value.length > 512) return normalizeAgentReadOnlyAuditTransportQueueSnapshot({}); try { return normalizeAgentReadOnlyAuditTransportQueueSnapshot(JSON.parse(value)); } catch (_) { return normalizeAgentReadOnlyAuditTransportQueueSnapshot({}); } }
function selectAgentReadOnlyAuditTransportQueueByType(queue, type = "report", cursor = 0, limit = MAX_TRANSPORT_ITEMS) { const wanted = normalizeAgentAuditTransportType(type); const max = Math.min(MAX_TRANSPORT_ITEMS, Math.max(1, normalizeAgentAuditCount(limit, MAX_TRANSPORT_ITEMS))); return (queue && typeof queue.list === "function" ? queue.list(cursor) : []).filter((entry) => entry.envelope.type === wanted).slice(0, max); }
function summarizeAgentReadOnlyAuditTransportQueue(queue) { const snapshot = buildAgentReadOnlyAuditTransportQueueSnapshot(queue); const latest = queue && typeof queue.latest === "function" ? queue.latest() : null; return {version: 1, ...snapshot, hasLatest: Boolean(latest), utilization: snapshot.capacity ? Number((snapshot.size / snapshot.capacity).toFixed(4)) : 0}; }
function normalizeAgentReadOnlyAuditTransportQueueSummary(value) { const source = value && typeof value === "object" ? value : {}; const snapshot = normalizeAgentReadOnlyAuditTransportQueueSnapshot(source); return {version: 1, size: snapshot.size, capacity: snapshot.capacity, latestSequence: snapshot.latestSequence, disposed: snapshot.disposed, hasLatest: normalizeAgentAuditBoolean(source.hasLatest), utilization: Math.max(0, Math.min(1, Number(source.utilization) || 0))}; }
function isAgentReadOnlyAuditTransportQueueSummaryCompatible(value) { const summary = normalizeAgentReadOnlyAuditTransportQueueSummary(value); return value && value.version === 1 && summary.size <= summary.capacity && summary.utilization <= 1; }
function buildAgentReadOnlyAuditTransportQueueRecovery(queue, cursor = 0, limit = MAX_TRANSPORT_ITEMS) { const parsed = normalizeAgentAuditTransportCursor(cursor); const entries = queue && typeof queue.list === "function" ? queue.list(parsed).slice(0, Math.min(MAX_TRANSPORT_ITEMS, Math.max(1, normalizeAgentAuditCount(limit, MAX_TRANSPORT_ITEMS)))) : []; return {version: 1, cursor: parsed, nextCursor: entries.length ? entries[entries.length - 1].sequence : parsed, entries, complete: entries.length < limit}; }
function normalizeAgentReadOnlyAuditTransportQueueRecovery(value) { const source = value && typeof value === "object" ? value : {}; return {version: 1, cursor: normalizeAgentAuditTransportCursor(source.cursor), nextCursor: normalizeAgentAuditTransportCursor(source.nextCursor), entries: Array.isArray(source.entries) ? source.entries.slice(0, MAX_TRANSPORT_ITEMS).map((entry) => ({sequence: normalizeAgentAuditTransportCursor(entry?.sequence), envelope: normalizeAgentReadOnlyAuditTransportEnvelope(entry?.envelope)})) : [], complete: normalizeAgentAuditBoolean(source.complete)}; }
function isAgentReadOnlyAuditTransportQueueRecoveryCompatible(value) { const recovery = normalizeAgentReadOnlyAuditTransportQueueRecovery(value); return value && value.version === 1 && recovery.nextCursor >= recovery.cursor; }
function serializeAgentReadOnlyAuditTransportQueueRecovery(value) { return JSON.stringify(normalizeAgentReadOnlyAuditTransportQueueRecovery(value)); }
function parseAgentReadOnlyAuditTransportQueueRecovery(value) { if (typeof value !== "string" || value.length > 32768) return normalizeAgentReadOnlyAuditTransportQueueRecovery({}); try { return normalizeAgentReadOnlyAuditTransportQueueRecovery(JSON.parse(value)); } catch (_) { return normalizeAgentReadOnlyAuditTransportQueueRecovery({}); } }

const AUDIT_QUEUE_RISKS = Object.freeze(["normal", "warning", "critical", "disposed"]);
function normalizeAgentAuditQueueRisk(value) { return AUDIT_QUEUE_RISKS.includes(value) ? value : "normal"; }
function classifyAgentReadOnlyAuditTransportQueueRisk(value) { const summary = normalizeAgentReadOnlyAuditTransportQueueSummary(value); const utilization = summary.utilization || (summary.capacity ? summary.size / summary.capacity : 0); if (summary.disposed) return "disposed"; if (utilization >= 0.9) return "critical"; if (utilization >= 0.7) return "warning"; return "normal"; }
function diffAgentReadOnlyAuditTransportQueueSnapshots(previous, next) { const a = normalizeAgentReadOnlyAuditTransportQueueSnapshot(previous); const b = normalizeAgentReadOnlyAuditTransportQueueSnapshot(next); return {sizeChanged: a.size !== b.size, capacityChanged: a.capacity !== b.capacity, sequenceChanged: a.latestSequence !== b.latestSequence, disposedChanged: a.disposed !== b.disposed, sizeDelta: b.size - a.size}; }
function buildAgentReadOnlyAuditTransportQueueEvents(previous, next) { const diff = diffAgentReadOnlyAuditTransportQueueSnapshots(previous, next); const events = []; if (diff.sizeChanged) events.push({type: "size_changed", delta: diff.sizeDelta}); if (diff.capacityChanged) events.push({type: "capacity_changed", delta: 0}); if (diff.sequenceChanged) events.push({type: "sequence_changed", delta: 0}); if (diff.disposedChanged) events.push({type: "disposed_changed", delta: 0}); return events.slice(0, MAX_HISTORY_EVENTS).map(normalizeAgentReadOnlyAuditTransportQueueEvent); }
function normalizeAgentReadOnlyAuditTransportQueueEvent(value) { const source = value && typeof value === "object" ? value : {}; const allowed = ["size_changed", "capacity_changed", "sequence_changed", "disposed_changed"]; return {type: allowed.includes(source.type) ? source.type : "size_changed", delta: Math.max(-MAX_TRANSPORT_QUEUE, Math.min(MAX_TRANSPORT_QUEUE, Math.trunc(Number(source.delta) || 0)))}; }
function normalizeAgentReadOnlyAuditTransportQueueEvents(events) { if (!Array.isArray(events)) return []; const seen = new Set(); return events.map(normalizeAgentReadOnlyAuditTransportQueueEvent).filter((event) => { if (seen.has(event.type)) return false; seen.add(event.type); return true; }).slice(0, MAX_HISTORY_EVENTS); }
function summarizeAgentReadOnlyAuditTransportQueueEvents(events) { const list = normalizeAgentReadOnlyAuditTransportQueueEvents(events); return {version: 1, total: list.length, growth: list.filter((e) => e.type === "size_changed" && e.delta > 0).length, shrink: list.filter((e) => e.type === "size_changed" && e.delta < 0).length, lifecycle: list.filter((e) => e.type === "disposed_changed").length}; }
function buildAgentReadOnlyAuditTransportQueueCheckpoint(queue) { const snapshot = buildAgentReadOnlyAuditTransportQueueSnapshot(queue); return {version: 1, cursor: snapshot.latestSequence, snapshot}; }
function normalizeAgentReadOnlyAuditTransportQueueCheckpoint(value) { const source = value && typeof value === "object" ? value : {}; return {version: 1, cursor: normalizeAgentAuditTransportCursor(source.cursor), snapshot: normalizeAgentReadOnlyAuditTransportQueueSnapshot(source.snapshot)}; }
function isAgentReadOnlyAuditTransportQueueCheckpointCompatible(value) { const checkpoint = normalizeAgentReadOnlyAuditTransportQueueCheckpoint(value); return value && value.version === 1 && checkpoint.cursor >= checkpoint.snapshot.latestSequence; }
function serializeAgentReadOnlyAuditTransportQueueCheckpoint(value) { return JSON.stringify(normalizeAgentReadOnlyAuditTransportQueueCheckpoint(value)); }
function parseAgentReadOnlyAuditTransportQueueCheckpoint(value) { if (typeof value !== "string" || value.length > 1024) return normalizeAgentReadOnlyAuditTransportQueueCheckpoint({}); try { return normalizeAgentReadOnlyAuditTransportQueueCheckpoint(JSON.parse(value)); } catch (_) { return normalizeAgentReadOnlyAuditTransportQueueCheckpoint({}); } }
function buildAgentReadOnlyAuditTransportQueueReplayResult(entries, cursor = 0) { const list = Array.isArray(entries) ? entries.slice(0, MAX_TRANSPORT_ITEMS) : []; const parsed = normalizeAgentAuditTransportCursor(cursor); return {version: 1, cursor: parsed, nextCursor: list.length ? normalizeAgentAuditTransportCursor(list[list.length - 1]?.sequence) : parsed, count: list.length, complete: list.length < MAX_TRANSPORT_ITEMS}; }
function normalizeAgentReadOnlyAuditTransportQueueReplayResult(value) { const source = value && typeof value === "object" ? value : {}; return {version: 1, cursor: normalizeAgentAuditTransportCursor(source.cursor), nextCursor: normalizeAgentAuditTransportCursor(source.nextCursor), count: normalizeAgentAuditCount(source.count, MAX_TRANSPORT_ITEMS), complete: normalizeAgentAuditBoolean(source.complete)}; }
function isAgentReadOnlyAuditTransportQueueReplayResultCompatible(value) { const result = normalizeAgentReadOnlyAuditTransportQueueReplayResult(value); return value && value.version === 1 && result.nextCursor >= result.cursor && result.count <= MAX_TRANSPORT_ITEMS; }
function buildAgentReadOnlyAuditTransportQueueAcknowledgeResult(cursor, acknowledged = 0) { return {version: 1, cursor: normalizeAgentAuditTransportCursor(cursor), acknowledged: normalizeAgentAuditCount(acknowledged, MAX_TRANSPORT_QUEUE)}; }
function normalizeAgentReadOnlyAuditTransportQueueAcknowledgeResult(value) { const source = value && typeof value === "object" ? value : {}; return buildAgentReadOnlyAuditTransportQueueAcknowledgeResult(source.cursor, source.acknowledged); }
function serializeAgentReadOnlyAuditTransportQueueReplayResult(value) { return JSON.stringify(normalizeAgentReadOnlyAuditTransportQueueReplayResult(value)); }
function parseAgentReadOnlyAuditTransportQueueReplayResult(value) { if (typeof value !== "string" || value.length > 512) return normalizeAgentReadOnlyAuditTransportQueueReplayResult({}); try { return normalizeAgentReadOnlyAuditTransportQueueReplayResult(JSON.parse(value)); } catch (_) { return normalizeAgentReadOnlyAuditTransportQueueReplayResult({}); } }

module.exports = {
    DEVICES, STATUS, REASONS, SAFE_EFFECTS, MAX_ITEMS,
    normalizeAgentCapabilityName, normalizeAgentAuditDevice, normalizeAgentAuditStatus, normalizeAgentAuditReason,
    normalizeAgentAuditEffects, normalizeAgentAuditDevices, normalizeAgentAuditCount, normalizeAgentAuditBoolean,
    isReadOnlyAgentEffects, redactAgentAuditError, normalizeAgentAuditResult, buildAgentCapabilityAuditItem,
    auditAgentCapabilityDefinition, auditAgentCapabilityDefinitions, summarizeAgentCapabilityAudit,
    buildAgentReadOnlyAuditSnapshot, normalizeAgentReadOnlyAuditSnapshot, isAgentReadOnlyAuditSnapshotCompatible,
    buildAgentAuditFailure, buildAgentAuditDeviceMatrix, diffAgentReadOnlyAuditSnapshots, normalizeAgentAuditEvent,
    buildAgentReadOnlyAuditEvents, normalizeAgentReadOnlyAuditEvents,
    MAX_HISTORY_EVENTS, AUDIT_HEALTH, AUDIT_TRENDS, AUDIT_TRANSPORT_TYPES, AUDIT_TRANSPORT_STATUS, MAX_TRANSPORT_ITEMS, normalizeAgentAuditHistoryLimit, createAgentReadOnlyAuditHistory, buildAgentAuditLifecycleEvent, normalizeAgentAuditCursor,
    normalizeAgentAuditHistoryEventType, buildAgentAuditHistoryEvent, normalizeAgentAuditHistoryEvent,
    buildAgentReadOnlyAuditHistorySummary, normalizeAgentReadOnlyAuditHistorySummary,
    isAgentReadOnlyAuditHistorySummaryCompatible, serializeAgentReadOnlyAuditHistorySummary,
    parseAgentReadOnlyAuditHistorySummary, selectAgentReadOnlyAuditHistoryEvents,
    normalizeAgentAuditHealth, buildAgentReadOnlyAuditHistoryHealth, buildAgentReadOnlyAuditEventSummary,
    normalizeAgentReadOnlyAuditEventSummary, buildAgentReadOnlyAuditHistoryReport,
    normalizeAgentReadOnlyAuditHistoryReport, isAgentReadOnlyAuditHistoryReportCompatible,
    serializeAgentReadOnlyAuditHistoryReport, parseAgentReadOnlyAuditHistoryReport,
    normalizeAgentAuditTrend, auditHealthRank, diffAgentReadOnlyAuditHistoryReports,
    buildAgentReadOnlyAuditHistoryReportEvents, normalizeAgentReadOnlyAuditHistoryReportEvent,
    normalizeAgentReadOnlyAuditHistoryReportEvents, summarizeAgentReadOnlyAuditHistoryReportEvents,
    buildAgentReadOnlyAuditHistoryWindow, normalizeAgentReadOnlyAuditHistoryWindow,
    isAgentReadOnlyAuditHistoryWindowCompatible, serializeAgentReadOnlyAuditHistoryWindow,
    parseAgentReadOnlyAuditHistoryWindow, summarizeAgentReadOnlyAuditHistoryWindow,
    normalizeAgentAuditReportSequence, dedupeAgentReadOnlyAuditHistoryReports,
    mergeAgentReadOnlyAuditHistoryWindows, trimAgentReadOnlyAuditHistoryWindow,
    selectAgentReadOnlyAuditReportsByHealth, summarizeAgentReadOnlyAuditHistoryWindowHealth,
    normalizeAgentReadOnlyAuditHistoryWindowHealth, isAgentReadOnlyAuditHistoryWindowHealthCompatible,
    buildAgentReadOnlyAuditHistoryRecoveryPlan, normalizeAgentReadOnlyAuditHistoryRecoveryPlan,
    isAgentReadOnlyAuditHistoryRecoveryPlanCompatible, serializeAgentReadOnlyAuditHistoryRecoveryPlan,
    parseAgentReadOnlyAuditHistoryRecoveryPlan,
    normalizeAgentAuditTransportType, normalizeAgentAuditTransportStatus, normalizeAgentAuditRequestId,
    normalizeAgentAuditChecksum, checksumAgentAuditPayload, buildAgentReadOnlyAuditTransportEnvelope,
    normalizeAgentReadOnlyAuditTransportEnvelope, isAgentReadOnlyAuditTransportEnvelopeCompatible,
    serializeAgentReadOnlyAuditTransportEnvelope, parseAgentReadOnlyAuditTransportEnvelope,
    verifyAgentReadOnlyAuditTransportEnvelope, buildAgentReadOnlyAuditTransportBatch,
    normalizeAgentReadOnlyAuditTransportBatch, isAgentReadOnlyAuditTransportBatchCompatible,
    serializeAgentReadOnlyAuditTransportBatch, parseAgentReadOnlyAuditTransportBatch,
    summarizeAgentReadOnlyAuditTransportBatch, buildAgentReadOnlyAuditTransportFailure,
    normalizeAgentReadOnlyAuditTransportFailure, isAgentReadOnlyAuditTransportFailureRetryable,
    MAX_TRANSPORT_QUEUE, normalizeAgentAuditTransportCursor, createAgentReadOnlyAuditTransportQueue,
    buildAgentReadOnlyAuditTransportQueueSnapshot, normalizeAgentReadOnlyAuditTransportQueueSnapshot,
    isAgentReadOnlyAuditTransportQueueSnapshotCompatible, serializeAgentReadOnlyAuditTransportQueueSnapshot,
    parseAgentReadOnlyAuditTransportQueueSnapshot, selectAgentReadOnlyAuditTransportQueueByType,
    summarizeAgentReadOnlyAuditTransportQueue, normalizeAgentReadOnlyAuditTransportQueueSummary,
    isAgentReadOnlyAuditTransportQueueSummaryCompatible, buildAgentReadOnlyAuditTransportQueueRecovery,
    normalizeAgentReadOnlyAuditTransportQueueRecovery, isAgentReadOnlyAuditTransportQueueRecoveryCompatible,
    serializeAgentReadOnlyAuditTransportQueueRecovery, parseAgentReadOnlyAuditTransportQueueRecovery,
    AUDIT_QUEUE_RISKS, normalizeAgentAuditQueueRisk, classifyAgentReadOnlyAuditTransportQueueRisk,
    diffAgentReadOnlyAuditTransportQueueSnapshots, buildAgentReadOnlyAuditTransportQueueEvents,
    normalizeAgentReadOnlyAuditTransportQueueEvent, normalizeAgentReadOnlyAuditTransportQueueEvents,
    summarizeAgentReadOnlyAuditTransportQueueEvents, buildAgentReadOnlyAuditTransportQueueCheckpoint,
    normalizeAgentReadOnlyAuditTransportQueueCheckpoint, isAgentReadOnlyAuditTransportQueueCheckpointCompatible,
    serializeAgentReadOnlyAuditTransportQueueCheckpoint, parseAgentReadOnlyAuditTransportQueueCheckpoint,
    buildAgentReadOnlyAuditTransportQueueReplayResult, normalizeAgentReadOnlyAuditTransportQueueReplayResult,
    isAgentReadOnlyAuditTransportQueueReplayResultCompatible, buildAgentReadOnlyAuditTransportQueueAcknowledgeResult,
    normalizeAgentReadOnlyAuditTransportQueueAcknowledgeResult, serializeAgentReadOnlyAuditTransportQueueReplayResult,
    parseAgentReadOnlyAuditTransportQueueReplayResult,
};
