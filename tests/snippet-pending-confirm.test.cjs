// T-7045：片段写入后「待确认」态契约——宿主只对列表写入之后的失败打 writeLanded
// 标（snippet-conflict 保留可决策语义）；UI 待确认回执 + 只读核对（save/toggle 须
// 条目一致、delete 须条目消失）+ 核对确认才登记回收站；未核对诚实停留允许重试。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {readSourceFile} = require('./source-scan.cjs');

const hostSource = readSourceFile('src/snippet-studio-host.js');
const uiSource = readSourceFile('src/snippet-studio-ui.js');
const zh = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'i18n', 'zh-CN.json'), 'utf8'));
const en = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'i18n', 'en.json'), 'utf8'));

test('pending confirm: host tags only post-write failures as writeLanded', () => {
    // 打标块必须在列表写入之后：anchor = buildSnippetMutation 行出现在 tagLanded 之前，
    // 且 tagLanded 对 snippet-conflict 不打标。
    const buildAt = hostSource.indexOf('buildSnippetMutation(latest, baseline, action, draft)');
    const tagAt = hostSource.indexOf('const tagLanded = (error) => {');
    const writeAt = hostSource.indexOf('request("/api/snippet/setSnippet", {snippets: next})');
    assert.ok(buildAt > -1 && tagAt > buildAt && writeAt > tagAt,
        'writeLanded 打标必须位于构建之后、列表写入请求之内（写入前失败不打标）');
    assert.match(hostSource, /if \(String\(error\?\.message \|\| ""\) !== "snippet-conflict"\) error\.writeLanded = true;/,
        'snippet-conflict 必须保留既有可决策语义（不打标）');
    assert.match(hostSource, /} catch \(error\) \{ tagLanded\(error\); \}/, '写后链路必须统一经 tagLanded 抛出');
});

test('pending confirm: UI verifies read-only before any receipt or recycle registration', () => {
    assert.match(uiSource, /if \(error\?\.writeLanded && recycle\) \{\s*\n\s*setStatus\(t\("snippetPendingConfirm"\), "busy"\);/,
        'writeLanded 必须先进待确认回执而非普通失败');
    assert.match(uiSource, /const confirmedNow = actionName === "delete" \? !landed : \(!!landed && landed\.name === input\.name && landed\.content === input\.content\);/,
        '核对判定：save/toggle 须条目一致、delete 须条目消失');
    // 未核对分支必须诚实停留且不登记回收站（回收站登记只在确认分支）
    assert.doesNotMatch(uiSource, /snippetPendingUnverified[\s\S]{0,160}recycle\.save/,
        '未核对分支不得登记回收站（旧版本不会重复入站）');
    assert.match(uiSource, /setStatus\(t\("snippetPendingUnverified"\), "error"\);\s*\n\s*return false;/,
        '未核对必须诚实停留并允许用户刷新后重试');
    for (const key of ['snippetPendingConfirm', 'snippetPendingUnverified']) {
        assert.ok(zh[key] && en[key], `i18n 键 ${key} 必须双语齐备`);
    }
});
