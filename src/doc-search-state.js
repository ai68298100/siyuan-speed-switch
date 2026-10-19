"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createDocSearchState = createDocSearchState;
function createDocSearchState() {
    return {
        sessions: new WeakMap(),
        activeSessions: new Set(),
        filters: new WeakMap(),
        notebookNames: new WeakMap(),
        pathGenerations: new WeakMap(),
        pathTitles: new WeakMap(),
        parsedQueries: new WeakMap(),
        chipFilters: new WeakMap(),
        health: new WeakMap(),
        docAnchors: new WeakMap(),
        filterButtonSync: new WeakMap(),
    };
}
