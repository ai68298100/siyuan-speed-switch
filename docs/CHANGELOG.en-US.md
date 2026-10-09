# LvSpeed Switch Changelog (Full English History)

> Full per-version history in English. `README.en-US.md` keeps only summaries of the most recent
> releases; new entries are appended here at release time. 中文完整历史见 [`docs/CHANGELOG.md`](./CHANGELOG.md)。

## Changelog (full history)

### v0.46.6 (2026-10-09)

- **Added quick snippet toggles**: the persistent list and picker catalog now expose sibling Enable/Disable actions for native snippets, using whole-list writes, readback confirmation, JS confirmation, and dirty-draft protection.
- **Improved second-panel and store hierarchy**: restored workbench radius/shadow/glass depth; the store detail pane now has one title, factual metadata, live preview, and action area, with stale aria references cleared on redraw.
- **Fixed older-host compatibility and duplicate detail cards**: unknown master flags now use a neutral snapshot so confirmed writes are not reported as failures, and detail no longer mounts a full catalog card a second time.
- **Verification**: full suite **8620/8620**; snippet, store-structure, material, and negative-injection contracts passed.

### v0.46.5 (2026-10-09)

- **Added segmented surface navigation**: the switcher, workbench, and snippet lab now share visible icons, purpose hints, and current-state feedback.
- **Improved top-bar hit areas and feedback**: borders and fills stay visible, hover/focus/pressed states respond immediately, inner icon/label nodes cannot steal events, and close targets are 36px desktop / 44px touch.
- **Fixed unresponsive top-bar hover**: restored a stable hit layer, touch semantics, hint pass-through, and accessible names so the controls remain clickable while the pointer moves continuously.
- **Verification**: targeted top-bar contracts **105/105**; full suite **8610/8610**; TypeScript, build, and UI smoke rerun after the version bump.

### v0.46.4 (2026-10-09)

- **Added full-path boundary regression guards**: contracts and deletion-injection checks cover empty dialogs, preserved search scenes, floating-menu positioning, saved-search notebook scopes, and settings diff dialogs.
- **Improved continuous workflows**: group redraws replay the active search/filter; sort menus reposition on viewport changes; malformed host roots destroy empty shells; saved searches retain their notebook scope when the host list is unavailable.
- **Fixed display copy and factual alignment**: favorite-group titles no longer show HTML entities; settings, diff, template, and host-list dialogs have failure exits; path-filter and widget-readiness descriptions now match production behavior.
- **Verification**: full suite **8608/8608**; TypeScript, build, release/quality/integration audits, UI smoke, and negative gates passed.

### v0.46.3 (2026-10-09)

- **Added full-path interaction regression guards**: added style and lifecycle contracts for platform chrome, mobile sheets, search metadata, stale states, and snippet previews, with deletion-injection checks for critical declarations.
- **Improved three-panel controls and state feedback**: restored settings, close, and Esc hint feedback across desktop and touch layouts, unified the 44px mobile close hit area, and restored metadata, stale-cache status, and bounded store/Gist preview regions.
- **Fixed store copy and malformed dialog cleanup**: removed hardcoded Chinese labels from the English store flow, fixed malformed separators and dependency copy, and destroy empty store dialogs after host/theme mutation while restoring trigger focus.
- **Verification**: full suite **8596/8596**; TypeScript, reproducible builds, release/quality/integration audits, all UI smoke suites, and negative gates passed.

### v0.46.2 (2026-10-09)

- **Added a widget-store close control**: the store content area now keeps a visible, touch-friendly close action and restores focus after closing.
- **Improved the first-panel preview**: removed the duplicate native dialog title row and extended the preview rail through the full result area.
- **Fixed the three-panel layout**: the third panel keeps library, editor, and AI preview in one stable row instead of wrapping the preview rail.
- **Fixed preview loading**: request options passed as the third argument are now treated as AbortSignal options rather than a timeout value.
- **Verification**: full suite **8589/8589**; TypeScript, layout smoke, browser smoke, and negative gate checks passed.

### v0.46.1 (2026-10-09)

- **Fixed Miniflux category discovery**: send the normalized token so pasted surrounding whitespace no longer breaks category loading.
- **Fixed mobile group action feedback**: rejected host operations now show an error receipt, log safely, and release the busy state.
- **Improved settings switch accessibility**: module and dock switches support full-row clicks and expose accessible names.
- **Verification**: full suite **8585/8585**; `tsc`, layout smoke, Chromium smoke, and negative gate checks passed.

### v0.46.0 (2026-10-09)

- **Native snippet management**: adds snippet groups, backup/restore, metadata, editor foundations, and safety boundaries for a recoverable studio workflow.
- **Platform and search improvements**: adds surface adapter routing, native title-search normalization, composed search, and workbench cache/lifecycle hardening while preserving local-first failure semantics.
- **Host acceptance and resource evidence**: adds SiYuan 3.8 compatibility probes, desktop/native-sidebar acceptance matrices, isolated background E2E, and long-session resource checkpoints.
- **Verification**: full suite **8583/8583**; `tsc` clean; quality audit **50/50**; integration audit **50/50**; visual matrix, production build, and release-package checks passed.

### v0.45.0 (2026-10-08)

- **R13–R16 visual and scale campaign**: completed token scales for type, radii, spacing, shadows, motion, status language, and density, with a four-state consistency matrix aligning all surfaces and device modes.
- **Reliability pool (about twenty batches)**: closed cancellation families, session isolation, lifecycle cleanup, focus and keyboard accessibility, honest failure receipts, overlay disposers, and sanitization boundaries across async and unload paths.
- **T-7204 icon-system tokenization**: consolidated icon width/height consumption across style slices onto shared icon tokens while preserving existing geometry and behavior.
- **Verification**: full suite **6738/6738**; `tsc` clean; quality audit **50/50**; integration audit **50/50**; `git diff --check` clean.
### v0.44.1 (2026-09-30)

