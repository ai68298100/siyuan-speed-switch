// 日记宿主动作：只负责调用思源 createDailyNote API，UI 选择与打开由调用方管理。

/** Normalize a host-provided document id before it crosses into open commands. */
function normalizeJournalDocumentId(value) {
    const id = typeof value === "string" ? value.trim() : "";
    return /^\d{14}-[0-9a-z]{7}$/i.test(id) ? id : "";
}

/**
 * Create or reuse today's journal document in a notebook.
 * @param {{notebook: string, fetchImpl?: Function, logger?: {warn?: (...args: unknown[]) => void}}}
 * @returns {Promise<string|null>}
 */
async function ensureTodayJournal({notebook, fetchImpl = globalThis.fetch, logger}) {
    if (typeof notebook !== "string" || !notebook.trim() || typeof fetchImpl !== "function") return null;
    try {
        const response = await fetchImpl("/api/filetree/createDailyNote", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({notebook}),
        });
        if (!response?.ok) {
            throw new Error(`createDailyNote HTTP ${response?.status ?? "unknown"}`);
        }
        const json = await response.json();
        const id = normalizeJournalDocumentId(json?.data?.id);
        if (json?.code === 0 && id) {
            return id;
        }
        logger?.warn?.("createDailyNote fail", json);
        return null;
    } catch (error) {
        logger?.warn?.("createDailyNote fail", error);
        return null;
    }
}

/**
 * Find today's journal without creating a document.
 * @param {{notebook: string, fetchImpl?: Function, logger?: {warn?: (...args: unknown[]) => void}, now?: Date}}
 * @returns {Promise<string|null>}
 */
async function findTodayJournal({notebook, fetchImpl = globalThis.fetch, logger, now = new Date()}) {
    if (!/^[0-9]{14}-[0-9a-z]+$/i.test(String(notebook || "")) || typeof fetchImpl !== "function") return null;
    const date = now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date();
    const ymd = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    const attribute = `custom-dailynote-${ymd.replace(/-/g, "")}`;
    const stmt = `SELECT b.id FROM blocks AS b LEFT JOIN attributes AS a ON a.block_id=b.id AND a.name='${attribute}' WHERE b.type='d' AND b.box='${notebook}' AND (a.name IS NOT NULL OR b.content LIKE '${ymd}%') ORDER BY b.created DESC, b.id DESC LIMIT 1`;
    try {
        const response = await fetchImpl("/api/query/sql", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({stmt}),
        });
        if (!response?.ok) throw new Error(`query/sql HTTP ${response?.status ?? "unknown"}`);
        const json = await response.json();
        const rows = Array.isArray(json?.data) ? json.data : [];
        for (const row of rows) {
            const id = normalizeJournalDocumentId(row?.id);
            if (id) return id;
        }
        return null;
    } catch (error) {
        logger?.warn?.("find today's journal fail", error);
        return null;
    }
}

module.exports = {normalizeJournalDocumentId, ensureTodayJournal, findTodayJournal};
