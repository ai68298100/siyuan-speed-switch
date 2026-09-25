// The preview owns an opaque-origin iframe. No host DOM, cookies, native APIs,
// downloads or network; CSS preview has no script permission at all.
function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[char]));
}

function buildSnippetPreviewDocument({type = "css", content = "", dark = false, baseline = false, runJS = false, token = "", labels = {}} = {}) {
    const text = (key, fallback) => escapeHtml(labels[key] || fallback);
    const running = type === "js" && runJS && !baseline;
    const policy = `default-src 'none'; style-src 'unsafe-inline' data:; script-src ${running ? "data:" : "'none'"}; img-src data:; connect-src 'none'; font-src 'none'; media-src 'none'; object-src 'none'; frame-src 'none'; worker-src 'none'; base-uri 'none'; form-action 'none'`;
    // Data URL preserves CSS tokens exactly and prevents </style> HTML breakout.
    const css = type === "css" && !baseline ? `<link rel="stylesheet" href="data:text/css;charset=utf-8,${encodeURIComponent(content)}">` : "";
    const tokenText = JSON.stringify(String(token));
    const bootstrap = `addEventListener('error',e=>parent.postMessage({kind:'sw-snippet-preview',token:${tokenText},error:String(e.message).slice(0,200)},'*'));addEventListener('unhandledrejection',e=>parent.postMessage({kind:'sw-snippet-preview',token:${tokenText},error:String(e.reason).slice(0,200)},'*'));`;
    const script = running ? `<script src="data:text/javascript;charset=utf-8,${encodeURIComponent(bootstrap)}"></script><script src="data:text/javascript;charset=utf-8,${encodeURIComponent(content)}"></script>` : "";
    return `<!doctype html><html lang="${text("lang", "zh-CN")}" data-theme-mode="${dark ? "dark" : "light"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${escapeHtml(policy)}"><style>
:root{color-scheme:${dark ? "dark" : "light"};--b3-theme-background:${dark ? "#20242c" : "#fff"};--b3-theme-on-background:${dark ? "#e2e8f0" : "#253146"};--b3-theme-primary:#7c68d5;--b3-theme-primary-lightest:#ece8fa;--b3-theme-surface:${dark ? "#2a303c" : "#f5f6fa"};--b3-border-color:${dark ? "#414958" : "#dce1ea"};--b3-font-family:system-ui,sans-serif;--b3-font-family-code:monospace}
*{box-sizing:border-box}body{margin:0;background:var(--b3-theme-background);color:var(--b3-theme-on-background);font-family:var(--b3-font-family);font-size:15px}.studio-demo-bar{padding:12px 24px;border-bottom:1px solid var(--b3-border-color);display:flex;gap:18px;font-size:12px;color:var(--b3-theme-primary)}.protyle-wysiwyg{max-width:820px;margin:auto;padding:24px 32px;line-height:1.6}.h1{font-size:27px;font-weight:700}.h2{font-size:19px;font-weight:650;margin-top:16px}.p{margin:12px 0}blockquote,.bq{border-left:3px solid var(--b3-theme-primary);padding:8px 16px;margin:16px 0;background:var(--b3-theme-surface)}table{border-collapse:collapse;width:100%}td,th{padding:8px 12px;border:1px solid var(--b3-border-color);text-align:left}[data-type="code"]{font-family:var(--b3-font-family-code);background:var(--b3-theme-surface);padding:2px 5px;border-radius:4px}.code-block{font-family:var(--b3-font-family-code);background:var(--b3-theme-surface);padding:14px;border-radius:8px;white-space:pre-wrap}button{font:inherit;padding:6px 14px;cursor:pointer}
</style>${css}</head><body><div class="studio-demo-bar"><span>SiYuan</span><span>${text("sample", "演示文档 · 不读取个人笔记")}</span></div><div class="protyle"><div class="protyle-wysiwyg protyle-wysiwyg--attr" spellcheck="false"><div class="h1" data-type="NodeHeading" data-subtype="h1"><div contenteditable="true">${text("title", "让灵感有自己的样子")}</div></div><div class="p" data-type="NodeParagraph"><div contenteditable="true">${text("paragraph", "中文与 English 混排，1234567890。预览标题、正文与代码，观察你的样式如何改变阅读体验。")}</div></div><div class="bq" data-type="NodeBlockquote"><div contenteditable="true">${text("quote", "先看效果，再决定是否启用。每一次调整都从可恢复的草稿开始。")}</div></div><div class="h2" data-type="NodeHeading" data-subtype="h2"><div contenteditable="true">${text("section", "一份清晰的工作记录")}</div></div><div class="p" data-type="NodeParagraph"><div contenteditable="true">${text("codeLabel", "行内代码")} <span data-type="code">const idea = "hello";</span></div></div><div class="table" data-type="NodeTable"><table><thead><tr><th>${text("item", "项目")}</th><th>${text("state", "状态")}</th><th>${text("progress", "进度")}</th></tr></thead><tbody><tr><td>${text("reading", "阅读")}</td><td>${text("ready", "就绪")}</td><td>80%</td></tr><tr><td>${text("writing", "写作")}</td><td>${text("draft", "草稿")}</td><td>40%</td></tr></tbody></table></div><div class="code-block" data-type="NodeCodeBlock"><div class="hljs">function greet(name) {\n  return 'Hello, ' + name;\n}</div></div><div class="p" data-type="NodeParagraph"><button id="demo-button" type="button">${text("button", "交互测试按钮")}</button> <span id="demo-output"></span></div></div></div>${script}</body></html>`;
}

function createSnippetPreview(container, {title, labels, onError = () => {}} = {}) {
    const doc = container.ownerDocument;
    const win = doc.defaultView;
    let frame = null;
    let disposed = false;
    let token = "";
    const handleMessage = (event) => {
        if (disposed || event.source !== frame?.contentWindow || event.data?.kind !== "sw-snippet-preview" || event.data.token !== token) return;
        if (typeof event.data.error === "string") onError(event.data.error.slice(0, 200));
    };
    win.addEventListener("message", handleMessage);
    return {
        render(options) {
            if (disposed) return;
            frame?.remove();
            frame = doc.createElement("iframe");
            token = `${Date.now()}-${Math.random()}`;
            frame.title = title || "Snippet preview";
            frame.referrerPolicy = "no-referrer";
            frame.setAttribute("sandbox", options.type === "js" && options.runJS && !options.baseline ? "allow-scripts" : "");
            frame.setAttribute("allow", "camera 'none'; microphone 'none'; geolocation 'none'; clipboard-read 'none'; clipboard-write 'none'");
            frame.srcdoc = buildSnippetPreviewDocument({...options, labels, token});
            container.replaceChildren(frame);
        },
        dispose() { disposed = true; frame?.remove(); frame = null; win.removeEventListener("message", handleMessage); },
    };
}

module.exports = {buildSnippetPreviewDocument, createSnippetPreview};
