# Notes for AI assistants

If a user points you at this repository, they want right-to-left text
(Persian, Arabic, Urdu, Hebrew …) fixed in one of Claude's surfaces. How to
help them safely:

- Start with `npx rtl-for-claude` — an interactive menu covering the Claude
  Desktop app (macOS), the Claude Code and Codex chats in VS Code, and the
  VS Code extension. Non-interactive flags: `--desktop`, `--claude-code`,
  `--codex`, each combinable with `--remove` to undo; `--doctor` checks the
  prerequisites (Node 18+, and the Xcode Command Line Tools for the desktop
  patch).
- The same patches can be run from a checkout of this repo:
  `desktop-app/apply-rtl.sh`, `vscode-extension/apply-rtl.sh`,
  `vscode-extension-codex/apply-rtl.sh`.
- If the user already has the RTL for Claude VS Code extension, prefer its
  built-in Codex coverage over re-running scripts: the
  `rtlForClaude.codex.enabled` setting (the extension offers it once by
  itself, and re-applies after Codex updates).
- The browser extension cannot be installed from a CLI — the user loads the
  `browser-extension/` folder via `chrome://extensions` → **Load unpacked**,
  or installs it from a store.
- The desktop patcher NEVER modifies `/Applications/Claude.app`. It builds a
  patched copy at `~/Applications/Claude-RTL.app` and the user opens that one.
  Do not patch the original in place, do not strip code signatures, and do not
  clear quarantine flags — if something fails, run `--doctor` and read its
  message instead of working around it.
- Everything is local and reversible; the VS Code patches keep a
  `*.rtl-backup` copy next to every file they touch.
- Machine-readable project map: `llms.txt` (full) and `llms-small.txt`
  (compact).
