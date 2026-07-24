# Codex VS Code RTL Support Design

## Goal

Add a standalone, reversible RTL patcher for the official Codex VS Code
extension while preserving the existing Claude, browser, and Marketplace
extension behavior.

## Scope

- Add the patcher under `vscode-extension-codex/`.
- Refer to the product as “Codex” in user-facing text and documentation.
- Continue targeting the extension identifier `openai.chatgpt`, which is used by
  the current Codex VS Code extension.
- Keep the Codex patcher independent from the existing Claude patcher.
- Document Codex installation and removal from the repository README.
- Exclude local archives, editor metadata, generated output, and installed
  extension files from the change.

## Patcher Behavior

The shell script discovers Codex installations in supported VS Code-compatible
extension roots. Install mode copies the stylesheet, driver, and bundled font
into the Codex webview assets directory, creates a pristine backup, and injects
marked asset references into `webview/index.html`.

Repeated installation is idempotent. Remove mode restores the backup when
available, otherwise removes only the marked injection block, and then removes
the copied RTL assets. List mode reports targets without modifying them.

The injected driver detects RTL text in user messages, assistant Markdown, and
the composer. Code and preformatted content remain left-to-right. A small
three-state control provides automatic, forced RTL, and forced LTR modes.

## Compatibility and Error Handling

- Missing source assets fail before any target is modified.
- Unsupported command-line options fail with usage guidance.
- No installed Codex target produces a non-zero exit with an actionable message.
- Extension updates may overwrite the patch; users re-run the patcher.
- DOM selectors may require maintenance when the Codex webview changes.

## Verification

- Compare the implementation and restore guarantees with the Claude patcher.
- Run Bash syntax validation and ShellCheck when available.
- Run JavaScript syntax validation with Node.js.
- Exercise list, install, repeated install, and remove against a temporary mock
  Codex extension tree without touching the user’s installed extension.
- Verify the injected block and copied assets, pristine backup behavior, and
  exact restoration.
- Run Fallow audit against `origin/main`.
- Review the final diff and ensure only intended source and documentation files
  are committed.

## Delivery

Create a focused conventional commit on `feat/codex-vscode-rtl`, push the branch,
and open a GitHub Pull Request against `main` with motivation, behavior, testing
evidence, compatibility notes, and a concise file-review guide.
