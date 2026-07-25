/* Regression test for `dir="auto"` inside chat messages.
 *
 * Claude renders user-message text as `<span dir="auto">…</span>`. The dir
 * attribute takes the direction from the FIRST STRONG character and outranks the
 * `direction` we set on the message bubble, so a Persian message that opened
 * with a URL or an English word rendered left-to-right — the whole previous
 * message stayed LTR even though the bubble was marked RTL.
 *
 * Drives the real driver.js + styles.css against the real class names, and also
 * pins the two things the fix must NOT break: code stays LTR, and a genuinely
 * English message is left alone.
 *
 * Needs Chrome; skips cleanly when it is absent.
 * Run: node tests/dir-auto.test.js
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
  console.log("SKIP: dir=auto test (no Chrome/Chromium found)");
  process.exit(0);
}

const css = path.join(__dirname, "../assets/styles.css");
const driver = path.join(__dirname, "../assets/driver.js");

// Real class names from the Claude Code webview bundle.
const page = `<meta charset="utf-8">
<link rel="stylesheet" href="file://${css}">
<style>html,body{margin:0;width:700px}</style>

<div class="message_07S1Yg userMessageContainer_07S1Yg"><div class="userMessage_07S1Yg">
  <div class="content_xGDvVg"><span id="s1" dir="auto">https://github.com/orgs/example/repositories
آپدیت کنه که cloudflare pages میشه یه ریپو هم ساخته توی این و هربار که پوش کردیم خود این سایتو؟</span></div>
</div></div>

<div class="message_07S1Yg userMessageContainer_07S1Yg"><div class="userMessage_07S1Yg">
  <div class="content_xGDvVg"><span id="s2" dir="auto">سلام این پیام با فارسی شروع می‌شود</span></div>
</div></div>

<div class="message_07S1Yg"><div class="content_xGDvVg">
  <p id="p1">این یک پاسخ فارسی است که کد هم دارد</p>
  <pre><code><span id="s3" dir="auto">npm run build --watch</span></code></pre>
</div></div>

<div class="message_07S1Yg userMessageContainer_07S1Yg"><div class="userMessage_07S1Yg">
  <div class="content_xGDvVg"><span id="s4" dir="auto">This is a purely English message, it must stay LTR</span></div>
</div></div>

<pre id="result"></pre>
<script>window.__RTLX_SETTINGS = { enabled: true };</script>
<script src="file://${driver}"></script>
<script>
setTimeout(function () {
  var cases = [
    ["s1", "Persian message opening with a URL", "rtl"],
    ["s2", "Persian message opening in Persian", "rtl"],
    ["s3", "dir=auto span inside <pre><code>", "ltr"],
    ["s4", "purely English message", "ltr"],
  ];
  var out = [];
  cases.forEach(function (c) {
    var el = document.getElementById(c[0]);
    var got = getComputedStyle(el).direction;
    out.push((got === c[2] ? "ok   " : "FAIL ") + c[1] + " -> " + got + " (want " + c[2] + ")");
  });
  document.getElementById("result").textContent = out.join("\\n");
}, 500);
</script>`;

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rtlx-dirauto-"));
const file = path.join(dir, "d.html");
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
  console.error(`\nFAIL: ${failed}/${lines.length} dir=auto case(s) regressed`);
  process.exit(1);
}
console.log(`\nPASS: ${lines.length} dir=auto cases`);
