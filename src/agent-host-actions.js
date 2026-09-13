"use strict";

const {openDocumentOnDesktop, openDocumentOnMobile} = require("./document-actions.js");

// Builds the first real host adapter without capturing Plugin/DOM state.  The
// caller supplies app, openTab and optional MobileTabs; handlers stay replaceable
// for tests and older SiYuan hosts.
function createNavigationActionHandlers(options = {}) {
    const isMobile = options.isMobile === true;
    const openOne = async (id, signal) => {
        if (signal?.aborted) return false;
        return isMobile
            ? openDocumentOnMobile({rootId: id, tabs: options.tabs, app: options.app, openTab: options.openTab, logger: options.logger})
            : openDocumentOnDesktop({rootId: id, app: options.app, openTab: options.openTab, logger: options.logger});
    };
    return {
        openDocument: async (step, context = {}) => {
            const ok = await openOne(step.id, context.signal);
            return ok ? {status: "completed", id: step.id} : {status: context.signal?.aborted ? "cancelled" : "failed", reason: "open_failed"};
        },
        openDocuments: async (step, context = {}) => {
            const opened = [], failed = [];
            for (const id of step.ids || []) {
                if (context.signal?.aborted) break;
                if (await openOne(id, context.signal)) opened.push(id);
                else failed.push(id);
            }
            if (context.signal?.aborted) return {status: "cancelled", opened, failed};
            if (failed.length && !opened.length) return {status: "failed", reason: "open_failed"};
            return {status: "completed", opened, failed};
        },
    };
}

module.exports = {createNavigationActionHandlers};
