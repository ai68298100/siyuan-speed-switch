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

function clearAgentReadOnlyAuditTransportQueue(queue) { if (!queue || typeof queue.acknowledge !== "function" || typeof queue.status !== "function") return {cleared: 0, cursor: 0}; const status = queue.status(); const result = queue.acknowledge(status.latestSequence); return {cleared: normalizeAgentAuditCount(result.acknowledged, MAX_TRANSPORT_QUEUE), cursor: normalizeAgentAuditTransportCursor(result.cursor)}; }
function resetAgentReadOnlyAuditTransportQueue(queue) { const result = clearAgentReadOnlyAuditTransportQueue(queue); return {version: 1, previousCursor: result.cursor, cleared: result.cleared}; }
function peekAgentReadOnlyAuditTransportQueue(queue, limit = MAX_TRANSPORT_ITEMS) { const max = Math.min(MAX_TRANSPORT_ITEMS, Math.max(1, normalizeAgentAuditCount(limit, MAX_TRANSPORT_ITEMS))); return queue && typeof queue.list === "function" ? queue.list(0).slice(0, max) : []; }
function buildAgentReadOnlyAuditTransportQueueHealth(queue) { const summary = summarizeAgentReadOnlyAuditTransportQueue(queue); return {version: 1, risk: normalizeAgentAuditQueueRisk(classifyAgentReadOnlyAuditTransportQueueRisk(summary)), size: summary.size, capacity: summary.capacity, utilization: summary.utilization, disposed: summary.disposed}; }
function normalizeAgentReadOnlyAuditTransportQueueHealth(value) { const source = value && typeof value === "object" ? value : {}; const summary = normalizeAgentReadOnlyAuditTransportQueueSummary(source); return {version: 1, risk: normalizeAgentAuditQueueRisk(source.risk), size: summary.size, capacity: summary.capacity, utilization: summary.utilization, disposed: summary.disposed}; }
function isAgentReadOnlyAuditTransportQueueHealthCompatible(value) { const health = normalizeAgentReadOnlyAuditTransportQueueHealth(value); return value && value.version === 1 && health.size <= health.capacity; }
function serializeAgentReadOnlyAuditTransportQueueHealth(value) { return JSON.stringify(normalizeAgentReadOnlyAuditTransportQueueHealth(value)); }
function parseAgentReadOnlyAuditTransportQueueHealth(value) { if (typeof value !== "string" || value.length > 512) return normalizeAgentReadOnlyAuditTransportQueueHealth({}); try { return normalizeAgentReadOnlyAuditTransportQueueHealth(JSON.parse(value)); } catch (_) { return normalizeAgentReadOnlyAuditTransportQueueHealth({}); } }
function mergeAgentReadOnlyAuditTransportBatches(left, right) { const a = normalizeAgentReadOnlyAuditTransportBatch(left).items; const b = normalizeAgentReadOnlyAuditTransportBatch(right).items; const seen = new Set(); const items = [...a, ...b].filter((item) => { const key = `${item.type}:${item.requestId}:${item.checksum}`; if (seen.has(key)) return false; seen.add(key); return true; }).slice(0, MAX_TRANSPORT_ITEMS); return {version: 1, total: items.length, items}; }
function selectAgentReadOnlyAuditTransportBatchByStatus(value, status = "ok", limit = MAX_TRANSPORT_ITEMS) { const wanted = normalizeAgentAuditTransportStatus(status); const max = Math.min(MAX_TRANSPORT_ITEMS, Math.max(1, normalizeAgentAuditCount(limit, MAX_TRANSPORT_ITEMS))); return normalizeAgentReadOnlyAuditTransportBatch(value).items.filter((item) => item.status === wanted).slice(0, max); }
function buildAgentReadOnlyAuditTransportCancellation(status = "unavailable", requestId = "") { const normalized = normalizeAgentAuditTransportStatus(status); return {version: 1, status: normalized === "ok" ? "unavailable" : normalized, requestId: normalizeAgentAuditRequestId(requestId), acknowledged: false}; }
function normalizeAgentReadOnlyAuditTransportCancellation(value) { const source = value && typeof value === "object" ? value : {}; const result = buildAgentReadOnlyAuditTransportCancellation(source.status, source.requestId); return result; }
function isAgentReadOnlyAuditTransportCancellation(value) { return normalizeAgentReadOnlyAuditTransportCancellation(value).acknowledged === false; }
function buildAgentReadOnlyAuditTransportTimeout(requestId = "") { return {version: 1, status: "oversized", requestId: normalizeAgentAuditRequestId(requestId), acknowledged: false}; }
function normalizeAgentReadOnlyAuditTransportTimeout(value) { return buildAgentReadOnlyAuditTransportTimeout(value?.requestId); }
function serializeAgentReadOnlyAuditTransportCancellation(value) { return JSON.stringify(normalizeAgentReadOnlyAuditTransportCancellation(value)); }
function parseAgentReadOnlyAuditTransportCancellation(value) { if (typeof value !== "string" || value.length > 512) return normalizeAgentReadOnlyAuditTransportCancellation({}); try { return normalizeAgentReadOnlyAuditTransportCancellation(JSON.parse(value)); } catch (_) { return normalizeAgentReadOnlyAuditTransportCancellation({}); } }

const AUDIT_REPLAY_STATUS = Object.freeze(["ok", "cancelled", "timeout", "unavailable", "invalid"]);
function normalizeAgentAuditReplayStatus(value) { return AUDIT_REPLAY_STATUS.includes(value) ? value : "invalid"; }
function normalizeAgentAuditDeadline(value) { const parsed = Number(value); return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : 0; }
function isAgentAuditSignalAborted(signal) { return Boolean(signal && signal.aborted === true); }
function isAgentAuditDeadlineExpired(deadline, now = Date.now()) { const parsed = normalizeAgentAuditDeadline(deadline); return parsed > 0 && Number(now) >= parsed; }
function buildAgentReadOnlyAuditTransportReplayOutcome(status = "ok", cursor = 0, count = 0) { return {version: 1, status: normalizeAgentAuditReplayStatus(status), cursor: normalizeAgentAuditTransportCursor(cursor), count: normalizeAgentAuditCount(count, MAX_TRANSPORT_ITEMS), acknowledged: false}; }
function normalizeAgentReadOnlyAuditTransportReplayOutcome(value) { const source = value && typeof value === "object" ? value : {}; return buildAgentReadOnlyAuditTransportReplayOutcome(source.status, source.cursor, source.count); }
function isAgentReadOnlyAuditTransportReplayOutcomeTerminal(value) { return ["ok", "cancelled", "timeout", "unavailable", "invalid"].includes(normalizeAgentReadOnlyAuditTransportReplayOutcome(value).status); }
function replayAgentReadOnlyAuditTransportQueue(queue, options = {}) { if (!queue || typeof queue.list !== "function") return buildAgentReadOnlyAuditTransportReplayOutcome("unavailable"); if (isAgentAuditSignalAborted(options.signal)) return buildAgentReadOnlyAuditTransportReplayOutcome("cancelled", options.cursor); if (isAgentAuditDeadlineExpired(options.deadline, options.now)) return buildAgentReadOnlyAuditTransportReplayOutcome("timeout", options.cursor); const entries = queue.list(options.cursor).slice(0, MAX_TRANSPORT_ITEMS); return buildAgentReadOnlyAuditTransportReplayOutcome("ok", entries.length ? entries[entries.length - 1].sequence : options.cursor, entries.length); }
function acknowledgeAgentReadOnlyAuditTransportQueue(queue, outcome) { const result = normalizeAgentReadOnlyAuditTransportReplayOutcome(outcome); if (result.status !== "ok" || !queue || typeof queue.acknowledge !== "function") return {acknowledged: false, cursor: result.cursor}; const ack = queue.acknowledge(result.cursor); return {acknowledged: true, cursor: normalizeAgentAuditTransportCursor(ack.cursor)}; }
function replayAndAcknowledgeAgentReadOnlyAuditTransportQueue(queue, options = {}) { const outcome = replayAgentReadOnlyAuditTransportQueue(queue, options); const acknowledgment = acknowledgeAgentReadOnlyAuditTransportQueue(queue, outcome); return {...outcome, acknowledged: acknowledgment.acknowledged}; }
function buildAgentReadOnlyAuditTransportReplayError(status, cursor = 0) { const normalized = normalizeAgentAuditReplayStatus(status); return {version: 1, status: normalized, cursor: normalizeAgentAuditTransportCursor(cursor), retryable: normalized === "timeout" || normalized === "unavailable"}; }
function normalizeAgentReadOnlyAuditTransportReplayError(value) { const source = value && typeof value === "object" ? value : {}; return buildAgentReadOnlyAuditTransportReplayError(source.status, source.cursor); }
function isAgentReadOnlyAuditTransportReplayRetryable(value) { return normalizeAgentReadOnlyAuditTransportReplayError(value).retryable; }
function serializeAgentReadOnlyAuditTransportReplayOutcome(value) { return JSON.stringify(normalizeAgentReadOnlyAuditTransportReplayOutcome(value)); }
function parseAgentReadOnlyAuditTransportReplayOutcome(value) { if (typeof value !== "string" || value.length > 512) return normalizeAgentReadOnlyAuditTransportReplayOutcome({status: "invalid"}); try { return normalizeAgentReadOnlyAuditTransportReplayOutcome(JSON.parse(value)); } catch (_) { return normalizeAgentReadOnlyAuditTransportReplayOutcome({status: "invalid"}); } }

