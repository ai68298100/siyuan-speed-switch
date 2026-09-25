# LvSpeed Switch Changelog (Full English History)

> Full per-version history in English. `README.en-US.md` keeps only summaries of the most recent
> releases; new entries are appended here at release time. 中文完整历史见 [`docs/CHANGELOG.md`](./CHANGELOG.md)。

## Changelog (full history)

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
- **Density tier & config pack**: compact/comfortable density switch; one-click export/import of a versioned config pack (atomic apply after whole-pack validation).
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

