# Changelog

All notable changes to **RTL for Claude** are documented here.
This project follows [Semantic Versioning](https://semver.org).

## [1.2.0] — 2026-07-25

A translated settings panel and a batch of right-to-left correctness fixes for
messages that mix Persian with English.

### Added
- **The settings panel now speaks four languages** — English, فارسی, العربية and
  اردو. It follows your VS Code display language and can be pinned from a
  Language picker in the panel. For Persian/Arabic/Urdu the panel itself flips
  to RTL, switches included.
- **Choose where the direction button lives** — Top toolbar (new default,
  docked next to New session / Session history), Floating, or Hidden.
- **Custom font** — pick “Custom” and type your own family name (e.g.
  `Estedad`, `IRANSans`); Vazirmatn stays as a fallback.
- Native **Windows PowerShell** installer (`apply-rtl.ps1`) and Antigravity IDE
  support in both installers (thanks @HuAliAsu).

### Fixed
- A Persian message that **opens with an English word or a URL** no longer reads
  left-to-right. Two separate causes: Claude marks prose with
  `unicode-bidi: plaintext`, and renders user text inside `<span dir="auto">` —
  both derive the direction from the first strong character and outranked the
  direction we set. The same bug made the global **LTR** toggle a no-op on
  Persian-leading paragraphs.
- The **per-message toggle** showed two stacked buttons on user messages, and
  did nothing at all on plain-text messages. One button now, and it actually
  flips the text.
- Changing the direction-button placement takes effect immediately.
- The settings panel is responsive again on a narrow sidebar: dropdowns and
  sliders no longer overflow, and the on/off knobs stay inside their track.

## [1.1.0] — 2026-06-23

Major reliability pass for **streaming** answers.

### Fixed
- **No more left↔right “jumping” while an answer streams.** Direction is driven by
  a marker on the message’s stable container plus CSS, never by attributes on the
  paragraphs the webview re-creates per token — so the text stays put from the
  first word.
- **Tables** keep proper RTL column order; **your own message bubbles** render RTL
  again; **code / inline code / numbers** stay LTR inside RTL messages.
- App chrome and message-bubble layout are never broken (only content is flipped).

### Added
- **AskUserQuestion / option boxes go full RTL** — the radio moves to the right,
  labels read right-to-left, code terms stay LTR.

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