const AUDIT_COORDINATOR_STATUS = Object.freeze(["ready", "committed", "cancelled", "timeout", "disposed"]);
function normalizeAgentAuditCoordinatorStatus(value) { return AUDIT_COORDINATOR_STATUS.includes(value) ? value : "ready"; }
function createAgentReadOnlyAuditTransportCoordinator(queue) {
    let disposed = false; let cursor = 0; let commits = 0;
    return {
        recover(options = {}) { if (disposed) return {version: 1, status: "disposed", cursor, commits, acknowledged: false}; const outcome = replayAgentReadOnlyAuditTransportQueue(queue, {...options, cursor}); if (outcome.status !== "ok") return {version: 1, status: normalizeAgentAuditCoordinatorStatus(outcome.status), cursor, commits, acknowledged: false}; if (outcome.count === 0) return {version: 1, status: "ready", cursor, commits, acknowledged: false}; const ack = acknowledgeAgentReadOnlyAuditTransportQueue(queue, outcome); if (!ack.acknowledged) return {version: 1, status: "ready", cursor, commits, acknowledged: false}; cursor = Math.max(cursor, outcome.cursor); commits += 1; return {version: 1, status: "committed", cursor, commits, acknowledged: true}; },
        snapshot() { return {version: 1, status: disposed ? "disposed" : commits ? "committed" : "ready", cursor, commits, disposed}; },
        dispose() { disposed = true; },
    };
}
function normalizeAgentReadOnlyAuditTransportCoordinatorSnapshot(value) { const source = value && typeof value === "object" ? value : {}; return {version: 1, status: normalizeAgentAuditCoordinatorStatus(source.status), cursor: normalizeAgentAuditTransportCursor(source.cursor), commits: normalizeAgentAuditCount(source.commits, MAX_TRANSPORT_QUEUE), disposed: normalizeAgentAuditBoolean(source.disposed)}; }
function isAgentReadOnlyAuditTransportCoordinatorSnapshotCompatible(value) { const snapshot = normalizeAgentReadOnlyAuditTransportCoordinatorSnapshot(value); return value && value.version === 1 && snapshot.commits >= 0; }
function serializeAgentReadOnlyAuditTransportCoordinatorSnapshot(value) { return JSON.stringify(normalizeAgentReadOnlyAuditTransportCoordinatorSnapshot(value)); }
function parseAgentReadOnlyAuditTransportCoordinatorSnapshot(value) { if (typeof value !== "string" || value.length > 512) return normalizeAgentReadOnlyAuditTransportCoordinatorSnapshot({}); try { return normalizeAgentReadOnlyAuditTransportCoordinatorSnapshot(JSON.parse(value)); } catch (_) { return normalizeAgentReadOnlyAuditTransportCoordinatorSnapshot({}); } }
function buildAgentReadOnlyAuditTransportCoordinatorEvents(previous, next) { const a = normalizeAgentReadOnlyAuditTransportCoordinatorSnapshot(previous); const b = normalizeAgentReadOnlyAuditTransportCoordinatorSnapshot(next); const events = []; if (a.status !== b.status) events.push({type: "status_changed"}); if (a.cursor !== b.cursor) events.push({type: "cursor_changed"}); if (a.commits !== b.commits) events.push({type: "commits_changed"}); if (a.disposed !== b.disposed) events.push({type: "disposed_changed"}); return events.slice(0, MAX_HISTORY_EVENTS); }
function normalizeAgentReadOnlyAuditTransportCoordinatorEvents(events) { if (!Array.isArray(events)) return []; const allowed = ["status_changed", "cursor_changed", "commits_changed", "disposed_changed"]; const seen = new Set(); return events.map((event) => ({type: allowed.includes(event?.type) ? event.type : "status_changed"})).filter((event) => { if (seen.has(event.type)) return false; seen.add(event.type); return true; }).slice(0, MAX_HISTORY_EVENTS); }
function summarizeAgentReadOnlyAuditTransportCoordinatorEvents(events) { const list = normalizeAgentReadOnlyAuditTransportCoordinatorEvents(events); return {version: 1, total: list.length, status: list.filter((e) => e.type === "status_changed").length, cursor: list.filter((e) => e.type === "cursor_changed").length, commits: list.filter((e) => e.type === "commits_changed").length, disposed: list.filter((e) => e.type === "disposed_changed").length}; }
function buildAgentReadOnlyAuditTransportCoordinatorResult(status, cursor = 0, commits = 0, acknowledged = false) { return {version: 1, status: normalizeAgentAuditCoordinatorStatus(status), cursor: normalizeAgentAuditTransportCursor(cursor), commits: normalizeAgentAuditCount(commits, MAX_TRANSPORT_QUEUE), acknowledged: normalizeAgentAuditBoolean(acknowledged)}; }
function normalizeAgentReadOnlyAuditTransportCoordinatorResult(value) { const source = value && typeof value === "object" ? value : {}; return buildAgentReadOnlyAuditTransportCoordinatorResult(source.status, source.cursor, source.commits, source.acknowledged); }
function isAgentReadOnlyAuditTransportCoordinatorResultTerminal(value) { return ["committed", "cancelled", "timeout", "disposed"].includes(normalizeAgentReadOnlyAuditTransportCoordinatorResult(value).status); }
function serializeAgentReadOnlyAuditTransportCoordinatorResult(value) { return JSON.stringify(normalizeAgentReadOnlyAuditTransportCoordinatorResult(value)); }
function parseAgentReadOnlyAuditTransportCoordinatorResult(value) { if (typeof value !== "string" || value.length > 512) return normalizeAgentReadOnlyAuditTransportCoordinatorResult({}); try { return normalizeAgentReadOnlyAuditTransportCoordinatorResult(JSON.parse(value)); } catch (_) { return normalizeAgentReadOnlyAuditTransportCoordinatorResult({}); } }

