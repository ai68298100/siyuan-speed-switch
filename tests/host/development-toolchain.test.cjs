const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {createRequire} = require('node:module');

// Reuse Webpack's locked semver implementation instead of inventing a range parser.
const semver = createRequire(require.resolve('webpack'))('semver');
const root = path.resolve(__dirname, '..', '..');
const readJson = (file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const project = () => readJson('package.json');

// These readers inspect the indentation-scoped mappings used by our workflows.
// They intentionally reject missing/ambiguous declarations; comments and other
// events/jobs/steps cannot substitute for the actual push filter or setup-node.
function workflowLines(file) {
    return fs.readFileSync(path.join(root, '.github', 'workflows', file), 'utf8')
        .split(/\r?\n/).filter((line) => line.trim() && !line.trimStart().startsWith('#'));
}

function mapping(lines, key, indent) {
    const declaration = new RegExp(`^ {${indent}}${key}:(?:\\s+(.*))?$`);
    const matches = lines.flatMap((line, index) => {
        const match = line.match(declaration);
        return match ? [{index, value: match[1] || ''}] : [];
    });
    assert.equal(matches.length, 1, `expected one ${key} mapping at indentation ${indent}`);
    const {index, value} = matches[0];
    let end = index + 1;
    while (end < lines.length && lines[end].match(/^ */)[0].length > indent) end++;
    return {value, lines: lines.slice(index + 1, end)};
}

function scalar(value) {
    const trimmed = value.trim();
    if (trimmed.startsWith('"')) return JSON.parse(trimmed);
    if (trimmed.startsWith("'")) {
        assert.ok(trimmed.endsWith("'"), 'unterminated YAML single-quoted scalar');
        return trimmed.slice(1, -1).replace(/''/g, "'");
    }
    assert.ok(trimmed && !trimmed.includes('#'), 'expected an explicit YAML scalar');
    return trimmed;
}

function nodeVersion(file, job) {
    const jobs = mapping(workflowLines(file), 'jobs', 0);
    const selectedJob = mapping(jobs.lines, job, 2);
    const steps = mapping(selectedJob.lines, 'steps', 4).lines;
    const starts = steps.flatMap((line, index) => /^ {6}- /.test(line) ? [index] : []);
    const setup = starts.map((start, index) => steps.slice(start, starts[index + 1] ?? steps.length))
        .filter((lines) => lines.some((line) => /^ {8}uses: actions\/setup-node@v\d+$/.test(line)));
    assert.equal(setup.length, 1, `${file} must have exactly one setup-node step in ${job}`);
    return scalar(mapping(mapping(setup[0], 'with', 8).lines, 'node-version', 10).value);
}

test('CI push filter covers the current development branch and retains pull requests', () => {
    const events = mapping(workflowLines('ci.yml'), 'on', 0);
    const push = mapping(events.lines, 'push', 2);
    const branches = mapping(push.lines, 'branches', 4).lines.map((line) => {
        const entry = line.match(/^ {6}- (.+)$/);
        assert.ok(entry, 'CI branches must be explicit list entries');
        return scalar(entry[1]);
    });
    assert.ok(branches.includes('dev/thispc-1002'), 'CI push must include dev/thispc-1002');
    assert.ok(branches.includes('main') && branches.includes('master'),
        'CI push must retain the existing release branches');
    mapping(events.lines, 'pull_request', 2);
});

test('project Node range admits supported releases and rejects incompatible majors and patches', () => {
    const range = project().engines.node;
    assert.ok(semver.validRange(range), 'project must declare a valid Node range');
    for (const version of ['22.22.2', '22.99.0', '24.15.0', '24.99.0', '26.0.0', '27.0.0']) {
        assert.ok(semver.satisfies(version, range), `project Node range must accept ${version}`);
    }
    for (const version of ['18.0.0', '20.19.0', '22.22.1', '23.0.0', '24.14.9', '25.0.0']) {
        assert.equal(semver.satisfies(version, range), false,
            `project Node range must reject ${version}`);
    }
});

test('project Node range satisfies every installed direct development dependency', () => {
    const pkg = project();
    const dependencies = Object.keys(pkg.devDependencies);
    assert.ok(dependencies.length >= 10, 'direct dependency audit must not collapse to an empty set');
    const constrained = dependencies.map((name) => {
        const dependency = readJson(path.join('node_modules', name, 'package.json'));
        return {name, range: dependency.engines?.node};
    }).filter((dependency) => dependency.range);
    assert.ok(constrained.some((dependency) => dependency.name === 'jsdom'),
        'engine audit must include the DOM runtime');
    assert.ok(constrained.some((dependency) => dependency.name === 'sass-loader'),
        'engine audit must include the Sass loader');
    for (const dependency of constrained) {
        assert.ok(semver.subset(pkg.engines.node, dependency.range),
            `project Node range exceeds ${dependency.name} support (${dependency.range})`);
    }
});

for (const [file, job] of [['ci.yml', 'verify'], ['release.yml', 'build-and-release']]) {
    test(`${file} selects an explicit Node version supported by the project and dependencies`, () => {
        const version = nodeVersion(file, job);
        assert.ok(semver.valid(version), `${file} must pin a complete Node version`);
        assert.ok(semver.satisfies(version, project().engines.node),
            `${file} Node ${version} is outside the project engine range`);
        for (const name of Object.keys(project().devDependencies)) {
            const range = readJson(path.join('node_modules', name, 'package.json')).engines?.node;
            if (range) assert.ok(semver.satisfies(version, range),
                `${file} Node ${version} is outside ${name} support (${range})`);
        }
    });
}

test('supported local Node actually starts the DOM and Sass development runtimes', () => {
    assert.ok(semver.satisfies(process.versions.node, project().engines.node),
        `local Node ${process.versions.node} is outside the project engine range`);
    const {JSDOM} = require('jsdom');
    const sass = require('sass');
    const dom = new JSDOM('<!doctype html><button type="button">before</button>');
    try {
        const button = dom.window.document.querySelector('button');
        button.addEventListener('click', () => { button.textContent = 'after'; });
        button.click();
        assert.equal(button.textContent, 'after');
        assert.match(sass.compileString('$color: red; .probe { color: $color; }').css,
            /\.probe\s*\{\s*color: red;/);
    } finally {
        dom.window.close();
    }
});
