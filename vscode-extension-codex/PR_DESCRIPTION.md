# Pull Request: Add OpenAI Codex VS Code RTL patcher

## Summary
This change adds a new standalone RTL patcher for the OpenAI Codex VS Code extension.
It allows the existing RTL-for-Claude project to support Codex by patching the Codex webview's `index.html` and loading custom RTL assets from `webview/assets/`.

## What changed
- Added `vscode-extension-codex/apply-rtl.sh`
  - discovers installed `openai.chatgpt` webview folders
  - injects RTL asset references into `webview/index.html`
  - copies `rtl-codex-styles.css`, `rtl-codex-driver.js`, and `vazirmatn-codex.woff2`
  - supports `--remove` and `--list`
- Added `vscode-extension-codex/assets/driver.js`
  - detects RTL text in Codex message/rendered markdown and composer input
  - marks stable nodes with RTL classes and supports global force toggling
- Added `vscode-extension-codex/assets/styles.css`
  - applies RTL direction, text alignment, and font overrides
  - preserves code/preformatted blocks as LTR
  - styles textarea composer input direction based on typed text
- Added `vscode-extension-codex/assets/vazirmatn-codex.woff2`
  - embeds the RTL-friendly font for the patched webview
- Added `vscode-extension-codex/tests/apply-rtl.test.sh`
  - tests list, install, idempotent re-apply, backup, and removal in a temporary home

## Motivation
The current repository only supports `anthropic.claude-code` webviews.
OpenAI Codex uses a different webview layout and bundled CSS modules, so the Claude patcher is not compatible.
This patcher targets Codex specifically without changing existing Claude support.
The Marketplace product is named Codex, but the installed extension identifier remains `openai.chatgpt`.

## Behavior
- Patches `webview/index.html` in installed OpenAI Codex extensions
- Loads the RTL CSS and JS assets directly from the extension's own `webview/assets/`
- Is fully reversible with `./apply-rtl.sh --remove`
- Preserves the original `index.html` in `index.html.rtl-backup`

## Testing
- Verified `./apply-rtl.sh --list` discovers installed Codex extension webview folders
- Verified `./apply-rtl.sh` inserts the patch block before `</head>` in `index.html`
- Verified assets are copied to `webview/assets/`
- Verified `./apply-rtl.sh --remove` restores original `index.html`
- Verified no syntax errors in `assets/driver.js` via `node --check`
- Verified the lifecycle against a temporary mock extension without modifying an installed extension

## Notes
- This patcher is independent from the Claude patcher and can coexist in the same repository.
- After updating the Codex extension, users must re-run `./apply-rtl.sh`.
- The implementation uses stable classes and markup observed in the current `openai.chatgpt` bundle, but may require update if OpenAI changes message DOM or class names.

## Files to review
- `vscode-extension-codex/apply-rtl.sh`
- `vscode-extension-codex/assets/driver.js`
- `vscode-extension-codex/assets/styles.css`
- `vscode-extension-codex/assets/vazirmatn-codex.woff2`
- `vscode-extension-codex/tests/apply-rtl.test.sh`
