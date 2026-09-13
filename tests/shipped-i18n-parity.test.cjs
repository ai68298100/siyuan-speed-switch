/**
 * 归档 i18n 一致性防护（D-218/D-219）
 *
 * locale 文件自 D-218 起以构建期最小化形态进包（源文件保持缩进）。
 * 本门禁保证最小化只是排版变换：包内 JSON 必须可解析，且 key 集合
 * 与 src/i18n 源文件完全一致、两语言互相一致。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const {listZipEntryNames, readZipEntry} = require(path.join(__dirname, 'host', 'lib', 'zip.cjs'));

test('shipped minified i18n parses and matches the source key sets', () => {
    const zip = path.join(root, 'package.zip');
    if (!fs.existsSync(zip)) return;
    const buffer = fs.readFileSync(zip);
    const names = listZipEntryNames(buffer);
    for (const lang of ['en.json', 'zh-CN.json']) {
        const entry = `i18n/${lang}`;
        const source = JSON.parse(fs.readFileSync(path.join(root, 'src', 'i18n', lang), 'utf8'));
        assert.ok(names.includes(entry), `release archive is missing ${entry}`);
        const shipped = JSON.parse(readZipEntry(buffer, entry).toString('utf8'));
        const sourceKeys = Object.keys(source).sort();
        const shippedKeys = Object.keys(shipped).sort();
        assert.deepEqual(shippedKeys, sourceKeys, `shipped ${lang} keys diverge from src/i18n`);
        assert.deepEqual(shipped, source, `shipped ${lang} values diverge from src/i18n`);
    }
});
