"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const {spawnSync} = require("node:child_process");

const digest = (value) => crypto.createHash("sha256").update(value).digest("hex");

function runProbes(root, probes) {
    for (const probe of probes) {
        const target = path.resolve(root, probe.target);
        const allowed = target === path.resolve(root, "BLOCKERS.md")
            || ["src", "scripts", "docs"].some((directory) => target.startsWith(path.resolve(root, directory) + path.sep));
        if (!allowed || target.startsWith(path.resolve(root, "docs", "archive") + path.sep)) throw new Error("probe target must be a current project file");
        const cli = Array.isArray(probe.command);
        const testFile = cli ? null : path.resolve(root, probe.test);
        if (!cli && !testFile.startsWith(path.resolve(root, "tests") + path.sep)) throw new Error("probe test must remain in tests");
        if (cli && (probe.command.length !== 2 || probe.command[0] !== "node"
            || !path.resolve(root, probe.command[1]).startsWith(path.resolve(root, "scripts") + path.sep))) throw new Error("probe command must name a project Node script");
        if (typeof probe.find !== "string" || !probe.find || typeof probe.replace !== "string"
            || typeof probe.expected !== "string" || !probe.expected) throw new Error("invalid probe");
        const original = fs.readFileSync(target);
        const source = original.toString("utf8");
        if (source.split(probe.find).length !== 2) throw new Error("probe anchor must occur exactly once: " + probe.target);
        const newline = source.includes("\r\n") ? "\r\n" : "\n";
        const replacement = probe.replace.replace(/\r?\n/g, newline);
        const escaped = probe.expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const run = () => spawnSync(process.execPath, cli ? [path.resolve(root, probe.command[1])]
            : ["--test", "--test-reporter=tap", "--test-name-pattern=^" + escaped + "$", testFile],
            {cwd: root, encoding: "utf8", timeout: 60000, maxBuffer: 4 * 1024 * 1024});
        const baseline = run();
        const positive = cli ? probe.expected.replace(/^FAIL /, "PASS ") : "ok 1 - " + probe.expected;
        if (baseline.error || baseline.status !== 0 || !baseline.stdout.split(/\r?\n/).includes(positive)) {
            throw new Error("probe baseline failed: " + probe.expected + "\n" + baseline.stdout + baseline.stderr);
        }
        try {
            fs.writeFileSync(target, source.replace(probe.find, replacement));
            const result = run();
            const failed = cli ? result.stdout.split(/\r?\n/).filter((line) => line.startsWith("FAIL "))
                : Array.from(result.stdout.matchAll(/^not ok \d+ - (.+)$/gm), (match) => match[1]);
            if (result.error || result.status === 0 || !failed.includes(probe.expected)) {
                throw new Error("expected failure missing: " + probe.expected + "\n" + result.stdout + result.stderr);
            }
            process.stdout.write(JSON.stringify({target: probe.target, injected: replacement, failed}) + "\n");
        } finally {
            fs.writeFileSync(target, original);
            if (!fs.readFileSync(target).equals(original)) throw new Error("probe restoration mismatch: " + probe.target);
            process.stdout.write(JSON.stringify({restored: probe.target, sha256: digest(original)}) + "\n");
        }
    }
}

if (require.main === module) {
    const manifest = process.argv[2];
    if (!manifest) throw new Error("usage: node scripts/contract-probe.cjs tests/fixtures/probes.json");
    runProbes(path.resolve(__dirname, ".."), JSON.parse(fs.readFileSync(manifest, "utf8")));
}

module.exports = {runProbes};
