#!/usr/bin/env bash
# ============================================================================
# Synthetic Claude.app fixture — SOURCE this, don't run it.
#
# Shared by desktop-app/tests/apply-rtl.test.sh and cli/tests/cli.test.js so a
# test never has to point at the real /Applications/Claude.app. The fixture is
# a genuine .app + asar: a real Mach-O executable (so codesign actually runs),
# an Info.plist carrying ElectronAsarIntegrity, and a .vite/build layout that
# reproduces the traps the patcher has to handle.
#
#   source "<repo>/desktop-app/tests/fixture.sh"
#   rtlx_fixture_init "$test_root"     # writes $test_root/appsrc, sets FIXTURE_*
#   rtlx_build_fixture                 # (re)packs appsrc into $FIXTURE_APP
#
# After init:  FIXTURE_APPSRC (editable source tree), FIXTURE_APP (the .app).
# Edit files under $FIXTURE_APPSRC and call rtlx_build_fixture again to test a
# different app layout.
# ============================================================================

# Same algorithm as the patcher (offset 12 → 4-byte LE length → SHA256 of the
# UTF-8 JSON header string) — an INDEPENDENT copy on purpose: if the patcher's
# own implementation drifts, the test must notice instead of agreeing with it.
rtlx_hash_of() {
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

rtlx_fixture_init() { # $1 = a temp root the caller owns
  FIXTURE_ROOT="$1"
  FIXTURE_APPSRC="$FIXTURE_ROOT/appsrc"
  FIXTURE_APP="$FIXTURE_ROOT/Claude.app"
  mkdir -p "$FIXTURE_APPSRC/.vite/build"
  printf '{"name":"fixture","main":".vite/build/index.pre.js"}\n' > "$FIXTURE_APPSRC/package.json"
  # The MAIN entry also mentions claude.ai — the patcher must exclude it by the
  # package.json "main" basename, never by content (black-screen guard).
  printf 'console.log("main boot", "https://claude.ai");\n' > "$FIXTURE_APPSRC/.vite/build/index.pre.js"
  # The preload; single line WITHOUT a trailing newline, like real vite bundles.
  printf 'const A="https://claude.ai";const B="https://preview.claude.ai";console.log(A,B);' > "$FIXTURE_APPSRC/.vite/build/mainView.js"
  printf 'console.log("worker");\n' > "$FIXTURE_APPSRC/.vite/build/other.js"
  # A Node MCP host that MENTIONS claude.ai but has no DOM: it must be skipped by
  # name, not treated as a rival preload candidate.
  printf 'console.log("mcp host for https://claude.ai");\n' > "$FIXTURE_APPSRC/.vite/build/directMcpHost.js"
  # Native-module stand-ins that must stay OUTSIDE the packed asar (unpack glob).
  printf 'FAKE-NATIVE-NODE\n'   > "$FIXTURE_APPSRC/.vite/build/addon.node"
  printf 'FAKE-DYLIB\n'         > "$FIXTURE_APPSRC/.vite/build/lib.dylib"
  printf 'FAKE-SPAWN-HELPER\n'  > "$FIXTURE_APPSRC/spawn-helper"
}

rtlx_build_fixture() { # (re)pack appsrc into a fresh synthetic Claude.app
  rm -rf "$FIXTURE_APP" "$FIXTURE_ROOT/pack.asar" "$FIXTURE_ROOT/pack.asar.unpacked"
  mkdir -p "$FIXTURE_APP/Contents/MacOS" "$FIXTURE_APP/Contents/Resources"
  cp /bin/ls "$FIXTURE_APP/Contents/MacOS/Claude" # a real Mach-O so codesign works
  npx --yes @electron/asar pack "$FIXTURE_APPSRC" "$FIXTURE_ROOT/pack.asar" --unpack "{*.node,*.dylib,spawn-helper}"
  cp "$FIXTURE_ROOT/pack.asar" "$FIXTURE_APP/Contents/Resources/app.asar"
  cp -R "$FIXTURE_ROOT/pack.asar.unpacked" "$FIXTURE_APP/Contents/Resources/app.asar.unpacked"
  local h; h="$(rtlx_hash_of "$FIXTURE_APP/Contents/Resources/app.asar")"
  cat > "$FIXTURE_APP/Contents/Info.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>CFBundleExecutable</key><string>Claude</string>
	<key>CFBundleIdentifier</key><string>com.test.claude.fixture</string>
	<key>CFBundlePackageType</key><string>APPL</string>
	<key>CFBundleShortVersionString</key><string>9.9.9</string>
	<key>ElectronAsarIntegrity</key>
	<dict>
		<key>Resources/app.asar</key>
		<dict>
			<key>algorithm</key><string>SHA256</string>
			<key>hash</key><string>$h</string>
		</dict>
	</dict>
</dict>
</plist>
EOF
}
