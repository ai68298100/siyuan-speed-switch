const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {readSourceFile} = require('./source-scan.cjs');

const root = path.resolve(__dirname, '..');
const styleDir = path.join(root, 'src', 'styles');
const tiers = new Map([
    ['4px', '--sw-space-xs'], ['6px', '--sw-space-sm'], ['8px', '--sw-space-md'],
    ['12px', '--sw-space-lg'], ['16px', '--sw-space-xl'], ['24px', '--sw-space-2xl'],
]);
const spacingProperty = /^(?:gap|row-gap|column-gap|padding(?:-(?:top|right|bottom|left|inline|block|inline-start|inline-end|block-start|block-end))?|margin(?:-(?:top|right|bottom|left|inline|block|inline-start|inline-end|block-start|block-end))?)$/;

function topLevelParts(value) {
    const parts = [];
    let start = -1;
    let depth = 0;
    let quote = '';
    for (let index = 0; index < value.length; index += 1) {
        const char = value[index];
        if (quote) {
            if (char === '\\') index += 1;
            else if (char === quote) quote = '';
            continue;
        }
        if (char === '"' || char === "'") { quote = char; if (start < 0) start = index; continue; }
        if (char === '(') { depth += 1; if (start < 0) start = index; continue; }
        if (char === ')') { depth -= 1; continue; }
        if (/\s/.test(char) && depth === 0) {
            if (start >= 0) parts.push(value.slice(start, index));
            start = -1;
        } else if (start < 0) start = index;
    }
    if (start >= 0) parts.push(value.slice(start));
    return parts;
}

function unTokenizedTierSpacing(source) {
    const violations = [];
    const declaration = /(?<![\w-])([\w-]+)\s*:\s*([^;{}]+);/g;
    for (const match of source.matchAll(declaration)) {
        if (!spacingProperty.test(match[1]) || /var\s*\(|\$sw-/.test(match[2])) continue;
        for (const part of topLevelParts(match[2])) {
            if (tiers.has(part)) violations.push(`${match[1]}: ${part}`);
        }
    }
    return violations;
}

test('detector self-check: a direct spacing tier is caught', () => {
    assert.deepEqual(unTokenizedTierSpacing('.probe { padding: 8px 10px; }'), ['padding: 8px']);
    assert.deepEqual(unTokenizedTierSpacing('.probe { padding: calc(8px + env(x, 0px)); }'), []);
});

test('production spacing tiers use shared tokens instead of repeated literals', () => {
    const files = fs.readdirSync(styleDir).filter((file) => file.endsWith('.scss'));
    assert.ok(files.length >= 10, `style scan unexpectedly small: ${files.length}`);
    for (const file of files) {
        const violations = unTokenizedTierSpacing(readSourceFile(`src/styles/${file}`));
        assert.deepEqual(violations, [], `${file}: exact spacing tiers must use shared tokens`);
    }
});

test('spacing Sass tiers are the single source for runtime variables', () => {
    const tokens = readSourceFile('src/styles/_00-tokens.scss');
    for (const [value, token] of tiers) {
        const name = token.replace('--', '$');
        assert.ok(tokens.includes(`${name}: ${value};`), `missing compile-time tier ${name}`);
        assert.ok(tokens.includes(`${token}: #{${name}};`), `runtime token ${token} must use ${name}`);
    }
});
