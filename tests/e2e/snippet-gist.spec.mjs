import {expect, test} from "@playwright/test";
import {artifactPath, createClient, openApp, openSwitcher} from "./helpers/app.mjs";

test("真实思源 Gist 预览、禁用导入、新建发布和受控更新", async ({page}) => {
    const client = createClient();
    const original = await client.postChecked("/api/snippet/getSnippet", {type: "all", enabled: 2});
    const snippets = Array.isArray(original.snippets) ? original.snippets : [];
    const seeded = {id: "20261004120000-giste2e", name: "Gist E2E " + Date.now(), type: "css",
        content: ".gist-e2e { color: red; }", enabled: false, disabledInPublish: false};
    const url = "https://gist.github.com/e2e/abcdef123456";
    const filename = "siyuan-snippet-" + seeded.id + ".css";
    let remote = {id: "abcdef123456", html_url: url, description: seeded.name + " remote",
        files: {[filename]: {filename, content: ".gist-e2e { color: blue; }"}, "notes.md": {filename: "notes.md", content: "Unsupported"}}};
    const requests = [];
    const headers = {"Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
        "Access-Control-Allow-Headers": "Authorization, Content-Type, X-GitHub-Api-Version", "Content-Type": "application/json"};
    await page.route("https://api.github.com/gists**", async (route) => {
        const request = route.request();
        const method = request.method();
        if (method === "OPTIONS") { await route.fulfill({status: 204, headers, body: ""}); return; }
        requests.push({method, url: request.url(), headers: request.headers(), body: request.postData()});
        if (method === "POST" || method === "PATCH") {
            const body = request.postDataJSON();
            remote = {...remote, description: body.description, files: method === "POST" ? {} : {...remote.files}};
            for (const [key, value] of Object.entries(body.files)) {
                if (value === null) delete remote.files[key];
                else remote.files[key] = {filename: key, content: value.content};
            }
        }
        await route.fulfill({status: 200, headers, body: JSON.stringify(remote)});
    });
    await client.postChecked("/api/snippet/setSnippet", {snippets: [...snippets, seeded]});
    let importedId = "";
    let settingsBefore;
    try {
        await openApp(page);
        settingsBefore = await page.evaluate(() => {
            const plugin = window.siyuan.ws.app.plugins.find((entry) => entry.name === "siyuan-speed-switch");
            return plugin.getSettings().snippetGist;
        });
        await page.evaluate(() => window.siyuan.ws.app.plugins.find((entry) => entry.name === "siyuan-speed-switch").updateSettings({snippetGist: {token: "", links: {}}}));
        await openSwitcher(page);
        await page.locator(".sw__snippet-studio-btn").click();
        const root = page.locator(".sw-snippet-studio-host.sw-studio");
        await expect(root.locator(".sw-studio__layout")).toHaveAttribute("aria-busy", "false");
        await root.getByRole("button", {name: "Choose snippet", exact: true}).click();
        const picker = page.locator(".sw-studio__picker");
        await picker.getByRole("textbox", {name: "Search snippets", exact: true}).fill(seeded.name);
        await picker.locator('[data-snippet-id="' + seeded.id + '"]').click();
        const gist = root.locator(".sw-studio__gist");
        await expect(gist).not.toHaveAttribute("open");
        await gist.locator("summary").first().click();
        await gist.getByRole("textbox", {name: "Full Gist URL", exact: true}).fill(url);
        await gist.getByRole("button", {name: "Read Gist", exact: true}).click();
        await expect(gist.locator(".sw-studio__gist-row.is-ready")).toHaveCount(1);
        await expect(gist.locator(".sw-studio__gist-row.is-muted")).toHaveCount(1);
        await expect(gist.locator(".sw-studio__gist-diff")).toHaveCount(1);
        expect(requests[0].headers.authorization).toBeUndefined();
        await gist.getByRole("button", {name: "Import as disabled draft", exact: true}).click();
        await root.getByRole("button", {name: "Save draft", exact: true}).click();
        await expect(root.locator(".sw-studio__layout")).toHaveAttribute("aria-busy", "false");
        const saved = await client.postChecked("/api/snippet/getSnippet", {type: "all", enabled: 2});
        const imported = saved.snippets.find((entry) => entry.id !== seeded.id && entry.content === ".gist-e2e { color: blue; }");
        expect(imported).toBeTruthy();
        importedId = imported.id;
        expect(imported.id).not.toBe(seeded.id);
        expect(imported.enabled).toBe(false);
        expect(saved.snippets.find((entry) => entry.id === seeded.id).content).toBe(seeded.content);
        const token = gist.getByLabel("GitHub token", {exact: true});
        await token.fill("ghp_e2e_not_real");
        await gist.getByRole("button", {name: "Save token", exact: true}).click();
        await expect(token).toHaveValue("");
        await expect(token).toBeHidden();
        await gist.getByRole("button", {name: "Publish new Gist", exact: true}).click();
        await expect(root.locator(".sw-studio__layout")).toHaveAttribute("aria-busy", "false");
        await expect(gist.getByRole("textbox", {name: "Full Gist URL", exact: true})).toHaveValue(url);
        expect(requests.find((entry) => entry.method === "POST").headers.authorization).toBe("Bearer ghp_e2e_not_real");
        expect(JSON.parse(requests.find((entry) => entry.method === "POST").body).public).toBe(false);
        await gist.getByRole("button", {name: "Read before updating", exact: true}).click();
        await expect(gist.getByRole("textbox", {name: "Gist description", exact: true})).toHaveValue(remote.description);
        await gist.getByRole("button", {name: "Update current Gist", exact: true}).click();
        await expect(root.locator(".sw-studio__layout")).toHaveAttribute("aria-busy", "false");
        expect(requests.map((entry) => entry.method)).toEqual(["GET", "POST", "GET", "GET", "PATCH"]);
        const mapping = await page.evaluate((id) => window.siyuan.ws.app.plugins.find((entry) => entry.name === "siyuan-speed-switch").getSettings().snippetGist.links[id], importedId);
        expect(mapping).toBe(url);
        await page.screenshot({path: artifactPath("snippet-gist.png"), fullPage: true});
    } finally {
        if (settingsBefore !== undefined) await page.evaluate((settings) => {
            window.siyuan.ws.app.plugins.find((entry) => entry.name === "siyuan-speed-switch").updateSettings({snippetGist: settings});
        }, settingsBefore).catch(() => undefined);
        const after = await client.postChecked("/api/snippet/getSnippet", {type: "all", enabled: 2});
        await client.postChecked("/api/snippet/setSnippet", {snippets: (after.snippets || []).filter((entry) =>
            entry.id !== seeded.id && entry.id !== importedId && entry.content !== ".gist-e2e { color: blue; }")});
    }
});
