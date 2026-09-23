const test = require("node:test");
const assert = require("node:assert/strict");
const {JSDOM} = require("jsdom");
const {mountQuickActionPicker} = require("../src/quick-actions-ui.js");
const ts = require("typescript");
const {readSourceFile} = require("./source-scan.cjs");
const {normalizeCustomIcon, isImageIconReference, resolveIconReference} = require("../src/util.js");
const {sanitizeQuickActions} = require("../src/quick-actions.js");

function customIconPicker(t) {
    const source = readSourceFile("src/index.ts");
    const parsed = ts.createSourceFile("index.ts", source, ts.ScriptTarget.Latest, true);
    const hostClass = parsed.statements.find((node) => ts.isClassDeclaration(node) && node.name?.text === "SpeedSwitchPlugin");
    const names = ["getAvailableIconSymbols", "renderQuickActionIcon", "getAvailableQuickActionIcons", "openQuickActionIconPicker"];
    const members = names.map((name) => hostClass.members.find((node) => ts.isMethodDeclaration(node)
        && node.name.getText(parsed) === name).getText(parsed));
    const output = ts.transpileModule(`class IconHost {${members.join("\n")}}`, {
        compilerOptions: {target: ts.ScriptTarget.ES2019},
    }).outputText;
    const dom = new JSDOM('<svg><symbol id="iconPlugin"></symbol><symbol id="iconFile"></symbol></svg>');
    t.after(() => dom.window.close());
    const catalogModule = {exports: {}};
    new Function("module", "exports", ts.transpileModule(readSourceFile("src/constants.ts"), {
        compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019},
    }).outputText)(catalogModule, catalogModule.exports);
    const IconHost = new Function("document", "ICON_CATALOG", "ICON_CATEGORIES", "normalizeCustomIcon", "isImageIconReference", "resolveIconReference",
        `${output}; return IconHost;`)(dom.window.document, catalogModule.exports.ICON_CATALOG, catalogModule.exports.ICON_CATEGORIES, normalizeCustomIcon, isImageIconReference, resolveIconReference);
    const host = new IconHost();
    host.i18n = require("../src/i18n/zh-CN.json");
    host.isMobile = true;
    const values = [];
    host.openQuickActionIconPicker({icon: "iconPlugin"}, (icon) => values.push(icon));
    const document = dom.window.document;
    return {dom, document, values, input: document.querySelector(".sw-quick-icon-picker__custom"),
        apply: document.querySelector(".sw-quick-icon-picker__custom-apply")};
}

test("custom icon picker previews safe images, rejects unsafe URLs, and preserves selection in settings", (t) => {
    const {dom, document, values, input, apply} = customIconPicker(t);
    input.value = "https://user:pass@example.com/icon.png";
    input.dispatchEvent(new dom.window.Event("input"));
    assert.equal(apply.disabled, true);
    apply.click();
    assert.deepEqual(values, []);
    assert.equal(document.querySelector(".sw-quick-icon-picker__preview img"), null);
    input.value = "https://cdn.example.com/icon.png";
    input.dispatchEvent(new dom.window.Event("input"));
    assert.equal(apply.disabled, false);
    assert.equal(document.querySelector(".sw-quick-icon-picker__preview img").src, input.value);
    apply.click();
    assert.deepEqual(values, ["https://cdn.example.com/icon.png"]);
    assert.equal(document.querySelector(".sw-quick-icon-picker-overlay"), null);
    const saved = sanitizeQuickActions([{id: "search", kind: "builtin", value: "search", label: "搜索", icon: values[0], targets: ["desktop"]}]);
    assert.equal(saved.items[0].icon, values[0]);
});

test("custom icon picker renders ASCII short text and composite emoji as text", (t) => {
    const {dom, document, values, input, apply} = customIconPicker(t);
    for (const value of ["Go", "打卡", "👨‍👩‍👧‍👦"]) {
        input.value = value;
        input.dispatchEvent(new dom.window.Event("input"));
        assert.equal(apply.disabled, false);
        const preview = document.querySelector(".sw-quick-icon-picker__preview");
        assert.equal(preview.textContent, value);
        assert.equal(preview.querySelector("svg"), null);
    }
    apply.click();
    assert.deepEqual(values, ["👨‍👩‍👧‍👦"]);
});

