"use strict";

const {planDocumentSetRestore, runDocumentSetRestore} = require("./document-sets.js");

// Document-set restore adapter.  The host supplies set lookup, open-tab and
// optional availability probing; this module owns ordering, de-duplication and
// cancellation semantics without reading Plugin/DOM state.
function createDocumentSetRestoreHandler(options = {}) {
    return async (step, context = {}) => {
        const setId = typeof step?.setId === "string" ? step.setId.trim().slice(0, 64) : "";
        if (!setId || typeof options.getSet !== "function" || typeof options.openDocument !== "function") return {status: "failed", reason: "handler_missing"};
        if (context.signal?.aborted) return {status: "cancelled"};
        const set = await options.getSet(setId);
        if (!set) return {status: "failed", reason: "set_not_found"};
        const opened = new Set(typeof options.getOpenedIds === "function" ? options.getOpenedIds() : []);
        const pendingPlan = planDocumentSetRestore(set, opened, null);
        if (!pendingPlan.set) return {status: "failed", reason: "invalid_set"};
        let available = null;
        if (typeof options.probeEntries === "function" && pendingPlan.pending.length) {
            available = new Set(await options.probeEntries(pendingPlan.pending, context.signal) || []);
        }
        const plan = planDocumentSetRestore(set, opened, available);
        if (!plan.canRestore) return {status: "skipped", reason: plan.missing.length ? "missing_entries" : "already_open"};
        const execution = await runDocumentSetRestore(plan.pending, (rootId, entry) => options.openDocument(rootId, entry, context), {signal: context.signal});
        if (execution.cancelled) return {status: "cancelled"};
        if (execution.succeeded === 0) return {status: "failed", reason: "restore_failed"};
        return {status: "completed"};
    };
}

module.exports = {createDocumentSetRestoreHandler};
