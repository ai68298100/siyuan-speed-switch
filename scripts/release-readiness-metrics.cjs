// T-6761 / ADR 0067 (2026-09-21): the floating-ball B4 lifecycle and
// accessibility surface adds real production code. Keep this as a review
// signal separate from host limits; the then-current 256 KiB compressed-entry
// line was unchanged by that batch.
// ADR 0074 (2026-09-23): recalibrated 896 -> 960 KiB after the research-absorb
// cycle R1 batch (host-command bridge, sync, template insert, unified index,
// workspace switching, scroll restoration). The other repository budgets were
// unchanged by this recalibration; the next bump requires a new audit (ADR 0059/0062/0067 program).
// ADR 0077 (2026-09-24): recalibrated 960 -> 1024 KiB after the navigation-context
// P0 batches (related content, restore receipts, preview open, dynamic groups,
// multi-target capture). Hard ceilings unchanged.
// ADR 0081 (2026-09-26): recalibrated 1024 -> 1088 KiB after the unified platform
// campaign (platform P1, snippet studio, six RZ unified-UI batches, default
// fullscreen, cross-surface object batches). Reduction audit found no
// meaningful dead weight (CSS is not on the raw line; tree-shaking covers JS);
// the other repository budgets were unchanged, and the then-current compressed-entry
// line (288 KiB) needs its own audit when crossed.
// ADR 0092 (2026-09-28): v0.41.0 raw entry is 1,113,051 B, leaving only
// 1,061 B on the 1088 KiB line before the T-6979 switcher fixes. Reduction
// audit: no removable entry dead weight; keep archive/compressed ceilings.
// ADR 0125 (2026-10-04): the accumulated T-6972/T-6997/T-7000/T-7001/
// T-7006/T-7023/T-7027/T-7028/T-7073~T-7084 production batch reached
// 1,181,710 B. Reduction review found no removable entry dead weight;
// recalibrate the raw observation line 1152 -> 1160 KiB. Archive and
// compressed-entry ceilings remain unchanged.
// ADR 0236 (2026-10-20): 深入穿透检索运行时接线（T-7343）把
// planPenetrationSearchRequest / aggregatePenetrationResults 的穿透分流、
// 跨文档两段式大纲解析与 heading/block 图标分支接入主搜索管线，
// raw 产物增长到 1,189,884 B（净增 ~8.0 KiB）。穿透检索是既有纯模型
// 契约（T-7338/T-7340）的生产兑现，无冗余死重可剥；raw 观察线
// 1160 -> 1164 KiB。归档包与压缩入口上限维持不变（586 KiB / 288 KiB）。
const RAW_BUNDLE_BUDGET_BYTES = 1164 * 1024;
const RAW_BUNDLE_BUDGET_ADR = "0236";
// ADR 0090 (2026-09-28): recalibrated the repository archive budget 512 -> 544 KiB after
// the 2026-09-27 plan Phases A/B and C-head (T-6949 preview pin, T-6950 find in
// preview, T-6951 settings search, T-6952 saved-search edit, T-6953 layout
// undo/redo, T-6954 health details, T-6955 set diff, T-6956 leave guard,
// T-6957 draft undo/redo) drove package.zip past the old line. Reduction
// audit: icon/preview/i18n/README are market-required; the 4 packaged docs are
// the F7 store-facing declaration (T-6707); snippet studio already ships as a
// dynamic chunk. Per-entry compressed line (320 KiB, ADR 0089) unchanged.
// ADR 0180 (2026-10-13): recalibrated 576 -> 578 KiB after measured T-7251/7252
// UI additions; the v0.47.1 package was 589640 B and left only 184 B of headroom.
// ADR 0227 (2026-10-19): recalibrated 578 -> 580 KiB after T-7334 path-acronym-model
// (VS Code 式路径首字母缩写打分) and T-7335 action-palette-model (Raycast 式
// 次级动作画板) production lines; the local v0.47.6 working tree was 591902 B
// and left only -30 B of headroom against 578 KiB. Reduction audit: both
// modules are pure-domain (no DOM, no network), depend only on the existing
// vendor tiny-pinyin, and expose a single re-export through search-model.
// ADR 0229 (2026-10-19): recalibrated 580 -> 582 KiB after T-7336 av-board-model
// (思源原生属性视图轻量只读看板) and T-7337 flashcard-review-model (闪卡间隔重复
// 复习模型：SM-2 调度推演/每日队列/掌握度统计) production lines; the working tree
// package.zip was 594381 B (+461 B over 580 KiB). Reduction audit: both modules
// are pure domain models with zero DOM or network dependencies, and av cell text
// extraction was unified into a single point of truth (saving 336 B).
// ADR 0232 (2026-10-19): recalibrated 582 -> 584 KiB after T-7338 penetration-search-
// model (Obsidian 式深入穿透检索语法), T-7339 action-palette-navigation (次级动作
// 画板键盘导航状态机) and T-7340 action-palette-panel (面板 DOM 模型层与 a11y 契
// 约) production lines; the working tree package.zip was 596819 B (+851 B over
// 582 KiB). Reduction audit: all three modules are pure domain models (zero DOM
// listeners, zero network); action-palette-navigation reuses action-palette-
// model's filterPaletteActions; action-palette-panel reuses the navigation
// state. A bounded-text shared helper module was attempted but produced net
// +43 B after webpack minification and was reverted.
// ADR 0234 (2026-10-19): recalibrated 584 -> 586 KiB after T-7341 action-palette-ui
// (DOM 装配层) and T-7342 penetration-search-orchestration (运行时编排与防注入 SQL 生成)
// production lines; the working tree package.zip was 598398 B (+382 B over 584 KiB).
// Reduction audit: T-7342 is pure domain model, reuses penetration-search-model,
// with safe SQL generation and bounded LIMIT.
// Per-entry compressed line (320 KiB, ADR 0089) unchanged.
const ARCHIVE_BUDGET_BYTES = 586 * 1024;
// ADR 0065 (2026-09-20): compressed-entry review line recalibrated from
// 224 KiB to 256 KiB after the execution-chain modules (T-6680) and the
// writing-streak second wave (T-6681) shrank headroom to 11780 bytes. Same
// program as ADR 0059/0062: dated recalibration, repository budget unchanged.
// ADR 0075 (2026-09-23): recalibrated 256 -> 288 KiB after the research-absorb
// cycles R1/R2 (host-command bridge, pinyin vendor, unified index, skins,
// essentials) pushed the compressed index.js past 256 KiB. The then-current
// repository archive budget (512 KiB) was unchanged; next bump requires a new audit.
// ADR 0089 (2026-09-28): recalibrated 288 -> 320 KiB after T-6949 (session
// preview pin, Phase A of the 2026-09-27 plan) pushed compressed index.js to
// 295198 bytes (+286 over the 288 KiB line). Reduction audit found no dead
// weight; the pin is core switcher UI and must not move to a dynamic chunk.
// The then-current repository archive budget was 512 KiB — archive headroom was only ~13 KiB,
// so the next Phase A batches had to re-audit it per the same
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
    RAW_BUNDLE_BUDGET_ADR,
    ARCHIVE_BUDGET_BYTES,
    COMPRESSED_ENTRY_BUDGET_BYTES,
    ARCHIVE_DRIFT_TOLERANCE_BYTES,
    parseArtifactSnapshot,
    headroom,
    withinDrift,
};
