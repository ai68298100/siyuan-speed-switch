"use strict";

const PROBE_REASONS = Object.freeze(["ready", "unavailable", "timeout", "cancelled", "failed"]);

function normalizeWorkspaceCapabilityProbeOutcome(outcome = {}) {
    if (outcome && outcome.kind === "ready") return {ok: true, reason: "ready"};
    if (outcome && outcome.kind === "unavailable") return {ok: false, reason: "unavailable"};
    if (outcome && outcome.kind === "timeout") return {ok: false, reason: "timeout"};
    if (outcome && outcome.kind === "cancelled") return {ok: false, reason: "cancelled"};
    return {ok: false, reason: "failed"};
}

function probeWorkspaceCapabilityHost(host) {
    return typeof host?.addAgentCapability === "function"
        ? {ok: true, reason: "ready"}
        : {ok: false, reason: "unavailable"};
}

function buildWorkspaceCapabilityProbeSnapshot(host, outcome) {
    const result = outcome === undefined ? probeWorkspaceCapabilityHost(host) : normalizeWorkspaceCapabilityProbeOutcome(outcome);
    return Object.freeze({available: result.ok, reason: PROBE_REASONS.includes(result.reason) ? result.reason : "failed"});
}

module.exports = {PROBE_REASONS, normalizeWorkspaceCapabilityProbeOutcome, probeWorkspaceCapabilityHost, buildWorkspaceCapabilityProbeSnapshot};
