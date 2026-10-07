const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const home = require(path.join(root, 'src', 'home-model.js'));
const store = require(path.join(root, 'src', 'home-store-model.js'));
const external = require(path.join(root, 'src', 'external-widget-model.js'));
const catalog = require(path.join(root, 'src', 'widget-catalog.js'));
const guide = fs.readFileSync(path.join(root, 'docs', 'component-store-guide.md'), 'utf8');
const map = fs.readFileSync(path.join(root, 'docs', 'component-readiness-map-2026-10-06.md'), 'utf8');

function definitions() {
    return home.DEFAULT_MODULES.map(home.normalizeModuleDefinition).filter(Boolean);
}

test('component readiness map records the current normalized module inventory', () => {
    const modules = definitions();
    assert.equal(modules.length, 58);
    const availability = Object.fromEntries(home.AVAILABILITY_LEVELS.map((key) => [key, 0]));
    modules.forEach((item) => { availability[item.availability] += 1; });
    assert.deepEqual(availability, {ready: 23, conditional: 13, external: 22});
    assert.deepEqual(modules.filter((item) => !item.supportedDevices.includes('mobile')).map((item) => item.moduleId), [
        'external-device-battery', 'external-activitywatch-time',
    ]);
    assert.match(map, /23 `ready`、13 `conditional`、22 `external`/);
});

test('every external production module has source metadata except the explicitly tracked gap', () => {
    const modules = definitions().filter((item) => item.availability === 'external');
    const missing = modules.filter((item) => !store.resolveHomeStoreSourceInfo(item.moduleId) && !store.resolveHomeStoreDependencyInfo(item.moduleId)).map((item) => item.moduleId);
    assert.deepEqual(missing, ['inbox-shorthands']);
    assert.match(map, /`inbox-shorthands` 当前为 external 但没有对应来源摘要或依赖登记/);
    const dependencyIds = Object.keys(store.DEPENDENCY_INFO);
    assert.deepEqual(dependencyIds.filter((id) => !definitions().some((item) => item.moduleId === id)), []);
});

test('external candidate catalog has explicit source, auth, platform, privacy and setup semantics', () => {
    assert.deepEqual(external.summarizeExternalWidgets(), {
        total: 20, builtin: 4, external: 14, conditional: 1, bridge: 0, reference: 1, needsConfiguration: 9,
    });
    const ids = new Set();
    for (const entry of external.EXTERNAL_WIDGET_CATALOG) {
        assert.ok(entry.moduleId && !ids.has(entry.moduleId), `unique moduleId: ${entry.moduleId}`);
        ids.add(entry.moduleId);
        assert.ok(entry.title && entry.providerName && entry.license, `${entry.moduleId} source identity`);
        assert.ok(entry.platforms.length > 0, `${entry.moduleId} platform boundary`);
        assert.ok(external.EXTERNAL_WIDGET_AVAILABILITY.includes(entry.availability));
        assert.ok(external.EXTERNAL_WIDGET_AUTH.includes(entry.auth));
        assert.ok(external.EXTERNAL_WIDGET_INTEGRATIONS.includes(entry.integration));
        assert.ok(external.resolveExternalWidgetPrivacyLevel(entry.privacy) !== 'unknown');
        if (entry.integration === 'http') assert.match(entry.sourceUrl, /^https:\/\//);
        if (entry.auth === 'api-key') assert.ok(external.getExternalWidgetSetupSteps(entry).some((step) => /API Key/.test(step)));
        if (entry.auth === 'user-endpoint') assert.ok(external.getExternalWidgetSetupSteps(entry).some((step) => /端点|地址/.test(step)));
        if (entry.auth === 'local-service') assert.ok(external.getExternalWidgetSetupSteps(entry).some((step) => /本机服务/.test(step)));
    }
    assert.match(guide, /来源徽标|隐私/);
    assert.match(map, /公网 API|自建\/用户端点|本机服务/);
});

test('conditional, reference and health failures expose bounded next actions', () => {
    const tmdb = external.findExternalWidget('external-movie-tmdb');
    const weather = external.findExternalWidget('external-weather-open-meteo');
    const reference = external.findExternalWidget('external-active-window');
    assert.equal(external.describeExternalWidgetStoreState(tmdb).status, 'needs-config');
    assert.equal(external.describeExternalWidgetStoreState(tmdb).action, 'configure');
    assert.equal(external.describeExternalWidgetStoreState(tmdb).canAdd, false);
    assert.equal(external.describeExternalWidgetStoreState(tmdb, {configured: true}).status, 'ready');
    assert.equal(external.describeExternalWidgetStoreState(reference).action, 'learn-more');
    assert.equal(external.describeExternalWidgetStoreState(reference).canAdd, false);
    for (const health of ['error', 'stale', 'offline']) {
        const state = external.describeExternalWidgetStoreState(weather, {health, reason: 'timeout'});
        assert.equal(state.canRetry, true);
        assert.ok(['retry', 'add'].includes(state.action));
    }
    assert.equal(external.describeExternalWidgetStoreState(weather, {health: 'offline'}).status, 'unavailable');
    assert.match(guide, /暂不可用|重试/);
});

test('third-party catalog distinguishes missing, unavailable, ready and orphan states', () => {
    const missing = catalog.resolveWidgetCatalogState([], [], []);
    assert.deepEqual(missing.map((item) => item.status), ['missing', 'missing']);
    const configured = catalog.resolveWidgetCatalogState([], ['calendar-recent-periodic'], []);
    assert.equal(configured.find((item) => item.entry.moduleId === 'calendar-recent-periodic').status, 'unavailable');
    const ready = catalog.resolveWidgetCatalogState(['calendar-recent-periodic'], ['calendar-recent-periodic'], []);
    assert.equal(ready.find((item) => item.entry.moduleId === 'calendar-recent-periodic').status, 'ready');
    const orphan = catalog.resolveWidgetCatalogState([], [], ['provider-removed-widget']);
    assert.equal(orphan[2].status, 'unavailable');
    assert.equal(orphan[2].entry.orphan, true);
    assert.match(map, /目录外但已配置的孤儿实例会进入 `unavailable`/);
});
