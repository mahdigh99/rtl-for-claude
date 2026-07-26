#!/usr/bin/env bash
# ============================================================================
# apply-rtl.sh — patch the OpenAI Codex VS Code extension webview for RTL.
#
# The Codex webview is sandboxed, so we patch its webview/index.html to load
# our own CSS + JS assets from webview/assets/. No modification to
# out/extension.js is required.
#
# Idempotent and fully reversible:
#   ./apply-rtl.sh            # install / re-apply (also after extension updates)
#   ./apply-rtl.sh --remove   # uninstall (restore original index.html)
#   ./apply-rtl.sh --list     # show which extension folders would be patched
#
# IMPORTANT: a Codex extension UPDATE replaces these files and wipes the
# patch. Re-run this script after each update.
# ============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STYLES_SRC="$SCRIPT_DIR/assets/styles.css"
MATH_SRC="$SCRIPT_DIR/assets/rtl-math.js"   # loaded BEFORE the driver (RTLXMath global)
DRIVER_SRC="$SCRIPT_DIR/assets/driver.js"
FONT_SRC="$SCRIPT_DIR/assets/vazirmatn-codex.woff2"

ASSET_STYLES="rtl-codex-styles.css"
ASSET_MATH="rtl-codex-math.js"
ASSET_DRIVER="rtl-codex-driver.js"
ASSET_FONT="vazirmatn-codex.woff2"

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
  for f in "$STYLES_SRC" "$MATH_SRC" "$DRIVER_SRC" "$FONT_SRC"; do
    [ -f "$f" ] || { echo "ERROR: required source file not found: $f"; echo "Run this script from inside the vscode-extension-codex/ folder."; exit 1; }
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
    find "$r" -maxdepth 3 -type f -path "*/openai.chatgpt-*/webview/index.html" 2>/dev/null
  done
}

# Remove any previous marked patch block from the HTML, in place. Scans the
# whole file as one string (not line-by-line) because the bundled index.html
# may be minified onto a single line.
strip_html_patch() {
  local html="$1"
  local endnl=1
  [ -z "$(tail -c 1 "$html")" ] || endnl=0  # 0 = no trailing newline, keep it that way
  awk -v b="$BEGIN_MARK" -v e="$END_MARK" -v endnl="$endnl" '
    { txt = txt $0 "\n" }
    END {
      while ((i = index(txt, b)) > 0) {
        rest = substr(txt, i)
        j = index(rest, e)
        if (j == 0) break
        tail = substr(rest, j + length(e))
        while (substr(tail, 1, 1) == "\n") tail = substr(tail, 2)
        txt = substr(txt, 1, i - 1) tail
      }
      if (!endnl) sub(/\n$/, "", txt)
      printf "%s", txt
    }
  ' "$html" > "$html.tmp" && mv "$html.tmp" "$html"
}

# Insert the marked <link> + <script> block before </head>, in place
# (appended at the end if the file has no </head>).
inject_html_patch() {
  local html="$1"
  local endnl=1
  [ -z "$(tail -c 1 "$html")" ] || endnl=0
  awk -v b="$BEGIN_MARK" -v e="$END_MARK" -v styles="$ASSET_STYLES" -v mathjs="$ASSET_MATH" -v driver="$ASSET_DRIVER" -v endnl="$endnl" '
    { txt = txt $0 "\n" }
    END {
      block = b "\n<link rel=\"stylesheet\" href=\"./assets/" styles "\">\n<script src=\"./assets/" mathjs "\"></script>\n<script src=\"./assets/" driver "\"></script>\n" e "\n"
      i = index(txt, "</head>")
      if (i > 0) {
        txt = substr(txt, 1, i - 1) block substr(txt, i)
        if (!endnl) sub(/\n$/, "", txt)
      } else {
        sub(/\n+$/, "", txt)
        txt = txt "\n" block
      }
      printf "%s", txt
    }
  ' "$html" > "$html.tmp" && mv "$html.tmp" "$html"
}

patch_one() {
  local html="$1"
  local dir; dir="$(dirname "$html")"
  local assets="$dir/assets"

  # Copy assets.
  mkdir -p "$assets"
  cp "$STYLES_SRC" "$assets/$ASSET_STYLES"
  cp "$MATH_SRC" "$assets/$ASSET_MATH"
  cp "$DRIVER_SRC" "$assets/$ASSET_DRIVER"
  cp "$FONT_SRC" "$assets/$ASSET_FONT"

  # First strip any previous patch so the backup is the pristine HTML.
  strip_html_patch "$html"

  # Backup the pristine file.
  cp "$html" "$html.rtl-backup"

  inject_html_patch "$html"
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
    strip_html_patch "$html"
  fi

  rm -f "$assets/$ASSET_STYLES" "$assets/$ASSET_MATH" "$assets/$ASSET_DRIVER" "$assets/$ASSET_FONT"
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
    echo "No OpenAI Codex extension found (looked in ~/.vscode, ~/.cursor, ~/.windsurf …)."
    echo "Install the 'Codex' VS Code extension first, then re-run."
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