const AUDIT_COORDINATOR_HEALTH = Object.freeze(["idle", "active", "blocked", "disposed"]);
function normalizeAgentAuditCoordinatorHealth(value) { return AUDIT_COORDINATOR_HEALTH.includes(value) ? value : "idle"; }
function buildAgentReadOnlyAuditTransportCoordinatorHealth(snapshot) { const source = normalizeAgentReadOnlyAuditTransportCoordinatorSnapshot(snapshot); if (source.disposed) return "disposed"; if (source.status === "committed") return "idle"; if (source.status === "cancelled" || source.status === "timeout") return "blocked"; return "active"; }
function diffAgentReadOnlyAuditTransportCoordinatorSnapshots(previous, next) { const a = normalizeAgentReadOnlyAuditTransportCoordinatorSnapshot(previous); const b = normalizeAgentReadOnlyAuditTransportCoordinatorSnapshot(next); return {statusChanged: a.status !== b.status, cursorChanged: a.cursor !== b.cursor, commitsChanged: a.commits !== b.commits, disposedChanged: a.disposed !== b.disposed, cursorDelta: b.cursor - a.cursor, commitDelta: b.commits - a.commits}; }
function buildAgentReadOnlyAuditTransportCoordinatorHealthReport(snapshot) { const normalized = normalizeAgentReadOnlyAuditTransportCoordinatorSnapshot(snapshot); return {version: 1, health: normalizeAgentAuditCoordinatorHealth(buildAgentReadOnlyAuditTransportCoordinatorHealth(normalized)), status: normalized.status, cursor: normalized.cursor, commits: normalized.commits, disposed: normalized.disposed}; }
function normalizeAgentReadOnlyAuditTransportCoordinatorHealthReport(value) { const source = value && typeof value === "object" ? value : {}; const snapshot = normalizeAgentReadOnlyAuditTransportCoordinatorSnapshot(source); return {version: 1, health: normalizeAgentAuditCoordinatorHealth(source.health), status: snapshot.status, cursor: snapshot.cursor, commits: snapshot.commits, disposed: snapshot.disposed}; }
function isAgentReadOnlyAuditTransportCoordinatorHealthReportCompatible(value) { const report = normalizeAgentReadOnlyAuditTransportCoordinatorHealthReport(value); return value && value.version === 1 && report.health === normalizeAgentAuditCoordinatorHealth(report.health); }
function serializeAgentReadOnlyAuditTransportCoordinatorHealthReport(value) { return JSON.stringify(normalizeAgentReadOnlyAuditTransportCoordinatorHealthReport(value)); }
function parseAgentReadOnlyAuditTransportCoordinatorHealthReport(value) { if (typeof value !== "string" || value.length > 512) return normalizeAgentReadOnlyAuditTransportCoordinatorHealthReport({}); try { return normalizeAgentReadOnlyAuditTransportCoordinatorHealthReport(JSON.parse(value)); } catch (_) { return normalizeAgentReadOnlyAuditTransportCoordinatorHealthReport({}); } }
function buildAgentReadOnlyAuditTransportCoordinatorDiffEvents(previous, next) { const diff = diffAgentReadOnlyAuditTransportCoordinatorSnapshots(previous, next); const events = []; if (diff.statusChanged) events.push({type: "status_changed", delta: 0}); if (diff.cursorChanged) events.push({type: "cursor_changed", delta: diff.cursorDelta}); if (diff.commitsChanged) events.push({type: "commits_changed", delta: diff.commitDelta}); if (diff.disposedChanged) events.push({type: "disposed_changed", delta: 0}); return events.slice(0, MAX_HISTORY_EVENTS); }
function normalizeAgentReadOnlyAuditTransportCoordinatorDiffEvents(events) { if (!Array.isArray(events)) return []; const allowed = ["status_changed", "cursor_changed", "commits_changed", "disposed_changed"]; const seen = new Set(); return events.map((event) => ({type: allowed.includes(event?.type) ? event.type : "status_changed", delta: Math.max(-MAX_TRANSPORT_QUEUE, Math.min(MAX_TRANSPORT_QUEUE, Math.trunc(Number(event?.delta) || 0)))})).filter((event) => { if (seen.has(event.type)) return false; seen.add(event.type); return true; }).slice(0, MAX_HISTORY_EVENTS); }
function summarizeAgentReadOnlyAuditTransportCoordinatorDiffEvents(events) { const list = normalizeAgentReadOnlyAuditTransportCoordinatorDiffEvents(events); return {version: 1, total: list.length, positive: list.filter((e) => e.delta > 0).length, negative: list.filter((e) => e.delta < 0).length, lifecycle: list.filter((e) => e.type === "disposed_changed").length}; }
function buildAgentReadOnlyAuditTransportCoordinatorCommitWindow(snapshot, limit = MAX_TRANSPORT_ITEMS) { const source = normalizeAgentReadOnlyAuditTransportCoordinatorSnapshot(snapshot); return {version: 1, cursor: source.cursor, commits: source.commits, limit: Math.min(MAX_TRANSPORT_ITEMS, Math.max(1, normalizeAgentAuditCount(limit, MAX_TRANSPORT_ITEMS))), closed: source.disposed}; }
function normalizeAgentReadOnlyAuditTransportCoordinatorCommitWindow(value) { const source = value && typeof value === "object" ? value : {}; return {version: 1, cursor: normalizeAgentAuditTransportCursor(source.cursor), commits: normalizeAgentAuditCount(source.commits, MAX_TRANSPORT_QUEUE), limit: Math.min(MAX_TRANSPORT_ITEMS, Math.max(1, normalizeAgentAuditCount(source.limit, MAX_TRANSPORT_ITEMS))), closed: normalizeAgentAuditBoolean(source.closed)}; }
function isAgentReadOnlyAuditTransportCoordinatorCommitWindowCompatible(value) { const window = normalizeAgentReadOnlyAuditTransportCoordinatorCommitWindow(value); return value && value.version === 1 && window.commits >= 0; }
function serializeAgentReadOnlyAuditTransportCoordinatorCommitWindow(value) { return JSON.stringify(normalizeAgentReadOnlyAuditTransportCoordinatorCommitWindow(value)); }
function parseAgentReadOnlyAuditTransportCoordinatorCommitWindow(value) { if (typeof value !== "string" || value.length > 512) return normalizeAgentReadOnlyAuditTransportCoordinatorCommitWindow({}); try { return normalizeAgentReadOnlyAuditTransportCoordinatorCommitWindow(JSON.parse(value)); } catch (_) { return normalizeAgentReadOnlyAuditTransportCoordinatorCommitWindow({}); } }
function buildAgentReadOnlyAuditTransportCoordinatorBatchResult(results) { const list = Array.isArray(results) ? results.slice(0, MAX_TRANSPORT_ITEMS).map(normalizeAgentReadOnlyAuditTransportCoordinatorResult) : []; return {version: 1, total: list.length, committed: list.filter((r) => r.status === "committed").length, blocked: list.filter((r) => ["cancelled", "timeout"].includes(r.status)).length, disposed: list.filter((r) => r.status === "disposed").length}; }
function normalizeAgentReadOnlyAuditTransportCoordinatorBatchResult(value) { const source = value && typeof value === "object" ? value : {}; return {version: 1, total: normalizeAgentAuditCount(source.total, MAX_TRANSPORT_ITEMS), committed: normalizeAgentAuditCount(source.committed, MAX_TRANSPORT_ITEMS), blocked: normalizeAgentAuditCount(source.blocked, MAX_TRANSPORT_ITEMS), disposed: normalizeAgentAuditCount(source.disposed, MAX_TRANSPORT_ITEMS)}; }
function isAgentReadOnlyAuditTransportCoordinatorBatchResultCompatible(value) { const result = normalizeAgentReadOnlyAuditTransportCoordinatorBatchResult(value); return value && value.version === 1 && result.committed + result.blocked + result.disposed <= result.total; }
function serializeAgentReadOnlyAuditTransportCoordinatorBatchResult(value) { return JSON.stringify(normalizeAgentReadOnlyAuditTransportCoordinatorBatchResult(value)); }
function parseAgentReadOnlyAuditTransportCoordinatorBatchResult(value) { if (typeof value !== "string" || value.length > 512) return normalizeAgentReadOnlyAuditTransportCoordinatorBatchResult({}); try { return normalizeAgentReadOnlyAuditTransportCoordinatorBatchResult(JSON.parse(value)); } catch (_) { return normalizeAgentReadOnlyAuditTransportCoordinatorBatchResult({}); } }
function buildAgentReadOnlyAuditTransportCoordinatorRecoverySummary(results) { const summary = buildAgentReadOnlyAuditTransportCoordinatorBatchResult(results); return {version: 1, ...summary, successRate: summary.total ? Number((summary.committed / summary.total).toFixed(4)) : 0}; }
function normalizeAgentReadOnlyAuditTransportCoordinatorRecoverySummary(value) { const source = value && typeof value === "object" ? value : {}; const summary = normalizeAgentReadOnlyAuditTransportCoordinatorBatchResult(source); return {version: 1, ...summary, successRate: Math.max(0, Math.min(1, Number(source.successRate) || 0))}; }
function isAgentReadOnlyAuditTransportCoordinatorRecoverySummaryCompatible(value) { const summary = normalizeAgentReadOnlyAuditTransportCoordinatorRecoverySummary(value); return value && value.version === 1 && summary.successRate <= 1; }

