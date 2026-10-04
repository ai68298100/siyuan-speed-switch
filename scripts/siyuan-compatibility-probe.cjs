const fs = require("node:fs");
const path = require("node:path");
const {normalizeTitleSearchDocuments} = require("../src/search-model.js");
const {normalizePathFilterListResponse} = require("../src/path-filter-model.js");

const ROOT = path.resolve(__dirname, "..");
const FIXTURE_PATH = path.join(ROOT, "tests", "fixtures", "siyuan-compatibility-probes.json");

function fail(message) { throw new Error(`siyuan-compatibility-probe: ${message}`); }
function expect(condition, message) { if (!condition) fail(message); }

function readFixture(fixturePath = FIXTURE_PATH) {
    try { return JSON.parse(fs.readFileSync(fixturePath, "utf8")); }
    catch (error) { fail(`无法读取 fixture：${error.message}`); }
}

function assertExpectedFields(actual, expected, label) {
    for (const [key, value] of Object.entries(expected || {})) {
        if (actual?.[key] !== value) fail(`${label}.${key} 期望 ${JSON.stringify(value)}，实际 ${JSON.stringify(actual?.[key])}`);
    }
}

function runCompatibilityProbe({fixture = readFixture(), sourceText} = {}) {
    expect(fixture && fixture.schemaVersion === 1, "fixture schemaVersion 必须为 1");
    expect(fixture.task === "T-7114", "fixture task 必须为 T-7114");
    expect(Array.isArray(fixture.versions) && fixture.versions.length >= 2, "必须同时保留至少两个思源版本形状");
    const evidence = [...(fixture.evidence || []), ...fixture.versions.map((entry) => entry.evidence)];
    for (const relative of evidence) {
        expect(typeof relative === "string" && relative && fs.existsSync(path.resolve(ROOT, relative)), `证据文件不存在：${relative}`);
    }

    const versionReports = fixture.versions.map((entry) => {
        expect(/^3\.8\.\d+(?:-[^/]+)?$/.test(entry.version), `版本号不属于 3.8.x：${entry.version}`);
        const title = normalizeTitleSearchDocuments([entry.titleSearch.record]);
        expect(title.length === 1, `${entry.version} 标题路径记录未归一化为一个结果`);
        assertExpectedFields(title[0], entry.titleSearch.expected, `${entry.version} titleSearch`);

        const pathResult = normalizePathFilterListResponse(entry.pathFilter.payload, {
            notebook: entry.pathFilter.notebook,
            path: entry.pathFilter.path,
        });
        expect(pathResult.ok === true, `${entry.version} 路径筛选响应未被识别为 ready`);
        expect(pathResult.items.length === 1, `${entry.version} 路径筛选应保留一个安全条目`);
        assertExpectedFields(pathResult.items[0], entry.pathFilter.expected, `${entry.version} pathFilter`);
        return {
            version: entry.version,
            titleShape: entry.titleSearch.shape,
            titleFields: Object.keys(entry.titleSearch.record).sort(),
            pathFields: Object.keys(entry.pathFilter.payload.data).sort(),
            pathFileFields: Object.keys(entry.pathFilter.payload.data.files[0]).sort(),
        };
    });

    const aliasReports = (fixture.aliases || []).map((entry) => {
        const [result] = normalizeTitleSearchDocuments([entry.record]);
        expect(result, `响应别名用例未得到结果：${entry.name}`);
        assertExpectedFields(result, entry.expected, `alias ${entry.name}`);
        return {name: entry.name, fields: Object.keys(entry.record).sort()};
    });

    const source = sourceText === undefined
        ? fs.readFileSync(path.join(ROOT, fixture.lifecycle.source), "utf8")
        : sourceText;
    for (const required of fixture.lifecycle.required || []) {
        expect(source.includes(required), `生命周期接线缺失：${required}`);
    }

    return {
        task: fixture.task,
        schemaVersion: fixture.schemaVersion,
        versions: versionReports,
        aliases: aliasReports,
        lifecycle: {source: fixture.lifecycle.source, checked: fixture.lifecycle.required.length},
    };
}

if (require.main === module) {
    try {
        const report = runCompatibilityProbe();
        console.log(`siyuan-compatibility-probe: ${report.versions.length} versions, ${report.aliases.length} alias cases valid`);
        console.log(JSON.stringify(report));
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}

module.exports = {runCompatibilityProbe, readFixture};
