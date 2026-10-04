// T-6972：在 jsdom 中执行分组目录的真实挂载、持久化、折叠、拖放和视图切换。
const test = require("node:test");
const assert = require("node:assert/strict");
const {JSDOM} = require("jsdom");

function createHarness(t) {
    const dom = new JSDOM("<!doctype html><body><div id=\"root\"></div></body>", {url: "https://localhost"});
    global.window = dom.window;
    global.document = dom.window.document;
    global.HTMLElement = dom.window.HTMLElement;
    global.navigator = dom.window.navigator;
    global.requestAnimationFrame = (callback) => setTimeout(() => callback(Date.now()), 0);
    const Module = require("node:module");
    const originalLoad = Module._load;
    Module._load = function (request, parent, isMain) {
        if (request === "siyuan") {
            return {Dialog: class {
                constructor(options = {}) {
                    this.element = dom.window.document.createElement("div");
                    this.element.innerHTML = options.content || "";
                    dom.window.document.body.appendChild(this.element);
                }
                destroy() {this.element.remove();}
            }, showMessage: () => {}};
        }
        return originalLoad.apply(this, arguments);
    };
    t.after(() => {
        Module._load = originalLoad;
        delete global.window;
        delete global.document;
        delete global.HTMLElement;
        delete global.navigator;
        delete global.requestAnimationFrame;
        dom.window.close();
    });
    delete require.cache[require.resolve("../src/snippet-studio-ui.js")];
    const {mountSnippetStudio} = require("../src/snippet-studio-ui.js");
    return {dom, document: dom.window.document, mountSnippetStudio, i18n: require("../src/i18n/zh-CN.json")};
}

test("snippet group picker persists CRUD state and accepts native drag/drop", async (t) => {
    const {dom, document, mountSnippetStudio, i18n} = createHarness(t);
    const native = [
        {id: "snippet-a", name: "A", type: "css", content: ".a{}", enabled: true, disabledInPublish: false},
        {id: "snippet-b", name: "B", type: "js", content: "", enabled: false, disabledInPublish: false},
    ];
    let groupState = null;
    const store = {
        read: async () => native.map((item) => ({...item})),
        readSettings: () => ({enabledCSS: true, enabledJS: true}),
        mutate: async () => native.map((item) => ({...item})),
        dispose: () => {},
    };
    const groups = {
        load: () => groupState,
        save: (next) => { groupState = next; },
    };
    const controller = mountSnippetStudio(document.getElementById("root"), {i18n, store, groups, getConfig: () => ({snippet: {enabledCSS: true, enabledJS: true}})});
    await controller.ready;
    const choose = Array.from(document.querySelectorAll(".sw-studio__button")).find((button) => button.textContent === i18n.snippetChoose);
    assert.ok(choose, "片段选择入口必须存在");
    choose.click();
    const newGroup = Array.from(document.querySelectorAll(".sw-studio__button")).find((button) => button.textContent === i18n.snippetGroupNew);
    assert.ok(newGroup, "分组工具栏必须提供新建入口");
    dom.window.prompt = () => "Work";
    newGroup.click();
    assert.equal(groupState.groups[0].name, "Work");

    const groupHeader = document.querySelector(`[data-group-id=\"${groupState.groups[0].id}\"] .sw-studio__group-header`);
    assert.ok(groupHeader, "分组头部必须渲染并可作为拖放目标");
    const source = document.querySelector(`[data-snippet-id=\"${native[0].id}\"]`);
    assert.equal(source.getAttribute("draggable"), "true");
    const drop = new dom.window.Event("drop", {bubbles: true, cancelable: true});
    Object.defineProperty(drop, "dataTransfer", {value: {getData: () => native[0].id}});
    groupHeader.dispatchEvent(drop);
    assert.deepEqual(groupState.assignments, [{snippetId: native[0].id, groupId: groupState.groups[0].id}]);

    const currentGroupHeader = document.querySelector(`[data-group-id=\"${groupState.groups[0].id}\"] .sw-studio__group-header`);
    const toggle = currentGroupHeader.querySelector(".sw-studio__group-toggle");
    toggle.click();
    assert.equal(document.querySelector(`[data-group-id=\"${groupState.groups[0].id}\"] .sw-studio__group-toggle`).getAttribute("aria-expanded"), "false");
    const view = document.querySelector(`[aria-label=\"${i18n.snippetGroupView}\"]`);
    view.value = "flat";
    view.dispatchEvent(new dom.window.Event("change", {bubbles: true}));
    assert.equal(groupState.view, "flat");
    controller.dispose();
});

