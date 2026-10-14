const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {readSourceText} = require('./source-scan.cjs');

const source = readSourceText(path.join(__dirname, '..', 'src', 'index.ts'));
const start = source.indexOf('private setupOpenHistoryDropdown(');
const end = source.indexOf('private renderOpenHistoryPanel(', start);
assert.ok(start >= 0 && end > start, 'history dropdown method must remain discoverable');
const body = source.slice(start, end);

test('history sync locks the trigger during async work', () => {
    assert.match(body, /if \(trigger\.disabled\) return;/);
    assert.match(body, /trigger\.disabled = true;/);
    assert.match(body, /trigger\.removeAttribute\("aria-busy"\);/);
    assert.match(body, /trigger\.disabled = false;/);
    const missingLock = body.replace('trigger.disabled = true;', '/* injected violation */');
    assert.doesNotMatch(missingLock, /trigger\.disabled = true;/);
});

test('history changed-only fetch locks its toggle during async work', () => {
    assert.match(body, /if \(toggle\.disabled\) return;/);
    assert.match(body, /toggle\.disabled = true;/);
    assert.match(body, /toggle\.removeAttribute\("aria-busy"\);/);
    assert.match(body, /toggle\.disabled = false;/);
    const missingLock = body.replace('toggle.disabled = true;', '/* injected violation */');
    assert.doesNotMatch(missingLock, /toggle\.disabled = true;/);
});
