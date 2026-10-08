// T-7183：异步数据重读与插件卸载的代际隔离契约（源码扫描 + 检测器自检负向验证）。
const test = require('node:test');
const assert = require('node:assert/strict');
const {readSourceFile} = require('./source-scan.cjs');

const source = readSourceFile('src/index.ts');

test('onDataChanged guards every await against unload (T-7183)', () => {
    const fnStart = source.indexOf('async onDataChanged');
    const body = source.slice(fnStart, source.indexOf('\n    }\n', fnStart) + 6);
    assert.match(body, /const generation = this\.lifecycleGeneration;/, '进入时必须快照生命周期代际');
    assert.match(body, /if \(stale\(\)\) return;/, 'loadPersistentKeys 兑现后必须先验卸载/代际');
    assert.match(body, /while \(this\.dataChangeReloadQueued && !stale\(\)\)/, '重入循环条件必须带代际守卫');
    // 守卫必须在 loadPersistentKeys 之后、updateFloatingBallVisibility 之前
    const loadAt = body.indexOf('await this.loadPersistentKeys();');
    const guardAt = body.indexOf('if (stale()) return;');
    const fabAt = body.indexOf('this.updateFloatingBallVisibility();');
    assert.ok(loadAt > 0 && guardAt > loadAt && fabAt > guardAt, '守卫顺序：读盘 → 验代际 → 才可触碰 FAB');
});

test('detector self-check: unguarded await is caught (negative verification)', () => {
    const legacy = 'await this.loadPersistentKeys();\nthis.updateFloatingBallVisibility();';
    assert.doesNotMatch(legacy, /stale\(\)/, '历史无守卫形态必须可被识别');
    assert.match(source, /if \(stale\(\)\) return;/, '真实源码必须含守卫');
});
