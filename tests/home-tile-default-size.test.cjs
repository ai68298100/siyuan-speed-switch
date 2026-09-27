// T-6969 Slice 2：每模块默认档位——显式声明优先且必须在模块 sizes 白名单内，
// 否则回退 medium / 首个支持档；任何模块都得到合法默认档。
const test = require('node:test');
const assert = require('node:assert/strict');
const {HOME_TILE_DEFAULT_SIZES, resolveHomeTileDefaultSize} = require('../src/home-model.js');

const SIZES = ['xs', 'small', 'medium', 'tall', 'wide', 'large', 'full'];

test('default size: explicit declaration wins when the module supports it', () => {
    assert.equal(resolveHomeTileDefaultSize('external-world-clock', ['small', 'wide', 'full'], 'medium'), 'full');
    assert.equal(resolveHomeTileDefaultSize('external-weather-open-meteo', ['small', 'medium', 'wide'], 'medium'), 'wide');
});

test('default size: unsupported declaration falls back to medium or the first supported', () => {
    assert.equal(resolveHomeTileDefaultSize('external-world-clock', ['xs', 'small'], 'medium'), 'xs', '声明档与 medium 均不在支持集 → 首个支持档');
    assert.equal(resolveHomeTileDefaultSize('external-air-quality', ['xs', 'tall'], 'small'), 'xs', 'medium 不在支持集 → 首个支持档');
    assert.equal(resolveHomeTileDefaultSize('unknown-module', SIZES, 'medium'), 'medium', '未声明模块回退 medium');
    assert.equal(resolveHomeTileDefaultSize('unknown-module', [], 'medium'), '', '空支持集返回空串');
});

test('default size catalog keys stay within the seven-size vocabulary', () => {
    for (const size of Object.values(HOME_TILE_DEFAULT_SIZES)) {
        assert.ok(SIZES.includes(size), `非法档位键：${size}`);
    }
});
