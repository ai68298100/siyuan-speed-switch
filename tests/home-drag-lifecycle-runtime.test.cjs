const test = require("node:test");
const assert = require("node:assert/strict");
const ts = require("typescript");
const {readSourceFile} = require("./source-scan.cjs");
const {computeEdgeScrollDelta, moveLayoutEntry} = require("../src/home-model.js");

const source = readSourceFile("src/second-panel-ui.ts");

function extractInteractionRuntime(text) {
    const file = ts.createSourceFile("second-panel-ui.ts", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const nodes = [];
    const visit = (node) => { nodes.push(node); ts.forEachChild(node, visit); };
    visit(file);
    const unique = (matches, label) => {
        assert.equal(matches.length, 1, `${label} must have one production implementation`);
        return matches[0];
    };
    const variable = (name) => unique(nodes.filter((node) => ts.isVariableDeclaration(node) && node.name.getText(file) === name), name);
    const statement = (name) => variable(name).parent.parent.getText(file);
    const listener = (target) => unique(nodes.filter((node) => ts.isCallExpression(node)
        && ts.isPropertyAccessExpression(node.expression)
        && node.expression.expression.getText(file) === target
        && node.expression.name.text === "addEventListener"
        && node.arguments[0]?.getText(file) === '"pointerdown"'), `${target} pointerdown`).parent.getText(file);
    const render = variable("renderPanel").initializer.body;
    const replaceIndex = render.statements.findIndex((node) => ts.isExpressionStatement(node)
        && ts.isBinaryExpression(node.expression)
        && node.expression.left.getText(file) === "root.innerHTML");
    assert.ok(replaceIndex >= 0, "render must replace the old panel DOM");
    const release = unique(nodes.filter((node) => ts.isBinaryExpression(node)
        && node.left.getText(file) === "releasePanel" && ts.isArrowFunction(node.right)), "releasePanel assignment");
    // Execute the real render transaction through its first DOM replacement,
    // plus the complete release callback. No copied cleanup implementation.
    return [
        ...["activeDragCleanups", "clearDragInteractions", "dragCleanup", "beginDrag", "holdTimer", "holdOrigin"].map(statement),
        listener("dragHandle"), listener("cell"),
        `const renderCleanup = () => {${render.statements.slice(0, replaceIndex + 1).map((node) => node.getText(file)).join("\n")}};`,
        statement("panelReleased"), `let releasePanel; ${release.getText(file)};`,
        "return {renderCleanup, releasePanel, activeDragCleanups};",
    ].join("\n");
}

class Events {
    constructor() { this.events = new Map(); }
    addEventListener(type, callback, capture = false) {
        const key = `${type}:${Boolean(capture)}`;
        if (!this.events.has(key)) this.events.set(key, new Set());
        this.events.get(key).add(callback);
    }
    removeEventListener(type, callback, capture = false) { this.events.get(`${type}:${Boolean(capture)}`)?.delete(callback); }
    callbacks(type) { return [...this.events].filter(([key]) => key.startsWith(`${type}:`)).flatMap(([, callbacks]) => [...callbacks]); }
    dispatch(type, event = {}) { this.callbacks(type).forEach((callback) => callback(event)); }
    count() { return [...this.events.values()].reduce((sum, callbacks) => sum + callbacks.size, 0); }
}

class Element extends Events {
    constructor() {
        super();
        const classes = new Set();
        this.classList = {
            add: (...names) => names.forEach((name) => classes.add(name)),
            remove: (...names) => names.forEach((name) => classes.delete(name)),
            contains: (name) => classes.has(name),
            toggle: (name, on) => on ? classes.add(name) : classes.delete(name),
        };
        this.dataset = {};
        this.attributes = new Map();
        this.parentElement = null;
    }
    setAttribute(name, value) { this.attributes.set(name, value); }
    removeAttribute(name) { this.attributes.delete(name); }
    closest(selector) { return selector === ".sw-home__cell" ? this : null; }
    contains() { return false; }
}

function mount(text = source) {
    const window = new Events();
    const timers = new Map();
    const frames = new Map();
    let handle = 0;
    window.setTimeout = (callback, delay) => { const id = ++handle; timers.set(id, {callback, delay}); return id; };
    window.clearTimeout = (id) => timers.delete(id);
    window.requestAnimationFrame = (callback) => { const id = ++handle; frames.set(id, callback); return id; };
    window.cancelAnimationFrame = (id) => frames.delete(id);
    const cell = new Element();
    cell.dataset.instanceId = "a";
    const target = new Element();
    target.dataset.instanceId = "b";
    const root = new Element();
    let replacements = 0;
    Object.defineProperty(root, "innerHTML", {set() {
        assert.equal(window.count(), 0, "render must release global drag/hold listeners before replacing DOM");
        assert.equal(timers.size, 0, "render must cancel the hold timer before replacing DOM");
        assert.equal(frames.size, 0, "render must cancel edge-scroll frames before replacing DOM");
        replacements += 1;
    }});
    const dragHandle = new Element();
    const scroll = {scrollHeight: 1000, clientHeight: 100, scrollTop: 20, parentElement: null,
        getBoundingClientRect: () => ({top: 0, height: 100})};
    const grid = {parentElement: scroll, querySelectorAll: () => [cell, target]};
    const document = new Events();
    document.activeElement = null;
    document.elementFromPoint = () => target;
    const calls = [];
    const onWorkbenchKeydown = () => {};
    document.addEventListener("keydown", onWorkbenchKeydown);
    const handleModuleChange = () => {};
    const host = {getHomeState: () => ({layouts: {desktop: [{instanceId: "a"}, {instanceId: "b"}]}}),
        homeModuleChangeListeners: new Set([handleModuleChange])};
    const dependencies = {
        window, document, HTMLElement: Element, cell, grid, root, dragHandle,
        computeEdgeScrollDelta, moveLayoutEntry, commitMove: (result) => calls.push(result),
        inst: {instanceId: "a"}, device: "desktop", editing: true,
        homeControllers: [], homeRefreshBatchController: null, panelEventCleanup: null,
        clearDeferredRefreshes() {}, clearResizeInteractions() {}, disposeSizeMenu() {},
        iconObserver: null, iconClampFrame: 0, cancelAnimationFrame: window.cancelAnimationFrame,
        ownerDocument: document, onWorkbenchKeydown, handleModuleChange,
    };
    const compiled = ts.transpileModule(extractInteractionRuntime(text), {compilerOptions: {target: ts.ScriptTarget.ES2020}}).outputText;
    const api = new Function(...Object.keys(dependencies), compiled).call(host, ...Object.values(dependencies));
    const pointer = (extra = {}) => ({button: 0, clientX: 10, clientY: 10, pointerType: "touch", target: cell, preventDefault() {}, ...extra});
    return {window, document, timers, frames, cell, target, dragHandle, calls, api, pointer,
        replacements: () => replacements,
        startDrag() {
            dragHandle.dispatch("pointerdown", pointer());
            window.dispatch("pointermove", pointer({clientX: 30, clientY: 90}));
        },
        startHold() { cell.dispatch("pointerdown", pointer()); },
        fireTimer() {
            const [id, timer] = [...timers][0];
            timers.delete(id);
            timer.callback();
        },
    };
}

function assertReleased(runtime) {
    assert.equal(runtime.window.count(), 0, "all global gesture listeners must be removed");
    assert.equal(runtime.timers.size, 0, "hold timers must be cancelled");
    assert.equal(runtime.frames.size, 0, "edge-scroll frames must be cancelled");
    assert.equal(runtime.api.activeDragCleanups.size, 0, "completed cleanup must unregister itself");
    assert.equal(runtime.cell.classList.contains("sw-home__cell--dragging"), false);
    assert.equal(runtime.cell.classList.contains("sw-home__cell--hold"), false);
    assert.equal(runtime.target.classList.contains("sw-home__cell--dragover"), false);
    assert.equal(runtime.cell.attributes.has("data-prevent-swipe"), false);
}

test("production pointer drag commits once and releases listeners, hints, swipe guard and edge frame", () => {
    const runtime = mount();
    runtime.startDrag();
    assert.equal(runtime.window.count(), 4);
    assert.equal(runtime.frames.size, 1);
    assert.equal(runtime.cell.attributes.get("data-prevent-swipe"), "true");
    const lateUp = runtime.window.callbacks("pointerup")[0];
    runtime.window.dispatch("pointerup");
    lateUp();
    assert.deepEqual(runtime.calls.map((result) => result.list.map((entry) => entry.instanceId)), [["b", "a"]]);
    assertReleased(runtime);
});

test("production pointercancel and Escape cancel an active drag even if an old pointerup callback runs", () => {
    for (const cause of ["pointercancel", "Escape"]) {
        const runtime = mount();
        runtime.startDrag();
        const lateUp = runtime.window.callbacks("pointerup")[0];
        let prevented = false;
        runtime.window.dispatch(cause === "Escape" ? "keydown" : cause, {key: "Escape", preventDefault() { prevented = true; }, stopPropagation() {}});
        if (cause === "Escape") assert.equal(prevented, true);
        lateUp();
        assert.equal(runtime.calls.length, 0);
        assertReleased(runtime);
    }
});

test("production rerender and destroy cancel active drag before replacement and prevent late commits", () => {
    for (const lifecycle of ["renderCleanup", "releasePanel"]) {
        const runtime = mount();
        runtime.startDrag();
        const lateUp = runtime.window.callbacks("pointerup")[0];
        runtime.api[lifecycle]();
        runtime.api[lifecycle]();
        lateUp();
        runtime.window.dispatch("pointerup");
        assert.equal(runtime.calls.length, 0, `${lifecycle} must not commit a cancelled move`);
        assertReleased(runtime);
        if (lifecycle === "renderCleanup") assert.equal(runtime.replacements(), 2);
        else assert.equal(runtime.document.count(), 0, "destroy must remove the document key handler");
    }
});

test("production rerender and destroy cancel pending hold and reject its obsolete timer callback", () => {
    for (const lifecycle of ["renderCleanup", "releasePanel"]) {
        const runtime = mount();
        runtime.startHold();
        assert.equal(runtime.window.count(), 3);
        assert.equal(runtime.timers.size, 1);
        const timer = [...runtime.timers.values()][0];
        assert.equal(timer.delay, 520);
        runtime.api[lifecycle]();
        assertReleased(runtime);
        timer.callback();
        runtime.window.dispatch("pointermove", runtime.pointer({clientX: 30, clientY: 90}));
        runtime.window.dispatch("pointerup");
        assert.equal(runtime.calls.length, 0, "a cancelled hold must never start a late move");
        assertReleased(runtime);
    }
});

test("production long press hands off to the shared drag pipeline and commits one move", () => {
    const runtime = mount();
    runtime.startHold();
    runtime.startHold();
    assert.equal(runtime.timers.size, 1, "a second pointerdown must not add another timer");
    runtime.fireTimer();
    assert.equal(runtime.cell.classList.contains("sw-home__cell--hold"), false);
    assert.equal(runtime.window.count(), 4);
    assert.equal(runtime.api.activeDragCleanups.size, 1);
    runtime.window.dispatch("pointermove", runtime.pointer({clientX: 30, clientY: 90}));
    runtime.window.dispatch("pointerup");
    assert.equal(runtime.calls.length, 1);
    assertReleased(runtime);
});

test("production hold cancels on movement, pointerup or pointercancel without a later drag", () => {
    for (const cause of ["pointermove", "pointerup", "pointercancel"]) {
        const runtime = mount();
        runtime.startHold();
        const timer = [...runtime.timers.values()][0];
        runtime.window.dispatch(cause, runtime.pointer({clientX: 30}));
        assertReleased(runtime);
        timer.callback();
        assertReleased(runtime);
        assert.equal(runtime.calls.length, 0);
    }
});
