/* Editor-free lifecycle test for the extension patcher (backlog item 2.3).
 *
 * A Module._load hook hands extension.js our hand-rolled `vscode` mock, fake
 * Claude Code installs live in a temp HOME, and every assertion is on the real
 * on-disk files the real code wrote. (The reference project esbuild-bundles
 * its TypeScript first; our extension.js is already plain CJS, so requiring it
 * under the hook is equivalent — and dependency-free.)
 *
 * Covers: first patch → idempotent re-patch → survives deactivate/reactivate →
 * mid-session update re-apply via fs.watch → Disable-during-the-retry-loop
 * must NOT re-patch (the regression the reference implementations have) →
 * disable restore → re-enable → fork-dir discovery via getExtension →
 * uninstall-hook restore.
 *
 * Runs in seconds, no Electron/display. Run: node tests/patcher-lifecycle.test.js
 */

// Shrink the watcher timings BEFORE extension.js is loaded (it reads env once).
process.env.RTLX_WATCH_DEBOUNCE_MS = "200";
process.env.RTLX_WATCH_RETRY_MS = "250";

const Module = require("module");
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const mock = require("./vscode-mock.js");
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "vscode") return mock;
  return origLoad.call(this, request, parent, isMain);
};

// Fake HOME so discovery only ever sees our fixtures.
const home = fs.mkdtempSync(path.join(os.tmpdir(), "rtlx-lifecycle-"));
const origHome = process.env.HOME;
const origUserProfile = process.env.USERPROFILE;
process.env.HOME = home;
process.env.USERPROFILE = home;

const extRoot = path.resolve(__dirname, ".."); // real assets/ are used
const ext = require(path.join(extRoot, "extension.js"));
const patcher = require(path.join(extRoot, "patcher.js"));

const ORIG_CSS = "body{color:red}\n";
const ORIG_JS = "console.log('claude code webview');\n" + "x".repeat(20_000) + "\n";

function makeInstall(dotdir, version) {
  const root = path.join(home, dotdir, "extensions", "anthropic.claude-code-" + version);
  const webview = path.join(root, "webview");
  fs.mkdirSync(webview, { recursive: true });
  fs.writeFileSync(path.join(webview, "index.css"), ORIG_CSS);
  fs.writeFileSync(path.join(webview, "index.js"), ORIG_JS);
  return {
    root,
    webview,
    css: path.join(webview, "index.css"),
    js: path.join(webview, "index.js"),
    font: path.join(webview, patcher.FONT_DEST),
  };
}

const read = (p) => fs.readFileSync(p, "utf8");
const isPatched = (p) => fs.existsSync(p) && read(p).includes(patcher.BEGIN);
const markerCount = (p) => read(p).split(patcher.BEGIN).length - 1;
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

const makeContext = () => ({ subscriptions: [], extensionPath: extRoot });