- **T-7054 workbench visual overhaul (batches A–I, all 58 widgets)**: iPad-quality material base (glass, depth shadows, hover) plus dedicated per-widget styles for nine families (clock, calendar/journal, weather, task/flashcard, writing, reading, stats, navigation, utilities); batch A adds view logic — day-progress bar, day/night indicator, UTC offset, milestone badge.
- **T-7064–T-7067 snippet studio, five batches**: built-in CSS snippets grow 5 to 26 across 14 categories (inline-code pill, link hover, task checkboxes with hover ring, table zebra, mark highlight, kbd key-caps, image hover zoom, completed-task softening, table header accent, scrollbar refinement, eye-care mode, line height, heading icons, card paragraphs, code-block theme), all `--b3-theme-*` + `color-mix` dark-adaptive, scoped under `.protyle-wysiwyg`, ≤10 lines each; the category filter covers all 14 categories; a Copy button in the editor toolbar (Clipboard API with execCommand fallback); five contract layers (tokens/scope/i18n/no-overlap/category anti-drift), each with negative-injection evidence.
- **T-7068 mobile long-press drag**: hold a cell for 520ms (≤6px movement) to start dragging — same pipeline as the drag handle (drop hints, Escape cancel, swipe guard, edge auto-scroll); mouse and tool buttons bypass; `touch-action: pan-y` keeps vertical scroll native with the hold state tightening gestures.
- **T-7069–T-7072 third-party widget ecosystem (calendar#17, first external integration)**: fixes widgets being purged on add and previews stuck at medium; ADR 0103 lifecycle — the normalization allowlist is runtime registrations ∪ persisted instances, so disable/reload keeps layouts with explicit store cleanup; orphaned widgets (unregistered providers) appear in the unavailable section and are removable; `calendar-recent-periodic` joins the catalog for pre-install exposure; the catalog invariant splits into bridged vs provider-only classes; the integration guide documents the bounded-retry registration pattern and the Calendar example.
- **Security maintenance**: transitive fast-uri vulnerabilities (ajv→ajv-formats→schema-utils chain) upgraded away; `pnpm audit` reports zero.
- **Verification**: full suite **6625/6625** (+59 over v0.44.0); `tsc` clean; every new contract carries negative-injection evidence; readiness artifact snapshots refreshed with the build.
### v0.44.0 (2026-09-30)

- **Module visibility switches (T-7026, ADR 0099)**: Settings → Panels → Modules can disable the workbench / snippet studio / floating ball independently — all entries of a disabled module (surface nav, quick actions, commands, floating ball) are hidden, and residual route calls are declined with an honest receipt; **the top bar consolidates into a single unified platform entry** (the standalone workbench button is removed; the context menu dynamically lists all enabled surfaces + settings); already-open panels stay until closed. The switcher is the platform root and cannot be disabled (lock-out protection).
- **Snippet recycle bin (T-7025, ADR 0100)**: pre-save / pre-delete / conflict-discarded versions are captured automatically (registered only after the native write is confirmed; a failed registration never fakes success); the catalog sheet gains a Recycle bin entry — list (origin tag/date/size) + restore as draft (disabled state, behind the dirty-draft guard, never auto-enabled, never overwrites the original) + delete-forever/empty (double confirm); bounded auto-cleanup (50 entries / 30 days / 256 KiB). New storage key `sw_snippet_recycle` (persistent key count 16→17).
- **Snippet studio dual-pane preview (T-7022)**: the preview becomes a side-by-side Saved vs Draft comparison (scene/width/theme stay in sync across panes), collapsing to a single pane with a toggle on narrow containers; new snippets without a baseline show an explicit empty state; **JS execution is hard-sealed at the preview module level** (sandbox never carries allow-scripts, CSP script-src is always none, the Run JavaScript button is removed) — the boundary is owned by the module alone.
- **Audit defect fixes (T-7032/T-7038~T-7044/T-7046)**: conflict-copy saves no longer report a false failure; workbench hero demotion applies to the current frame; snippet imports are generation-guarded (late files are honestly dropped when the scene changed); the sort menu gained an owner disposer (no ghost menus or leaked global listeners, focus returns to the trigger); sidebar and mobile switchers preserve scroll and focused card across rebuilds; the sidebar gains an independent journal entry; search chip keyboard path unifies on aria-pressed; path-filter generations are isolated per surface.
- **Pending-confirm writes (T-7045)**: a notification/readback failure after the list write no longer masquerades as a plain failure — the studio enters a "the write may have landed, verifying read-only" receipt and verifies (save/toggle require a matching entry, delete requires its absence); only a verified write yields the success receipt and recycle registration, otherwise the studio stays honestly and allows a retry after refresh (the recycle dedupe window keeps old versions from double-entry).
- **Verification**: full test suite **6566/6566**; `tsc` clean; every new gate carried negative injection (24 injections failed precisely and were byte-restored); production graph ceiling 71→72 (snippet-recycle joins via storage-migration, recorded in the ledger).

### v0.43.2 (2026-09-29)

- **Panel entry discoverability & honesty (user-reported)**: non-current SurfaceNav items now render as bordered pills by default (previously bare gray text with no hover affordance); structurally, any assembly path missing its navigate handler **skips rendering** the non-current item entirely — a gray fake entry can no longer exist. Real-click cross-panel switching (fullscreen switcher/workbench → snippet lab, adaptive/fixed size branches) is now pinned as a release-gate smoke driven by CDP in real Chromium, asserting mount state, fullscreen sizing, z-order, and zero fake entries per case.
- **Digit badge fix**: the 1-9 badges on switcher cards used to straddle the card border and were clipped to half a digit by the card's overflow; they now sit fully inside the card's top-right corner (doc-result badges likewise).
- **Close button prominence**: the top-right close button on all panels upgrades from a bare icon to a bordered, surface-filled button with an accent hover.
- **Verification**: full suite **6538/6538**; `tsc` clean; new gates include negative injections (honest-rendering guard removal, badge clipping regression, close-button revert — all precise reds with byte-restores).



- **Hotfix: the snippet lab (third panel) could not be opened** — the v0.43.0 capability-receipt wiring (T-6987) called the probe-coverage analyzer `analyzeCssCoverage` in the UI without importing it; the lazy studio chunk threw a `ReferenceError` on first render and the mount fell back to the switcher. The import is fixed and verified by new mount-level regression tests covering the full chain (mount → first render → capability receipt → editing → diagnostics verdicts and error positions).
- **Test-coverage gap closed**: the studio UI previously had only source-scan contracts (no code execution); a real `snippet-studio-mount` test (jsdom + siyuan stub) now runs the whole UI so construction/first-render errors fail inside the test chain.
- **Verification**: full suite **6537/6537**; `tsc` clean; release gates green.

### v0.43.0 (2026-09-29)

- **Widget store S2 (T-6967)**: sort menu moved into the filter chip row; detail-pane meta upgraded to four plain rows (source/refresh/privacy/cache); empty catalog keeps the full chrome and shows a failure banner with retry; network/local/offline capability chips neutralized; mobile filter chips scroll horizontally with snap.
- **Panel size unification (T-6986/T-6999)**: the snippet lab gains fullscreen/adaptive/fixed size modes (fullscreen stays the default); switcher/workbench/lab window settings are unified under the "Panels" tab with default-value notes and preview buttons.
- **Settings search & storage health (T-7002/T-7004)**: full combobox semantics, desktop first focus, in-page `/` and Ctrl+K jump, explicit clear button, group filter chips and panel-group path badges; the storage tab now lists all 15 persistent keys (five bilingual groups) with usage bars, schema version health (three states incl. downgrade protection) and cache management with a confirm-guarded thumbnail cache clear.
- **Settings save receipts & undo (T-7003)**: three-state save status (pending/saved/failed with retry — failures are no longer silent), a 20-step "undo last change" stack, per-group restore-to-defaults (whitelist-validated, undoable), and scene-preserving rebuilds when settings change from other entries.
- **Switcher rerender scene preservation (T-7009)**: sort changes and async data refreshes no longer jump the scroll or steal focus from the search box or cards.
- **Workbench health retry busy state (T-7011)**: per-row in-flight busy with double-click protection; rows settle back into their real status group.
- **Snippet preview chain (T-6987~T-6990)**: a frozen capability receipt (scene/width/theme/probe/scripts/network/semantics/token snapshot); a bounded selector-coverage diagnostics panel (hit / may-miss / unknown + error positions, comment- and string-safe); probe features 10→17 (callout/columns/formula placeholder/attributes/database placeholder/blocked media placeholder/document title — all static, zero remote); read-only builtin theme token snapshots (external injection ignored).
- **Floating ball (T-7014)**: closing a dialog restores focus to the control that opened it (ball/topbar) instead of dropping it to the page.
- **Acceptance & wording (T-7015)**: the current scene preset shows a "Current" badge instead of a no-op Apply button; quick-bar switcher wording unified with the surface name; full-page acceptance matrix and the third-panel R3 integration matrix published (all five orphaned design-review findings closed).
- **Bundle lines**: ADR 0098 — raw self-discipline line 1120→1152 KiB, archive ceiling 544→576 KiB; multi-chunk stable naming registered as a candidate task.
- **Verification boundary**: full suite **6535/6535** (+50 over v0.42.0); `tsc` clean; 24+ negative-injection groups all failed precisely and were byte-restored; browser screenshot matrix and real Android/desktop acceptance remain post-poned per B-004/B-005 (candidate task T-7020).

### v0.42.0 (2026-09-29)

- **Unified platform shell contract (T-7012)**: `PLATFORM_SURFACE_ENTRIES` grew 8→12 (adds `topbar-context-menu`, `plugin-command`, `quick-action`, `floating-ball` — previously silently dropped as unknown); all four SurfaceNav mounts plus snippet chips and toolbar buttons now carry the current query; `PlatformSurfaceContext` gained a bounded `focusSource` recorded on leave and restored (object row or search box) via a macrotask on return; `openSetting` accepts `returnTo` so closing Settings returns to the originating surface.
- **Switcher card focus model (T-7007)**: tab cards upgraded from plain divs to real focus targets (`tabIndex=0`, `role="button"`, title aria-label kept in sync on remount); a `focusin` delegate on the scroll container drives visual focus and preview from keyboard navigation, attached-action focus, and arrow-key focus alike (hover stays purely visual); filter chips honestly downgraded from a half tablist to a `role="group"` + `aria-pressed` button group.
- **Workbench rerender transaction (T-7010)**: `renderPanel` captures scroll anchors (root + dialog body) and the focused target (widget cards by `data-sw-object-id`, toolbar buttons by the new `data-home-action`) before clearing, then restores scroll immediately after mount and relocates the same focus target — honestly giving up when the target is gone; the edit toggle, refresh-all, config save, and 14+ other full-panel rerender triggers no longer jump to top.
- **Settings IA (T-6998, ADR 0097)**: the previously unreachable component-panel builder content (tint + workbench size/aspect segmented controls) folded into a dedicated Panels-tab group, automatically covered by settings search and mobile horizontal scroll; the dead `builders.homePanel` key removed.
- **History dropdown contract (T-7016)**: audit confirmed the section counts, first-8 cap, and expand-all behavior were already in production; pinned by contract and formally closed. Deeper "journal smart grouping" awaits real feedback.
- **Docs**: README adopts peek wording for Alt preview-open (R8-A9); EN README preview-coverage sentence aligned with Chinese.
- **Verification boundary**: full suite **6485/6485**; `tsc` clean; gates include negative-injection validation (dropping a vocabulary entry, removing query passthrough, removing the settings restore call, removing focus restore, removing the history cap — each failed precisely and was restored byte-identical via SHA-256); real-device/kernel acceptance still deferred per B-004/B-005.

### v0.41.0 (2026-09-28)

- **All 13 deepening features shipped (T-6949~T-6961)**: reading and reuse - session preview pinning, find-in-preview with hit navigation and two-step confirmed replace, saved-search rename and condition editing, settings-wide search with real-control locate; workbench - layout undo/redo (30 steps, 128 KiB budget), widget health details with locate and sanitized diagnostics, document-set version diff preview; snippet draft protection - three-way leave guard, in-draft undo/redo (50 steps, 512 KiB budget), conflict-copy keep (ADR 0090); editing and migration - single-transaction find/replace, CSS preview scenes with width tiers, config-pack diff preview with per-group apply.
- **Workbench modernization (T-6968 approved → T-6969 slices 1-4, ADR 0091)**: material × size-tier system - plain/accent/dark/vibrant materials derived through the skin layer (vibrant only by explicit declaration), 45 modules registered with store default tiers; iOS-style edit wiggle mode (dashed outline + wiggle, reduced-motion aware) with an X hero constraint (at most one full tile per panel, extras demoted to large); view-state micro header (10.5px identification row, status chips revealed on hover/focus, failures and loading always visible); tabular numerals throughout.
- **58 component spec cards and build-to-spec (T-6971 batches 1-7)**: all nine spec-card batches produced (58/58); building to spec fixed real gaps - list-stream family (Hacker News comment counts off-screen, Miniflux/RSS source-date meta moved into visible row metas, cross-source same-title dedupe, continuous ranks after filtering, RSS joined the 15-minute heartbeat with read marks and an unread chip, tiers exactly M/W/L, new capListflowRows hard cap of 5 on screen / 8 on large); writing family aligned (today-writing accent, activity M/W/L, note-stats M/W); air quality joined the 15-minute heartbeat; clock numerals; checkin read-only red line pinned.
- **Store rebuild S1 (T-6966 approved → T-6967)**: master-detail structure - left catalog (search, six source chips, grouped rows) + right detail pane with the full card and the single primary add pill; catalog rows carry zero buttons (G3) with a check mark for added modules; density/view-mode controls removed; Ctrl+B batch mode with a persistent bottom bar; mobile becomes a single-column list with a bottom-sheet detail.
- **Mobile fixes (T-6970)**: narrow-screen segmented controls wrap instead of overlapping; switcher thumbnails no longer render a blank frame when content starts with empty paragraphs (leading blank trimming, title fallback, blanks never cached).
- **Stability and polish**: failed refreshes retain cached content and report a receipt; clock heartbeats patch DOM locally instead of re-rendering the card; document-set probe timeouts no longer leak connections; search recovery states and command-mode cancellation fixed; preview keyboard scrolling and responsive studio layout fixed; panel headers aligned with the switcher.
- **Budget recalibration**: ADR 0089 (compressed entry 288→320 KiB), ADR 0090 (archive ceiling 512→544 KiB), ADR 0091 (workbench material × tier system).
- **Verification (v0.41.0 release run)**: full suite **6452/6452** (+165 vs v0.40.0, including build-to-spec and master-detail contracts, all negative-validated); `tsc`, reproducible double build (3/3 artifacts match), release/quality/integration audits and four smoke suites green; all 58 spec cards screenshot-checked in light and dark; real-device/kernel acceptance deferred per B-004/B-005.


### v0.40.0 (2026-09-27)

- **Floating-ball gesture depth (T-6919~T-6920)**: single click, double click, and long press bind to separate actions ("More panel", catalog actions, or empty); with a double-click binding, a single click enters a 300ms disambiguation window where a second click fires the double action and cancels the pending single, while unbound gestures keep the zero-latency single click (zero regression for existing users); long press arms at 550ms, and drag/cancel paths tear the timer down while suppressing the synthetic click. Settings gained a gesture binding card reusing the flick-panel card language with normalized persistence.
- **Workspace restore 2.0 (T-6921~T-6922)**: document sets record the desktop active document at save time (the `active` flag survives entry normalization and version snapshots; mobile honestly defaults to no marker); restore replay orders candidates through a pure function so the active entry replays last without keepCursor, refocusing it on completion. The restore preview upgraded from a toast to an inline three-section list: pending, already-open (muted), and outside-set open documents dimmed as "kept open" visitors.
- **Snippet studio interop and review (T-6923, continuing T-6912)**: importing a usercss with `@var/@advanced` variables keeps the metadata header and substitutes body placeholders with the defaults (five basic types; dropdown/image placeholders stay untouched), with the receipt reporting the count; exports no longer stack a second header onto header-bearing content. Together with v0.39.0's "summary + diff + per-hunk acceptance" AI pipeline, the studio now covers the full Stylus interop and controlled AI review story.
- **Split-open keyboard parity (T-6924, R11)**: `Ctrl+click / Ctrl+Enter` on a search result opens the document in the right split (the public openTab `position` capability), matching the existing right-click gesture; `Alt` preview stays priority-exclusive and mobile stays unbound.
- **Real-device feedback fixes (T-6925)**: closing a tab from the mobile switcher no longer jumps to SiYuan's native tab overview — the host close side effect is dismissed through its own `#modelClose` control and the switcher dialog is re-raised; workbench module headers no longer render the same text twice (the narrow-screen "doubled glyph" root cause); the workbench quick-action bar became a solid full-bleed bottom bar instead of a transparent overlay; duplicate mobile close buttons were consolidated.
- **Docs and validation (T-6918)**: full suite **6287/6287**; `tsc`, build, reproducible builds, release/quality/integration audits, and the four smoke suites all green; real-kernel E2E extended to **9 green specs** (three mobile layout regressions plus a real split-open spec); real Android/desktop interaction acceptance remains deferred under B-004/B-005.

### v0.39.0 (2026-09-27)

- **Third surface reachability and productization (T-6894, T-6896, T-6902~T-6905, T-6908~T-6909)**: Snippet Studio is reachable from the switcher platform navigation, workbench object actions, the floating-ball More panel, and the public `snippetStudioOpen` command; mobile surfaces show "available on desktop" instead of disappearing silently, and a failed dynamic-chunk load falls back to the switcher with an understandable receipt. The studio gained first focus, a top-right close button (dirty-draft guarded), five footer receipt states, AI receipt loading/ready/error mapping, five permanently visible capability boundaries, and unified platform token bridging.
- **AI draft review pipeline (T-6906~T-6907, T-6914~T-6917, ADR 0083)**: AI requests project versioned CSS/JS generation constraints (the soft policy layer). Completed candidates render a locally computed change summary plus a line diff with per-hunk ✔/✗ acceptance (rejecting a deletion keeps the original line; rejecting everything discards the candidate; accepting everything stays byte-identical). A deterministic reviewer with 8 versioned rules (external @import, unscoped universal selectors, hardcoded colors, duplicate declarations, dynamic execution, network calls, credential literals, global writes) marks findings inline. Iterate rounds diff against the previous candidate and are labeled as such; oversized snippets degrade to a disclosed whole-block replacement. CSS exports carry a usercss metadata header that Stylus installs directly, and imports strip the header to prevent accumulation (T-6912).
- **Command mode and catalog (T-6911, T-6913)**: the `>` command mode groups built-in actions and SiYuan host commands under collapsible heads with keyboard equivalents and session memory, replacing the flat 12-item truncation; the snippet catalog ranks native snippets before builtin samples (the host getSnippet contract carries no update timestamp, so true time-sorting waits for upstream).
- **First-panel preview depth (T-6895, T-6900~T-6901, T-6910)**: opened tabs and the empty-query view share one preview pane and request generation; keyboard movement, hover, and focus share one preview pipeline; the two kernel requests fail in isolation; a dead document ID (non-zero code response) yields a Failed receipt instead of a blank pane.
- **Docs and validation (T-6897~T-6898)**: both READMEs were rewritten around switcher / workbench / snippet studio / floating ball, with the GitHub description and topics synced; the 26-screen prototype gap matrix is on file. Full suite **6279/6279**; `tsc`, build, reproducible, quality/integration audits, and the four smoke suites all green; real Android/desktop interaction acceptance remains deferred under B-004/B-005.

### v0.38.0 (2026-09-26)

- **Cross-surface objects (T-6878~T-6881, T-6890)**: snippet objects now appear in the switcher's empty-query workspace and query section; chips carry `objectId` into the snippet studio for exact ID selection with a name fallback; fetches share a 60-second cache, single-flight requests, and stale-generation discard. Widget objects now expose type, instance, source, description, capabilities, and health; leaving and returning to the workbench restores focus and scroll by instance ID, while display descriptors remain separate from execution handlers.
- **Workbench health receipts (T-6879~T-6880)**: refresh writes per-cell `ok/failed` health markers and aggregates a bottom receipt; failed cells get border and text-chip feedback, `aria` object descriptions track health, and cells stay mounted after failures.
- **Floating-ball shortcuts (T-6884, T-6886~T-6887, T-6891)**: the More panel supports 1-9 direct access; four-way flicks default to More, Quick Capture, previous tab, and next tab, with per-direction settings. The 1-9 slots persist separately per device and store only action IDs or saved-search IDs, fill empty slots from visible rows, and preserve invalid slots with unavailable feedback. Saved searches remain first-class objects, are looked up by ID and replayed on execution, and are never registered as global actions.
- **Tab-card metadata and audit fixes (T-6883, T-6888~T-6889, T-6892)**: the updated-time badge now includes a Changed marker for edits within seven days, reusing the recent-list predicate and updating in place across desktop, sidebar, and mobile; removed the extra favorites empty-state prefix (audit F4); and tightened quick-capture hints, English greeting punctuation, and audit screenshot stability.
- **Engineering and verification (T-6882, T-6885)**: the raw `dist/index.js` budget was recalibrated to 1088 KiB under ADR 0081 while the 512 KiB zip ceiling remains; real-kernel first-open timing stayed below 300 ms, so no skeleton was added. Full suite **6238/6238**; real-kernel E2E **7 passed / 1 skipped**; real Android/desktop interaction remains deferred under B-004/B-005.

### v0.37.0 (2026-09-26)

- **Platform · fullscreen by default (ADR 0080)**: the switcher `panelSizeMode` and workbench `homeSizeMode` now default to fullscreen and the snippet studio opens at viewport size with the fullscreen container class; because `updateSettings` persists the whole object, only fresh installs see the new defaults and every size option remains selectable; mobile sizing is untouched.
- **Platform · unified route context (T-6869 P1-c)**: new `platform-surface-model` pure model (surface whitelist, bounded SurfaceContext, floating-ball restore fallback, ContextBar caption projection); session-level last-surface memory; destroy-before-open singleton guards for the desktop/mobile switcher and workbench dialogs (rapid hotkey/FAB clicks no longer stack windows); the floating ball restores the last used surface with a safe switcher fallback; workbench layout-editing state survives surface navigation with focus returned to the layout toggle.
- **UI · unified platform primitives, six RZ batches (T-6870~T-6876)**: `platform-dom` helpers and `_platform-shell.scss` primitives (six-state status badges with semantic dots, kbd chips, segmented controls, primary/soft pills); settings tabs reorganized into group cards with eight enums switched to segmented controls (skin, panel size, dock display, sidebar layout, widget palette, workbench size, mobile columns, density) and the density switch upgraded to a comfortable/compact segment; persistent keyboard hints in the switcher context bar; kbd-skinned digit badges; a six-state badge on the preview pane header (loading→ready); a workbench edit banner; store Add as a filled primary pill and Configure as a soft pill; quick-capture segmented targets with a primary pill save and honest keyboard hints (Ctrl+Enter/Esc); a stacked icon-over-label mobile bottom bar (44px targets).
- **Fixes (contrast sampling and defect evidence)**: Chromium contrast sampling caught the host warning/error raw colors failing 3:1 as badge small text (light 2.9 / dark 2.99) - badge text and holiday red now blend the semantic hue with the text color; the sampler gained `color(srgb ...)` color-mix support; fixed the quick-capture active target being visually indistinguishable (`sw__target--active` had JS toggling but no CSS rule).
- **Snippet studio · original layout absorbed (R2 prototype)**: preview as the hero area (4fr) + a lower properties:editor row (2fr:3fr) + an AI right rail + the catalog as an overlay picker, replacing the R1 equal-column split.
- **Engineering**: ADR 0079/0080; a 26-screen full-plugin UI prototype and a parameterized screenshot tool; production graph ceiling 66→68 (platform-surface-model/platform-dom); new platform model unit tests and T-6869~T-6877 wiring contracts with negative verification; baseline 6201/6201.

### v0.36.0 (2026-09-25)

- **Keyboard · arrow-key row navigation**: after Tab focuses a search result row, ↑/↓ steps through rows (`moveDocItemFocus` with scrollIntoView follow); focus on workbench/unified rows returns false so native scrolling is preserved; the control guard now admits digits plus Up/Down on result rows. The keyboard-first loop is complete: Tab into results → arrows to scan → 1-9 direct open or Enter to activate → Alt preview / `>` command mode.
- **Search · resident preview pane**: on desktop the doc-results section gains a right-hand pane (260px; skipped under 680px width and on mobile) that live-previews the focused document's outline (≤12 entries with h1-h6 indent) and first-paragraph excerpt (≤600 chars bounded). 300ms debounce (Raycast/Spotlight consensus) plus generation-based stale-packet discard; zero new endpoints (getDocOutline + SQL, both whitelisted; rootId BLOCK_ID_RE-validated before the literal); pure-model projection `buildDocPreviewSnapshot` is unit-testable.
- **Engineering**: real-kernel E2E extended with row-navigation assertions (ArrowDown/Up focus equality) and a preview-pane outline rendering assertion (companion doc seeded with heading + paragraph markdown); T-6838/T-6839 contracts include negative verification.

### v0.35.0 (2026-09-25)

- **Search · keyword highlighting**: query terms highlighted in doc result titles and snippets (pure `buildKeywordHighlightSegments` segmenter: phrase hits, exclusions stay plain, case-insensitive with original casing preserved, bounded 64-hit overlap-merged ranges; segment assembly with zero innerHTML). Titles get a solid primary mark; snippets get primary tint without background.
- **Search · snippet sanitization**: the kernel's presentational `<mark>` wrappers in full-text snippets are stripped at the projection layer (`stripSnippetMarkup` removes known wrappers only; literal prose like "a < b" is untouched) instead of rendering as literal text.
- **Keyboard · digit direct access for result rows**: 1-9 opens the first nine visible doc results in search state (with digit badges); `activateDocResultItem` is the single activation entry shared by click and digit (block-level hit anchor persisted on the row); non-empty queries prefer result rows with card fallback; digit keys no longer die when cards hide; digit keys pass the control guard when focus rests on a result row.
- **Engineering**: real-kernel E2E extended with highlight assertions (negative-verified) and the digit-direct open path; kernel-widgets-wiring gained the T-6837 contract (negative-verified).

### v0.34.0 (2026-09-24)

- **Related content**: the zero-term workbench lists backlinks/mentions of the current document (official getBacklink2, bounded projection, explainable truncation); click to jump.
- **Saved searches + `>` command mode**: save and replay queries and filters; `>` enters command mode listing executable actions only.
- **Marks + digit badges**: jump back by exact scroll ratio; the first nine visible cards carry digit badges.
- **Multi-target quick capture**: journal/current-doc targets, destination preview, controlled write with per-step failure reasons.
- **Preview open**: Alt+click opens search results as read-only preview tabs (doc.mode preview).
- **Document set version history & rollback**: overwrites keep the last 3 versions (FIFO), any of them restorable reversibly; restore summary includes Essentials receipts; scene presets persist into document sets (presetId layering).
- **Dynamic favorite groups**: tag + notebook scope + updated-window (7/30/90 whitelist) parameterized queries.
- **Density tier & config pack**: compact/comfortable density switch; one-click export/import of a versioned config pack (grouped apply with per-item receipts after whole-pack validation; multi-key persistence is not atomic).
- **Mobile floating-ball anti-misfire**: `data-prevent-swipe` official contract (L1) + capture-phase touch interception (L2) + drag-time scroll-chain blocking (L3); dragging the ball no longer triggers SiYuan edge swipes; off-edge docking and fling-up summon.
- **History dropdown balance**: per-section top-8 with expand-all; journals no longer bury recently closed.
- **Real-instance E2E channel**: 6 real-kernel acceptance specs; ADR 0077 (1024 KiB raw line); provider protocol metadata; GBK mojibake comment cleanup.

### v0.33.0 (2026-09-24)

- **Search diagnostics & sorting**: score breakdown (source weight/title score/matched fields) and health snapshot (source counts, latency, degradation reasons); fixed remote search silently dropping out on misplaced call args; async behavior locks added.
- **Result identity anchoring**: viewport pins to item identity across async refreshes (fzf `--track` semantics).
- **R5-A absorption batch**: openTab new options (keepCursor background restore, doc.mode preview), saved-search commands, history domain study (converged), document set version rollback, open strategy layer, breadcrumb entry.
- **Real-instance E2E channel**: Playwright + local SiYuan kernel acceptance with the `window.siyuanSpeedSwitch` public hook.
- **Workbench & related content**: zero-term workbench with related-content row (backlinks/mentions) and bounded polling for index latency.
- **Surface migration**: command mode `>`, marks, multi-target capture, preview open, version history timeline, dynamic groups, density tiers, config pack, provider protocol, clipboard entry, breadcrumb button.

### v0.32.0 (2026-09-23)

- **Search · Full-library pinyin completion**: pure-letter queries (e.g. cp) now also surface matches from all library titles via a lazy pinyin cache (zero standing requests).
- **Search · Filter chips**: one-click result-type narrowing (all/tabs/collections/documents) above the results.
- **Switcher · Jump back / forward**: speed-switch driven jumps can be undone and redone (session stack).
- **Switcher · Split-right open**: right-click a result to open it in the right split (desktop).
- **Document sets · Essentials layer**: marked documents auto-open after every set restore (up to 10, manageable).
- **Document sets · Scene linkage**: restoring a set auto-applies a same-named ball preset (e.g. "writing" set → writing layout).
- **Quick actions · Icon catalog**: the icon picker is browsable by category with Chinese/pinyin/English-id search.
- **Quick actions · Plugin grouping**: add-action candidates are grouped by their source plugin.
- **Fixed · Query operators**: queries with `-exclusions` / `"phrases"` no longer blank the document results.
- **Verification**: 6,065 tests across 225 files, four UI smoke suites (including 22 floating-ball Chromium scenarios); Android on-device items remain pending.

### v0.31.0 (2026-09-23)

- **Floating ball · Host command actions**: nine SiYuan commands wired in (outline, bookmarks, tags, inbox, backlinks, recent documents, recently closed, flashcard review, read-only toggle) with capability detection and safe fallback on older hosts.
- **Floating ball · One-tap sync**: invokes the kernel performSync directly with completion/failure feedback; read-only mode and sync mutexes surface honestly.
- **Floating ball · Insert template**: lists the template directory, renders the chosen template and inserts it at the caret of the active document.
- **Floating ball · Scene presets**: save the current action layout and primary click as named scenes; apply or cycle in one click (up to 8, same-name overwrites).
- **Floating ball · Throw to window** (desktop) and **dismiss keyboard** (mobile).
- **Floating ball · Jump back / forward**: speed-switch driven jumps can be undone and redone (session stack, FIFO 50).
- **Floating ball · Surface shrink**: the ball no longer appears on the sidebar dock (it duplicated the desktop-window ball); legacy configs stay compatible.
- **Switcher · Unified index**: one search box sections across open tabs, favorites, recently closed and document sets.
- **Switcher · Query operators**: `"exact phrases"`, `-exclusions`, multi-term AND; last-pick boost (session memory).
- **Switcher · Pinyin matching**: full pinyin, initials and mixed input (e.g. cp → 产品), on by default and toggleable in settings; off means substring only.
- **Switcher · Zero-term workbench**: with an empty query the panel surfaces scene, document-set and smart-group entries directly.
- **Recent · Show changed only**: one click filters to documents changed within the last 7 days.
- **Document sets · Workspace switching**: switching snapshots the current tabs back into the active set (toggleable), marks the restored set as current, and supports cycling.
- **Skins (new)**: optional standalone skin layer — Apple liquid glass, Midnight glass, Paper ink; fusion stays the default, skins touch only Speed Switch surfaces and pass the WCAG AA contrast gate.
- **Behavior changes**: the floating ball no longer appears on the sidebar; pinyin matching is on by default. Everything else is additive with no destructive migrations.
- **Verification**: 6,060 tests across 225 files, four UI smoke suites (including 22 floating-ball Chromium scenarios); Android on-device items remain pending.

### v0.30.1 (2026-09-22)

- **Task Horizon mobile integration**: the floating ball can discover and invoke the task manager and quick-add plugin commands, rechecking provider capabilities before execution and safely handling failures, timeouts, and unloads.
- **Companion version required**: the two mobile commands require the matching Task Horizon patch to be merged and released; upgrading LvSpeed Switch alone cannot create those provider-side mobile entries.
- **Verification**: 6,020 tests across 223 files, four UI smoke suites, 22 floating-ball Chromium scenarios, and 6/6 provider integration checks passed; Android keyboard, back navigation, rotation, and task submission remain pending.

### v0.30.0 (2026-09-22)

- **Complete floating ball**: independent desktop, sidebar, and mobile surfaces with stable drag targets, free placement, action execution, overflow search, and keyboard-equivalent access.
- **Configuration governance**: appearance/behavior settings, per-surface enablement and action ordering, default presets, import/export, capability states, and safe fallback.
- **Reliability and viewport handling**: scroll/modal/fullscreen yielding, execution watchdog, visualViewport/safe-area handling, and host-aware layering.
- **Verification**: 6,011 tests, four UI smoke suites, 22 Chromium scenarios, and 100 real pointer drags passed.

### v0.29.1 (2026-09-21)

- **Fixed iCal every-N-days weekday recurrence** (`FREQ=DAILY;INTERVAL=N;BYDAY=…`) degrading to a single occurrence; city table grows to 555 entries (wave 12); version-consistency and count-consistency gates, fixture end-to-end integration tests, bilingual issue templates and repo metadata refresh.


### v0.29.0 (2026-09-21)

- **World-clock city table grows to 535 entries (wave 11)**: European second-tier cities, Russia/Central Asia, the Americas, and Oceania additions - all bilingual; full-table IANA validation clean.
- **Subscription fixes**: iCal webcal:// and suffix-less URL support; RSS/Atom multi-candidate date parsing.
- **Quality infrastructure**: version-consistency and count-consistency gates, fixture end-to-end integration tests, issue templates, repo metadata refresh.


### v0.28.3 (2026-09-21)

- **Fixed the iCal feed gateway lagging behind the config policy**: suffix-less addresses saved fine but failed at fetch; the loader gate now mirrors the config normalization.


### v0.28.2 (2026-09-21)

- **World-clock city table grows to 460 entries (wave 9)**: Chinese-city English aliases completed plus 25 new dual-language zone groups; full-table IANA validation clean.
- **iCal subscription URL policy relaxed**: webcal:// links accepted; .ics suffix requirement dropped; security rules unchanged.
- **RSS/Atom date tolerance**: later date candidates are tried when the first is malformed.


### v0.28.1 (2026-09-21)

- **iCal subscription URL policy relaxed**: webcal:// links accepted; the .ics suffix requirement dropped; security rules unchanged.
- **RSS/Atom date tolerance**: later date candidates are tried when the first is malformed.
- **Engineering**: dead shim removed; acceptance checklist grew section 5d for recent features.


### v0.28.0 (2026-09-21)

- **iCal recurrence semantics completed**: BYSETPOS selection, DAILY+BYDAY weekday filtering, MONTHLY ordinal-less BYDAY fix, YEARLY+BYMONTH+BYMONTHDAY annual dates, and 8 explicit degrade guards.
- **Bundle structure optimization**: the city table declares per IANA zone (338 cities / 104 zones), recovering ~2.9KB raw margin with deep-equality verification.


### v0.27.1 (2026-09-21)

- **iCal recurrence supports BYSETPOS** (MONTHLY/WEEKLY candidate-set selection): "last weekday of the month" style events expand correctly; fixed the silent degradation of ordinal-less MONTHLY BYDAY to a single occurrence (RFC: every matching weekday of the month); standalone BYSETPOS still degrades safely.
- **Engineering cleanup**: a repository-wide dead-export sweep removed 5 zero-reference items.


### v0.27.0 (2026-09-21)

- **World-clock city table grows to 338 entries (wave 8)**: bilingual asymmetry closed (~70 cities gained their missing language); 24 new dual-language cities added; full-table IANA validation clean.
- **Performance benchmarks promoted to hard gates**: filter benchmarks measure CPU time with unconditional asserts; the 40 ms aggregation pathology line now also blocks on CI.
- **Full storage-migration drill**: 12 keys x 5 corruption classes through a sanitize fixpoint; v0.23.5-era upgrade simulation survives key-by-key.


### v0.26.0 (2026-09-21)

- **Publish compliance (F7 closed)**: `plugin.json` declares `publish.resources` for the four packaged docs assets; a package-resource contract gate keeps the declaration from drifting.
- **Documentation alignment**: the English README mirrors the Chinese one 1:1 across 15 sections; full English history lives here.
- **Quality gates**: CPU-time aggregation benchmark with a 40 ms pathology line; `aggregateSearchResults` doubling gate; store collapse aria contracts and zero-match empty-state tests (B4 closed).

### v0.23.5 (2026-09-19)

- **A sync no longer reloads the whole plugin**: SiYuan reloads a plugin wholesale whenever its
  stored data changes, and this plugin keeps 13 persistent keys — so every cross-device merge, or a
  write from another window, destroyed the open switcher, the second panel and any running search
  session (visible as flickering toolbar/dock icons and dialogs closing on their own). The plugin
  now overrides `onDataChanged`: it only performs a bounded re-read plus a lazy refresh, and the
  chain is forbidden from writing (a write broadcasts another data change and re-enters the same
  hook, which is the loop this closes). Coalesced repeat broadcasts, manual refresh and forced
  refresh all keep working.
- **The desktop journal entry point no longer wedges**: the "choose journal notebook" dialog only
  resolved its value from the Confirm/Cancel buttons, so closing it with Escape or by clicking the
  backdrop left the awaiting chain hanging forever — the next journal click did nothing. Close now
  funnels through the host `Dialog` `destroyCallback` on every platform.
- **Ordering and the calendar stop losing content once many tabs are open**: kernel
  `/api/query/sql` truncates to `search.limit` (default 64, floor 32) when a statement has no outer
  `LIMIT`, and the plugin never read `truncated` from the response. Fixed the update-time query
  behind "recently edited" (it also bypassed the whitelisted dispatcher and had no timeout), the
  month calendar limit with a stable tiebreak, and both settings pickers (databases / documents).
- **A dead data source no longer slows every refresh**: life widgets re-paid an up-to-10-second
  timeout per cycle for unreachable endpoints. There is now a 20-second suppression window per
  endpoint that falls back to the widget's existing stale/empty state, cleared immediately by any
  success, including a manual refresh.
- **Long-run stability**: all dialog teardown now uses the host `destroyCallback` (previously eight
  places overrode host methods and polled `isConnected`), and `setInterval` is now absent from the
  plugin sources. SiYuan gives plugin disable/unload a single shared 5-second teardown budget, and
  polling timers were exactly the leak living beyond it.
- **Internal**: added gates that validate against SiYuan's official API contract snapshot (request
  and response shapes for the 25 kernel endpoints, dispatcher consistency, and explicit records of
  where the measured host diverges from the contract), and consolidated the persisted key list into
  a single source.

