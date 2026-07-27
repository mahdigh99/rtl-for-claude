# RTL for Claude — Claude Desktop (macOS)

Right-to-left text and the Vazirmatn font in the **Claude Desktop app** on
macOS: automatic per-paragraph direction, LTR code blocks, math that doesn't
mirror, and a floating **Auto / RTL / LTR** button (also `Cmd + Shift + 9`)
that remembers your choice.

> **Your Claude.app is never modified.** The installer builds a *separate
> patched copy* at `~/Applications/Claude-RTL.app` and touches only that copy.
> Uninstalling is deleting it.

## Install

**1. Get the files.** Download the repository —
[Code → Download ZIP](https://github.com/mahdigh99/rtl-for-claude/archive/refs/heads/main.zip)
— and unzip it, or:

```bash
git clone https://github.com/mahdigh99/rtl-for-claude.git
```

**2. Check the two requirements.** Both are one-time:

```bash
node --version      # Node.js — https://nodejs.org (any recent version)
xcode-select -p     # Xcode Command Line Tools; if missing: xcode-select --install
```

**3. Run the installer** from inside the downloaded folder:

```bash
cd rtl-for-claude/desktop-app
bash apply-rtl.sh --install
```

It takes a minute or two. When it finishes, open **Claude-RTL** from your
`~/Applications` folder (or Spotlight). Your Persian, Arabic and Urdu chats now
read right-to-left.

The first launch shows a macOS prompt or two (notifications, and possibly a
keychain prompt) — that is expected, see [Good to know](#good-to-know).

## Everyday use

```bash
bash apply-rtl.sh --list      # is it installed? is it still healthy?
bash apply-rtl.sh --remove    # delete the patched copy, leaving Claude.app alone
bash apply-rtl.sh --install   # re-run after each Claude Desktop update
```

**After every Claude Desktop update, re-run `--install`.** Anthropic's updater
only updates the original app, so the patched copy stays on the old version
until you rebuild it. `--list` tells you when that has happened.

Inside the app: click the floating button (bottom-right) or press
`Cmd + Shift + 9` to pin the whole conversation to RTL or LTR, or back to
automatic.

## Good to know

- **The two apps live side by side.** Keep using the original Claude whenever
  you like; `--install` and `--remove` only ever touch the Claude-RTL copy.
- **First launch may re-ask for permissions.** Notifications, screen recording
  and the "Claude Safe Storage" keychain item are asked once for the copy,
  because macOS sees it as a different app. Answer yes and it won't ask again.
- **Signing in with a passkey may not work in the copy** (password and normal
  session sign-in are unaffected). Check that your session survives a relaunch
  before you rely on the copy for everything.
- **Not code-signed by Anthropic.** The copy carries a local ad-hoc signature.
  Your original app keeps its Anthropic signature and auto-updates.
- **macOS only.** There is no supported way to do the same on Windows without
  installing a self-signed certificate machine-wide, which this project won't
  do; Linux has no official Claude Desktop app.

## Something went wrong?

- **"Claude.app not found"** — the installer expects the app at
  `/Applications/Claude.app`. Move it there (not `~/Applications`) and re-run.
- **The patched copy won't start** — run `bash apply-rtl.sh --list`; if it
  reports a problem, `--remove` then `--install` rebuilds it from scratch.
- **Anything unexpected** — `--remove` always returns you to a clean system,
  because the original app was never touched. Then please
  [open an issue](https://github.com/mahdigh99/rtl-for-claude/issues).

## How it works

The Claude Desktop window is claude.ai loaded inside Electron, so the same
detection engine the browser extension uses (`rtl-math.js` + `rtl-engine.js`,
read straight from `../browser-extension/src/` at install time) is injected
into the app's preload script, together with a small driver and the stylesheet
with Vazirmatn embedded in it.

Everything is built in a temporary staging folder first — extract, inject,
repack, recompute the app's integrity hash, re-sign — and only swapped into
`~/Applications/` once every step has succeeded. A failed or interrupted
install therefore leaves your previous copy exactly as it was, never a
half-patched app.

```
desktop-app/
  apply-rtl.sh             # installer / uninstaller / status
  assets/driver.js         # the in-app driver
  assets/styles.css        # direction, font and code styles
  tests/apply-rtl.test.sh  # runs against a synthetic app, never the real one
```
