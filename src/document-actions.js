// 宿主文档动作：只处理打开根文档的能力差异，不持有插件 UI 状态。

/** Normalize success values returned by old and new SiYuan open APIs. */
function isDocumentOpenSuccess(result) {
    return result === undefined || result === true || result === "success";
}

/**
 * Open a root document on mobile hosts.
 * MobileTabs is authoritative when available; the legacy plugin.openTab
 * fallback is only used when MobileTabs is absent.
 * @param {{rootId: string, tabs?: {open?: (rootId: string) => unknown}, app?: unknown,
 *   openTab: Function,
 *   logger?: {warn?: (...args: unknown[]) => void}, onFailure?: (error: unknown) => void}}
 * @returns {Promise<boolean>}
 */
async function openDocumentOnMobile({rootId, tabs, app, openTab, logger, onFailure}) {
    if (typeof rootId !== "string" || !rootId || typeof openTab !== "function") return false;
    if (typeof tabs?.open === "function") {
        try {
            const result = await tabs.open(rootId);
            if (isDocumentOpenSuccess(result)) return true;
            logger?.warn?.("mobile open doc non-success result", result);
            return false;
        } catch (error) {
            logger?.warn?.("mobile open doc fail (path 1)", error);
            return false;
        }
    }
    try {
        await openTab({app, doc: {id: rootId}});
        return true;
    } catch (error) {
        logger?.warn?.("mobile open doc fail (path 2)", error);
        onFailure?.(error);
        return false;
    }
}

/**
 * Open a root document through the desktop plugin API.
 * Callers own user-facing feedback because history and favorites have
 * different cleanup policies when a document no longer exists.
 * T-6826：透传思源 openTab 新选项（3.8.5 API.ts 源码实证；旧版宿主忽略未知
 * 选项=自然降级，不需要运行时能力探测）——keepCursor 打开不跳转（恢复链
 * 不抢焦点）、mode "preview" 预览态、removeCurrentTab 替换当前页签、
 * afterOpen 打开后回调。
 * @param {{rootId: string, hitId?: string|null, app?: unknown, openTab: Function,
 *   logger?: {warn?: (...args: unknown[]) => void}, position?: string,
 *   keepCursor?: boolean, mode?: string, removeCurrentTab?: boolean,
 *   afterOpen?: Function}}
 * @returns {Promise<boolean>}
 */
async function openDocumentOnDesktop({rootId, hitId = null, app, openTab, logger, position,
    keepCursor = false, mode = "", removeCurrentTab = false, afterOpen = null}) {
    if (typeof rootId !== "string" || !rootId || typeof openTab !== "function") return false;
    const targetId = typeof hitId === "string" && hitId && hitId !== rootId ? hitId : rootId;
    // T-6810 并排打开：position "right"/"bottom" 为思源 openTab 官方参数
    //（API.ts openTab options），仅桌面布局有效。
    const doc = targetId === rootId ? {id: rootId} : {id: targetId, action: ["cb-get-scroll"]};
    if (mode === "preview") doc.mode = "preview";
    const extra = {
        ...(position === "right" || position === "bottom" ? {position} : {}),
        ...(keepCursor ? {keepCursor: true} : {}),
        ...(removeCurrentTab ? {removeCurrentTab: true} : {}),
        ...(typeof afterOpen === "function" ? {afterOpen} : {}),
    };
    try {
        await openTab({
            app,
            doc,
            ...extra,
        });
        return true;
    } catch (error) {
        if (targetId === rootId) {
            logger?.warn?.("desktop open doc fail", error);
            return false;
        }
        logger?.warn?.("open document search hit fail, falling back to root", error);
        try {
            await openTab({app, doc: {id: rootId}, ...extra});
            return true;
        } catch (fallbackError) {
            logger?.warn?.("open document search root fallback fail", fallbackError);
            return false;
        }
    }
}

module.exports = {isDocumentOpenSuccess, openDocumentOnMobile, openDocumentOnDesktop};
