/* Per-message direction toggle: one button per message, and it must actually
 * flip the text.
 *
 * A user message matches the driver's message selector twice (the outer
 * userMessageContainer_ and the inner userMessage_ bubble), which stacked two
 * buttons in the same corner. And the [data-rtlx-force] rules only targeted
 * prose tags, so clicking the toggle on a plain-text user bubble (Claude renders
 * that text as a bare <span dir="auto">, no <p>) set the attribute but changed
 * nothing on screen.
 *
 * Needs Chrome; skips cleanly when it is absent.
 * Run: node tests/message-toggle.test.js
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
  console.log("SKIP: message toggle test (no Chrome/Chromium found)");
  process.exit(0);
}

const css = path.join(__dirname, "../assets/styles.css");
const driver = path.join(__dirname, "../assets/driver.js");

// A pasted stack trace followed by a short Persian note — overwhelmingly Latin,
// so auto-detection deliberately leaves it LTR. That is exactly the case where
// the manual toggle is the only way to flip it, and where it used to do nothing.
const logLines = Array.from(
  { length: 40 },
  () => "qk https://example.com/assets/index-diovml-t.js:25",
).join("\n");

const page = `<meta charset="utf-8">
<link rel="stylesheet" href="file://${css}">
<style>html,body{margin:0;width:700px}</style>

<div id="m1" class="message_07S1Yg userMessageContainer_07S1Yg"><div id="bubble" class="userMessage_07S1Yg">
  <div class="content_xGDvVg"><span id="txt" dir="auto">GET https://images.example.com/photo?w=300 NS_BINDING_ABORTED
TypeError: e.map is not a function at index-abc.js:385
${logLines}

صفحه سفید میاد واسم
و نکته بعدی این سرویس‌ها یکم لگیه</span></div>
</div></div>

<pre id="result"></pre>
<script>window.__RTLX_SETTINGS = { enabled: true, showToggles: true };</script>
<script src="file://${driver}"></script>
<script>
setTimeout(function () {
  var out = [];
  var m1 = document.getElementById("m1");
  var txt = document.getElementById("txt");

  // 1. Exactly one toggle button for this message, not one per nested match.
  var toggles = m1.querySelectorAll(".rtlx-toggle");
  out.push((toggles.length === 1 ? "ok   " : "FAIL ") + "one toggle per message (found " + toggles.length + ")");

  // 2. A mostly-English message is left alone by auto-detection.
  out.push((getComputedStyle(txt).direction === "ltr" ? "ok   " : "FAIL ") +
    "mostly-English message stays LTR by default");

  var btn = toggles[0];
  if (!btn) {
    document.getElementById("result").textContent = out.join("\\n");
    return;
  }

  // 3. First click -> RTL, and the plain-text span must actually flip.
  btn.click();
  out.push((getComputedStyle(txt).direction === "rtl" ? "ok   " : "FAIL ") +
    "click 1 flips the bubble text to RTL (got " + getComputedStyle(txt).direction + ")");

  // 4. Second click -> LTR.
  btn.click();
  out.push((getComputedStyle(txt).direction === "ltr" ? "ok   " : "FAIL ") +
    "click 2 forces LTR (got " + getComputedStyle(txt).direction + ")");

  // 5. Third click -> back to auto (attribute cleared).
  btn.click();
  out.push((!m1.hasAttribute("data-rtlx-force") ? "ok   " : "FAIL ") +
    "click 3 returns to auto");

  document.getElementById("result").textContent = out.join("\\n");
}, 500);
</script>`;

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rtlx-toggle2-"));
const file = path.join(dir, "t.html");
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
      "--virtual-time-budget=3000",
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
for (const l of lines) console.log("  " + l);

const failed = lines.filter((l) => l.startsWith("FAIL")).length;
if (failed) {
  console.error(`\nFAIL: ${failed}/${lines.length} message-toggle case(s) regressed`);
  process.exit(1);
}
console.log(`\nPASS: ${lines.length} message-toggle cases`);
