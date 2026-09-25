/* 临时探针：起内核 → 查 getDocOutline 返回形状 → 关内核。审查轮 P-D 用。 */
import {e2eConfig, enablePlugin, installPlugin, prepareWorkspace, readAccessToken, resolveInstall, SiyuanClient, startKernel, stopKernel} from "./lib.mjs";

const cfg = e2eConfig();
const install = resolveInstall();
prepareWorkspace(cfg.workspace);
installPlugin(cfg.workspace, process.cwd());
const running = startKernel({kernel: install.kernel, appDir: install.appDir, workspace: cfg.workspace, port: cfg.port});
let client = new SiyuanClient({baseURL: cfg.baseURL});
try {
    await client.waitForBoot(running.lines);
    const token = readAccessToken(cfg.workspace);
    client = new SiyuanClient({baseURL: cfg.baseURL, token});
    await enablePlugin({client, workspace: cfg.workspace, pluginName: "siyuan-speed-switch"});
    const created = await client.postChecked("/api/notebook/createNotebook", {name: "速切大纲探针"});
    const nb = {id: String(created.notebook?.id || created.notebook || "")};
    const doc = await client.postChecked("/api/filetree/createDocWithMd", {
        notebook: nb.id, path: "/大纲探针文档",
        markdown: "# 根标题\n\n## 背景与目标\n\n正文段落。\n\n## 关键结论\n\n结论内容。\n\n## 下一步计划\n\n计划内容。",
    });
    const docId = String(doc || "");
    const direct = await client.postChecked("/api/outline/getDocOutline", {id: docId, preview: false});
    console.log("[direct]", JSON.stringify({code: direct?.code, msg: direct?.msg, dataType: Array.isArray(direct?.data) ? `array(${direct.data.length})` : typeof direct?.data}));
    const loaded = await client.postChecked("/api/filetree/getDoc", {id: docId});
    console.log("[getDoc]", loaded?.code === undefined ? "ok" : loaded.code, String(loaded?.data?.rootID || "") === docId ? "root match" : "root?");
    const afterLoad = await client.postChecked("/api/outline/getDocOutline", {id: docId, preview: false});
    console.log("[after-load]", JSON.stringify({code: afterLoad?.code, dataType: Array.isArray(afterLoad?.data) ? `array(${afterLoad.data.length})` : typeof afterLoad?.data}));
    if (Array.isArray(afterLoad?.data)) {
        console.log(JSON.stringify(afterLoad.data, null, 1).slice(0, 1200));
    }
    const previewTrue = await client.postChecked("/api/outline/getDocOutline", {id: docId, preview: true});
    console.log("[preview-true]", Array.isArray(previewTrue) ? `array(${previewTrue.length})` : typeof previewTrue);
    const headings = await client.postChecked("/api/query/sql", {stmt: `SELECT type, subtype, content FROM blocks WHERE root_id = '${docId}' ORDER BY id LIMIT 20`});
    console.log("[sql blocks]", JSON.stringify(headings));
    console.log("[preview-true data]", JSON.stringify(previewTrue).slice(0, 900));
} finally {
    await stopKernel({client, child: running.child}, running.lines);
}