test("quick action picker opens inline and selects one candidate", () => {
    const dom = new JSDOM('<button id="add" aria-expanded="false">Add</button><div id="host"></div>');
    const document = dom.window.document;
    const trigger = document.querySelector("#add");
    const host = document.querySelector("#host");
    const selected = [];
    trigger.addEventListener("click", () => mountQuickActionPicker({
        trigger,
        host,
        candidates: [{id: "clock", label: "打卡", icon: "iconPlugin", group: "插件", secondary: "电脑、侧栏"}],
        searchPlaceholder: "搜索入口",
        emptyText: "无结果",
        onSelect: (candidate) => selected.push(candidate.id),
    }));

    trigger.click();
    assert.equal(trigger.getAttribute("aria-expanded"), "true");
    assert.ok(host.querySelector(".sw-setting__quick-picker"));
    host.querySelector('[data-candidate-id="clock"]').click();
    assert.deepEqual(selected, ["clock"]);
    assert.equal(trigger.getAttribute("aria-expanded"), "false");
    assert.equal(host.querySelector(".sw-setting__quick-picker"), null);
});

test("quick action picker filters candidates and can be toggled closed", () => {
    const dom = new JSDOM('<button id="add"></button><div id="host"></div>');
    const document = dom.window.document;
    const trigger = document.querySelector("#add");
    const host = document.querySelector("#host");
    const options = {
        trigger,
        host,
        candidates: [
            {id: "journal", label: "日记", icon: "iconCalendar", group: "内置"},
            {id: "clock", label: "打卡", icon: "iconPlugin", group: "插件"},
        ],
        searchPlaceholder: "搜索入口",
        emptyText: "无结果",
        onSelect: () => undefined,
    };
    mountQuickActionPicker(options);
    const search = host.querySelector("input");
    search.value = "打卡";
    search.dispatchEvent(new dom.window.Event("input", {bubbles: true}));
    assert.equal(host.querySelectorAll("[data-candidate-id]").length, 1);
    assert.equal(host.querySelector("[data-candidate-id]").dataset.candidateId, "clock");
    mountQuickActionPicker(options);
    assert.equal(host.querySelector(".sw-setting__quick-picker"), null);
    assert.equal(trigger.getAttribute("aria-expanded"), "false");
});

test("quick action picker resolves plugin symbols and ignores non-symbol ids", () => {
    const dom = new JSDOM(`
        <svg aria-hidden="true"><symbol id="iconFile"></symbol><symbol id="iconPlugin"></symbol><symbol id="siyuan-media-player-icon"></symbol></svg>
        <div id="siyuan-reader-icon">not an svg icon</div>
        <button id="add"></button><div id="host"></div>
    `);
    const document = dom.window.document;
    const trigger = document.querySelector("#add");
    const host = document.querySelector("#host");
    mountQuickActionPicker({
        trigger,
        host,
        candidates: [
            {id: "media", label: "思播", icon: "siyuan-media-player-icon", fallbackIcon: ["iconPlugin", "iconFile"]},
            {id: "reader", label: "思阅", icon: "siyuan-reader-icon", fallbackIcon: ["iconPlugin", "iconFile"]},
        ],
        onSelect: () => undefined,
    });
    const items = Array.from(host.querySelectorAll("[data-candidate-id]"));
    assert.equal(items.length, 2);
    assert.equal(items[0].querySelector("use").getAttribute("href"), "#siyuan-media-player-icon");
    assert.equal(items[1].querySelector("use").getAttribute("href"), "#iconPlugin");
    assert.equal(items[1].textContent.includes("not an svg icon"), false);
});

test("quick action picker keeps normalized metadata in bounded text nodes", () => {
    const dom = new JSDOM(`
        <svg aria-hidden="true"><symbol id="iconFile"></symbol><symbol id="iconPlugin"></symbol></svg>
        <button id="add"></button><div id="host"></div>
    `);
    const document = dom.window.document;
    const trigger = document.querySelector("#add");
    const host = document.querySelector("#host");
    mountQuickActionPicker({
        trigger,
        host,
        candidates: [{
            id: "plugin",
            label: "插件\n命令",
            icon: "iconPlugin",
            group: "插件",
            secondary: "电脑\n侧栏",
        }],
        onSelect: () => undefined,
    });
    const item = host.querySelector("[data-candidate-id=plugin]");
    assert.equal(item.classList.contains("sw-setting__quick-picker-item"), true);
    assert.ok(item.querySelector(".sw-setting__quick-picker-copy"));
    assert.equal(item.querySelector(".sw-setting__quick-picker-label").textContent, "插件 命令");
    assert.equal(item.querySelector(".sw-setting__picker-icon svg use").getAttribute("href"), "#iconPlugin");
});
