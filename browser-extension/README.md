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

Click the toolbar icon to adjust detection mode & sensitivity, font, text size,
line spacing, the per-message direction toggle, and which sites it runs on.

## Develop

```bash
node tests/detect.test.js   # unit tests for the detection engine
```

| Path | What |
| --- | --- |
| `src/rtl-engine.js` | Direction detection + DOM application (universal RTL) |
| `src/content.js` | MutationObserver, settings, per-message toggle, lifecycle |
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
