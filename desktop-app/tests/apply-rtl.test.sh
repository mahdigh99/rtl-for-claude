#!/usr/bin/env bash
# ============================================================================
# Lifecycle test for desktop-app/apply-rtl.sh — runs ONLY against a synthetic
# .app + asar fixture built in a temp dir (mirrors vscode-extension-codex/
# tests/apply-rtl.test.sh). It must NEVER touch /Applications/Claude.app.
#
# Covered: --list states, --install (marker count 1, main-entry never touched,
# correct header-string integrity hash, native files stay unpacked & intact,
# data-URI font + extracted origins present, node --check, ad-hoc codesign),
# idempotent re-install, --remove (original byte-for-byte untouched),
# ambiguous-preload abort, multi-preload new layout, zero-candidate abort.
# ============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PATCHER="$SCRIPT_DIR/../apply-rtl.sh"

test_root="$(mktemp -d)"
trap 'rm -rf "$test_root"' EXIT

fail() { echo "FAIL: $1" >&2; exit 1; }

# The synthetic .app + asar fixture lives in fixture.sh so cli/tests can build
# the identical thing without duplicating it (or reaching for the real app).
. "$SCRIPT_DIR/fixture.sh"
rtlx_fixture_init "$test_root"
appsrc="$FIXTURE_APPSRC"
SOURCE_APP="$FIXTURE_APP"
build_fixture() { rtlx_build_fixture; }
hash_of() { rtlx_hash_of "$1"; }

build_fixture
cp "$SOURCE_APP/Contents/Resources/app.asar" "$test_root/original.asar"
cp "$SOURCE_APP/Contents/Info.plist"         "$test_root/original.plist"
orig_hash="$(hash_of "$test_root/original.asar")"

export RTLX_SOURCE_APP="$SOURCE_APP"
export RTLX_PATCHED_APP="$test_root/Claude-RTL.app"
PATCHED="$RTLX_PATCHED_APP"
PASAR="$PATCHED/Contents/Resources/app.asar"
PPLIST="$PATCHED/Contents/Info.plist"

# --- 1. --list on a clean fixture ---------------------------------------------
out="$(bash "$PATCHER" --list)"
[[ "$out" == *"9.9.9"* ]]           || fail "--list should report the original version"
[[ "$out" == *"not installed"* ]]   || fail "--list should say the patched copy is not installed"

# --- 2. --install ----------------------------------------------------------------
bash "$PATCHER" --install >/dev/null
[ -d "$PATCHED" ] || fail "patched copy was not created"

npx --yes @electron/asar extract "$PASAR" "$test_root/x1"
mv="$test_root/x1/.vite/build/mainView.js"
[ "$(grep -c 'RTL-PATCH (begin)' "$mv")" -eq 1 ]      || fail "expected exactly 1 marker block in mainView.js"
grep -q 'RTL-PATCH (end)' "$mv"                        || fail "end marker missing"
# Payload contents: prelude + math + engine + driver, font, extracted origins.
grep -q '__RTLX_DESKTOP__' "$mv"                       || fail "prelude missing"
# The stylesheet itself ships base64-encoded in cssB64 — decode it and verify
# it carries the @font-face with the woff2 data: URI plus our own rules.
node -e '
  const fs = require("fs");
  const src = fs.readFileSync(process.argv[1], "utf8");
  const m = src.match(/cssB64: "([A-Za-z0-9+\/=]+)"/);
  if (!m) { console.error("cssB64 missing"); process.exit(1); }
  const css = Buffer.from(m[1], "base64").toString("utf8");
  for (const needle of ["@font-face", "data:font/woff2;base64,", "Vazirmatn RTLX", "rtlx-global-toggle", "data-rtlx-island"])
    if (!css.includes(needle)) { console.error("decoded CSS lacks: " + needle); process.exit(1); }
