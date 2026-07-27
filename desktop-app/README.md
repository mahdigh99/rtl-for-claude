# RTL for Claude — Claude Desktop (macOS)

Persian/RTL support for the **Claude Desktop** app on macOS: automatic
right-to-left detection with the same engine as the browser extension
(ratio + hysteresis + sticky container markers), Vazirmatn font, LTR code
blocks, math/LaTeX isolation, per-cell table direction, and a floating
whole-chat direction toggle (auto ⇌ → RTL → LTR) that persists across
restarts.

The Claude Desktop chat window **is** claude.ai loaded remotely, so the
patcher injects the proven `rtl-math.js` + `rtl-engine.js` from
`../browser-extension/src/` (read verbatim at patch time — single source of
truth) plus a minimal fixed-settings driver into the app's preload.

## Usage

```bash
./apply-rtl.sh --install   # build the patched copy at ~/Applications/Claude-RTL.app
./apply-rtl.sh --remove    # delete the patched copy
./apply-rtl.sh --list      # status: versions + patched or not
```

Requirements: **Node.js** (`node` + `npx`, for `@electron/asar`) and
**Xcode Command Line Tools** (`codesign`). Run from a full `rtl-for-claude`
checkout (the script reads the engine and font from `../browser-extension/`).

## Why macOS only?

Both "cross-platform" Claude Desktop patchers were audited line by line before
this scope was set (write-up: `docs/desktop-patcher-guide.md` §F).
`claude-rtl-patcher` advertises macOS + Windows + Linux but has **zero** Linux
code, a Windows check that can never fire on a default run, and a whole-file
ASAR hash that leaves the app unable to launch on macOS — its own primary
platform — including after `--restore`. Being published is not evidence of
being tested. The Windows patcher (`claude-desktop-rtl-patch`) genuinely
works, but only for the Microsoft Store/MSIX install, and it pays for it by
byte-swapping a certificate inside `cowork-svc.exe` and installing a
self-signed CA into the machine-wide Trusted Root store — out of scope here.

Windows *legacy* (per-user Squirrel) installs are the tractable next target
and do **not** need any of that cert surgery; that work is written up as a
deferred phase, blocked on having a real Windows machine to verify against.
Linux has no official Claude Desktop to target at all.

## How it works (copy model — the original app is never modified)

`--install` copies `/Applications/Claude.app` to
`~/Applications/Claude-RTL.app` and patches **the copy**:

1. Extracts `app.asar` and finds the claude.ai **preload** by grepping
   `.vite/build/*.js` for `claude.ai` — no hardcoded filename. The Electron
   main-process entry (from `package.json` `"main"`) is excluded and never
   written to; zero or multiple candidates abort with a clear error.
2. Appends **one marker block** (`/* ==== RTL-PATCH (begin/end) ==== */`):
   a prelude carrying the stylesheet + Vazirmatn embedded as a base64
   `data:` URI (the app's CSP is `font-src 'self' data:` with
   `connect-src 'none'`, and the sandboxed preload cannot read files — a
   `data:` URI is the only font source that works) and the allowed-origin
   list extracted from the bundle itself, then `rtl-math.js`,
   `rtl-engine.js`, and `assets/driver.js`. The result must pass
   `node --check` and a size guard before repacking.
3. Repacks with `--unpack "{*.node,*.dylib,spawn-helper}"` so native modules
   (claude-native, node-pty, …) stay outside the asar.
4. Updates `ElectronAsarIntegrity` in `Info.plist` with the SHA256 of the new
   asar **header string** (never the whole file). If the key ever disappears,
   the documented fallback disables the integrity fuse instead.
5. `xattr -cr`, then re-signs **ad-hoc** with the original entitlements minus
   exactly the 3 team-id-coupled keys macOS rejects under an ad-hoc signature
   (`com.apple.application-identifier`, `com.apple.developer.team-identifier`,
   `keychain-access-groups`). Everything else — notably
   `com.apple.security.virtualization` for Cowork — is preserved.

All of that happens in a **staging directory**. Only once every step has
succeeded is the result swapped into `~/Applications/`, and the previous copy
is removed only after the new one is in place — so a failed or interrupted
install leaves your existing copy exactly as it was, never a half-patched app.
`--list` re-verifies the integrity hash of an installed copy and warns if it
would refuse to start or if the original app has been updated since.

## Warnings (read before installing)

- **Signature.** The patched copy carries an ad-hoc signature, not
  Anthropic's. Only the copy — the original keeps its signature, TCC
  permissions, keychain item, and auto-updates.
- **First launch.** macOS may re-ask permissions (notifications, screen
  recording, …) and the "Claude Safe Storage" keychain item **once** for the
  patched copy — expected, it has a different code identity. Stripping
  `keychain-access-groups` may degrade WebAuthn/passkey sign-in in the copy;
  password/session login is unaffected. Verify your session persists after a
  relaunch before relying on it.
- **Updates never reach the copy.** Anthropic's updater only updates the
  original app. After each Claude Desktop update, re-run
  `./apply-rtl.sh --install` to rebuild the copy from the new version.
- **`codesign --deep`** is deprecated by Apple; it is fine for a local
  patcher today but may warn on future macOS versions.
- Run both apps side by side if you like — `--install`/`--remove` only ever
  quits/deletes the **Claude-RTL** copy, never your running original Claude.

## Layout

```
desktop-app/
  apply-rtl.sh             # installer/uninstaller/status (copy model)
  assets/driver.js         # fixed-settings driver (content.js minus chrome.*)
  assets/styles.css        # browser styles.css minus @font-face (added at patch time)
  tests/apply-rtl.test.sh  # lifecycle test against a SYNTHETIC asar fixture
```

The test suite never touches the real app:

```bash
bash tests/apply-rtl.test.sh   # PASS: Claude Desktop RTL patcher lifecycle
```

Design notes (why the header-string hash, the unpack glob, the 3 stripped
entitlements, and copy-over-in-place): see the comment block at the top of
`apply-rtl.sh`.
