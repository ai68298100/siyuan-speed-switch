// T-7198：自定义属性重复定义门禁。
// 缺陷模式：同一花括号块内同一 --sw-* 变量定义两次（var() 回退 + color-mix
// 增强）。自定义属性不做解析期校验，裸写后值会静默覆盖回退——不支持
// color-mix 的 WebView 在使用点整体失效而不是落到回退定义。
// 修复合同：color-mix 增强必须包 @supports；块级检测器对"同块同名变量且
// 其间未开启 @supports"精确失败。不同选择器块的同名变量属正常级联，不报。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const styleDir = path.resolve(__dirname, '..', 'src', 'styles');

// 返回 [[varName, depth, inSupports, lineNo], ...]。按花括号深度分块追踪，
// 每个块体维护独立 Set（兄弟块同名变量不算重复）。
function findDuplicateVarDefinitions(source) {
    const hits = [];
    const stack = [new Map()]; // 每层块：varName -> 首次出现行号
    const supportsStack = [false];
    let inBlockComment = false;
    const lines = source.split(/\r?\n/);
    lines.forEach((rawLine, i) => {
        let line = rawLine;
        if (inBlockComment) {
            const end = line.indexOf('*/');
            if (end === -1) return;
            line = line.slice(end + 2);
            inBlockComment = false;
        }
        line = line.replace(/\/\*[\s\S]*?\*\//g, '');
        if (line.includes('/*')) { inBlockComment = true; line = line.slice(0, line.indexOf('/*')); }
        const hasSupports = /@supports/.test(line);
        for (const ch of line) {
            if (ch === '{') { stack.push(new Map()); supportsStack.push(hasSupports || supportsStack[supportsStack.length - 1]); }
            else if (ch === '}') { stack.pop(); supportsStack.pop(); }
        }
        const m = line.match(/^\s*(--[\w-]+)\s*:/);
        if (m) {
            const scope = stack[stack.length - 1];
            if (scope.has(m[1]) && !supportsStack[supportsStack.length - 1]) {
                hits.push({name: m[1], line: i + 1, firstLine: scope.get(m[1])});
            } else if (!scope.has(m[1])) {
                scope.set(m[1], i + 1);
            }
        }
    });
    return hits;
}

test('detector self-check: same-block duplicate without @supports is caught (negative verification)', () => {
    const vulnerable = '.root {\n  --x-page: var(--b3-background);\n  --x-page: color-mix(in srgb, red, blue);\n}';
    assert.equal(findDuplicateVarDefinitions(vulnerable).length, 1, '同块裸重复必须命中');
    const guarded = '.root {\n  --x-page: var(--b3-background);\n  @supports (background: color-mix(in srgb, red, blue)) {\n    --x-page: color-mix(in srgb, red, blue);\n  }\n}';
    assert.equal(findDuplicateVarDefinitions(guarded).length, 0, '@supports 包裹的增强不报');
    const siblings = '.a {\n  --x-page: red;\n}\n.b {\n  --x-page: blue;\n}';
    assert.equal(findDuplicateVarDefinitions(siblings).length, 0, '兄弟块同名变量属正常级联，不报');
});

test('no same-block custom property duplicates outside @supports in any style slice', () => {
    const files = fs.readdirSync(styleDir).filter((f) => f.endsWith('.scss'));
    for (const f of files) {
        const source = fs.readFileSync(path.join(styleDir, f), 'utf8');
        const hits = findDuplicateVarDefinitions(source);
        assert.deepEqual(hits, [], `${f}: 同块内裸重复定义自定义属性（${hits.map((h) => `${h.name}@${h.line}`).join(', ')}）——color-mix 增强必须包 @supports（T-7198）`);
    }
});
