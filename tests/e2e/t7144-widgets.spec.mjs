import {expect, test} from "@playwright/test";
import {createClient, openApp, openSwitcher} from "./helpers/app.mjs";

const RUN = Date.now().toString(36);
const NOTEBOOK_NAME = `T7144-widgets-${RUN}`;
const TAG_NAME = `T7144-tag-${RUN}`;
const BOOKMARK_NAME = `T7144-bookmark-${RUN}`;
const OUTLINE_TITLE = `T7144-outline-${RUN}`;
const TAGGED_TITLE = `T7144-tagged-${RUN}`;
const TASK_TITLE = `T7144-tasks-${RUN}`;
const OPEN_TASK = `T7144-open-${RUN}`;
const DONE_TASK = `T7144-done-${RUN}`;

function localDate() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function flattenText(nodes) {
    return (Array.isArray(nodes) ? nodes : []).flatMap((node) => [
        String(node?.name || node?.label || ""),
        ...flattenText(node?.children),
    ]);
}

async function createDoc(client, notebook, path, markdown, extra = {}) {
    const created = await client.postChecked("/api/filetree/createDocWithMd", {
        notebook,
        path: `/${path}`,
        markdown,
        ...extra,
    });
    const id = String(created || "");
    expect(id).toMatch(/^\d{14}-[0-9a-z]+$/i);
    return id;
}

