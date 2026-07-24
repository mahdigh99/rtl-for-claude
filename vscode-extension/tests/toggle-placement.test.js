/* Placement test for the global direction toggle in the Claude Code webview.
 *
 * The toggle prefers to dock in the panel's top toolbar next to the New session
 * / Session history icons (which expose stable aria-labels), and falls back to a
 * floating pill when that toolbar is absent. This drives the REAL driver.js
 * against a mock DOM and asserts both paths, so a future change that breaks the
 * anchor or the fallback is caught.
 *
 * Needs Chrome; skips cleanly when it is absent.
 * Run: node tests/toggle-placement.test.js
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
  console.log("SKIP: toggle placement test (no Chrome/Chromium found)");
  process.exit(0);
}

const css = path.join(__dirname, "../assets/styles.css");
const driver = path.join(__dirname, "../assets/driver.js");

const page = `<meta charset="utf-8">
<link rel="stylesheet" href="file://${css}">
<style>
  body { margin: 0; font: 13px system-ui; }
  .topbar { display: flex; gap: 4px; padding: 8px; }
</style>
<div id="panel">
  <div class="topbar">
    <button aria-label="New session">+</button>
    <button aria-label="Session history">H</button>
  </div>
</div>
<pre id="result"></pre>
<script>window.__RTLX_SETTINGS = { enabled: true };</script>
<script src="file://${driver}"></script>
<script>
const out = [];
const g = () => document.getElementById("rtlx-global");
setTimeout(() => {
  const btn = g();
  const hist = document.querySelector('button[aria-label="Session history"]');
  const docked = btn && btn.dataset.dock === "top" && btn.parentNode === hist.parentNode;
  out.push((docked ? "ok   " : "FAIL ") + "docks into top toolbar (dock=" + (btn && btn.dataset.dock) + ")");

  const compact = btn && btn.textContent.trim() === "\\u21cc";
  out.push((compact ? "ok   " : "FAIL ") + "compact icon label when docked");

  btn.click();
  const rtl = document.documentElement.getAttribute("data-rtlx-force-all") === "rtl";
  out.push((rtl ? "ok   " : "FAIL ") + "click cycles to force-all=rtl");

  document.querySelector(".topbar").remove();
  document.body.appendChild(document.createElement("span")); // nudge the observer
  setTimeout(() => {
    const b2 = g();
    const floated = b2 && b2.dataset.dock === "float";
    out.push((floated ? "ok   " : "FAIL ") + "falls back to floating when toolbar gone");
    const labelled = b2 && b2.textContent.indexOf("RTL") !== -1;
    out.push((labelled ? "ok   " : "FAIL ") + "shows text label when floating");
    document.getElementById("result").textContent = out.join("\\n");
  }, 400);
}, 400);
</script>`;

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rtlx-toggle-"));
const file = path.join(dir, "toggle.html");
fs.writeFileSync(file, page, "utf8");

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
if (!m) {
  console.error("FAIL: the harness produced no result block");
  process.exit(1);
}
const lines = m[1]
  .replace(/&amp;/g, "&")
  .replace(/&lt;/g, "<")
  .replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"')
  .trim()
  .split("\n");
for (const line of lines) console.log("  " + line);

const failed = lines.filter((l) => l.startsWith("FAIL")).length;
if (failed) {
  console.error(`\nFAIL: ${failed}/${lines.length} toggle placement case(s) regressed`);
  process.exit(1);
}
console.log(`\nPASS: ${lines.length} toggle placement cases`);
