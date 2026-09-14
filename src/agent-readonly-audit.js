"use strict";

// Bounded, read-only Agent capability audit helpers. These functions never
// inspect handler closures or host error objects; they provide a stable,
// privacy-safe summary for registration diagnostics and future UI/Agent tools.

const DEVICES = Object.freeze(["desktop", "sidebar", "mobile"]);
const STATUS = Object.freeze(["ready", "unavailable", "failed", "cancelled", "timeout"]);
const REASONS = Object.freeze(["cancelled", "timeout", "permission_denied", "unavailable", "failed"]);
const SAFE_EFFECTS = Object.freeze(["localRead"]);
const MAX_ITEMS = 32;

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

module.exports = {
    DEVICES, STATUS, REASONS, SAFE_EFFECTS, MAX_ITEMS,
    normalizeAgentCapabilityName, normalizeAgentAuditDevice, normalizeAgentAuditStatus, normalizeAgentAuditReason,
    normalizeAgentAuditEffects, normalizeAgentAuditDevices, normalizeAgentAuditCount, normalizeAgentAuditBoolean,
    isReadOnlyAgentEffects, redactAgentAuditError, normalizeAgentAuditResult, buildAgentCapabilityAuditItem,
    auditAgentCapabilityDefinition, auditAgentCapabilityDefinitions, summarizeAgentCapabilityAudit,
    buildAgentReadOnlyAuditSnapshot, normalizeAgentReadOnlyAuditSnapshot, isAgentReadOnlyAuditSnapshotCompatible,
    buildAgentAuditFailure, buildAgentAuditDeviceMatrix, diffAgentReadOnlyAuditSnapshots, normalizeAgentAuditEvent,
    buildAgentReadOnlyAuditEvents, normalizeAgentReadOnlyAuditEvents,
};