### v0.23.4 (2026-09-19)

- **The "Checkin summary" widget is now natively bridged**: it used to be registered as a
  third-party provider widget whose availability depended on a provider handshake, so the store
  kept saying "requires the 小驴打卡 plugin" even with the plugin installed and enabled. It now
  bridges natively like the other six checkin widgets (`checkin-summary` joins the bridge list
  with the `items.read` capability): ready whenever 小驴打卡 is present.
- **Richer summary**: a new aggregated snapshot — done today, best streak, days this month,
  pending today, and the top-3 streak list; computed locally, read-only, no network requests.
### v0.23.3 (2026-09-19)

- **Fixes marketplace updates being rolled back by cloud sync**: the archive's zip entry
  timestamps now come from the release commit instead of a fixed epoch. The fixed epoch made
  installed files' modification times older than the sync index, so automatic sync judged the
  cloud newer and overwrote the freshly updated version with the old one (only this plugin was
  affected: only our build pipeline used a fixed-epoch timestamp).
- **Fixes an “unknown notebook” group under notebook grouping**: when a tab lacks explicit
  notebook metadata, the notebook id used to be derived from the first path segment — which is
  the root document id, not a notebook. Opening the notebook-grouped panel now restores the
  real ownership with one bounded kernel query and re-renders.
