/**
 * 第三方组件示例契约（v0.18 生态准备，2026-09-14）
 *
 * docs/widget-example/example-module.js 是第三方开发者的复制模板。
 * 本门禁保证示例与生产协议不漂移：示例使用的每个 registerHomeModule
 * 字段、configSchema 字段类型、item 命令/值前缀，都必须能在生产源码
 * （widget-catalog / home-model / index.ts 的注册校验白名单）中找到对应。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const example = fs.readFileSync(path.join(root, 'docs', 'widget-example', 'example-module.js'), 'utf8');

test('widget example: only uses registerHomeModule fields known to the production contract', () => {
    const productionFields = [
        'moduleId', 'title', 'icon', 'category', 'description', 'author', 'homepage',
        'protocolVersion', 'supportedDevices', 'sizes', 'refreshOn', 'configSchema',
        'read', 'open', 'clickCommand',
    ];
    // 提取示例 registerHomeModule({...}) 对象字面量的顶层键
    const start = example.indexOf('registerHomeModule({');
    const bodyStart = example.indexOf('{', start);
    let depth = 0, end = -1;
    for (let i = bodyStart; i < example.length; i += 1) {
        if (example[i] === '{') depth += 1;
        if (example[i] === '}') { depth -= 1; if (depth === 0) { end = i; break; } }
    }
    const body = example.slice(bodyStart, end);
    const used = [...body.matchAll(/^\s{8}([a-zA-Z][a-zA-Z0-9]*):/gm)].map((m) => m[1]);
    assert.ok(used.length >= 10, `example should demonstrate the core surface, found ${used.length}`);
    const unknown = used.filter((field) => !productionFields.includes(field));
    assert.deepEqual(unknown, [], `example uses fields unknown to the production contract: ${unknown.join(', ')}`);
});

test('widget example: config schema field types stay inside the protocol whitelist', () => {
    const allowed = ['text', 'number', 'select', 'notebook', 'date', 'document'];
    const schema = require(path.join(root, 'docs', 'widget-example', 'example-module.js')).EXAMPLE_CONFIG_SCHEMA;
    assert.ok(schema.length >= 1 && schema.length <= 8, 'configSchema must hold 1..8 fields');
    for (const field of schema) {
        assert.ok(allowed.includes(field.type), `field "${field.key}" type "${field.type}" is not in the protocol whitelist`);
        assert.match(field.key, /^[a-z][a-zA-Z0-9]*$/, 'field keys must be simple identifiers');
    }
});

test('widget example: item value/command prefixes match the documented click contract', () => {
    // command 前缀 "插件名::命令key"；块 ID 为 14 位时间戳-后缀
    assert.match(example, /command: "your-plugin::open"/);
    assert.match(example, /value: "20260914090000-abcdef"/);
    assert.match(example, /href: "siyuan:\/\/blocks\//);
});

test('widget protocol doc documents the diagnostics capability added in stage 1', () => {
    // T-330：阶段 1 接入的 workspace-runtime-registry-diagnostics 能力
    // 必须出现在第三方可见的 Agent 发现章节，防止协议文档落后于生产。
    const doc = fs.readFileSync(path.join(root, 'docs', 'widget-protocol.md'), 'utf8');
    assert.match(doc, /workspace-runtime-registry-diagnostics/);
});
