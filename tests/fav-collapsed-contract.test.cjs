// T-7184：收藏分组折叠状态跨设备收敛契约 + T-7173 后续：实时克隆来源边界。
const test = require('node:test');
const assert = require('node:assert/strict');
const {readSourceFile} = require('./source-scan.cjs');

const index = readSourceFile('src/index.ts');

test('initFavCollapsed rebuilds the set from the persisted snapshot (T-7184)', () => {
    const fnStart = index.indexOf('private initFavCollapsed');
    const body = index.slice(fnStart, index.indexOf('\n    }', fnStart) + 6);
    assert.match(body, /const next = new Set<string>\(\);/, '必须构造新集合（重建而非追加）');
    assert.match(body, /this\.favCollapsed = next;/, '必须整体赋值替换（残留成员清零）');
    assert.doesNotMatch(body, /this\.favCollapsed\.add\(/, '历史只追加形态禁止回归');
});

test('detector self-check: append-only init is caught (negative verification)', () => {
    const legacy = 'saved.forEach((name) => { this.favCollapsed.add(name); });';
    assert.match(legacy, /favCollapsed\.add\(/, '只追加形态必须可被识别');
    const current = readSourceFile('src/index.ts');
    const fnStart = current.indexOf('private initFavCollapsed');
    const body = current.slice(fnStart, current.indexOf('\n    }', fnStart) + 6);
    assert.doesNotMatch(body, /favCollapsed\.add\(/, '真实源码必须为重建形态');
});

test('live-clone thumbnail source stays clone-based (T-7173 boundary note)', () => {
    // 实时克隆来源安全的前提是 cloneNode（不解析 HTML）——禁止改回 innerHTML 解析实时内容
    const fnStart = index.indexOf('private getThumbSource');
    const body = index.slice(fnStart, index.indexOf('\n    }\n', fnStart) + 6);
    assert.match(body, /cloneNode\(true\)/, '实时克隆必须保持 cloneNode（不解析）');
    assert.doesNotMatch(body, /innerHTML\s*=/, '实时来源不得引入 innerHTML 解析');
});
