// T-6950：预览内查找纯模块——DOM 安全命中标记（零 HTML 拼接）、循环、滚动钳制。
const test = require('node:test');
const assert = require('node:assert/strict');
const {JSDOM} = require('jsdom');
const {HIT_CLASS, applyPreviewFind, clearPreviewFind, nextHitIndex, clampScrollTop} = require('../src/doc-preview-find.js');

function withDom(bodyHtml, fn) {
    const dom = new JSDOM(`<!doctype html><body><div id="body">${bodyHtml}</div></body>`);
    const root = dom.window.document.getElementById('body');
    const before = root.innerHTML;
    const result = fn(dom.window.document, root);
    const after = root.innerHTML;
    dom.window.close();
    return {before, after, ...result};
}

test('find highlights CJK and latin matches case-insensitively, counting every hit', () => {
    withDom('<p>工作上下文与工作台</p><p>Word work WORK</p>', (doc, root) => {
        assert.equal(applyPreviewFind(root, '工作'), 2, '中文两处命中');
        assert.equal(root.querySelectorAll(`mark.${HIT_CLASS}`).length, 2);
        assert.equal(applyPreviewFind(root, 'work'), 2, '大小写不敏感两处（Word 不含 work）');
        assert.deepEqual([...root.querySelectorAll(`mark.${HIT_CLASS}`)].map(m => m.textContent),
            ['work', 'WORK']);
    });
});

test('find treats regex metacharacters literally and rejects empty queries', () => {
    withDom('<p>a.c axc a(c)</p>', (doc, root) => {
        assert.equal(applyPreviewFind(root, 'a.c'), 1, '点号按字面匹配，不得吞掉 axc');
        assert.equal(applyPreviewFind(root, 'a(c'), 1);
        assert.equal(applyPreviewFind(root, '   '), 0, '空白查询只清除');
        assert.equal(applyPreviewFind(root, ''), 0);
        assert.equal(root.querySelectorAll(`mark.${HIT_CLASS}`).length, 0);
    });
});

test('find restores the exact original structure after clearing', () => {
    const html = '<h3>标题 Title</h3><section><h4>正文摘录</h4><p>第一段 common 文本</p><ul><li>列表 common 行</li></ul></section>';
    const {before, after} = withDom(html, (doc, root) => {
        assert.equal(applyPreviewFind(root, 'common'), 2);
        assert.ok(root.querySelector('mark'));
        clearPreviewFind(root);
        assert.equal(root.querySelector('mark'), null, '清除后不得残留命中标记');
    });
    assert.equal(after, before, '清除后 innerHTML 必须与查找前逐字节一致');
});

test('find keeps element structure intact while highlighting inside text nodes', () => {
    withDom('<section><p>alpha beta alpha</p></section>', (doc, root) => {
        applyPreviewFind(root, 'alpha');
        const marks = [...root.querySelectorAll(`mark.${HIT_CLASS}`)];
        assert.equal(marks.length, 2);
        assert.equal(marks[0].closest('section'), root.firstElementChild, 'mark 留在原文本节点位置');
        assert.equal(root.querySelector('p').textContent, 'alpha beta alpha', '可见文本不变');
        assert.equal(root.querySelectorAll('script,style').length, 0);
    });
});

test('nextHitIndex wraps in both directions and guards empty results', () => {
    assert.equal(nextHitIndex(3, 0, -1), 2);
    assert.equal(nextHitIndex(3, 2, 1), 0);
    assert.equal(nextHitIndex(3, 1, 4), 2);
    assert.equal(nextHitIndex(0, 0, 1), 0);
    assert.equal(nextHitIndex(-1, 5, 2), 0);
});

test('clampScrollTop clamps into [0, max] and tolerates non-finite input', () => {
    assert.equal(clampScrollTop(50, 200), 50);
    assert.equal(clampScrollTop(-5, 200), 0);
    assert.equal(clampScrollTop(999, 200), 200);
    assert.equal(clampScrollTop(10, 0), 0, '内容不足一屏时无可滚动距离');
    assert.equal(clampScrollTop(Number.NaN, 200), 0);
    assert.equal(clampScrollTop(10, Number.NaN), 0);
});
