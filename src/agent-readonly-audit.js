"use strict";
const DEVICES = Object.freeze(["desktop", "sidebar", "mobile"]);
const STATUS = Object.freeze(["ready", "unavailable", "failed", "cancelled", "timeout"]);
const REASONS = Object.freeze(["cancelled", "timeout", "permission_denied", "unavailable", "failed"]);
const SAFE_EFFECTS = Object.freeze(["localRead"]);
const MAX_ITEMS = 32;
const MAX_HISTORY_EVENTS = 8;
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
function diffAgentReadOnlyAuditSnapshots(previous, next) {
    const a = normalizeAgentReadOnlyAuditSnapshot(previous);
    const b = normalizeAgentReadOnlyAuditSnapshot(next);
    return {validChanged: a.audit.valid !== b.audit.valid, statusChanged: a.status !== b.status, reasonChanged: a.reason !== b.reason, deviceChanged: a.device !== b.device, disposedChanged: a.disposed !== b.disposed};
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
module.exports = {
    DEVICES,
    STATUS,
    REASONS,
    SAFE_EFFECTS,
    MAX_ITEMS,
    normalizeAgentCapabilityName,
    normalizeAgentAuditDevice,
    normalizeAgentAuditStatus,
    normalizeAgentAuditReason,
    normalizeAgentAuditEffects,
    normalizeAgentAuditDevices,
    normalizeAgentAuditCount,
    normalizeAgentAuditBoolean,
    isReadOnlyAgentEffects,
    buildAgentCapabilityAuditItem,
    auditAgentCapabilityDefinition,
    auditAgentCapabilityDefinitions,
    summarizeAgentCapabilityAudit,
    buildAgentReadOnlyAuditSnapshot,
    normalizeAgentReadOnlyAuditSnapshot,
    diffAgentReadOnlyAuditSnapshots,
    buildAgentReadOnlyAuditEvents,
    MAX_HISTORY_EVENTS,
    normalizeAgentAuditHistoryLimit,
    createAgentReadOnlyAuditHistory,
    buildAgentAuditLifecycleEvent,
    normalizeAgentAuditCursor,
    normalizeAgentAuditHistoryEventType,
    buildAgentAuditHistoryEvent,
    normalizeAgentAuditHistoryEvent,
    buildAgentReadOnlyAuditHistorySummary,
    buildAgentReadOnlyAuditHistoryHealth,
    buildAgentReadOnlyAuditEventSummary,
};
