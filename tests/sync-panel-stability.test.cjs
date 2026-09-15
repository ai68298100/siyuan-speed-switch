const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src', 'index.ts'), 'utf8');
const css = fs.readFileSync(path.join(root, 'src', 'index.scss'), 'utf8');

test('sync start event is subscribed', () => assert.match(source, /eventBus\.on\("sync-start"/));
test('sync end event is subscribed', () => assert.match(source, /eventBus\.on\("sync-end"/));
test('sync failure event is subscribed', () => assert.match(source, /eventBus\.on\("sync-fail"/));
test('sync handlers are removed on unload', () => assert.match(source, /eventBus\.off\("sync-start"/));
test('sync end schedules a sidebar refresh', () => assert.match(source, /syncFinish[\s\S]*?scheduleSidebarRefresh/));
test('sync state is tracked explicitly', () => assert.match(source, /private syncing = false/));
test('sync state marks roots busy', () => assert.match(source, /setAttribute\("aria-busy", String\(syncing\)\)/));
test('home root receives sync class', () => assert.match(source, /classList\.toggle\("sw--syncing", syncing\)/));
test('loaded protyle does not refresh during sync', () => assert.match(source, /if \(this\.syncing\) return/));
test('home root is positioned for sync notice', () => assert.match(css, /\.sw-home \{[\s\S]*?position: relative/));
test('sync notice blocks pointer churn', () => assert.match(css, /&\.sw--syncing \{[\s\S]*?pointer-events: none/));
test('sync notice uses bounded overlay text', () => assert.match(css, /正在同步，组件面板暂时保持稳定/));
