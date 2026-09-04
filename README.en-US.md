# LvSpeed Switch

[![Version](https://img.shields.io/badge/version-0.6.0-blue)](./plugin.json) [![License: MIT](https://img.shields.io/badge/license-MIT-green)](./LICENSE) [![SiYuan](https://img.shields.io/badge/SiYuan-SiYuan_Note-ff5c67)](https://b3log.org/siyuan)

A tab switcher for [SiYuan Note](https://b3log.org/siyuan): flip through open tabs with **live thumbnails** just like Windows **Win+Tab / Alt+Tab** — plus **grouped favorites**, **workspace-wide search**, **one-click dock panels**, and a **dockable sidebar mode**. Split windows (panes) are fully supported.

<p align="center"><img src="preview.png" width="720" alt="LvSpeed Switch preview"/></p>

[中文说明](./README.zh-CN.md)

## ✨ Features

### Switching
- 🌟 **Live thumbnails** — One card per tab showing real document content; background tabs are fetched via the kernel API, so every thumbnail is visible on first open.
- 🔀 **Split-window native** — Tabs are grouped by window (pane); switching activates the right pane automatically.
- ⌨️ **Full keyboard control** — Arrows / `Tab` move the selection across the real grid, `Enter` switches, `Esc` closes — same muscle memory as Alt+Tab.
- 📌 **Pin tabs** — Pin frequently used tabs to the front of their group; remembered per document across restarts.

### Favorites & Groups
- ⭐ **One-click favorite** — Star any tab; document tabs are remembered by rootID, so you can **reopen them from favorites even after the tab closes**, surviving restarts.
- 🗂️ **Group management** — File favorites into groups on star click, or create groups on the fly; settings let you **create / inline-rename / delete groups** and reassign favorites per item — all saved instantly.
- 📂 **Grouped dropdown** — The favorites dropdown is a custom component: group headers with count badges, **click to collapse / expand**; auto-narrows and clamps inside narrow sidebars, never overflows.

### Search & Sort
- 🔍 **Two-section search** — Matching open tabs on top, **workspace-wide document results** below (already-open docs excluded, click to open); 180ms debounce + result cache + stale-request aborting.
- 🔃 **Six sort orders** — Recently used / open order / reversed / recently edited / title asc/desc, switchable in-place and persisted.

### Panels & Sidebar
- 🖇️ **Panel quick access** — All dock panels (file tree, outline, bookmarks, graph, backlinks, tags, inbox, AI chat…) listed on the left rail; click to open and focus. Hide unwanted ones in settings.
- 📎 **Sidebar mode** — Pin the tab list to a right dock panel: single-column cards that resize with the panel, always at hand.

### Performance & Look
- 💾 **Thumbnail cache** — Content snapshots cached per document; layout resets and app restarts load instantly. Cache is pruned on tab close, capped at 200KB per entry.
- ⚡ **Debounced writes** — High-frequency data (favorites / pins / MRU) is kept in memory and flushed to disk in merged batches — rapid actions never stall. Pending writes are flushed on unload.
- 🎨 **Theme aware** — Every style rides on SiYuan theme variables, following light/dark themes seamlessly; pin/star/close buttons get a frosted backdrop for readability over thumbnails.

## 🚀 Quick Start

1. **Open**: the layout icon on the top toolbar, or the hotkey `Alt+Shift+S` (changeable in **Settings → Keymap**).
2. **Switch**: click a card, or move with arrows / `Tab` and hit `Enter`; click a panel on the left rail to jump to it.
3. **Manage**: pin with the pin button, favorite with the star (group menu pops up); close tabs with × on the card, or right-click for the full menu.
4. **Search**: type in the toolbar — tab and document results appear together.
5. **Dock it**: hit the "Sidebar mode" toolbar button to pin the switcher to the right dock.

## ⌨️ Shortcuts

| Key | Action |
| --- | --- |
| `Alt+Shift+S` | Toggle the switcher (global, configurable) |
| `↑` `↓` `←` `→` | Move selection across the grid |
| `Tab` / `Shift+Tab` | Next / previous |
| `Enter` | Switch to the selected tab |
| `Esc` | Close the switcher |

## ⚙️ Settings

**Settings → Plugins → LvSpeed Switch → Settings** (or the gear button inside the switcher), in four sections:

| Section | Options |
| --- | --- |
| Appearance | Switcher width/height (480–1920 × 360–1280), thumbnail columns (auto / 2–8), thumbnail height (72–360) |
| Behavior | Default sort order |
| Panels | Show / hide left-rail panels |
| Favorites | Create / rename / delete groups, reassign favorites |

## 📦 Install

- **Marketplace**: search "小驴速切 / LvSpeed Switch" in **Settings → Marketplace → Plugins** (community bazaar listing pending).
- **Manual**: download `package.zip` from [Releases](https://github.com/ai68298100/siyuan-speed-switch/releases), extract into `<workspace>/data/plugins/siyuan-speed-switch/` and restart SiYuan (the folder must be named `siyuan-speed-switch`).

## Requirements

- SiYuan v3.1.20+ (uses the `getAllTabs` API).
- Desktop client / browser-desktop frontend (tabs and split panes).
- Mobile features (FAB, tab switching, favorites) require SiYuan **v3.8.0+** (relies on the mobile MobileTabs system).

## Changelog

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

<details>
<summary>History</summary>

- v0.0.4 (2026-09-03): repo renamed to siyuan-speed-switch; GitHub Actions auto packaging & release; README localized.
- v0.0.3 (2026-09-03): fixed the default hotkey not responding; added the left panel list; thumbnails re-render on every open.
- v0.0.2 (2026-09-03): fixed tab titles and thumbnails not showing.
- v0.0.1 (2026-09-03): first release, basic thumbnail tab switching.

</details>

## Development

```bash
# Install dependencies
pnpm install
# Dev watch
pnpm dev
# Production build → dist/* + package.zip
pnpm build
```

Pushing a `v*` tag triggers GitHub Actions to build and publish a Release.

## License

[MIT](./LICENSE)
