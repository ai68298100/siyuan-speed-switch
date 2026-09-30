// T-7173：缩略图 HTML 有界净化契约（源码扫描 + 检测器自检负向验证）。
const test = require('node:test');
const assert = require('node:assert/strict');
const {readSourceFile} = require('./source-scan.cjs');

const index = readSourceFile('src/index.ts');

test('sanitizer exists with the inert-parser whitelist design (T-7173)', () => {
    assert.match(index, /private sanitizeThumbHtml\(html: string\): DocumentFragment \| null \{/, '净化函数必须存在');
    assert.match(index, /new DOMParser\(\)\.parseFromString\(html, "text\/html"\)/, '必须走 inert DOMParser（不加载资源不触发事件）');
    assert.match(index, /typeof DOMParser !== "function"/, '极旧 WebView 能力检测（降级为占位）');
    for (const tag of ['"script"', '"iframe"', '"object"', '"embed"', '"form"']) {
        assert.ok(index.includes(tag), `剥离清单必须含 ${tag}`);
    }
});

test('all three thumbnail mounts are sanitized (T-7173)', () => {
    // 历史三处 innerHTML 挂载：缓存命中×2（fillThumbByApi 前置 + renderThumbnails 批量）+ getDoc 回源
    assert.doesNotMatch(index, /wrap\.innerHTML = (cached\.html|html);/, '缩略图挂载不得再用 innerHTML 解析（三处全部）');
    const mounts = [...index.matchAll(/const fragment = this\.sanitizeThumbHtml\((cached\.html|html)\)/g)].length;
    assert.equal(mounts, 3, `净化消费点必须恰为三处（实际 ${mounts}）`);
});

test('stripped attribute classes are enforced in the walker (T-7173)', () => {
    const fnStart = index.indexOf('private sanitizeThumbHtml');
    const body = index.slice(fnStart, index.indexOf('private applyThumbContent', fnStart));
    assert.match(body, /name\.startsWith\("on"\)/, '事件属性必须剥离');
    assert.match(body, /name === "style" \|\| name === "srcset"/, 'style/srcset 必须剥离');
    assert.match(body, /value\.startsWith\("javascript:"\) \|\| value\.startsWith\("data:text"\)/, '危险协议必须剥离');
});

test('detector self-check: bare innerHTML mount is caught (negative verification)', () => {
    const legacy = 'wrap.innerHTML = cached.html;';
    assert.match(legacy, /wrap\.innerHTML = cached\.html;/, '历史挂载形态必须可被识别');
    const sanitized = 'wrap.appendChild(fragment);';
    assert.doesNotMatch(sanitized, /innerHTML/, '净化形态不报');
});