test("snippet catalog metadata persists safe fields and finds native snippets by alias", async (t) => {
    const {dom, document, mountSnippetStudio, i18n} = createHarness(t);
    const native = {id: "native-meta", name: "Native", type: "css", content: ".native{}", enabled: false};
    let groupState = null;
    const controller = mountSnippetStudio(document.getElementById("root"), {i18n,
        session: {draft: {...native}, baseline: {...native}},
        store: {read: async () => [{...native}], dispose: () => {}},
        groups: {load: () => groupState, save: (next) => {groupState = next;}}});
    await controller.ready;
    for (const [key, value] of [["snippetAlias", "Find me"], ["snippetTags", "work, css"], ["snippetSummary", "<img src=x onerror=alert(1)>"]]) {
        const input = document.querySelector(`[aria-label="${i18n[key]}"]`);
        input.value = value;
        input.dispatchEvent(new dom.window.Event("change", {bubbles: true}));
    }
    const pinned = document.querySelector(`[aria-label="${i18n.snippetPinned}"]`);
    pinned.checked = true;
    pinned.dispatchEvent(new dom.window.Event("change", {bubbles: true}));
    assert.equal(groupState.metadata.entries[0].alias, "Find me");
    assert.deepEqual(groupState.metadata.entries[0].tags, ["work", "css"]);
    assert.equal(groupState.metadata.entries[0].pinned, true);
    Array.from(document.querySelectorAll("button")).find((button) => button.textContent === i18n.snippetChoose).click();
    const query = document.querySelector(`[aria-label="${i18n.snippetSearch}"]`);
    query.value = "Find me";
    query.dispatchEvent(new dom.window.Event("input", {bubbles: true}));
    const item = document.querySelector('.sw-studio__catalog-item[data-snippet-id="native-meta"]');
    assert.ok(item);
    assert.ok(item.textContent.includes("<img src=x onerror=alert(1)>"));
    assert.equal(item.querySelector("img"), null);
    assert.equal(native.enabled, false);
    assert.equal(native.content, ".native{}");
    controller.dispose();
});

test("local snippet store previews without writes and creates a disabled copy after dirty draft confirmation", async (t) => {
    const {dom, document, mountSnippetStudio, i18n} = createHarness(t);
    const native = {id: "native-store", name: "Native store", type: "css", content: ".native{}", enabled: true};
    const session = {draft: {...native}, baseline: {...native}};
    let writes = 0;
    const controller = mountSnippetStudio(document.getElementById("root"), {i18n, session,
        store: {read: async () => [{...native}], mutate: async () => {writes += 1;}, dispose: () => {}}});
    await controller.ready;
    const editor = document.querySelector(".sw-studio__editor");
    editor.value = ".unsaved{}";
    editor.dispatchEvent(new dom.window.Event("input", {bubbles: true}));
    Array.from(document.querySelectorAll("button")).find((button) => button.textContent === i18n.snippetStore).click();
    document.querySelector('.sw-studio__catalog-item[data-snippet-id="native-store"]').click();
    assert.equal(editor.value, ".unsaved{}");
    assert.equal(writes, 0);
    const frame = document.querySelector(".sw-studio__store-canvas iframe");
    assert.ok(frame);
    assert.equal(frame.getAttribute("sandbox"), "");
    assert.equal(document.querySelector(".sw-studio__store-code").textContent, ".native{}");
    Array.from(document.querySelectorAll("button")).find((button) => button.textContent === i18n.snippetStoreDraft).click();
    const leave = document.querySelector(".sw-studio__leave");
    assert.ok(leave);
    leave.querySelectorAll("button")[1].click();
    assert.equal(editor.value, ".native{}");
    assert.equal(document.querySelector(".sw-studio__picker"), null);
    assert.equal(session.draft.id, "");
    assert.equal(session.draft.enabled, false);
    assert.equal(writes, 0);
    assert.equal(native.enabled, true);
    controller.dispose();
});

