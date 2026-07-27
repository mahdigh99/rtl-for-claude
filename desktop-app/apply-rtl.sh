#!/usr/bin/env bash
# ============================================================================
# apply-rtl.sh — Persian RTL + Vazirmatn for Claude Desktop (macOS).
#
# COPY MODEL (never touches the original): copies /Applications/Claude.app to
# ~/Applications/Claude-RTL.app and patches the COPY. The original keeps its
# Anthropic signature, TCC permissions, keychain item and auto-updates; the
# pristine original IS the backup, and uninstall is just deleting the copy.
#
#   ./apply-rtl.sh --install   # (re)build the patched copy — rerun after
#                              # every Claude update (updates never reach it)
#   ./apply-rtl.sh --remove    # delete the patched copy
#   ./apply-rtl.sh --list      # status: app versions + patched or not
#
# What --install does (docs/desktop-patcher-guide.md is the spec):
#   1. cp -R Claude.app → Claude-RTL.app (display name changed, CFBundleName
#      kept — Electron's fuse lookup reads CFBundleName).
#   2. asar extract; find the claude.ai PRELOAD by grepping .vite/build/*.js
#      for "claude.ai" (no hardcoded name; the Electron MAIN entry from
#      package.json "main" is excluded and never written to — injecting
#      renderer code there means a silent black screen; ambiguity = abort).
#   3. APPEND one marker block: prelude (CSS+data-URI Vazirmatn, base64;
#      CSP is font-src 'self' data: with connect-src 'none', and the sandboxed
#      preload cannot fs-read a font — data: URI is the only working source)
#      + rtl-math.js + rtl-engine.js (verbatim from browser-extension/src)
#      + the desktop driver. Origin guard uses the allowed-origin list
#      extracted from the bundle itself. node --check + size guard after.
#   4. asar pack --unpack "{*.node,*.dylib,spawn-helper}" (native modules must
#      stay unpacked or claude-native/node-pty break).
#   5. ElectronAsarIntegrity ← SHA256 of the asar HEADER STRING (never the
#      whole file!), read straight from the header at offset 12.
#   6. xattr -cr, then ad-hoc codesign with the original entitlements minus
#      exactly the 3 team-id-coupled keys macOS rejects under ad-hoc.
#
# Requirements: Node.js (node + npx for @electron/asar), Xcode CLT (codesign).
# Test hooks (used by tests/apply-rtl.test.sh against a SYNTHETIC fixture):
#   RTLX_SOURCE_APP, RTLX_PATCHED_APP, RTLX_SKIP_SIGN=1
# ============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Engine + math module are read VERBATIM from the browser extension at patch
# time (single source of truth — no third/fourth copy to keep in sync).
MATH_SRC="$SCRIPT_DIR/../browser-extension/src/rtl-math.js"
ENGINE_SRC="$SCRIPT_DIR/../browser-extension/src/rtl-engine.js"
FONT_SRC="$SCRIPT_DIR/../browser-extension/fonts/Vazirmatn-VariableFont_wght.woff2"
DRIVER_SRC="$SCRIPT_DIR/assets/driver.js"
STYLES_SRC="$SCRIPT_DIR/assets/styles.css"

SOURCE_APP="${RTLX_SOURCE_APP:-/Applications/Claude.app}"
# How to tell the user to run this again. When the npm installer wrapped us,
# "$0" points at a file inside a node_modules cache — useless advice — so it
# passes the command the user actually typed.
SELF_CMD="${RTLX_INVOKED_AS:-$0}"
PATCHED_APP="${RTLX_PATCHED_APP:-$HOME/Applications/Claude-RTL.app}"
PATCHED_ASAR="$PATCHED_APP/Contents/Resources/app.asar"
PATCHED_PLIST="$PATCHED_APP/Contents/Info.plist"

# B3: native modules listed in the asar header as unpacked MUST stay unpacked.
UNPACK_GLOB='{*.node,*.dylib,spawn-helper}'

BEGIN_MARK="/* ==== RTL-PATCH (begin) ==== */"
END_MARK="/* ==== RTL-PATCH (end) ==== */"

