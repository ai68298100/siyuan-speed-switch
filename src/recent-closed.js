// 关闭页签记录的数据层：只处理可序列化记录，不依赖宿主 UI。
function normalizeClosedEntries(entries, max = 50) {
    const limit = Number.isFinite(max) && max > 0 ? Math.floor(max) : 50;
    if (!Array.isArray(entries)) return {items: [], changed: false};
    const seen = new Set();
    const items = [];
    let changed = false;
    for (const raw of entries) {
        if (items.length >= limit) { changed = true; break; }
        const rootId = typeof raw?.rootId === "string" ? raw.rootId.trim() : "";
        const closedAt = Number.isFinite(raw?.closedAt) ? raw.closedAt : 0;
        if (!rootId || closedAt <= 0 || seen.has(rootId)) { changed = true; continue; }
        seen.add(rootId);
        const title = typeof raw.title === "string" ? raw.title.trim().slice(0, 200) : "";
        if (rootId !== raw.rootId || closedAt !== raw.closedAt || title !== (raw.title || "")) changed = true;
        items.push({rootId, title, closedAt});
    }
    if (items.length !== entries.length) changed = true;
    return {items, changed};
}

function planClosedRecovery(entries, availableRoots, max = 50) {
    const available = availableRoots instanceof Set ? availableRoots : new Set();
    return normalizeClosedEntries(entries, max).items.filter((entry) => available.has(entry.rootId));
}

function mergeRecentDocumentRecords(openEntries, closedEntries, max = 50) {
    const limit = Number.isFinite(max) && max > 0 ? Math.floor(max) : 50;
    const merged = [];
    const seen = new Set();
    const add = (entry, source, timestamp) => {
        if (!entry?.rootId || seen.has(entry.rootId)) return;
        seen.add(entry.rootId);
        merged.push({rootId: entry.rootId, title: entry.title || entry.rootId, source, timestamp: Number.isFinite(timestamp) ? timestamp : 0});
    };
    for (const entry of Array.isArray(openEntries) ? openEntries : []) add(entry, "open", entry.ts);
    for (const entry of normalizeClosedEntries(closedEntries, max).items) add(entry, "closed", entry.closedAt);
    return merged.slice(0, limit);
}

async function runRecoveryPlan(entries, openRoot) {
    const results = [];
    if (typeof openRoot !== "function") return {succeeded: [], failed: [], results};
    for (const entry of Array.isArray(entries) ? entries : []) {
        try {
            const value = await openRoot(entry.rootId, entry);
            const ok = value !== false;
            results.push({rootId: entry.rootId, ok});
        } catch (error) {
            results.push({rootId: entry.rootId, ok: false, error: error instanceof Error ? error.message : String(error)});
        }
    }
    return {
        succeeded: results.filter((item) => item.ok).map((item) => item.rootId),
        failed: results.filter((item) => !item.ok).map((item) => item.rootId),
        results,
    };
}

function applyRecentEvent(state, event, max = 50) {
    const current = state && typeof state === "object" ? state : {};
    const open = Array.isArray(current.open) ? current.open.slice() : [];
    const closed = Array.isArray(current.closed) ? current.closed.slice() : [];
    const rootId = typeof event?.rootId === "string" ? event.rootId.trim() : "";
    if (!rootId) return {open, closed, changed: false};
    if (event.type === "open") {
        const nextOpen = [{rootId, title: typeof event.title === "string" ? event.title : rootId, ts: Number.isFinite(event.ts) ? event.ts : Date.now()}, ...open.filter((item) => item?.rootId !== rootId)];
        return {open: nextOpen.slice(0, max), closed: closed.filter((item) => item?.rootId !== rootId), changed: true};
    }
    if (event.type === "close") {
        const nextClosed = [{rootId, title: typeof event.title === "string" ? event.title : rootId, closedAt: Number.isFinite(event.closedAt) ? event.closedAt : Date.now()}, ...closed.filter((item) => item?.rootId !== rootId)];
        return {open: open.filter((item) => item?.rootId !== rootId), closed: nextClosed.slice(0, max), changed: true};
    }
    return {open, closed, changed: false};
}

module.exports = {normalizeClosedEntries, planClosedRecovery, mergeRecentDocumentRecords, runRecoveryPlan, applyRecentEvent};
