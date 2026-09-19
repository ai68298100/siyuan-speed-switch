const fs = require('node:fs');
const path = require('node:path');
const {
    tagForVersion,
    validateReleaseMetadata,
} = require('./release-version-contract.cjs');

const root = path.resolve(__dirname, '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const pluginJson = JSON.parse(fs.readFileSync(path.join(root, 'plugin.json'), 'utf8'));
const tag = process.env.GITHUB_REF_NAME;
const errors = validateReleaseMetadata({
    packageVersion: packageJson.version,
    pluginVersion: pluginJson.version,
    tag,
});

if (errors.length) {
    console.error(`Tag/package/plugin version mismatch: ${errors.join('; ')}`);
    process.exitCode = 1;
} else {
    console.log(`release-version-preflight: ${tag} matches package/plugin ${tagForVersion(packageJson.version)}`);
}
