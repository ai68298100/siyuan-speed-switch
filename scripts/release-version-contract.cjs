const PACKAGE_VERSION_RE = /^\d+\.\d+\.\d+$/;
const RELEASE_TAG_RE = /^v\d+\.\d+\.\d+$/;

function isPackageVersion(value) {
    return typeof value === 'string' && PACKAGE_VERSION_RE.test(value);
}

function isReleaseTag(value) {
    return typeof value === 'string' && RELEASE_TAG_RE.test(value);
}

function tagForVersion(version) {
    return isPackageVersion(version) ? `v${version}` : null;
}

function validateReleaseMetadata({packageVersion, pluginVersion, tag}) {
    const errors = [];
    if (!isPackageVersion(packageVersion)) errors.push('package version is not a stable semver');
    if (!isPackageVersion(pluginVersion)) errors.push('plugin version is not a stable semver');
    if (isPackageVersion(packageVersion) && pluginVersion !== packageVersion) {
        errors.push('package/plugin version mismatch');
    }
    if (!isReleaseTag(tag)) errors.push('release tag is not a stable v-prefixed semver');
    if (isPackageVersion(packageVersion) && tag !== tagForVersion(packageVersion)) {
        errors.push('tag/package version mismatch');
    }
    return errors;
}

module.exports = {
    PACKAGE_VERSION_RE,
    RELEASE_TAG_RE,
    isPackageVersion,
    isReleaseTag,
    tagForVersion,
    validateReleaseMetadata,
};
