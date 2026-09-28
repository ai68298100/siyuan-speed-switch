// T-6971 批次③：天气与空气规格接线契约——心跳族归属、AQI 六档文字双通道、
// 数值钳制防注入、隐私语义。
const test = require('node:test');
const assert = require('node:assert/strict');
const {readSourceFile} = require('./source-scan.cjs');

const adapters = readSourceFile('src/home-external-adapters.ts');
const panel = readSourceFile('src/second-panel-ui.ts');
const homeModel = readSourceFile('src/home-model.js');
const airModel = readSourceFile('src/air-quality-model.js');

test('weather/air wiring: both widgets join the 15-minute life heartbeat family', () => {
    // T-6967 S2：心跳族成员唯一登记在 home-model（工作台心跳与商店
    // 详情「刷新」行同源消费）；放 home-model 而非 external-widget-model，
    // 避免为 11 个 id 把 46 KB 目录模块拉进主包（包体自律）。
    assert.match(homeModel, /const LIFE_HEARTBEAT_MODULE_IDS = Object\.freeze\(\[\s*\n\s*"external-weather-open-meteo",\s*\n\s*"external-air-quality",/,
        '天气与空气质量都必须登记在共享 15 分钟心跳族清单头部');
    assert.match(panel, /const lifeModuleIds = new Set\(LIFE_HEARTBEAT_MODULE_IDS\)/,
        '工作台心跳必须消费共享清单（不再内联副本）');
    assert.match(adapters, /register\("external-weather-open-meteo"/);
    assert.match(adapters, /register\("external-air-quality"/);
});

test('air quality wiring: six-band labels wired so colors always carry text', () => {
    assert.match(adapters, /homeAirBandGood, this\.i18n\.homeAirBandFair, this\.i18n\.homeAirBandModerate, this\.i18n\.homeAirBandPoor, this\.i18n\.homeAirBandVeryPoor, this\.i18n\.homeAirBandExtreme/,
        '六档文字必须全部接线（色阶配文字红线）');
    assert.match(airModel, /if \(value <= 20\) return 0;/, '欧洲 AQI 六档阈值锚定');
    assert.match(airModel, /Math\.min\(500, Math\.max\(0, Math\.round\(Number\(aqi\)\)\)\)/, 'AQI 钳制 0..500');
});

test('weather wiring: Open-Meteo config clamps and privacy semantics stay pinned', () => {
    assert.match(adapters, /const normalized = normalizeWeatherConfig\(config\);/, '天气配置必须经归一化钳制');
    assert.match(adapters, /normalized\.city\.length < 2\) return \{emptyHint: this\.i18n\.homeWeatherConfigHint/,
        '未填城市 = 配置指引空态（不伪造数据）');
    assert.match(adapters, /normalized\.city\.length < 2\) return \{emptyHint: this\.i18n\.homeAirConfigHint/,
        '空气质量同款配置指引');
});