- **Widget card header slimmer**: the config button is now a gear icon (tooltip keeps the
  semantics) and update times are compact — the title no longer truncates into an ellipsis.
- **First-paint icon sizes**: every switcher toolbar icon carries explicit width/height, so
  oversized black icons no longer flash while styles load; the widget config dialog joins the
  icon-clamp observer coverage.
- **Also**: contribution heatmaps gained a “less → more” color-scale legend; performance
  micro-benchmarks use best-of-3 sampling to resist host load spikes.
### v0.23.2 (2026-09-19)

- **Fixes the database table widget showing an empty table for embedded/mirrored databases on
  the 3.8.4 kernel**: the av block id and the database id differ; binding now resolves in two
  steps (block id → getAttributeView → database id + viewID + pageSize retry), and the config
  search accepts pasting a database ID directly (standalone databases produce no av block).
- **Data health**: missing-asset rows link to the referencing block (the actual place to fix);
  the reference display now reads the real response field (item) instead of the absent path.
- **Sort determinism**: user-content sorting (names/titles/tags/paths) is pinned to a Chinese
  pinyin collator, no longer drifting with the host environment.
- **Engineering**: performance micro-benchmarks use best-of-3 sampling to resist host load
  spikes; iCal TZID/RRULE/EXDATE/RDATE, a storage usage section, and the action panel key
  (see v0.23.1).
