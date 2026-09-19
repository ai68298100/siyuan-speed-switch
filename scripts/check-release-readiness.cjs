const fs = require('node:fs');
const path = require('node:path');
const {
    ARCHIVE_DRIFT_TOLERANCE_BYTES,
    parseArtifactSnapshot,
    withinDrift,
} = require('./release-readiness-metrics.cjs');

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
    const snapshot = parseArtifactSnapshot(text);
    if (!snapshot) {
        console.error('release-readiness: required artifact snapshot is missing');
        return 1;
    }
    const archiveDrift = Math.abs(snapshot.archive - archive);
    if (snapshot.bundle !== bundle || !withinDrift(snapshot.archive, archive)) {
        console.error(JSON.stringify({
            documentedBundle: snapshot.bundle,
            bundle,
            documentedArchive: snapshot.archive,
            archive,
            archiveDrift,
            archiveDriftTolerance: ARCHIVE_DRIFT_TOLERANCE_BYTES,
        }, null, 2));
        return 1;
    }
    console.log(`release-readiness: dist/index.js=${bundle}, package.zip=${archive}`);
    return 0;
}

process.exitCode = main();
