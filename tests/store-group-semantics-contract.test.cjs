const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src', 'index.ts'), 'utf8');
const storeUiSource = fs.readFileSync(path.join(root, 'src', 'home-store-ui.ts'), 'utf8');
const scss = fs.readFileSync(path.join(root, 'src', 'index.scss'), 'utf8');
const guide = fs.readFileSync(path.join(root, 'docs', 'component-store-guide.md'), 'utf8');
const zh = JSON.parse(fs.readFileSync(path.join(root, 'src', 'i18n', 'zh-CN.json'), 'utf8'));
const en = JSON.parse(fs.readFileSync(path.join(root, 'src', 'i18n', 'en.json'), 'utf8'));

const expectedGroups = [
    ['homeStoreGroupJournal', 'homeStoreGroupJournalHint'],
    ['homeStoreGroupTasks', 'homeStoreGroupTasksHint'],
    ['homeStoreGroupDocuments', 'homeStoreGroupDocumentsHint'],
    ['homeStoreGroupInsights', 'homeStoreGroupInsightsHint'],
    ['homeStoreGroupLearning', 'homeStoreGroupLearningHint'],
    ['homeStoreGroupLife', 'homeStoreGroupLifeHint'],
    ['homeStoreGroupSystem', 'homeStoreGroupSystemHint'],
];

