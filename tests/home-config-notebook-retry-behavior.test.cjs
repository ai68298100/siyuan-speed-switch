const test = require("node:test");
const assert = require("node:assert/strict");
const {JSDOM} = require("jsdom");
const {runNotebookLoad} = require("../src/notebook-load-ui.js");

const labels = {
    loading: "Loading notebooks…",
    failed: "Could not load notebooks",
    placeholder: "Select a notebook",
    unavailable: "Unavailable",
};

function setupControls() {
    const dom = new JSDOM('<div><select></select><button hidden>Retry</button></div>');
    const previousDocument = global.document;
    global.document = dom.window.document;
    return {
        dom,
        select: dom.window.document.querySelector("select"),
        retry: dom.window.document.querySelector("button"),
        restore() {
            if (previousDocument === undefined) delete global.document;
            else global.document = previousDocument;
            dom.window.close();
        },
    };
}

test("notebook load failure is distinct from a valid empty result and exposes retry", async () => {
    const ui = setupControls();
    try {
        const loaded = [];
        const request = runNotebookLoad({
            ...ui,
            labels,
            load: async () => ({notebooks: [], failed: true}),
            isDisposed: () => false,
            currentValue: () => "",
            onLoaded: (value) => loaded.push(value),
            retrying: false,
        });
        assert.equal(ui.select.disabled, true);
        assert.equal(ui.select.options[0].textContent, labels.loading);
        await request;
        assert.equal(ui.select.disabled, true);
        assert.equal(ui.select.options[0].textContent, labels.failed);
        assert.equal(ui.retry.hidden, false);
        assert.equal(ui.retry.disabled, false);
        assert.equal(ui.retry.hasAttribute("aria-busy"), false);
        assert.deepEqual(loaded, []);
    } finally {
        ui.restore();
    }
});

test("successful retry restores selection and clears disabled and busy state", async () => {
    const ui = setupControls();
    try {
        let resolveLoad;
        const loaded = [];
        const request = runNotebookLoad({
            ...ui,
            labels,
            load: () => new Promise((resolve) => { resolveLoad = resolve; }),
            isDisposed: () => false,
            currentValue: () => "nb-2",
            onLoaded: (value) => loaded.push(value),
            retrying: true,
        });
        assert.equal(ui.select.disabled, true);
        assert.equal(ui.select.options[0].textContent, labels.loading);
        assert.equal(ui.retry.hidden, false);
        assert.equal(ui.retry.disabled, true);
        assert.equal(ui.retry.getAttribute("aria-busy"), "true");

        resolveLoad({notebooks: [{id: "nb-1", name: "One"}, {id: "nb-2", name: "Two"}], failed: false});
        await request;
        assert.equal(ui.select.disabled, false);
        assert.equal(ui.select.value, "nb-2");
        assert.deepEqual([...ui.select.options].map((option) => option.textContent), [labels.placeholder, "One", "Two"]);
        assert.equal(ui.retry.hidden, true);
        assert.equal(ui.retry.disabled, false);
        assert.equal(ui.retry.hasAttribute("aria-busy"), false);
        assert.deepEqual(loaded, ["nb-2"]);
    } finally {
        ui.restore();
    }
});

test("successful empty response stays an enabled empty state, not a load failure", async () => {
    const ui = setupControls();
    try {
        await runNotebookLoad({
            ...ui,
            labels,
            load: async () => ({notebooks: [], failed: false}),
            isDisposed: () => false,
            currentValue: () => "",
            onLoaded: () => undefined,
            retrying: false,
        });
        assert.equal(ui.select.disabled, false);
        assert.equal(ui.select.options.length, 1);
        assert.equal(ui.select.options[0].textContent, labels.placeholder);
        assert.equal(ui.retry.hidden, true);
    } finally {
        ui.restore();
    }
});

test("late notebook response after disposal does not update detached controls", async () => {
    const ui = setupControls();
    try {
        let disposed = false;
        let resolveLoad;
        let loaded = false;
        const request = runNotebookLoad({
            ...ui,
            labels,
            load: () => new Promise((resolve) => { resolveLoad = resolve; }),
            isDisposed: () => disposed,
            currentValue: () => "nb-1",
            onLoaded: () => { loaded = true; },
            retrying: true,
        });
        ui.select.remove();
        ui.retry.remove();
        disposed = true;
        resolveLoad({notebooks: [{id: "nb-1", name: "One"}], failed: false});
        await request;
        assert.equal(ui.select.options[0].textContent, labels.loading);
        assert.equal(ui.select.disabled, true);
        assert.equal(ui.retry.disabled, true);
        assert.equal(ui.retry.getAttribute("aria-busy"), "true");
        assert.equal(loaded, false);
    } finally {
        ui.restore();
    }
});