' "$mv"                                                || fail "decoded cssB64 lacks the font/CSS payload"
grep -q '"https://preview.claude.ai"' "$mv"            || fail "origin list not extracted from the bundle"
grep -q 'RTLXMath' "$mv"                               || fail "rtl-math.js missing"
grep -q 'global.RTLX' "$mv"                            || fail "rtl-engine.js missing"
grep -q '__rtlxDesktop' "$mv"                          || fail "driver.js missing"
node --check "$mv"                                     || fail "patched mainView.js fails node --check"
# The Electron MAIN entry (also mentions claude.ai) must be byte-identical.
cmp -s "$appsrc/.vite/build/index.pre.js" "$test_root/x1/.vite/build/index.pre.js" \
                                                       || fail "main entry was modified (black-screen risk)"
cmp -s "$appsrc/.vite/build/other.js" "$test_root/x1/.vite/build/other.js" \
                                                       || fail "unrelated bundle file was modified"
# The Node MCP host mentions claude.ai but must be skipped by name, untouched.
cmp -s "$appsrc/.vite/build/directMcpHost.js" "$test_root/x1/.vite/build/directMcpHost.js" \
                                                       || fail "directMcpHost.js was injected into (MCP startup risk)"
# Native files: NOT inside the packed asar, present + intact in app.asar.unpacked.
LC_ALL=C grep -aq 'FAKE-NATIVE-NODE' "$PASAR" && fail "addon.node got packed INSIDE the asar (unpack glob lost)"
cmp -s "$appsrc/.vite/build/addon.node" "$PATCHED/Contents/Resources/app.asar.unpacked/.vite/build/addon.node" \
                                                       || fail "addon.node missing/altered in app.asar.unpacked"
cmp -s "$appsrc/spawn-helper" "$PATCHED/Contents/Resources/app.asar.unpacked/spawn-helper" \
                                                       || fail "spawn-helper missing/altered in app.asar.unpacked"
