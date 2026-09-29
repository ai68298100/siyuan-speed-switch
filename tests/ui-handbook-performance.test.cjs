// T-6977：大库性能三模式规范落位契约（文档级——防止三模式条款静默消失；
// 行为保证以各组件契约为准，本契约只守规范存在性）
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const handbook = fs.readFileSync(path.join(__dirname, '..', 'docs', 'ui-handbook-2026-09-27.md'), 'utf8');

test('ui-handbook carries the three large-library performance patterns (T-6977)', () => {
    assert.match(handbook, /## 9\. 大库性能三模式（T-6977/, '三模式章节必须存在');
    for (const clause of ['异步计数补齐', '虚拟滚动预案', '刷新期列表保持可见']) {
        assert.ok(handbook.includes(clause), `三模式必须含「${clause}」`);
    }
    // 关键红线：计数未确认不等于零；虚拟化必须带验收证据
    assert.match(handbook, /用 0 冒充未确认/, '禁止以 0 冒充未确认的红线必须显式');
    assert.match(handbook, /虚拟化必须带验收证据，禁止裸放上限/, '裸放上限红线必须显式');
});

test('spec cards 08/09 carry the performance clause (T-6977)', () => {
    for (const file of ['component-specs-08-navigation.html', 'component-specs-09-longtail.html']) {
        const html = fs.readFileSync(path.join(__dirname, '..', 'docs', 'design', file), 'utf8');
        assert.ok(html.includes('大库性能条款（T-6977'), `${file} 必须带性能条款`);
        assert.ok(html.includes('刷新期旧列表保持可见'), `${file} 条款必须含三模式摘要`);
    }
});