const AUDIT_JOINT_STATUS = Object.freeze(["ready", "prepared", "committed", "cancelled", "timeout", "disposed", "partial"]);
function normalizeAgentAuditJointStatus(value) { return AUDIT_JOINT_STATUS.includes(value) ? value : "ready"; }
function buildAgentReadOnlyAuditTransportJointSnapshot(coordinators) { const list = Array.isArray(coordinators) ? coordinators.slice(0, MAX_TRANSPORT_ITEMS) : []; const snapshots = list.map((coordinator) => { try { return normalizeAgentReadOnlyAuditTransportCoordinatorSnapshot(coordinator?.snapshot?.()); } catch (_) { return normalizeAgentReadOnlyAuditTransportCoordinatorSnapshot({status: "disposed", disposed: true}); } }); return {version: 1, total: snapshots.length, committed: snapshots.filter((s) => s.status === "committed").length, disposed: snapshots.filter((s) => s.disposed).length, cursor: snapshots.reduce((sum, s) => sum + s.cursor, 0), snapshots}; }
function normalizeAgentReadOnlyAuditTransportJointSnapshot(value) { const source = value && typeof value === "object" ? value : {}; const snapshots = Array.isArray(source.snapshots) ? source.snapshots.slice(0, MAX_TRANSPORT_ITEMS).map(normalizeAgentReadOnlyAuditTransportCoordinatorSnapshot) : []; return {version: 1, total: normalizeAgentAuditCount(source.total, MAX_TRANSPORT_ITEMS), committed: normalizeAgentAuditCount(source.committed, MAX_TRANSPORT_ITEMS), disposed: normalizeAgentAuditCount(source.disposed, MAX_TRANSPORT_ITEMS), cursor: normalizeAgentAuditTransportCursor(source.cursor), snapshots}; }
function isAgentReadOnlyAuditTransportJointSnapshotCompatible(value) { const snapshot = normalizeAgentReadOnlyAuditTransportJointSnapshot(value); return value && value.version === 1 && snapshot.total === snapshot.snapshots.length; }
function summarizeAgentReadOnlyAuditTransportJointHealth(value) { const snapshot = normalizeAgentReadOnlyAuditTransportJointSnapshot(value); const blocked = snapshot.snapshots.filter((s) => ["cancelled", "timeout"].includes(s.status)).length; const disposed = snapshot.disposed || snapshot.snapshots.filter((s) => s.disposed).length; return {version: 1, total: snapshot.snapshots.length, healthy: snapshot.snapshots.filter((s) => s.status === "committed").length, blocked, disposed, health: disposed ? "disposed" : blocked ? "blocked" : snapshot.snapshots.length ? "active" : "idle"}; }
function normalizeAgentReadOnlyAuditTransportJointHealth(value) { const source = value && typeof value === "object" ? value : {}; return {version: 1, total: normalizeAgentAuditCount(source.total, MAX_TRANSPORT_ITEMS), healthy: normalizeAgentAuditCount(source.healthy, MAX_TRANSPORT_ITEMS), blocked: normalizeAgentAuditCount(source.blocked, MAX_TRANSPORT_ITEMS), disposed: normalizeAgentAuditCount(source.disposed, MAX_TRANSPORT_ITEMS), health: ["idle", "active", "blocked", "disposed"].includes(source.health) ? source.health : "idle"}; }
function isAgentReadOnlyAuditTransportJointHealthCompatible(value) { const health = normalizeAgentReadOnlyAuditTransportJointHealth(value); return value && value.version === 1 && health.healthy + health.blocked + health.disposed <= health.total; }
function createAgentReadOnlyAuditTransportJointCoordinator(coordinators) { let disposed = false; let status = "ready"; let commits = 0; let cursor = 0; return {prepare() { if (disposed) return {version: 1, status: "disposed", snapshot: buildAgentReadOnlyAuditTransportJointSnapshot([])}; status = "prepared"; return {version: 1, status, snapshot: buildAgentReadOnlyAuditTransportJointSnapshot(coordinators)}; }, commit(results = []) { if (disposed) return {version: 1, status: "disposed", acknowledged: false, commits, cursor}; const list = Array.isArray(results) ? results.slice(0, MAX_TRANSPORT_ITEMS).map(normalizeAgentReadOnlyAuditTransportCoordinatorResult) : []; if (!list.length || list.some((result) => result.status !== "committed" || !result.acknowledged)) return {version: 1, status: "partial", acknowledged: false, commits, cursor}; status = "committed"; commits += 1; cursor = Math.max(cursor, ...list.map((result) => result.cursor)); return {version: 1, status, acknowledged: true, commits, cursor}; }, snapshot() { return {version: 1, status: disposed ? "disposed" : status, commits, cursor, disposed}; }, dispose() { disposed = true; status = "disposed"; } }; }
function normalizeAgentReadOnlyAuditTransportJointResult(value) { const source = value && typeof value === "object" ? value : {}; return {version: 1, status: normalizeAgentAuditJointStatus(source.status), acknowledged: normalizeAgentAuditBoolean(source.acknowledged), commits: normalizeAgentAuditCount(source.commits, MAX_TRANSPORT_QUEUE), cursor: normalizeAgentAuditTransportCursor(source.cursor)}; }
function isAgentReadOnlyAuditTransportJointResultCompatible(value) {
    const result = normalizeAgentReadOnlyAuditTransportJointResult(value);
    return !!value && typeof value === "object" && value.version === 1
        && AUDIT_JOINT_STATUS.includes(value.status)
        && (!result.acknowledged || result.status === "committed");
}
function buildAgentReadOnlyAuditTransportJointEvents(previous, next) { const a = normalizeAgentReadOnlyAuditTransportJointResult(previous); const b = normalizeAgentReadOnlyAuditTransportJointResult(next); const events = []; if (a.status !== b.status) events.push({type: "status_changed"}); if (a.cursor !== b.cursor) events.push({type: "cursor_changed"}); if (a.commits !== b.commits) events.push({type: "commits_changed"}); if (a.acknowledged !== b.acknowledged) events.push({type: "acknowledged_changed"}); return events.slice(0, MAX_HISTORY_EVENTS); }
function normalizeAgentReadOnlyAuditTransportJointEvents(events) { if (!Array.isArray(events)) return []; const allowed = ["status_changed", "cursor_changed", "commits_changed", "acknowledged_changed"]; const seen = new Set(); return events.map((event) => ({type: allowed.includes(event?.type) ? event.type : "status_changed"})).filter((event) => { if (seen.has(event.type)) return false; seen.add(event.type); return true; }).slice(0, MAX_HISTORY_EVENTS); }
function summarizeAgentReadOnlyAuditTransportJointEvents(events) { const list = normalizeAgentReadOnlyAuditTransportJointEvents(events); return {version: 1, total: list.length, lifecycle: list.filter((e) => e.type === "status_changed").length, cursor: list.filter((e) => e.type === "cursor_changed").length, commits: list.filter((e) => e.type === "commits_changed").length, acknowledged: list.filter((e) => e.type === "acknowledged_changed").length}; }
function buildAgentReadOnlyAuditTransportJointRecoveryPlan(snapshot, cursor = 0) { const normalized = normalizeAgentReadOnlyAuditTransportJointSnapshot(snapshot); const parsed = normalizeAgentAuditTransportCursor(cursor); return {version: 1, cursor: parsed, nextCursor: Math.max(parsed, normalized.cursor), total: normalized.total, ready: normalized.disposed === 0 && normalized.total > 0}; }
function normalizeAgentReadOnlyAuditTransportJointRecoveryPlan(value) { const source = value && typeof value === "object" ? value : {}; return {version: 1, cursor: normalizeAgentAuditTransportCursor(source.cursor), nextCursor: normalizeAgentAuditTransportCursor(source.nextCursor), total: normalizeAgentAuditCount(source.total, MAX_TRANSPORT_ITEMS), ready: normalizeAgentAuditBoolean(source.ready)}; }
function isAgentReadOnlyAuditTransportJointRecoveryPlanCompatible(value) { const plan = normalizeAgentReadOnlyAuditTransportJointRecoveryPlan(value); return value && value.version === 1 && plan.nextCursor >= plan.cursor; }
function buildAgentReadOnlyAuditTransportJointFailure(status = "partial", cursor = 0) { return {version: 1, status: normalizeAgentAuditJointStatus(status), acknowledged: false, cursor: normalizeAgentAuditTransportCursor(cursor)}; }
function serializeAgentReadOnlyAuditTransportJointResult(value) { return JSON.stringify(normalizeAgentReadOnlyAuditTransportJointResult(value)); }
function parseAgentReadOnlyAuditTransportJointResult(value) { if (typeof value !== "string" || value.length > 512) return normalizeAgentReadOnlyAuditTransportJointResult({status: "partial"}); try { return normalizeAgentReadOnlyAuditTransportJointResult(JSON.parse(value)); } catch (_) { return normalizeAgentReadOnlyAuditTransportJointResult({status: "partial"}); } }