# Integrity: plist hash == SHA256(header string) of the NEW asar, != original.
new_hash="$(/usr/libexec/PlistBuddy -c 'Print :ElectronAsarIntegrity:Resources/app.asar:hash' "$PPLIST")"
[ "$new_hash" = "$(hash_of "$PASAR")" ]                || fail "plist hash != recomputed header-string hash"
[ "$new_hash" != "$orig_hash" ]                        || fail "plist hash was not updated"
# Cosmetic rename + ad-hoc signature.
[ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleDisplayName' "$PPLIST")" = "Claude-RTL" ] \
                                                       || fail "CFBundleDisplayName not set"
codesign --verify --deep --strict "$PATCHED" 2>/dev/null || fail "patched app is not validly (ad-hoc) signed"
# Original fixture untouched by install.
cmp -s "$test_root/original.asar"  "$SOURCE_APP/Contents/Resources/app.asar" || fail "--install modified the ORIGINAL asar"
cmp -s "$test_root/original.plist" "$SOURCE_APP/Contents/Info.plist"         || fail "--install modified the ORIGINAL Info.plist"

out="$(bash "$PATCHER" --list)"
[[ "$out" == *"patched (RTL marker present)"* ]] || fail "--list should detect the marker in the patched asar"

# --- 3. idempotent re-install ---------------------------------------------------
bash "$PATCHER" --install >/dev/null
rm -rf "$test_root/x2"; npx --yes @electron/asar extract "$PASAR" "$test_root/x2"
[ "$(grep -c 'RTL-PATCH (begin)' "$test_root/x2/.vite/build/mainView.js")" -eq 1 ] \
  || fail "re-install must still yield exactly 1 marker block"

# --- 4. --remove -------------------------------------------------------------------
bash "$PATCHER" --remove >/dev/null
[ ! -d "$PATCHED" ] || fail "--remove did not delete the patched copy"
cmp -s "$test_root/original.asar"  "$SOURCE_APP/Contents/Resources/app.asar" || fail "original asar changed"
cmp -s "$test_root/original.plist" "$SOURCE_APP/Contents/Info.plist"         || fail "original Info.plist changed"
bash "$PATCHER" --remove >/dev/null || fail "--remove on a clean state must succeed quietly"

# --- 4b. a FAILING install must not damage an existing good copy -----------------
bash "$PATCHER" --install >/dev/null            # a known-good copy exists
good_hash="$(/usr/libexec/PlistBuddy -c 'Print :ElectronAsarIntegrity:Resources/app.asar:hash' "$PPLIST")"
mv "$appsrc/.vite/build/mainView.js" "$test_root/mainView.hold"
printf 'console.log("no origin here");' > "$appsrc/.vite/build/mainView.js"
build_fixture                                    # source now has NO claude.ai preload
set +e; bash "$PATCHER" --install >/dev/null 2>&1; rc=$?; set -e
[ "$rc" -ne 0 ]     || fail "install should have failed with no preload candidate"
[ -d "$PATCHED" ]   || fail "a failed install destroyed the previously working copy"
[ "$(/usr/libexec/PlistBuddy -c 'Print :ElectronAsarIntegrity:Resources/app.asar:hash' "$PPLIST")" = "$good_hash" ] \
                    || fail "a failed install left a half-built copy behind"
# No staging/old scratch bundles may survive a failure.
[ -z "$(find "$(dirname "$PATCHED")" -maxdepth 1 -name '*.staging.*' -o -maxdepth 1 -name '*.old.*' 2>/dev/null)" ] \
                    || fail "staging/old leftovers remain after a failed install"
mv "$test_root/mainView.hold" "$appsrc/.vite/build/mainView.js"
build_fixture

# --- 4c. --list detects a broken (mismatched) integrity hash ---------------------
bash "$PATCHER" --install >/dev/null
out="$(bash "$PATCHER" --list)"
[[ "$out" == *"integrity: hash matches"* ]] || fail "--list should confirm a healthy integrity hash"
/usr/libexec/PlistBuddy -c "Set :ElectronAsarIntegrity:Resources/app.asar:hash deadbeef" "$PPLIST"
out="$(bash "$PATCHER" --list)"
[[ "$out" == *"MISMATCH"* ]]                 || fail "--list should flag a mismatched integrity hash"
bash "$PATCHER" --remove >/dev/null

# --- 4d. refuse to patch a bundle onto itself, or to re-patch a patched source ---
set +e; out="$(RTLX_PATCHED_APP="$SOURCE_APP" bash "$PATCHER" --install 2>&1)"; rc=$?; set -e
[ "$rc" -ne 0 ]                        || fail "source == target must abort"
[[ "$out" == *"same bundle"* ]]        || fail "source == target error message missing"
[ -f "$SOURCE_APP/Contents/Resources/app.asar" ] || fail "source == target guard let the source be deleted"
cmp -s "$test_root/original.asar" "$SOURCE_APP/Contents/Resources/app.asar" || fail "source asar was touched"

bash "$PATCHER" --install >/dev/null
set +e; out="$(RTLX_SOURCE_APP="$PATCHED" RTLX_PATCHED_APP="$test_root/Claude-RTL2.app" bash "$PATCHER" --install 2>&1)"; rc=$?; set -e
[ "$rc" -ne 0 ]                        || fail "patching an already-patched source must abort"
[[ "$out" == *"already RTL-patched"* ]] || fail "already-patched-source error message missing"
bash "$PATCHER" --remove >/dev/null

# --- 5. ambiguous preload → abort, no patched copy left --------------------------
printf 'console.log("worker", "https://claude.ai");\n' > "$appsrc/.vite/build/other.js"
build_fixture
set +e; out="$(bash "$PATCHER" --install 2>&1)"; rc=$?; set -e
[ "$rc" -ne 0 ]                    || fail "ambiguous candidates must abort with a non-zero exit"
[[ "$out" == *"ambiguous"* ]]      || fail "ambiguity error message missing"
[ ! -d "$PATCHED" ]                || fail "an aborted install left a patched copy behind"

# --- 5b. two claude.ai mentions but only ONE real preload → pick it, don't abort --
printf 'const w=require("electron/renderer");w.contextBridge;console.log("https://claude.ai");' \
  > "$appsrc/.vite/build/mainView.js"
build_fixture
bash "$PATCHER" --install >/dev/null || fail "should resolve to the single contextBridge preload"
rm -rf "$test_root/x5"; npx --yes @electron/asar extract "$PASAR" "$test_root/x5"
[ "$(grep -c 'RTL-PATCH (begin)' "$test_root/x5/.vite/build/mainView.js")" -eq 1 ] \
  || fail "the contextBridge preload should have been the injection target"
cmp -s "$appsrc/.vite/build/other.js" "$test_root/x5/.vite/build/other.js" \
  || fail "the non-preload claude.ai file must stay untouched"
bash "$PATCHER" --remove >/dev/null
printf 'const A="https://claude.ai";const B="https://preview.claude.ai";console.log(A,B);' > "$appsrc/.vite/build/mainView.js"
printf 'console.log("worker");\n' > "$appsrc/.vite/build/other.js"

# --- 5c. new layout (1.24012+): one preload per window → patch ALL of them --------
# Three window preloads referencing claude.ai, a renderer chunk that merely
# mentions it, and a local-only preload with no claude origin. Expected: the
# three window preloads get the payload, everything else stays byte-identical.
printf 'const {contextBridge}=require("electron/renderer");contextBridge;console.log("https://claude.ai");' > "$appsrc/.vite/build/mainView.js"
printf 'const {webFrame}=require("electron/renderer");webFrame;console.log("main window https://claude.ai");' > "$appsrc/.vite/build/mainWindow.js"
printf 'const {contextBridge}=require("electron/renderer");console.log("quick https://claude.ai");' > "$appsrc/.vite/build/quickWindow.js"
printf 'var chunk="https://claude.ai/chat";console.log(chunk);' > "$appsrc/.vite/build/index.chunk-AAAA1111.js"
printf 'const {contextBridge}=require("electron/renderer");console.log("local preview, no claude origin");' > "$appsrc/.vite/build/claudePagePreview.js"
build_fixture
bash "$PATCHER" --install >/dev/null || fail "multi-preload layout should install"
rm -rf "$test_root/x6"; npx --yes @electron/asar extract "$PASAR" "$test_root/x6"
for w in mainView mainWindow quickWindow; do
  [ "$(grep -c 'RTL-PATCH (begin)' "$test_root/x6/.vite/build/$w.js")" -eq 1 ] \
    || fail "window preload $w.js should carry exactly one marker block"
done
cmp -s "$appsrc/.vite/build/index.chunk-AAAA1111.js" "$test_root/x6/.vite/build/index.chunk-AAAA1111.js" \
  || fail "a renderer chunk mentioning claude.ai must stay untouched"
cmp -s "$appsrc/.vite/build/claudePagePreview.js" "$test_root/x6/.vite/build/claudePagePreview.js" \
  || fail "a preload without a claude origin must stay untouched"
cmp -s "$appsrc/.vite/build/index.pre.js" "$test_root/x6/.vite/build/index.pre.js" \
  || fail "the main entry must never be touched"
bash "$PATCHER" --remove >/dev/null
rm -f "$appsrc/.vite/build/mainWindow.js" "$appsrc/.vite/build/quickWindow.js" \
      "$appsrc/.vite/build/index.chunk-AAAA1111.js" "$appsrc/.vite/build/claudePagePreview.js"
printf 'const A="https://claude.ai";const B="https://preview.claude.ai";console.log(A,B);' > "$appsrc/.vite/build/mainView.js"
build_fixture

# --- 6. zero candidates → abort ---------------------------------------------------
printf 'console.log("plain preload");' > "$appsrc/.vite/build/mainView.js"
build_fixture
set +e; out="$(bash "$PATCHER" --install 2>&1)"; rc=$?; set -e
[ "$rc" -ne 0 ]                    || fail "zero candidates must abort with a non-zero exit"
[[ "$out" == *"no preload"* ]]     || fail "zero-candidate error message missing"

printf 'PASS: Claude Desktop RTL patcher lifecycle\n'
