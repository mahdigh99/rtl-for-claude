<div align="center">

<img src="browser-extension/icons/icon-128.png" width="92" alt="RTL for Claude" />

# RTL for Claude

**Right-to-left languages that finally read _right_ in Claude.**
Automatic RTL + the gorgeous Vazirmatn font. Zero setup.

![License](https://img.shields.io/badge/License-MIT-3b82f6)
![npm](https://img.shields.io/npm/v/rtl-for-claude)
![Chrome](https://img.shields.io/badge/Chrome-supported-success)
![Firefox](https://img.shields.io/badge/Firefox-supported-success)
![VS Code](https://img.shields.io/badge/VS%20Code-Claude%20Code-success)
![macOS](https://img.shields.io/badge/macOS-Claude%20Desktop-success)
![Privacy](https://img.shields.io/badge/Privacy-100%25%20local-8b5cf6)

**English** · [فارسی](README.fa.md) · [العربية](README.ar.md) · [اردو](README.ur.md)

<img src="docs/demo.gif" width="640" alt="RTL for Claude in action" />

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

Two ways in — both end up in the same place.

### The quick way — one command

```bash
npx rtl-for-claude
```

- **The menu**: arrow keys — pick the Claude Desktop app, the Claude Code or
  Codex chat, or the VS Code extension.
- **Undo**: run it again and pick the remove option; everything goes back.

Don't want a terminal at all? Two stand-ins:

- 🖱️ **Double-click**: grab **Install RTL for Claude.command** from
  [Releases](https://github.com/mahdigh99/rtl-for-claude/releases/latest) and
  open it (first time: right-click → **Open**).
- 🤖 **Via AI**: hand the repo URL to Claude Code and ask it to set this up —
  [CLAUDE.md](CLAUDE.md) tells it how.

<sub>Needs [Node.js](https://nodejs.org) 18+. Two exceptions: the browser
extension can't be installed from this menu (it's just below), and on Windows
take the hands-on way for now.</sub>

---

### The hands-on way — everything under your control

No magic here: every part is either a script you can open and read before you
run it, or a folder you load into the browser yourself. If you'd rather not
run anything sight unseen, this is your path.

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

Don't want the extension at all? `bash vscode-extension/apply-rtl.sh` patches
the chat directly. Full guide:
[vscode-extension/README.md](vscode-extension/README.md).

**VS Code — Codex**

The easiest way is the **RTL for Claude** extension above: when Codex is
installed it offers — once — to cover the Codex chat too, then re-applies
itself after every Codex update (the `rtlForClaude.codex.enabled` setting).

The hands-on way is its standalone patcher:

```bash
bash vscode-extension-codex/apply-rtl.sh
```

Then run **Developer: Reload Window**; re-run it yourself after each Codex
update, and `--remove` restores the original look.
The Marketplace product is now named Codex, but the installed folder still
uses the old `openai.chatgpt` identifier — that's expected. Full guide:
[vscode-extension-codex/README.md](vscode-extension-codex/README.md).

**Claude Desktop app — macOS only**

Download the repository, read the script if you like, then run it:

```bash
bash desktop-app/apply-rtl.sh --install
```

**The result is a second app named Claude-RTL** — your original Claude is
untouched and keeps working. The new app is not next to the original: it goes
into the Applications folder inside your home (`~/Applications`), and the
easiest way to find it is Spotlight — type **Claude-RTL**. Open that one from
now on. Re-run the patcher after each Claude Desktop update; `--remove`
deletes the second app and everything is back the way it was.

<sub>Needs Node.js and the Xcode Command Line Tools — `npx rtl-for-claude --doctor`
tells you if anything is missing. Full guide:
[desktop-app/README.md](desktop-app/README.md).</sub>

## 🎛️ Make it yours

Click the toolbar icon to fine-tune detection sensitivity, font (bundled or one
installed on your computer), text size, line spacing, the floating direction
button, the popup's language, and which sites it runs on — including your own.

## ❓ FAQ

**Claude updated and things look broken again. Now what?**
The browser extension isn't affected by updates at all, and the VS Code
extension re-applies itself — to both chats, if you turned Codex coverage on.
Only the hand-run patches — the desktop app, and the chats if you patched
them without the extension — need one more run of the same command.

**What exactly does it touch?**
No original files. The desktop app is patched as a separate copy (Claude-RTL),
and the VS Code patches back up every file they change (`*.rtl-backup`) before
touching it. Everything is offline, on your machine.

**Windows or Linux?**
The browser extension and the VS Code extension work everywhere; the desktop
patch is macOS-only for now.

**How do I undo everything?**
Run `npx rtl-for-claude` and pick the remove option, or pass `--remove` to any
of the scripts; the extensions uninstall like any other extension.

## 🔒 Privacy

No servers. No analytics. Nothing ever leaves your browser.

## ⭐ If it helped

A star helps more people find this. Found a bug?
[Open an issue](https://github.com/mahdigh99/rtl-for-claude/issues).

## ❤️ In memory of Saber

The typeface is [Vazirmatn](https://github.com/rastikerdar/vazirmatn) — in
memory of the late Saber Rastikerdar, who left his fonts free for everyone.
Code under the [MIT License](LICENSE).

---

<div align="center"><sub>Made for everyone who thinks right-to-left.</sub></div>
