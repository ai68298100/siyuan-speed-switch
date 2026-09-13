"use strict";

const {createNavigationActionHandlers} = require("./agent-host-actions.js");
const {createDocumentSetRestoreHandler} = require("./agent-document-set-actions.js");
const {createWriteActionHandlers} = require("./agent-write-actions.js");

// Compose all fixed workspace actions without capturing Plugin state.  Each
// group receives its own host callbacks, so tests and older SiYuan adapters can
// replace one boundary without changing the plan executor.
function createWorkspaceHostHandlers(options = {}) {
    const navigation = createNavigationActionHandlers(options.navigation || options);
    const restoreDocumentSet = createDocumentSetRestoreHandler(options.documentSet || {});
    const writes = createWriteActionHandlers(options.write || {});
    return Object.freeze({
        openDocument: navigation.openDocument,
        openDocuments: navigation.openDocuments,
        restoreDocumentSet,
        updateTaskStatus: writes.updateTaskStatus,
        createDocument: writes.createDocument,
        appendToJournal: writes.appendToJournal,
    });
}

module.exports = {createWorkspaceHostHandlers};
