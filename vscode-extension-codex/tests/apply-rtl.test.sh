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

# A minified single-line index.html without a trailing newline, like real bundles.
webview_min="$HOME/.vscode/extensions/openai.chatgpt-min/webview"
mkdir -p "$webview_min"
printf '<!doctype html><html><head><title>Codex</title><script src="./assets/a.js"></script></head><body><div id="root"></div></body></html>' > "$webview_min/index.html"
cp "$webview_min/index.html" "$test_root/original-min.html"

list_output="$(bash "$PATCHER" --list)"
[[ "$list_output" == *"$webview"* ]]
[[ "$list_output" == *"$webview_min"* ]]

bash "$PATCHER" --install >/dev/null
[[ "$(grep -c 'RTL-PATCH (begin)' "$webview/index.html")" -eq 1 ]]
[[ -f "$assets/rtl-codex-styles.css" ]]
[[ -f "$assets/rtl-codex-driver.js" ]]
[[ -f "$assets/vazirmatn-codex.woff2" ]]
[[ -f "$webview/index.html.rtl-backup" ]]
cmp -s "$test_root/original.html" "$webview/index.html.rtl-backup"

[[ "$(grep -c 'RTL-PATCH (begin)' "$webview_min/index.html")" -eq 1 ]]
cmp -s "$test_root/original-min.html" "$webview_min/index.html.rtl-backup"

bash "$PATCHER" --install >/dev/null
[[ "$(grep -c 'RTL-PATCH (begin)' "$webview/index.html")" -eq 1 ]]
[[ "$(grep -c 'RTL-PATCH (begin)' "$webview_min/index.html")" -eq 1 ]]
cmp -s "$test_root/original.html" "$webview/index.html.rtl-backup"
cmp -s "$test_root/original-min.html" "$webview_min/index.html.rtl-backup"

bash "$PATCHER" --remove >/dev/null
cmp -s "$test_root/original.html" "$webview/index.html"
cmp -s "$test_root/original-min.html" "$webview_min/index.html"
[[ ! -e "$webview/index.html.rtl-backup" ]]
[[ ! -e "$assets/rtl-codex-styles.css" ]]
[[ ! -e "$assets/rtl-codex-driver.js" ]]
[[ ! -e "$assets/vazirmatn-codex.woff2" ]]

bash "$PATCHER" --install >/dev/null
rm "$webview/index.html.rtl-backup"
bash "$PATCHER" --remove >/dev/null
cmp -s "$test_root/original.html" "$webview/index.html"

printf 'PASS: Codex RTL patch lifecycle\n'
