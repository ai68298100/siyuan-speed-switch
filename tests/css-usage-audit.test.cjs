/**
 * CSS 死类审计门禁（2026-09-14）
 *
 * 从编译产物 dist/index.css 提取全部 sw 前缀类名，断言每个类名都能在
 * src/tests 语料（含动态拼接前缀）中找到出处。2026-09-14 基线：343/343
 * 全部在用、白名单为空；新增样式必须同步有真实消费方，防止归档里的
 * index.css（约 1/3 包体）无声膨胀。
 */
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const cssPath = path.join(root, 'dist', 'index.css');
// 允许确需保留的类名（如宿主主题约定的预留钩子）；当前为空。
const ALLOWED_UNUSED = [];

function collectCorpus() {
    let corpus = '';
    for (const dir of ['src', 'tests']) {
        const walk = (current) => {
            for (const entry of fs.readdirSync(current, {withFileTypes: true})) {
                const full = path.join(current, entry.name);
                if (entry.isDirectory()) {
                    if (entry.name === 'node_modules' || entry.name === 'fixtures') continue;
                    walk(full);
                } else if (/\.(ts|js|cjs|scss|css|json|html)$/.test(entry.name)) {
                    corpus += fs.readFileSync(full, 'utf8');
                }
            }
        };
        walk(path.join(root, dir));
    }
    return corpus;
}

test('every sw class in the compiled stylesheet has a source consumer', () => {
    if (!fs.existsSync(cssPath)) return; // 与其他产物审计一致:无构建产物时跳过
    const css = fs.readFileSync(cssPath, 'utf8');
    const names = new Set();
    for (const match of css.matchAll(/\.((?:sw)[-a-zA-Z0-9_]+)/g)) {
        names.add(match[1]);
    }
    assert.ok(names.size >= 200, `only ${names.size} sw classes found in index.css; extraction may be broken`);
    const corpus = collectCorpus();
    const unused = [...names].filter((name) => {
        if (corpus.includes(name) || ALLOWED_UNUSED.includes(name)) return false;
        // 动态后缀拼接（如 `sw-home-config-${name}`）按前缀家族放行
        const family = name.replace(/-[^-]+$/, '-');
        return !(family.endsWith('-') && corpus.includes(family));
    });
    assert.deepEqual(unused, [],
        `index.css contains ${unused.length} class(es) with no source consumer; remove them or allowlist:\n`
        + unused.map((name) => `  .${name}`).join('\n'));
});
