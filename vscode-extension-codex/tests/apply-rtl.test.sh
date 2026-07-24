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
[[ -f "$assets/rtl-chatgpt-styles.css" ]]
[[ -f "$assets/rtl-chatgpt-driver.js" ]]
[[ -f "$assets/vazirmatn-chatgpt.woff2" ]]
[[ -f "$webview/index.html.rtl-backup" ]]
cmp -s "$test_root/original.html" "$webview/index.html.rtl-backup"

bash "$PATCHER" --install >/dev/null
[[ "$(grep -c 'RTL-PATCH (begin)' "$webview/index.html")" -eq 1 ]]
cmp -s "$test_root/original.html" "$webview/index.html.rtl-backup"

bash "$PATCHER" --remove >/dev/null
cmp -s "$test_root/original.html" "$webview/index.html"
[[ ! -e "$webview/index.html.rtl-backup" ]]
[[ ! -e "$assets/rtl-chatgpt-styles.css" ]]
[[ ! -e "$assets/rtl-chatgpt-driver.js" ]]
[[ ! -e "$assets/vazirmatn-chatgpt.woff2" ]]

printf 'PASS: Codex RTL patch lifecycle\n'