test('group metadata type includes a description field', () => {
    assert.match(storeUiSource,/Array<\{label: string; description: string; moduleIds: string\[\]\}>/);
});
test('group metadata keeps module ids explicit', () => assert.match(storeUiSource, /moduleIds: \[/));
test('group order starts with journal', () => assert.match(storeUiSource,/BUILTIN_GROUPS:[\s\S]*?homeStoreGroupJournal/));
test('group order places tasks after journal', () => assert.ok(storeUiSource.indexOf('homeStoreGroupJournal') < storeUiSource.indexOf('homeStoreGroupTasks')));
test('group order places documents after tasks', () => assert.ok(storeUiSource.indexOf('homeStoreGroupTasks') < storeUiSource.indexOf('homeStoreGroupDocuments')));
test('group order places insights after documents', () => assert.ok(storeUiSource.indexOf('homeStoreGroupDocuments') < storeUiSource.indexOf('homeStoreGroupInsights')));
test('group order places learning after insights', () => assert.ok(storeUiSource.indexOf('homeStoreGroupInsights') < storeUiSource.indexOf('homeStoreGroupLearning')));
test('group order places life after learning', () => assert.ok(storeUiSource.indexOf('homeStoreGroupLearning') < storeUiSource.indexOf('homeStoreGroupLife')));
test('group order places system last', () => assert.ok(storeUiSource.indexOf('homeStoreGroupLife') < storeUiSource.indexOf('homeStoreGroupSystem')));
test('journal hint is wired to journal group', () => assert.match(storeUiSource, /homeStoreGroupJournal, description: this\.i18n\.homeStoreGroupJournalHint/));
test('tasks hint is wired to tasks group', () => assert.match(storeUiSource, /homeStoreGroupTasks, description: this\.i18n\.homeStoreGroupTasksHint/));
test('documents hint is wired to documents group', () => assert.match(storeUiSource, /homeStoreGroupDocuments, description: this\.i18n\.homeStoreGroupDocumentsHint/));
test('insights hint is wired to insights group', () => assert.match(storeUiSource, /homeStoreGroupInsights, description: this\.i18n\.homeStoreGroupInsightsHint/));
test('learning hint is wired to learning group', () => assert.match(storeUiSource, /homeStoreGroupLearning, description: this\.i18n\.homeStoreGroupLearningHint/));
test('life hint is wired to life group', () => assert.match(storeUiSource, /homeStoreGroupLife, description: this\.i18n\.homeStoreGroupLifeHint/));
test('system hint is wired to system group', () => assert.match(storeUiSource,/homeStoreGroupSystem, description: this\.i18n\.homeStoreGroupSystemHint/));
test('journal module list contains monthly calendar', () => assert.match(source, /"journal-monthly"/));
test('journal module list contains calendar month view', () => assert.match(source, /"journal-calendar"/));
test('journal module list contains writing streak', () => assert.match(storeUiSource, /"writing-streak"/));
test('task group contains today tasks', () => assert.match(storeUiSource, /"today-tasks", "countdown"/));
test('task group contains quick capture', () => assert.match(storeUiSource,/"quick-capture", "clipped-unread"/));
test('document group contains relations summary', () => assert.match(source, /"document-relations-summary"/));
test('insight group excludes countdown', () => {
    const insight = source.match(/homeStoreGroupInsights,[\s\S]*?moduleIds: \[([^\]]+)/)?.[1] || '';
    assert.doesNotMatch(insight, /countdown/);
});
test('life group combines feeds and local service by purpose', () => assert.match(storeUiSource, /"external-news-newsnow", "external-news-hackernews", "external-activitywatch-time"/));
test('system group contains plugin commands', () => assert.match(storeUiSource, /homeStoreGroupSystem,[\s\S]*?"plugin-commands"/));
test('unknown built-in widgets receive an other hint', () => assert.match(storeUiSource, /return hit\?\.description \|\| this\.i18n\.homeStoreGroupOtherHint/));
test('plugin widgets receive a source hint', () => assert.match(storeUiSource, /return this\.i18n\.homeStoreGroupPluginHint/));
test('description map is separate from card grouping', () => assert.match(storeUiSource, /const readyGroupDescriptions = new Map<string, string>\(\)/));
test('description map is populated once per group', () => assert.match(storeUiSource, /if \(!readyGroupDescriptions\.has\(label\)\) readyGroupDescriptions\.set/));
test('description is rendered as text', () => assert.match(storeUiSource, /groupDescription\.textContent = readyGroupDescriptions\.get\(label\)/));
test('description is linked with aria-describedby', () => assert.match(storeUiSource, /groupHeading\.setAttribute\("aria-describedby", descriptionId\)/));
test('description uses a dedicated class', () => assert.match(storeUiSource, /groupDescription\.className = "sw-home-store__group-description"/));
test('description id is deterministic', () => assert.match(storeUiSource,/sw-home-store-group-description-\$\{orderedGroups\.indexOf\(label\)\}/));
test('description can wrap on desktop', () => assert.match(scss, /\.sw-home-store__group-description[\s\S]*?overflow-wrap: anywhere/));
test('description has reduced visual emphasis', () => assert.match(scss, /\.sw-home-store__group-description[\s\S]*?opacity: \.78/));
test('guide documents functional grouping', () => assert.match(guide, /## 功能分组含义/));
test('guide states that grouping is not availability', () => assert.match(guide, /不表示联网方式或可用条件/));
test('guide documents all seven functional groups', () => {
    for (const label of ['日记与日历', '任务与执行', '文档与导航', '统计与进展', '学习与记忆', '生活与资讯', '系统与服务']) {
        assert.match(guide, new RegExp(label));
    }
});
test('guide retains plugin grouping semantics', () => assert.match(guide, /插件组件.*按作者显示/));
test('all functional group labels have Chinese hints', () => {
    for (const [, hint] of expectedGroups) assert.equal(typeof zh[hint], 'string');
});
test('all functional group labels have English hints', () => {
    for (const [, hint] of expectedGroups) assert.equal(typeof en[hint], 'string');
});
test('Chinese hints are non-empty', () => {
    for (const [, hint] of expectedGroups) assert.ok(zh[hint].trim().length >= 6);
});
test('English hints are non-empty', () => {
    for (const [, hint] of expectedGroups) assert.ok(en[hint].trim().length >= 12);
});
test('plugin hint is localized in both languages', () => {
    assert.ok(zh.homeStoreGroupPluginHint && en.homeStoreGroupPluginHint);
});
test('other hint is localized in both languages', () => {
    assert.ok(zh.homeStoreGroupOtherHint && en.homeStoreGroupOtherHint);
});
test('legacy capture label is no longer a functional group', () => assert.equal(zh.homeStoreGroupCapture, undefined));
test('legacy news label is no longer a functional group', () => assert.equal(zh.homeStoreGroupNews, undefined));
test('legacy focus label is no longer a functional group', () => assert.equal(zh.homeStoreGroupFocus, undefined));
