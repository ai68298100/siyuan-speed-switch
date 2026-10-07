const test = require("node:test");
const assert = require("node:assert/strict");
const {readSourceText} = require("./source-scan.cjs");

const source = readSourceText("src/home-store-ui.ts");

function sliceBetween(start, end) {
    const startIndex = source.indexOf(start);
    const endIndex = source.indexOf(end, startIndex + start.length);
    assert.notEqual(startIndex, -1, `missing source marker: ${start}`);
    assert.notEqual(endIndex, -1, `missing source marker: ${end}`);
    return source.slice(startIndex, endIndex);
}

test("T-7153 store rerenders dispose old node listeners before replacement", () => {
    const render = sliceBetween("const renderStore = () => {", "        const onStoreKeydown");
    const disposeIndex = render.indexOf("disposeRenderListeners();");
    const replaceIndex = render.indexOf("catalogPane.innerHTML = \"\";");
    assert.ok(disposeIndex >= 0, "renderStore must dispose the previous render bindings");
    assert.ok(replaceIndex >= 0, "renderStore must retain its catalog replacement point");
    assert.ok(disposeIndex < replaceIndex, "old listeners must be removed before detached nodes are replaced");
    assert.match(render, /bindRenderListener\(clearSearchButton/);
    assert.match(render, /bindRenderListener\(card, "keydown"/);
    assert.match(render, /bindRenderListener\(tile, "keydown"/);
    assert.doesNotMatch(render, /\.addEventListener\(/, "render-scoped listeners must go through the tracked disposer");
});

test("T-7153 store disposal clears render bindings as well as persistent handlers", () => {
    const dispose = sliceBetween("disposeStore = () => {", "        };\n    }\n");
    assert.match(dispose, /disposeRenderListeners\(\);/);
    assert.match(dispose, /root\.removeEventListener\("keydown", onStoreKeydown\)/);
});
