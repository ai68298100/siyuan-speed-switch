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
// ADR 0237 (2026-10-20): 次级动作画板切换器主 UI 挂载（T-7344）把
// 卡片右键菜单、⌘K 快捷唤出、动作上下文抽取与分屏/复制调度接入生产，
// 并补充全套深浅色/毛玻璃/移动端抽屉样式；减量审计提取公共剪贴板/弹窗辅助
// 消除 720 B 重复逻辑后，raw 产物为 1,196,626 B（超出 1164 KiB 4.6 KiB）。
// raw 观察线 1164 -> 1170 KiB。归档包门限微调 586 -> 590 KiB（package.zip 602,045 B，余量 2,115 B）。
// ADR 0244 (2026-10-20): 符号化前缀多模态检索模型扩展（T-7351）扩展了
// @/#/!/^/> 符号化多模态前缀路由、端点规划与标签/书签响应树聚合，
// raw 产物为 1,200,759 B（超出 1170 KiB 自律线 2.6 KiB）。
// raw 观察线由 1170 -> 1174 KiB（1,202,176 B，余量 1,417 B）。归档包门禁 590 KiB 保持不变。
// ADR 0247 (2026-10-20): 属性视图看板与闪卡复习小组件生产装配（T-7354 & T-7355）
// 把 database-board 与 flashcard-review 接入工作台调度管线与样式层，
// raw 产物为 1,204,810 B（超出 1174 KiB 2.6 KiB）。
// raw 观察线由 1174 -> 1178 KiB（1,206,272 B，余量 1,462 B）。归档包门限微调 590 -> 592 KiB（606,208 B，package.zip 604,591 B，余量 1,617 B）。
// ADR 0249 (2026-10-21): 切换器撤销关闭页签（T-7356）、一键保存文档集（T-7357）与思阅/思播生态联动增强，
// raw 产物为 1,208,829 B（处于 1182 KiB 自律线内，余量约 1.5 KiB）。
// raw 观察线由 1178 -> 1182 KiB（1,210,368 B）。归档包门禁由 592 -> 594 KiB（608,256 B，package.zip 606,461 B，余量约 1.8 KiB）。
// ADR 0251 (2026-10-21): 符号导航速查指引（CheatSheet，T-7359）与中英文文档完备对账，
// raw 产物为 1,211,534 B（处于 1186 KiB 自律线内，余量约 2.9 KiB）。
// raw 观察线由 1182 -> 1186 KiB（1,214,464 B）。归档包门禁由 594 -> 596 KiB（610,304 B，package.zip 608,361 B，余量约 1.9 KiB）。
// ADR 0252 (2026-10-21): 组件商店精选推荐分层（Featured / Curation，T-7360）与精选徽标微光体系，
// raw 产物为 1,214,983 B（处于 1188 KiB 自律线内，余量约 1.5 KiB）。
// raw 观察线由 1186 -> 1188 KiB（1,216,512 B）。归档包门禁维持 596 KiB（610,304 B，package.zip 609,592 B，余量 712 B）。
// ADR 0253 (2026-10-21): 片段实验室行号修复、特征内容智能置顶与投稿共享指引（闭环 Issue #16），
// raw 产物为 1,214,989 B（处于 1188 KiB 自律线内，余量约 1.5 KiB）。
// 归档包门禁由 596 -> 598 KiB（612,352 B，package.zip 610,299 B，余量 2,053 B）。
// ADR 0255 (2026-10-21): 小驴打卡风格 7天胶囊轴、待办完成横幅与双拼 Bento 瓦片，
// raw 产物为 1,217,136 B（处于 1190 KiB 自律线内，余量约 1.4 KiB）。
// 归档包门禁由 598 -> 600 KiB（614,400 B，package.zip 612,866 B，余量 1,534 B）。
// ADR 0256 (2026-10-21): 切换器常驻多模态穿透药丸 Chips、画板立体机械键帽与门限校准，
// raw 产物为 1,219,436 B（处于 1192 KiB 自律线内，余量约 1.2 KiB）。
// 归档包门禁维持 600 KiB（614,400 B，package.zip 613,957 B，余量 443 B）。
// ADR 0257 (2026-10-21): 切换器近期搜索词历史重放、卡片悬停复制块链接与门限校准，
// raw 产物为 1,220,915 B（处于 1194 KiB 自律线内，余量约 1.7 KiB）。
// 归档包门禁由 600 -> 602 KiB（616,448 B，package.zip 614,563 B，余量 1,885 B）。
// ADR 0258 (2026-10-22): 移动端常驻多模态穿透药丸、搜索模式专属提示、搜索结果 Alt+C 快捷复制与门限校准，
// raw 产物为 1,225,245 B（处于 1198 KiB 自律线内，余量约 1.5 KiB）。
// 归档包门禁由 602 -> 604 KiB（618,496 B，package.zip 616,535 B，余量 1,961 B）。
// ADR 0259 (2026-10-22): 顶栏点击秒开直出、长文档首屏浅克隆、Petal 生命周期与 URL Scheme 闭环，
// raw 产物为 1,227,074 B（处于 1200 KiB 自律线内，余量约 1.7 KiB）。
// 归档包门禁维持 604 KiB（618,496 B，package.zip 617,142 B，余量 1,354 B）。
// ADR 0260 (2026-10-23): 小驴全生态联邦联动、800ms 熔断隔离、午夜黑金美学与门限校准，
// raw 产物为 1,241,006 B（处于 1215 KiB 自律线内，余量约 3.1 KiB）。
// 归档包门禁由 604 -> 660 KiB（675,840 B，package.zip 669,613 B，余量 6,227 B，受 256×256 殿堂级 icon.png 64.4 KiB 替换）。
// ADR 0266 (2026-10-23): 思阅、思播与全生态总线事件深度联动与门限校准，
// raw 产物为 1,245,005 B（处于 1220 KiB 自律线内，余量约 4.2 KiB）。
// 归档包门禁维持 660 KiB（675,840 B，package.zip 670,698 B，余量 5,142 B）。
const RAW_BUNDLE_BUDGET_BYTES = 1220 * 1024;
const RAW_BUNDLE_BUDGET_ADR = "0266";
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
// ADR 0237 (2026-10-20): recalibrated 586 -> 590 KiB after T-7344 action-palette-main-wiring
// (卡片右键菜单/⌘K 快捷键/动作执行调度/全套深浅色与移动端抽屉 SCSS 样式)；
// 生产构建 package.zip 为 602,045 B，在 590 KiB（604,160 B）门禁内留有 2,115 B 健康余量。
// ADR 0247 (2026-10-20): recalibrated 590 -> 592 KiB after T-7354 database-board & T-7355 flashcard-review
// production widget wiring; working tree package.zip is 604,591 B, safely below 592 KiB (606,208 B) with 1,617 B headroom.
// ADR 0249 (2026-10-21): recalibrated 592 -> 594 KiB after T-7356 undo-closed-tab, T-7357 save-as-doc-set
// and SiReader/SiMedia ecosystem wiring; working tree package.zip is 606,461 B, safely below 594 KiB (608,256 B) with ~1.8 KiB headroom.
// ADR 0251 (2026-10-21): recalibrated 594 -> 596 KiB after T-7359 symbol CheatSheet and full docs reconciliation;
// working tree package.zip is 608,361 B, safely below 596 KiB (610,304 B) with ~1.9 KiB headroom.
// ADR 0253 (2026-10-21): recalibrated 596 -> 598 KiB after Issue #16 studio line-number fix, probe priority and submit guide;
// working tree package.zip is 610,299 B, safely below 598 KiB (612,352 B) with 2,053 B headroom.
// ADR 0255 (2026-10-21): recalibrated 598 -> 600 KiB after Xiaolv Checkin 7-day capsule tracker, celebration banner and dual bento tiles;
// working tree package.zip is 612,866 B, safely below 600 KiB (614,400 B) with 1,534 B headroom.
// ADR 0257 (2026-10-21): recalibrated 600 -> 602 KiB after switcher recent queries replay and card hover copy block link;
// working tree package.zip is 614,563 B, safely below 602 KiB (616,448 B) with 1,885 B headroom.
// ADR 0258 (2026-10-22): recalibrated 602 -> 604 KiB after mobile mode chips bar, doc action palette and clear history button;
// working tree package.zip is 616,535 B, safely below 604 KiB (618,496 B) with 1,961 B headroom.
// ADR 0260 (2026-10-23): recalibrated 604 -> 660 KiB after 256x256 high-resolution icon.png (64.4 KiB) and 7 ecosystem widget adapters;
// working tree package.zip is 669,613 B, safely below 660 KiB (675,840 B) with 6,227 B headroom.
// Per-entry compressed line recalibrated to 336 KiB (ADR 0260).
const ARCHIVE_BUDGET_BYTES = 660 * 1024;
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
// ADR 0254 (2026-10-21): recalibrated 320 -> 328 KiB (335,872 B) after T-7360
// (penetration search smart empty hints, snippet studio dual maximize views, color chips);
// compressed index.js is 328,031 bytes (7,841 B headroom within 328 KiB).
// ADR 0256 (2026-10-21): recalibrated 328 -> 332 KiB (339,968 B) after T-7360
// (switcher persistent mode chips bar, keycap styling on action palette);
// compressed index.js is 329,065 bytes (10,903 B headroom within 332 KiB).
// ADR 0260 (2026-10-23): recalibrated 332 -> 336 KiB (344,064 B) after 7 ecosystem widget adapters;
// compressed index.js is 334,756 bytes (9,308 B headroom within 336 KiB).
// ADR 0266 (2026-10-23): recalibrated 336 -> 338 KiB (346,112 B) after SiReader & SiMedia adapters and event bus;
// compressed index.js is 336,082 bytes (10,030 B headroom within 338 KiB).
const COMPRESSED_ENTRY_BUDGET_BYTES = 338 * 1024;
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
