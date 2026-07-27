<div align="center">

<img src="browser-extension/icons/icon-128.png" width="92" alt="RTL for Claude" />

# RTL for Claude

**Right-to-left languages that finally read _right_ in Claude.**
Automatic RTL + the gorgeous Vazirmatn font. Zero setup.

![License](https://img.shields.io/badge/License-MIT-3b82f6)
![Chrome](https://img.shields.io/badge/Chrome-supported-success)
![Firefox](https://img.shields.io/badge/Firefox-supported-success)
![VS Code](https://img.shields.io/badge/VS%20Code-Claude%20Code-success)
![macOS](https://img.shields.io/badge/macOS-Claude%20Desktop-success)
![Privacy](https://img.shields.io/badge/Privacy-100%25%20local-8b5cf6)

**English** · [فارسی](README.fa.md) · [العربية](README.ar.md) · [اردو](README.ur.md)

</div>

---

> Claude writes brilliant answers — but in right-to-left languages they spill out
> left-aligned and tangled. **RTL for Claude** fixes that in one click, and stays
> out of your way everywhere else.

| 😖 Without it | 😍 With it |
| --- | --- |
| RTL replies come out left-aligned and broken | Every reply snaps right-to-left in a clean font |
| Your typing jumps around | The compose box flips live as you type |
| Mixed code & English look messy | Code stays code, English stays English |

## ✨ Why you'll love it

- 🪄 **Automatic** — detects direction paragraph by paragraph. No buttons, no config.
- 🌍 **Every RTL language** — Persian, Arabic, Urdu, Kurdish, Pashto, Hebrew & more.
- 🔤 **Beautiful typography** — the bundled Vazirmatn font, with tunable size & spacing.
- ⌨️ **Smart compose box** — flips the moment you start typing.
- 🧩 **Never breaks code** — code blocks, diffs and terminals stay left-to-right.
- 🎛️ **One-click override** — a floating Auto / RTL / LTR button pins the whole
  chat (`Cmd/Ctrl + Shift + 9`); in the Claude Code chat, every message also gets
  its own ⇌ toggle.
- 🧠 **Beyond Claude** — also works on ChatGPT & Gemini.
- 🔒 **Private by design** — 100% local. No servers, no tracking, ever.

## 🚀 Install

Pick what you need — each part is its own self-contained download.

**Browser — Chrome / Edge / Brave**
1. Download the [`browser-extension`](browser-extension) folder.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and select the folder. Done. ✅

**Browser — Firefox**
1. Open `about:debugging` → **Load Temporary Add-on**.
2. Select `browser-extension/manifest.json`.

**VS Code — Claude Code**

From the **Marketplace** — search **"RTL for Claude"** (or open the
[listing](https://marketplace.visualstudio.com/items?itemName=mahdigh99.rtl-for-claude)),
click **Install**, then run **Developer: Reload Window**.

Or install the **`.vsix`** — download `rtl-for-claude-vscode-*.vsix` from
[Releases](https://github.com/mahdigh99/rtl-for-claude/releases) and run
**Extensions → `…` → Install from VSIX…**.

No-install alternative: `bash vscode-extension/apply-rtl.sh`. Full guide:
[vscode-extension/README.md](vscode-extension/README.md).

**VS Code — Codex**

The Codex extension uses a separate webview patcher. From this repository, run:

```bash
bash vscode-extension-codex/apply-rtl.sh
```

Or, without downloading anything: `npx rtl-for-claude` → option **3**.

Then run **Developer: Reload Window**. Re-run the patcher after Codex updates.
To restore the original Codex webview, run
`bash vscode-extension-codex/apply-rtl.sh --remove`. The Marketplace product is
named Codex, although its installed extension identifier remains
`openai.chatgpt`. Full guide:
[vscode-extension-codex/README.md](vscode-extension-codex/README.md).

**Claude Desktop app — macOS**

Open Terminal and paste this one line:

```bash
npx rtl-for-claude
```

A menu appears; pick **Claude Desktop**. It builds a **patched copy** at
`~/Applications/Claude-RTL.app` — your original Claude.app is never modified —
so just open **Claude-RTL** and you're done. Re-run it after each Claude Desktop
update, and `npx rtl-for-claude --desktop --remove` deletes the copy.

<sub>Prefer to read the script before running it? Download the repository and run
`bash desktop-app/apply-rtl.sh --install` — same patcher, same result. Both need
Node.js and Xcode Command Line Tools; `npx rtl-for-claude --doctor` checks for
them. Full guide: [desktop-app/README.md](desktop-app/README.md).</sub>

## 🎛️ Make it yours

Click the toolbar icon to fine-tune detection sensitivity, font (bundled or one
installed on your computer), text size, line spacing, the floating direction
button, the popup's language, and which sites it runs on — including your own.

## 🔒 Privacy

No servers. No analytics. Nothing ever leaves your browser.

## ❤️ Credits

Powered by the open-source [Vazirmatn](https://github.com/rastikerdar/vazirmatn)
font by Saber Rastikerdar (SIL OFL). Code under the [MIT License](LICENSE).

---

<div align="center"><sub>Made for everyone who thinks right-to-left.</sub></div>