function normalizeAgentAuditJointCursor(value) { return normalizeAgentAuditTransportCursor(value); }
function jointHealthRank(value) { return {disposed: 0, blocked: 1, active: 2, idle: 3}[normalizeAgentReadOnlyAuditTransportJointHealth({health: value}).health]; }
function diffAgentReadOnlyAuditTransportJointSnapshots(previous, next) {
    const a = normalizeAgentReadOnlyAuditTransportJointSnapshot(previous);
    const b = normalizeAgentReadOnlyAuditTransportJointSnapshot(next);
    return {totalChanged: a.total !== b.total, committedChanged: a.committed !== b.committed, disposedChanged: a.disposed !== b.disposed, cursorChanged: a.cursor !== b.cursor, totalDelta: b.total - a.total, committedDelta: b.committed - a.committed, disposedDelta: b.disposed - a.disposed, cursorDelta: b.cursor - a.cursor};
}
function buildAgentReadOnlyAuditTransportJointSnapshotEvents(previous, next) {
    const diff = diffAgentReadOnlyAuditTransportJointSnapshots(previous, next);
    const events = [];
    if (diff.totalChanged) events.push({type: "total_changed", delta: diff.totalDelta});
    if (diff.committedChanged) events.push({type: "committed_changed", delta: diff.committedDelta});
    if (diff.disposedChanged) events.push({type: "disposed_changed", delta: diff.disposedDelta});
    if (diff.cursorChanged) events.push({type: "cursor_changed", delta: diff.cursorDelta});
    return events.slice(0, MAX_HISTORY_EVENTS).map(normalizeAgentReadOnlyAuditTransportJointSnapshotEvent);
}
function boundedJointDelta(value) { return Math.max(-MAX_TRANSPORT_ITEMS, Math.min(MAX_TRANSPORT_ITEMS, Math.trunc(Number(value) || 0))); }
function normalizeAgentReadOnlyAuditTransportJointSnapshotEvent(value) { const source = value && typeof value === "object" ? value : {}; const allowed = ["total_changed", "committed_changed", "disposed_changed", "cursor_changed"]; return {type: allowed.includes(source.type) ? source.type : "total_changed", delta: boundedJointDelta(source.delta)}; }
function normalizeAgentReadOnlyAuditTransportJointSnapshotEvents(events) { if (!Array.isArray(events)) return []; const seen = new Set(); return events.map(normalizeAgentReadOnlyAuditTransportJointSnapshotEvent).filter((event) => { if (seen.has(event.type)) return false; seen.add(event.type); return true; }).slice(0, MAX_HISTORY_EVENTS); }
function summarizeAgentReadOnlyAuditTransportJointSnapshotEvents(events) { const list = normalizeAgentReadOnlyAuditTransportJointSnapshotEvents(events); return {version: 1, total: list.length, structural: list.filter((e) => e.type === "total_changed").length, progress: list.filter((e) => e.type === "cursor_changed" || e.type === "committed_changed").length, lifecycle: list.filter((e) => e.type === "disposed_changed").length}; }
function buildAgentReadOnlyAuditTransportJointCheckpoint(snapshot) { const normalized = normalizeAgentReadOnlyAuditTransportJointSnapshot(snapshot); return {version: 1, cursor: normalized.cursor, total: normalized.total, disposed: normalized.disposed}; }
function normalizeAgentReadOnlyAuditTransportJointCheckpoint(value) { const source = value && typeof value === "object" ? value : {}; return {version: 1, cursor: normalizeAgentAuditJointCursor(source.cursor), total: normalizeAgentAuditCount(source.total, MAX_TRANSPORT_ITEMS), disposed: normalizeAgentAuditCount(source.disposed, MAX_TRANSPORT_ITEMS)}; }
function isAgentReadOnlyAuditTransportJointCheckpointCompatible(value) { const checkpoint = normalizeAgentReadOnlyAuditTransportJointCheckpoint(value); return !!value && typeof value === "object" && value.version === 1 && checkpoint.disposed <= checkpoint.total; }
function serializeAgentReadOnlyAuditTransportJointCheckpoint(value) { return JSON.stringify(normalizeAgentReadOnlyAuditTransportJointCheckpoint(value)); }
function parseAgentReadOnlyAuditTransportJointCheckpoint(value) { if (typeof value !== "string" || value.length > 512) return normalizeAgentReadOnlyAuditTransportJointCheckpoint({}); try { return normalizeAgentReadOnlyAuditTransportJointCheckpoint(JSON.parse(value)); } catch (_) { return normalizeAgentReadOnlyAuditTransportJointCheckpoint({}); } }
function buildAgentReadOnlyAuditTransportJointRecoveryOutcome(results) { const summary = buildAgentReadOnlyAuditTransportCoordinatorBatchResult(results); return {version: 1, status: summary.total && summary.committed === summary.total ? "committed" : "partial", ...summary, acknowledged: summary.total > 0 && summary.committed === summary.total}; }
function normalizeAgentReadOnlyAuditTransportJointRecoveryOutcome(value) { const source = value && typeof value === "object" ? value : {}; const summary = normalizeAgentReadOnlyAuditTransportCoordinatorBatchResult(source); return {version: 1, status: normalizeAgentAuditJointStatus(source.status), ...summary, acknowledged: normalizeAgentAuditBoolean(source.acknowledged)}; }
function isAgentReadOnlyAuditTransportJointRecoveryOutcomeCompatible(value) {
    const result = normalizeAgentReadOnlyAuditTransportJointRecoveryOutcome(value);
    const allCommitted = result.total > 0 && result.committed === result.total;
    return !!value && typeof value === "object" && value.version === 1 && ["committed", "partial"].includes(value.status)
        && result.committed + result.blocked + result.disposed <= result.total
        && result.acknowledged === (result.status === "committed" && allCommitted);
}
function serializeAgentReadOnlyAuditTransportJointRecoveryOutcome(value) { return JSON.stringify(normalizeAgentReadOnlyAuditTransportJointRecoveryOutcome(value)); }
function parseAgentReadOnlyAuditTransportJointRecoveryOutcome(value) { if (typeof value !== "string" || value.length > 1024) return normalizeAgentReadOnlyAuditTransportJointRecoveryOutcome({status: "partial"}); try { return normalizeAgentReadOnlyAuditTransportJointRecoveryOutcome(JSON.parse(value)); } catch (_) { return normalizeAgentReadOnlyAuditTransportJointRecoveryOutcome({status: "partial"}); } }