test("new snippet metadata alone triggers the dirty draft close guard", async (t) => {
    const {dom, document, mountSnippetStudio, i18n} = createHarness(t);
    const controller = mountSnippetStudio(document.getElementById("root"), {i18n,
        store: {read: async () => [], dispose: () => {}}, groups: {load: () => null, save: () => {}}});
    await controller.ready;
    const alias = document.querySelector(`[aria-label="${i18n.snippetAlias}"]`);
    alias.value = "Only metadata";
    alias.dispatchEvent(new dom.window.Event("change", {bubbles: true}));
    assert.equal(controller.canClose(), false);
    assert.ok(document.querySelector(".sw-studio__leave"));
    document.querySelectorAll(".sw-studio__leave button")[2].click();
    assert.equal(alias.value, "Only metadata");
    controller.dispose();
});

test("snippet metadata input guards an unblurred draft and survives other field updates", async (t) => {
    const {dom, document, mountSnippetStudio, i18n} = createHarness(t);
    const session = {};
    let writes = 0;
    const controller = mountSnippetStudio(document.getElementById("root"), {i18n, session,
        store: {read: async () => [], dispose: () => {}},
        groups: {load: () => null, save: () => {writes += 1;}}});
    await controller.ready;
    const alias = document.querySelector(`[aria-label="${i18n.snippetAlias}"]`);
    alias.focus();
    alias.value = "Unblurred metadata";
    alias.dispatchEvent(new dom.window.Event("input", {bubbles: true}));
    assert.equal(controller.canClose(), false);
    document.querySelectorAll(".sw-studio__leave button")[2].click();
    assert.equal(session.metadata.alias, "Unblurred metadata");
    const tags = document.querySelector(`[aria-label="${i18n.snippetTags}"]`);
    tags.value = "work, ";
    tags.dispatchEvent(new dom.window.Event("input", {bubbles: true}));
    assert.equal(tags.value, "work, ");
    const editor = document.querySelector(".sw-studio__editor");
    editor.value = ".keep-metadata{}";
    editor.dispatchEvent(new dom.window.Event("input", {bubbles: true}));
    assert.equal(alias.value, "Unblurred metadata");
    assert.equal(writes, 0);
    controller.dispose();
});

test("native metadata input is guarded until change persists it and retains a failed update", async (t) => {
    const {dom, document, mountSnippetStudio, i18n} = createHarness(t);
    const native = {id: "pending-native", name: "Pending native", type: "css", content: ".pending{}", enabled: false};
    let sidecar = null;
    let writes = 0;
    let failMetadata = true;
    const controller = mountSnippetStudio(document.getElementById("root"), {i18n,
        session: {draft: {...native}, baseline: {...native}},
        store: {read: async () => [{...native}], dispose: () => {}},
        groups: {load: () => sidecar, save: (next) => {
            writes += 1;
            if (failMetadata) throw new Error("sidecar unavailable");
            sidecar = next;
        }}});
    await controller.ready;
    const alias = document.querySelector(`[aria-label="${i18n.snippetAlias}"]`);
    alias.value = " ";
    alias.dispatchEvent(new dom.window.Event("input", {bubbles: true}));
    assert.equal(controller.canClose(), true);
    alias.value = "Pending native alias";
    alias.dispatchEvent(new dom.window.Event("input", {bubbles: true}));
    assert.equal(writes, 0);
    assert.equal(controller.canClose(), false);
    document.querySelectorAll(".sw-studio__leave button")[2].click();
    alias.dispatchEvent(new dom.window.Event("change", {bubbles: true}));
    assert.equal(document.querySelector(".sw-studio__status").dataset.state, "error");
    document.querySelector(".sw-studio__editor").dispatchEvent(new dom.window.Event("input", {bubbles: true}));
    assert.equal(alias.value, "Pending native alias");
    assert.equal(controller.canClose(), false);
    document.querySelectorAll(".sw-studio__leave button")[2].click();
    failMetadata = false;
    alias.dispatchEvent(new dom.window.Event("change", {bubbles: true}));
    assert.equal(sidecar.metadata.entries[0].alias, "Pending native alias");
    assert.equal(controller.canClose(), true);
    assert.equal(native.content, ".pending{}");
    assert.equal(native.enabled, false);
    controller.dispose();
});

