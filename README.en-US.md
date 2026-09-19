# LvSpeed Switch

[![Version](https://img.shields.io/badge/version-0.23.5-blue)](./plugin.json) [![License: MIT](https://img.shields.io/badge/license-MIT-green)](./LICENSE) [![SiYuan](https://img.shields.io/badge/SiYuan-SiYuan_Note-ff5c67)](https://b3log.org/siyuan)

LvSpeed Switch is a lightweight navigation workspace for [SiYuan Note](https://b3log.org/siyuan). It keeps **open tabs** first and uses live thumbnails for rapid preview and switching, then progressively exposes **favorites, workspace document search, panels, journals, and customizable quick actions**. Desktop dialog, right sidebar, and mobile share one data and command model while adapting their layouts to screen space and input method.

<p align="center"><img src="preview.png" width="720" alt="LvSpeed Switch preview"/></p>

<p align="center"><img src="docs/interface-map.svg" width="860" alt="Desktop dialog, right sidebar, and mobile interface map"/></p>

> v0.23.5 is a stability release: a cross-device sync no longer reloads the whole plugin (open switcher and second panel stop flickering and search sessions survive), closing the journal notebook picker with Escape on desktop no longer wedges the journal entry point, "recently edited" ordering and the month calendar stop silently losing content once many tabs are open, and a dead data source no longer pays an up-to-10-second timeout on every refresh cycle.

> The current development head passes type checking, production build, 6305 automated tests, and mobile/Chromium UI smoke tests. Thirty-one widgets have completed their first component-by-component depth pass: recently opened, database table, random review, favorites, document sets, fixed document, pinned documents, database navigator, saved searches, recent updates, recently edited, current document outline, document relations, tags, bookmarks, clipped-to-read, on this day, recent daily notes, today’s journal, monthly journal, journal calendar, today’s tasks, flashcard review, quick capture, upcoming reservations, plugin commands, inbox, note stats, today’s writing, recent writing activity, and writing streak, with year progress, data health, countdown, local time, world clock, weather, air quality, anime calendar, hot events, live news, Hacker News, and RSS subscription now at 58 widgets in total (51 full scorecards + 7 check-in bridge render enhancements, T-6348~T-6454). The tab panel adds manual refresh plus top-level path grouping. Panel interactions stay frozen during SiYuan sync and refresh once afterwards. Agent capabilities keep the existing read-only audit and controlled-action boundaries with no new implicit writes; real-host path-filter, narrow-sidebar, ActivityWatch, and Android-device acceptance remain follow-up compatibility checks.

## Contents

- [Core Capabilities](#core-capabilities)
- [Native SiYuan Agent capabilities](#native-siyuan-agent-capabilities)
- [Quick Start](#quick-start)
- [Shortcuts](#shortcuts)
- [Settings](#settings)
- [Install And Upgrade](#install-and-upgrade)
- [Requirements And Compatibility](#requirements-and-compatibility)
- [Release Checklist](#release-checklist)
- [Changelog](#changelog)
- [Architecture And Tests](#architecture-and-tests)
- [Development](#development)
- [Development Roadmap](#development-roadmap)

## Native SiYuan Agent capabilities

On SiYuan versions that expose `addAgentCapability` (the current adapter follows the SiYuan 3.8.3 source), the plugin registers eleven capabilities after a runtime check: `navigation-state`, `search-documents`, `get-document-outline`, `home-widget-snapshot`, `workspace-context`, and `home-adapter-diagnostics` (read-only), `open-document` and `open-documents` (controlled navigation — up to 5 documents per call, behind a confirmation dialog listing every title), and `update-task-status`, `create-document`, `append-to-journal` (controlled writes behind a mandatory confirmation dialog). Document search supports bounded notebook and path scopes, content filters, search method, and result ordering. Read-only capabilities declare `localRead` only, with no writes, data egress, or external cost; controlled navigation declares no writes. Input, output, and text sizes are bounded. Older SiYuan versions skip registration without affecting tab switching or mobile startup. SiYuan owns policy and lifecycle cleanup; further cross-document or destructive actions will be added only after explicit approval, cancellation, and permission-denial tests. See the AI capability section in [ROADMAP.md](./ROADMAP.md).

[中文说明](./README.md)

## Core Capabilities

### Tab Switching And Live Refresh

- **Live thumbnails**: each tab card shows current document content; background documents are filled through the kernel API when needed, while off-screen content is rendered lazily.
- **Native split panes**: tabs remain grouped by SiYuan window/pane and switching activates the correct pane. Opening, closing, or batch-changing tabs refreshes every active plugin view immediately.
- **Keyboard and pointer control**: arrows and `Tab` move across the real grid, `Enter` opens, and `Esc` closes. Cards provide pin, favorite, close, and context-menu actions.
- **Six sort modes**: recent use, open order, reversed open order, recently edited, title ascending, and title descending; the choice persists.
- **Unified history entry**: desktop, sidebar, and mobile share the clock entry; recently opened and recently closed documents are separated, closed documents can be reopened, and stale records can be removed individually.
- **Desktop fullscreen**: fullscreen belongs only to the desktop dialog. Sidebar and mobile do not render an action that cannot apply there.

### Favorite Folders And Ordering

- Favorites use stable document root IDs, so they can reopen after a tab closes or SiYuan restarts.
- Favorite folders show order and item count, and support collapse, rename, delete, move up, and move down. Desktop also supports dragging folders into order.
- Favorite items live inside their folder, show an in-folder order number, and can move between folders or up/down within one. Desktop supports in-folder drag sorting.
- Mobile settings disable whole-row drag to avoid stealing vertical scrolling; explicit move controls provide the same result.
- A folder can open or close all its tabs, with separate handling for duplicate documents, failed items, and no-op states.

### Layered Card Search

Search always uses this priority:

1. **Open tabs**: filtered locally and immediately while preserving pane grouping, pinning, sorting, and keyboard navigation.
2. **Opened-document content**: queried inside at most six opened root documents; hits recover existing tab cards without creating duplicates.
3. **Workspace documents**: queried by title first; an empty title result or advanced filters use a bounded native full-text fallback, aggregated into document cards with a small snippet limit.

Search requests use a 180 ms debounce, bounded in-memory cache, request-version validation, and cancellation. Desktop dialog, right sidebar, and mobile each own an isolated search session, so one surface cannot cancel or overwrite another. The current worktree supports bounded notebook, content-type, subtype, search-method, and result-order filters; notebook/path-only filters keep the title fast path, while advanced filters use native block search. Workspace results fetch up to 33 entries at once and render the first 12; a "Load more" button expands the rest purely client-side (no new requests, no cache-key changes) before falling back to SiYuan's native search. Path-tree selection is still not exposed in the UI, and this remains an addition rather than a replacement for SiYuan's native search page. See [ROADMAP.md](./ROADMAP.md) for that work.

### Panels, Journal, And Quick Actions

- **Left panel rail**: open the file tree, outline, bookmarks, tags, graph, backlinks, and plugin docks. Choose a full list, icon-only rail, or complete hiding.
- **Right sidebar mode**: keep tab cards in a SiYuan right Dock. Thumbnails resize with available width and can either enlarge to fill or add columns automatically.
- **Today's journal**: desktop and mobile toolbars retain a dedicated journal action. Select a default notebook or choose one on first use.
- **Quick action workspace**: desktop uses a bottom bar by default and can move it into a narrower right rail; sidebar and mobile render their own selected actions.
- **Document sets**: Settings supports saving current documents, overwriting by name, inline rename, deleting sets, previewing restores, controlled restore, and JSON import/export; imports are capped at 512 KiB and require confirmation before merging, restores follow the saved order, bounded preflight reports missing and unverified entries, cancellation is supported, and the result reports restored, failed, already-open, and missing counts. Cross-surface host behavior still needs final validation.
- **Four action sources**: built-in actions, SiYuan Dock panels, commands exposed by other plugins, and runtime adapters registered through `registerQuickAction()`.
- **Configuration**: labels up to four graphemes, icon, desktop/sidebar/mobile targets, enabled state, ordering, and JSON import/export. The `+` action opens Quick Actions settings directly.
- If an external plugin is absent, its configuration is retained and skipped safely. No polling or DOM injection is used, so optional integrations do not slow the core tab path.

### Three Surface Strategy

| Surface | Primary controls and behavior |
| --- | --- |
| Desktop dialog | Search, favorites, recent history, sort, fullscreen, sidebar, journal, and settings; left panel rail; bottom or right quick actions |
| Right sidebar | Compact search and toolbar; responsive tab/search cards; sidebar actions; no fullscreen |
| Mobile | Compact sort menu, favorites, journal, and settings; one/two/auto columns; bottom custom actions and `+`; no fullscreen |

On mobile, the first frame waits for the WebView to reach a stable size before cards become visible, then scales thumbnails from the container's measured width. Mobile settings use a horizontally scrollable top tab row and single-column controls. Favorite and quick-action ordering use buttons instead of row dragging, avoiding gesture conflicts with page scrolling.

### Performance, Data, And Themes

- Local tab filtering and switching never wait for workspace APIs or third-party plugins; open-tab results remain intact when search fails, and an unavailable title-search API still falls through to opened-document content and bounded full-text layers before showing an error state.
- Thumbnails render by viewport and cache per document with a per-entry size limit; orphaned cache entries are pruned after tabs close.
- MRU, favorites, pins, settings, and quick actions are validated and deduplicated on read; favorites are capped at 512 entries, pins at 64, and favorite groups at 64. Runtime reads defensively sanitize corrupted values and can produce a read-only capacity status snapshot; writes are debounced, and pending saves are flushed before unload.
- UI uses SiYuan theme variables and native icons, with stable button, card, switch, and text dimensions plus shared empty/loading/error state semantics for default themes and third-party themes such as Neo. The unreleased R7 visual pass adds lavender accents, blue-grey surface layers, rounded cards, soft elevation, and restrained warm highlights across desktop, sidebar, second-panel, settings, and mobile layouts while preserving each surface's layout differences.
- Older WebViews missing `AbortController`, `IntersectionObserver`, `ResizeObserver`, or `MutationObserver` use bounded fallbacks for search cancellation, thumbnail loading, and resize/favorite observation without blocking tab switching.

## Quick Start

1. **Open**: the layout icon on the top toolbar, or the hotkey `Alt+Shift+S` (changeable in **Settings → Keymap**); on mobile, tap the top-bar entry or the floating button.
2. **Switch**: click a card, or move with arrows / `Tab` and hit `Enter`; click a panel on the left rail to jump to it.
3. **Manage**: pin with the pin button, favorite with the star (group menu pops up); close tabs with × on the card, or right-click for the full menu (long-press on mobile).
4. **Search**: use one field to see matching open tabs first and workspace document-title cards second.
5. **Dock it**: hit the "Sidebar mode" toolbar button to pin the switcher to the right dock.
6. **Second panel**: the top-bar second-panel button or `Alt+Shift+P` opens the aggregate page (recently opened + favorites); a fixed entry also lives in the bottom action bar.
7. **Customize**: use `+` in the bottom/right action area to add Docks, plugin commands, or change per-surface visibility.
8. **Sizing**: desktop panels open at an adaptive screen ratio by default; the in-dialog fullscreen button still toggles a temporary fullscreen, restore with the button or `Esc`.

## Shortcuts

| Key | Action |
| --- | --- |
| `Alt+Shift+S` | Toggle the switcher (global, configurable) |
| `Alt+Shift+P` | Open the second panel (default, configurable; bind "global" in Settings → Keymap to trigger while SiYuan is unfocused) |
| `↑` `↓` `←` `→` | Move selection across the grid |
| `Tab` / `Shift+Tab` | Next / previous |
| `Enter` | Switch to the selected tab |
| `Shift+F10` or `ContextMenu` | Open the focused card's action menu (mouse-free) |
| `Esc` | Close the switcher |

## Settings

Open **Settings → Plugins → LvSpeed Switch → Settings**, or use the gear inside the switcher. Desktop uses a left tab rail; mobile uses a horizontally scrollable top tab row. Changes save immediately:

| Tab | Options |
| --- | --- |
| Appearance | Panel size mode (adaptive screen ratio / fixed size / fullscreen), adaptive scale (50–100), fixed width/height (480–1920 × 360–1280), thumbnail columns (auto / 2–8), thumbnail height (72–360) |
| Behavior | Default sort order, recently opened history |
| Panels | Show / hide left-rail panels, display mode (full list / collapsed icon rail / hidden), sidebar thumbnail layout (enlarge / auto columns) |
| Favorites | Collapse and order folders, create / rename / delete, order items, and reassign favorites |
| Quick Actions | Label, icon, surface targets, enable state, drag/button ordering, right action rail, and import/export |
| Journal | Default journal notebook (dropdown; first click of the journal button also prompts a picker) |
| Mobile | Floating button toggle (off by default), card layout (single / double / auto), and thumbnail height |

## Install And Upgrade

- **Marketplace**: search "小驴雷切 / LvSpeed Switch" in **Settings → Marketplace → Plugins** (community bazaar listing pending).
- **Manual**: download `package.zip` from [Releases](https://github.com/ai68298100/siyuan-speed-switch/releases), extract into `<workspace>/data/plugins/siyuan-speed-switch/` and restart SiYuan (the folder must be named `siyuan-speed-switch`).

Upgrading preserves favorites, groups, pins, MRU, and settings. On first `v0.16.9` load, quick-action fields are validated; invalid entries are ignored, while valid configurations remain even if their third-party provider is temporarily unavailable.

## Requirements And Compatibility

- SiYuan **v3.8.0+** (`minAppVersion` raised as of v0.24.0, see ADR 0064; older hosts silently disable this plugin — upgrade SiYuan first).
- Desktop client / browser-desktop frontend (tabs and split panes).
- Kernel-data widgets (pinned docs, inbox, recent updates, data health, recent docs, database navigator, saved searches, database table) are adapted to the SiYuan **v3.8.0+** kernel contracts. The inbox requires a signed-in SiYuan account with inbox data synced.
- Agent capabilities are registered only when the host exposes `addAgentCapability`; missing host capabilities are skipped safely.
- Path-tree filtering is not exposed in the UI yet; only the model/request boundary exists until a stable host API is available.
- Browser emulation is for structural/style checks only and is not Android SiYuan acceptance evidence.
- Real install, upgrade, uninstall, and theme checks remain manual release steps.

## Release Checklist

See the [release readiness matrix](docs/release-readiness.md) for the current candidate status, automated gates, and remaining real-host checks.

Run the fixed local gate before manual acceptance:

```bash
pnpm verify:release
```

The command runs type checking, a production build, the complete automated suite, the mobile UI smoke test, and the Chromium style smoke test. The release workflow additionally enforces `package.zip` allowlisted contents, metadata consistency, no remote runtime dependencies, and the reviewed 512 KiB archive budget (SiYuan imposes no plugin package size limit; this is a self-discipline line, raised from 320 KiB on 2026-09-15).

Then verify in a real SiYuan environment:

1. Desktop dialog: open, search, sorting, favorites, recent history, journal, settings, and fullscreen.
2. Right sidebar: narrow-width toolbar, card scaling, quick actions, and history overlays.
3. Android: first frame, single/double-column cards, sort/favorite sheets, settings scrolling, and safe-area spacing.
4. Themes: default light/dark themes, Neo or another third-party theme, resize, and rotation.
5. Lifecycle: install, upgrade, uninstall, restart migration, and API failure/cancel/permission-denial paths.

This release is published as `v0.23.5`

## Changelog

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
- Release gates pass: 5872 automated tests (171 test files), TypeScript, production build, mobile smoke, Chromium smoke, and `verify:release`; artifacts dist/index.js 631610 bytes, package.zip 318095 bytes.

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

## Architecture And Tests

<p align="center"><img src="docs/architecture.svg" width="860" alt="LvSpeed Switch six-layer runtime architecture"/></p>

The plugin uses six layers. Its three surfaces share navigation services and persistence, while each surface owns its DOM, search session, and lifecycle:

| Layer | Entry file / class | Responsibility |
| --- | --- | --- |
| Surface | `showSwitcher` / `renderSidebarPanel` / `showMobileSwitcher` | Surface-specific layout and interaction for desktop/fullscreen, right sidebar, and mobile |
| Orchestration | `registerSwitcherRefresh` / SearchSession / action executor | View refresh broadcasting, isolated async state, shared command routing |
| Navigation services | Tabs / favorites / search / quick actions / journal / panels | Sorting, deduplication, batch behavior, and progressive feature composition |
| SiYuan integration | `getAllTabs` / MobileTabs / kernel API / Dock / plugin commands | Encapsulates host capabilities and third-party plugin boundaries |
| Persistence | `loadData` / `saveDataDebounced` / `storage-migration.js` | Thirteen validated storage keys (11 migration-handled + 2 inspected), debounced writes, unload flush, read-only migration rehearsal, and configuration transfer |
| Infrastructure | `util.js` / `search-session.js` / `quick-actions.js` / types and constants | Host-independent pure functions, types, boundaries, logging, and tests |

**Performance isolation**: open-tab switching uses local state only. Workspace requests, thumbnail backfill, and third-party actions are optional layers that may fail independently. Every search surface owns its request version, abort controller, timer, and cache, all released on destruction.

**Data boundaries**: thirteen storage keys persist independently — `sw_mru`, `sw_open_history`, `sw_closed_history`, `sw_pinned`, `sw_favorites`, `sw_fav_groups`, `sw_fav_collapsed`, `sw_quick_actions`, `sw_quick_actions_defaults`, `sw_document_sets`, `sw_thumb_cache`, `sw_settings`, `sw_home_state`. Favorites are capped at 512 entries, pins at 64, and favorite groups at 64; loading and runtime writes both deduplicate, clamp, and safely write back. Re-queryable search results and temporary UI state are never written to plugin data.

**Home-module bridge (experimental, explicit mount)**: third-party plugins may register read-only, device-scoped modules with `registerHomeModule`, then explicitly mount them through `createHomeModuleController` or `createHomePanelController`. Reads are normalized to shared empty/loading/cached/error states and bounded by item, text, concurrency, and lifecycle limits. Registration never changes the default switcher home automatically and never persists external function references; callers should run the returned unregister function and `dispose()` the controller during unload.

```ts
const unregister = speedSwitch.registerHomeModule({
    moduleId: "my-readonly-module",
    title: "My summary",
    supportedDevices: ["desktop", "sidebar"],
    read: async (config, device) => ({items: await readSummary(config, device)}),
});
// The caller explicitly creates the controller in its own container and owns its lifecycle.
```

**Test matrix**: `pnpm test` discovers all 212 `*.test.cjs` files under `tests/` and `tests/host/`, currently 6314 tests in total; the authoritative count is the command output. UI smoke tests run separately:

| File | Scope |
| --- | --- |
| `tests/util.test.cjs` | `util.js` pure functions and data sanitization boundaries |
| `tests/constants.test.cjs` | Source constant range and format checks |
| `tests/search-session.test.cjs` | Session isolation, cancellation, versions, and cache limits |
| `tests/quick-actions.test.cjs` | Defaults, optional built-ins, sanitization, command/adapter, and grapheme boundaries |
| `tests/quick-actions-ui.test.cjs` | Quick-action picker and icon-symbol boundaries |
| `tests/search-model.test.cjs` | Search aggregation, request normalization, scopes, advanced filters, cache keys, and result pagination planning |
| `tests/agent-capabilities.test.cjs` | Agent schemas, input normalization, output bounds, registration fallback, and JSON Schema validation |
| `tests/i18n.test.cjs` | Locale parity, static references, and value validation |
| `tests/checkin-bridge-model.test.cjs` | Check-in bridge model: API handshake, capability probing, streaks, and heatmap caliber |
| `tests/checkin-bridge-protocol.test.cjs` | Widget protocol v2.4 source whitelist and source/dependency consistency for the five check-in widgets |
| `tests/home-source-model.test.cjs` | Source resolution, source-group aggregation, and deterministic ordering |
| Remaining top-level and `tests/host/*.test.cjs` | Recent records, home runtime, view contracts, third-party providers, compatibility, and release contracts |

| UI test | Scope |
| --- | --- |
| `tests/mobile-card-smoke.cjs` | Mobile card, action buttons, single-column grid, thumbnail, and settings-switch CSS invariants |
| `tests/mobile-toolbar-layout.cjs` | Real-Chromium gate for mobile toolbar chip legibility, widget-panel card height band, and icon bounding before the plugin stylesheet applies (with a bare-svg control) |
| `tests/chromium-style-smoke.cjs` | Computed styles for mobile cards, switches, and workspace search cards in real Chromium, optionally layered with host/theme CSS |
| `tests/live-siyuan-smoke.cjs` | Connects to a test browser running the real SiYuan desktop frontend and checks the toolbar, quick actions, and responsive settings |
| `tests/live-siyuan-mobile-smoke.cjs` | Connects to SiYuan's mobile frontend and checks the mobile branch, single-line toolbar, dialog bounds, and settings overflow |

## Development

### Quick commands

```bash
pnpm install            # install dependencies
pnpm dev                # dev watch (outputs dev dist/)
pnpm build              # production build → dist/* + package.zip
pnpm test               # run every unit, contract, and host release test (currently 6138)
pnpm test:smoke         # mobile UI smoke test (requires `pnpm build` first)
pnpm test:smoke:layout  # mobile toolbar/widget-panel layout gate with a bare-svg control (requires `pnpm build` first)
pnpm test:smoke:browser # Chromium/theme test (supports SIYUAN_BASE_CSS and SIYUAN_THEME_CSS)
pnpm verify:release     # local release-candidate gate (typecheck, reproducible two-build audit, tests, release/quality/integration audits, and all three UI smokes)
```

Pushing a `v*` tag triggers GitHub Actions to build and publish a Release.

### How to add a new setting

1. **`src/types.ts`** — add the field + default to `ISwSettings`:
   ```ts
   export interface ISwSettings {
       myNewOption: boolean;     // new field
       // ...
   }
   ```

2. **`src/constants.ts`** — add bounds (`MY_NEW_MIN` / `MY_NEW_MAX`) if applicable.

3. **`src/index.ts → DEFAULT_SETTINGS`** — provide a default:
   ```ts
   const DEFAULT_SETTINGS: ISwSettings = {
       myNewOption: false,
       // ...
   };
   ```

4. **`src/index.ts → buildSettingsXxx`** — render the input control (switch / select / number) in the matching tab; saved on every change.

5. **i18n** — add the key to both `src/i18n/zh-CN.json` and `src/i18n/en.json`, keeping both key sets identical.

### How to add a new dock panel

1. Append `{key, icon, label}` to the `DOCK_ITEMS` array inside `renderDockList`.
2. If the panel needs special activation (not a plain `openTab`), add a branch in `openDockByKey`.

### Third-party quick action adapters

Commands already registered through SiYuan's `addCommand()` appear automatically in the Quick Actions add list and need no additional adapter. For parameters or a custom workflow, locate the LvSpeed Switch plugin instance and register a visible entry directly:

```ts
const speedSwitch = this.app.plugins.find(
    (plugin) => plugin.name === "siyuan-speed-switch",
);

this.unregisterSpeedSwitchAction = speedSwitch?.registerQuickAction({
    id: "xiaolv-checkin",
    label: "Time",
    icon: "iconCalendar",
    value: "open",
    targets: ["desktop", "sidebar", "mobile"],
    handler: (value) => openClock(value),
});

// Call from the provider plugin's onunload():
this.unregisterSpeedSwitchAction?.();
```

The entry is persisted in Quick Actions settings and can target surfaces independently. Its callback stays in memory; no function is serialized. When the provider unloads, configuration remains but execution is skipped safely. The lower-level `registerQuickActionAdapter(id, handler)` API can take over a pre-existing `adapter` configuration. DOM-click simulation and synthetic global shortcuts are intentionally unnecessary.

### How to add a new sort order

1. Add the sort key to the `SORT_BY_LIST` constant array.
2. Add a member to the `SortBy` union type.
3. Add the sort branch inside `sortGroupItems` (extract to `util.js` for unit testing).

## Development Roadmap

See [ROADMAP.md](./ROADMAP.md) for planned phases, design constraints, and release gates.

## 📜 Architecture Decision Records

All architecture decisions live in [`docs/adr/`](docs/adr/) (ADR-0001 ~ ADR-0062). Recent highlights:

- [ADR-0048/0052 UI module extraction](docs/adr/0048-mobile-switcher-ui-extraction.md) — how the mobile switcher and second panel moved out of `index.ts`
- [ADR-0049/0050 stylesheet order-preserving split](docs/adr/0049-stylesheet-order-preserving-split.md) — why `index.scss` can only be sliced in source order, never by domain
- [ADR-0051 governance doc archive](docs/adr/0051-governance-doc-archive-and-root-budget.md) — ledger archiving and the root-directory size budget
- [ADR-0057 widget sources as first-class citizens](docs/adr/0057-widget-source-and-store-grouping.md) — widget protocol v2.4 and store source grouping
- [ADR-0058 database table projection](docs/adr/0058-av-widget-bounded-list-projection.md) — why the database widget is a read-only bounded list projection
- [ADR-0059/0062 resource line calibration](docs/adr/0062-raw-bundle-line-recalibration.md) — size gates guard against runaway growth only: 224 KiB per-entry zip, 832 KiB raw, 512 KiB archive ceiling unchanged

## License

[MIT](./LICENSE)
