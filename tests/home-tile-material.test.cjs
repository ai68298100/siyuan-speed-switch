// T-6969/ADR 0091：工作台材质目录——显式声明优先、白名单外回退 plain。
const test = require('node:test');
const assert = require('node:assert/strict');
const {HOME_TILE_MATERIALS, HOME_TILE_MATERIAL_FALLBACK, resolveHomeTileMaterial} = require('../src/home-model.js');

test('tile material catalog: explicit declarations win, everything else falls back to plain', () => {
    assert.equal(resolveHomeTileMaterial('external-world-clock'), 'dark');
    assert.equal(resolveHomeTileMaterial('external-local-time'), 'dark');
    assert.equal(resolveHomeTileMaterial('external-quote-daily'), 'dark');
    assert.equal(resolveHomeTileMaterial('external-weather-open-meteo'), 'vibrant');
    assert.equal(resolveHomeTileMaterial('external-air-quality'), 'vibrant');
    assert.equal(resolveHomeTileMaterial('checkin-streak'), 'accent');
    assert.equal(resolveHomeTileMaterial('writing-streak'), 'accent');
    assert.equal(resolveHomeTileMaterial('database-list'), 'plain', '未声明组件回退 plain');
    assert.equal(resolveHomeTileMaterial(''), 'plain');
    assert.equal(resolveHomeTileMaterial('../../path-traversal'), 'plain', '路径样 moduleId 不得逃逸白名单');
    assert.ok(HOME_TILE_MATERIAL_FALLBACK === 'plain');
    assert.ok(Object.values(HOME_TILE_MATERIALS).every((m) => ['dark', 'accent', 'vibrant', 'plain'].includes(m)), '材质值必须来自四类枚举');
});
