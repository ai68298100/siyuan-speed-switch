// Reproducible declaration audit. This is an ignored artifact, not a gate.
// Usage: node .artifacts/token-audit.cjs [--revision HEAD] [--output path]
//        node .artifacts/token-audit.cjs --before --output .artifacts/token-audit-before.json
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const argument = (name) => args.includes(name) ? args[args.indexOf(name) + 1] : null;
const git = (...params) => execFileSync('git', params, { cwd: root, encoding: 'utf8' }).trim();
const categories = {
    spacing: /^(?:gap|row-gap|column-gap|padding(?:-(?:top|right|bottom|left|inline|block|inline-start|inline-end|block-start|block-end))?|margin(?:-(?:top|right|bottom|left|inline|block|inline-start|inline-end|block-start|block-end))?)$/,
    fontSize: /^font-size$/,
    lineHeight: /^line-height$/,
    fontWeight: /^font-weight$/,
    radius: /^border(?:-(?:top-left|top-right|bottom-left|bottom-right))?-radius$/,
    shadow: /^(?:box-shadow|text-shadow)$/,
    layer: /^z-index$/,
    color: /^(?:color|background(?:-color)?|border(?:-(?:top|right|bottom|left))?-color|fill|stroke|outline-color)$/,
    motion: /^(?:transition|animation(?:-duration)?)$/,
};
function removeComments(source) {
    return source.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\r\n]/g, ' '))
        .replace(/\/\/[^\r\n]*/g, (comment) => ' '.repeat(comment.length));
}
function snapshot(revision) {
    const files = revision
        ? git('ls-tree', '-r', '--name-only', revision, '--', 'src').split('\n').filter((file) => file.endsWith('.scss'))
        : ['src/index.scss', ...fs.readdirSync(path.join(root, 'src/styles')).filter((file) => file.endsWith('.scss')).map((file) => `src/styles/${file}`)];
    const metrics = Object.fromEntries(Object.keys(categories).map((key) => [key, { total: 0, tokenized: 0, literals: {} }]));
    const declarations = [];
    for (const file of files.sort()) {
        const original = revision ? git('show', `${revision}:${file}`) : fs.readFileSync(path.join(root, file), 'utf8');
        const source = removeComments(original);
        for (const match of source.matchAll(/(?<![\w-])([\w-]+)\s*:\s*([^;{}]+);/g)) {
            const property = match[1];
            if (property.startsWith('--')) continue;
            const category = Object.keys(categories).find((key) => categories[key].test(property));
            if (!category) continue;
            const value = match[2].trim().replace(/\s+/g, ' ');
            const tokenized = /var\s*\(|\$sw-/.test(value);
            const row = { file, line: source.slice(0, match.index).split('\n').length, property, value, tokenized, category };
            declarations.push(row);
            metrics[category].total++;
            if (tokenized) metrics[category].tokenized++;
            else metrics[category].literals[value] = (metrics[category].literals[value] || 0) + 1;
        }
    }
    for (const row of Object.values(metrics)) {
        row.coveragePercent = Number((100 * row.tokenized / row.total).toFixed(2));
        row.literalDeclarations = row.total - row.tokenized;
        row.uniqueLiteralValues = Object.keys(row.literals).length;
        row.literals = Object.fromEntries(Object.entries(row.literals).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
    }
    return {
        source: revision || 'working-tree',
        commit: revision ? git('rev-parse', revision) : git('rev-parse', 'HEAD'),
        fileCount: files.length,
        files,
        metrics,
        candidates: {
            equalGapTiers: declarations.filter((row) => row.property === 'gap' && !row.tokenized && /^(4|6|8)px$/.test(row.value)),
            equalFontTiers: declarations.filter((row) => row.property === 'font-size' && !row.tokenized && /^(10|12|13)px$/.test(row.value)),
            focusedTypography: declarations.filter((row) => /_(platform-shell|11-ui-polish|12-r54-surface-adapter)\.scss$/.test(row.file) && /^(line-height|font-weight)$/.test(row.property)),
        },
    };
}
const result = {
    measuredAt: new Date().toISOString(),
    countingRule: '17 SCSS files; comments removed; declarations counted once; custom property definitions excluded; any CSS var() or $sw-* counts as tokenized. Keywords such as 0/auto/none remain in the total. This is source coverage, not visual or semantic equivalence.',
    ...(args.includes('--before') ? { head: snapshot('HEAD'), current: snapshot(null) } : snapshot(argument('--revision'))),
};
const output = argument('--output');
if (output) fs.writeFileSync(path.resolve(root, output), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(args.includes('--before') ? { head: result.head.metrics, current: result.current.metrics } : result.metrics, null, 2));
