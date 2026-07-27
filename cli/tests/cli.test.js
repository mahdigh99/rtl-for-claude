/* Lifecycle test for the `npx rtl-for-claude` installer.
 *
 * The point of this suite is that it tests the PUBLISHED artifact, not the
 * working tree: it runs `npm pack`, installs the tarball into a temp directory,
 * and drives the installed `rtl-for-claude` binary. A CLI that resolves its
 * scripts relative to a repo checkout passes every test in development and
 * fails for every real user; only packing catches that.
 *
 * The desktop install runs against the SYNTHETIC fixture from
 * desktop-app/tests/fixture.sh (via RTLX_SOURCE_APP / RTLX_PATCHED_APP), so the
 * real /Applications/Claude.app is never read or written. RTLX_SKIP_SIGN is NOT
 * set: signing a fixture is cheap and it is the step users hit first.
 *
 * Run: node cli/tests/cli.test.js
 */
"use strict";

const { execFileSync, spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const REPO = path.join(__dirname, "../..");
const doctor = require("../doctor");

let failed = 0;
let total = 0;
function ok(pass, label) {
  total++;
  if (!pass) failed++;
  console.log((pass ? "  ok   " : "  FAIL ") + label);
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), "rtlx-cli-"));
process.on("exit", () => fs.rmSync(root, { recursive: true, force: true }));

// --- 1. the packed tarball ---------------------------------------------------
// A broken `files` list is invisible until a user runs npx, so assert on the
// tarball's contents directly.
console.log("\n[package]");
const packOut = execFileSync("npm", ["pack", "--pack-destination", root, "--json"], {
  cwd: REPO,
  encoding: "utf8",
  stdio: ["ignore", "pipe", "ignore"],
});
const packed = JSON.parse(packOut)[0];
const files = packed.files.map((f) => f.path);
const tarball = path.join(root, packed.filename);

const MUST_SHIP = [
  "cli/index.js",
  "cli/doctor.js",
  "package.json",
  "README.md",
  "LICENSE",
  "desktop-app/apply-rtl.sh",
  "desktop-app/assets/driver.js",
  "desktop-app/assets/styles.css",
  // The desktop patcher reads the engine and the font from browser-extension/
  // at patch time — mirrored paths are the whole reason the scripts work
  // unchanged inside the package.
  "browser-extension/src/rtl-math.js",
  "browser-extension/src/rtl-engine.js",
  "browser-extension/fonts/Vazirmatn-VariableFont_wght.woff2",
  "vscode-extension/apply-rtl.sh",
  "vscode-extension/assets/driver.js",
  "vscode-extension/assets/rtl-math.js",
  "vscode-extension/assets/styles.css",
  "vscode-extension/assets/Vazirmatn-Regular.woff2",
  "vscode-extension-codex/apply-rtl.sh",
  "vscode-extension-codex/assets/driver.js",
  "vscode-extension-codex/assets/rtl-math.js",
  "vscode-extension-codex/assets/styles.css",
  "vscode-extension-codex/assets/vazirmatn-codex.woff2",
];
for (const f of MUST_SHIP) ok(files.indexOf(f) !== -1, "ships " + f);