### v0.23.1 (2026-09-19)

- **Fixes the Miniflux widget never fetching for real**: the kernel proxy gateway URL
  gate lacked Miniflux routes, so production unread-list requests were always blocked
  (unit tests mocked the network layer and never caught it). Entries and categories
  routes are now allowlisted following the established pattern.
- **Category filter for the Miniflux widget**: categories load dynamically from your
  Miniflux instance (inside the config form); credentials travel only via request headers,
  and filtering runs server-side.
- **Also**: a storage usage settings section; a switcher action panel key
  (Shift+F10 / ContextMenu); user-content sorting pinned to a Chinese pinyin collator
  (stable across devices); full iCal time zone, recurrence, cancellation and extra-date
  support; a writing strength score and a 12-month lookback; countdown/elapsed dual modes;
  year/quarter/month progress.
### v0.23.0 (2026-09-19)

- **Per-widget deep optimization completed for all 58 widgets**: reviewed and enhanced with an
  8-dimension scorecard (config discoverability, data correctness, information hierarchy, size
  fitness, interaction feedback, state recovery, performance lifecycle, three-surface/a11y/privacy);
  ledger in `docs/component-deep-optimization-plan.md`. Highlights: path filters stay consistent
  across local tabs, remote results and full-text probing (300-card filter p95 ≈ 0.56 ms); database
  table typed cells; database/saved-searches/recent-updates/recent-edits gained search, sorting and
  accurate totals; favorite group picker, document-set last-used ordering, random-review candidate
  stats; world-clock cross-day markers; countdown yearly repeats with safe Feb-29 clamping; calendar
  week-start option; weather/air-quality display toggles; maintenance state kept separate from
  downtime in service status; checkin widgets remained render-only bridges with no protocol changes.