for (const lateConfirmation of [false, true]) {
    test(`snippet metadata survives partial native save and retries the same id (late=${lateConfirmation})`, async (t) => {
        const {dom, document, mountSnippetStudio, i18n} = createHarness(t);
        const session = {};
        let native = [];
        let sidecar = null;
        let failMetadata = true;
        let returned = 0;
        const controller = mountSnippetStudio(document.getElementById("root"), {i18n, session,
            onBack: () => {returned += 1;},
            getConfig: () => ({snippet: {enabledCSS: true, enabledJS: true}}),
            recycle: {load: () => null, save: () => {}},
            store: {read: async () => native.map((item) => ({...item})), dispose: () => {},
                readSettings: () => ({enabledCSS: true, enabledJS: true}),
                mutate: async (_baseline, _action, draft) => {
                    native = [{...draft}];
                    if (lateConfirmation) throw Object.assign(new Error("snippet-write-unconfirmed"), {writeLanded: true});
                    return native.map((item) => ({...item}));
                }},
            groups: {load: () => sidecar, save: (next) => {
                if (failMetadata) throw new Error("sidecar unavailable");
                sidecar = next;
            }}});
        await controller.ready;
        for (const [selector, value] of [[`[aria-label="${i18n.snippetName}"]`, "Recover metadata"],
            [".sw-studio__editor", ".recover-metadata{}"]]) {
            const field = document.querySelector(selector);
            field.value = value;
            field.dispatchEvent(new dom.window.Event("input", {bubbles: true}));
        }
        const alias = document.querySelector(`[aria-label="${i18n.snippetAlias}"]`);
        alias.value = "Pending alias";
        alias.dispatchEvent(new dom.window.Event("change", {bubbles: true}));
        const back = Array.from(document.querySelectorAll("button")).find((button) => button.textContent === i18n.snippetBack);
        back.click();
        document.querySelectorAll(".sw-studio__leave button")[0].click();
        await new Promise((resolve) => setTimeout(resolve, 20));
        assert.equal(returned, 0);
        assert.equal(alias.value, "Pending alias");
        assert.equal(native.length, 1, document.querySelector(".sw-studio__status").textContent);
        assert.ok(session.baseline, document.querySelector(".sw-studio__status").textContent);
        assert.equal(session.baseline.id, native[0].id);
        const savedId = native[0].id;
        assert.equal(controller.canClose(), false);
        document.querySelectorAll(".sw-studio__leave button")[2].click();
        const editor = document.querySelector(".sw-studio__editor");
        editor.dispatchEvent(new dom.window.Event("input", {bubbles: true}));
        assert.equal(alias.value, "Pending alias");
        failMetadata = false;
        back.click();
        document.querySelectorAll(".sw-studio__leave button")[0].click();
        await new Promise((resolve) => setTimeout(resolve, 20));
        assert.equal(returned, 1);
        assert.equal(native.length, 1);
        assert.equal(native[0].id, savedId);
        assert.equal(sidecar.metadata.entries[0].alias, "Pending alias");
        assert.equal(sidecar.metadata.entries[0].snippetId, savedId);
        assert.equal(controller.canClose(), true);
        controller.dispose();
    });
}