const MUST_NOT_SHIP = [/^\.github\//, /tests?\//, /^docs\//, /\.vsix$/, /^icon\.png$/];
const strays = files.filter((f) => MUST_NOT_SHIP.some((re) => re.test(f)));
ok(strays.length === 0, "no test/CI/doc files packed" + (strays.length ? ": " + strays.join(", ") : ""));
ok(packed.size < 2 * 1024 * 1024, "tarball is " + Math.round(packed.size / 1024) + " KB (< 2 MB)");

// --- 2. install the tarball, as a user would ---------------------------------
const home = path.join(root, "home");
fs.mkdirSync(home);
execFileSync("npm", ["init", "-y"], { cwd: home, stdio: "ignore" });
execFileSync("npm", ["install", "--no-audit", "--no-fund", tarball], { cwd: home, stdio: "ignore" });
const BIN = path.join(home, "node_modules", ".bin", "rtl-for-claude");
ok(fs.existsSync(BIN), "the installed package exposes the rtl-for-claude binary");

function run(args, env) {
  return spawnSync(BIN, args, {
    encoding: "utf8",
    env: Object.assign({}, process.env, env || {}),
  });
}

console.log("\n[cli surface]");
let r = run(["--version"]);
ok(r.status === 0 && r.stdout.trim() === require(path.join(REPO, "package.json")).version,
  "--version prints the package version (" + r.stdout.trim() + ")");

r = run(["--help"]);
ok(r.status === 0 && /--desktop/.test(r.stdout) && /--doctor/.test(r.stdout), "--help lists the flags");

r = run(["--nonsense"]);
ok(r.status === 2, "an unknown flag exits 2 (got " + r.status + ")");
ok(/Unknown option/.test(r.stderr), "…and says which one");

// No TTY here, so the menu is impossible: it must explain itself, not hang.
r = run([]);
ok(r.status === 2 && /npx rtl-for-claude/.test(r.stdout), "no args + no terminal → usage, exit 2");

r = run(["--doctor"]);
ok(r.status === 0, "--doctor exits 0 on a healthy machine");
ok(/Node\.js/.test(r.stdout) && /Prerequisites/.test(r.stdout), "--doctor reports the checks");

// --- 3. preflight messages (stubbed environments) ----------------------------
// These are the paths a real non-technical user hits; they must be reachable in
// a test without uninstalling anything.
console.log("\n[preflight]");
const stub = (over) =>
  Object.assign(
    { platform: "darwin", has: () => true, exists: () => true, nodeVersion: "20.0.0", home: "/tmp/h" },
    over,
  );

let p = doctor.preflight("desktop", stub({ has: (c) => c !== "codesign" }));
ok(!p.ok && /xcode-select --install/.test(p.text), "missing Xcode CLT is named with its exact fix");

p = doctor.preflight("desktop", stub({ exists: () => false }));
ok(!p.ok && /claude\.ai\/download/.test(p.text), "missing Claude.app points at the download page");

p = doctor.preflight("desktop", stub({ platform: "win32" }));
ok(!p.ok && /macOS-only/.test(p.text), "the desktop patcher refuses non-macOS");

p = doctor.preflight("desktop", stub({ nodeVersion: "16.20.0" }));
ok(!p.ok && /nodejs\.org/.test(p.text), "an old Node is rejected with the download link");

p = doctor.preflight("claude-code", stub({ platform: "win32" }));
ok(!p.ok && /Marketplace/.test(p.text), "Windows is sent to the Marketplace, not to bash");

p = doctor.preflight("vscode-ext", stub({ has: () => false }));
ok(!p.ok && /Shell Command/.test(p.text), "a missing editor CLI explains how to add it");

ok(doctor.preflight("desktop", stub()).ok, "a healthy environment passes");

// The checks must run BEFORE anything is copied — the whole point of catching a
// missing codesign early. Verify by pointing at a source app that exists while
// codesign is absent: no work may start.
const guard = doctor.preflight("desktop", stub({ has: (c) => c !== "codesign" }));
ok(guard.checks.findIndex((c) => c.id === "codesign") <
   guard.checks.findIndex((c) => c.id === "claude-app") + 1,
  "codesign is checked no later than the app itself");

// --- 4. a real install, against the synthetic fixture -------------------------
// macOS only: the patcher uses PlistBuddy and codesign, so there is nothing to
// exercise on a Linux CI runner. Everything above this line is portable and
// still runs there.
console.log("\n[desktop install — synthetic fixture, never the real app]");
if (process.platform !== "darwin") {
  console.log("  SKIP  not macOS — the desktop patcher cannot run here");
  if (failed) {
    console.error("\nFAIL: " + failed + "/" + total + " CLI case(s) regressed");
    process.exit(1);
  }
  console.log("\nPASS: " + total + " CLI cases (packed tarball; desktop section skipped)");
  process.exit(0);
}
const fixtureRoot = path.join(root, "fixture");
fs.mkdirSync(fixtureRoot);
const build = spawnSync(
  "bash",
  ["-c", '. "$1/desktop-app/tests/fixture.sh"; rtlx_fixture_init "$2"; rtlx_build_fixture', "_", REPO, fixtureRoot],
  { encoding: "utf8" },
);
if (build.status !== 0) {
  console.error("could not build the fixture:\n" + build.stderr);
  process.exit(1);
}
const SRC = path.join(fixtureRoot, "Claude.app");
const OUT = path.join(fixtureRoot, "Claude-RTL.app");
const fixEnv = { RTLX_SOURCE_APP: SRC, RTLX_PATCHED_APP: OUT };
const srcAsarBefore = fs.readFileSync(path.join(SRC, "Contents/Resources/app.asar"));

r = run(["--desktop", "--yes"], fixEnv);
ok(r.status === 0, "--desktop --yes installs (exit " + r.status + ")");
ok(fs.existsSync(OUT), "the patched copy exists");
ok(/Claude-RTL/.test(r.stdout), "…and the output tells the user what to open");
ok(Buffer.compare(srcAsarBefore, fs.readFileSync(path.join(SRC, "Contents/Resources/app.asar"))) === 0,
  "the SOURCE app is byte-for-byte untouched");
const patchedAsar = fs.readFileSync(path.join(OUT, "Contents/Resources/app.asar"));
ok(patchedAsar.includes("RTL-PATCH (begin)"), "the copy carries exactly the patch marker");

r = run(["--status"], fixEnv);
ok(r.status === 0 && /patched/.test(r.stdout), "--status reports the copy as patched");

r = run(["--desktop", "--remove", "--yes"], fixEnv);
ok(r.status === 0 && !fs.existsSync(OUT), "--desktop --remove deletes the copy");
ok(Buffer.compare(srcAsarBefore, fs.readFileSync(path.join(SRC, "Contents/Resources/app.asar"))) === 0,
  "the source is still untouched after a remove");

// Without --yes and without a TTY, an install must refuse rather than run.
r = run(["--desktop"], fixEnv);
ok(r.status !== 0 && !fs.existsSync(OUT), "no confirmation, no TTY → nothing happens");
ok(/--yes/.test(r.stderr), "…and it says how to confirm non-interactively");

if (failed) {
  console.error("\nFAIL: " + failed + "/" + total + " CLI case(s) regressed");
  process.exit(1);
}
console.log("\nPASS: " + total + " CLI cases (packed tarball + synthetic fixture)");
