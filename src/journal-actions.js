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

module.exports = {normalizeJournalDocumentId, ensureTodayJournal};
