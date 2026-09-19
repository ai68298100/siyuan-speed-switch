const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {spawnSync} = require('node:child_process');

const root = path.resolve(__dirname, '..');
const artifacts = ['dist/index.js', 'dist/index.css', 'package.zip'];

function snapshot() {
    return Object.fromEntries(artifacts.map((relative) => {
        const file = path.join(root, relative);
        if (!fs.existsSync(file)) throw new Error(`missing build artifact: ${relative}`);
        const bytes = fs.readFileSync(file);
        return [relative, {bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex')}];
    }));
}

function build(round) {
    console.log(`reproducible-build: production build ${round}/2`);
    const command = process.platform === 'win32' ? (process.env.ComSpec || 'cmd.exe') : 'pnpm';
    const args = process.platform === 'win32' ? ['/d', '/s', '/c', 'pnpm build'] : ['build'];
    const result = spawnSync(command, args, {cwd: root, stdio: 'inherit'});
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`pnpm build failed with exit code ${result.status}`);
}

function main() {
    const snapshots = [];
    for (let round = 1; round <= 2; round += 1) {
        build(round);
        snapshots.push(snapshot());
    }
    const drift = artifacts.flatMap((relative) => {
        const first = snapshots[0][relative];
        const second = snapshots[1][relative];
        return first.bytes === second.bytes && first.sha256 === second.sha256 ? [] : [relative];
    });
    if (drift.length > 0) {
        console.error(JSON.stringify({drift, first: snapshots[0], second: snapshots[1]}, null, 2));
        return 1;
    }
    console.log(`reproducible-build: ${artifacts.length}/${artifacts.length} artifacts match across two builds`);
    return 0;
}

try {
    process.exitCode = main();
} catch (error) {
    console.error(`reproducible-build: ${error.message}`);
    process.exitCode = 1;
}
