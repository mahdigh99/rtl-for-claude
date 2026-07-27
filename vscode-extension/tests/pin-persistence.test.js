/* Persistence test for the global Auto/RTL/LTR pin.
 *
 * The pin used to live only in memory (`var globalForce`) and reset to Auto on
 * every webview reload. Both drivers now persist it in the webview's
 * localStorage and re-apply it synchronously during script evaluation — before
 * the first paint. This test covers both halves of the round-trip for BOTH
 * drivers (Claude Code and Codex):
 *   • a pre-seeded localStorage value is applied to <html> by the time the
 *     driver's script tag finishes evaluating (the "reload" half), and
 *   • clicking the toggle writes each new state back to localStorage (the
 *     "save" half), with Auto clearing the key.
 *
 * Needs Chrome; skips cleanly when it is absent.
 * Run: node tests/pin-persistence.test.js
 */
const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const CHROME_CANDIDATES = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
];
const chrome = CHROME_CANDIDATES.find((p) => fs.existsSync(p));
if (!chrome) {
  console.log("SKIP: pin persistence test (no Chrome/Chromium found)");
  process.exit(0);
}

const DRIVERS = [
  {
    name: "claude",
    driver: path.join(__dirname, "../assets/driver.js"),
    css: path.join(__dirname, "../assets/styles.css"),
  },
  {
    name: "codex",
    driver: path.join(__dirname, "../../vscode-extension-codex/assets/driver.js"),
    css: path.join(__dirname, "../../vscode-extension-codex/assets/styles.css"),
  },
];

const KEY = "rtlx-global-force";

const pageFor = (d) => `<meta charset="utf-8">
<link rel="stylesheet" href="file://${d.css}">
<div id="content"><p>سلام دنیا</p></div>
<pre id="result"></pre>
<script>
// Simulate a webview that was pinned to RTL before the last reload.
try { localStorage.clear(); localStorage.setItem(${JSON.stringify(KEY)}, "rtl"); } catch (e) {}
</script>
<script src="file://${d.driver}"></script>
<script>
const out = [];
const de = document.documentElement;
// Synchronous check — the driver script has just evaluated, nothing painted yet.
out.push((de.getAttribute("data-rtlx-force-all") === "rtl" ? "ok   " : "FAIL ") +
  "persisted pin re-applied during driver init (before first paint)");
setTimeout(() => {
  const btn = document.getElementById("rtlx-global");
  out.push((btn && btn.dataset.state === "rtl" ? "ok   " : "FAIL ") +
    "toggle label reflects the restored pin (state=" + (btn && btn.dataset.state) + ")");
  const get = () => { try { return localStorage.getItem(${JSON.stringify(KEY)}); } catch (e) { return "ERR"; } };
  btn.click(); // rtl -> ltr
  out.push((get() === "ltr" ? "ok   " : "FAIL ") + "click writes ltr to localStorage (got " + get() + ")");
  out.push((de.getAttribute("data-rtlx-force-all") === "ltr" ? "ok   " : "FAIL ") + "click applies ltr to <html>");
  btn.click(); // ltr -> auto
  out.push((get() === null ? "ok   " : "FAIL ") + "Auto clears the stored pin (got " + get() + ")");
  out.push((!de.hasAttribute("data-rtlx-force-all") ? "ok   " : "FAIL ") + "Auto removes the <html> attribute");
  btn.click(); // auto -> rtl
  out.push((get() === "rtl" ? "ok   " : "FAIL ") + "click writes rtl to localStorage (got " + get() + ")");

  // --- keyboard shortcut (Ctrl/Cmd+Shift+9) --------------------------------
  // The pin lives inside this sandboxed webview, so a VS Code keybinding can
  // never reach it — the driver owns the key. Keyed on e.code so a Persian
  // layout (where the 9 key types another character) still works.
  const key = (over) => document.dispatchEvent(new KeyboardEvent("keydown", Object.assign(
    { ctrlKey: true, shiftKey: true, code: "Digit9", bubbles: true, cancelable: true }, over || {})));
  key(); // rtl -> ltr
  out.push((get() === "ltr" ? "ok   " : "FAIL ") + "shortcut cycles rtl→ltr and persists (got " + get() + ")");
  out.push((de.getAttribute("data-rtlx-force-all") === "ltr" ? "ok   " : "FAIL ") + "shortcut applies ltr to <html>");
  out.push((btn.dataset.state === "ltr" ? "ok   " : "FAIL ") + "shortcut repaints the button (state=" + btn.dataset.state + ")");
  key({ shiftKey: false });        // not our chord
  key({ code: "Digit8" });          // not our key
  key({ ctrlKey: false, metaKey: false }); // no Ctrl/Cmd
  key({ altKey: true });            // Alt is a different chord entirely
  out.push((get() === "ltr" ? "ok   " : "FAIL ") + "near-miss chords are ignored (got " + get() + ")");
  key(); // ltr -> auto
  out.push((get() === null && !de.hasAttribute("data-rtlx-force-all") ? "ok   " : "FAIL ") +
    "shortcut cycles ltr→auto and clears the pin (got " + get() + ")");

  document.getElementById("result").textContent = out.join("\\n");
}, 400);
</script>`;

function run(d) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rtlx-pin-"));
  const file = path.join(dir, "pin.html");
  fs.writeFileSync(file, pageFor(d), "utf8");
  let dom;
  try {
    dom = execFileSync(
      chrome,
      [
        "--headless",
        "--disable-gpu",
        "--no-sandbox",
        "--allow-file-access-from-files",
        "--virtual-time-budget=4000",
        "--dump-dom",
        "file://" + file,
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  const m = dom.match(/<pre id="result">([\s\S]*?)<\/pre>/);
  if (!m) return ["FAIL harness produced no result block"];
  return m[1]
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .trim()
    .split("\n");
}

let total = 0;
let failed = 0;
for (const d of DRIVERS) {
  console.log(`\n[${d.name}]`);
  const lines = run(d);
  for (const line of lines) console.log("  " + line);
  total += lines.length;
  failed += lines.filter((l) => l.startsWith("FAIL")).length;
}

if (failed) {
  console.error(`\nFAIL: ${failed}/${total} pin persistence case(s) regressed`);
  process.exit(1);
}
console.log(`\nPASS: ${total} pin persistence cases across ${DRIVERS.length} drivers`);
