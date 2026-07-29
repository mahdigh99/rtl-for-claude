# RTL for Codex (VS Code)

Persian/Arabic RTL support for the OpenAI **Codex** VS Code extension.

The Codex chat is a sandboxed webview, so this patcher edits the extension's own on-disk files to inject a small RTL engine and stylesheet. It is fully reversible.

## What it does

- Detects RTL text in user messages and assistant Markdown replies.
- Applies the **Vazirmatn** font and right-to-left direction to RTL content.
- Keeps code blocks and inline code left-to-right.
- Adds a floating **Auto ⇄ RTL ⇄ LTR** toggle to the chat window.
- Applies RTL direction to the composer input when you type Persian/Arabic.

## How to use

**The easiest way** — the
[RTL for Claude](https://marketplace.visualstudio.com/items?itemName=mahdigh99.rtl-for-claude)
extension covers Codex too: it offers this once when Codex is installed
(setting: `rtlForClaude.codex.enabled`) and re-applies itself after every
Codex update — nothing to re-run by hand.

**The short way** — nothing to download:

```bash
npx rtl-for-claude
```

Pick **Codex chat in VS Code** from the menu (or run
`npx rtl-for-claude --codex`), then run **`Developer: Reload Window`** in VS
Code. To undo it: `npx rtl-for-claude --codex --remove`.

**From a checkout**, if you'd rather run the script yourself:

1. Open a terminal in this folder:

   ```bash
   cd vscode-extension-codex
   ```

2. Install / re-apply the patch:

   ```bash
   ./apply-rtl.sh
   ```

3. Run **`Developer: Reload Window`** in VS Code (`Cmd/Ctrl+Shift+P`).

4. Open the Codex side panel and start a Persian conversation.

### Remove the patch

```bash
./apply-rtl.sh --remove
```

### List target folders

```bash
./apply-rtl.sh --list
```

## Important: extension updates

Every Codex extension update replaces the patched files. Re-run:

```bash
./apply-rtl.sh
```

after each update. (Not needed when the RTL for Claude extension manages
Codex — it re-applies automatically.)

## Files

| File | Purpose |
|------|---------|
| `apply-rtl.sh` | Patcher / uninstaller script |
| `assets/driver.js` | RTL detection engine (runs inside the webview) |
| `assets/styles.css` | RTL font and direction rules |
| `assets/vazirmatn-codex.woff2` | Vazirmatn font |
| `assets/OFL.txt` | Vazirmatn font license |

## How it works

The script locates every installed `openai.chatgpt` extension directory, copies the three assets into its `webview/assets/`, and inserts a `<link>` and `<script>` tag into `webview/index.html` before the closing `</head>`. The webview host code reads `index.html` as-is, so no change to `out/extension.js` is required.

The Marketplace product is named **Codex**, while its installed extension
identifier remains `openai.chatgpt`.

## Troubleshooting

- **No effect after reload**: run `./apply-rtl.sh` again and reload the window.
- **Hashes changed**: if the Codex build uses new CSS-module class hashes, update the partial selectors in `assets/driver.js` and `assets/styles.css` (look for `class*="_markdownContent_"` etc.) to match the new bundle.
