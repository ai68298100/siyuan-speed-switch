# LvSpeed Switch

[![Version](https://img.shields.io/badge/version-0.16.7-blue)](./plugin.json) [![License: MIT](https://img.shields.io/badge/license-MIT-green)](./LICENSE) [![SiYuan](https://img.shields.io/badge/SiYuan-SiYuan_Note-ff5c67)](https://b3log.org/siyuan)

A tab switcher for [SiYuan Note](https://b3log.org/siyuan): flip through open tabs with **live thumbnails** just like Windows **Win+Tab / Alt+Tab** — plus **grouped favorites**, **workspace-wide search**, **one-click dock panels**, a **dockable sidebar mode**, and a **fullscreen mode**. Split windows (panes) are fully supported, and **mobile is fully adapted**.

<p align="center"><img src="preview.png" width="720" alt="LvSpeed Switch preview"/></p>

[中文说明](./README.md)

## ✨ Features

### Switching
- 🌟 **Live thumbnails** — One card per tab showing real document content; background tabs are fetched via the kernel API, so every thumbnail is visible on first open.
- 🔀 **Split-window native** — Tabs are grouped by window (pane); switching activates the right pane automatically.
- ⌨️ **Full keyboard control** — Arrows / `Tab` move the selection across the real grid, `Enter` switches, `Esc` closes — same muscle memory as Alt+Tab.
- 📌 **Pin tabs** — Pin frequently used tabs to the front of their group; remembered per document across restarts.
- 🖥️ **Fullscreen mode** — One toolbar button toggles fullscreen ⇄ normal; the thumbnail wall fills the whole window. Persist a default in settings; `Esc` exits.

### Favorites & Groups
- ⭐ **One-click favorite** — Star any tab; document tabs are remembered by rootID, so you can **reopen them from favorites even after the tab closes**, surviving restarts.
- 🗂️ **Group management** — File favorites into groups on star click, or create groups on the fly; settings let you **create / inline-rename / delete groups** and reassign favorites per item — all saved instantly.
- 🖱️ **Right-click shortcuts** — Both cards and dropdown favorites support right-click: **move to group** (submenu with one click), **new group & move**, unfavorite — bulk organizing without opening settings.
- 📂 **Grouped dropdown** — The favorites dropdown is a custom component: group headers with count badges, **click to collapse / expand**; auto-narrows and clamps inside narrow sidebars, never overflows.

### Search & Sort
- 🔍 **Two-section search** — Matching open tabs on top, **workspace-wide document results** below (already-open docs excluded, click to open); 180ms debounce + result cache + stale-request aborting.
- 🔃 **Six sort orders** — Recently used / open order / reversed / recently edited / title asc/desc, switchable in-place and persisted.

### Panels & Sidebar
- 🖇️ **Panel quick access** — All dock panels (file tree, outline, bookmarks, graph, backlinks, tags, inbox, AI chat…) listed on the left rail; click to open and focus. Hide unwanted ones in settings.
- 📎 **Sidebar mode** — Pin the tab list to a right dock panel: cards that resize with the panel, always at hand; when stretched wider, choose between **enlarging thumbnails** or **auto-adding columns**.
- 📅 **Today's journal** — A journal button in the switcher's top bar opens/creates today's journal with one click once you've opened the switcher; pick the default notebook under **Settings → Journal**, or a picker pops up on first click if unset.

### Mobile
- 📱 **Fully adapted** — A permanent top-bar entry plus an optional floating button (off by default, enable it in settings); thumbnails, favorites and search work just like on desktop.
- 👆 **Touch interactions** — Long-press a card for pin / favorite / group / close (the mobile equivalent of right-click); the floating button hides on swipe up and returns on swipe down, matching SiYuan's own toolbar.
- 🗂️ **Adaptive layout** — Card layout supports single / double / auto columns (single in portrait, double in landscape); one setting syncs across devices.

### Performance & Look
- 💾 **Thumbnail cache** — Content snapshots cached per document; layout resets and app restarts load instantly. Cache is pruned on tab close, capped at 200KB per entry.
- ⚡ **Lazy viewport rendering** — Only thumbnails scrolled into view are generated, so the switcher opens instantly with many tabs; re-sorting reuses cards and keeps rendered thumbnails.
- 🎨 **Theme aware** — Every style rides on SiYuan theme variables, following light/dark and **third-party themes** seamlessly; settings switches enforce high-contrast on/off states under any theme.

## 🚀 Quick Start

1. **Open**: the layout icon on the top toolbar, or the hotkey `Alt+Shift+S` (changeable in **Settings → Keymap**); on mobile, tap the top-bar entry or the floating button.
2. **Switch**: click a card, or move with arrows / `Tab` and hit `Enter`; click a panel on the left rail to jump to it.
3. **Manage**: pin with the pin button, favorite with the star (group menu pops up); close tabs with × on the card, or right-click for the full menu (long-press on mobile).
4. **Search**: type in the toolbar — tab and document results appear together.
5. **Dock it**: hit the "Sidebar mode" toolbar button to pin the switcher to the right dock.
6. **Fullscreen**: hit the fullscreen toolbar button to fill the window; click again or `Esc` to restore.

## ⌨️ Shortcuts

| Key | Action |
| --- | --- |
| `Alt+Shift+S` | Toggle the switcher (global, configurable) |
| `↑` `↓` `←` `→` | Move selection across the grid |
| `Tab` / `Shift+Tab` | Next / previous |
| `Enter` | Switch to the selected tab |
| `Esc` | Close the switcher |

## ⚙️ Settings

**Settings → Plugins → LvSpeed Switch → Settings** (or the gear button inside the switcher), organized as five tabs on the left rail; every change saves instantly:

| Tab | Options |
| --- | --- |
| Appearance | Switcher width/height (480–1920 × 360–1280), thumbnail columns (auto / 2–8), thumbnail height (72–360) |
| Behavior | Default sort order, fullscreen mode (off by default; opens filling the window) |
| Panels | Show / hide left-rail panels, display mode (full list / collapsed icon rail / hidden), sidebar thumbnail layout (enlarge / auto columns) |
| Favorites | Create / rename / delete groups, reassign favorites |
| Journal | Default journal notebook (dropdown; first click of the journal button also prompts a picker) |
| Mobile | Floating button toggle (off by default), card layout (single / double / auto) |

## 📦 Install

- **Marketplace**: search "小驴速切 / LvSpeed Switch" in **Settings → Marketplace → Plugins** (community bazaar listing pending).
- **Manual**: download `package.zip` from [Releases](https://github.com/ai68298100/siyuan-speed-switch/releases), extract into `<workspace>/data/plugins/siyuan-speed-switch/` and restart SiYuan (the folder must be named `siyuan-speed-switch`).

## Requirements

- SiYuan v3.1.20+ (uses the `getAllTabs` API).
- Desktop client / browser-desktop frontend (tabs and split panes).
- Mobile features (FAB, tab switching, favorites) require SiYuan **v3.8.0+** (relies on the mobile MobileTabs system).

## Changelog

### v0.16.7 (2026-09-05)

- Fixed favoriting unloaded tabs by resolving document IDs from SiYuan's lazy-loaded tab data and retrying after loading.
- Fixed incomplete one-click favorite group open/close actions by confirming tab state after each operation.
- Fixed Neo and similar themes enlarging the mobile favorite, pin, and close buttons by enforcing stable button and icon dimensions.
- Fixed mobile close failures being counted as successful closes; failed single closes now keep their cards and show an error.
- Fixed the mobile "Recently edited" sorting race caused by asynchronous timestamp loading.
- Debounced thumbnail cache writes, awaited pending saves during unload, and added HTTP error handling for kernel requests.
- Added version consistency, type-check, unit-test, and smoke-test gates to the release workflow.

### v0.16.6 (2026-09-05)

- **Sort switches reflect up-to-date edit times**: desktop popup, sidebar and mobile share & backfill the updated-time map when switching to "Recently edited", so ordering is correct on first paint and stable after switches.
- **Accurate batch close counts**: only tabs that were actually closed successfully count toward the summary message.
- **Mobile sort switching keeps state**: reuses the assembled list closure, re-sorts with the latest data immediately and clears the search box.
- **Better emoji icon detection**: composed emoji (e.g. 👨‍👩‍👧) and skin-tone emoji (e.g. 👍🏽) now render as emoji correctly.
- Fixed listener leaks when the favorites dropdown is destroyed mid-collapse; the mobile favorites sheet shows a hint when empty instead of staying silent.

### v0.16.5 (2026-09-05)

- **Auto-sanitize persisted data on startup**: favorites are deduped by key, corrupted entries are dropped and fields normalized; pinned/group lists filter invalid entries — legacy dirty data no longer amplifies over time.
- Sanitization writes back to storage only when data actually changed, so normal startups perform zero extra disk writes.

### v0.16.4 (2026-09-05)

- **Fixed favorites disappearing after clicking**: favoriting a lazy-loaded (never-activated) tab failed to resolve the doc ID, so the favorite key degraded to a one-off tab ID — jumps silently failed, star states desynced and caused duplicates, and repeated cleanup eventually emptied the list.
- Favoriting a not-yet-loaded tab now shows a "switch to the tab first" hint instead of creating a broken entry.
- Legacy broken favorite entries are auto-migrated (one-off tab ID → stable doc ID) once the tab is opened; no manual cleanup needed.
- Clicking a favorite / opening a group now reports entries that cannot be located instead of failing silently; favorites persist until explicitly removed.

### v0.16.3 (2026-09-05)

- Fixed the pin / favorite / close action buttons at the bottom-right of mobile tab cards.
- Fixed "open all / close all favorites" not applying to the whole group.
- MRU (most recently used) list now caps at 200 entries to prevent unbounded plugin data growth.

### v0.16.0 (2026-09-05)

- **Architecture & docs**:
  - README now includes `docs/architecture.svg` — a five-layer diagram (entry points → switcher main → subsystems → persistence → infrastructure).
  - README "Development" section expanded: "How to add a setting / dock panel / sort order" with copy-pasteable code patterns.
  - Three new ADRs in `docs/adr/`: `0001-method-splitting.md` / `0002-constants-module.md` / `0003-testing-strategy.md` — for future refactors to look back on.
- **New `src/constants.ts`**: centralised every magic number / threshold, grouped by domain with `_MS` / `_PX` / `_MIN/MAX` naming conventions:
  - Timing: `SEARCH_DEBOUNCE_MS` / `SAVE_DEBOUNCE_MS` / `FAB_HIDE_DELAY_MS` / `MESSAGE_DEFAULT_MS` / `UPDATED_CACHE_MS`
  - Pixels: `DIALOG_WIDTH_MIN_PX/MAX_PX` / `DIALOG_HEIGHT_MIN_PX/MAX_PX` / `THUMB_HEIGHT_MIN_PX/MAX_PX` / `MOBILE_THUMB_HEIGHT_MIN_PX/MAX_PX` / `BACK_TOP_THRESHOLD_PX` / `SIDEBAR_DEFAULT_WIDTH_PX`
  - Ranges: `COLUMNS_MIN/MAX` / `MOBILE_COLUMNS_MIN/MAX`
  - `src/index.ts` updated in sync: debounce timings, UI bounds, column limits, favorites / FAB / back-top thresholds — future tweaks need only one place.
- **5 more giant methods split** (continuing the v0.15.6 refactor streak):
  - `onload` 83 → 25 lines — extracted `initPersistentData()` / `registerDesktopDock()` / `registerMobileEntries()` / `bindGlobalEvents()`; lifecycle phases cleanly separated.
  - `applySearch` 56 → 22 lines — extracted `runDocSearchFetch()`; cache hit path and remote fetch path separated, easier to test timeout/cancel branches individually.
  - `renderDocResults` 70 → 17 lines — extracted `ensureDocResultsBox()` / `collectOpenRootIds()` / `appendDocResultsEmpty()` / `buildDocResultItem()`; each helper single-responsibility.
  - `buildSettingsFavGroupList` 79 → 16 lines — extracted `buildFavGroupRow()` / `replaceFavGroupRowWithRenameControls()`; row construction vs inline rename UI separated.
  - `promptJournalNotebook` 60 → 16 lines — extracted `buildJournalPromptHtml()` / `createJournalSelect()` / `populateJournalNotebookSelect()` / `bindJournalPromptEvents()`; HTML / option population / event binding in three layers.
  - Not split: `openSetting`(88) — closure-captured locals make extraction harmful; queued for next round.
- **Tests extended**:
  - New `tests/constants.test.cjs`: validates MIN/MAX/range self-consistency + debounce timing sanity, **3 cases / 5.7ms**.
  - `tests/mobile-card-smoke.cjs` grew from 3 button sizes to 7 CSS invariants: 3 28×28 buttons + `.sw__icon` collapse defence + `.sw__mobile-card` present + `.sw__mobile-grid` single-column + `.sw__thumb` placeholder.
  - `npm test` runs all in one shot — **26 cases / ~1s all green**.
- **Quality gates**: tsc 0 errors, build OK (152 KiB package.zip), zero `console` / `debugger` / `alert` / `@ts-ignore` residuals, the only `as any` occurrence is in a comment (not code).

### v0.15.6 (2026-09-04)

- **Giant-method split (pure refactor, zero behavior change)**: every method over 70 lines in `src/index.ts` was split into a 10–50-line orchestrator plus single-purpose helpers. All tests pass; build artifact is identical:
  - `renderList()` **100→44 lines** — extracted `sortGroupItems` / `renderTabGroup` / `buildTabGroupGrid`; introduced `ITabGroupRenderCtx` interface to constrain helper parameters and avoid parameter sprawl.
  - `renderMobileList()` **74→42 lines** — extracted `buildMobileGroupGrid` / `renderMobileCardsInGroup`; mobile grid rendering is now decoupled.
  - `renderSidebarPanel()` **85→27 lines** — extracted `buildSidebarHtml` / `observeSidebarResize` / `bindSidebarToolbarEvents`; sidebar shell / responsive `ResizeObserver` / toolbar interactions are layered.
  - `assembleSwitcherParts()` **82→47 lines** — extracted `prepareSwitcherChrome` / `bindSwitcherListArea` / `bindSwitcherBackTop`; switcher chrome / list-area events / back-to-top button live in three clean layers.
  - `renderFavPanel()` **82→31 lines** — extracted `appendFavGroup` / `appendFavFlatList`; reusing the pure `groupFavoritesByGroup` from the last round.
  - `openFavMenu()` **73→16 lines** — extracted `buildFavMenuUnfavorited` / `buildFavMenuFavorited`; the unfavorited vs favorited menu-construction branches are now fully separated.
  - `openSetting()` **385→90 lines** — extracted `buildSettingsAppearance` / `buildSettingsBehavior` / `buildSettingsPanels` + `buildSettingsDockToggles` / `buildSettingsMobile` / `buildSettingsJournal` / `buildSettingsFavorites` + `buildSettingsFavCreateRow` / `buildSettingsFavGroupList` / `appendSettingsFavItems`. The five settings tabs (Appearance / Behavior / Panels / Favorites / Mobile) now build independently, so adding a new option no longer bloats the central method.
- **Two new pure helpers in `src/util.js`**:
  - `resolveIconFallback` — locks in the 5-case fallback strategy from the previous mobile icon fix.
  - `buildTabGroupsByParent(tabs, fallbackKey)` — shared by `renderList` / `renderMobileList`; desktop and mobile's parent-window grouping logic collapses into a testable function.
- **Unit tests**: 4 new cases for `buildTabGroupsByParent` (jsdom verifies Map order + fallback window key), 5 for `resolveIconFallback`, 4 for `groupFavoritesByGroup` — total **23/23 passing**.
- **Next candidates**: `onload` (86) / `buildSettingsFavGroupList` (81) / `renderDocResults` (75) / `promptJournalNotebook` (63) / `openMobileGroupActions` (59) / `applySearch` (58) / `setupFavDropdown` (57) / `openCardMenu` (56) / `bindKeydown` (55) are still long — queued for future rounds.

### v0.15.5 (2026-09-04)

- **Fixed mobile tab card icon display**:
  - `getMobileTabs()` now reads SiYuan's tab-icon field from both possible locations: `t.icon` first, then falls back to `t.current.icon` (different SiYuan builds store it differently).
  - Extracted `resolveIconFallback(raw)` as a pure function in `src/util.js`, covering five cases — empty value, `icon*` SVG name, emoji character, 4-6 digit hex codepoint, invalid string — all with unit tests.
  - SCSS adds `min-width/height: 14px`, `svg{display:block}` and an empty placeholder to `.sw__icon`, so an SVG load failure no longer collapses the icon and shifts the title.
- **Fixed favorite-group batch open/close dropping items on desktop and mobile**:
  - `openGroupTabs()` and `closeGroupTabs()` are now `async`: each `openTab` / `mobileOpenDoc` / `MobileTabs.close` is awaited in sequence, so the next call never races against the previous state.
  - `closeTabQuietly()` is now `async` — awaits the `MobileTabs.close` Promise when present, otherwise sleeps 80ms; desktop `removeTab` gets a 30ms settle delay before the next tab closes.
  - New `sleep(ms)` helper.
  - `openFavGroupMenu` and `openMobileGroupActions` `click` handlers are now `async`/`await`, so the menu/sheet stays open until the batch finishes — no more "list refreshed before the action took effect".
- **Unit tests**: 5 new cases for `resolveIconFallback`; total now **19/19 passing** (10.5ms).

### v0.15.4 (2026-09-04)

- **Mobile switcher `showMobileSwitcher()` split**: 138 lines → 12-line orchestrator + 5 helpers (`createMobileSwitcherDialog`, `buildMobileSwitcherHtml`, `bindMobileSwitcherToolbarActions`, `renderMobileSwitcherList`, `openMobileSwitcherDialog`), cleanly separating top-bar buttons, search, sort, and FAB restore logic.
- **Mobile favorites sheet `showMobileFavSheet()` split**: 151 lines → 30-line orchestrator + 6 helpers; HTML generation, grouping, flat/grouped list rendering, and backdrop-close are now isolated for easier mobile debugging.
- **Card builder `createCard()` split**: 152 lines → 38-line orchestrator + 5 helpers (`buildCardThumb`, `buildCardMeta`, `buildCardIcon`, `buildCardActions`, `bindCardLongPress`); icon rendering is now isolated in `buildCardIcon` so the mobile icon issue can be debugged independently.
- **New pure `groupFavoritesByGroup` function**: moved to `src/util.js`; preserves empty groups from the registry, drops ungrouped items into `""`, and returns a Map that keeps insertion order. Added 4 unit tests covering registry order, empty groups, defensive unregistered groups, and fully ungrouped favorites; total now 14/14 passing.
- **Dev dependency**: added `jsdom@30.0.1` for mobile UI smoke tests.

### v0.15.3 (2026-09-04)

- **Desktop switcher main split**: the 181-line `showSwitcher()` was broken into five clearly-scoped helpers — `createSwitcherDialog`, `buildSwitcherHtml`, `assembleSwitcherParts`, `bindSwitcherFullscreenToggle`, `bindSwitcherToolbarActions` — with the top-level method compressed to a 22-line "menu" of calls. Each helper can now be read, tested and reasoned about in isolation.
- **New `src/util.js` pure-function utility module**: exports `clampNum`, `stableSortBy` and `normalizeSortBy` with zero dependencies. The three `*_LIST.includes(x as T) ? x as T : DEFAULT` patterns inside `getSettings()` collapse to single `normalizeSortBy(...)` calls; the thumbnail LRU eviction now goes through `stableSortBy`, making the intent explicit and self-documenting.
- **Unit-test / UI smoke-test foundation**: added `tests/util.test.cjs` (Node 22's built-in `node:test`, 10 assertions, all passing under 6ms) and `tests/mobile-card-smoke.cjs` (jsdom loads SiYuan's mobile base CSS plus the `litheness` icon sprite, then verifies the three card buttons are still 28×28px). Added two commands to `package.json` — `npm test` and `npm run test:smoke`. No new production dependencies.

### v0.15.2 (2026-09-04)

- **Type-safety refactor**: added `src/types.ts` with a single home for all inferred types of SiYuan global objects (`window.siyuan`), lazily-mounted Protyle models, the MobileTabs API, layout docks, etc.; added the `getSiyuan()` helper so every `(window as any).siyuan` in business code is gone. The 23 `(saved as any).xxx` accesses inside `getSettings()` collapsed into one `as Partial<ISwSettings>` overall cast. Real `as any` usage dropped from 44 occurrences to 0 (remaining 6 are TS-recommended `as unknown as X` double-step narrowing).
- **Structured logger**: added `src/logger.ts`; all 21 `console.warn("[speed-switch] xxx fail", e)` calls now go through `logger.warn(...)` with a unified `[speed-switch]` prefix and one `ENABLED` switch; `error/info/debug` are exposed too for future use.
- **`mobileOpenDoc` three-path fallback**: the previous `// TODO: Mobile` placeholder is now a complete chain — call `MobileTabs.open(rootId)` first, poll `activeTabID` after 300ms to confirm the switch took effect; on no change fall back to `plugin.openTab({app, doc})`; if both fail show a user-friendly message via the new i18n key `openDocFailed` (added in both `zh-CN` and `en`).
- **Refactor details**: `(this as any).element` inside dock callbacks now goes through the strongly-typed `IDockHandlerSelf`; the custom `__swThumbObserver` property hung on `HTMLElement` is now held via a module-level `WeakMap`, eliminating invasive element property assignment. No user-visible UI change.

### v0.15.1 (2026-09-04)

- **Top-bar "Open today's diary" icon fixed**: the desktop and mobile top-bar buttons previously referenced the non-existent `#iconDate` symbol (no such symbol in SiYuan's litheness icon sprite), so the icon rendered blank. Switched to `#iconCalendar` (the calendar symbol shipped with SiYuan); both desktop and mobile now show the icon correctly.
- **Favorites panel — right-click batch open/close (desktop)**: right-click any favorites group header to open every favorited tab in that group at once, or close all opened tabs belonging to it — matching the mobile ⋯ button behavior.
- **Favorites panel — ⋯ button (mobile)**: every group header in the mobile favorites bottom sheet now has a ⋯ button that opens an action sheet with the same batch open/close actions. After the action completes the underlying switcher list auto-refreshes.
- **Defensive hardening for mobile card bottom buttons**: further tightened `.sw__pin / .sw__fav-btn / .sw__close` box-model and text styles (`box-sizing:border-box`, `line-height:0`, `font-size:0`, `appearance:none`, `svg{display:block}`, etc.) to defend against any path that could abnormally enlarge the buttons — e.g. SVG sprite not yet injected, inline-SVG intrinsic 300×150, or WebView default button appearance.

### v0.15.0 (2026-09-04)

- **Persist favorite-group collapse state**: each group's expanded/collapsed state in the favorites panel is remembered across sessions — it survives a SiYuan restart. Deleting or renaming a group automatically clears its remembered state.
- **Remember last settings tab**: opening the settings dialog lands on the tab you used last time (e.g. "Mobile"), so you no longer have to click your way back each time.
- **Build & tooling polish**: `tsconfig` compile target raised to ES2017 (fixes `Array.includes` type-check compatibility); README version badge kept in sync with the three version-number files.

### v0.14.0 (2026-09-04)

- **Batch open/close by favorite group (desktop)**: right-click a favorites group header to open every favorited tab in that group at once, or close all opened tabs belonging to it.
- **Batch open/close by favorite group (mobile)**: in the favorites bottom sheet, each group header gains a ⋯ button that opens an action sheet with the same batch open/close actions.
- After the operation a toast reports "Opened / Closed N tab(s)"; silent when nothing changed.

### v0.13.2 (2026-09-04)

- **Mobile UX improvements**: the favorites bottom sheet gains a subtle scrim and respects bottom safe-area insets (home indicator / nav bar); the top-bar favorites, journal and settings buttons are now uniform in size, and card action buttons plus the floating button got larger touch targets.
- **Cross-platform polish**: search inputs disable spellcheck; numeric settings inputs expose a numeric keyboard and screen-reader labels; settings tabs now carry proper ARIA state, and the plugin respects the system "reduce motion" setting.

### v0.13.1 (2026-09-04)

- **Journal button moves into the switcher**: the top bar no longer takes an extra slot — desktop and mobile each keep a single switcher entry; the journal button now lives in the **switcher's top bar**, opening/creating today's journal right after you open the switcher.

### v0.13.0 (2026-09-04)

- **Today's journal, one click away**: a journal button on both the desktop and mobile top bars opens or creates **today's journal** (idempotent — no duplicates per day).
- **Default journal notebook**: a new **Settings → Journal** tab lets you pick the default notebook; if unset, the first journal click pops up a notebook picker before opening.
- Opening an existing journal or creating a new one always happens in the configured notebook; the setting saves instantly and syncs across devices.

### v0.12.1 (2026-09-04)

- **Mobile floating button is off by default** — keeps the bottom free from a redundant FAB; enable it anytime under **Settings → Mobile → Floating button**. The top-bar entry always stays available, so the switcher experience is unchanged.

### v0.12.0 (2026-09-04)

- **Tabbed settings redesign**: the long single-page settings are now a left tab rail + grouped panels — Appearance / Behavior / Panels / Favorites / Mobile switch in one click; number inputs carry unit labels, switches and selects share a unified format, and every change still saves instantly.
- **Favorites dropdown right-click (desktop)**: every favorited tab supports right-click — **move to group** (submenu with the current group checked), **new group & move**, and **unfavorite**; the panel stays open and refreshes in place so you can organize several favorites in a row.
- **Card context menu enhanced**: favorited tabs gain a "Move to group" submenu (current group checked) plus a "New group" entry; unfavorited tabs offer "New group…" to favorite straight into a new group.
- **Sidebar thumbnail layout setting (Settings → Panels)**: when the sidebar is stretched wider, thumbnails enlarge to fill the width by default, or auto-add columns to show more tabs; switching applies instantly.
- **Mobile settings fit**: the settings dialog now scales with the viewport (no overflow in landscape anymore); on narrow screens the tab rail narrows and setting rows stack vertically.

### v0.11.1 (2026-09-04)

- **Fixed the mobile flash of oversized icons and scrambled layout on first open**: SiYuan mounts the dialog DOM first and adds `b3-dialog--open` only after a 50ms timeout, leaving the container mid-transform during that window, where the mobile WebView mis-renders card buttons. The animation window is now disabled — the dialog enters its final state synchronously and opens crisply.
- **Mobile card action buttons relocated**: pin / favorite / close no longer float over the thumbnail; they now sit at the right end of the bottom meta row as plain icons (primary color only when active), leaving the thumbnail fully unobstructed.
- **Floating button moved further up** (96→120px incl. safe area) to fully clear SiYuan's bottom toolbar; the swipe gesture now requires vertical-dominant movement, so horizontal panning no longer hides it by accident.
- Also removed `backdrop-filter` from mobile buttons (a trigger of the WebView animation glitch, and a perf win).

### v0.11.0 (2026-09-04)

- **Fixed mobile styles silently broken (major)**: a stylesheet nesting error made all 39 mobile-specific rules (compact toolbar, card layout, always-visible action buttons, touch feedback) compile into selectors that could never match, so the mobile dialog had been falling back to desktop styles. Mobile now renders as designed — toolbar sizing, single/double/auto card layouts, thumbnail height, always-visible pin/favorite/close buttons and press feedback all take effect.
- **README overhauled**: features now cover fullscreen mode and a Mobile section; settings table updated to five sections; quick start covers mobile and fullscreen entries; old changelog entries collapsed; the outdated README.zh-CN.md removed (Chinese readme is the main README).
- Plugin description (marketplace) mentions fullscreen mode.

### v0.10.1 (2026-09-04)

- **Mobile floating button improved**:
  - Moved up to the natural one-handed thumb zone for easier reach.
  - Smaller (48→40px) with slight transparency to obstruct less content.
  - Swipe up to hide, swipe down to show — consistent with SiYuan's built-in toolbar.

### v0.10.0 (2026-09-04)

- **Fullscreen mode improved (desktop)**: a fullscreen toggle button is added to the switcher toolbar — click to enter fullscreen in normal mode, click again to exit; the switch happens in place without rebuilding the dialog, keeping thumbnails and search state. The setting still decides the initial mode; Esc still closes.
- **Settings switches enhanced**: fixed switches looking identical on/off under some themes — off shows an outlined track with a gray knob, on shows a solid primary track with a white knob; also fixed a broken switch markup in the "Panel visibility" list.

### v0.9.0 (2026-09-04)

- **Fullscreen mode (desktop, Settings → Behavior)**: the switcher can fill the whole window; press Esc to exit. Off by default, with a hint when enabled.
- **Mobile top bar entry**: SiYuan 3.8.x mobile does not open the top bar to plugins, so an entry button is now inserted directly into the top bar — always visible, one tap to open.
- **Mobile UX improvements**:
  - The switcher no longer auto-focuses the search box, so the on-screen keyboard no longer pops up on open; tap the box to search.
  - Rebuilt the top toolbar: the search icon is back to normal size, laid out in a single row (search + sort + favorites + settings), compact and pinned to the top.
  - The floating button moved up to avoid the bottom capsule toolbar; it hides while the switcher is open and restores on close.
- **Fixed**: the "floating button" toggle in settings not taking effect; the default mobile card layout is now "Auto" (single column in portrait, two in landscape).

### v0.8.0 (2026-09-04)

- **Performance (desktop & mobile)**:
  - Thumbnail **viewport lazy rendering**: only cards scrolled into view (240px preload margin) get thumbnails, so opening the switcher renders just the first screen instead of everything.
  - Clone size is decoupled from document length: only the first 30 blocks are cloned (thumbnails show the first screen anyway).
  - Sorting and list refreshes now **reuse existing cards** (DOM moves instead of rebuilds); rendered thumbnails are kept, making re-sorting instant.
  - A **concurrency gate** for `getDoc` fetches (desktop 4 / mobile 2) prevents hammering the kernel; smaller fetch payload.
  - Session-level cache for rootID parsing (no repeated `JSON.parse`) and a 3-second cache for the "recently edited" SQL query.
  - Mobile thumbnail cache limit raised from 20 to 30.
- **Dock panel display modes (desktop, Settings → Panels)**:
  - **Hidden**: no dock list; the content area takes the full dialog width.
  - **Collapsed**: a 44px icon rail; hover shows the panel name, click activates; a top button expands/collapses anytime.
  - **Full**: the current list (icon + name).
- **Mobile long-press menu**: press and hold a tab card (~0.5s) to open the pin/favorite/group/close menu, same as desktop right-click.
- **Empty-state guidance**: when no tabs are open, a hint suggests searching the whole workspace from the search box.
- Fixed: the default focused card under "Recently used" sorting used a stale matching key (MRU is keyed by document rootID), breaking focus placement.

### v0.7.1 (2026-09-04)

- **Fixed mobile switcher not working**: the SiYuan `getAllTabs` plugin API always returns an empty array on mobile (mobile is a separate build), so tapping the floating button did nothing. Mobile now reads tabs from `window.siyuan.mobile.tabs` (MobileTabs, SiYuan 3.8+); switching and closing tabs also go through MobileTabs.
- **Fixed opening documents on mobile**: the `openTab` plugin API is a no-op on mobile; workspace search results and favorite jumps now use `MobileTabs.open`.
- **Fixed invisible prompts on mobile**: the mobile WebView blocks native `alert`; all prompts now use SiYuan `showMessage`. On SiYuan < 3.8 (no MobileTabs), a clear upgrade hint is shown instead of failing silently.
- "Recently used" sorting is now keyed by document rootID, so mobile and desktop share one MRU list and stay consistent after sync.
- Mobile card icons support per-document custom emoji icons.

### v0.7.0 (2026-09-04)

- **Mobile support**: floating action button (FAB, toggleable in settings), full-screen tab switcher with bottom-sheet favorites, responsive card layout (single column / two columns / auto).
- Mobile settings: FAB toggle, card layout selector (single/double/auto); all settings, favorite groups, and content sync via plugin-level storage — works with SiYuan's built-in sync to keep mobile and desktop in sync.
- **Bottom-sheet favorites**: on mobile, tapping the star button opens a bottom sheet that lists favorites by group, touch-friendly.
- Optimized mobile card styling: more compact thumbnails, always-visible action buttons, ≥44px touch targets.
- Compatible with SiYuan on Android/iOS/HarmonyOS; uses CSS variables for automatic theme adaptation.

<details>
<summary>History</summary>

### v0.6.1 (2026-09-04)

- Fixed the `backends` manifest field (`all` no longer mixed with concrete platforms) to pass the SiYuan bazaar listing check.

### v0.6.0 (2026-09-04)

- Favorites management in settings: **create groups** (empty groups are kept and selectable when favoriting), **inline rename**, and **delete** (members move to ungrouped); each group row shows a count badge.
- Fixed the favorites dropdown overflowing the narrow sidebar: the panel is now fixed-positioned and clamped to the host and viewport — auto-narrowed in narrow panels, flipped upward when space below is tight, and repositioned on scroll/resize.
- English name unified as **LvSpeed Switch**; README fully rewritten.
- New preview image.

### v0.5.0 (2026-09-04)

- Performance: favorites, pins and tab switches now use an in-memory cache with debounced writes — no more lag on rapid favoriting.
- Favorites dropdown rebuilt as a custom component: prominent group headers with separators, and groups can be collapsed/expanded by clicking the header.
- Settings section headers enhanced: primary-color small caps with separators; the first section sits flush with the dialog top.
- Plugin display name unified as "小驴速切" in Chinese (Settings → Plugins → 小驴速切).

### v0.4.0 (2026-09-04)

- Favorite groups polished: clicking the star opens a group menu — pick an existing group, create a new one, switch/remove groups, or unfavorite.
- Settings page reorganized into sections (Appearance / Behavior / Panels / Favorites) with a favorites manager: rename groups and reassign favorites per item (saved instantly).
- Toolbar dropdowns now labeled "Favorites" / "Sort" and widened; the search box is narrower; the toolbar wraps gracefully in narrow dialogs.
- Search performance: debounce lowered to 180ms, result caching (instant on repeated keywords), stale requests aborted.
- Fixed workspace document results occasionally disappearing while typing (root cause fixed).
- Fixed stale group counts, leftover empty groups, and missing empty state after closing tabs inside the dialog.
- Arrow-key navigation now uses the real grid column count (previously a fixed estimate that broke with custom columns).
- Sidebar highlight-only refresh on document switch (no more flicker or scroll position loss).

### v0.3.1 (2026-09-04)

- Favorite groups: right-click a favorited card to "Set group" (pick from existing groups or type a new one; leave empty to ungroup). The favorites dropdown shows a two-level structure — pick the group first, then the tab.
- Clearer pin/favorite states: hollow star when unfavorited, filled primary-color star when favorited (same approach as SiYuan's star icon); pinned tabs keep a filled pin always visible.
- Pin/favorite/close buttons get a frosted-glass backdrop, staying readable even over thumbnail content.
- Fixed the toolbar favorites dropdown not showing (class-name collision between the card favorite button and the select).
- Buttons now use SiYuan's standard tooltips, fixing empty white boxes with no text on hover.
- Sidebar thumbnails scale with the panel size (live rescale while dragging the splitter, no full list rebuild); the sidebar also gains the sort dropdown, matching the dialog.

### v0.3.0 (2026-09-03)

- Two-section search results: matched open tabs show in the upper section, workspace-wide documents in the lower one (already-open docs excluded; click to open).
- New sidebar mode: pin the tab list to a right dock panel from the switcher toolbar — single-column cards that adapt to the panel size, staying in sync for quick tab switching.
- New favorites: star a tab from its card; jump from the favorites dropdown in the toolbar. Favorited documents reopen from favorites even after their tabs close (remembered per document, survives restarts).
- Card context menu: right-click a card to pin/unpin, favorite/unfavorite, or close the tab.

### v0.2.2 (2026-09-03)

- Modernized UI: search box with magnifier icon, unified control heights and radii, card hover elevation, primary-color highlight for the current tab, separator under group headers, subtle left-rail highlight, slim scrollbars — all via SiYuan theme variables for automatic light/dark adaptation.
- Fixed broken card/pin/close button backgrounds (a non-existent `--b3-card-background` variable was used).
- Fixed document search results lacking a text color (potentially invisible in dark themes).
- Thumbnail loading state now a spinning refresh icon; dedicated empty-state style; back-to-top button fades in with a lift animation.
- Settings panel switches restyled into a light rounded container.

### v0.2.1 (2026-09-03)

- Fixed the thumbnail cache not surviving restarts/layout resets: models of inactive tabs are lazy-loaded when SiYuan restores the layout; rootIDs are now also parsed from the tab header's `data-initdata` so the cache or kernel API kicks in on first open.
- Sticky toolbar: name / search / sort / settings in one row, always visible while scrolling thumbnails.
- New back-to-top button: appears after scrolling deep, smooth-scrolls to the top.

### v0.2.0 (2026-09-03)

- Persistent thumbnail cache: content snapshots keyed by document rootID survive layout resets and restarts while tabs stay open; pruned automatically on tab close.
- Quick settings entry inside the switcher (toolbar gear button).
- Six sort orders: recently used / open order / **reversed** / **recently edited** (by document update time) / title asc/desc.
- Search upgraded: open tabs match first; with no tab matches, **workspace-wide document titles** are searched — click a result to open it.

### v0.1.0 (2026-09-03)

- Plugin settings page: switcher width/height, thumbnail columns and height, default sort, panel visibility (Settings → Plugins → 小驴速切 → Settings).
- Tab pinning: pin button on cards; pinned tabs stay at the front of their group, remembered per document.
- Sorting & search: four sort orders (recently used / open order / title asc/desc) switchable in the switcher and persisted; live filtering in the search box.
- Theme-aware styles: thumbnails and cards use theme variables for seamless light/dark switching.
- All thumbnails visible on first open: background tabs fetched via the kernel API.
- Fixed recent-use records lost after restart (persistent data preloaded on startup).

- v0.0.4 (2026-09-03): repo renamed to siyuan-speed-switch; GitHub Actions auto packaging & release; README localized.
- v0.0.3 (2026-09-03): fixed the default hotkey not responding; added the left panel list; thumbnails re-render on every open.
- v0.0.2 (2026-09-03): fixed tab titles and thumbnails not showing.
- v0.0.1 (2026-09-03): first release, basic thumbnail tab switching.

</details>

## 🏗️ Architecture

<p align="center"><img src="docs/architecture.svg" width="720" alt="LvSpeed Switch architecture"/></p>

The plugin is organized into 5 layers with clear responsibilities and strictly downward dependencies:

| Layer | Entry file / class | Responsibility |
| --- | --- | --- |
| Entry points | `index.ts → onload` | Top-bar button, sidebar dock, command-palette shortcut, mobile FAB |
| Switcher main | `showSwitcher` / `showMobileSwitcher` / `renderSidebarPanel` | Three switch entry modes (dialog / sidebar / fullscreen) unified |
| Subsystems | `renderList` / `applySearch` / `openFavMenu` / `promptJournalNotebook` / `openSetting` | Card rendering, search, favorites, journal, settings |
| Persistence | `loadData` / `saveDataDebounced` (this.data) | 7 storage keys read/write (500ms debounced) |
| Infrastructure | `util.js` / `types.ts` / `constants.ts` / `logger.ts` | Pure functions, TS types, constants, structured logging |

**Pure functions first**: any logic that can escape `this` (clamping, sorting, grouping, icon parsing, tab tree) is extracted to `src/util.js` and covered by `node:test` (23 cases). `src/constants.ts` centralises every threshold (debounce duration, cache caps, UI bounds).

**Test matrix** (`npm test` runs all in one shot):

| File | Scope | Cases |
| --- | --- | --- |
| `tests/util.test.cjs` | 6 `util.js` pure functions | 23 |
| `tests/constants.test.cjs` | Constant MIN/MAX/range sanity | 3 |
| `tests/mobile-card-smoke.cjs` | Mobile card UI rendering + 7 CSS invariants (jsdom) | 7 |

## Development

### Quick commands

```bash
pnpm install      # install deps
pnpm dev          # dev watch (outputs dev dist/)
pnpm build        # production build → dist/* + package.zip
pnpm test         # unit + constant tests
npm run test:smoke # mobile UI smoke test (requires `pnpm build` first)
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

5. **i18n** — add the key to both `src/i18n/zh-CN.json` and `src/i18n/en.json` (keep 109/109 parity).

### How to add a new dock panel

1. Append `{key, icon, label}` to the `DOCK_ITEMS` array inside `renderDockList`.
2. If the panel needs special activation (not a plain `openTab`), add a branch in `openDockByKey`.

### How to add a new sort order

1. Add the sort key to the `SORT_BY_LIST` constant array.
2. Add a member to the `SortBy` union type.
3. Add the sort branch inside `sortGroupItems` (extract to `util.js` for unit testing).

## 📜 Architecture Decision Records

- [ADR-0001 Method splitting](docs/adr/0001-method-splitting.md) — why we split `onload` / `applySearch` etc. into orchestrator + helpers
- [ADR-0002 Constants in `src/constants.ts`](docs/adr/0002-constants-module.md) — why we centralised magic numbers into a single module in v0.16.0
- [ADR-0003 Pure functions + jsdom test matrix](docs/adr/0003-testing-strategy.md) — why `util.js` must stay zero-dep + Node built-in `node:test`

## License

[MIT](./LICENSE)
