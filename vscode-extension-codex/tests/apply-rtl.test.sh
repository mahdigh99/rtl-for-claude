#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PATCHER="$SCRIPT_DIR/../apply-rtl.sh"

test_root="$(mktemp -d)"
trap 'rm -rf "$test_root"' EXIT

export HOME="$test_root/home"
webview="$HOME/.vscode/extensions/openai.chatgpt-test/webview"
assets="$webview/assets"
mkdir -p "$assets"

printf '<html><head><title>Codex</title></head><body></body></html>\n' > "$webview/index.html"
cp "$webview/index.html" "$test_root/original.html"

list_output="$(bash "$PATCHER" --list)"
[[ "$list_output" == *"$webview"* ]]

bash "$PATCHER" --install >/dev/null
[[ "$(grep -c 'RTL-PATCH (begin)' "$webview/index.html")" -eq 1 ]]
[[ -f "$assets/rtl-codex-styles.css" ]]
[[ -f "$assets/rtl-codex-driver.js" ]]
[[ -f "$assets/vazirmatn-codex.woff2" ]]
[[ -f "$webview/index.html.rtl-backup" ]]
cmp -s "$test_root/original.html" "$webview/index.html.rtl-backup"

bash "$PATCHER" --install >/dev/null
[[ "$(grep -c 'RTL-PATCH (begin)' "$webview/index.html")" -eq 1 ]]
cmp -s "$test_root/original.html" "$webview/index.html.rtl-backup"

bash "$PATCHER" --remove >/dev/null
cmp -s "$test_root/original.html" "$webview/index.html"
[[ ! -e "$webview/index.html.rtl-backup" ]]
[[ ! -e "$assets/rtl-codex-styles.css" ]]
[[ ! -e "$assets/rtl-codex-driver.js" ]]
[[ ! -e "$assets/vazirmatn-codex.woff2" ]]

bash "$PATCHER" --install >/dev/null
rm "$webview/index.html.rtl-backup"
bash "$PATCHER" --remove >/dev/null
cmp -s "$test_root/original.html" "$webview/index.html"

printf 'PASS: Codex RTL patch lifecycle\n'
