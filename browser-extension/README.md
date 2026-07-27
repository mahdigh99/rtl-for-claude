# RTL for Claude — Browser Extension

Makes right-to-left text read correctly in **Claude** (and ChatGPT & Gemini),
with the beautiful **Vazirmatn** font. Direction is detected automatically, per
paragraph — your code and English stay untouched.

One codebase, both browsers (Manifest V3).

## Install

**Chrome / Edge / Brave**
1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and select this `browser-extension` folder.

**Firefox**
1. Open `about:debugging` → **Load Temporary Add-on**.
2. Select `manifest.json` in this folder.

## Settings

Click the toolbar icon to adjust detection mode & sensitivity, font (the bundled
Vazirmatn or one installed on your computer), text size, line spacing, the
floating direction button, the popup's language, and which sites it runs on —
including any chat site you add yourself.

## Keyboard shortcuts

| Shortcut | What it does |
| --- | --- |
| `Ctrl/Cmd + Shift + 9` | Cycle the whole chat: Auto → RTL → LTR |
| `Ctrl/Cmd + Shift + 8` | Turn the extension on / off |

Rebind them at `chrome://extensions/shortcuts` (Chrome) or in the Add-ons
manager → *Manage Extension Shortcuts* (Firefox).

## Develop

```bash
node tests/detect.test.js   # unit tests for the detection engine
```

| Path | What |
| --- | --- |
| `src/rtl-engine.js` | Direction detection + DOM application (universal RTL) |
| `src/content.js` | MutationObserver, settings, global toggle, lifecycle |
| `src/background.js` | Keyboard-shortcut commands (the only background code) |
| `src/styles.css` | `@font-face` + direction / font / isolation / toggle styles |
| `src/popup.*` | Settings panel |
| `fonts/` | Vazirmatn (woff2) + OFL license |
| `icons/` | Toolbar icons |

## Publish

- **Chrome Web Store** — zip this folder and upload via the Developer Dashboard.
- **Firefox AMO** — sign with Mozilla; keep `browser_specific_settings.gecko.id`
  stable (`web-ext sign` or AMO).

## License

MIT ([LICENSE](LICENSE)). The bundled Vazirmatn font is under SIL OFL 1.1
([fonts/OFL.txt](fonts/OFL.txt)).
