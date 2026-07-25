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
- **The settings panel now speaks four languages** — English, فارسی, العربية and
  اردو, the same set the project ships READMEs for. It follows the VS Code
  display language by default and can be pinned from a Language picker in the
  panel (`rtlForClaude.language`). For Persian/Arabic/Urdu the panel itself
  flips to RTL, including the on/off switches.
- **Direction-button placement setting** (`rtlForClaude.togglePlacement`): choose
  Top toolbar (default), Floating, or Hidden for the whole-chat Auto/RTL/LTR
  button — from the sidebar panel or VS Code settings.
- **Custom font**: pick "Custom" as the font and enter your own family name
  (`rtlForClaude.font.custom`, e.g. `Estedad`, `IRANSans`). Vazirmatn stays as a
  fallback; the name is sanitised before it reaches the stylesheet.

### Changed

- Claude Code (VS Code): the global direction toggle now **docks into the panel's
  top toolbar**, next to the New session / Session history icons, instead of
  floating over the composer and the send button. It anchors on those buttons'
  stable `aria-label`s and automatically falls back to the (now bottom-left)
  floating pill if that toolbar isn't present, so the control never disappears.

### Fixed

- Changing the direction-button placement now takes effect immediately instead
  of waiting for some other setting to trigger a re-patch.
- Settings panel is now responsive: on a narrow sidebar the font/detection
  dropdowns and sliders no longer overflow off-screen (rows wrap), and the
  on/off toggle knobs no longer spill outside their track (the switches keep
  their size instead of being squeezed).
- The per-message direction toggle showed **two stacked buttons** on user
  messages (the container and the bubble both matched), and clicking it did
  nothing on a plain-text message: the force rules only targeted prose tags,
  which those messages don't have. Now one button per message, and forcing
  RTL/LTR flips the bubble itself.
- Previous user messages stayed left-to-right when they opened with a URL or an
  English word. Claude renders that text as `<span dir="auto">`, and the `dir`
  attribute derives the direction from the first strong character, outranking
  the direction set on the message bubble — so the whole message read LTR. Those
  spans now inherit the bubble's direction (code excluded, so it stays LTR).
- A Persian paragraph that **starts with an English word** ("authorization
  اصلاً …") no longer renders left-to-right with that word pushed to the visual
  end of the sentence. Claude marks prose with `unicode-bidi: plaintext`, which
  derives the base direction from the first strong character and ignores
  `direction`; the direction rules now pin `unicode-bidi: isolate` so the chosen
  direction wins. The same bug made the global **LTR** toggle a no-op on
  Persian-leading paragraphs. Covered by a new rendered-geometry regression
  test (`browser-extension/tests/bidi-layout.test.js`).
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
