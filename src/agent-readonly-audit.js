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

module.exports = {
    DEVICES, STATUS, REASONS, SAFE_EFFECTS, MAX_ITEMS,
    normalizeAgentCapabilityName, normalizeAgentAuditDevice, normalizeAgentAuditStatus, normalizeAgentAuditReason,
    normalizeAgentAuditEffects, normalizeAgentAuditDevices, normalizeAgentAuditCount, normalizeAgentAuditBoolean,
    isReadOnlyAgentEffects, redactAgentAuditError, normalizeAgentAuditResult, buildAgentCapabilityAuditItem,
    auditAgentCapabilityDefinition, auditAgentCapabilityDefinitions, summarizeAgentCapabilityAudit,
    buildAgentReadOnlyAuditSnapshot, normalizeAgentReadOnlyAuditSnapshot, isAgentReadOnlyAuditSnapshotCompatible,
    buildAgentAuditFailure, buildAgentAuditDeviceMatrix, diffAgentReadOnlyAuditSnapshots, normalizeAgentAuditEvent,
    buildAgentReadOnlyAuditEvents, normalizeAgentReadOnlyAuditEvents,
    MAX_HISTORY_EVENTS, AUDIT_HEALTH, AUDIT_TRENDS, normalizeAgentAuditHistoryLimit, createAgentReadOnlyAuditHistory, buildAgentAuditLifecycleEvent, normalizeAgentAuditCursor,
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
};
