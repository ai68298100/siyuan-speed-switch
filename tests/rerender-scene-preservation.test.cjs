// T-7038/T-7039：侧栏与移动切换器重绘现场保持契约——全量重建前捕获滚动与焦点卡片，
// 重建后恢复；焦点在表面外（搜索框/浮层）不抢焦点，找不到诚实放弃。
const test = require('node:test');
const assert = require('node:assert/strict');
const {readSourceFile} = require('./source-scan.cjs');

const indexSource = readSourceFile('src/index.ts');
const mobileSource = readSourceFile('src/mobile-switcher-ui.ts');

test('sidebar rerender preserves scroll and focused card across full rebuilds (T-7038)', () => {
    const fn = indexSource.slice(
        indexSource.indexOf('private renderSidebarPanel('),
        indexSource.indexOf('private buildSidebarHtml('),
    );
    assert.ok(fn.length > 3000, 'renderSidebarPanel 必须存在后再检查现场事务');
    // 捕获段：清空 DOM 前记录滚动与焦点卡片（含"焦点是否在本表面内"三要素）
    assert.match(fn, /const previousScrollTop = previousScrollElement\?\.scrollTop \?\? 0;/,
        '重建前必须捕获滚动位置');
    assert.match(fn, /const focusInSidebar = !!previousScrollElement && !!sidebarFocus && previousScrollElement\.contains\(sidebarFocus\);/,
        '必须判定焦点是否在滚动区内（表面外不抢焦点）');
    assert.match(fn, /sidebarFocus!\.closest\("\.sw__card"\)\?\.getAttribute\("data-tab-id"\) \|\| null/,
        '焦点卡片必须按 tabId 捕获');
    // 恢复段：渲染后钳制复位 + 焦点找回
    assert.match(fn, /scrollElement\.scrollTop = Math\.min\(previousScrollTop, Math\.max\(0, scrollElement\.scrollHeight - scrollElement\.clientHeight\)\);/,
        '滚动必须按内容高度钳制复位（首帧 0 属无操作）');
    assert.match(fn, /if \(card\.dataset\.tabId === previousFocusCardId\) \{ card\.focus\(\{preventScroll: true\}\); break; \}/,
        '焦点卡片必须按 tabId 找回，找不到诚实放弃');
});

test('mobile rerender preserves scroll and focused card across async rebuilds (T-7039)', () => {
    const fn = mobileSource.slice(
        mobileSource.indexOf('export function renderMobileList('),
        mobileSource.indexOf('export function openMobileGroupActions('),
    );
    assert.ok(fn.length > 2000, 'renderMobileList 必须存在后再检查现场事务');
    // 捕获段必须先于 innerHTML 清空
    const clearAt = fn.indexOf('scrollElement.innerHTML = "";');
    assert.ok(clearAt > 0, '必须存在整表清空点');
    const captureAt = fn.indexOf('const scrollTopBefore = scrollElement.scrollTop;');
    assert.ok(captureAt > -1 && captureAt < clearAt, '清空前必须捕获滚动位置');
    assert.match(fn, /const focusInList = !!sceneFocus && scrollElement\.contains\(sceneFocus\);/,
        '清空前必须判定焦点是否在列表内');
    // 恢复段：钳制复位 + 焦点找回，且必须先于缩略图懒渲染（懒渲染按滚动位置决定首屏瓦片）
    const restoreAt = fn.indexOf('scrollElement.scrollTop = Math.min(scrollTopBefore, Math.max(0, scrollElement.scrollHeight - scrollElement.clientHeight));');
    const thumbsAt = fn.indexOf('this.renderThumbnails(');
    assert.ok(restoreAt > clearAt, '重建后必须钳制复位滚动');
    assert.ok(thumbsAt > restoreAt, '现场恢复必须先于缩略图懒渲染');
    assert.match(fn, /if \(card\.dataset\.tabId === focusCardId\) \{ card\.focus\(\{preventScroll: true\}\); break; \}/,
        '焦点卡片必须按 tabId 找回，找不到诚实放弃');
});

test('mobile group actions surface rejected host operations and release busy state (T-7219)', () => {
    const fn = mobileSource.slice(
        mobileSource.indexOf('const appendAction = '),
        mobileSource.indexOf('appendAction(this.i18n.openGroupTabs'),
    );
    assert.ok(fn.length > 400, '组操作按钮处理器必须存在后再检查失败事务');
    assert.match(fn, /catch \(error\) \{[\s\S]*logger\.warn\("mobile group action failed", error\);[\s\S]*showMessage\(this\.i18n\.quickActionFailed, MESSAGE_DEFAULT_MS, "error"\);/,
        '宿主拒绝必须有日志和用户可见错误反馈');
    assert.match(fn, /catch \(error\) \{[\s\S]*\}\s*finally \{/,
        '失败后必须仍进入 finally 释放忙状态与按钮禁用');
});