# --- output helpers ----------------------------------------------------------
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[0;33m'; CYAN='\033[0;36m'; NC='\033[0m'
log()  { echo -e "  ${CYAN}[*]${NC} $1"; }
ok()   { echo -e "  ${GREEN}[+]${NC} $1"; }
warn() { echo -e "  ${YELLOW}[!]${NC} $1"; }
die()  { echo -e "  ${RED}[X]${NC} $1" >&2; exit 1; }

TMP_DIR=""
STAGING=""   # half-built bundle; removed on ANY failure so a broken copy is
             # never left behind (borrowed from the Windows patcher's
             # all-or-nothing restore discipline).
cleanup() {
  [ -n "$TMP_DIR" ] && [ -d "$TMP_DIR" ] && rm -rf "$TMP_DIR" || true
  [ -n "$STAGING" ] && [ -d "$STAGING" ] && rm -rf "$STAGING" || true
}
trap cleanup EXIT

asar_cmd() {
  if command -v asar >/dev/null 2>&1; then asar "$@"
  else npx --yes @electron/asar "$@"
  fi
}

# A1: SHA256 of the asar HEADER STRING (the JSON), NOT of the whole file.
# Layout: offset 12 holds the 4-byte little-endian length of the UTF-8 JSON
# header string, which starts at offset 16 (same read as the verified
# PowerShell reference; equals @electron/asar getRawHeader().headerString).
header_hash() {
  node -e '
    const fs = require("fs"), crypto = require("crypto");
    const fd = fs.openSync(process.argv[1], "r");
    const sz = Buffer.alloc(16);
    fs.readSync(fd, sz, 0, 16, 0);
    const len = sz.readUInt32LE(12);
    const hdr = Buffer.alloc(len);
    fs.readSync(fd, hdr, 0, len, 16);
    fs.closeSync(fd);
    process.stdout.write(crypto.createHash("sha256").update(hdr).digest("hex"));
  ' "$1"
}

plist_get() { /usr/libexec/PlistBuddy -c "Print :$2" "$1" 2>/dev/null || true; }

strip_patch() { # remove a previous marker block, in place (idempotency)
  local f="$1"
  awk -v b="$BEGIN_MARK" -v e="$END_MARK" '
    $0==b {skip=1}
    skip==0 {print}
    $0==e {skip=0}
  ' "$f" > "$f.tmp" && mv "$f.tmp" "$f"
}

# NOTE: no "${#arr[@]}" on possibly-empty arrays anywhere in this script —
# macOS ships bash 3.2, where that trips `set -u` (fixed only in bash 4.4).
check_dependencies() {
  local missing=0
  command -v node >/dev/null 2>&1 \
    || { warn "missing: Node.js (node) — https://nodejs.org or 'brew install node'"; missing=1; }
  command -v npx  >/dev/null 2>&1 || command -v asar >/dev/null 2>&1 \
    || { warn "missing: npx (ships with Node.js) or a global @electron/asar"; missing=1; }
  if [ "${RTLX_SKIP_SIGN:-0}" != "1" ]; then
    command -v codesign >/dev/null 2>&1 \
      || { warn "missing: Xcode Command Line Tools (codesign) — xcode-select --install"; missing=1; }
  fi
  [ "$missing" -eq 0 ] || die "install the missing dependencies above, then re-run."
}

quit_patched() {
  # Scoped to the PATCHED copy's path — never the user's original Claude.
  if pgrep -f "$PATCHED_APP/Contents/MacOS" >/dev/null 2>&1; then
    log "quitting the running patched copy…"
    pkill -f "$PATCHED_APP/Contents/MacOS" 2>/dev/null || true
    sleep 1
  fi
}

# --- install -----------------------------------------------------------------
install_patch() {
  [ -d "$SOURCE_APP" ] || die "Claude.app not found at $SOURCE_APP — is Claude Desktop installed?"
  for f in "$MATH_SRC" "$ENGINE_SRC" "$DRIVER_SRC" "$STYLES_SRC" "$FONT_SRC"; do
    [ -f "$f" ] || die "required source file missing: $f (run from a full rtl-for-claude checkout)"
  done
  # The source must never BE the target: with RTLX_SOURCE_APP pointed at the
  # patched copy, the old "rm -rf target" would have deleted the source before
  # copying it. Compare resolved paths, not the strings.
  local src_real tgt_parent tgt_real
  src_real="$(cd "$SOURCE_APP" && pwd -P)"
  tgt_parent="$(dirname "$PATCHED_APP")"
  tgt_real="$( [ -d "$tgt_parent" ] && echo "$(cd "$tgt_parent" && pwd -P)/$(basename "$PATCHED_APP")" || echo "$PATCHED_APP" )"
  [ "$src_real" != "$tgt_real" ] || die "source and target are the same bundle ($src_real) — refusing to patch a copy onto itself."
  # Patching an already-patched bundle would nest our block inside itself.
  if [ -f "$SOURCE_APP/Contents/Resources/app.asar" ] \
     && LC_ALL=C grep -aq -- "RTL-PATCH (begin)" "$SOURCE_APP/Contents/Resources/app.asar"; then
    die "the SOURCE app at $SOURCE_APP is already RTL-patched — point RTLX_SOURCE_APP at a pristine Claude.app."
  fi

  check_dependencies
  quit_patched

  TMP_DIR="$(mktemp -d)"

  # 1. Build the whole patched bundle in a STAGING path and only swap it into
  # place once everything (inject → repack → integrity → sign) succeeded. Any
  # failure removes the staging dir via the EXIT trap and leaves the previous
  # copy — if any — exactly as it was. No half-patched app can ever be left
  # behind, and --list can never report a partially built bundle.
  mkdir -p "$tgt_parent"
  STAGING="$PATCHED_APP.staging.$$"
  rm -rf "$STAGING"
  log "copying $(basename "$SOURCE_APP") → staging …"
  cp -R "$SOURCE_APP" "$STAGING"

  local st_asar="$STAGING/Contents/Resources/app.asar"
  local st_plist="$STAGING/Contents/Info.plist"
  [ -f "$st_asar" ] || die "app.asar not found inside the copy ($st_asar) — app layout changed?"

  # Cosmetic rename: CFBundleDisplayName ONLY. Never touch CFBundleName —
  # Electron's fuse tooling reads it (reference: soguy patch.sh:263).
  /usr/libexec/PlistBuddy -c "Add :CFBundleDisplayName string Claude-RTL" "$st_plist" 2>/dev/null \
    || /usr/libexec/PlistBuddy -c "Set :CFBundleDisplayName Claude-RTL" "$st_plist" 2>/dev/null || true

  # 2. Extract.
  log "extracting app.asar …"
  asar_cmd extract "$st_asar" "$TMP_DIR/app"

  local build_dir="$TMP_DIR/app/.vite/build"
  [ -d "$build_dir" ] || die ".vite/build/ not found in the asar — Claude Desktop layout changed; aborting."

  # 3a. Resolve the Electron MAIN entry (B5) — the file we must NEVER touch.
  [ -f "$TMP_DIR/app/package.json" ] || die "package.json missing in the asar — layout changed; aborting."
  local main_entry main_base
  main_entry="$(node -p 'require(process.argv[1]).main || ""' "$TMP_DIR/app/package.json")"
  [ -n "$main_entry" ] || die 'could not read "main" from the asar package.json — aborting (black-screen guard).'
  main_base="$(basename "$main_entry")"

  # 3b. Locate the claude.ai PRELOAD by content, not by name. Exactly one
  # candidate must survive — zero or several means the app changed and
  # guessing could inject into the wrong process (die, don't guess).
  #
  # Three filters, in order:
  #   • the Electron main entry (3a)                    — renderer code there
  #     means no BrowserWindow at all (silent black screen);
  #   • the Node MCP hosts / workers below — they have NO DOM, and injecting
  #     into them broke MCP startup for the Windows patcher (its issue #14);
  #     they are excluded by name so a future build that merely MENTIONS
  #     claude.ai in a worker cannot spuriously block the install;
  #   • when >1 file still matches, narrow to those that actually look like a
  #     preload (contextBridge / webFrame / electron/renderer). Still not
  #     exactly one ⇒ abort listing everything.
  local skip_hosts=" directMcpHost.js nodeHost.js shellPathWorker.js transcriptSearchWorker.js "
  local preload="" names="" count=0 pre_only="" pre_count=0 f base
  for f in "$build_dir"/*.js; do
    [ -f "$f" ] || continue
    base="$(basename "$f")"
    [ "$base" = "$main_base" ] && continue
    case "$skip_hosts" in *" $base "*) log "skipping $base (Node host/worker, no DOM)"; continue ;; esac
    LC_ALL=C grep -q 'claude\.ai' "$f" || continue
    preload="$f"; names="${names:+$names, }$base"; count=$((count + 1))
    if LC_ALL=C grep -qE 'contextBridge|webFrame|electron/renderer' "$f"; then
      pre_only="$f"; pre_count=$((pre_count + 1))
    fi
  done
  if [ "$count" -eq 0 ]; then
    die "no preload referencing claude.ai found in .vite/build/ (main entry $main_base excluded) — layout changed; aborting."
  elif [ "$count" -gt 1 ]; then
    if [ "$pre_count" -eq 1 ]; then
      preload="$pre_only"
      log "several files mention claude.ai ($names); only $(basename "$preload") is a preload"
    else
      warn "ambiguous preload candidates (excluding main entry $main_base): $names"
      die "refusing to guess which file is the claude.ai preload — aborting."
    fi
  fi
  ok "preload: $(basename "$preload")   (main entry excluded: $main_base)"

  # 4. Build the prelude: stylesheet (+ Vazirmatn as a base64 data: URI) and
  # the app's own allowed-origin list, both baked in at patch time.
  log "building payload (CSS + data-URI font + origin list) …"
  local font_b64 css_b64 origins origins_js=""
  font_b64="$(base64 < "$FONT_SRC" | tr -d '\n')"
  css_b64="$( {
      printf "@font-face{font-family:'Vazirmatn RTLX';font-style:normal;font-weight:100 900;font-display:swap;src:url(data:font/woff2;base64,%s) format('woff2');}\n" "$font_b64"
      cat "$STYLES_SRC"
    } | base64 | tr -d '\n')"
  # B6: extract the exact origins the bundle itself whitelists (paths can't
  # match — '/' is excluded); the driver keeps a regex fallback if this is empty.
  origins="$(LC_ALL=C grep -ohE 'https://[A-Za-z0-9.-]*claude\.(ai|com)' "$preload" 2>/dev/null | sort -u || true)"
  while IFS= read -r o; do
    [ -n "$o" ] || continue
    origins_js="${origins_js:+$origins_js,}\"$o\""
  done <<< "$origins"
  {
    printf ';globalThis.__RTLX_DESKTOP__ = {\n'
    printf '  cssB64: "%s",\n' "$css_b64"
    printf '  origins: [%s]\n' "$origins_js"
    printf '};\n'
  } > "$TMP_DIR/prelude.js"

  # 5+6. Strip any previous block, then APPEND (never prepend — A4) the new one.
  strip_patch "$preload"
  local old_bytes; old_bytes=$(wc -c < "$preload")
  if [ -s "$preload" ] && [ -n "$(tail -c1 "$preload")" ]; then printf '\n' >> "$preload"; fi
  {
    printf '%s\n' "$BEGIN_MARK"
    cat "$TMP_DIR/prelude.js" "$MATH_SRC" "$ENGINE_SRC" "$DRIVER_SRC"
    printf '%s\n' "$END_MARK"
  } >> "$preload"

  # 7 (B7): a syntax error here would brick app startup — verify, then
  # 8 (B8): appending can only grow the file; smaller means a torn write.
  node --check "$preload" || die "injected $(basename "$preload") fails node --check — aborting before repack."
  local new_bytes; new_bytes=$(wc -c < "$preload")
  [ "$new_bytes" -ge "$old_bytes" ] || die "patched preload ($new_bytes B) smaller than original ($old_bytes B) — torn write; aborting."
  ok "payload appended ($(basename "$preload")): $old_bytes B → $new_bytes B, node --check passed"

  # 9 (B3): repack WITH the native-module unpack glob; the existing
  # app.asar.unpacked/ directory is left untouched (same file set).
  log "repacking app.asar (unpack glob: $UNPACK_GLOB) …"
  asar_cmd pack "$TMP_DIR/app" "$TMP_DIR/app.asar.new" --unpack "$UNPACK_GLOB"

  # 9b. Structural validation BEFORE the new archive replaces the good one:
  # its header must parse and its file list must match the original's exactly.
  # A silently dropped file (or a native module swallowed by a lost unpack
  # glob) shows up here as a diff instead of as a broken app at launch.
  asar_cmd list "$TMP_DIR/app.asar.new" > "$TMP_DIR/list.new" 2>/dev/null \
    || die "the repacked app.asar does not parse — aborting before it replaces the good one."
  asar_cmd list "$st_asar" > "$TMP_DIR/list.old" 2>/dev/null || true
  if [ -s "$TMP_DIR/list.old" ] && ! diff -q "$TMP_DIR/list.old" "$TMP_DIR/list.new" >/dev/null; then
    warn "file list differs between the original and the repacked asar:"
    diff "$TMP_DIR/list.old" "$TMP_DIR/list.new" | head -20 | while IFS= read -r l; do warn "  $l"; done
    die "repack changed the archive's file set — aborting."
  fi
  cp "$TMP_DIR/app.asar.new" "$st_asar"
  ok "repacked and validated ($(wc -l < "$TMP_DIR/list.new" | tr -d ' ') entries, file list unchanged)"

  # 10 (A1): recompute ElectronAsarIntegrity from the new HEADER STRING.
  if [ -n "$(plist_get "$st_plist" "ElectronAsarIntegrity:Resources/app.asar:hash")" ]; then
    local new_hash; new_hash="$(header_hash "$st_asar")"
    /usr/libexec/PlistBuddy -c "Set :ElectronAsarIntegrity:Resources/app.asar:hash $new_hash" "$st_plist" \
      || die "PlistBuddy failed to set the ElectronAsarIntegrity hash."
    # Read it back: a silent PlistBuddy no-op here means the app refuses to
    # start, and the failure would only surface at launch time.
    [ "$(plist_get "$st_plist" "ElectronAsarIntegrity:Resources/app.asar:hash")" = "$new_hash" ] \
      || die "ElectronAsarIntegrity hash did not persist to Info.plist — aborting."
    ok "ElectronAsarIntegrity updated + verified (SHA256 of the asar header string)"
  else
    # Documented fallback ONLY: key absent/moved → disable the integrity fuse.
    warn "ElectronAsarIntegrity key not found in Info.plist — falling back to disabling the integrity fuse."
    npx --yes @electron/fuses write --app "$STAGING" EnableEmbeddedAsarIntegrityValidation=off \
      || die "could not update integrity hash NOR disable the fuse — the app would not start; aborting."
  fi

  # 11+12 (B2+B1, option A): clear xattrs, then ad-hoc re-sign with the
  # original entitlements minus exactly the 3 team-id-coupled keys (they
  # reference Anthropic's team Q6L2SF6YDW; macOS rejects them under ad-hoc).
  # Everything else — especially com.apple.security.virtualization (Cowork) —
  # is preserved.
  if [ "${RTLX_SKIP_SIGN:-0}" = "1" ]; then
    warn "RTLX_SKIP_SIGN=1 — skipping xattr/codesign (test mode)."
  else
    log "re-signing (ad-hoc, entitlements preserved minus 3 team-coupled keys) …"
    xattr -cr "$STAGING" 2>/dev/null || true
    local ent="$TMP_DIR/entitlements.plist"
    if codesign -d --entitlements :- "$STAGING" > "$ent" 2>/dev/null && [ -s "$ent" ]; then
      /usr/libexec/PlistBuddy -c "Delete :com.apple.application-identifier"    "$ent" 2>/dev/null || true
      /usr/libexec/PlistBuddy -c "Delete :com.apple.developer.team-identifier" "$ent" 2>/dev/null || true
      /usr/libexec/PlistBuddy -c "Delete :keychain-access-groups"              "$ent" 2>/dev/null || true
      codesign --force --deep --sign - --entitlements "$ent" "$STAGING" 2>/dev/null \
        || die "codesign failed — the patched app would not launch."
    else
      # No entitlements to preserve (e.g. the synthetic test fixture).
      codesign --force --deep --sign - "$STAGING" 2>/dev/null \
        || die "codesign failed — the patched app would not launch."
    fi
    codesign --verify --deep --strict "$STAGING" 2>/dev/null \
      || die "codesign verification failed on the patched app."
    ok "ad-hoc signature applied and verified"
  fi

  # 13. Swap staging into place. Everything above succeeded, so this is the
  # only moment the user-visible app changes. The previous copy is moved
  # aside first and only deleted once the new one is in place, so a failing
  # rename leaves the old working copy rather than nothing.
  local old_side=""
  if [ -d "$PATCHED_APP" ]; then
    quit_patched
    old_side="$PATCHED_APP.old.$$"
    mv "$PATCHED_APP" "$old_side"
  fi
  if ! mv "$STAGING" "$PATCHED_APP"; then
    [ -n "$old_side" ] && mv "$old_side" "$PATCHED_APP" || true
    die "could not move the patched bundle into place — the previous copy was restored."
  fi
  STAGING=""   # now owned by the user; the EXIT trap must not delete it
  [ -n "$old_side" ] && rm -rf "$old_side" || true

  echo
  ok "installed: $PATCHED_APP"
  log "launch it from ~/Applications (shows as “Claude-RTL”). The original Claude.app is untouched."
  log "first launch may re-ask keychain/permissions once (signature changed — expected)."
  log "after every Claude Desktop update, re-run: $SELF_CMD"
}

# --- remove --------------------------------------------------------------------
remove_patch() {
  if [ ! -d "$PATCHED_APP" ]; then
    log "nothing to remove — no patched copy at $PATCHED_APP."
    return 0
  fi
  quit_patched
  rm -rf "$PATCHED_APP"
  ok "removed $PATCHED_APP (the original at $SOURCE_APP was never modified)."
}

# --- list ------------------------------------------------------------------------
list_status() {
  if [ -d "$SOURCE_APP" ]; then
    ok "original: $SOURCE_APP (v$(plist_get "$SOURCE_APP/Contents/Info.plist" CFBundleShortVersionString))"
  else
    warn "original: not found at $SOURCE_APP"
  fi
  if [ -d "$PATCHED_APP" ]; then
    local v marker="not patched"
    v="$(plist_get "$PATCHED_PLIST" CFBundleShortVersionString)"
    if [ -f "$PATCHED_ASAR" ] && LC_ALL=C grep -aq -- "RTL-PATCH (begin)" "$PATCHED_ASAR"; then
      marker="patched (RTL marker present)"
    fi
    ok "patched copy: $PATCHED_APP (v$v) — $marker"

    # Health check: the recorded integrity hash must match the asar actually
    # sitting next to it. A mismatch is the one failure mode that shows up as
    # "the app won't start" with no other symptom, so name it explicitly.
    local want have
    want="$(plist_get "$PATCHED_PLIST" "ElectronAsarIntegrity:Resources/app.asar:hash")"
    if [ -n "$want" ] && [ -f "$PATCHED_ASAR" ] && command -v node >/dev/null 2>&1; then
      have="$(header_hash "$PATCHED_ASAR" 2>/dev/null || true)"
      if [ "$want" = "$have" ]; then
        ok "  integrity: hash matches the asar header — the app should start"
      else
        warn "  integrity: MISMATCH (Info.plist $want vs asar ${have:-unreadable})"
        warn "  the app will refuse to start — re-run '$SELF_CMD' to rebuild the copy."
      fi
    fi
    if [ "$(plist_get "$PATCHED_APP/Contents/Info.plist" CFBundleShortVersionString)" != \
         "$(plist_get "$SOURCE_APP/Contents/Info.plist" CFBundleShortVersionString)" ] \
       && [ -d "$SOURCE_APP" ]; then
      warn "  the original has since been updated — re-run '$SELF_CMD' to refresh the copy."
    fi
  else
    log "patched copy: not installed ($PATCHED_APP)"
  fi
}

# --- main -----------------------------------------------------------------------
case "${1:-}" in
  --install|-i|"") install_patch ;;
  --remove|-r)     remove_patch ;;
  --list|-l)       list_status ;;
  *) echo "Usage: $0 [--install | --remove | --list]"; exit 1 ;;
esac
