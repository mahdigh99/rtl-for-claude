# Changelog

All notable changes to **RTL for Claude** (browser extension + VS Code extension).
This project follows [Semantic Versioning](https://semver.org).

## [Unreleased]

### Added

- Standalone RTL support for the Codex VS Code extension, including automatic
  paragraph direction, live composer direction, Vazirmatn typography, and a
  global Auto / RTL / LTR toggle.
- Reversible, idempotent installation for Codex with a pristine webview backup
  and a temporary-home lifecycle test.
- Native Windows PowerShell installer (`vscode-extension/apply-rtl.ps1`) for
  the Claude Code patcher, plus Antigravity IDE support in both installers
  (thanks @HuAliAsu).

### Fixed

- Browser extension: on known sites, auto-detection no longer leaks RTL
  styling outside the chat messages (file previews, code and Markdown tabs)
  — the global toggle still pins the whole page when you want everything RTL
  (#1, thanks @HuAliAsu).

### Compatibility

- Codex code blocks and preformatted content remain left-to-right.
- The current Codex Marketplace product still installs under the technical
  extension identifier `openai.chatgpt`.

## [1.1.0] — 2026-06-23

Major reliability pass for **streaming** answers and the Claude Code chat.

### Fixed
- **No more left↔right “jumping” while an answer streams.** Direction is now driven by a marker on the message’s stable container plus CSS — never by attributes on the volatile paragraphs the app re-creates per token — so the app can’t fight it and the text stays put from the first word.
- **Tables** keep proper RTL column order (not just right-aligned cells).
- **Your own message bubbles** render RTL again (the text lives directly in the bubble, which the previous rules missed).
- **Code blocks & inline code / links / numbers** stay LTR and monospace inside RTL messages.
- **App chrome no longer breaks** — only content is flipped, never the layout/flex wrappers (sidebar, header, message bubbles).
- Removed a steady-state background re-flush loop, a stale-state race on disable, and incomplete `*.claude.ai` subdomain handling.

### Added
- **AskUserQuestion / option boxes go full RTL** — the radio/checkbox moves to the right and the labels read right-to-left, while code terms stay LTR.
- **One floating direction toggle** (auto → RTL → LTR) that pins the whole chat, independent of each site’s markup.

### Changed
- VS Code: the chat patch is updated to the new engine (auto-reapplies after Claude Code updates; fully reversible).

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
