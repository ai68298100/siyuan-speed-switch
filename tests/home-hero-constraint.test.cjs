// T-6969 Slice 3：X 英雄位约束——每面板至多 1 个 full，超出降级 large(8×5)，
// 非 full 条目原样保留，输入不可变。
const test = require('node:test');
const assert = require('node:assert/strict');
const {enforceHomeHeroConstraint} = require('../src/home-model.js');

test('hero constraint keeps the first full tile and demotes the rest to large', () => {
    const list = [
        {instanceId: 'a', size: 'wide', w: 8, h: 3},
        {instanceId: 'b', size: 'full', w: 12, h: 3},
        {instanceId: 'c', size: 'full', w: 12, h: 3},
        {instanceId: 'd', size: 'small', w: 4, h: 3},
    ];
    const result = enforceHomeHeroConstraint(list);
    assert.equal(result.demoted, 1);
    assert.equal(result.list[1].size, 'full', '首个 full 保留');
    assert.equal(result.list[2].size, 'large');
    assert.equal(result.list[2].w, 8);
    assert.equal(result.list[2].h, 5);
    assert.deepEqual([result.list[0], result.list[3]], [list[0], list[3]], '非 full 条目原样');
});

test('hero constraint is read-only on the input and tolerates empty lists', () => {
    const list = [{instanceId: 'x', size: 'full', w: 12, h: 3}];
    const copy = JSON.stringify(list);
    const result = enforceHomeHeroConstraint(list);
    assert.equal(result.demoted, 0);
    assert.equal(JSON.stringify(list), copy, '输入不可变');
    assert.deepEqual(enforceHomeHeroConstraint([]), {list: [], demoted: 0});
    assert.deepEqual(enforceHomeHeroConstraint(undefined), {list: [], demoted: 0});
});
