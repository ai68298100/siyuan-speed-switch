// T-7182：配置窗会话隔离契约（源码扫描 + 检测器自检负向验证）。
const test = require('node:test');
const assert = require('node:assert/strict');
const {readSourceFile} = require('./source-scan.cjs');

const source = readSourceFile('src/home-config-form.ts');

test('form-level disposed flag and timer registry exist (T-7182)', () => {
    assert.match(source, /let formDisposed = false;/, '会话销毁旗标必须存在');
    assert.match(source, /const formTimers = new Set<number>\(\);/, 'timer 登记表必须存在');
    assert.match(source, /const formTimer = \(handler: \(\) => void, timeout: number\): number => \{/, 'formTimer 工厂必须存在');
    assert.match(source, /if \(!formDisposed\) handler\(\);/, 'timer 触发必须先验 disposed');
});

test('destroyCallback clears flags and all timers (T-7182)', () => {
    const destroy = source.indexOf('destroyCallback: () => {');
    const body = source.slice(destroy, source.indexOf('},', destroy) + 2);
    assert.match(body, /formDisposed = true;/, '销毁必须置旗标');
    assert.match(body, /formTimers\.forEach\(\(handle\) => window\.clearTimeout\(handle\)\);/, '销毁必须清全部 timer');
    assert.match(body, /formTimers\.clear\(\);/, '销毁必须清登记表');
});

test('async callbacks check disposed before touching draft/DOM (T-7182)', () => {
    assert.match(source, /if \(formDisposed \|\| generation !== requestGeneration\) return;/, '文档搜索回调必须先验 disposed');
    assert.match(source, /void this\.loadHomeDatabaseOptions\(\)\.then\(\(items\) => \{\n\s*if \(formDisposed\) return;/, '数据库初始加载必须先验 disposed');
    assert.match(source, /if \(queryTimer !== null\) formTimers\.delete\(queryTimer\);/, '旧 timer 触发前必须从登记表除名');
});

test('detector self-check: unguarded timer is caught (negative verification)', () => {
    const legacy = 'queryTimer = window.setTimeout(() => load(query), query ? 180 : 0);';
    assert.match(legacy, /window\.setTimeout\(\(\) => load\(query\)/, '裸 setTimeout 形态必须可被识别');
    const current = readSourceFile('src/home-config-form.ts');
    assert.doesNotMatch(current, /window\.setTimeout\(\(\) => load\(query\)/, '真实源码的文档字段 timer 必须走 formTimer 登记');
    assert.match(current, /queryTimer = formTimer\(/, '真实源码必须存在 formTimer 调用');
});
