// T-7174：组件依赖指南双语化契约（双语 key 一致 + 消费点迁移 + 检测器自检负向验证）。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {readSourceFile} = require('./source-scan.cjs');

const index = readSourceFile('src/index.ts');
const zh = JSON.parse(fs.readFileSync('src/i18n/zh-CN.json', 'utf8'));
const en = JSON.parse(fs.readFileSync('src/i18n/en.json', 'utf8'));

const KEYS = [
    'homeStoreDependencyTitle',
    'homeStoreDependencySummary',
    'homeStoreDependencyListLabel',
    'homeStoreDependencyRequired',
    'homeStoreDependencyOptional',
    'homeStoreDependencyInstall',
    'homeStoreDependencyInstallAria',
    'homeStoreDependencyLink',
];

test('all dependency-guide keys exist in both locales with matching placeholders', () => {
    for (const key of KEYS) {
        assert.ok(zh[key], `zh 缺 ${key}`);
        assert.ok(en[key], `en 缺 ${key}`);
    }
    const placeholders = (t) => (t.match(/\{[a-z]+\}/g) || []).sort().join(',');
    assert.equal(placeholders(zh.homeStoreDependencySummary), placeholders(en.homeStoreDependencySummary), '统计句占位符必须一致');
    assert.equal(placeholders(zh.homeStoreDependencyInstallAria), placeholders(en.homeStoreDependencyInstallAria), 'aria 占位符必须一致');
});

test('dependency guide consumes i18n instead of hardcoded Chinese (T-7174)', () => {
    const guideStart = index.indexOf('private openHomeWidgetGuide');
    const body = index.slice(guideStart, index.indexOf('\n    }\n', guideStart) + 6);
    for (const literal of ['非思源本体依赖', '需前置依赖', '可选数据源', '安装地址', '查看非思源组件安装说明']) {
        assert.doesNotMatch(body, new RegExp(`textContent[^;]*"${literal}"`), `硬编码中文必须迁移：${literal}`);
    }
    for (const key of ['homeStoreDependencyTitle', 'homeStoreDependencySummary', 'homeStoreDependencyListLabel', 'homeStoreDependencyInstall', 'homeStoreDependencyLink']) {
        assert.match(body, new RegExp(`this\\.i18n\\.${key}`), `必须消费 this.i18n.${key}`);
    }
    // info.setup 是数据层内容（DEPENDENCY_INFO），保留原文不属 UI chrome
    assert.match(body, /setup\.textContent = info\.setup;/, 'setup 数据文本保留');
});

test('detector self-check: hardcoded badge is caught (negative verification)', () => {
    const legacy = 'badge.textContent = info.required ? "需前置依赖" : "可选数据源";';
    assert.match(legacy, /"需前置依赖"/, '硬编码徽标必须可被识别');
    const current = index.slice(index.indexOf('private openHomeWidgetGuide'));
    assert.doesNotMatch(current, /textContent = info\.required \? "需前置依赖"/, '真实源码必须走 i18n');
});
