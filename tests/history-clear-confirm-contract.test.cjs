const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {readSourceText} = require('./source-scan.cjs');

const source = readSourceText(path.join(__dirname, '..', 'src', 'index.ts'));
const start = source.indexOf('private renderOpenHistoryPanel(');
const end = source.indexOf('private bindHistoryItemActions(', start);
assert.ok(start >= 0 && end > start, 'history panel method must remain discoverable');
const body = source.slice(start, end);

test('clearing recently closed history requires explicit confirmation', () => {
    assert.match(body, /this\.i18n\.clearClosedHistoryConfirm/);
    assert.match(body, /if \(!confirm\(this\.i18n\.clearClosedHistoryConfirm\)\) return;/);
    assert.match(body, /this\.data\[CLOSED_HISTORY_KEY\] = \[\];/);

    const missingConfirmation = body.replace(
        'if (!confirm(this.i18n.clearClosedHistoryConfirm)) return;',
        '/* injected violation */',
    );
    assert.doesNotMatch(
        missingConfirmation,
        /if \(!confirm\(this\.i18n\.clearClosedHistoryConfirm\)\) return;/,
        '删除最近关闭二次确认后门禁必须失败',
    );
});
