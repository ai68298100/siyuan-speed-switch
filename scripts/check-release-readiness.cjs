const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const readinessPath = path.join(root, 'docs', 'release-readiness.md');
const bundlePath = path.join(root, 'dist', 'index.js');
const archivePath = path.join(root, 'package.zip');

function size(file) {
    return fs.existsSync(file) ? fs.statSync(file).size : null;
}

function main() {
    const bundle = size(bundlePath);
    const archive = size(archivePath);
    if (bundle === null || archive === null) {
        console.log('release-readiness: build artifacts absent; run pnpm build first');
        return 0;
    }
    const text = fs.readFileSync(readinessPath, 'utf8');
    const bundleMatch = text.match(/`dist\/index\.js` (\d+) bytes/);
    const archiveMatch = text.match(/`package\.zip` (\d+) bytes/);
    if (!bundleMatch || !archiveMatch) {
        console.error('release-readiness: required artifact snapshot is missing');
        return 1;
    }
    const documentedBundle = Number(bundleMatch[1]);
    const documentedArchive = Number(archiveMatch[1]);
    const archiveDrift = Math.abs(documentedArchive - archive);
    if (documentedBundle !== bundle || archiveDrift > 1024) {
        console.error(JSON.stringify({
            documentedBundle,
            bundle,
            documentedArchive,
            archive,
            archiveDrift,
        }, null, 2));
        return 1;
    }
    console.log(`release-readiness: dist/index.js=${bundle}, package.zip=${archive}`);
    return 0;
}

process.exitCode = main();
