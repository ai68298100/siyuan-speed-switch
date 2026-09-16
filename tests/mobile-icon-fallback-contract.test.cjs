// 契约测试：手机端三处首帧/窄屏 UI 修复的**源码级**防线。
//
// 为什么需要它（而不只靠 Chromium 布局门禁）：布局门禁的 HTML 是为了测量而手写的，
// 与 src/index.ts 的真模板是"两份"，会漂移——模板哪天丢了 width 属性，门禁照样绿。
// 因此这里直接锁生产源码：模板必须逐个带显式尺寸、SCSS 的关键修复声明必须存在。
//
// 三处修复的对应关系见 TODO T-6263 与 DECISIONS D-389。

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repo = path.resolve(__dirname, '..');
const indexSource = fs.readFileSync(path.join(repo, 'src', 'index.ts'), 'utf8');
const homeViewSource = fs.readFileSync(path.join(repo, 'src', 'home-view.js'), 'utf8');
const scssSource = fs.readFileSync(path.join(repo, 'src', 'index.scss'), 'utf8');
const { clampOversizedIcons, MOBILE_ICON_SIZE_FALLBACKS } = require('../src/util.js');

// 字面量一律拼接构造：避免断言目标字符串出现在本文件里后被"自指"满足（清单模式⑥）
const SVG_OPEN = '<' + 'svg';
const WIDTH_ATTR = 'width' + '=';
const HEIGHT_ATTR = 'height' + '=';

// 从 block 起点做花括号配平，取出完整块体（SCSS/CSS 通用）
function braceBlock(source, startIndex) {
    const open = source.indexOf('{', startIndex);
    if (open < 0) return '';
    let depth = 0;
    for (let index = open; index < source.length; index += 1) {
        if (source[index] === '{') depth += 1;
        else if (source[index] === '}') {
            depth -= 1;
            if (depth === 0) return source.slice(open + 1, index);
        }
    }
    return source.slice(open + 1);
}

function firstBlockAfter(source, anchor) {
    const at = source.indexOf(anchor);
    assert.notEqual(at, -1, `anchor not found: ${anchor}`);
    return braceBlock(source, at);
}

// 取出某个方法/函数的声明体（从签名起做花括号配平）
function functionBody(source, signature) {
    const at = source.indexOf(signature);
    assert.notEqual(at, -1, `signature not found: ${signature}`);
    return braceBlock(source, at);
}

// 找出所有"没有显式尺寸属性"的 svg 开标签
function bareSvgTags(source) {
    const tags = source.match(/<svg[^>]*>/g) || [];
    return tags.filter((tag) => !new RegExp(`\\s${WIDTH_ATTR}`).test(tag));
}

test('mobile switcher template gives every svg an explicit size', () => {
    const body = functionBody(indexSource, 'private buildMobileSwitcherHtml(): string {');
    assert.deepEqual(bareSvgTags(body), [], 'mobile switcher template must not contain size-less svg tags');
    // 显式尺寸必须与 CSS 声明一致，不是"随便加了个属性"
    assert.ok(body.includes(`${WIDTH_ATTR}"14"`), 'search icon keeps its 14px intrinsic size');
    assert.ok(body.includes(`${WIDTH_ATTR}"15"`), 'filter button keeps its 15px intrinsic size');
    assert.ok(body.includes(`${WIDTH_ATTR}"16"`), 'chip and close icons keep their 16px intrinsic size');
    assert.ok(body.includes(HEIGHT_ATTR), 'height must be pinned alongside width (svg defaults to 150px tall)');
});

test('mobile sort button icon gets an explicit size when injected', () => {
    const body = functionBody(indexSource, 'const updateSortButton = () => {');
    assert.deepEqual(bareSvgTags(body), [], 'sort button icon must not rely on CSS for its size');
    assert.ok(body.includes(`${WIDTH_ATTR}"18"`), 'sort icon keeps its 18px intrinsic size');
});

test('open-history trigger icon gets an explicit size', () => {
    const body = functionBody(indexSource, 'private setupOpenHistoryDropdown(');
    assert.deepEqual(bareSvgTags(body), [], 'history trigger icon must not rely on CSS for its size');
    assert.ok(body.includes(`${WIDTH_ATTR}"13"`), 'history clock icon keeps its 13px intrinsic size');
});

test('home module icon is created with explicit dimensions', () => {
    const body = functionBody(homeViewSource, 'function renderModuleIcon(');
    assert.ok(body.includes(`setAttribute(${JSON.stringify('width')}, ${JSON.stringify('28')})`), 'home module icon pins its width');
    assert.ok(body.includes(`setAttribute(${JSON.stringify('height')}, ${JSON.stringify('28')})`), 'home module icon pins its height');
});

