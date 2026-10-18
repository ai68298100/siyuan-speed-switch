// 零依赖超轻量代码片段格式化器 (Snippet Formatter)
// 设计目标：吸收 TCOTC/snippets Prettier 代码排版理念，同时彻底消灭 200KB+ 的 Prettier 重型依赖，
// 严格坚守小驴雷切 578 KiB 仓库包体门禁。
// 支持 CSS 与基础 JS 代码规范缩进、大括号展开、多声明分行、分号规整与光标偏移映射（formatWithCursor）。

const DEFAULT_INDENT = "  ";

/**
 * 格式化 CSS 代码文本
 * @param {string} code 待格式化的 CSS 代码
 * @param {{ indent?: string }} [options] 格式化选项
 * @returns {string} 格式化后的 CSS
 */
function formatCss(code, { indent = DEFAULT_INDENT } = {}) {
    if (!code || typeof code !== "string") return "";

    let formatted = "";
    let depth = 0;
    let inString = false;
    let stringChar = "";
    let escaped = false;
    let parenDepth = 0;
    let buffer = "";

    const trimmed = code.trim();

    const appendLine = (line, lineDepth = depth) => {
        const value = String(line || "").trim();
        if (!value) return;
        formatted += `${indent.repeat(Math.max(0, lineDepth))}${value}\n`;
    };

    const flushDeclaration = (withSemicolon = false) => {
        const value = buffer.trim();
        buffer = "";
        if (!value) return;
        const declaration = withSemicolon && !value.endsWith(";") ? `${value};` : value;
        appendLine(normalizeDeclaration(declaration));
    };

    for (let i = 0; i < trimmed.length; i++) {
        const char = trimmed[i];
        const nextChar = trimmed[i + 1] || "";

        // 处理块注释 /* ... */。注释放在行首时单独成行；落在声明中时
        // 保留在声明值里，避免 `color:red /* c */;` 被拆成伪声明。
        if (!inString && char === "/" && nextChar === "*") {
            const end = trimmed.indexOf("*/", i + 2);
            const comment = end < 0 ? trimmed.slice(i) : trimmed.slice(i, end + 2);
            if (buffer.trim()) buffer += comment;
            else appendLine(comment);
            i = end < 0 ? trimmed.length : end + 1;
            continue;
        }

        // 处理字符串引号
        if (char === '"' || char === "'") {
            if (!inString) {
                inString = true;
                stringChar = char;
                escaped = false;
            } else if (char === stringChar && !escaped) {
                inString = false;
                stringChar = "";
            }
            buffer += char;
            escaped = inString && char === "\\" && !escaped;
            continue;
        }
        if (inString) {
            buffer += char;
            escaped = char === "\\" && !escaped;
            continue;
        }

        // 括号内的分号属于值（尤其是 data URI），不能结束 CSS 声明。
        if (char === "(") parenDepth++;
        else if (char === ")") parenDepth = Math.max(0, parenDepth - 1);

        // 遇到大括号开启
        if (char === "{" && parenDepth === 0) {
            const selector = buffer.trim();
            buffer = "";
            if (selector) appendLine(`${selector} {`);
            else appendLine("{");
            depth++;
            continue;
        }

        // 遇到大括号闭合
        if (char === "}" && parenDepth === 0) {
            flushDeclaration();
            depth = Math.max(0, depth - 1);
            appendLine("}");
            continue;
        }

        // 遇到分号（CSS 声明结束）
        if (char === ";" && parenDepth === 0) {
            flushDeclaration(true);
            continue;
        }

        // 普通字符追加
        buffer += char;
    }

    // 剩余尾部内容
    flushDeclaration();

    return formatted.trim();
}

/**
 * 规整单条 CSS 声明（处理冒号空格与多余空白）
 * 例如 "color:red ;" -> "color: red;"
 */
function normalizeDeclaration(decl) {
    if (!decl) return "";
    const colonIdx = findTopLevelColon(decl);
    if (colonIdx === -1) return decl;

    const prop = decl.slice(0, colonIdx).trim();
    let val = decl.slice(colonIdx + 1).trim();

    // 补齐分号（如果不以分号结尾且不是注释）
    if (!val.endsWith(";") && !val.endsWith("}")) {
        val += ";";
    }
    // 压缩普通空白，但保留字符串与注释中的字节。否则
    // `content: "a   b"` 会被静默改写，data URI/正则字面量也会损坏。
    val = collapseCssWhitespace(val);

    return `${prop}: ${val}`;
}

