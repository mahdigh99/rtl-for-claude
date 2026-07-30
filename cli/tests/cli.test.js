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
  "cli/ui.js",
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

// --- 3b. the terminal UI -----------------------------------------------------
// The menu is hand-written (no inquirer), so the key handling and the fallback
// need real coverage. Fake TTY streams make that deterministic — no pty, no
// timing luck.
console.log("\n[ui]");
const ui = require("../ui");
const { PassThrough } = require("stream");

function fakeTty() {
  const input = new PassThrough();
  input.isTTY = true;
  input.setRawMode = () => {};
  const output = new PassThrough();
  output.isTTY = true;
  output.columns = 80;
  output.chunks = [];
  output.on("data", (d) => output.chunks.push(String(d)));
  return { input, output };
}

const ITEMS = [
  { label: "First", value: "one" },
  { label: "Second", hint: "with a hint", value: "two" },
  { separator: true, label: "" },
  { label: "Third", value: "three" },
];

const tick = () => new Promise((r) => setImmediate(r));
async function drive(keys, items) {
  const { input, output } = fakeTty();
  const p = ui.select({ title: "Pick", items: items || ITEMS, input, output, colors: ui.makeColors(output) });
  await tick();
  for (const k of keys) {
    input.write(k);
    await tick();
  }
  const value = await p;
  return { value, text: ui.stripAnsi(output.chunks.join("")) };
}

(async () => {
  let res = await drive(["\r"]);
  ok(res.value === "one", "enter picks the first item (got " + res.value + ")");
  ok(/❯ 1\. First/.test(res.text), "the first item is highlighted on open");
  ok(/2\. Second\s+with a hint/.test(res.text), "hints are rendered next to the label");

  res = await drive(["\x1b[B", "\r"]);
  ok(res.value === "two", "arrow down moves the selection (got " + res.value + ")");

  res = await drive(["\x1b[B", "\x1b[B", "\r"]);
  ok(res.value === "three", "a separator is skipped, not selected (got " + res.value + ")");

  res = await drive(["\x1b[A", "\r"]);
  ok(res.value === "three", "arrow up wraps around to the last item (got " + res.value + ")");

  res = await drive(["3", ]);
  ok(res.value === "three", "number keys still select directly (got " + res.value + ")");

  res = await drive(["q"]);
  ok(res.value === null, "q cancels");

  res = await drive(["\x1b"]);
  ok(res.value === null, "escape cancels");

  res = await drive(["j", "\r"]);
  ok(res.value === "two", "vim keys work too (j)");

  // Redraw discipline: each keypress must repaint in place, never scroll a new
  // copy of the menu into the history. (Checked on the RAW output — `drive`
  // strips the escape codes this assertion is about.)
  const raw = (await (async () => {
    const { input, output } = fakeTty();
    const p = ui.select({ title: "Pick", items: ITEMS, input, output, colors: ui.makeColors(output) });
    await tick();
    input.write("\x1b[B"); await tick();
    input.write("q"); await tick();
    await p;
    return output.chunks.join("");
  })());
  ok(/\x1b\[\d+A/.test(raw), "a keypress repaints in place (cursor-up), it does not reprint below");
  ok(raw.indexOf("\x1b[?25l") !== -1 && raw.indexOf("\x1b[?25h") !== -1, "the cursor is hidden while the menu is up and restored after");

  // A pipe (CI, `| cat`, an IDE console) can't do raw mode: the numbered
  // fallback must still work rather than hanging on a keypress that never comes.
  const input = new PassThrough();
  const output = new PassThrough();
  output.columns = 80;
  let text = "";
  output.on("data", (d) => (text += String(d)));
  const pending = ui.select({ title: "Pick", items: ITEMS, input, output, colors: ui.makeColors(output) });
  await tick();
  input.write("2\n");
  ok((await pending) === "two", "without raw mode it falls back to a numbered prompt");
  ok(/1\) First/.test(text), "…and prints the numbers");

  // The between-actions pause promises "q to quit" — so q must work as a
  // SINGLE keypress, no Enter needed (it used to be a readline question that
  // only listened for Enter, leaving people hammering q at a dead prompt).
  {
    const { input, output } = fakeTty();
    const p = ui.pause("Press Enter for the menu, or q to quit … ", { input, output });
    await tick();
    input.write("q");
    ok((await p) === true, "pause: a single q (no Enter) quits");
  }
  {
    const { input, output } = fakeTty();
    const p = ui.pause("pause ", { input, output });
    await tick();
    input.write("x");
    await tick(); // an irrelevant key must keep it waiting, not resolve it
    input.write("\r");
    ok((await p) === false, "pause: Enter continues (other keys are ignored)");
  }
  {
    const { input, output } = fakeTty();
    const p = ui.pause("pause ", { input, output });
    await tick();
    input.write("\x1b");
    ok((await p) === true, "pause: Esc quits too");
  }
  {
    // No raw mode (a pipe): line-prompt fallback; an answer starting with q quits.
    const input = new PassThrough();
    const output = new PassThrough();
    const p = ui.pause("pause: ", { input, output });
    await tick();
    input.write("qqq\n");
    ok((await p) === true, "pause fallback: a line starting with q quits");
  }

  // Output styling: the shell scripts keep their own plain vocabulary, and the
  // CLI re-renders it. Anything unrecognised must survive, not be swallowed.
  const plain = ui.makeColors({ isTTY: false });
  const styled = (line) => ui.stripAnsi(ui.styleLine(line, plain));
  ok(styled("  [+] original: /Applications/Claude.app") === "    ✓ original: /Applications/Claude.app",
    "[+] becomes a check mark");
  ok(styled("  [*] copying …") === "    · copying …", "[*] becomes a bullet");
  ok(styled("  [!] careful") === "    ! careful", "[!] stays a warning");
  ok(styled("  [X] it broke") === "    ✗ it broke", "[X] becomes a cross");
  ok(styled("ERROR: nope") === "    ✗ nope" && styled("WARNING: hmm") === "    ! hmm",
    "ERROR/WARNING prefixes are recognised too");
  ok(styled("  patched: /some/dir") === "    ✓ /some/dir", "'patched:' reads as done");
  ok(styled("3 webview folder(s) would be patched.") === "    · 3 webview folder(s) can be patched",
    "the summary line is rewritten in plain language");
  ok(styled("/Users/x/.vscode/extensions/foo/webview") === "    /Users/x/.vscode/extensions/foo/webview",
    "a bare path is kept (dimmed), not dropped");
  ok(styled("something nobody predicted") === "    something nobody predicted",
    "an unrecognised line is passed through, only indented");
  ok(ui.styleLine("   ", plain) === "", "blank lines stay blank");
  ok(ui.stripAnsi(ui.styleLine("[+] x", ui.makeColors({ isTTY: true, columns: 80 }))).indexOf("✓") !== -1,
    "styling survives with colour on");

  // Colour discipline.
  const noColor = ui.makeColors({ isTTY: true });
  const savedNo = process.env.NO_COLOR;
  process.env.NO_COLOR = "1";
  ok(ui.makeColors({ isTTY: true }).level === 0, "NO_COLOR turns colour off");
  if (savedNo === undefined) delete process.env.NO_COLOR; else process.env.NO_COLOR = savedNo;
  ok(ui.makeColors({ isTTY: false }).level === 0, "a pipe gets no escape codes");
  ok(ui.stripAnsi(ui.box(["hello"], ui.makeColors({ isTTY: false }), { columns: 80 })).indexOf("hello") !== -1,
    "the header box degrades to plain text");

  runRest();
})();

function runRest() {
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
} // runRest
