#!/usr/bin/env bash
# ============================================================================
# apply-rtl.sh — patch the OpenAI ChatGPT VS Code extension webview for RTL.
#
# The ChatGPT webview is sandboxed, so we patch its webview/index.html to load
# our own CSS + JS assets from webview/assets/. No modification to
# out/extension.js is required.
#
# Idempotent and fully reversible:
#   ./apply-rtl.sh            # install / re-apply (also after extension updates)
#   ./apply-rtl.sh --remove   # uninstall (restore original index.html)
#   ./apply-rtl.sh --list     # show which extension folders would be patched
#
# IMPORTANT: a ChatGPT extension UPDATE replaces these files and wipes the
# patch. Re-run this script after each update.
# ============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STYLES_SRC="$SCRIPT_DIR/assets/styles.css"
DRIVER_SRC="$SCRIPT_DIR/assets/driver.js"
FONT_SRC="$SCRIPT_DIR/assets/vazirmatn-chatgpt.woff2"

ASSET_STYLES="rtl-chatgpt-styles.css"
ASSET_DRIVER="rtl-chatgpt-driver.js"
ASSET_FONT="vazirmatn-chatgpt.woff2"

BEGIN_MARK="<!-- ==== RTL-PATCH (begin) ==== -->"
END_MARK="<!-- ==== RTL-PATCH (end) ==== -->"

MODE="install"
case "${1:-}" in
  --remove|-r) MODE="remove" ;;
  --list|-l)   MODE="list" ;;
  ""|--install|-i) MODE="install" ;;
  *) echo "Unknown option: $1"; echo "Use: --install | --remove | --list"; exit 1 ;;
esac

if [ "$MODE" = "install" ]; then
  for f in "$STYLES_SRC" "$DRIVER_SRC" "$FONT_SRC"; do
    [ -f "$f" ] || { echo "ERROR: required source file not found: $f"; echo "Run this script from inside the vscode-extension-chatgpt/ folder."; exit 1; }
  done
fi

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
    find "$r" -maxdepth 3 -type f -path "*openai.chatgpt*/webview/index.html" 2>/dev/null
  done
}

patch_one() {
  local html="$1"
  local dir; dir="$(dirname "$html")"
  local assets="$dir/assets"

  # Copy assets.
  mkdir -p "$assets"
  cp "$STYLES_SRC" "$assets/$ASSET_STYLES"
  cp "$DRIVER_SRC" "$assets/$ASSET_DRIVER"
  cp "$FONT_SRC" "$assets/$ASSET_FONT"

  # First strip any previous patch so the backup is the pristine HTML.
  python3 - "$html" "$BEGIN_MARK" "$END_MARK" <<'PY'
import sys
html_path, begin, end = sys.argv[1:4]
with open(html_path, 'r', encoding='utf-8') as f:
    text = f.read()
start = text.find(begin)
while start != -1:
    stop = text.find(end, start)
    if stop == -1:
        text = text[:start]
        break
    stop += len(end)
    while stop < len(text) and text[stop] == '\n':
        stop += 1
    text = text[:start] + text[stop:]
    start = text.find(begin)
with open(html_path, 'w', encoding='utf-8') as f:
    f.write(text)
PY

  # Backup the pristine file.
  cp "$html" "$html.rtl-backup"

  # Patch the HTML with a Python helper (handles multi-line insertion safely).
  python3 - "$html" "$BEGIN_MARK" "$END_MARK" "$ASSET_STYLES" "$ASSET_DRIVER" <<'PY'
import sys
html_path, begin, end, styles, driver = sys.argv[1:6]
with open(html_path, 'r', encoding='utf-8') as f:
    text = f.read()
block = f'{begin}\n<link rel="stylesheet" href="./assets/{styles}">\n<script src="./assets/{driver}"></script>\n{end}\n'
if '</head>' in text:
    text = text.replace('</head>', block + '</head>', 1)
else:
    text = text.rstrip() + '\n' + block
with open(html_path, 'w', encoding='utf-8') as f:
    f.write(text)
PY
  echo "  patched: $dir"
}

unpatch_one() {
  local html="$1"
  local dir; dir="$(dirname "$html")"
  local assets="$dir/assets"

  if [ -f "$html.rtl-backup" ]; then
    cp "$html.rtl-backup" "$html"
    rm -f "$html.rtl-backup"
  else
    python3 - "$html" "$BEGIN_MARK" "$END_MARK" <<'PY'
import sys
html_path, begin, end = sys.argv[1:4]
with open(html_path, 'r', encoding='utf-8') as f:
    text = f.read()
start = text.find(begin)
while start != -1:
    stop = text.find(end, start)
    if stop == -1:
        text = text[:start]
        break
    stop += len(end)
    while stop < len(text) and text[stop] == '\n':
        stop += 1
    text = text[:start] + text[stop:]
    start = text.find(begin)
with open(html_path, 'w', encoding='utf-8') as f:
    f.write(text)
PY
  fi

  rm -f "$assets/$ASSET_STYLES" "$assets/$ASSET_DRIVER" "$assets/$ASSET_FONT"
  echo "  unpatched: $dir"
}

main() {
  local found=0
  while IFS= read -r html; do
    [ -n "$html" ] || continue
    found=$((found+1))
    case "$MODE" in
      list)    echo "  $(dirname "$html")" ;;
      install) patch_one "$html" ;;
      remove)  unpatch_one "$html" ;;
    esac
  done < <(find_targets)

  if [ "$found" -eq 0 ]; then
    echo "No OpenAI ChatGPT extension found (looked in ~/.vscode, ~/.cursor, ~/.windsurf …)."
    echo "Install the 'ChatGPT' VS Code extension first, then re-run."
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
