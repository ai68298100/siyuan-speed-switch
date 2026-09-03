# Speed Switch (小驴速切)

A SiYuan plugin that lets you switch between opened tabs just like the Windows **Win+Tab / Alt+Tab** task switcher. Hit the top-bar button or a global hotkey, and a dialog pops up showing **thumbnail previews** of every opened tab — pick one and switch instantly. The left rail also lists every dock panel (file tree, outline, bookmark, graph, backlinks, AI chat…) so you can jump directly into any sidebar with a single click. **Split-window (multi-pane) layouts are fully supported.**

<p align="center"><img src="preview.png" width="720" alt="Speed Switch preview"/></p>

[中文说明](./README.zh-CN.md)

## Features

- 🌟 **Thumbnail previews** — each tab is rendered as a card with a live document preview; tabs not yet rendered in the background are fetched via the kernel API, so you see thumbnails for everything on first open.
- 🖇️ **Dock panel switcher** — the left rail lists every dock (file tree, outline, bookmark, graph, backlinks, AI chat…); click one to toggle & focus it. Panels can be hidden in the plugin settings.
- 📌 **Pin tabs** — pin frequently used tabs with the pin button; pinned tabs always stay on top (remembered per document across restarts).
- 🔀 **Split-window aware** — tabs are grouped by window pane; switching activates the correct pane automatically.
- 🔍 **Search & sort** — the search box first filters opened tabs; if nothing matches, it searches document titles across the whole workspace (click a result to open it). Six sort orders (recently used / open order / open order reversed / recently edited / title A→Z / Z→A), switchable right inside the switcher and persisted.
- 💾 **Thumbnail cache** — thumbnails are cached per document; as long as the tab stays open, the cache survives layout resets and app restarts, and is pruned when the tab closes.
- ⚙️ **Settings page** — customize dialog width/height, thumbnail columns and height, default sort order, and panel visibility (Settings → Plugins → Speed Switch → Settings); a gear button inside the switcher opens it instantly.
- 🎨 **Theme aware** — all styles use SiYuan theme variables, following light/dark themes seamlessly.
- ⌨️ **Keyboard navigation** — arrow keys / `Tab` to move, `Enter` to switch, `Esc` to close (just like Alt+Tab).
- 🧩 **Two entry points** — top-bar button + global hotkey.

## Entry points

- **Top bar button** — layout icon on the right side of the top bar.
- **Hotkey** — `Alt+Shift+S` by default, changeable in **Settings → Shortcuts**.

> Note: if the hotkey did nothing before v0.0.3, an older release shipped with the wrong modifier order (`"⇧⌥S"`) which SiYuan's `matchHotKey` never matches. v0.0.3+ fixes this; if the issue persists, reassign it once in Settings → Shortcuts.

## Usage

1. Open many tabs (in one or several split panes).
2. Press the hotkey or click the top-bar button.
3. The switcher dialog opens: **left rail = dock panels**, **right area = thumbnail cards grouped by window pane**.
4. Click any dock item to open that sidebar; or click a thumbnail card / navigate with arrows/Tab and press `Enter` to switch instantly.
5. Type in the search box to filter tabs live; use the dropdown to change the sort order.
6. Use the pin (top-left of a card) to pin/unpin tabs, and the × (top-right) to close a tab.
7. Press `Esc` to close without switching.

## Installation

- **Marketplace**: search "Speed Switch / 小驴速切" in **Settings → Marketplace → Plugins** (pending listing on the community bazaar).
- **Manual**: download `package.zip` from [Releases](https://github.com/ai68298100/siyuan-speed-switch/releases), extract it into `<workspace>/data/plugins/siyuan-speed-switch/` and restart SiYuan. The folder must be named `siyuan-speed-switch`.

## Requirements

- SiYuan v3.1.20+ (uses the public `getAllTabs` API).
- Desktop / browser-desktop frontend (tab panes and multi-pane layout).

## Changelog

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

- Modernized UI: search field with magnifier icon, unified control height and border radius, cards lift with shadow on hover, active tab highlighted in the theme primary color, group labels with divider lines, tinted active dock item, slimmer scrollbars. All colors use SiYuan theme variables and adapt to light/dark themes automatically.
- Fixed cards/pin/close buttons having no background (the plugin referenced a non-existent `--b3-card-background` variable).
- Fixed workspace-wide doc search result items missing a text color (could be invisible on dark themes).
- Thumbnail loading now shows a spinning refresh icon; empty states use a dedicated style; the back-to-top button fades/slides in.
- Settings panel visibility list now sits in a tinted rounded container for clearer interaction.

### v0.2.1 (2026-09-03)

- Fixed thumbnails not loading after restart/layout reset: SiYuan lazily creates models for inactive tabs on restore, so the root ID is now also parsed from the tab header's `data-initdata` attribute — the cache (or kernel API fallback) now works on first open.
- Sticky toolbar: name / search / sort / settings merged into one row that stays visible while scrolling thumbnails.
- New back-to-top button: appears at the bottom-right corner after scrolling down; click for a smooth scroll to the top.

### v0.2.0 (2026-09-03)

- Persistent thumbnail cache: snapshots are stored per document root ID — as long as the tab stays open, the cache survives layout resets and restarts; entries are pruned when tabs close.
- Quick settings entry (gear button in the switcher toolbar) to jump straight into the plugin settings page.
- Sort orders extended to six: recently used / open order / **open order reversed** / **recently edited** (by document update time) / title A→Z / Z→A.
- Search upgrade: opened tabs are matched first; when nothing matches, document titles across the workspace are searched and results can be opened with one click.

### v0.1.0 (2026-09-03)

- New plugin settings page: dialog width/height, thumbnail columns & height, default sort order, panel visibility.
- Pin tabs: pin button on cards; pinned tabs stay on top, remembered per document across restarts.
- Sort & search: four sort orders (persisted) plus a live search box.
- Fully theme-aware styles (light/dark themes follow seamlessly).
- All thumbnails render on first open, including background tabs (via kernel API fallback).
- Fix MRU history lost after restart (persisted data now preloaded on startup).

## Development

```bash
# install deps
pnpm install
# start watch mode (dev)
pnpm dev
# production build → dist/* + package.zip
pnpm build
```

Pushing a `v*` tag triggers GitHub Actions to build and publish the Release automatically.

## License

[MIT](./LICENSE)
