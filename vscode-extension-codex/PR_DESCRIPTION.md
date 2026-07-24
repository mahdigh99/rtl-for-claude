# Merge Request: Add OpenAI ChatGPT VS Code RTL patcher

## Summary
This change adds a new standalone RTL patcher for the OpenAI ChatGPT VS Code extension.
It allows the existing RTL-for-Claude project to support ChatGPT by patching the ChatGPT webview's `index.html` and loading custom RTL assets from `webview/assets/`.

## What changed
- Added `vscode-extension-chatgpt/apply-rtl.sh`
  - discovers installed `openai.chatgpt` webview folders
  - injects RTL asset references into `webview/index.html`
  - copies `rtl-chatgpt-styles.css`, `rtl-chatgpt-driver.js`, and `vazirmatn-chatgpt.woff2`
  - supports `--remove` and `--list`
- Added `vscode-extension-chatgpt/assets/driver.js`
  - detects RTL text in ChatGPT message/rendered markdown and composer input
  - marks stable nodes with RTL classes and supports global force toggling
- Added `vscode-extension-chatgpt/assets/styles.css`
  - applies RTL direction, text alignment, and font overrides
  - preserves code/preformatted blocks as LTR
  - styles textarea composer input direction based on typed text
- Added `vscode-extension-chatgpt/assets/vazirmatn-chatgpt.woff2`
  - embeds the RTL-friendly font for the patched webview

## Motivation
The current repository only supports `anthropic.claude-code` webviews.
OpenAI ChatGPT uses a different webview layout and bundled CSS modules, so the Claude patcher is not compatible.
This patcher targets ChatGPT specifically without changing existing Claude support.

## Behavior
- Patches `webview/index.html` in installed OpenAI ChatGPT extensions
- Loads the RTL CSS and JS assets directly from the extension's own `webview/assets/`
- Is fully reversible with `./apply-rtl.sh --remove`
- Preserves the original `index.html` in `index.html.rtl-backup`

## Testing
- Verified `./apply-rtl.sh --list` discovers installed ChatGPT extension webview folders
- Verified `./apply-rtl.sh` inserts the patch block before `</head>` in `index.html`
- Verified assets are copied to `webview/assets/`
- Verified `./apply-rtl.sh --remove` restores original `index.html`
- Verified no syntax errors in `assets/driver.js` via `node --check`

## Notes
- This patcher is independent from the Claude patcher and can coexist in the same repository.
- After updating the ChatGPT extension, users must re-run `./apply-rtl.sh`.
- The implementation uses stable classes and markup observed in the current `openai.chatgpt` bundle, but may require update if OpenAI changes message DOM or class names.

## Files to review
- `vscode-extension-chatgpt/apply-rtl.sh`
- `vscode-extension-chatgpt/assets/driver.js`
- `vscode-extension-chatgpt/assets/styles.css`
- `vscode-extension-chatgpt/assets/vazirmatn-chatgpt.woff2`
