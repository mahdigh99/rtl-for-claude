# Changelog

All notable changes to **RTL for Claude** (browser extension + VS Code extension).
This project follows [Semantic Versioning](https://semver.org).

## [1.0.1] — 2026-06-14

Browser extension reliability pass (Claude/ChatGPT/Gemini). VS Code extension unchanged.

### Fixed
- **App chrome no longer breaks.** Direction is flipped only on real content; layout `<div>`s (sidebar, header, toolbars) are never touched, so the logo, nav and buttons stay intact.
- **Vazirmatn font now applies reliably**, including inner text runs — while code blocks stay monospace.
- **The direction toggle now affects the whole conversation** (Claude's answer too), even after Claude renamed its message container class.
- Removed a steady-state background re-flush loop, a stale-state race when disabling the extension, and incomplete handling of `*.claude.ai` subdomains.

### Changed
- Replaced the per-message ⇌ button with **one floating direction toggle** that pins the whole chat: auto → RTL → LTR. It's independent of each site's message markup, so it works consistently everywhere.

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
