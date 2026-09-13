"use strict";

// In-memory approval token lifecycle for v0.17.  Tokens carry no document
// content; they only bind an approved plan digest to one device and expiry.
const {normalizePlanId, DIGEST_RE} = require("./agent-workspace-execution.js");

const MAX_TOKENS = 32;
const TOKEN_RE = /^at-[a-z0-9]{8,16}$/;
const DEVICES = Object.freeze(["desktop", "sidebar", "mobile"]);

function createApprovalTokenStore(limit = MAX_TOKENS) {
    const max = Math.min(MAX_TOKENS, Math.max(1, Math.trunc(Number(limit) || MAX_TOKENS)));
    const tokens = new Map();
    const remember = (token, record) => {
        tokens.delete(token);
        tokens.set(token, record);
        while (tokens.size > max) tokens.delete(tokens.keys().next().value);
    };
    return Object.freeze({
        issue(plan, device = "desktop", now = Date.now(), nonce = "") {
            const planId = normalizePlanId(plan?.planId);
            const digest = typeof plan?.digest === "string" ? plan.digest : "";
            const target = DEVICES.includes(device) ? device : "desktop";
            const expiresAt = Number(plan?.expiresAt);
            if (!planId || !DIGEST_RE.test(digest) || !Number.isFinite(expiresAt) || expiresAt <= Number(now)) return null;
            const token = makeToken(planId, digest, target, expiresAt, nonce || String(tokens.size));
            remember(token, {planId, digest, device: target, expiresAt, used: false});
            return token;
        },
        validate(token, request, now = Date.now()) {
            const value = normalizeToken(token);
            const record = value ? tokens.get(value) : null;
            if (!record || record.used) return {ok: false, reason: record?.used ? "consumed" : "invalid_token"};
            if (Number(now) >= record.expiresAt) return {ok: false, reason: "expired"};
            if (!request || normalizePlanId(request.planId) !== record.planId || request.digest !== record.digest || (request.device && request.device !== record.device)) return {ok: false, reason: "binding_mismatch"};
            return {ok: true, planId: record.planId, device: record.device};
        },
        consume(token, request, now = Date.now()) {
            const check = this.validate(token, request, now);
            if (!check.ok) return check;
            const value = normalizeToken(token);
            const record = tokens.get(value);
            record.used = true;
            return {ok: true, planId: record.planId, device: record.device};
        },
        clear() { tokens.clear(); },
        size() { return tokens.size; },
    });
}

function normalizeToken(value) {
    const token = typeof value === "string" ? value.trim().slice(0, 20) : "";
    return TOKEN_RE.test(token) ? token : "";
}

function makeToken(planId, digest, device, expiresAt, nonce) {
    const source = `${planId}:${digest}:${device}:${expiresAt}:${nonce}`;
    let hash = 2166136261;
    for (const char of source) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619); }
    return `at-${(hash >>> 0).toString(36).padStart(8, "0").slice(0, 16)}`;
}

module.exports = {MAX_TOKENS, TOKEN_RE, DEVICES, normalizeToken, createApprovalTokenStore};