const MAX_JOINT_CHECKPOINTS = MAX_HISTORY_EVENTS;
const AUDIT_JOINT_WINDOW_PROGRESS = Object.freeze(["empty", "stalled", "advancing", "regressing"]);
function normalizeAgentAuditJointWindowLimit(value) { const parsed = normalizeAgentAuditCount(value, MAX_JOINT_CHECKPOINTS); return Math.max(1, parsed || MAX_JOINT_CHECKPOINTS); }
function dedupeAgentReadOnlyAuditTransportJointCheckpoints(checkpoints) {
    if (!Array.isArray(checkpoints)) return [];
    const byCursor = new Map();
    checkpoints.slice(0, MAX_JOINT_CHECKPOINTS * 2).forEach((checkpoint) => { const normalized = normalizeAgentReadOnlyAuditTransportJointCheckpoint(checkpoint); byCursor.set(normalized.cursor, normalized); });
    return [...byCursor.values()].sort((left, right) => left.cursor - right.cursor);
}
function buildAgentReadOnlyAuditTransportJointCheckpointWindow(checkpoints, limit = MAX_JOINT_CHECKPOINTS) { return dedupeAgentReadOnlyAuditTransportJointCheckpoints(checkpoints).slice(-normalizeAgentAuditJointWindowLimit(limit)); }
function normalizeAgentReadOnlyAuditTransportJointCheckpointWindow(value) { const source = value && typeof value === "object" && !Array.isArray(value) ? value : {}; return {version: 1, checkpoints: buildAgentReadOnlyAuditTransportJointCheckpointWindow(source.checkpoints)}; }
function isAgentReadOnlyAuditTransportJointCheckpointWindowCompatible(value) {
    if (!value || typeof value !== "object" || Array.isArray(value) || value.version !== 1 || !Array.isArray(value.checkpoints)) return false;
    const window = normalizeAgentReadOnlyAuditTransportJointCheckpointWindow(value);
    return window.checkpoints.length === value.checkpoints.length && window.checkpoints.length <= MAX_JOINT_CHECKPOINTS && window.checkpoints.every((checkpoint, index) => isAgentReadOnlyAuditTransportJointCheckpointCompatible(value.checkpoints[index]) && (index === 0 || checkpoint.cursor > window.checkpoints[index - 1].cursor));
}
function serializeAgentReadOnlyAuditTransportJointCheckpointWindow(value) { return JSON.stringify(normalizeAgentReadOnlyAuditTransportJointCheckpointWindow(value)); }
function parseAgentReadOnlyAuditTransportJointCheckpointWindow(value) { if (typeof value !== "string" || value.length > 4096) return normalizeAgentReadOnlyAuditTransportJointCheckpointWindow({}); try { return normalizeAgentReadOnlyAuditTransportJointCheckpointWindow(JSON.parse(value)); } catch (_) { return normalizeAgentReadOnlyAuditTransportJointCheckpointWindow({}); } }
function normalizeAgentAuditJointWindowProgress(value) { return AUDIT_JOINT_WINDOW_PROGRESS.includes(value) ? value : "empty"; }
function summarizeAgentReadOnlyAuditTransportJointCheckpointWindow(value) { const checkpoints = normalizeAgentReadOnlyAuditTransportJointCheckpointWindow(value).checkpoints; const latest = checkpoints.at(-1); const previous = checkpoints.at(-2); const progress = !latest ? "empty" : !previous || latest.cursor === previous.cursor ? "stalled" : latest.cursor > previous.cursor ? "advancing" : "regressing"; return {version: 1, size: checkpoints.length, latestCursor: latest?.cursor || 0, total: latest?.total || 0, disposed: latest?.disposed || 0, progress}; }
function normalizeAgentReadOnlyAuditTransportJointCheckpointWindowSummary(value) { const source = value && typeof value === "object" && !Array.isArray(value) ? value : {}; return {version: 1, size: normalizeAgentAuditCount(source.size, MAX_JOINT_CHECKPOINTS), latestCursor: normalizeAgentAuditJointCursor(source.latestCursor), total: normalizeAgentAuditCount(source.total, MAX_TRANSPORT_ITEMS), disposed: normalizeAgentAuditCount(source.disposed, MAX_TRANSPORT_ITEMS), progress: normalizeAgentAuditJointWindowProgress(source.progress)}; }
function isAgentReadOnlyAuditTransportJointCheckpointWindowSummaryCompatible(value) { const summary = normalizeAgentReadOnlyAuditTransportJointCheckpointWindowSummary(value); return !!value && typeof value === "object" && !Array.isArray(value) && value.version === 1 && AUDIT_JOINT_WINDOW_PROGRESS.includes(value.progress) && summary.disposed <= summary.total; }
function diffAgentReadOnlyAuditTransportJointCheckpointWindows(previous, next) { const a = summarizeAgentReadOnlyAuditTransportJointCheckpointWindow(previous); const b = summarizeAgentReadOnlyAuditTransportJointCheckpointWindow(next); return {sizeDelta: b.size - a.size, cursorDelta: b.latestCursor - a.latestCursor, totalDelta: b.total - a.total, disposedDelta: b.disposed - a.disposed, progress: b.progress}; }
function normalizeAgentReadOnlyAuditTransportJointCheckpointWindowEvent(value) { const source = value && typeof value === "object" ? value : {}; const allowed = ["cursor_advanced", "cursor_regressed", "size_changed", "total_changed", "disposed_changed"]; return {type: allowed.includes(source.type) ? source.type : "size_changed", delta: boundedJointDelta(source.delta)}; }
function buildAgentReadOnlyAuditTransportJointCheckpointWindowEvents(previous, next) { const diff = diffAgentReadOnlyAuditTransportJointCheckpointWindows(previous, next); const events = []; if (diff.cursorDelta > 0) events.push({type: "cursor_advanced", delta: diff.cursorDelta}); if (diff.cursorDelta < 0) events.push({type: "cursor_regressed", delta: diff.cursorDelta}); if (diff.sizeDelta) events.push({type: "size_changed", delta: diff.sizeDelta}); if (diff.totalDelta) events.push({type: "total_changed", delta: diff.totalDelta}); if (diff.disposedDelta) events.push({type: "disposed_changed", delta: diff.disposedDelta}); return normalizeAgentReadOnlyAuditTransportJointCheckpointWindowEvents(events); }
function normalizeAgentReadOnlyAuditTransportJointCheckpointWindowEvents(events) { if (!Array.isArray(events)) return []; const seen = new Set(); return events.map(normalizeAgentReadOnlyAuditTransportJointCheckpointWindowEvent).filter((event) => { if (seen.has(event.type)) return false; seen.add(event.type); return true; }).slice(0, MAX_HISTORY_EVENTS); }
function summarizeAgentReadOnlyAuditTransportJointCheckpointWindowEvents(events) { const list = normalizeAgentReadOnlyAuditTransportJointCheckpointWindowEvents(events); return {version: 1, total: list.length, advancing: list.filter((event) => event.type === "cursor_advanced").length, regressing: list.filter((event) => event.type === "cursor_regressed").length, structural: list.filter((event) => ["size_changed", "total_changed", "disposed_changed"].includes(event.type)).length}; }
function selectAgentReadOnlyAuditTransportJointCheckpointsAfter(value, cursor = 0, limit = MAX_JOINT_CHECKPOINTS) { const parsed = normalizeAgentAuditJointCursor(cursor); return normalizeAgentReadOnlyAuditTransportJointCheckpointWindow(value).checkpoints.filter((checkpoint) => checkpoint.cursor > parsed).slice(0, normalizeAgentAuditJointWindowLimit(limit)); }
function mergeAgentReadOnlyAuditTransportJointCheckpointWindows(left, right, limit = MAX_JOINT_CHECKPOINTS) { const a = normalizeAgentReadOnlyAuditTransportJointCheckpointWindow(left).checkpoints; const b = normalizeAgentReadOnlyAuditTransportJointCheckpointWindow(right).checkpoints; return {version: 1, checkpoints: buildAgentReadOnlyAuditTransportJointCheckpointWindow([...a, ...b], limit)}; }
function trimAgentReadOnlyAuditTransportJointCheckpointWindow(value, limit = MAX_JOINT_CHECKPOINTS) { return {version: 1, checkpoints: buildAgentReadOnlyAuditTransportJointCheckpointWindow(normalizeAgentReadOnlyAuditTransportJointCheckpointWindow(value).checkpoints, limit)}; }
function buildAgentReadOnlyAuditTransportJointCheckpointRecoveryPlan(value, cursor = 0, limit = MAX_JOINT_CHECKPOINTS) { const parsed = normalizeAgentAuditJointCursor(cursor); const allPending = selectAgentReadOnlyAuditTransportJointCheckpointsAfter(value, parsed, MAX_JOINT_CHECKPOINTS); const checkpoints = allPending.slice(0, normalizeAgentAuditJointWindowLimit(limit)); return {version: 1, cursor: parsed, nextCursor: checkpoints.at(-1)?.cursor || parsed, checkpoints, complete: checkpoints.length === allPending.length}; }
function normalizeAgentReadOnlyAuditTransportJointCheckpointRecoveryPlan(value) { const source = value && typeof value === "object" && !Array.isArray(value) ? value : {}; return {version: 1, cursor: normalizeAgentAuditJointCursor(source.cursor), nextCursor: normalizeAgentAuditJointCursor(source.nextCursor), checkpoints: buildAgentReadOnlyAuditTransportJointCheckpointWindow(source.checkpoints), complete: normalizeAgentAuditBoolean(source.complete)}; }
function isAgentReadOnlyAuditTransportJointCheckpointRecoveryPlanCompatible(value) { const plan = normalizeAgentReadOnlyAuditTransportJointCheckpointRecoveryPlan(value); return !!value && typeof value === "object" && !Array.isArray(value) && value.version === 1 && Array.isArray(value.checkpoints) && plan.nextCursor >= plan.cursor && plan.checkpoints.every((checkpoint, index) => isAgentReadOnlyAuditTransportJointCheckpointCompatible(value.checkpoints[index]) && checkpoint.cursor > plan.cursor && (index === 0 || checkpoint.cursor > plan.checkpoints[index - 1].cursor)) && (!plan.checkpoints.length || plan.nextCursor === plan.checkpoints.at(-1).cursor); }
function serializeAgentReadOnlyAuditTransportJointCheckpointRecoveryPlan(value) { return JSON.stringify(normalizeAgentReadOnlyAuditTransportJointCheckpointRecoveryPlan(value)); }
function parseAgentReadOnlyAuditTransportJointCheckpointRecoveryPlan(value) { if (typeof value !== "string" || value.length > 4096) return normalizeAgentReadOnlyAuditTransportJointCheckpointRecoveryPlan({}); try { return normalizeAgentReadOnlyAuditTransportJointCheckpointRecoveryPlan(JSON.parse(value)); } catch (_) { return normalizeAgentReadOnlyAuditTransportJointCheckpointRecoveryPlan({}); } }

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
    AUDIT_COORDINATOR_STATUS, normalizeAgentAuditCoordinatorStatus, createAgentReadOnlyAuditTransportCoordinator,
    normalizeAgentReadOnlyAuditTransportCoordinatorSnapshot, isAgentReadOnlyAuditTransportCoordinatorSnapshotCompatible,
    serializeAgentReadOnlyAuditTransportCoordinatorSnapshot, parseAgentReadOnlyAuditTransportCoordinatorSnapshot,
    buildAgentReadOnlyAuditTransportCoordinatorEvents, normalizeAgentReadOnlyAuditTransportCoordinatorEvents,
    summarizeAgentReadOnlyAuditTransportCoordinatorEvents, buildAgentReadOnlyAuditTransportCoordinatorResult,
    normalizeAgentReadOnlyAuditTransportCoordinatorResult, isAgentReadOnlyAuditTransportCoordinatorResultTerminal,
    serializeAgentReadOnlyAuditTransportCoordinatorResult, parseAgentReadOnlyAuditTransportCoordinatorResult,
    AUDIT_REPLAY_STATUS, normalizeAgentAuditReplayStatus, normalizeAgentAuditDeadline,
    isAgentAuditSignalAborted, isAgentAuditDeadlineExpired,
    buildAgentReadOnlyAuditTransportReplayOutcome, normalizeAgentReadOnlyAuditTransportReplayOutcome,
    isAgentReadOnlyAuditTransportReplayOutcomeTerminal, replayAgentReadOnlyAuditTransportQueue,
    acknowledgeAgentReadOnlyAuditTransportQueue, replayAndAcknowledgeAgentReadOnlyAuditTransportQueue,
    buildAgentReadOnlyAuditTransportReplayError, normalizeAgentReadOnlyAuditTransportReplayError,
    isAgentReadOnlyAuditTransportReplayRetryable, serializeAgentReadOnlyAuditTransportReplayOutcome,
    parseAgentReadOnlyAuditTransportReplayOutcome,
    clearAgentReadOnlyAuditTransportQueue, resetAgentReadOnlyAuditTransportQueue,
    peekAgentReadOnlyAuditTransportQueue, buildAgentReadOnlyAuditTransportQueueHealth,
    normalizeAgentReadOnlyAuditTransportQueueHealth, isAgentReadOnlyAuditTransportQueueHealthCompatible,
    serializeAgentReadOnlyAuditTransportQueueHealth, parseAgentReadOnlyAuditTransportQueueHealth,
    mergeAgentReadOnlyAuditTransportBatches, selectAgentReadOnlyAuditTransportBatchByStatus,
    buildAgentReadOnlyAuditTransportCancellation, normalizeAgentReadOnlyAuditTransportCancellation,
    isAgentReadOnlyAuditTransportCancellation, buildAgentReadOnlyAuditTransportTimeout,
    normalizeAgentReadOnlyAuditTransportTimeout, serializeAgentReadOnlyAuditTransportCancellation,
    parseAgentReadOnlyAuditTransportCancellation,
    AUDIT_COORDINATOR_HEALTH, normalizeAgentAuditCoordinatorHealth, buildAgentReadOnlyAuditTransportCoordinatorHealth,
    diffAgentReadOnlyAuditTransportCoordinatorSnapshots, buildAgentReadOnlyAuditTransportCoordinatorHealthReport,
    normalizeAgentReadOnlyAuditTransportCoordinatorHealthReport, isAgentReadOnlyAuditTransportCoordinatorHealthReportCompatible,
    serializeAgentReadOnlyAuditTransportCoordinatorHealthReport, parseAgentReadOnlyAuditTransportCoordinatorHealthReport,
    buildAgentReadOnlyAuditTransportCoordinatorDiffEvents, normalizeAgentReadOnlyAuditTransportCoordinatorDiffEvents,
    summarizeAgentReadOnlyAuditTransportCoordinatorDiffEvents, buildAgentReadOnlyAuditTransportCoordinatorCommitWindow,
    normalizeAgentReadOnlyAuditTransportCoordinatorCommitWindow, isAgentReadOnlyAuditTransportCoordinatorCommitWindowCompatible,
    serializeAgentReadOnlyAuditTransportCoordinatorCommitWindow, parseAgentReadOnlyAuditTransportCoordinatorCommitWindow,
    buildAgentReadOnlyAuditTransportCoordinatorBatchResult, normalizeAgentReadOnlyAuditTransportCoordinatorBatchResult,
    isAgentReadOnlyAuditTransportCoordinatorBatchResultCompatible, serializeAgentReadOnlyAuditTransportCoordinatorBatchResult,
    parseAgentReadOnlyAuditTransportCoordinatorBatchResult, buildAgentReadOnlyAuditTransportCoordinatorRecoverySummary,
    normalizeAgentReadOnlyAuditTransportCoordinatorRecoverySummary, isAgentReadOnlyAuditTransportCoordinatorRecoverySummaryCompatible,
    AUDIT_JOINT_STATUS, normalizeAgentAuditJointStatus, buildAgentReadOnlyAuditTransportJointSnapshot,
    normalizeAgentReadOnlyAuditTransportJointSnapshot, isAgentReadOnlyAuditTransportJointSnapshotCompatible,
    summarizeAgentReadOnlyAuditTransportJointHealth, normalizeAgentReadOnlyAuditTransportJointHealth,
    isAgentReadOnlyAuditTransportJointHealthCompatible, createAgentReadOnlyAuditTransportJointCoordinator,
    normalizeAgentReadOnlyAuditTransportJointResult, isAgentReadOnlyAuditTransportJointResultCompatible,
    buildAgentReadOnlyAuditTransportJointEvents, normalizeAgentReadOnlyAuditTransportJointEvents,
    summarizeAgentReadOnlyAuditTransportJointEvents, buildAgentReadOnlyAuditTransportJointRecoveryPlan,
    normalizeAgentReadOnlyAuditTransportJointRecoveryPlan, isAgentReadOnlyAuditTransportJointRecoveryPlanCompatible,
    buildAgentReadOnlyAuditTransportJointFailure, serializeAgentReadOnlyAuditTransportJointResult,
    parseAgentReadOnlyAuditTransportJointResult,
    normalizeAgentAuditJointCursor, jointHealthRank,
    diffAgentReadOnlyAuditTransportJointSnapshots, buildAgentReadOnlyAuditTransportJointSnapshotEvents,
    normalizeAgentReadOnlyAuditTransportJointSnapshotEvent, normalizeAgentReadOnlyAuditTransportJointSnapshotEvents,
    summarizeAgentReadOnlyAuditTransportJointSnapshotEvents, buildAgentReadOnlyAuditTransportJointCheckpoint,
    normalizeAgentReadOnlyAuditTransportJointCheckpoint, isAgentReadOnlyAuditTransportJointCheckpointCompatible,
    serializeAgentReadOnlyAuditTransportJointCheckpoint, parseAgentReadOnlyAuditTransportJointCheckpoint,
    buildAgentReadOnlyAuditTransportJointRecoveryOutcome, normalizeAgentReadOnlyAuditTransportJointRecoveryOutcome,
    isAgentReadOnlyAuditTransportJointRecoveryOutcomeCompatible, serializeAgentReadOnlyAuditTransportJointRecoveryOutcome,
    parseAgentReadOnlyAuditTransportJointRecoveryOutcome,
    MAX_JOINT_CHECKPOINTS, AUDIT_JOINT_WINDOW_PROGRESS, normalizeAgentAuditJointWindowLimit,
    dedupeAgentReadOnlyAuditTransportJointCheckpoints, buildAgentReadOnlyAuditTransportJointCheckpointWindow,
    normalizeAgentReadOnlyAuditTransportJointCheckpointWindow, isAgentReadOnlyAuditTransportJointCheckpointWindowCompatible,
    serializeAgentReadOnlyAuditTransportJointCheckpointWindow, parseAgentReadOnlyAuditTransportJointCheckpointWindow,
    normalizeAgentAuditJointWindowProgress, summarizeAgentReadOnlyAuditTransportJointCheckpointWindow,
    normalizeAgentReadOnlyAuditTransportJointCheckpointWindowSummary,
    isAgentReadOnlyAuditTransportJointCheckpointWindowSummaryCompatible,
    diffAgentReadOnlyAuditTransportJointCheckpointWindows,
    normalizeAgentReadOnlyAuditTransportJointCheckpointWindowEvent,
    buildAgentReadOnlyAuditTransportJointCheckpointWindowEvents,
    normalizeAgentReadOnlyAuditTransportJointCheckpointWindowEvents,
    summarizeAgentReadOnlyAuditTransportJointCheckpointWindowEvents,
    selectAgentReadOnlyAuditTransportJointCheckpointsAfter,
    mergeAgentReadOnlyAuditTransportJointCheckpointWindows,
    trimAgentReadOnlyAuditTransportJointCheckpointWindow,
    buildAgentReadOnlyAuditTransportJointCheckpointRecoveryPlan,
    normalizeAgentReadOnlyAuditTransportJointCheckpointRecoveryPlan,
    isAgentReadOnlyAuditTransportJointCheckpointRecoveryPlanCompatible,
    serializeAgentReadOnlyAuditTransportJointCheckpointRecoveryPlan,
    parseAgentReadOnlyAuditTransportJointCheckpointRecoveryPlan,
};
