const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {readSourceText}=require('./source-scan.cjs');
const {declaresIn}=require('./css-block-scan.cjs');

const root = path.resolve(__dirname, '..');
// 2026-09-16（T-6280 / D-396）：1 条窗口断言迁移为块级；TS 源码读取改走 readSourceText。
const source = readSourceText('src/index.ts');
const storeUiSource = readSourceText('src/home-store-ui.ts');
const css = readSourceText('src/index.scss');
const base={topLevel: true};

test('store cards are programmatically focusable', () => assert.match(storeUiSource, /card\.tabIndex = -1/));
test('store cards expose group semantics', () => assert.match(storeUiSource, /card\.setAttribute\("role", "group"\)/));
test('store card keydown handler exists', () => assert.match(storeUiSource, /card\.addEventListener\("keydown"/));
test('card navigation queries visible cards', () => assert.match(storeUiSource,/\.sw-home-store__card:not\(\.fn__none\)/));
test('card navigation handles ArrowRight', () => assert.match(source, /event\.key === "ArrowRight"/));
test('card navigation handles ArrowLeft', () => assert.match(source, /event\.key === "ArrowLeft"/));
test('card navigation handles ArrowDown', () => assert.match(source, /event\.key === "ArrowDown"/));
test('card navigation handles ArrowUp', () => assert.match(storeUiSource, /event\.key === "ArrowUp"/));
test('card navigation handles Home', () => assert.match(storeUiSource, /if \(event\.key === "Home"\) next = 0/));
test('card navigation handles End', () => assert.match(storeUiSource,/if \(event\.key === "End"\) next = cards\.length - 1/));
test('card navigation prevents default', () => assert.match(storeUiSource, /event\.preventDefault\(\)/));
test('card navigation moves focus', () => assert.match(storeUiSource, /cards\[next\]\.focus\(\)/));
test('card navigation wraps forward', () => assert.match(storeUiSource, /\(index \+ 1\) % cards\.length/));
test('card navigation wraps backward', () => assert.match(storeUiSource, /\(index - 1 \+ cards\.length\) % cards\.length/));
test('card navigation starts from current card', () => assert.match(storeUiSource,/const index = cards\.indexOf\(card\)/));
test('card navigation ignores hidden cards', () => assert.match(source, /:not\(\.fn__none\)/));
test('card focus style has outline', () => assert.ok(declaresIn(css, '.sw-home-store__card:focus-visible', /outline: 2px solid/, base)));
test('card focus style uses primary color', () => assert.match(css, /outline: 2px solid var\(--b3-theme-primary\)/));
test('card focus style offsets outline', () => assert.match(css, /outline-offset: 2px/));
test('card remains section element', () => assert.match(storeUiSource, /const card = document\.createElement\("section"\)/));
test('card keeps aria label', () => assert.match(storeUiSource, /card\.setAttribute\("aria-label"/));
test('card controls remain nested buttons', () => assert.match(storeUiSource, /const addButton = tiles\.lastElementChild as HTMLButtonElement/));
test('card navigation is separate from tab navigation', () => assert.match(storeUiSource, /const cards = Array\.from\(root\.querySelectorAll/));
test('card navigation only runs for recognized keys', () => assert.match(storeUiSource, /if \(next < 0\) return/));
test('card navigation supports empty list safely', () => assert.match(storeUiSource, /if \(index < 0\) return/));
test('card navigation preserves focus order after filtering', () => assert.match(storeUiSource,/querySelectorAll<HTMLElement>\("\.sw-home-store__card:not\(\.fn__none\)"\)/));
test('card focus ring is keyboard-visible', () => assert.match(css, /&:focus-visible/));
test('card role is bounded to group', () => assert.match(storeUiSource,/role", "group/));
test('card tabindex is not positive', () => assert.doesNotMatch(storeUiSource, /card\.tabIndex = [1-9]/));
test('card navigation uses local card listener', () => assert.match(storeUiSource,/card\.addEventListener\("keydown"/));
