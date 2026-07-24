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

// `placement` is injected via __RTLX_SETTINGS, exactly as the extension does it.
const pageFor = (settings) => `<meta charset="utf-8">
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
<script>window.__RTLX_SETTINGS = ${JSON.stringify(settings)};</script>
<script src="file://${driver}"></script>
<script>
const out = [];
const g = () => document.getElementById("rtlx-global");
const MODE = ${JSON.stringify(settings.togglePlacement || "toolbar")};
setTimeout(() => {
  const btn = g();
  if (MODE === "hidden") {
    out.push((!btn ? "ok   " : "FAIL ") + "hidden: no button created");
    document.getElementById("result").textContent = out.join("\\n");
    return;
  }
  if (MODE === "floating") {
    const floated = btn && btn.dataset.dock === "float";
    out.push((floated ? "ok   " : "FAIL ") + "floating: stays a floating pill (dock=" + (btn && btn.dataset.dock) + ")");
    btn.click();
    out.push((document.documentElement.getAttribute("data-rtlx-force-all") === "rtl" ? "ok   " : "FAIL ") + "floating: click cycles to rtl");
    document.getElementById("result").textContent = out.join("\\n");
    return;
  }
  // default: toolbar
  const hist = document.querySelector('button[aria-label="Session history"]');
  const docked = btn && btn.dataset.dock === "top" && btn.parentNode === hist.parentNode;
  out.push((docked ? "ok   " : "FAIL ") + "toolbar: docks into top toolbar (dock=" + (btn && btn.dataset.dock) + ")");
  out.push((btn && btn.textContent.trim() === "\\u21cc" ? "ok   " : "FAIL ") + "toolbar: compact icon label when docked");
  btn.click();
  out.push((document.documentElement.getAttribute("data-rtlx-force-all") === "rtl" ? "ok   " : "FAIL ") + "toolbar: click cycles to rtl");
  document.querySelector(".topbar").remove();
  document.body.appendChild(document.createElement("span")); // nudge the observer
  setTimeout(() => {
    const b2 = g();
    out.push((b2 && b2.dataset.dock === "float" ? "ok   " : "FAIL ") + "toolbar: falls back to floating when toolbar gone");
    out.push((b2 && b2.textContent.indexOf("RTL") !== -1 ? "ok   " : "FAIL ") + "toolbar: shows text label when floating");
    document.getElementById("result").textContent = out.join("\\n");
  }, 400);
}, 400);
</script>`;

function run(settings) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rtlx-toggle-"));
  const file = path.join(dir, "toggle.html");
  fs.writeFileSync(file, pageFor(settings), "utf8");
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

const MODES = [
  { togglePlacement: "toolbar", enabled: true },
  { togglePlacement: "floating", enabled: true },
  { togglePlacement: "hidden", enabled: true },
];

let total = 0;
let failed = 0;
for (const settings of MODES) {
  console.log(`\n[${settings.togglePlacement}]`);
  const lines = run(settings);
  for (const line of lines) console.log("  " + line);
  total += lines.length;
  failed += lines.filter((l) => l.startsWith("FAIL")).length;
}

if (failed) {
  console.error(`\nFAIL: ${failed}/${total} toggle placement case(s) regressed`);
  process.exit(1);
}
console.log(`\nPASS: ${total} toggle placement cases across ${MODES.length} modes`);
