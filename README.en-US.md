# Speed Switch (速切)

A SiYuan plugin that lets you switch between opened tabs just like the Windows **Win+Tab / Alt+Tab** task switcher. Hit the top-bar button or a global hotkey, and a dialog pops up showing **thumbnail previews** of every opened tab — pick one and switch instantly. The left rail also lists every dock panel (file tree, outline, bookmark, graph, backlinks, AI chat…) so you can jump directly into any sidebar with a single click. **Split-window (multi-pane) layouts are fully supported.**

<p align="center"><img src="preview.png" width="720" alt="Speed Switch preview"/></p>

[中文说明](./README.zh-CN.md)

## Features

- 🌟 **Thumbnail previews** — each tab is rendered as a card with a live document preview; tabs not yet rendered in the background are fetched via the kernel API, so you see thumbnails for everything on first open.
- 🖇️ **Dock panel switcher** — the left rail lists every dock (file tree, outline, bookmark, graph, backlinks, AI chat…); click one to toggle & focus it. Panels can be hidden in the plugin settings.
- 📌 **Pin tabs** — pin frequently used tabs with the pin button; pinned tabs always stay on top (remembered per document across restarts).
- 🔀 **Split-window aware** — tabs are grouped by window pane; switching activates the correct pane automatically.
- 🔍 **Search & sort** — a live search box filters tabs; four sort orders (recently used / open order / title A→Z / Z→A), switchable right inside the switcher and persisted.
- ⚙️ **Settings page** — customize dialog width/height, thumbnail columns and height, default sort order, and panel visibility (Settings → Plugins → Speed Switch → Settings).
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

- **Marketplace**: search "Speed Switch / 速切" in **Settings → Marketplace → Plugins** (pending listing on the community bazaar).
- **Manual**: download `package.zip` from [Releases](https://github.com/ai68298100/siyuan-speed-switch/releases), extract it into `<workspace>/data/plugins/siyuan-speed-switch/` and restart SiYuan. The folder must be named `siyuan-speed-switch`.

## Requirements

- SiYuan v3.1.20+ (uses the public `getAllTabs` API).
- Desktop / browser-desktop frontend (tab panes and multi-pane layout).

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