function findTopLevelColon(value) {
    let parenDepth = 0;
    let inString = false;
    let stringChar = "";
    let escaped = false;
    let inComment = false;
    for (let i = 0; i < value.length; i++) {
        const char = value[i];
        const next = value[i + 1] || "";
        if (inComment) {
            if (char === "*" && next === "/") {
                inComment = false;
                i++;
            }
            continue;
        }
        if (!inString && char === "/" && next === "*") {
            inComment = true;
            i++;
            continue;
        }
        if (char === '"' || char === "'") {
            if (!inString) {
                inString = true;
                stringChar = char;
                escaped = false;
            } else if (char === stringChar && !escaped) {
                inString = false;
                stringChar = "";
            }
            escaped = inString && char === "\\" && !escaped;
            continue;
        }
        if (inString) {
            escaped = char === "\\" && !escaped;
            continue;
        }
        if (char === "(") parenDepth++;
        else if (char === ")") parenDepth = Math.max(0, parenDepth - 1);
        else if (char === ":" && parenDepth === 0) return i;
    }
    return -1;
}

function collapseCssWhitespace(value) {
    let output = "";
    let inString = false;
    let stringChar = "";
    let escaped = false;
    let inComment = false;
    let pendingSpace = false;
    const appendPendingSpace = (nextChar) => {
        if (pendingSpace && output && !/[([{]$/.test(output) && !/[,;)]}]$/.test(nextChar)) output += " ";
        pendingSpace = false;
    };
    for (let i = 0; i < value.length; i++) {
        const char = value[i];
        const next = value[i + 1] || "";
        if (inComment) {
            output += char;
            if (char === "*" && next === "/") {
                output += "/";
                i++;
                inComment = false;
            }
            continue;
        }
        if (!inString && char === "/" && next === "*") {
            appendPendingSpace(char);
            output += "/*";
            i++;
            inComment = true;
            continue;
        }
        if (char === '"' || char === "'") {
            if (!inString) {
                appendPendingSpace(char);
                inString = true;
                stringChar = char;
                escaped = false;
            } else if (char === stringChar && !escaped) {
                inString = false;
                stringChar = "";
            }
            output += char;
            escaped = inString && char === "\\" && !escaped;
            continue;
        }
        if (inString) {
            output += char;
            escaped = char === "\\" && !escaped;
            continue;
        }
        if (/\s/.test(char)) {
            pendingSpace = true;
            continue;
        }
        appendPendingSpace(char);
        output += char;
    }
    return output.trim();
}

/**
 * 仿照 Prettier 的 formatWithCursor：
 * 在格式化代码的同时，将原始光标偏移值平滑映射到格式化后的文本对应位置
 * @param {string} code 原始代码
 * @param {number} cursorOffset 原始光标位置 (0-based)
 * @param {"css" | "js"} [type="css"] 代码类型
 * @param {{ indent?: string }} [options] 选项
 * @returns {{ formatted: string, cursorOffset: number }}
 */
function formatWithCursor(code, cursorOffset = 0, type = "css", options = {}) {
    if (!code || typeof code !== "string") {
        return { formatted: "", cursorOffset: 0 };
    }

    // 计算原始光标前有多少个非空白字符
    const safeOffset = Math.max(0, Math.min(code.length, cursorOffset));
    const prefix = code.slice(0, safeOffset);
    const nonWsCount = prefix.replace(/\s/g, "").length;

    // 执行格式化
    const formatted = type === "css" ? formatCss(code, options) : code.trim();

    // 在格式化后的文本中，寻找对应数量非空白字符之后的位置
    if (nonWsCount === 0) {
        return { formatted, cursorOffset: 0 };
    }

    let seenNonWs = 0;
    let mappedOffset = formatted.length;

    for (let i = 0; i < formatted.length; i++) {
        if (!/\s/.test(formatted[i])) {
            seenNonWs++;
            if (seenNonWs === nonWsCount) {
                mappedOffset = i + 1;
                break;
            }
        }
    }

    return {
        formatted,
        cursorOffset: mappedOffset
    };
}

module.exports = {
    formatCss,
    formatWithCursor,
    normalizeDeclaration
};
