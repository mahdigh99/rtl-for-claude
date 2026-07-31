/* Cross-surface consistency guard.
 *
 * This project ships the same engine four times — browser extension, Claude Code
 * driver, Codex driver, Claude Desktop driver — plus a settings UI per surface.
 * They had quietly drifted apart: the detection threshold was 0.1 in the
 * browser, 0.3 in VS Code, and the popup's label hardcoded "30%". Each copy was
 * defensible on its own and nothing failed. This test is the thing that fails.
 *
 * Pure static analysis — no browser, no DOM, runs in milliseconds.
 * Run: node tests/consistency.test.js
 */
const fs = require("fs");
const path = require("path");

const REPO = path.join(__dirname, "../..");
const read = (p) => fs.readFileSync(path.join(REPO, p), "utf8");
const json = (p) => JSON.parse(read(p));

let failed = 0;
let total = 0;
function ok(pass, label) {
  total++;
  if (!pass) failed++;
  console.log((pass ? "  ok   " : "  FAIL ") + label);
}

// --- detection threshold: ONE default, everywhere -------------------------
const THRESHOLD = 0.1;

const engine = read("browser-extension/src/rtl-engine.js");
const mEngine = engine.match(/const DEFAULT_THRESHOLD = ([\d.]+);/);
ok(mEngine && Number(mEngine[1]) === THRESHOLD,
  "rtl-engine.js DEFAULT_THRESHOLD is " + THRESHOLD + " (got " + (mEngine && mEngine[1]) + ")");
ok(/typeof opts\.threshold === "number" \? opts\.threshold : DEFAULT_THRESHOLD/.test(engine),
  "detectDirection falls back to DEFAULT_THRESHOLD, not a second literal");

for (const [file, re] of [
  ["browser-extension/src/content.js", /threshold: ([\d.]+),/],
  ["browser-extension/src/popup.js", /threshold: ([\d.]+),/],
  ["vscode-extension/assets/driver.js", /threshold: ([\d.]+),/],
  ["vscode-extension-codex/assets/driver.js", /threshold: ([\d.]+),/],
  ["desktop-app/assets/driver.js", /threshold: ([\d.]+),/],
  ["vscode-extension/media/markdown-rtl.js", /var THRESHOLD = ([\d.]+);/],
]) {
  const m = read(file).match(re);
  ok(m && Number(m[1]) === THRESHOLD, file + " default threshold is " + THRESHOLD + " (got " + (m && m[1]) + ")");
}

const pkg = json("vscode-extension/package.json");
const thrProp = pkg.contributes.configuration.properties["rtlForClaude.detection.threshold"];
ok(thrProp.default === THRESHOLD,
  "rtlForClaude.detection.threshold default is " + THRESHOLD + " (got " + thrProp.default + ")");
ok(thrProp.minimum <= THRESHOLD, "the setting's minimum admits the default");
ok(/c\.get\("detection\.threshold", 0\.1\)/.test(read("vscode-extension/extension.js")),
  "extension.js reads the setting with the same fallback");

// The popup paints a label before its JS runs; a stale literal there is what
// told every new user the default was 30%.
const popupHtml = read("browser-extension/src/popup.html");
const mLabel = popupHtml.match(/id="thresholdVal">(\d+)%/);
ok(mLabel && Number(mLabel[1]) === Math.round(THRESHOLD * 100),
  "popup.html's initial sensitivity label matches the default (got " + (mLabel && mLabel[1]) + "%)");

// Both webview drivers must actually USE their injected threshold — for a while
// they accepted the setting and then hardcoded 0.1 inside dirByRatio().
for (const f of ["vscode-extension/assets/driver.js", "vscode-extension-codex/assets/driver.js"]) {
  const src = read(f);
  ok(/typeof thr === "number" \? thr : S\.threshold/.test(src), f + " honours the injected threshold");
  ok(/S\.mode === "first-strong"/.test(src), f + " honours the injected detection mode");
}

// --- letterSpacing parity (browser had it, VS Code didn't) ----------------
ok(!!pkg.contributes.configuration.properties["rtlForClaude.font.letterSpacing"],
  "VS Code exposes rtlForClaude.font.letterSpacing");
ok(/letterSpacing: r\["font\.letterSpacing"\]/.test(read("vscode-extension/extension.js")),
  "extension.js forwards letterSpacing to the driver");
for (const f of [
  "vscode-extension/assets/driver.js",
  "vscode-extension-codex/assets/driver.js",
]) {
  ok(/--rtlx-letter-spacing/.test(read(f)), f + " sets --rtlx-letter-spacing");
}
for (const f of ["vscode-extension/assets/styles.css", "vscode-extension-codex/assets/styles.css"]) {
  ok(/letter-spacing: var\(--rtlx-letter-spacing, 0\)/.test(read(f)),
    f + " consumes --rtlx-letter-spacing (with a fallback, so a CSS-only patch stays valid)");
}

// --- keyboard shortcuts -----------------------------------------------------
const manifest = json("browser-extension/manifest.json");
ok(!!(manifest.commands && manifest.commands["cycle-direction"] && manifest.commands["toggle-enabled"]),
  "manifest declares both commands");
ok(manifest.commands["cycle-direction"].suggested_key.default === "Ctrl+Shift+9" &&
   manifest.commands["cycle-direction"].suggested_key.mac === "Command+Shift+9",
  "cycle-direction is Ctrl/Cmd+Shift+9");
