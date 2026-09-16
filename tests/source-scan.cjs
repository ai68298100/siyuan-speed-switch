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

// 读取源码并做扫描前处理：CRLF 归一 + 剥注释。
// 归一换行的原因：本仓 CRLF/LF 混用，按 `\n` 锚定的断言会因 CRLF 静默失配。
function readSourceText(filePath) {
    return stripComments(fs.readFileSync(filePath, "utf8").replace(/\r\n/g, "\n"));
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

module.exports = {stripComments, readSourceText};
