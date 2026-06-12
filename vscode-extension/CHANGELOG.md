# Changelog

All notable changes to **RTL for Claude** are documented here.
This project follows [Semantic Versioning](https://semver.org).

## [1.0.0] — 2026-06-12

First public release. 🎉

### Added
- **Automatic right-to-left** for the Claude Code chat — Persian, Arabic, Urdu
  and every other RTL script, detected per paragraph (smart ratio detection, so
  a mostly-Persian line stays RTL even when it opens with an English word).
- **Vazirmatn font**, with adjustable family, text size and line spacing.
- **Live compose box** — flips to RTL as you type, caret and glyphs together.
- **Per-message ⇌ override** and a **global Auto / RTL / LTR** toggle.
- **Settings panel** in the Activity Bar **+ a one-click status-bar menu**.
- **Auto re-applies** after every Claude Code update (no manual steps).
- Code blocks, diffs and terminals always stay left-to-right.
- 100% local — no servers, no tracking. Fully reversible: toggle off (or run
  **Restore original chat**) to revert the chat instantly.
