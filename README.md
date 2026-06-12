<div align="center">

<img src="browser-extension/icons/icon-128.png" width="92" alt="RTL for Claude" />

# RTL for Claude

**Right-to-left languages that finally read _right_ in Claude.**
Automatic RTL + the gorgeous Vazirmatn font. Zero setup.

![License](https://img.shields.io/badge/License-MIT-3b82f6)
![Chrome](https://img.shields.io/badge/Chrome-supported-success)
![Firefox](https://img.shields.io/badge/Firefox-supported-success)
![VS Code](https://img.shields.io/badge/VS%20Code-Claude%20Code-success)
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
- 🎛️ **One-click override** — a tiny toggle on any message for when you disagree.
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
```bash
cd vscode-extension && bash apply-rtl.sh    # then run "Developer: Reload Window"
```
Want it to survive Claude updates on its own? Install the companion extension —
guide in [vscode-extension/README.md](vscode-extension/README.md).

## 🎛️ Make it yours

Click the toolbar icon to fine-tune detection sensitivity, font, text size,
line spacing, the per-message toggle, and which sites it runs on.

## 🔒 Privacy

No servers. No analytics. Nothing ever leaves your browser.

## ❤️ Credits

Powered by the open-source [Vazirmatn](https://github.com/rastikerdar/vazirmatn)
font by Saber Rastikerdar (SIL OFL). Code under the [MIT License](LICENSE).

---

<div align="center"><sub>Made for everyone who thinks right-to-left.</sub></div>
