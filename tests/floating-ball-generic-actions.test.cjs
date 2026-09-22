const test = require("node:test");
const assert = require("node:assert/strict");
const {
    selectAdjacentTab,
    scrollElementTo,
    collectScrollCandidates,
    scrollSurfaceTo,
} = require("../src/floating-ball-generic-actions.js");

test("adjacent tab: cycles forward and backward with wraparound", () => {
    const tabs = [{id: "a"}, {id: "b"}, {id: "c"}];
    assert.equal(selectAdjacentTab(tabs, "a", 1)?.id, "b");
    assert.equal(selectAdjacentTab(tabs, "c", 1)?.id, "a");
    assert.equal(selectAdjacentTab(tabs, "a", -1)?.id, "c");
    assert.equal(selectAdjacentTab(tabs, "b", -1)?.id, "a");
});

test("adjacent tab: unknown or missing active id still resolves a neighbor", () => {
    const tabs = [{id: "a"}, {id: "b"}];
    assert.equal(selectAdjacentTab(tabs, "gone", 1)?.id, "a");
    assert.equal(selectAdjacentTab(tabs, "gone", -1)?.id, "b");
    assert.equal(selectAdjacentTab(tabs, undefined, 1)?.id, "a");
});

test("adjacent tab: refuses to move with fewer than two tabs or malformed input", () => {
    assert.equal(selectAdjacentTab([{id: "a"}], "a", 1), null);
    assert.equal(selectAdjacentTab([], "a", 1), null);
    assert.equal(selectAdjacentTab("nope", "a", 1), null);
});

test("scroll element: rejects non-scrollables and clamps to the requested edge", () => {
    assert.deepEqual(scrollElementTo(null, "top"), {ok: false, reason: "invalid-scroll-target"});
    const element = {scrollTop: 40, scrollHeight: 900, clientHeight: 400, scrollTo() {}};
    const top = scrollElementTo(element, "top");
    assert.deepEqual(top, {ok: true, top: 0});
    assert.equal(element.scrollTop, 40);
    const bottom = scrollElementTo(element, "bottom");
    assert.deepEqual(bottom, {ok: true, top: 500});
});

test("scroll element: falls back to scrollTop assignment when scrollTo is missing", () => {
    const element = {scrollTop: 0, scrollHeight: 800, clientHeight: 300};
    assert.deepEqual(scrollElementTo(element, "bottom"), {ok: true, top: 500});
    assert.equal(element.scrollTop, 500);
});

test("scroll surface: prefers explicit elements, then surface scope, then document", () => {
    const preferred = {scrollTop: 0, scrollHeight: 700, clientHeight: 100, scrollTo() {}};
    const sidebarScroll = {scrollTop: 0, scrollHeight: 500, clientHeight: 100, scrollTo() {}};
    const documentFallback = {scrollTop: 0, scrollHeight: 900, clientHeight: 100, scrollTo() {}};
    const sidebarElement = {querySelector: (selector) => selector === ".sw__scroll" ? sidebarScroll : null};
    const documentRef = {
        querySelector: (selector) => selector === ".protyle-content" ? documentFallback : null,
        scrollingElement: null,
    };
    const result = scrollSurfaceTo(documentRef, "sidebar", sidebarElement, "bottom", {preferredElements: [preferred]});
    assert.deepEqual(result, {ok: true, top: 600});
    assert.equal(preferred.scrollTop, 0, "preferred element keeps DOM state, scrollTo is only stubbed");
});

test("scroll surface: falls through non-scrollable candidates to the first usable one", () => {
    const flat = {scrollTop: 0, scrollHeight: 100, clientHeight: 100};
    const usable = {scrollTop: 10, scrollHeight: 1000, clientHeight: 200, scrollTo() {}};
    const documentRef = {
        querySelector: (selector) => selector === ".protyle-wysiwyg" ? flat : (selector === ".sw__scroll" ? usable : null),
        scrollingElement: null,
    };
    const result = scrollSurfaceTo(documentRef, "sidebar", {querySelector: () => null}, "top");
    assert.deepEqual(result, {ok: true, top: 0});
});

test("scroll surface: reports a bounded failure instead of throwing without targets", () => {
    const documentRef = {querySelector: () => null, scrollingElement: null};
    assert.deepEqual(scrollSurfaceTo(documentRef, "desktop", null, "top"), {ok: false, reason: "no-scroll-target"});
});

test("scroll candidates: dedupe and keep preferred order", () => {
    const shared = {scrollTop: 0, scrollHeight: 10, clientHeight: 5};
    const documentRef = {querySelector: () => shared, scrollingElement: null};
    const candidates = collectScrollCandidates(documentRef, "desktop", null, [shared]);
    assert.deepEqual(candidates, [shared]);
});
