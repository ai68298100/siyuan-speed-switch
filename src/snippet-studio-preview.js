// The preview owns an opaque-origin iframe. No host DOM, cookies, native APIs,
// downloads or network; CSS preview has no script permission at all.
function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[char]));
}

// T-6960：预览场景目录——固定白名单样例（阅读文档 / 表格与代码 / 界面控件），
// 不拉取个人文档或实际主题资源；宽度档位为有限枚举，容器不足即回退单视图。
const SNIPPET_PREVIEW_SCENES = [
    {id: "reading"},
    {id: "table"},
    {id: "controls"},
];

const SNIPPET_PREVIEW_WIDTHS = [
    {id: "auto", width: 0},
    {id: "narrow", width: 420},
    {id: "medium", width: 768},
    {id: "wide", width: 1024},
];

function normalizePreviewScene(scene) {
    return SNIPPET_PREVIEW_SCENES.some((item) => item.id === scene) ? scene : "reading";
}

// 容器宽度容不下所选档位时返回 0 = 100% 单视图（T-6960 宽度不足回退）。
function resolvePreviewWidth(widthId, containerWidth) {
    const tier = SNIPPET_PREVIEW_WIDTHS.find((item) => item.id === widthId) || null;
    if (!tier || !tier.width) return 0;
    const available = Number(containerWidth);
    if (!Number.isFinite(available) || available < tier.width) return 0;
    return tier.width;
}

