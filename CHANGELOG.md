# Changelog

All notable changes to **RTL for Claude** (browser extension + VS Code extension).
This project follows [Semantic Versioning](https://semver.org).

## [1.0.0] — 2026-06-12

First public release. 🎉

### Browser extension (Chrome + Firefox)
- Automatic per-paragraph RTL for Claude, ChatGPT and Gemini — every RTL script.
- Vazirmatn font on RTL text; English and code left untouched.
- Live RTL compose box; per-message ⇌ override; bidi-isolation for inline code/links.
- Popup settings (mode, sensitivity, font, size, line-height, per-site on/off).
- 100% local, no tracking. Permissions: `storage` only.

### VS Code extension (Claude Code)
- Same RTL engine injected into the Claude Code chat webview.
- Settings panel in the Activity Bar + status-bar quick menu.
- Auto re-applies after every Claude Code update; fully reversible (backups kept).
