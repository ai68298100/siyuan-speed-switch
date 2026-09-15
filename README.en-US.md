# LvSpeed Switch

[![Version](https://img.shields.io/badge/version-0.17.0-blue)](./plugin.json) [![License: MIT](https://img.shields.io/badge/license-MIT-green)](./LICENSE) [![SiYuan](https://img.shields.io/badge/SiYuan-SiYuan_Note-ff5c67)](https://b3log.org/siyuan)

LvSpeed Switch is a lightweight navigation workspace for [SiYuan Note](https://b3log.org/siyuan). It keeps **open tabs** first and uses live thumbnails for rapid preview and switching, then progressively exposes **favorites, workspace document search, panels, journals, and customizable quick actions**. Desktop dialog, right sidebar, and mobile share one data and command model while adapting their layouts to screen space and input method.

<p align="center"><img src="preview.png" width="720" alt="LvSpeed Switch preview"/></p>

<p align="center"><img src="docs/interface-map.svg" width="860" alt="Desktop dialog, right sidebar, and mobile interface map"/></p>

> v0.17.0 deepens read-only SiYuan Agent collaboration with lifecycle audits, transport queues, joint recovery, checkpoint windows, and diagnostics projections, while retaining the widget-store, configuration, and multi-surface navigation experience.

> The current development head passes type checking, production build, 5075 automated tests, and mobile/Chromium UI smoke tests. It adds time, weather, holiday overlays, Bangumi schedule, DailyHotApi trends, NewsNow feeds, and an ActivityWatch app-usage bridge. The store now filters Offline, Local service, and External API sources. Agent safety boundaries remain unchanged; real-host path-filter, narrow-sidebar, ActivityWatch, and Android-device acceptance remain follow-up compatibility checks.

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

On SiYuan versions that expose `addAgentCapability` (the current adapter follows the SiYuan 3.8.3 source), the plugin registers twelve capabilities after a runtime check. Read-only capabilities declare `localRead` only, with no writes, data egress, or external cost; controlled navigation declares no writes. Input, output, and text sizes are bounded. Older SiYuan versions skip registration without affecting tab switching or mobile startup. SiYuan owns policy and lifecycle cleanup; further cross-document or destructive actions will be added only after explicit approval, cancellation, and permission-denial tests. See the AI capability section in [ROADMAP.md](./ROADMAP.md).

[中文说明](./README.md)

**Agent capabilities** (via `addAgentCapability`): `navigation-state` (bounded tabs, recent-open, recent-closed and favorites snapshot), `search-documents`, `home-widget-snapshot`, `get-document-outline`, `document-context` and `workspace-context` (read-only), `open-document` and `open-documents` — up to 5 documents per call, behind a confirmation dialog listing every title (controlled navigation), `update-task-status`, `create-document` and `append-to-journal` (controlled writes behind a mandatory confirmation dialog). Document search supports bounded notebook and path scopes, content filters, search method, and result ordering.

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

Search requests use a 180 ms debounce, bounded in-memory cache, request-version validation, and cancellation. Desktop dialog, right sidebar, and mobile each own an isolated search session, so one surface cannot cancel or overwrite another. The current worktree supports bounded notebook, content-type, subtype, search-method, and result-order filters; notebook/path-only filters keep the title fast path, while advanced filters use native block search. Path-tree selection is still not exposed in the UI, and this remains an addition rather than a replacement for SiYuan's native search page. See [ROADMAP.md](./ROADMAP.md) for that work.

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

- **Marketplace**: search "小驴速切 / LvSpeed Switch" in **Settings → Marketplace → Plugins** (community bazaar listing pending).
- **Manual**: download `package.zip` from [Releases](https://github.com/ai68298100/siyuan-speed-switch/releases), extract into `<workspace>/data/plugins/siyuan-speed-switch/` and restart SiYuan (the folder must be named `siyuan-speed-switch`).

Upgrading preserves favorites, groups, pins, MRU, and settings. On first `v0.16.9` load, quick-action fields are validated; invalid entries are ignored, while valid configurations remain even if their third-party provider is temporarily unavailable.

## Requirements And Compatibility

- SiYuan v3.1.20+ (uses the `getAllTabs` API).
- Desktop client / browser-desktop frontend (tabs and split panes).
- Mobile features (FAB, tab switching, favorites) require SiYuan **v3.8.0+** (relies on the mobile MobileTabs system).
- Agent capabilities are registered only when the host exposes `addAgentCapability`; older hosts skip them safely.
- Path-tree filtering is not exposed in the UI yet; only the model/request boundary exists until a stable host API is available.
- Browser emulation is for structural/style checks only and is not Android SiYuan acceptance evidence.
- Real install, upgrade, uninstall, and theme checks remain manual release steps.

## Release Checklist

See the [release readiness matrix](docs/release-readiness.md) for the current candidate status, automated gates, and remaining real-host checks.

Run the fixed local gate before manual acceptance:

```bash
pnpm verify:release
```

The command runs type checking, a production build, the complete automated suite, the mobile UI smoke test, and the Chromium style smoke test. The release workflow additionally enforces `package.zip` allowlisted contents, metadata consistency, no remote runtime dependencies, and the reviewed 320 KiB archive budget.

Then verify in a real SiYuan environment:

1. Desktop dialog: open, search, sorting, favorites, recent history, journal, settings, and fullscreen.
2. Right sidebar: narrow-width toolbar, card scaling, quick actions, and history overlays.
3. Android: first frame, single/double-column cards, sort/favorite sheets, settings scrolling, and safe-area spacing.
4. Themes: default light/dark themes, Neo or another third-party theme, resize, and rotation.
5. Lifecycle: install, upgrade, uninstall, restart migration, and API failure/cancel/permission-denial paths.

This release is published as `v0.17.0`; real-host path-filter capability, narrow-sidebar, and Android-device checks remain tracked as follow-up compatibility work.

## Changelog

### Current development head (unreleased)

- The widget store adds a Life Information group and a fully offline Local Date & Time widget for desktop, sidebar, and mobile. It refreshes on real minute boundaries and releases its heartbeat while hidden or disposed.
- A pure catalog records nine researched external-widget candidates with source, licensing/terms, credentials, privacy, platform, and honest availability metadata. Sources without a production adapter are not presented as ready-to-add widgets.
- Open-Meteo weather now loads only after a city is configured, with an iPad-like gradient, current conditions, feels-like temperature, 2–5 day forecast, endpoint allowlisting, timeouts, response bounds, 15-minute caching, and attribution.
- Bangumi Anime Schedule now selects today, tomorrow, or the week using the device's local weekday and presents real 3:4 official cover cards with lazy loading, exact endpoint/cover allowlists, and a 30-minute cache. It does not claim personalized recommendations.
- The journal calendar can optionally show holiday-cn public holidays and adjusted workdays alongside lunar labels. Store cards now disclose source, connectivity, and privacy. The current head contains 33 built-in widgets across 10 functional store groups, including a Device & focus group; source filters distinguish offline, local-service, and external-API components.
- DailyHotApi **Trending now** and NewsNow **Live news** accept only complete self-hosted endpoints and make no request until configured. Remote endpoints require HTTPS; 128 KiB/8.5-second request bounds, a 30-minute cache, and a visible stale-cache state isolate source failures. Ranked gradient cards retain a compact mobile layout.
- ActivityWatch **App usage** only allows loopback endpoints, uses SiYuan's local proxy for a fixed aggregate query, exposes app-level durations without window titles, and is available on desktop/sidebar only.
- The mobile widget panel uses one vertical column and one unified size per widget; tab-list column settings do not affect the widget panel.
- The development head passes 5075 automated tests, TypeScript, production build, mobile smoke, and Chromium UI smoke; artifact details are tracked in the release-readiness matrix.

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
| Persistence | `loadData` / `saveDataDebounced` | Eight validated storage keys, debounced writes, unload flush, and configuration transfer |
| Infrastructure | `util.js` / `search-session.js` / `quick-actions.js` / types and constants | Host-independent pure functions, types, boundaries, logging, and tests |

**Performance isolation**: open-tab switching uses local state only. Workspace requests, thumbnail backfill, and third-party actions are optional layers that may fail independently. Every search surface owns its request version, abort controller, timer, and cache, all released on destruction.

**Data boundaries**: `sw_mru`, `sw_pinned`, `sw_favorites`, `sw_fav_groups`, `sw_fav_collapsed`, `sw_closed_history`, `sw_quick_actions`, `sw_settings`, and `sw_thumb_cache` persist independently. Favorites are capped at 512 entries, pins at 64, and favorite groups at 64; loading and runtime writes both deduplicate, clamp, and safely write back. Re-queryable search results and temporary UI state are never written to plugin data.

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

**Test matrix**: `pnpm test` discovers all 151 `*.test.cjs` files under `tests/` and `tests/host/`, currently 5235 tests in total. UI smoke tests run separately:

| File | Scope | Cases |
| --- | --- | --- |
| `tests/util.test.cjs` | `util.js` pure functions and data sanitization boundaries | 58 |
| `tests/constants.test.cjs` | Source constant range and format checks | 6 |
| `tests/search-session.test.cjs` | Session isolation, cancellation, versions, and cache limits | 8 |
| `tests/quick-actions.test.cjs` | Defaults, optional built-ins, sanitization, command/adapter, and grapheme boundaries | 21 |
| `tests/quick-actions-ui.test.cjs` | Quick-action picker and icon-symbol boundaries | 4 |
| `tests/search-model.test.cjs` | Search aggregation, request normalization, scopes, advanced filters, and cache keys | 35 |
| `tests/agent-capabilities.test.cjs` | Agent schemas, input normalization, output bounds, registration fallback, and JSON Schema validation | 10 |
| `tests/i18n.test.cjs` | Locale parity, static references, and value validation | 10 |
| Remaining top-level and `tests/host/*.test.cjs` | Recent records, home runtime, view contracts, third-party providers, compatibility, and release contracts | 281 |

| UI test | Scope |
| --- | --- |
| `tests/mobile-card-smoke.cjs` | Mobile card, action buttons, single-column grid, thumbnail, and settings-switch CSS invariants |
| `tests/chromium-style-smoke.cjs` | Computed styles for mobile cards, switches, and workspace search cards in real Chromium, optionally layered with host/theme CSS |
| `tests/live-siyuan-smoke.cjs` | Connects to a test browser running the real SiYuan desktop frontend and checks the toolbar, quick actions, and responsive settings |
| `tests/live-siyuan-mobile-smoke.cjs` | Connects to SiYuan's mobile frontend and checks the mobile branch, single-line toolbar, dialog bounds, and settings overflow |

## Development

### Quick commands

```bash
pnpm install            # install dependencies
pnpm dev                # dev watch (outputs dev dist/)
pnpm build              # production build → dist/* + package.zip
pnpm test               # run every unit, contract, and host release test (currently 5118)
pnpm test:smoke         # mobile UI smoke test (requires `pnpm build` first)
pnpm test:smoke:browser # Chromium/theme test (supports SIYUAN_BASE_CSS and SIYUAN_THEME_CSS)
pnpm verify:release     # local release-candidate gate (typecheck, build, tests, and both UI smokes)
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

- [ADR-0001 Method splitting](docs/adr/0001-method-splitting.md) — why we split `onload` / `applySearch` etc. into orchestrator + helpers
- [ADR-0002 Constants in `src/constants.ts`](docs/adr/0002-constants-module.md) — why we centralised magic numbers into a single module in v0.16.0
- [ADR-0003 Pure functions + jsdom test matrix](docs/adr/0003-testing-strategy.md) — why `util.js` must stay zero-dep + Node built-in `node:test`
- [ADR-0004 Persistent data sanitization](docs/adr/0004-data-sanitization.md) — why historical configuration is validated, deduplicated, and capped before entering UI code

## License

[MIT](./LICENSE)
