# RTL for ChatGPT (VS Code)

Persian/Arabic RTL support for the OpenAI **ChatGPT** VS Code extension.

The ChatGPT chat is a sandboxed webview, so this patcher edits the extension's own on-disk files to inject a small RTL engine and stylesheet. It is fully reversible.

## What it does

- Detects RTL text in user messages and assistant Markdown replies.
- Applies the **Vazirmatn** font and right-to-left direction to RTL content.
- Keeps code blocks and inline code left-to-right.
- Adds a floating **Auto ⇄ RTL ⇄ LTR** toggle to the chat window.
- Applies RTL direction to the composer input when you type Persian/Arabic.

## How to use

1. Open a terminal in this folder:

   ```bash
   cd vscode-extension-chatgpt
   ```

2. Install / re-apply the patch:

   ```bash
   ./apply-rtl.sh
   ```

3. Run **`Developer: Reload Window`** in VS Code (`Cmd/Ctrl+Shift+P`).

4. Open the ChatGPT side panel and start a Persian conversation.

### Remove the patch

```bash
./apply-rtl.sh --remove
```

### List target folders

```bash
./apply-rtl.sh --list
```

## Important: extension updates

Every ChatGPT extension update replaces the patched files. Re-run:

```bash
./apply-rtl.sh
```

after each update.

## Files

| File | Purpose |
|------|---------|
| `apply-rtl.sh` | Patcher / uninstaller script |
| `assets/driver.js` | RTL detection engine (runs inside the webview) |
| `assets/styles.css` | RTL font and direction rules |
| `assets/vazirmatn-chatgpt.woff2` | Vazirmatn font |

## How it works

The script locates every installed `openai.chatgpt` extension directory, copies the three assets into its `webview/assets/`, and inserts a `<link>` and `<script>` tag into `webview/index.html` before the closing `</head>`. The webview host code reads `index.html` as-is, so no change to `out/extension.js` is required.

## Troubleshooting

- **No effect after reload**: run `./apply-rtl.sh` again and reload the window.
- **Hashes changed**: if the ChatGPT build uses new CSS-module class hashes, update the partial selectors in `assets/driver.js` and `assets/styles.css` (look for `class*="_markdownContent_"` etc.) to match the new bundle.