test("T-7144 内置组件读取真实隔离宿主数据并保留宿主点击语义", async ({page}) => {
    test.slow();
    const client = createClient();
    const created = await client.postChecked("/api/notebook/createNotebook", {name: NOTEBOOK_NAME});
    const notebook = String(created?.notebook?.id || created?.notebook || "");
    expect(notebook).toMatch(/^\d{14}-[0-9a-z]+$/i);

    try {
        const firstBookmarkDoc = await createDoc(client, notebook, `${BOOKMARK_NAME}-a`, `# ${BOOKMARK_NAME} A\n\nFirst bookmarked document.`);
        await createDoc(client, notebook, `${BOOKMARK_NAME}-b`, `# ${BOOKMARK_NAME} B\n\nSecond bookmarked document.`);
        const taggedDoc = await createDoc(client, notebook, TAGGED_TITLE, `# ${TAGGED_TITLE}\n\nTagged fixture #${TAG_NAME}#`, {tags: TAG_NAME});
        const dailyDoc = await createDoc(client, notebook, `${localDate()} ${TASK_TITLE}`, `# ${TASK_TITLE}\n\n- [ ] ${OPEN_TASK}\n\n- [x] ${DONE_TASK}`);
        const outlineDoc = await createDoc(client, notebook, OUTLINE_TITLE,
            `# ${OUTLINE_TITLE} root\n\n## Section Alpha\n\nAlpha body.\n\n### Detail Beta\n\nBeta body.`);

        await Promise.all([firstBookmarkDoc, taggedDoc].map((id) => client.postChecked("/api/attr/setBlockAttrs", {
            id,
            attrs: {bookmark: BOOKMARK_NAME},
        })));
        const dateKey = localDate().replace(/-/g, "");
        await client.postChecked("/api/attr/setBlockAttrs", {
            id: dailyDoc,
            attrs: {[`custom-dailynote-${dateKey}`]: dateKey},
        });

        await expect.poll(async () => {
            const tags = await client.postChecked("/api/tag/getTag", {});
            return flattenText(tags).some((text) => text.toLocaleLowerCase().includes(TAG_NAME.toLocaleLowerCase()));
        }, {timeout: 20000}).toBe(true);

        const bookmarks = await client.postChecked("/api/bookmark/getBookmark", {});
        expect(Array.isArray(bookmarks)).toBe(true);
        const matchingBookmark = bookmarks.find((entry) => String(entry?.name || entry?.bookmark || "") === BOOKMARK_NAME);
        expect(matchingBookmark).toBeTruthy();
        expect(matchingBookmark.blocks).toHaveLength(2);
        expect(Number(matchingBookmark.count) || matchingBookmark.blocks.length).toBe(2);

        await openApp(page);
        await openSwitcher(page);
        const search = page.locator("input.sw__search");
        await search.fill(OUTLINE_TITLE);
        const outlineResult = page.locator(".sw__doc-item", {hasText: OUTLINE_TITLE}).first();
        await expect(outlineResult).toBeVisible({timeout: 20000});
        await outlineResult.click();
        await expect(page.locator(".protyle-title").filter({hasText: OUTLINE_TITLE}).first()).toBeVisible({timeout: 20000});

        const reads = await page.evaluate(async ({notebookId, tagName, bookmarkName, taskTitle}) => {
            const plugin = window.siyuan.ws.app.plugins.find(item => item.name === "siyuan-speed-switch");
            const read = (moduleId, config = {}) => plugin.readHomeModule(moduleId, "desktop", config, {force: true, cacheTtlMs: 0});
            return {
                tags: await read("tags", {query: tagName}),
                bookmarks: await read("bookmarks", {query: bookmarkName}),
                tasks: await read("today-tasks", {notebook: notebookId, showCompleted: "是", query: taskTitle, limit: 5}),
                noteStats: await read("note-stats", {notebook: notebookId, days: 7}),
                recentEdits: await read("recent-edits", {notebook: notebookId, days: 30, limit: 5, query: taskTitle}),
                outline: await read("current-document-outline"),
            };
        }, {notebookId: notebook, tagName: TAG_NAME, bookmarkName: BOOKMARK_NAME, taskTitle: TASK_TITLE});

        for (const result of Object.values(reads)) expect(result.ok).toBe(true);
        expect(reads.tags.snapshot.items).toHaveLength(1);
        expect(reads.tags.snapshot.items[0].label.toLocaleLowerCase()).toContain(TAG_NAME.toLocaleLowerCase());
        expect(reads.bookmarks.snapshot.items).toHaveLength(1);
        expect(reads.bookmarks.snapshot.items[0].label).toBe(BOOKMARK_NAME);
        expect(reads.bookmarks.snapshot.items[0].secondary).toMatch(/^2 /);
        expect(reads.bookmarks.snapshot.items[0].value).toMatch(/^bookmark-block:/);
        expect(reads.tasks.snapshot.items.map((item) => item.label)).toEqual(expect.arrayContaining([OPEN_TASK, DONE_TASK]));
        expect(reads.tasks.snapshot.items.find((item) => item.label === OPEN_TASK).done).toBe(false);
        expect(reads.tasks.snapshot.items.find((item) => item.label === DONE_TASK).done).toBe(true);
        expect(Number(reads.noteStats.snapshot.stat.value)).toBeGreaterThan(0);
        expect(reads.recentEdits.snapshot.items.length).toBeGreaterThan(0);
        expect(reads.outline.snapshot.items.map((item) => item.label).join(" ")).toContain("Section Alpha");
        expect(reads.outline.snapshot.items.map((item) => item.label).join(" ")).toContain("Detail Beta");

        const configs = {
            tags: {query: TAG_NAME},
            bookmarks: {query: BOOKMARK_NAME},
            "today-tasks": {notebook, showCompleted: "是", query: TASK_TITLE},
            "note-stats": {notebook, days: 7},
            "recent-edits": {notebook, days: 30, limit: 5, query: TASK_TITLE},
            "current-document-outline": {},
        };
        const modules = Object.keys(configs);
        await page.evaluate(({configs, modules}) => {
            const plugin = window.siyuan.ws.app.plugins.find(item => item.name === "siyuan-speed-switch");
            const rows = modules.map((moduleId, index) => ({
                instanceId: `t7144-${moduleId}`,
                moduleId,
                enabled: true,
                config: configs[moduleId],
            }));
            window.__t7144HomeState = {
                schemaVersion: 1,
                instances: rows,
                layouts: {desktop: rows.map((row, index) => ({
                    instanceId: row.instanceId,
                    x: 0,
                    y: index * 3,
                    w: 8,
                    h: 2,
                    size: ["note-stats", "current-document-outline"].includes(row.moduleId) ? "wide" : "small",
                }))},
            };
            plugin.getSettings = () => ({homeSizeMode: "fullscreen", panelSizeMode: "fullscreen"});
            plugin.getHomeState = () => structuredClone(window.__t7144HomeState);
            plugin.saveHomeState = state => {window.__t7144HomeState = structuredClone(state);};
            plugin.commands.find(item => item.langKey === "secondPanel").callback();
        }, {configs, modules});

        const workbench = page.locator(".sw-home");
        await expect(workbench).toBeVisible();
        for (const moduleId of modules) {
            await expect(workbench.locator(`.sw-home__cell[data-module-id="${moduleId}"]`)).toHaveAttribute("data-sw-health", "ok");
        }

        await workbench.locator(`.sw-home__cell[data-module-id="bookmarks"] .sw__home-module-item-action`, {hasText: BOOKMARK_NAME}).click();
        await expect(workbench).toHaveCount(0);
        await expect.poll(async () => {
            const titles = await page.locator(".protyle-title").allTextContents();
            return titles.some((title) => title.includes(`${BOOKMARK_NAME}-a`) || title.includes(TAGGED_TITLE));
        }, {timeout: 20000}).toBe(true);

        await page.evaluate(() => {
            const plugin = window.siyuan.ws.app.plugins.find(item => item.name === "siyuan-speed-switch");
            const dock = plugin.getDockByType("tag");
            if (!dock || typeof dock.toggleModel !== "function") throw new Error("tag dock unavailable");
            const original = dock.toggleModel.bind(dock);
            window.__t7144TagDockCalls = [];
            dock.toggleModel = (...args) => {
                window.__t7144TagDockCalls.push(args);
                return original(...args);
            };
            plugin.commands.find(item => item.langKey === "secondPanel").callback();
        });
        await expect(workbench).toBeVisible();
        await workbench.locator(`.sw-home__cell[data-module-id="tags"] .sw__home-module-item-action`, {hasText: TAG_NAME}).click();
        await expect.poll(() => page.evaluate(() => window.__t7144TagDockCalls)).toEqual([["tag", true]]);
        await expect(workbench).toHaveCount(0);
    } finally {
        await client.post("/api/notebook/removeNotebook", {notebook}).catch(() => undefined);
    }
});