- **Second-round increments (competitor research follow-ups)**:
  - Countdown gained a **countdown/elapsed dual mode** (`N days since`); year progress supports
    **year/quarter/month periods**.
  - **Display override pilot**: local time, countdown and daily quote support three digit sizes
    (standard/large/extra-large).
  - Recent writing activity: a **writing strength score** (exponential-smoothing half-life, opt-in)
    and a **12-month lookback window**.
  - **Full time-zone and recurrence support for iCal subscriptions**: TZID resolution, RRULE
    expansion (DAILY/WEEKLY/MONTHLY, COUNT/UNTIL/BYDAY), EXDATE cancellations and RDATE extras —
    recurring events anchored in the past were previously invisible.
  - The settings page gained a **storage usage** section: total and per-key approximate size
    (UTF-8 bytes).
  - Switcher action panel key: **Shift+F10 / ContextMenu** opens the focused card's action menu
    from the keyboard (mouse-free).
- **Engineering**: automated tests 6117 → 6258 (207 files); resource self-discipline lines
  recalibrated per ADR 0059/0062 (224 KiB per-entry zip, 832 KiB raw; the 512 KiB archive hard
  ceiling is unchanged); the production dependency graph stays at 52 modules.
### v0.22.0 (2026-09-18)

- **Fixes the load error (issue #1)**: under certain host timing `window.siyuan.languages`
  is not yet populated, and registering a global-hotkey command made the kernel read
  `_trayMenu` off it, throwing a TypeError that aborted plugin loading (every agent
  capability registered afterwards was skipped). Command registration is now fully
  isolated: a single failed command no longer affects loading, and the global hotkey
  degrades to the in-app hotkey until the host is ready.
- **Eleven new widget-panel widgets (48 → 59)**:
  - **Kernel-data widgets (read-only SiYuan v3.8.x endpoints)**: database table (bind one
    SiYuan database block and render its current view read-only, following the filters
    and sorts you set in SiYuan; clicking a row opens its document; see ADR 0058), pinned
    docs, inbox (cloud shorthands with a determined empty state when signed out), recent
    updates, data health (missing-asset survey), recent docs (SiYuan's own recent list),
    database navigator, saved searches (the native search's saved criteria).
  - **External-data widgets**: RSS/Atom subscription (any feed URL, zero credentials, zero
    server), air quality (Open-Meteo European AQI with PM2.5/PM10, six-tier bands), and
    Hacker News board switching (front page / best / Ask HN / Show HN).
  - **Ecosystem bridge**: SiYuan-Checkin monthly summary (checkin days, record total and a
    per-item ranking).
- **Top bar and command palette**: both top-bar icons gained right-click menus (quick
  access to settings / switcher / widget panel); the command palette gains "open
  settings" and "open today's journal" commands.
- **Compatibility**: a compatibility survey against the SiYuan v3.8.4 kernel source found
  no breaking changes; all new widgets are read-only endpoints with no new writes or
  implicit data egress.
- **Engineering quality**: automated tests 5872 → 6138 (198 test files); boundary
  hardening across eleven existing modules; performance gates and the package budget hold
  (package.zip 339861 bytes, within the 512 KiB ceiling).

### v0.21.0 (2026-09-17)

- **Widget provenance becomes first-class (ADR 0057)**: widget protocol v2.4 adds a
  structured `source` field (`pluginId/name/icon/version/homepage/collection/order`),
  replacing grouping by free-text author. The store now prefers **source grouping over
  functional grouping** — one plugin's widgets collapse into a single source group whose
  header shows the provider icon, an **added x/y** counter and **select/clear whole group**;
  cards inside a group follow `source.order`; the "needs plugin" area aggregates per
  provider; provider and collection names join the card search text.
- **Five SiYuan-Checkin bridge widgets**: `checkin-today / checkin-streak /
  checkin-year-heatmap / checkin-weekly / checkin-occasions`, built on the checkin plugin's
  public ecosystem API v4 (`window.siyuanCheckin`, read-only, local-only, zero network).
  A missing plugin or capability yields a deterministic empty state instead of an error
  state; if the plugin later registers the same `moduleId`, its native implementation takes
  over without migrating user configuration.
- **Semantic search (third search method)**: joins query-syntax and regexp; the method menu
  only offers it when host AI embedding is configured, and a stale selection silently falls
  back to keyword search.
- **GitHub contributions become a grid heatmap**: a fourth `viewType: heatmap` with the item
  ceiling raised from 42 to 371, Sunday-aligned placeholder cells preserved, and levels
  passed through from the provider rather than recomputed by the view.
- **Third-party integration example now runs end to end**: the provider template
  `docs/widget-example/siyuan-checkin-home-modules.js` plus six runtime contracts exercise
  register → listModules → read → buildHomeModuleView → unregister as a real plugin.
- **Engineering**: `src/index.ts` shrank from 9226 to 8104 lines (mobile switcher and second
  panel UI extracted); `src/index.scss` (6517 lines) split into tokens plus nine **ordered**
  slices — CSS order is cascade order, so slicing must stay sequential rather than clustered
  by domain — with an exclusive-anchor coverage gate; three root ledgers archived under a
  root-doc budget gate; the perf self-check moved to adaptive calibration plus a ratio
  assertion.
- Release gates: 5959 automated tests (178 test files), TypeScript, production build, mobile
  smoke, Chromium smoke and `verify:release`; artifacts dist/index.js 653949 bytes,
  package.zip 330184 bytes.

### v0.20.0 (2026-09-17)

- **Life-info line (new widgets)**: **iCal schedule subscription** (user-provided `.ics` URL, bounded RFC 5545 parsing — 256 KiB source / 500-event caps, over-limit rejected instead of silently truncated, upcoming-window rendering, 30-minute cache) and **GitHub contribution heatmap** (official public event feed without a key; the optional token travels only in a request header and never enters the URL, cache, or cache key; UTC date buckets render a week-column contribution grid with an 84-day default window (28–366 configurable) and the caliber difference from GitHub's official heatmap honestly documented; 60-minute cache). Both fetch through the kernel proxy and are listed in the store catalog, dependency notes, and endpoint allowlist.
- **Fix**: the iCal text-fetch defect (D-397) — the text-fetch variant's `responseKind` option was ignored by the underlying bounded fetcher, which always JSON-parsed, so the iCal card could never fetch successfully on a live host; the new GitHub network gates surfaced it naturally before release, and a regression gate now locks it.
- **Storage data integrity**: `sw_thumb_cache` now normalizes on read — entries corrupted structurally or left behind by the mobile v0.7.0 upper-bound semantics (the write side hardcoded desktop constants) get cleaned up; a read-only storage migration drill with a bounded recovery report now runs on load, with drill health exposed via workspace-context; document-set restore exports a structured report.
- **Mobile fixes**: icon size overruns, toolbar chip clipping, widget panel height, and bare-SVG fallback sizing; the layout gate now measures at real phone width.
- **Workspace runtime**: session registry, recovery flow, cancellation boundary, and safe exit — 20+ contract capabilities completed (event pipeline wired into production).
- **Engineering quality**: all 365 window assertions migrated to block-scoped gates (the migration surfaced and fixed a real product defect — the size tile lacked `touch-action`); the doubling-complexity perf gate gained marginal-rerun noise hardening (ceiling semantics unchanged); a storage compatibility matrix with bidirectional doc-contract gates and a protocol-compat-claim consistency gate were added.
- Release gates pass: 5872 automated tests (171 test files), TypeScript, production build, mobile smoke, Chromium smoke, and `verify:release`; artifacts dist/index.js 631710 bytes, package.zip 318095 bytes.

### v0.19.0 (2026-09-16)

- **Search maturation**: workspace document results gain an in-panel "Load more" incremental expansion — the first 12 render immediately, clicking expands more results purely client-side (no cache-key changes, no new requests, focus preserved after re-render), and the native SiYuan search becomes the fallback once everything is expanded. The fetch cap is now a named constant (33) shared with the Agent path; the unified cache key (sorted object keys + unordered-key set + v:1 versioning) was audited and is locked by existing tests.
- **Architecture refactor (no behavior change)**: the search method group — 20 methods plus 1 module-level function, about 887 lines — moved to `doc-search-ui.ts`, bringing `src/index.ts` down to 9156 lines (about -28% across seven rounds). Document-search instance state now lives in `doc-search-state.ts`; the production dependency graph covers 41 modules with full gate review.
- **Fix**: all 351 comments corrupted by the v0.16.9 encoding accident are restored — 322 matched automatically against the v0.16.8 revision, 29 sourced manually (two born-corrupted lines were reconstructed semantically and split back into their original multi-line form). Comment text only; no behavior change.
- **Docs**: the widget protocol adds a "Cross-surface layout" section covering three independent layouts (desktop/sidebar/mobile) over globally shared configuration, `supportedDevices` pruning, full-width single-column mobile widgets, and layout cleanup semantics.
- Release gates pass: 5703 automated tests (160 test files), TypeScript, production build, mobile smoke, Chromium smoke, and `verify:release`; artifacts dist/index.js 601607 bytes, package.zip 309233 bytes.

### v0.18.0 (2026-09-16)

- **Third-party widget ecosystem**: added external-source widgets including World Clock, Hacker News, Uptime Kuma status, Frankfurter rates, Miniflux unread, daily quote, device battery, NewsNow live news, and ActivityWatch app usage, backed by a pure-model candidate catalog and source audit docs; sources without configured credentials stay offline by default.
- **Path filtering on desktop**: endpoint gating lifted based on real-host evidence (kernel 3.8.4, `/api/filetree/listDocsByPath`); the desktop dialog now offers notebook/path filters with generation-based cancellation locked by contract tests.
- **Store regrouping**: built-in widgets reorganized into seven purpose groups with bilingual descriptions; a new dependencies tab, dependency state parsing, and structured summaries; single-column mobile widget panel.
- **Resilience**: SiYuan sync lifecycle integration freezes panel interaction during sync; a 120-second sync watchdog covers lost end events.
- **Polish**: unified motion tokens, pressed-state feedback, and `prefers-contrast` accessibility.
- **Refactor (no behavior change)**: six rounds shrank `src/index.ts` from 12681 to 10003 lines (-21%), splitting store UI, settings, config forms, external widget registration, grapheme utils, and search state into modules; production graph 31→40.
- **Fixes**: repaired the corrupted `home-adapter-diagnostics` capability text (since v0.17.0); aligned release claims with actual registration (41 widgets, 11 capabilities).
- Release gates pass: 5693 automated tests, TypeScript, production build, mobile smoke, Chromium smoke, and `verify:release`; artifacts dist/index.js 601563 bytes, package.zip 307859 bytes.

### v0.17.0 (2026-09-14)

- Read-only SiYuan Agent audits now include bounded lifecycle history, health reports, trend windows, transport envelopes, queues, and recovery coordinators.
- Joint recovery adds atomic multi-coordinator commits, checkpoint windows, cursor-based incremental recovery, diagnostics status/risk projections, and bounded pagination.
- Safety boundaries remain unchanged: no new Agent write actions, no handler/instance/document-body leakage, and all outputs are bounded and sanitized.
- Release gates pass: 1513 automated tests, TypeScript, mobile smoke, Chromium smoke, production graph, and package-size checks.

### v0.16.39 (2026-09-13)

- The built-in **Journal calendar** now renders a complete 6-week × 7-column month: it detects SiYuan daily-note attributes with a date-title fallback, shows the month, adjacent dates, weekends, today, and journal dots, opens existing journals, and navigates ±24 months. The same release also includes **Countdown**, **Clipped to read**, and **Quick capture**.
- Widget store UI overhaul: larger dialog (up to 960×720), builtin widgets grouped by function (7 groups), plugin widgets grouped by source author, miniature skeleton previews with proportional size rectangles, and on-demand live preview dialogs.
- Widget store availability and interaction improvements: category, conditional, and added-state filters compose independently; configured third-party widgets retain their settings and show an unavailable state while their provider is unloaded, then recover immediately after re-registration; localized grouping, persistent filters, and an explicit no-results state complete the flow.
- Configuration UX improvements: countdown uses a native date picker, pinned documents offer suggestions from currently open documents with block-ID validation, and notebook filters preserve an explicit empty option plus unavailable-value feedback before save.
- Widget panel UI polish: single-layer chrome (inner module card removed), compact chevron fold toggle, muted empty-state prefix, calendar cell hover tint, list item hover accent bar, larger stat hero numbers, rounded progress bar caps, smooth collapse animation, staggered widget loading.
- Fixed append-to-journal agent capability that was defined but never registered; added a capability registration guard test.
- 675 automated tests.

### Older releases

For the full per-version history, see [GitHub Releases](https://github.com/ai68298100/siyuan-speed-switch/releases).
