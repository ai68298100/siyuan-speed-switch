// T-6971 批次③：天气与空气规格接线契约——心跳族归属、AQI 六档文字双通道、
// 数值钳制防注入、隐私语义。
const test = require('node:test');
const assert = require('node:assert/strict');
const {readSourceFile} = require('./source-scan.cjs');

const adapters = readSourceFile('src/home-external-adapters.ts');
const panel = readSourceFile('src/second-panel-ui.ts');
const airModel = readSourceFile('src/air-quality-model.js');

test('weather/air wiring: both widgets join the 15-minute life heartbeat family', () => {
    assert.match(panel, /const lifeModuleIds = new Set\(\["external-weather-open-meteo", "external-air-quality", "external-anime-bangumi"/,
        '天气与空气质量都必须在 15 分钟心跳族');
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