test('oversized icon fallback only rewrites genuinely oversized svg elements', () => {
    const makeSvg = (cls, width, height) => ({
        attributes: {},
        style: {props: {}, setProperty(key, value) { this.props[key] = value; }},
        matches: (selector) => selector.split(',')[0].trim() === cls,
        getBoundingClientRect: () => ({width, height}),
        setAttribute(key, value) { this.attributes[key] = value; },
    });
    const normal = makeSvg('.sw__search-icon', 14, 14);
    const oversized = makeSvg('.sw__search-icon', 300, 150);
    const unknown = makeSvg('.sw__unknown-thing', 300, 150);
    const root = {querySelectorAll: () => [normal, oversized, unknown]};

    const fixed = clampOversizedIcons(root);

    assert.equal(fixed, 2, 'only the two oversized icons are rewritten');
    assert.deepEqual(normal.attributes, {}, 'a correctly sized icon is never touched');
    assert.deepEqual(normal.style.props, {}, 'a correctly sized icon keeps its inline style empty');
    assert.equal(oversized.attributes.width, '14', 'known selector falls back to its declared size');
    assert.equal(oversized.style.props.width, '14px', 'fallback also pins the inline width with priority');
    assert.equal(unknown.attributes.width, String(16), 'unknown selector falls back to the generic size');
});

test('oversized icon fallback is inert without a measurable layout', () => {
    // jsdom 等无布局环境实测为 0：兜底必须不误触发，否则每个图标都会被写死尺寸
    const element = {attributes: {}, style: {setProperty() {}}, matches: () => true, getBoundingClientRect: () => ({width: 0, height: 0}), setAttribute(k, v) { this.attributes[k] = v; }};
    assert.equal(clampOversizedIcons({querySelectorAll: () => [element]}), 0);
    assert.deepEqual(element.attributes, {});
    assert.equal(clampOversizedIcons(null), 0);
    assert.equal(clampOversizedIcons({}), 0);
});

test('fallback size table stays inside the mobile icon budget', () => {
    assert.ok(MOBILE_ICON_SIZE_FALLBACKS.length >= 6, 'the table must cover every naked icon in the mobile toolbar');
    for (const entry of MOBILE_ICON_SIZE_FALLBACKS) {
        assert.ok(entry.size > 0 && entry.size <= 32, `${entry.selector} fallback size must stay within the 32px ceiling`);
        assert.match(entry.selector, /^\.sw[-_]{1,2}/, `${entry.selector} must target a plugin-owned class`);
    }
    const selectors = MOBILE_ICON_SIZE_FALLBACKS.map((entry) => entry.selector);
    for (const required of ['.sw__search-icon', '.sw__search-filter-btn svg', '.sw__history-trigger svg', '.sw__sort-btn svg']) {
        assert.ok(selectors.includes(required), `${required} must have a fallback entry`);
    }
});

test('mobile home grid releases the fixed 40px row height', () => {
    const block = firstBlockAfter(scssSource, '.sw-home--mobile .sw-home__grid {');
    assert.match(block, /grid-auto-rows:\s*auto\s*!important/, 'mobile grid must override grid-auto-rows: 40px');
    assert.match(block, /grid-template-columns:\s*1fr\s*!important/, 'mobile grid must stay single column');
});

test('mobile home cell keeps a readable height band', () => {
    const block = firstBlockAfter(scssSource, '.sw-home--mobile .sw-home__cell {');
    assert.match(block, /min-height:\s*112px/, 'collapsed/skeleton cards need a readable floor');
    assert.match(block, /max-height:\s*68vh/, 'a very long widget must not swallow the whole viewport');
    assert.match(block, /grid-row:\s*auto\s*!important/, 'single column layout keeps row spans released');
});

test('mobile toolbar chips are no longer pinned to the 34px icon-only width', () => {
    // 锚点取"旧规则缺失、修复才会出现"的形态，避免命中更早的同名工具栏块
    const anchor = '.sw__mobile-fav-btn,\n    .sw__settings-btn {\n        width: auto;';
    const at = scssSource.indexOf(anchor);
    assert.notEqual(at, -1, 'the chip size override block must exist');
    const chipBlock = braceBlock(scssSource, at);
    assert.match(chipBlock, /width:\s*auto/, 'chip buttons must size to their label');
    assert.match(chipBlock, /min-width:\s*34px/, 'icon-only chips keep the original 34px footprint');
    assert.match(chipBlock, /padding:\s*0 10px/, 'chip padding must win over the legacy padding: 0');
    assert.match(chipBlock, />\s*svg\s*\{[^}]*flex:\s*none/, 'the chip icon must not be flex-compressed');
});

test('mobile toolbar chip label can shrink without being clipped', () => {
    const anchor = '.sw__mobile-chip-label {\n        flex: 0 1 auto;';
    const at = scssSource.indexOf(anchor);
    assert.notEqual(at, -1, 'the chip label override block must exist');
    const labelBlock = braceBlock(scssSource, at);
    assert.match(labelBlock, /min-width:\s*0/, 'the label needs min-width: 0 to coexist with the flex row');
});
