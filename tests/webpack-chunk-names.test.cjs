// T-7018：多 chunk 稳定命名契约——每个相对路径动态导入必须携带唯一且文件系统
// 安全的 webpackChunkName 魔法注释；无注释的 chunk 在生产 chunkIds=deterministic
// 下会得到数字名（不可登记、不可审计）。
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const SRC = path.join(__dirname, "..", "src");

function listSourceFiles(dir, out = []) {
    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) listSourceFiles(full, out);
        else if (/\.(ts|js)$/.test(entry.name)) out.push(full);
    }
    return out;
}

// 仅运行时相对动态导入；import("siyuan") 类类型位置引用与包名导入不在约束内。
// 允许 import( 与路径引号之间出现一个块注释（webpackChunkName 魔法注释的载体）。
const IMPORT_RE = /import\(\s*(?:\/\*[\s\S]*?\*\/\s*)?(["'])\.\.?\/[^"']*\1/g;
const NAME_RE = /webpackChunkName:\s*["']([^"']+)["']/;

test("every relative dynamic import carries a unique, filesystem-safe chunk name", () => {
    const names = new Map();
    let importCount = 0;
    for (const file of listSourceFiles(SRC)) {
        const source = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
        const relative = path.relative(SRC, file).split(path.sep).join("/");
        for (const match of source.matchAll(IMPORT_RE)) {
            importCount++;
            const window = source.slice(Math.max(0, match.index - 200), match.index + match[0].length + 50);
            const nameMatch = window.match(NAME_RE);
            assert.ok(nameMatch, `${relative}: 动态导入必须携带 webpackChunkName 魔法注释（deterministic chunkIds 下无名 chunk 得数字名）`);
            const name = nameMatch[1];
            assert.match(name, /^[A-Za-z][A-Za-z0-9_-]*$/, `${relative}: chunk 名必须文件系统安全`);
            assert.ok(!names.has(name), `chunk 名必须唯一：${name} 已被 ${names.get(name)} 使用`);
            names.set(name, relative);
        }
    }
    assert.ok(importCount >= 1, `检查面非空自检：至少一个动态导入，实测 ${importCount}`);
    assert.ok(names.has("snippet-studio"), "既有工作室 chunk 必须保持 snippet-studio 名（发布契约）");
});
