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

/**
 * Build the two UI sections without counting the same document twice. A
 * captured close record owns a root until that root is opened again; legacy
 * recent-open entries without a matching close record remain recoverable.
 */
function buildRecentHistorySections(openEntries, closedEntries, openedRootIds, max = 50) {
    const limit = Number.isFinite(max) && max > 0 ? Math.floor(max) : 50;
    const openedRoots = openedRootIds instanceof Set
        ? openedRootIds
        : new Set(Array.isArray(openedRootIds) ? openedRootIds.filter((value) => typeof value === "string" && value) : []);
    const closed = normalizeClosedEntries(closedEntries, limit).items
        .filter((entry) => !openedRoots.has(entry.rootId));
    const closedRoots = new Set(closed.map((entry) => entry.rootId));
    const seen = new Set();
    const open = [];
    for (const raw of Array.isArray(openEntries) ? openEntries : []) {
        if (open.length >= limit) break;
        if (!raw || typeof raw !== "object") continue;
        const rootId = typeof raw.rootId === "string" ? raw.rootId.trim() : "";
        const key = typeof raw.key === "string" ? raw.key.trim() : rootId;
        const identity = rootId || key;
        if (!identity || seen.has(identity) || (rootId && closedRoots.has(rootId))) continue;
        seen.add(identity);
        open.push({
            key,
            rootId: rootId || null,
            title: typeof raw.title === "string" && raw.title.trim() ? raw.title.trim().slice(0, 200) : identity,
            ts: Number.isFinite(raw.ts) ? raw.ts : 0,
            source: "open",
        });
    }
    const closedSection = [];
    for (const entry of closed) {
        if (closedSection.length >= limit || seen.has(entry.rootId)) continue;
        seen.add(entry.rootId);
        closedSection.push({
            key: entry.rootId,
            rootId: entry.rootId,
            title: entry.title || entry.rootId,
            ts: entry.closedAt,
            closedAt: entry.closedAt,
            source: "closed",
        });
    }
    return {open, closed: closedSection, count: open.length + closedSection.length};
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

async function runRecoveryPlanBounded(entries, openRoot, options = {}) {
    const limit = Number.isFinite(options.max) && options.max > 0 ? Math.floor(options.max) : 50;
    const signal = options.signal;
    const source = Array.isArray(entries) ? entries.slice(0, limit) : [];
    const results = [];
    for (const entry of source) {
        if (signal?.aborted) break;
        try { results.push({rootId: entry.rootId, ok: (await openRoot(entry.rootId, entry)) !== false}); }
        catch (error) { results.push({rootId: entry.rootId, ok: false, error: error instanceof Error ? error.message : String(error)}); }
    }
    return {succeeded: results.filter((x) => x.ok).map((x) => x.rootId), failed: results.filter((x) => !x.ok).map((x) => x.rootId), attempted: results.length, cancelled: Boolean(signal?.aborted)};
}

function applyRecentEvent(state, event, max = 50) {
    const current = state && typeof state === "object" ? state : {};
    const open = Array.isArray(current.open) ? current.open.slice() : [];
    const closed = Array.isArray(current.closed) ? current.closed.slice() : [];
    const rootId = typeof event?.rootId === "string" ? event.rootId.trim() : "";
    if (!rootId) return {open, closed, changed: false};
    if (event.type === "open") {
        const title = typeof event.title === "string" ? event.title : rootId;
        const ts = Number.isFinite(event.ts) ? event.ts : Date.now();
        const existing = open.find((item) => item?.rootId === rootId);
        const nextOpen = [{rootId, title, ts}, ...open.filter((item) => item?.rootId !== rootId)];
        const nextClosed = closed.filter((item) => item?.rootId !== rootId);
        const boundedOpen = nextOpen.slice(0, max);
        const changed = !existing || open.indexOf(existing) !== 0 || existing.title !== title || existing.ts !== ts
            || nextClosed.length !== closed.length || boundedOpen.length !== open.length;
        return {open: boundedOpen, closed: nextClosed, changed};
    }
    if (event.type === "close") {
        const title = typeof event.title === "string" ? event.title : rootId;
        const closedAt = Number.isFinite(event.closedAt) ? event.closedAt : Date.now();
        const existing = closed.find((item) => item?.rootId === rootId);
        const nextClosed = [{rootId, title, closedAt}, ...closed.filter((item) => item?.rootId !== rootId)];
        const nextOpen = open.filter((item) => item?.rootId !== rootId);
        const boundedClosed = nextClosed.slice(0, max);
        const changed = !existing || closed.indexOf(existing) !== 0 || existing.title !== title || existing.closedAt !== closedAt
            || nextOpen.length !== open.length || boundedClosed.length !== closed.length;
        return {open: nextOpen, closed: boundedClosed, changed};
    }
    return {open, closed, changed: false};
}

function buildRecentRefreshNotice(previous, next) {
    const before = previous && typeof previous === "object" ? previous : {};
    const after = next && typeof next === "object" ? next : {};
    const openBefore = Array.isArray(before.open) ? before.open.length : 0;
    const openAfter = Array.isArray(after.open) ? after.open.length : 0;
    const closedBefore = Array.isArray(before.closed) ? before.closed.length : 0;
    const closedAfter = Array.isArray(after.closed) ? after.closed.length : 0;
    return {changed: openBefore !== openAfter || closedBefore !== closedAfter, openCount: openAfter, closedCount: closedAfter};
}

/** Remove one recent entry from a source list without mutating the input. */
function removeRecentEntry(entries, key, field = "key") {
    const list = Array.isArray(entries) ? entries : [];
    const normalizedKey = typeof key === "string" ? key : "";
    const normalizedField = field === "rootId" ? "rootId" : "key";
    const items = list.filter((entry) => entry?.[normalizedField] !== normalizedKey);
    return {items, changed: items.length !== list.length};
}

/** Record an opened item and clear its matching closed-history entry. */
function recordRecentOpen(openEntries, closedEntries, entry, max = 50) {
    const open = Array.isArray(openEntries) ? openEntries : [];
    const closed = Array.isArray(closedEntries) ? closedEntries : [];
    const key = typeof entry?.key === "string" ? entry.key : "";
    if (!key) return {open: open.slice(), closed: closed.slice(), changed: false};
    const rootId = typeof entry?.rootId === "string" && entry.rootId ? entry.rootId : null;
    const title = typeof entry?.title === "string" && entry.title ? entry.title.slice(0, 200) : key;
    const ts = Number.isFinite(entry?.ts) ? entry.ts : Date.now();
    const nextOpen = [{key, rootId, title, ts}, ...open.filter((item) => item?.key !== key)];
    const nextClosed = closed.filter((item) => item?.rootId !== rootId);
    const limit = Number.isFinite(max) && max > 0 ? Math.floor(max) : 50;
    const boundedOpen = nextOpen.slice(0, limit);
    return {
        open: boundedOpen,
        closed: nextClosed,
        changed: boundedOpen.length !== open.length || nextClosed.length !== closed.length
            || open[0]?.key !== key || open[0]?.rootId !== rootId || open[0]?.title !== title || open[0]?.ts !== ts,
    };
}

module.exports = {normalizeClosedEntries, planClosedRecovery, mergeRecentDocumentRecords, buildRecentHistorySections, runRecoveryPlan, runRecoveryPlanBounded, applyRecentEvent, buildRecentRefreshNotice, removeRecentEntry, recordRecentOpen};
