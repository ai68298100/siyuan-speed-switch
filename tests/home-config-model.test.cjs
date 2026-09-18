const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('../src/home-store-model.js');

const fields = [
  {key: 'title', label: 'Title', type: 'text'},
  {key: 'notebook', label: 'Notebook', type: 'notebook'},
  {key: 'days', label: 'Days', type: 'number', min: 1, max: 30},
  {key: 'limit', label: 'Limit', type: 'number', min: 1, max: 12},
  {key: 'showHot', label: 'Hot', type: 'select', options: ['否', '是']},
];

test('config kind maps calendar', () => assert.equal(model.resolveHomeConfigKind('journal-calendar', 'siyuan'), 'calendar'));
test('config kind maps tasks', () => assert.equal(model.resolveHomeConfigKind('today-tasks', 'siyuan'), 'tasks'));
test('config kind maps external weather', () => assert.equal(model.resolveHomeConfigKind('external-weather-open-meteo', 'siyuan'), 'weather'));
test('config kind maps external feeds', () => assert.equal(model.resolveHomeConfigKind('external-news-newsnow', 'siyuan'), 'feed'));
test('config kind maps media', () => assert.equal(model.resolveHomeConfigKind('external-anime-bangumi', 'siyuan'), 'media'));
test('config kind maps plugin category', () => assert.equal(model.resolveHomeConfigKind('third-party', 'plugin'), 'plugin'));
test('config kind safely falls back', () => assert.equal(model.resolveHomeConfigKind('', 'siyuan'), 'general'));
test('content section keeps countdown title', () => assert.equal(model.resolveHomeConfigSection('countdown', 'title'), 'content'));
test('content section keeps fixed document id', () => assert.equal(model.resolveHomeConfigSection('fixed-document', 'docId'), 'content'));
test('source section keeps notebook plus list query and method filters together', () => {
    assert.equal(model.resolveHomeConfigSection('recent-edits', 'notebook'), 'source');
    assert.equal(model.resolveHomeConfigSection('database-list', 'query'), 'source');
    assert.equal(model.resolveHomeConfigSection('saved-searches', 'method'), 'source');
    assert.equal(model.resolveHomeConfigSection('document-relations-summary', 'relation'), 'source');
});
test('source section keeps endpoint', () => assert.equal(model.resolveHomeConfigSection('external-news-newsnow', 'endpoint'), 'source'));
test('source section keeps city', () => assert.equal(model.resolveHomeConfigSection('external-weather-open-meteo', 'city'), 'source'));
test('source section keeps tag', () => assert.equal(model.resolveHomeConfigSection('clipped-unread', 'tag'), 'source'));
test('range section keeps days', () => assert.equal(model.resolveHomeConfigSection('recent-daily-notes', 'days'), 'range'));
test('range section keeps hours', () => assert.equal(model.resolveHomeConfigSection('external-activitywatch-time', 'hours'), 'range'));
test('range section keeps month offset', () => assert.equal(model.resolveHomeConfigSection('journal-calendar', 'monthOffset'), 'range'));
test('range section keeps outline depth', () => assert.equal(model.resolveHomeConfigSection('current-document-outline', 'maxDepth'), 'range'));
test('range section keeps target date', () => assert.equal(model.resolveHomeConfigSection('countdown', 'targetDate'), 'content'));
test('display section keeps limit', () => assert.equal(model.resolveHomeConfigSection('today-tasks', 'limit'), 'display'));
test('display section keeps show flags plus list sorting and aggregation controls', () => {
    assert.equal(model.resolveHomeConfigSection('external-news-newsnow', 'showHot'), 'display');
    assert.equal(model.resolveHomeConfigSection('database-list', 'sortBy'), 'display');
    assert.equal(model.resolveHomeConfigSection('recent-updates', 'groupByDocument'), 'display');
});
test('options section catches unknown fields', () => assert.equal(model.resolveHomeConfigSection('plugin', 'custom'), 'options'));
test('deep widget fields stay in semantic sections', () => {
    assert.equal(model.resolveHomeConfigSection('quick-capture', 'initialText'), 'content');
    assert.equal(model.resolveHomeConfigSection('today-reservations', 'overdueDays'), 'range');
    assert.equal(model.resolveHomeConfigSection('plugin-commands', 'plugin'), 'source');
    assert.equal(model.resolveHomeConfigSection('inbox-shorthands', 'page'), 'range');
    assert.equal(model.resolveHomeConfigSection('writing-streak', 'windowDays'), 'range');
    assert.equal(model.resolveHomeConfigSection('note-stats', 'primaryMetric'), 'display');
    assert.equal(model.resolveHomeConfigSection('recent-writing-activity', 'density'), 'display');
    assert.equal(model.resolveHomeConfigSection('today-writing', 'goal'), 'range');
    assert.equal(model.resolveHomeConfigSection('writing-streak', 'dailyGoal'), 'range');
    assert.equal(model.resolveHomeConfigSection('writing-streak', 'metric'), 'display');
});
test('sections omit empty groups', () => assert.deepEqual(model.buildHomeConfigSections([{key: 'limit', type: 'number'}], 'today-tasks').map((x) => x.key), ['display']));
test('sections preserve semantic order', () => assert.deepEqual(model.buildHomeConfigSections(fields, 'recent-edits').map((x) => x.key), ['content', 'source', 'range', 'display']));
test('sections retain field objects', () => assert.equal(model.buildHomeConfigSections(fields, 'recent-edits').find((x) => x.key === 'source').fields[0].key, 'notebook'));
test('sections ignore malformed fields', () => assert.equal(model.buildHomeConfigSections([null, {}, {key: ''}, {key: 'limit', type: 'number'}], 'x').length, 1));
test('weather city placeholder token', () => assert.equal(model.resolveHomeConfigPlaceholder('external-weather-open-meteo', 'city'), 'city'));
test('feed endpoint placeholder token', () => assert.equal(model.resolveHomeConfigPlaceholder('external-news-newsnow', 'endpoint'), 'newsnow-endpoint'));
test('document placeholder token', () => assert.equal(model.resolveHomeConfigPlaceholder('fixed-document', 'docId'), 'document'));
test('unknown placeholder is empty', () => assert.equal(model.resolveHomeConfigPlaceholder('x', 'y'), ''));
test('notebook hint token', () => assert.equal(model.resolveHomeConfigHint('x', {key: 'notebook'}), 'notebook'));
test('network endpoint hint token', () => assert.equal(model.resolveHomeConfigHint('external-news-newsnow', {key: 'endpoint'}), 'network-endpoint'));
test('local endpoint hint token', () => assert.equal(model.resolveHomeConfigHint('external-activitywatch-time', {key: 'endpoint'}), 'local-endpoint'));
test('number hint token', () => assert.equal(model.resolveHomeConfigHint('x', {key: 'limit', type: 'number'}), 'number'));
test('date hint token', () => assert.equal(model.resolveHomeConfigHint('countdown', {key: 'targetDate', type: 'date'}), 'date'));
test('offline integration maps direct source', () => assert.equal(model.resolveHomeConfigIntegration({integration: 'direct'}, 'siyuan'), 'offline'));
test('local integration maps bridge source', () => assert.equal(model.resolveHomeConfigIntegration({integration: 'local-bridge'}, 'siyuan'), 'local'));
test('network integration maps http source', () => assert.equal(model.resolveHomeConfigIntegration({integration: 'http'}, 'siyuan'), 'network'));
test('plugin integration maps third party', () => assert.equal(model.resolveHomeConfigIntegration(null, 'plugin'), 'plugin'));
test('unknown siyuan integration is offline', () => assert.equal(model.resolveHomeConfigIntegration(null, 'siyuan'), 'offline'));
test('draft summary counts configured fields', () => assert.deepEqual(model.summarizeHomeConfigDraft(fields, {}, {title: 'x', notebook: 'nb', days: 3}), {total: 5, configured: 3, changed: 3}));
test('draft summary ignores empty values', () => assert.equal(model.summarizeHomeConfigDraft(fields, {}, {title: '', notebook: '', days: 0}).configured, 1));
test('draft summary compares numeric values semantically', () => assert.equal(model.summarizeHomeConfigDraft([{key: 'limit', type: 'number'}], {limit: 3}, {limit: '3'}).changed, 0));
test('draft summary detects changed select', () => assert.equal(model.summarizeHomeConfigDraft([{key: 'showHot', type: 'select'}], {showHot: '否'}, {showHot: '是'}).changed, 1));
test('draft summary handles malformed schema', () => assert.deepEqual(model.summarizeHomeConfigDraft(null, {}, {}), {total: 0, configured: 0, changed: 0}));
