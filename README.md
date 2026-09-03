# Speed Switch (速切)

A SiYuan plugin that lets you switch between opened tabs just like the Windows **Alt+Tab** task switcher: with one click of the top-bar button or a hotkey, it pops up a dialog showing **thumbnail previews** of every opened tab. You pick the one you want and switch instantly. **Split-window (multi-pane) layouts are fully supported.**

<img src="preview.png" width="640" alt="speed switch preview"/>

## Features

- 🌟 **Thumbnail previews** — each opened tab is rendered as a card with a live document/Panel preview, not just a name.
- 🔀 **Split-window aware** — tabs are grouped by window pane; switching activates the correct pane automatically.
- ⌨️ **Keyboard navigation** — use arrow keys / `Tab` to move, `Enter` to switch, `Esc` to close (just like Alt+Tab).
- 🧠 **MRU ordering** — remembers the most recently used tab and focuses it first.
- 🧩 **Two entry points** — top-bar button and a global hotkey.

## Entry points

- **Top bar button** (layout icon) on the top bar.
- **Hotkey**: `Shift+Alt+S` by default (changeable in Settings → Shortcuts).

## Usage

1. Open many tabs (in one or several split panes).
2. Press the hotkey or click the top-bar button.
3. The switcher dialog opens with thumbnail cards grouped by window pane.
4. Click a card, or navigate with arrow keys / `Tab` and press `Enter`, to switch instantly.
5. Press `Esc` to close without switching.

## Requirements

- SiYuan v3.1.20+ (uses `getAllTabs`).
- Desktop / browser-desktop frontend (tab panes / layout).

## Development

```bash
# install deps
pnpm install
# download SiYuan plugin dev types
# start watch mode (dev)
pnpm dev
# production build -> dist/package.zip
pnpm build
```

## License

[MIT](./LICENSE)