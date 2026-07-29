/* Editor-free lifecycle test for the OPT-IN Codex coverage (codex.js wired
 * through extension.js). Same harness as patcher-lifecycle.test.js: a
 * Module._load hook injects the vscode mock, fake installs live in a temp
 * HOME, and every assertion is on real files the real code wrote.
 *
 * Covers: opt-in OFF by default (Codex untouched, one-time offer shown) →
 * turning it on patches with settings + fingerprint → idempotent re-apply →
 * a settings change re-patches → replacing a patch left by the standalone
 * script (and restoring the script's pristine backup) → turning the opt-in
 * off lifts ONLY our patch → a script-made patch is never auto-removed →
 * whole-extension disable restores everything → uninstall-hook restore that
 * still respects script ownership → minified/no-</head> HTML round-trips.
 *
 * Run: node tests/codex-lifecycle.test.js
 */
process.env.RTLX_WATCH_DEBOUNCE_MS = "200";
process.env.RTLX_WATCH_RETRY_MS = "250";

const Module = require("module");
const fs = require("fs");
const os = require("os");
const path = require("path");

const mock = require("./vscode-mock.js");
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "vscode") return mock;
  return origLoad.call(this, request, parent, isMain);
};

const home = fs.mkdtempSync(path.join(os.tmpdir(), "rtlx-codex-"));
const origHome = process.env.HOME;
const origUserProfile = process.env.USERPROFILE;
process.env.HOME = home;
process.env.USERPROFILE = home;

const extRoot = path.resolve(__dirname, "..");
const ext = require(path.join(extRoot, "extension.js"));
const patcher = require(path.join(extRoot, "patcher.js"));
const codex = require(path.join(extRoot, "codex.js"));

const ORIG_HTML =
  "<!doctype html>\n<html>\n<head>\n<meta charset=\"utf-8\">\n<title>Codex</title>\n</head>\n<body>\n<div id=\"root\"></div>\n<script src=\"./main.js\"></script>\n</body>\n</html>\n";
const ORIG_CSS = "body{color:red}\n";
const ORIG_JS = "console.log('claude code webview');\n" + "x".repeat(20_000) + "\n";

function makeClaude(version) {
  const wv = path.join(home, ".vscode", "extensions", "anthropic.claude-code-" + version, "webview");
  fs.mkdirSync(wv, { recursive: true });
  fs.writeFileSync(path.join(wv, "index.css"), ORIG_CSS);
  fs.writeFileSync(path.join(wv, "index.js"), ORIG_JS);
  return { wv, css: path.join(wv, "index.css"), js: path.join(wv, "index.js") };
}
function makeCodex(version, html) {
  const wv = path.join(home, ".vscode", "extensions", "openai.chatgpt-" + version, "webview");
  fs.mkdirSync(wv, { recursive: true });
  fs.writeFileSync(path.join(wv, "index.html"), html === undefined ? ORIG_HTML : html);
  return { wv, html: path.join(wv, "index.html") };
}

// A patch exactly the shape apply-rtl.sh produces: assets + pristine backup +
// a marked block WITHOUT any rtlx-fp fingerprint.
function scriptPatch(c) {
  const assets = path.join(c.wv, "assets");
  fs.mkdirSync(assets, { recursive: true });
  for (const a of [codex.ASSET_STYLES, codex.ASSET_MATH, codex.ASSET_DRIVER, codex.ASSET_FONT])
    fs.writeFileSync(path.join(assets, a), "script-copied\n");
  const pristine = fs.readFileSync(c.html, "utf8");
  fs.writeFileSync(c.html + ".rtl-backup", pristine);
  const block =
    codex.BEGIN_MARK +
    '\n<link rel="stylesheet" href="./assets/' + codex.ASSET_STYLES + '">' +
    '\n<script src="./assets/' + codex.ASSET_MATH + '"></script>' +
    '\n<script src="./assets/' + codex.ASSET_DRIVER + '"></script>\n' +
    codex.END_MARK + "\n";
  const i = pristine.indexOf("</head>");
  fs.writeFileSync(c.html, pristine.slice(0, i) + block + pristine.slice(i));
}

const read = (p) => fs.readFileSync(p, "utf8");
const markerCount = (p) => read(p).split(codex.BEGIN_MARK).length - 1;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(cond, ms, step) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (cond()) return true;
    await sleep(step || 100);
  }
  return cond();
}

let failures = 0;
function check(cond, msg) {
  if (cond) console.log("  ok:", msg);
  else {
    console.error("  FAIL:", msg);
    failures++;
  }
}

