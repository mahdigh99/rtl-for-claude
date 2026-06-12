<p align="center">
  <img src="https://raw.githubusercontent.com/mahdigh99/rtl-for-claude/main/docs/demo.gif" width="640" alt="RTL for Claude — demo" />
</p>

# RTL for Claude

**Finally — Persian, Arabic, Urdu and every right-to-left language read correctly
in the Claude Code chat.** Automatic, per-paragraph right-to-left + the gorgeous
**Vazirmatn** font. Your code and English stay exactly as they are.

![Version](https://img.shields.io/visual-studio-marketplace/v/mahdigh99.rtl-for-claude)
![Installs](https://img.shields.io/visual-studio-marketplace/i/mahdigh99.rtl-for-claude)
![License](https://img.shields.io/badge/License-MIT-3b82f6)

## ✨ Features

- 🪄 **Automatic** — detects each paragraph's direction (smart ratio detection, so a mostly-Persian line stays RTL even when it opens with an English word).
- 🔤 **Vazirmatn font** — adjustable family, size and line spacing.
- ⌨️ **Live compose box** — flips to RTL as you type; caret and text stay together.
- 🎛️ **Per-message ⇌ override** and a **global Auto / RTL / LTR** toggle.
- 🧩 **Never breaks code** — code blocks, diffs and terminals stay left-to-right.
- 🔁 **Survives updates** — re-applies itself automatically after every Claude Code update.
- 🔒 **100% local** — no servers, no tracking.

## Install

1. Click **Install** above.
2. Run **Developer: Reload Window** (`Cmd/Ctrl + Shift + P`).

That's it — the Claude chat now reads right-to-left. Fine-tune everything from the
**RTL for Claude** panel in the left sidebar, or the quick menu on the status bar.

## Settings

| Setting | Default | What it does |
| --- | --- | --- |
| `rtlForClaude.enabled` | `true` | Master on/off (off restores the original chat). |
| `rtlForClaude.autoApplyOnStartup` | `true` | Re-apply on startup (survives Claude updates). |
| `rtlForClaude.font.family` | `Vazirmatn` | `Vazirmatn`, `Sahel`, or `System default`. |
| `rtlForClaude.font.scale` | `1` | RTL text size (0.8–1.6). |
| `rtlForClaude.font.lineHeight` | `1.85` | Line spacing (1.3–2.5). |
| `rtlForClaude.detection.mode` | `ratio` | `ratio` (smart) or `first-strong`. |
| `rtlForClaude.detection.threshold` | `0.3` | Smart-mode RTL threshold (0.1–0.7). |
| `rtlForClaude.applyToInput` | `true` | Flip the message box as you type. |
| `rtlForClaude.showMessageToggles` | `true` | Per-message ⇌ override button. |
| `rtlForClaude.keepCodeLeftToRight` | `true` | Keep code / diffs / terminals LTR. |

## Commands (`Cmd/Ctrl + Shift + P`)

- **RTL for Claude: Turn On / Off**
- **RTL for Claude: Re-apply to the chat now**
- **RTL for Claude: Restore original chat** — run this before uninstalling.
- **RTL for Claude: Open Settings**

## Turning it off / uninstalling

The clean way: toggle **Enabled** off (or run **Restore original chat**) — the
chat reverts instantly. It's best to do this **before** you uninstall.

> A live chat only updates after a **window reload**, so uninstalling won't
> change an already-open chat until you reload. Uninstall *attempts* an automatic
> restore on that next reload, but toggling off first is the sure way.

## How it works (full transparency)

The Claude chat is a sandboxed webview no extension can reach into at runtime, so
RTL for Claude patches Claude Code's own `webview/index.css` + `index.js`,
compiling your settings into the styles and the RTL engine it injects. Everything
runs **locally** inside the webview — no remote code, no telemetry. Each original
file is backed up (`*.rtl-backup`) and fully restorable. Works with VS Code,
Cursor and Windsurf.

## Privacy

100% local. No servers, no analytics — nothing ever leaves your machine.

## License

MIT. Bundled **Vazirmatn** font under SIL OFL 1.1. Source & a no-install script:
[github.com/mahdigh99/rtl-for-claude](https://github.com/mahdigh99/rtl-for-claude).
