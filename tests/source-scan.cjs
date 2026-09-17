// 测试辅助：源码扫描前的注释剥离（非测试文件，不被 run-tests 发现）。
//
// 为什么需要它：大量契约门禁靠"源码里必须出现某段调用文本"来证明宿主接线。
// 但 raw 源码里的注释同样包含文本——把调用注释掉、或在注释里写下同样的调用，
// 断言就会通过，门禁变成假绿（本仓 2026-09-16 就踩到过这条）。
//
// 朴素做法（`/^[ \t]*\/\/.*$/gm` 这类正则）有两个毛病：
//   1. 只处理整行注释，漏掉行尾注释（`code; // const x = f()`）；
//   2. 会误伤字符串字面量，例如 `"https://example.com"` 会被从 `//` 处截断。
// 因此这里按引号状态逐字符扫描：跨过字符串内部的 `//` 与 `/*`，字符串外才当作注释。
//
// 已知边界：不做完整的 JS 词法分析——正则字面量（如 `/a\/\/b/`）与模板字符串
// `${}` 内部若出现 `//` 可能被误判为注释。本仓源码未使用这两种形态；如果将来
// 引入，本函数需要同步升级为真正的 tokenizer，否则门禁可能出现假阴（过度剥离）。
//
// 用法边界（重要）：本助手只用于 **源码**（`src/**.ts` / `.js` / `.scss`）。
// 不要用它读 Markdown —— `docs/*.md` 里存在裸 URL（如 `| [X](https://github.com/…) |`），
// 不在引号或反引号内，按 JS 词法会被当作行注释截断，造成扫描数据丢失。
const fs = require("node:fs");
const path = require("node:path");

// ---- 样式组合视图（P1-2，ADR 0049）-------------------------------------
// src/index.scss 已拆为顺序切片（顺序即层叠顺序），本体退化为 @use 清单。
// 但既有 35 处契约断言是按"单文件样式"写的，若直接读清单会集体失效。
// 这里按清单顺序把切片重组为单一视图（剔除 @use 行），使组合结果
// **逐字节等于拆分前的原文件**——断言锚点一个都不需要改，强度也不降低。
const STYLE_MANIFEST = "src/index.scss";
const STYLE_MANIFEST_ABS = path.resolve(__dirname, "..", STYLE_MANIFEST);

function readStyleSource() {
    const root = path.resolve(__dirname, "..");
    const manifest = fs.readFileSync(path.join(root, STYLE_MANIFEST), "utf8");
    const refs = [];
    const refRe = /@use\s+"([^"]+)"/g;
    let match = refRe.exec(manifest);
    while (match) {
        refs.push(match[1]);
        match = refRe.exec(manifest);
    }
    if (!refs.length) {
        throw new Error("style manifest has no @use entries; refusing to return an empty view");
    }
    let out = "";
    for (const ref of refs) {
        const segments = ref.split("/");
        const base = segments[segments.length - 1];
        const dir = segments.slice(0, -1).join("/");
        const file = path.join(root, "src", dir, "_" + base + ".scss");
        const content = fs.readFileSync(file, "utf8");
        const kept = content.split(/\r?\n/).filter((line) => !/^\s*@use\s/.test(line));
        out += kept.join("\n") + "\n";
    }
    return out;
}

// 读取源码并做扫描前处理：CRLF 归一 + 剥注释。
// 归一换行的原因：本仓 CRLF/LF 混用，按 `\n` 锚定的断言会因 CRLF 静默失配。
function readSourceText(filePath) {
    if (path.resolve(filePath) === STYLE_MANIFEST_ABS) {
        return stripComments(readStyleSource().replace(/\r\n/g, "\n"));
    }
    return stripComments(fs.readFileSync(filePath, "utf8").replace(/\r\n/g, "\n"));
}

// 相对仓库根的读取入口，供 tests/ 下的契约测试使用（`readSourceFile('src/index.scss')`）。
// 与 readSourceText 的差别是**限定源码扩展名**：这不是洁癖，而是给
// `tests/source-scan-coverage.test.cjs` 的"裸读登记"留一条不会烂的出口——
// 该门禁把 `fs.readFileSync(path.join(..., 'src', ...))` 视作待登记项，迁移到本入口的
// 文件才算真正还清债；若本函数对任意路径都放行，它就只是换了个写法的后门，
// 读 JSON/Markdown 的理由（json-data / doc-comment-contract）也就无处登记了。
const SOURCE_EXTENSIONS = new Set([".ts", ".js", ".cjs", ".mjs", ".scss", ".css"]);

function readSourceFile(relativePath) {
    const extension = path.extname(relativePath).toLowerCase();
    if (!SOURCE_EXTENSIONS.has(extension)) {
        throw new Error(
            `readSourceFile() only reads source files (${[...SOURCE_EXTENSIONS].join(", ")}), got: ${relativePath}`,
        );
    }
    return readSourceText(path.resolve(__dirname, "..", relativePath));
}

function stripComments(source) {
    let out = "";
    let quote = null;
    for (let index = 0; index < source.length; index += 1) {
        const char = source[index];
        const next = source[index + 1];
        if (quote) {
            out += char;
            if (char === "\\") {
                out += next === undefined ? "" : next;
                index += 1;
                continue;
            }
            if (char === quote) quote = null;
            continue;
        }
        if (char === '"' || char === "'" || char === "`") {
            quote = char;
            out += char;
            continue;
        }
        if (char === "/" && next === "/") {
            while (index < source.length && source[index] !== "\n") index += 1;
            out += "\n";
            continue;
        }
        if (char === "/" && next === "*") {
            index += 2;
            while (index < source.length && !(source[index] === "*" && source[index + 1] === "/")) index += 1;
            index += 1;
            continue;
        }
        out += char;
    }
    return out;
}

module.exports = {stripComments, readSourceText, readSourceFile, readStyleSource};
