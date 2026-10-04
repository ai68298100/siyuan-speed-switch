const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const sourcePath = path.join(__dirname, "e2e", "native-sidebar.spec.mjs");
const source = fs.readFileSync(sourcePath, "utf8");

test("T-7115 native sidebar E2E is explicit opt-in and uses a real host marker", () => {
    assert.match(source, /SWSS_E2E_NATIVE_SIDEBAR === "1"/);
    assert.match(source, /test\.skip\(!enabled/);
    assert.match(source, /plugin\.toggleSidebar\(\)/);
    assert.match(source, /layout__dockr/);
    assert.match(source, /dock__item\[data-type=/);
});

test("T-7115 native sidebar E2E measures the host divider and rejects viewport-only evidence", () => {
    assert.match(source, /layout__resize\.layout__resize--lr/);
    assert.match(source, /rect\.height > 500/);
    assert.match(source, /拖动真实宿主分隔条后侧栏必须变窄/);
    assert.match(source, /scrollWidth\)\.toBeLessThanOrEqual\(controls\.(root|toolbar)\.clientWidth \+ 1\)/);
    assert.match(source, /toHaveAttribute\("data-filter-count", "2"\)/);
    assert.match(source, /await reset\.click\(\)/);
    assert.match(source, /toHaveAttribute\("data-filter-count", ""\)/);
});

test("T-7115 native sidebar E2E captures a scoped visual artifact", () => {
    assert.match(source, /const sidebarBox = await sidebarRoot\.boundingBox\(\);/);
    assert.match(source, /await page\.screenshot\(\{path: artifactPath\("native-sidebar-narrow\.png"\), clip: sidebarBox\}\);/);
    assert.match(source, /visualEvidence: \{artifact: "native-sidebar-narrow\.png", scope: SIDEBAR_SELECTOR/);
});

test("T-7115 contract rejects removing the opt-in guard, host marker or width assertion", () => {
    assert.throws(() => {
        const mutated = source.replace('test.skip(!enabled, "真实原生 dock 证据需要 SWSS_E2E_NATIVE_SIDEBAR=1");', "");
        assert.match(mutated, /test\.skip\(!enabled/);
    }, /test\\\.skip/);
    assert.throws(() => {
        const mutated = source.replace('expect(host.hostDock, "侧栏必须挂在真实思源 layout__dockr 内").toBe(true);', "");
        assert.match(mutated, /expect\(host\.hostDock/);
    }, /hostDock/);
    assert.throws(() => {
        const mutated = source.replace('expect(narrowWidth, "拖动真实宿主分隔条后侧栏必须变窄").toBeLessThan(wideAfterSetup);', "");
        assert.match(mutated, /拖动真实宿主分隔条后侧栏必须变窄/);
    }, /拖动真实宿主分隔条后侧栏必须变窄/);
    assert.throws(() => {
        const mutated = source.replace('await page.screenshot({path: artifactPath("native-sidebar-narrow.png"), clip: sidebarBox});', "");
        assert.match(mutated, /await page\.screenshot\(\{path: artifactPath\("native-sidebar-narrow\.png"\), clip: sidebarBox\}\);/);
    }, /page\\.screenshot/);
});
