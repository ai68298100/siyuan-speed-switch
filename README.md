# Speed Switch (速切)

A SiYuan plugin that lets you switch between opened tabs just like the Windows **Win+Tab / Alt+Tab** task switcher. Hit the top-bar button or a global hotkey, and a dialog pops up showing **thumbnail previews** of every opened tab — pick one and switch instantly. The left rail also lists every dock panel (file tree, outline, bookmark, graph, backlinks, AI chat…) so you can jump directly into any sidebar with a single click. **Split-window (multi-pane) layouts are fully supported.**

<p align="center"><img src="preview.png" width="720" alt="Speed Switch preview"/></p>

## Features

- 🌟 **Thumbnail previews** — each tab is rendered as a card with a live document/panel preview, not just a title text.
- 🖇️ **Dock panel switcher** — the left rail lists every dock (file tree, outline, bookmark, inbox, tag, graph, global graph, backlink, AI chat, custom panels and even docks registered by other plugins). Click one to toggle & focus it.
- 🔀 **Split-window aware** — tabs are grouped by window pane; switching activates the correct pane automatically.
- ⌨️ **Keyboard navigation** — arrow keys / `Tab` to move, `Enter` to switch, `Esc` to close (just like Alt+Tab).
- 🧠 **MRU focus** — remembers the most recently used tab and focuses it first, so you don't have to scroll every time.
- 🧩 **Two entry points** — top-bar button + global hotkey.
- ✨ **Fresh on every open** — thumbnails are freshly cloned from the live editor DOM each time you open the switcher.

## Entry points

- **Top bar button** — layout icon on the right side of the top bar.
- **Hotkey** — `Alt+Shift+S` by default, changeable in **Settings → Shortcuts**.

> Note: if the hotkey did nothing before v0.0.3, an older release shipped with the wrong modifier order (`"⇧⌥S"`) which SiYuan's `matchHotKey` never matches. v0.0.3+ fixes this; if the issue persists, reassign it once in Settings → Shortcuts.

## Usage

1. Open many tabs (in one or several split panes).
2. Press the hotkey or click the top-bar button.
3. The switcher dialog opens: **left rail = dock panels**, **right area = thumbnail cards grouped by window pane**.
4. Click any dock item to open that sidebar; or click a thumbnail card / navigate with arrows/Tab and press `Enter` to switch instantly.
5. Press `Esc` to close without switching.

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

## License

[MIT](./LICENSE)
