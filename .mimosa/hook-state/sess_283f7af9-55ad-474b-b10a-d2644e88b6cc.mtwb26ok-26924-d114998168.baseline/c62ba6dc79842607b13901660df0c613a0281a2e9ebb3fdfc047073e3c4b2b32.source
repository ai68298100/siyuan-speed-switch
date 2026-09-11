"use strict";

/**
 * Pure favorite-entry operations shared by desktop, sidebar and mobile UI.
 * The caller owns persistence and supplies already-normalized entries.
 */

function removeFavoriteEntry(entries, key) {
    const list = Array.isArray(entries) ? entries : [];
    const normalizedKey = typeof key === "string" ? key : "";
    const items = list.filter((entry) => entry?.key !== normalizedKey);
    return {items, changed: items.length !== list.length};
}

function setFavoriteEntryGroup(entries, key, group) {
    const list = Array.isArray(entries) ? entries : [];
    const normalizedKey = typeof key === "string" ? key : "";
    const normalizedGroup = typeof group === "string" ? group.trim() : "";
    let changed = false;
    const items = list.map((entry) => {
        if (!entry || entry.key !== normalizedKey || entry.group === normalizedGroup) return entry;
        changed = true;
        return {...entry, group: normalizedGroup};
    });
    return {items, changed};
}

function migrateFavoriteEntry(entries, legacyKey, rootId) {
    const list = Array.isArray(entries) ? entries : [];
    const oldKey = typeof legacyKey === "string" ? legacyKey : "";
    const newKey = typeof rootId === "string" ? rootId : "";
    const index = list.findIndex((entry) => entry?.key === oldKey && oldKey && oldKey !== newKey);
    if (index < 0 || !newKey) return {items: list.slice(), changed: false, migrated: false};
    if (list.some((entry) => entry?.key === newKey)) {
        return {items: list.filter((_, itemIndex) => itemIndex !== index), changed: true, migrated: true, duplicate: true};
    }
    const items = list.slice();
    items[index] = {...items[index], key: newKey, rootId: newKey};
    return {items, changed: true, migrated: true, duplicate: false};
}

module.exports = {removeFavoriteEntry, setFavoriteEntryGroup, migrateFavoriteEntry};