async function main() {
  // ── 1. first patch ────────────────────────────────────────────────────────
  const v1 = makeInstall(".vscode", "1.0.0");
  ext.activate(makeContext());
  await waitFor(() => isPatched(v1.js), 2000);
  check(isPatched(v1.css), "first patch: index.css patched after activate");
  check(isPatched(v1.js) && read(v1.js).includes("rtlx-fp:"), "first patch: index.js patched + fingerprinted");
  check(fs.existsSync(v1.font), "first patch: font copied");
  check(read(v1.css + patcher.BACKUP_SUFFIX) === ORIG_CSS, "first patch: pristine css backup");
  check(read(v1.js + patcher.BACKUP_SUFFIX) === ORIG_JS, "first patch: pristine js backup");

  // ── 2. idempotent re-patch (forced re-apply command) ──────────────────────
  await mock.commands.executeCommand("rtlForClaude.apply");
  await sleep(150);
  check(markerCount(v1.css) === 1 && markerCount(v1.js) === 1, "re-apply: exactly one marker block, never stacked");
  check(read(v1.js + patcher.BACKUP_SUFFIX) === ORIG_JS, "re-apply: backup still pristine");

  // ── 3. patch persists across deactivate → reactivate ──────────────────────
  ext.deactivate();
  check(isPatched(v1.js), "deactivate leaves the patch in place (persists across window close)");
  ext.activate(makeContext());
  await sleep(400);
  check(isPatched(v1.js) && markerCount(v1.js) === 1, "reactivate: still patched, still one block");

  // ── 4. mid-session Claude Code update → fs.watch re-applies, no reload ────
  const v2 = makeInstall(".vscode", "2.0.0");
  check(!isPatched(v2.js), "update: new version folder starts un-patched");
  const patchedByWatcher = await waitFor(() => isPatched(v2.css) && isPatched(v2.js), 5000);
  check(patchedByWatcher, "update: fs.watch patched the new version folder mid-session");
  check(isPatched(v1.js), "update: the old (still-running) version folder keeps its patch");

  // Let the retry loop drain so step 5 starts from a quiet state.
  await sleep(900);

  // ── 5. Disable during the watcher's debounce/retry window must WIN ────────
  // (the reference implementation forgets this: its retry loop re-patches
  // right after a Disable). We drop a new folder and disable immediately.
  const v3 = makeInstall(".vscode", "3.0.0");
  mock._setConfig("rtlForClaude.enabled", false);
  await sleep(1800); // > debounce + all retries + the settings debounce
  check(!isPatched(v3.css) && !isPatched(v3.js), "disable-during-retry: new folder was NOT patched after Disable");
  check(read(v1.css) === ORIG_CSS && read(v1.js) === ORIG_JS, "disable: v1 restored byte-for-byte");
  check(read(v2.js) === ORIG_JS, "disable: v2 restored byte-for-byte");
  check(!fs.existsSync(v1.js + patcher.BACKUP_SUFFIX), "disable: backups consumed");
  check(!fs.existsSync(v1.font), "disable: font removed");

  // ── 6. re-enable re-patches everything ────────────────────────────────────
  mock._setConfig("rtlForClaude.enabled", true);
  const repatched = await waitFor(() => isPatched(v1.js) && isPatched(v2.js) && isPatched(v3.js), 4000);
  check(repatched, "re-enable: all version folders patched again");

  // ── 7. fork-dir discovery via vscode.extensions.getExtension ──────────────
  // An IDE whose extensions dir is in NONE of the hardcoded roots.
  const fork = makeInstall(".some-new-fork", "9.9.9");
  mock._setClaudeExtensionPath(fork.root);
  await mock.commands.executeCommand("rtlForClaude.apply");
  await sleep(300);
  check(isPatched(fork.css) && isPatched(fork.js), "fork discovery: install found via getExtension and patched");
  mock._setClaudeExtensionPath(undefined);

  // ── 8. uninstall hook restores originals ──────────────────────────────────
  ext.deactivate();
  // VS Code runs uninstall.js from inside the removed extension's folder; its
  // parent directory is the editor's extensions dir. Recreate that layout.
  const fakeSelf = path.join(home, ".vscode", "extensions", "mahdigh99.rtl-for-claude-1.2.0");
  fs.mkdirSync(fakeSelf, { recursive: true });
  fs.copyFileSync(path.join(extRoot, "uninstall.js"), path.join(fakeSelf, "uninstall.js"));
  require(path.join(fakeSelf, "uninstall.js"));
  for (const v of [v1, v2, v3]) {
    check(read(v.css) === ORIG_CSS && read(v.js) === ORIG_JS, "uninstall: restored byte-for-byte (" + path.basename(v.root) + ")");
    check(!fs.existsSync(v.js + patcher.BACKUP_SUFFIX) && !fs.existsSync(v.font), "uninstall: no backup/font left (" + path.basename(v.root) + ")");
  }
}

main()
  .then(() => {
    Module._load = origLoad;
    process.env.HOME = origHome;
    process.env.USERPROFILE = origUserProfile;
    fs.rmSync(home, { recursive: true, force: true });
    if (failures) {
      console.error(`\nFAIL patcher-lifecycle — ${failures} assertion(s) failed`);
      process.exit(1);
    }
    console.log("\nPASS patcher-lifecycle — all lifecycle flows verified");
    process.exit(0);
  })
  .catch((e) => {
    console.error("FAIL patcher-lifecycle:", e);
    fs.rmSync(home, { recursive: true, force: true });
    process.exit(1);
  });
