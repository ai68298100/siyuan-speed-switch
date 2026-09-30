// T-7166：设置控件可访问名称契约（源码扫描）。
// 行为取证在真实浏览器执行（与取消族同模式），本文件钉源码合同。
const test = require('node:test');
const assert = require('node:assert/strict');
const {readSourceFile} = require('./source-scan.cjs');

const source = readSourceFile('src/index.ts');

test('settingItem issues stable title ids and links the control (T-7166)', () => {
    const fnStart = source.indexOf('private settingItem');
    const body = source.slice(fnStart, source.indexOf('\n    }', fnStart) + 6);
    assert.match(body, /titleEl\.id = titleId;/, '标题必须有 id');
    assert.match(body, /control\.setAttribute\("aria-labelledby", titleId\)/, '控件名称 = 标题 id');
    assert.match(body, /control\.setAttribute\("aria-describedby", descId\)/, '说明必须经 describedby 关联');
    assert.match(body, /action\.tagName === "SELECT" \|\| action\.tagName === "INPUT"/, '只对表单控件注入（button 组保留自有命名）');
    assert.match(body, /action\.querySelector<HTMLElement>\("select, input"\)/, 'label 包裹的输入（switcher）也要找到');
});

test('detector self-check: unlinked control is caught (negative verification)', () => {
    const legacy = 'item.appendChild(actionEl);\n        return item;';
    assert.doesNotMatch(legacy, /aria-labelledby/, '历史形态必须可被识别为缺关联');
    assert.match(source, /aria-labelledby", titleId/, '真实源码必须注入关联');
});
