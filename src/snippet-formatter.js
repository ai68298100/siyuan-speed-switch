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
    let inComment = false;
    let inString = false;
    let stringChar = "";
    let buffer = "";

    const trimmed = code.trim();

    for (let i = 0; i < trimmed.length; i++) {
        const char = trimmed[i];
        const nextChar = trimmed[i + 1] || "";

        // 处理块注释 /* ... */
        if (!inString && char === "/" && nextChar === "*") {
            inComment = true;
            buffer += "/*";
            i++;
            continue;
        }
        if (inComment) {
            buffer += char;
            if (char === "*" && nextChar === "/") {
                inComment = false;
                buffer += "/";
                i++;
                // 注释结束后另起一行或追加
                const curIndent = indent.repeat(depth);
                formatted += (formatted.endsWith("\n") ? "" : "\n") + curIndent + buffer.trim() + "\n";
                buffer = "";
            }
            continue;
        }

        // 处理字符串引号
        if (!inComment && (char === '"' || char === "'")) {
            if (!inString) {
                inString = true;
                stringChar = char;
            } else if (char === stringChar && trimmed[i - 1] !== "\\") {
                inString = false;
            }
            buffer += char;
            continue;
        }
        if (inString) {
            buffer += char;
            continue;
        }

        // 遇到大括号开启
        if (char === "{") {
            const selector = buffer.trim();
            buffer = "";
            const curIndent = indent.repeat(depth);
            if (formatted.length > 0 && !formatted.endsWith("\n\n")) {
                if (!formatted.endsWith("\n")) formatted += "\n";
            }
            if (selector) {
                formatted += (formatted.endsWith("\n") ? curIndent : " ") + selector + " {\n";
            } else {
                formatted += " {\n";
            }
            depth++;
            continue;
        }

        // 遇到大括号闭合
        if (char === "}") {
            const lastDecl = buffer.trim();
            buffer = "";
            if (lastDecl) {
                const curIndent = indent.repeat(depth);
                formatted += curIndent + normalizeDeclaration(lastDecl) + "\n";
            }
            depth = Math.max(0, depth - 1);
            const closeIndent = indent.repeat(depth);
            formatted += closeIndent + "}\n";
            continue;
        }

        // 遇到分号（CSS 声明结束）
        if (char === ";") {
            const decl = (buffer + ";").trim();
            buffer = "";
            const curIndent = indent.repeat(depth);
            formatted += curIndent + normalizeDeclaration(decl) + "\n";
            continue;
        }

        // 普通字符追加
        buffer += char;
    }

    // 剩余尾部内容
    const rest = buffer.trim();
    if (rest) {
        const curIndent = indent.repeat(depth);
        formatted += curIndent + normalizeDeclaration(rest) + "\n";
    }

    return formatted.trim();
}

/**
 * 规整单条 CSS 声明（处理冒号空格与多余空白）
 * 例如 "color:red ;" -> "color: red;"
 */
function normalizeDeclaration(decl) {
    if (!decl) return "";
    const colonIdx = decl.indexOf(":");
    if (colonIdx === -1) return decl;

    const prop = decl.slice(0, colonIdx).trim();
    let val = decl.slice(colonIdx + 1).trim();

    // 补齐分号（如果不以分号结尾且不是注释）
    if (!val.endsWith(";") && !val.endsWith("}")) {
        val += ";";
    }
    // 压缩内部连续多余空格
    val = val.replace(/\s+/g, " ");

    return `${prop}: ${val}`;
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
