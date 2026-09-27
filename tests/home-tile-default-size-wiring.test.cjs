// T-6969 Slice 2：默认档位接线契约——商店尺寸瓦片默认选中必须经纯模型解析
//（模块预设 → medium → 首个支持档），不得硬编码 supported[0]。
const test = require('node:test');
const assert = require('node:assert/strict');
const {readSourceFile} = require('./source-scan.cjs');

const storeSource = readSourceFile('src/home-store-ui.ts');
const model = readSourceFile('src/home-model.js');

test('default size wiring: store default-selected tile resolves through the preset model', () => {
    assert.match(storeSource, /const preferredSize = resolveHomeTileDefaultSize\(moduleId, supported, "medium"\);/,
        '商店默认选中必须走每模块默认档解析');
    assert.match(storeSource, /sizeKey === \(added\?\.size \|\| preferredSize\)/, '已添加实例保持其现存档位');
    assert.match(model, /function resolveHomeTileDefaultSize\(moduleId, supported, fallback\)/, '解析必须走纯模型');
    assert.ok(!storeSource.includes('added?.size || supported[0]'), '旧的 supported[0] 硬编码必须移除');
});