// Chrome reads background.service_worker, Firefox reads background.scripts.
// Shipping only one of them silently kills the shortcut on the other browser.
ok(manifest.background && manifest.background.service_worker === "src/background.js" &&
   Array.isArray(manifest.background.scripts) && manifest.background.scripts[0] === "src/background.js",
  "background declares BOTH the service worker (Chrome) and the script (Firefox)");
ok(fs.existsSync(path.join(REPO, "browser-extension/src/background.js")), "background.js exists");

const bg = read("browser-extension/src/background.js");
ok(/commands\.onCommand\.addListener/.test(bg), "background.js listens for commands");
ok(/rtlx:cycle/.test(bg) && /rtlx:cycle/.test(read("browser-extension/src/content.js")),
  "the cycle message the background sends is the one content.js handles");

// Every in-app surface owns the same chord itself (no command API in a webview).
for (const f of [
  "vscode-extension/assets/driver.js",
  "vscode-extension-codex/assets/driver.js",
  "desktop-app/assets/driver.js",
]) {
  const src = read(f);
  ok(/e\.code !== "Digit9"/.test(src), f + " binds Ctrl/Cmd+Shift+9 by physical key code");
  ok(/keydown", onKeydown, true\)/.test(src), f + " listens in the capture phase");
}

const keys = (pkg.contributes.keybindings || []).map((k) => k.command);
ok(keys.indexOf("rtlForClaude.toggle") !== -1 && keys.indexOf("rtlForClaude.apply") !== -1,
  "VS Code contributes default keybindings for toggle + apply");
for (const kb of pkg.contributes.keybindings || []) {
  ok(!!kb.key && !!kb.mac, kb.command + " keybinding covers both platforms");
}

// --- localized settings -----------------------------------------------------
const nlsEn = json("vscode-extension/package.nls.json");
const pkgSrc = read("vscode-extension/package.json");
const used = new Set((pkgSrc.match(/"%([^%"]+)%"/g) || []).map((s) => s.slice(2, -2)));
ok(used.size > 0, "package.json uses %nls% placeholders (" + used.size + " of them)");
for (const key of used) ok(key in nlsEn, "package.nls.json defines " + key);
for (const loc of ["fa", "ar", "ur"]) {
  const d = json("vscode-extension/package.nls." + loc + ".json");
  const missing = Object.keys(nlsEn).filter((k) => !(k in d));
  ok(missing.length === 0, "package.nls." + loc + ".json is complete" +
    (missing.length ? " (missing: " + missing.join(", ") + ")" : ""));
}

// --- the codex 2s poll is a fallback, not a steady-state loop --------------
const codex = read("vscode-extension-codex/assets/driver.js");
const pollIdx = codex.indexOf("setInterval(sweep, 2000)");
ok(pollIdx !== -1, "codex still has the interval as a fallback");
ok(/catch \(error\) \{\s*reportError\(error\);\s*setInterval\(sweep, 2000\);/.test(codex),
  "the codex poll only arms when the MutationObserver failed to attach");

// --- the claude.ai content selector is one string on every surface ----------
// claude.ai renamed .font-claude-message → .font-claude-response (seen live in
// Claude Desktop 1.24012.9); both surfaces must match ANY font-claude-* class,
// and the browser and desktop copies must never drift apart again.
{
  const CLAUDE_SEL = '[class*="font-claude"], [data-testid="user-message"]';
  const contentSrc = read("browser-extension/src/content.js");
  const desktopSrc = read("desktop-app/assets/driver.js");
  ok(contentSrc.indexOf("'" + CLAUDE_SEL + "'") !== -1,
    "content.js claude.ai selector matches any font-claude-* class");
  ok(desktopSrc.indexOf("contentSelector: '" + CLAUDE_SEL + "'") !== -1,
    "the desktop driver uses the exact same claude.ai selector");
  ok(contentSrc.indexOf("font-claude-message',") === -1 && desktopSrc.indexOf("font-claude-message',") === -1,
    "no surface pins the old .font-claude-message-only selector");
}

// --- the React-crash DOM guard is installed on every surface ----------------
// Math islands wrap text nodes inside React-owned trees; without the guard,
// React's next reconcile of a moved node throws and kills the whole app
// ("Something went wrong … removeChild"). Every injected surface must carry it.
{
  for (const f of [
    "browser-extension/src/dom-guard.js",
    "vscode-extension/assets/driver.js",
    "vscode-extension-codex/assets/driver.js",
    "desktop-app/assets/driver.js",
  ])
    ok(read(f).includes("__rtlxDomGuard"), f + " carries the DOM guard");
  const manifest = json("browser-extension/manifest.json");
  const mainEntry = (manifest.content_scripts || []).find((cs) => cs.world === "MAIN");
  ok(
    mainEntry && mainEntry.js && mainEntry.js.indexOf("src/dom-guard.js") !== -1 &&
      mainEntry.run_at === "document_start",
    "manifest injects dom-guard.js into the page's MAIN world at document_start"
  );
  ok(read("browser-extension/src/popup.js").includes("dom-guard.js"),
    "custom sites register the MAIN-world guard too");
  ok(read("desktop-app/assets/driver.js").includes("executeJavaScript"),
    "the desktop preload pushes the guard into the page's world via webFrame");
}

if (failed) {
  console.error("\nFAIL: " + failed + "/" + total + " consistency check(s) regressed");
  process.exit(1);
}
console.log("\nPASS: " + total + " cross-surface consistency checks");