// ==================== T-6978：CSS 覆盖探针（预览内容跟随片段选择器） ====================
// 用户片段通常只针对部分元素（如只调 h1-h6、只调列表）；固定样例覆盖不到的元素
// 看不到效果。剥离注释/字符串后按词边界检测选择器特征，命中的元素类型以「探针区块」
// 追加进预览。检测方向是保守的（宁可多探一段，不可漏报）。
// 只剥注释；字符串值保留——属性选择器 `[data-type="tag"]` 的引号值是选择器本体，
// 剥掉会漏报（宁可接受 content:"a" 一类罕见误报，方向是探针多一段而非漏命中）。
function stripCssNoise(content) {
    return String(content || "").replace(/\/\*[\s\S]*?\*\//g, " ");
}

const CSS_PROBE_PATTERNS = {
    links: /(^|[^a-zA-Z0-9_-])a(?![a-zA-Z0-9_-])(?=[\s,{[:.+~>]|$)|\[data-type="a"\]|\bhref\b/,
    lists: /(^|[^a-zA-Z0-9_-])(ul|ol|li)(?![a-zA-Z0-9_-])|NodeList|NodeListItem/,
    tasks: /NodeTaskListItem|checkbox/,
    images: /(^|[^a-zA-Z0-9_-])img(?![a-zA-Z0-9_-])/,
    tags: /\[data-type="tag"\]|(^|[^a-zA-Z0-9_-])tag(?![a-zA-Z0-9_-])[\s,{[:>+~]/,
    marks: /(^|[^a-zA-Z0-9_-])(strong|em|mark|del|ins|kbd|sub|sup)(?![a-zA-Z0-9_-])|(^|[^a-zA-Z0-9_-])(b|i|s|u)(?=[\s,{[:.+~>]|$)/,
    h3: /(^|[^a-zA-Z0-9_-])h3(?![a-zA-Z0-9_-])|data-subtype="h3"/,
    h4: /(^|[^a-zA-Z0-9_-])h4(?![a-zA-Z0-9_-])|data-subtype="h4"/,
    h5: /(^|[^a-zA-Z0-9_-])h5(?![a-zA-Z0-9_-])|data-subtype="h5"/,
    h6: /(^|[^a-zA-Z0-9_-])h6(?![a-zA-Z0-9_-])|data-subtype="h6"/,
};

// 返回命中的特征 id 有序集合（顺序即探针区块内的呈现顺序）。
function analyzeCssCoverage(content) {
    const stripped = stripCssNoise(content);
    const hits = [];
    for (const [id, pattern] of Object.entries(CSS_PROBE_PATTERNS)) {
        if (pattern.test(stripped)) hits.push(id);
    }
    return hits;
}

// 假块 ID：格式对齐思源（14 位时间戳 + 7 位随机）；仅用于让
// `.protyle-wysiwyg [data-node-id].h1` 这类社区惯用选择器命中，语义即「块」。
const PROBE_NODE_IDS = [
    "20240101120000-1a2b3c4", "20240101120001-2b3c4d5", "20240101120002-3c4d5e6",
    "20240101120003-4d5e6f7", "20240101120004-5e6f7a8", "20240101120005-6f7a8b9",
    "20240101120006-7a8b9c0", "20240101120007-8b9c0d1", "20240101120008-9c0d1e2",
    "20240101120009-0d1e2f3", "20240101120010-a1b2c3d", "20240101120011-b2c3d4e",
    "20240101120012-c3d4e5f", "20240101120013-d4e5f6a", "20240101120014-e5f6a7b",
    "20240101120015-f6a7b8c", "20240101120016-a7b8c9d", "20240101120017-b8c9d0e",
];

function probeNodeId(index) {
    return PROBE_NODE_IDS[index % PROBE_NODE_IDS.length];
}

// 与真实思源文档结构对齐的最小块集合（data-node-id + data-type + data-subtype）。
// 容器同时挂 protyle-wysiwyg 与 b3-typography 两个类：社区片段对阅读区
// （.protyle-wysiwyg [data-node-id].h1）与导出/闪卡视图（.b3-typography h1）
// 两种惯用写法都必须命中——沙箱内合并是务实的近似，忠实性让位于可用性。
function buildSceneBody(scene, text, features = []) {
    const nid = (i) => ` data-node-id="${probeNodeId(i)}"`;
    const heading = `<div class="h1"${nid(0)} data-type="NodeHeading" data-subtype="h1"><div contenteditable="true">${text("title", "让灵感有自己的样子")}</div></div>`;
    const paragraph = `<div class="p"${nid(1)} data-type="NodeParagraph"><div contenteditable="true">${text("paragraph", "中文与 English 混排，1234567890。预览标题、正文与代码，观察你的样式如何改变阅读体验。")}</div></div>`;
    const quote = `<div class="bq"${nid(2)} data-type="NodeBlockquote"><div contenteditable="true">${text("quote", "先看效果，再决定是否启用。每一次调整都从可恢复的草稿开始。")}</div></div>`;
    const section = `<div class="h2"${nid(3)} data-type="NodeHeading" data-subtype="h2"><div contenteditable="true">${text("section", "一份清晰的工作记录")}</div></div>`;
    const inlineCode = `<div class="p"${nid(4)} data-type="NodeParagraph"><div contenteditable="true">${text("codeLabel", "行内代码")} <span data-type="code">const idea = "hello";</span></div></div>`;
    const table = `<div class="table"${nid(5)} data-type="NodeTable"><table><thead><tr><th>${text("item", "项目")}</th><th>${text("state", "状态")}</th><th>${text("progress", "进度")}</th></tr></thead><tbody><tr><td>${text("reading", "阅读")}</td><td>${text("ready", "就绪")}</td><td>80%</td></tr><tr><td>${text("writing", "写作")}</td><td>${text("draft", "草稿")}</td><td>40%</td></tr></tbody></table></div>`;
    const codeBlock = `<div class="code-block"${nid(6)} data-type="NodeCodeBlock"><div class="hljs">function greet(name) {\n  return 'Hello, ' + name;\n}</div></div>`;
    const demoButton = `<div class="p"${nid(7)} data-type="NodeParagraph"><button id="demo-button" type="button">${text("button", "交互测试按钮")}</button> <span id="demo-output"></span></div>`;
    const base = scene === "table"
        ? `${heading}${section}${table}${inlineCode}${codeBlock}`
        : scene === "controls"
            ? `<div class="h2"${nid(8)} data-type="NodeHeading" data-subtype="h2"><div contenteditable="true">${text("section", "界面控件")}</div></div>`
                + `<div class="p"${nid(9)} data-type="NodeParagraph"><button type="button">主要按钮</button> <button type="button" class="is-ghost">次要按钮</button> <button type="button" disabled>禁用按钮</button></div>`
                + `<div class="p"><label><input type="checkbox" checked> 启用</label> <label><input type="radio" name="demo" checked> 选项一</label> <label><input type="radio" name="demo"> 选项二</label></div>`
                + `<div class="p"><input type="text" placeholder="文本输入框"> <select><option>下拉选项</option></select></div>`
                + `<div class="p"><span class="demo-chip">标签</span> <span class="demo-chip is-accent">强调标签</span> <span class="demo-count">3</span></div>`
                + table + quote
            : `${heading}${paragraph}${quote}${section}${inlineCode}${table}${codeBlock}${demoButton}`;
    return base + buildProbeSection(features, text);
}

// 探针区块：只包含当前 CSS 命中的元素类型；无命中则整块省略（基础样例照旧）。
function buildProbeSection(features, text) {
    if (!features.length) return "";
    const nid = (i) => ` data-node-id="${probeNodeId(i + 8)}"`;
    const parts = [];
    let cursor = 0;
    if (features.includes("h3")) {
        parts.push(`<div class="h3"${nid(cursor++)} data-type="NodeHeading" data-subtype="h3"><div contenteditable="true">${text("probeH3", "三级标题探针")}</div></div>`);
    }
    if (features.includes("h4")) {
        parts.push(`<div class="h4"${nid(cursor++)} data-type="NodeHeading" data-subtype="h4"><div contenteditable="true">${text("probeH4", "四级标题探针")}</div></div>`);
    }
    if (features.includes("h5")) {
        parts.push(`<div class="h5"${nid(cursor++)} data-type="NodeHeading" data-subtype="h5"><div contenteditable="true">${text("probeH5", "五级标题探针")}</div></div>`);
    }
    if (features.includes("h6")) {
        parts.push(`<div class="h6"${nid(cursor++)} data-type="NodeHeading" data-subtype="h6"><div contenteditable="true">${text("probeH6", "六级标题探针")}</div></div>`);
    }
    if (features.includes("links")) {
        parts.push(`<div class="p"${nid(cursor++)} data-type="NodeParagraph"><div contenteditable="true">${text("probeLinksLead", "链接探针：")}<a href="#probe">${text("probeLinksAnchor", "访问思源笔记官网")}</a></div></div>`);
    }
    if (features.includes("lists")) {
        parts.push(`<div class="list"${nid(cursor++)} data-type="NodeList" data-subtype="o"><div class="li"${nid(cursor++)} data-type="NodeListItem" data-subtype="o"><div class="p" contenteditable="true">${text("probeListItem", "列表项探针")}</div></div><div class="li"${nid(cursor++)} data-type="NodeListItem" data-subtype="o"><div class="p" contenteditable="true">${text("probeListItem2", "第二项，观察列表样式")}</div></div></div>`);
    }
    if (features.includes("tasks")) {
        parts.push(`<div class="list"${nid(cursor++)} data-type="NodeList" data-subtype="t"><div class="li"${nid(cursor++)} data-type="NodeTaskListItem" data-subtype="t" data-done="true"><input type="checkbox" checked disabled> <div class="p" contenteditable="true">${text("probeTaskDone", "已完成任务探针")}</div></div><div class="li"${nid(cursor++)} data-type="NodeTaskListItem" data-subtype="t" data-done="false"><input type="checkbox" disabled> <div class="p" contenteditable="true">${text("probeTaskTodo", "待办任务探针")}</div></div></div>`);
    }
    if (features.includes("images")) {
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="120"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7c68d5"/><stop offset="1" stop-color="#4c8bd5"/></linearGradient></defs><rect width="320" height="120" rx="10" fill="url(#g)"/><circle cx="270" cy="36" r="20" fill="#ffffff" opacity="0.65"/></svg>`;
        parts.push(`<div class="p"${nid(cursor++)} data-type="NodeParagraph"><img src="data:image/svg+xml,${encodeURIComponent(svg)}" alt="${text("probeImageAlt", "图片探针")}" width="320" height="120"></div>`);
    }
    if (features.includes("marks")) {
        parts.push(`<div class="p"${nid(cursor++)} data-type="NodeParagraph"><div contenteditable="true"><strong>${text("probeStrong", "粗体")}</strong> <em>${text("probeEm", "斜体")}</em> <mark>${text("probeMark", "高亮")}</mark> <del>${text("probeDel", "删除线")}</del> <u>${text("probeU", "下划线")}</u> <kbd>${text("probeKbd", "Ctrl")}</kbd></div></div>`);
    }
    if (features.includes("tags")) {
        parts.push(`<div class="p"${nid(cursor++)} data-type="NodeParagraph"><div contenteditable="true"><span class="tag" data-type="tag">#${text("probeTagA", "写作")}</span> <span class="tag" data-type="tag">#${text("probeTagB", "阅读")}</span> <span class="tag" data-type="tag">#${text("probeTagC", "灵感")}</span></div></div>`);
    }
    if (!parts.length) return "";
    const probeHeading = `<div class="h2"${nid(cursor++)} data-type="NodeHeading" data-subtype="h2"><div contenteditable="true">${text("probeTitle", "按当前 CSS 追加的探针内容")}</div></div>`;
    const probeNote = `<div class="p"${nid(cursor++)} data-type="NodeParagraph"><div contenteditable="true" class="studio-probe-note">${text("probeNote", "以下元素由你的片段选择器命中，用于观察对应样式。")}</div></div>`;
    return probeHeading + probeNote + parts.join("");
}

function buildSnippetPreviewDocument({type = "css", content = "", dark = false, baseline = false, runJS = false, token = "", labels = {}, scene = "reading"} = {}) {
    const text = (key, fallback) => escapeHtml(labels[key] || fallback);
    const running = type === "js" && runJS && !baseline;
    const policy = `default-src 'none'; style-src 'unsafe-inline' data:; script-src ${running ? "data:" : "'none'"}; img-src data:; connect-src 'none'; font-src 'none'; media-src 'none'; object-src 'none'; frame-src 'none'; worker-src 'none'; base-uri 'none'; form-action 'none'`;
    // Data URL preserves CSS tokens exactly and prevents </style> HTML breakout.
    const css = type === "css" && !baseline ? `<link rel="stylesheet" href="data:text/css;charset=utf-8,${encodeURIComponent(content)}">` : "";
    const tokenText = JSON.stringify(String(token));
    const bootstrap = `addEventListener('error',e=>parent.postMessage({kind:'sw-snippet-preview',token:${tokenText},error:String(e.message).slice(0,200)},'*'));addEventListener('unhandledrejection',e=>parent.postMessage({kind:'sw-snippet-preview',token:${tokenText},error:String(e.reason).slice(0,200)},'*'));`;
    const script = running ? `<script src="data:text/javascript;charset=utf-8,${encodeURIComponent(bootstrap)}"></script><script src="data:text/javascript;charset=utf-8,${encodeURIComponent(content)}"></script>` : "";
    // CSS 预览按片段选择器追加探针内容（baseline 对比视图保持原始样例，不探针）。
    const features = type === "css" && !baseline ? analyzeCssCoverage(content) : [];
    return `<!doctype html><html lang="${text("lang", "zh-CN")}" data-theme-mode="${dark ? "dark" : "light"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${escapeHtml(policy)}"><style>
:root{color-scheme:${dark ? "dark" : "light"};--b3-theme-background:${dark ? "#20242c" : "#fff"};--b3-theme-on-background:${dark ? "#e2e8f0" : "#253146"};--b3-theme-primary:#7c68d5;--b3-theme-primary-lightest:#ece8fa;--b3-theme-surface:${dark ? "#2a303c" : "#f5f6fa"};--b3-border-color:${dark ? "#414958" : "#dce1ea"};--b3-font-family:system-ui,sans-serif;--b3-font-family-code:monospace}
*{box-sizing:border-box}body{margin:0;background:var(--b3-theme-background);color:var(--b3-theme-on-background);font-family:var(--b3-font-family);font-size:15px}.studio-demo-bar{padding:12px 24px;border-bottom:1px solid var(--b3-border-color);display:flex;gap:18px;font-size:12px;color:var(--b3-theme-primary)}.studio-probe-note{color:var(--b3-theme-primary);font-size:12px}.protyle-wysiwyg{max-width:820px;margin:auto;padding:24px 32px;line-height:1.6}.h1{font-size:27px;font-weight:700}.h2{font-size:19px;font-weight:650;margin-top:16px}.h3{font-size:17px;font-weight:650;margin-top:14px}.h4,.h5,.h6{font-size:15.5px;font-weight:650;margin-top:12px}.p{margin:12px 0}blockquote,.bq{border-left:3px solid var(--b3-theme-primary);padding:8px 16px;margin:16px 0;background:var(--b3-theme-surface)}.list{margin:12px 0;padding-left:24px}.list .li{margin:6px 0;list-style:disc}table{border-collapse:collapse;width:100%}td,th{padding:8px 12px;border:1px solid var(--b3-border-color);text-align:left}[data-type="code"]{font-family:var(--b3-font-family-code);background:var(--b3-theme-surface);padding:2px 5px;border-radius:4px}.code-block{font-family:var(--b3-font-family-code);background:var(--b3-theme-surface);padding:14px;border-radius:8px;white-space:pre-wrap}button{font:inherit;padding:6px 14px;cursor:pointer}.demo-chip{display:inline-block;padding:2px 10px;border-radius:999px;background:var(--b3-theme-surface);border:1px solid var(--b3-border-color);font-size:12px}.demo-chip.is-accent{background:var(--b3-theme-primary-lightest);color:var(--b3-theme-primary);border-color:transparent}.demo-count{display:inline-block;min-width:20px;text-align:center;padding:1px 6px;border-radius:999px;background:var(--b3-theme-error);color:#fff;font-size:12px}input,select{font:inherit;padding:5px 10px;border:1px solid var(--b3-border-color);border-radius:6px;background:var(--b3-theme-background);color:var(--b3-theme-on-background)}img{max-width:100%;border-radius:8px}kbd{font-family:var(--b3-font-family-code);border:1px solid var(--b3-border-color);border-bottom-width:2px;border-radius:4px;padding:0 5px;font-size:12px}a{color:var(--b3-theme-primary)}
</style>${css}</head><body><div class="studio-demo-bar"><span>SiYuan</span><span>${text("sample", "演示文档 · 不读取个人笔记")}</span></div><div class="protyle"><div class="protyle-wysiwyg b3-typography protyle-wysiwyg--attr" spellcheck="false">${buildSceneBody(normalizePreviewScene(scene), text, features)}</div></div>${script}</body></html>`;
}

function createSnippetPreview(container, {title, labels, onError = () => {}, onReady = () => {}} = {}) {
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
            const nextFrame = doc.createElement("iframe");
            nextFrame.addEventListener("load", () => {
                if (!disposed && frame === nextFrame) onReady();
            }, {once: true});
            frame = nextFrame;
            token = `${Date.now()}-${Math.random()}`;
            frame.title = title || "Snippet preview";
            frame.referrerPolicy = "no-referrer";
            frame.setAttribute("sandbox", options.type === "js" && options.runJS && !options.baseline ? "allow-scripts" : "");
            frame.setAttribute("allow", "camera 'none'; microphone 'none'; geolocation 'none'; clipboard-read 'none'; clipboard-write 'none'");
            // T-6960：宽度档位——容器容不下所选档位时回退单视图（100%）
            const fixedWidth = resolvePreviewWidth(options.width, container.clientWidth);
            if (fixedWidth > 0) {
                nextFrame.style.width = `${fixedWidth}px`;
                nextFrame.style.margin = "0 auto";
                nextFrame.style.display = "block";
            }
            frame.srcdoc = buildSnippetPreviewDocument({...options, scene: options.scene, labels, token});
            container.replaceChildren(frame);
        },
        dispose() { disposed = true; frame?.remove(); frame = null; win.removeEventListener("message", handleMessage); },
    };
}

module.exports = {SNIPPET_PREVIEW_SCENES, SNIPPET_PREVIEW_WIDTHS, normalizePreviewScene, resolvePreviewWidth, analyzeCssCoverage, stripCssNoise, buildSnippetPreviewDocument, createSnippetPreview};
