const CODES = Object.freeze({
    build: 'BUILD_FAILED',
    resource: 'RESOURCE_MISSING',
    manifest: 'MANIFEST_MISMATCH',
    remote: 'REMOTE_DEPENDENCY',
    environment: 'ENVIRONMENT_DRIFT',
    unknown: 'RELEASE_UNKNOWN',
});

function classifyReleaseFailure(input) {
    const kind = typeof input?.kind === 'string' ? input.kind : 'unknown';
    return {code: CODES[kind] || CODES.unknown, message: String(input?.message || '').slice(0, 160)};
}

function formatReleaseDiagnostics(failures) {
    if (!Array.isArray(failures) || failures.length === 0) return 'RELEASE_OK';
    return failures.slice(0, 8).map(classifyReleaseFailure)
        .map((item) => `${item.code}: ${item.message || 'no details'}`).join('\n').slice(0, 480);
}

module.exports = {classifyReleaseFailure, formatReleaseDiagnostics};
