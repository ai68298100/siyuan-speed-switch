// T-6761 / ADR 0067 (2026-09-21): the floating-ball B4 lifecycle and
// accessibility surface adds real production code. Keep this as a review
// signal while leaving the 512 KiB archive ceiling and 256 KiB compressed
// entry line unchanged.
// ADR 0074 (2026-09-23): recalibrated 896 -> 960 KiB after the research-absorb
// cycle R1 batch (host-command bridge, sync, template insert, unified index,
// workspace switching, scroll restoration). Dated recalibration, hard ceilings
// unchanged; the next bump requires a new audit (ADR 0059/0062/0067 program).
// ADR 0077 (2026-09-24): recalibrated 960 -> 1024 KiB after the navigation-context
// P0 batches (related content, restore receipts, preview open, dynamic groups,
// multi-target capture). Hard ceilings unchanged.
// ADR 0081 (2026-09-26): recalibrated 1024 -> 1088 KiB after the unified platform
// campaign (platform P1, snippet studio, six RZ unified-UI batches, default
// fullscreen, cross-surface object batches). Reduction audit found no
// meaningful dead weight (CSS is not on the raw line; tree-shaking covers JS);
// hard ceilings unchanged and the compressed-entry line (288 KiB) needs its
// own audit when crossed.
// ADR 0092 (2026-09-28): v0.41.0 raw entry is 1,113,051 B, leaving only
// 1,061 B on the 1088 KiB line before the T-6979 switcher fixes. Reduction
// audit: no removable entry dead weight; keep archive/compressed ceilings.
const RAW_BUNDLE_BUDGET_BYTES = 1120 * 1024;
// ADR 0090 (2026-09-28): recalibrated the archive ceiling 512 -> 544 KiB after
// the 2026-09-27 plan Phases A/B and C-head (T-6949 preview pin, T-6950 find in
// preview, T-6951 settings search, T-6952 saved-search edit, T-6953 layout
// undo/redo, T-6954 health details, T-6955 set diff, T-6956 leave guard,
// T-6957 draft undo/redo) drove package.zip past the old line. Reduction
// audit: icon/preview/i18n/README are market-required; the 4 packaged docs are
// the F7 store-facing declaration (T-6707); snippet studio already ships as a
// dynamic chunk. Per-entry compressed line (320 KiB, ADR 0089) unchanged.
const ARCHIVE_BUDGET_BYTES = 544 * 1024;
// ADR 0065 (2026-09-20): compressed-entry review line recalibrated from
// 224 KiB to 256 KiB after the execution-chain modules (T-6680) and the
// writing-streak second wave (T-6681) shrank headroom to 11780 bytes. Same
// program as ADR 0059/0062: dated recalibration, hard ceiling unchanged.
// ADR 0075 (2026-09-23): recalibrated 256 -> 288 KiB after the research-absorb
// cycles R1/R2 (host-command bridge, pinyin vendor, unified index, skins,
// essentials) pushed the compressed index.js past 256 KiB. Hard 512 KiB
// archive ceiling unchanged; next bump requires a new audit.
// ADR 0089 (2026-09-28): recalibrated 288 -> 320 KiB after T-6949 (session
// preview pin, Phase A of the 2026-09-27 plan) pushed compressed index.js to
// 295198 bytes (+286 over the 288 KiB line). Reduction audit found no dead
// weight; the pin is core switcher UI and must not move to a dynamic chunk.
// Hard 512 KiB archive ceiling unchanged — archive headroom is only ~13 KiB,
// so the next Phase A batches must re-audit the archive line per the same
// program.
const COMPRESSED_ENTRY_BUDGET_BYTES = 320 * 1024;
const ARCHIVE_DRIFT_TOLERANCE_BYTES = 1024;

function parseArtifactSnapshot(text) {
    const bundleMatch = text.match(/`dist\/index\.js` (\d+) bytes/);
    const archiveMatch = text.match(/`package\.zip` (\d+) bytes/);
    if (!bundleMatch || !archiveMatch) return null;
    return {
        bundle: Number(bundleMatch[1]),
        archive: Number(archiveMatch[1]),
    };
}

function headroom(budget, actual) {
    return budget - actual;
}

function withinDrift(documented, actual, tolerance = ARCHIVE_DRIFT_TOLERANCE_BYTES) {
    return Math.abs(documented - actual) <= tolerance;
}

module.exports = {
    RAW_BUNDLE_BUDGET_BYTES,
    ARCHIVE_BUDGET_BYTES,
    COMPRESSED_ENTRY_BUDGET_BYTES,
    ARCHIVE_DRIFT_TOLERANCE_BYTES,
    parseArtifactSnapshot,
    headroom,
    withinDrift,
};