// Context WITH a globalState stub so the one-time offer path runs.
function makeContext() {
  const store = {};
  return {
    subscriptions: [],
    extensionPath: extRoot,
    globalState: {
      get: (k) => store[k],
      update: (k, v) => {
        store[k] = v;
        return Promise.resolve();
      },
    },
  };
}

async function main() {
  const claude = makeClaude("1.0.0");
  const cx = makeCodex("0.1.0");

  // ── 1. default: opt-in OFF — Codex untouched, offered exactly once ────────
  ext.activate(makeContext());
  await waitFor(() => read(claude.css).includes(patcher.BEGIN), 2000);
  await sleep(300); // let the deferred startup block finish
  check(read(cx.html) === ORIG_HTML, "opt-in off: Codex index.html untouched");
  const offers = mock.calls.info.filter((m) => String(m).includes("Codex"));
  check(offers.length === 1, "one-time offer was shown (dismissed by the mock)");

  // ── 2. opt in → patched with settings + fingerprint ───────────────────────
  mock._setConfig("rtlForClaude.codex.enabled", true);
  const patched = await waitFor(() => codex.isPatched(cx.wv), 3000);
  check(patched, "opt-in on: Codex index.html patched");
  const html1 = read(cx.html);
  check(html1.indexOf(codex.BEGIN_MARK) < html1.indexOf("</head>"), "block sits before </head>");
  check(html1.includes("rtlx-fp:"), "block carries the extension fingerprint");
  check(html1.includes("window.__RTLX_SETTINGS="), "block injects the settings object");
  check(html1.includes('"threshold":0.1'), "settings carry the project-wide 0.1 threshold");
  check(read(cx.html + ".rtl-backup") === ORIG_HTML, "pristine backup written");
  for (const a of [codex.ASSET_STYLES, codex.ASSET_MATH, codex.ASSET_DRIVER, codex.ASSET_FONT])
    check(fs.existsSync(path.join(cx.wv, "assets", a)), "asset copied: " + a);
  check(
    read(path.join(cx.wv, "assets", codex.ASSET_DRIVER)) ===
      read(path.join(extRoot, "assets", "codex", "driver.js")),
    "driver copied byte-identical from assets/codex/"
  );

  // ── 3. idempotent forced re-apply ──────────────────────────────────────────
  await mock.commands.executeCommand("rtlForClaude.apply");
  await sleep(200);
  check(markerCount(cx.html) === 1, "re-apply: exactly one marked block");
  check(read(cx.html + ".rtl-backup") === ORIG_HTML, "re-apply: backup still pristine");

  // ── 4. a settings change re-patches (new fingerprint) ─────────────────────
  const fp1 = read(cx.html).match(/rtlx-fp:([0-9a-f]+)/)[1];
  mock._setConfig("rtlForClaude.font.scale", 1.3);
  const refreshed = await waitFor(() => {
    const m = read(cx.html).match(/rtlx-fp:([0-9a-f]+)/);
    return m && m[1] !== fp1;
  }, 3000);
  check(refreshed, "font change: block rewritten with a new fingerprint");
  check(read(cx.html).includes('"fontScale":1.3'), "new settings value inside the block");
  check(markerCount(cx.html) === 1, "font change: still exactly one block");

  // ── 5. a script-made patch is replaced cleanly, backup preserved ──────────
  const cx2 = makeCodex("0.2.0");
  scriptPatch(cx2);
  check(codex.isPatched(cx2.wv) && !read(cx2.html).includes("rtlx-fp:"), "fixture: script-shaped patch in place");
  await mock.commands.executeCommand("rtlForClaude.apply");
  await sleep(300);
  check(markerCount(cx2.html) === 1 && read(cx2.html).includes("rtlx-fp:"), "script patch replaced by ours, single block");
  check(read(cx2.html + ".rtl-backup") === ORIG_HTML, "script's pristine backup kept");

  // ── 6. opt-out lifts OUR patch (and only ours), Claude stays patched ──────
  mock._setConfig("rtlForClaude.codex.enabled", false);
  const restored = await waitFor(() => read(cx.html) === ORIG_HTML && read(cx2.html) === ORIG_HTML, 3000);
  check(restored, "opt-out: both Codex installs restored byte-for-byte");
  check(!fs.existsSync(cx.html + ".rtl-backup"), "opt-out: backup consumed");
  check(!fs.existsSync(path.join(cx.wv, "assets", codex.ASSET_DRIVER)), "opt-out: assets removed");
  check(read(claude.css).includes(patcher.BEGIN), "opt-out: Claude Code patch untouched");

  // ── 7. a script-made patch survives restarts while opted out ──────────────
  const cx3 = makeCodex("0.3.0");
  scriptPatch(cx3);
  const before = read(cx3.html);
  ext.deactivate();
  ext.activate(makeContext());
  await sleep(600);
  check(read(cx3.html) === before, "opted out: script-made patch never auto-removed");
  check(mock.calls.info.filter((m) => String(m).includes("Codex extension is installed")).length === 1,
    "offer not repeated once the setting was explicitly decided");

  // ── 8. whole-extension disable restores Codex too (when opted in) ─────────
  // Once opted in the extension owns every Codex install — including cx3's
  // script-made patch, which the re-enable below replaces with ours.
  mock._setConfig("rtlForClaude.codex.enabled", true);
  await waitFor(() => codex.isPatched(cx.wv), 3000);
  mock._setConfig("rtlForClaude.enabled", false);
  const allOff = await waitFor(() => read(cx.html) === ORIG_HTML && read(claude.css) === ORIG_CSS, 3000);
  check(allOff, "disable: Claude AND Codex restored byte-for-byte");
  mock._setConfig("rtlForClaude.enabled", true);
  await waitFor(() => codex.isPatched(cx.wv) && codex.isPatched(cx3.wv), 3000);

  // ── 9. uninstall hook: restores ours, leaves a script-made one alone ──────
  ext.deactivate();
  const cx4 = makeCodex("0.9.0");
  scriptPatch(cx4);
  const cx4Before = read(cx4.html);
  const fakeSelf = path.join(home, ".vscode", "extensions", "mahdigh99.rtl-for-claude-1.4.0");
  fs.mkdirSync(fakeSelf, { recursive: true });
  fs.copyFileSync(path.join(extRoot, "uninstall.js"), path.join(fakeSelf, "uninstall.js"));
  require(path.join(fakeSelf, "uninstall.js"));
  for (const c of [cx, cx2, cx3])
    check(read(c.html) === ORIG_HTML, "uninstall: our Codex patch restored (" + path.basename(path.dirname(c.wv)) + ")");
  check(!fs.existsSync(path.join(cx.wv, "assets", codex.ASSET_STYLES)), "uninstall: our assets removed");
  check(read(cx4.html) === cx4Before, "uninstall: script-made patch left in place");

  // ── 10. direct round-trips: minified + no-</head> HTML ────────────────────
  const MINIFIED = '<!doctype html><html><head><meta charset="utf-8"><title>x</title></head><body><div id="root"></div></body></html>';
  const cs = {
    settingsJson: '{"enabled":true}',
    fp: "deadbeef0123",
    stylesPath: path.join(extRoot, "assets", "codex", "styles.css"),
    mathPath: path.join(extRoot, "assets", "codex", "rtl-math.js"),
    driverPath: path.join(extRoot, "assets", "codex", "driver.js"),
    fontPath: path.join(extRoot, "assets", "codex", "vazirmatn-codex.woff2"),
  };
  const mini = makeCodex("0.4.0", MINIFIED);
  await codex.patchCodexDir(mini.wv, cs);
  check(read(mini.html).indexOf(codex.BEGIN_MARK) < read(mini.html).indexOf("</head>"), "minified: block before </head>");
  await codex.patchCodexDir(mini.wv, cs);
  check(markerCount(mini.html) === 1, "minified: double patch keeps one block");
  await codex.removeCodexDir(mini.wv);
  check(read(mini.html) === MINIFIED, "minified: removed byte-for-byte (no trailing newline added)");

  const headless = makeCodex("0.5.0", "<body>plain</body>");
  await codex.patchCodexDir(headless.wv, cs);
  check(read(headless.html).includes(codex.BEGIN_MARK), "no </head>: block appended");
  await codex.removeCodexDir(headless.wv);
  check(read(headless.html) === "<body>plain</body>", "no </head>: restored byte-for-byte");
}

main()
  .then(() => {
    Module._load = origLoad;
    process.env.HOME = origHome;
    process.env.USERPROFILE = origUserProfile;
    fs.rmSync(home, { recursive: true, force: true });
    if (failures) {
      console.error(`\nFAIL codex-lifecycle — ${failures} assertion(s) failed`);
      process.exit(1);
    }
    console.log("\nPASS codex-lifecycle");
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
