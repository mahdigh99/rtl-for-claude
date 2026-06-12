#!/usr/bin/env bash
# ============================================================================
# apply-rtl.sh — patch the Claude Code VS Code webview for Persian RTL + font.
#
# The Claude chat is a sandboxed webview; no extension can reach inside it,
# so the only working, fork-free fix is to patch the extension's own on-disk
# files. We patch TWO files in each webview folder:
#   • index.css  ← Vazirmatn font + RTL/code styles   (assets/styles.css)
#   • index.js   ← RTL detection engine + driver      (assets/engine.js + driver.js)
# This is the no-install path (default settings). For a settings UI + auto-
# reapply after Claude updates, install the companion extension (same folder).
#
# Idempotent and fully reversible:
#   ./apply-rtl.sh            # install / re-apply (also after Claude updates)
#   ./apply-rtl.sh --remove   # uninstall (restore original look)
#   ./apply-rtl.sh --list     # just show which webview folders would be patched
#
# IMPORTANT: a Claude Code UPDATE replaces these files and wipes the patch.
# Re-run this script after each update. (See README for an auto-reapply hook.)
# ============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STYLES_SRC="$SCRIPT_DIR/assets/styles.css"     # injected into index.css
DRIVER_SRC="$SCRIPT_DIR/assets/driver.js"      # injected into index.js (self-contained)
# Static regular woff2 (small, universally fine for a webview).
FONT_SRC="$SCRIPT_DIR/assets/Vazirmatn-Regular.woff2"
FONT_DEST_NAME="vazirmatn.woff2"

BEGIN_MARK="/* ==== RTL-PATCH (begin) ==== */"
END_MARK="/* ==== RTL-PATCH (end) ==== */"

MODE="install"
case "${1:-}" in
  --remove|-r) MODE="remove" ;;
  --list|-l)   MODE="list" ;;
  ""|--install|-i) MODE="install" ;;
  *) echo "Unknown option: $1"; echo "Use: --install | --remove | --list"; exit 1 ;;
esac

# Fail early and clearly if our own source files are missing/misplaced.
if [ "$MODE" = "install" ]; then
  for f in "$STYLES_SRC" "$DRIVER_SRC" "$FONT_SRC"; do
    [ -f "$f" ] || { echo "ERROR: required source file not found: $f"; echo "Run this script from inside the vscode-extension/ folder."; exit 1; }
  done
fi

# Discover every installed Claude Code webview folder across VS Code, VS Code
# Insiders, Cursor and Windsurf (by locating each index.css).
find_targets() {
  local roots=(
    "$HOME/.vscode/extensions"
    "$HOME/.vscode-insiders/extensions"
    "$HOME/.cursor/extensions"
    "$HOME/.windsurf/extensions"
    "$HOME/.vscode-server/extensions"
  )
  for r in "${roots[@]}"; do
    [ -d "$r" ] || continue
    find "$r" -maxdepth 3 -type f -path "*anthropic.claude-code*/webview/index.css" 2>/dev/null
  done
}

strip_patch() { # remove our marked block from a file, in place
  local f="$1"
  awk -v b="$BEGIN_MARK" -v e="$END_MARK" '
    $0==b {skip=1}
    skip==0 {print}
    $0==e {skip=0}
  ' "$f" > "$f.tmp" && mv "$f.tmp" "$f"
}

append_block() { # append BEGIN + <one or more sources> + END, no blank-line buildup
  local target="$1"; shift
  [ -f "$target" ] || return 0
  # one-time pristine backup
  [ -f "$target.rtl-backup" ] || cp "$target" "$target.rtl-backup"
  # strip any previous version of our block first (idempotent)
  if grep -qF "$BEGIN_MARK" "$target"; then strip_patch "$target"; fi
  # ensure exactly one trailing newline so our block starts on its own line
  if [ -s "$target" ] && [ -n "$(tail -c1 "$target")" ]; then printf '\n' >> "$target"; fi
  {
    printf '%s\n' "$BEGIN_MARK"
    cat "$@"
    printf '%s\n' "$END_MARK"
  } >> "$target"
}

patch_one() { # $1 = path to index.css
  local css="$1"
  local dir; dir="$(dirname "$css")"
  local js="$dir/index.js"

  append_block "$css" "$STYLES_SRC"
  cp "$FONT_SRC" "$dir/$FONT_DEST_NAME"
  if [ -f "$js" ]; then
    append_block "$js" "$DRIVER_SRC"
    echo "  patched: $dir (index.css + index.js)"
  else
    echo "  patched CSS only (index.js not found): $css"
  fi
}

unpatch_one() { # $1 = path to index.css
  local css="$1"
  local dir; dir="$(dirname "$css")"
  local js="$dir/index.js"
  local n=0
  if grep -qF "$BEGIN_MARK" "$css"; then strip_patch "$css"; n=$((n+1)); fi
  if [ -f "$js" ] && grep -qF "$BEGIN_MARK" "$js"; then strip_patch "$js"; n=$((n+1)); fi
  rm -f "$dir/$FONT_DEST_NAME" "$css.rtl-backup" "$js.rtl-backup"
  if [ "$n" -gt 0 ]; then echo "  unpatched: $dir"; else echo "  (no patch present): $dir"; fi
}

main() {
  local found=0
  while IFS= read -r css; do
    [ -n "$css" ] || continue
    found=$((found+1))
    case "$MODE" in
      list)    echo "  $(dirname "$css")" ;;
      install) patch_one "$css" ;;
      remove)  unpatch_one "$css" ;;
    esac
  done < <(find_targets)

  if [ "$found" -eq 0 ]; then
    echo "No Claude Code extension found (looked in ~/.vscode, ~/.cursor, ~/.windsurf …)."
    echo "Install the 'Claude Code' VS Code extension first, then re-run."
    exit 1
  fi

  echo
  case "$MODE" in
    install) echo "Done ($found webview folder(s)). Now run 'Developer: Reload Window' in VS Code (Cmd/Ctrl+Shift+P)." ;;
    remove)  echo "Removed from $found folder(s). Reload the VS Code window to see the original look." ;;
    list)    echo "$found webview folder(s) would be patched." ;;
  esac
}

main
