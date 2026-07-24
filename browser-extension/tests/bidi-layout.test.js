/* Layout regression test for the bidi base direction.
 *
 * Claude ships `unicode-bidi: plaintext` on p/li/h1-h6/blockquote/td/th, which
 * makes the browser take each paragraph's base direction from its FIRST STRONG
 * character and ignore `direction` altogether. Without an explicit
 * `unicode-bidi: isolate` in our own rules, a Persian paragraph that opens with
 * an English word ("authorization اصلاً ...") resolves to an LTR base and that
 * word lands at the far left — visually the END of an RTL sentence.
 *
 * This asserts real rendered geometry, so it catches the regression that
 * reading the CSS cannot. Needs Chrome; skips cleanly when it is absent.
 *
 * Run: node tests/bidi-layout.test.js
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
  console.log("SKIP: bidi layout test (no Chrome/Chromium found)");
  process.exit(0);
}

const browserCss = path.join(__dirname, "../src/styles.css");
const vscodeCss = path.join(__dirname, "../../vscode-extension/assets/styles.css");

const EN_FIRST = "authorization اصلاً وجود نداره. الان هر کاربر لاگین‌کرده دسترسی داره.";
const FA_FIRST = "در واقع authorization وجود نداره و هر کاربر دسترسی داره.";
const EN_ONLY = "authorization is missing for every logged-in user right now.";

// [name, marker attribute on the wrapper, text, probed word, expected side]
const CASES = [
  ["auto-detect   | EN-first", 'data-rtlx-seen="1"', EN_FIRST, "authorization", "RIGHT"],
  ["auto-detect   | FA-first", 'data-rtlx-seen="1"', FA_FIRST, "در واقع", "RIGHT"],
  ["force-all=rtl | EN-first", 'data-rtlx-force-all="rtl"', EN_FIRST, "authorization", "RIGHT"],
  ["force-all=ltr | FA-first", 'data-rtlx-force-all="ltr"', FA_FIRST, "در واقع", "LEFT"],
  ["per-msg force | EN-first", 'data-rtlx-force="rtl"', EN_FIRST, "authorization", "RIGHT"],
  ["untouched     | EN-only ", "", EN_ONLY, "authorization", "LEFT"],
];

const page = `<meta charset="utf-8">
<link rel="stylesheet" href="file://${browserCss}">
<link rel="stylesheet" href="file://${vscodeCss}">
<style>
  body { margin: 0; font: 16px system-ui; }
  .case { width: 620px; }
  /* Verbatim from Claude's own bundle. */
  .root_-a7MRw :is(p, li, h1, h2, h3, h4, h5, h6, blockquote, td, th) { unicode-bidi: plaintext; }
</style>
<div id="cases"></div>
<pre id="result"></pre>
<script>
const CASES = ${JSON.stringify(CASES)};
const host = document.getElementById("cases");
const out = [];
for (const [name, marker, text, word, want] of CASES) {
  const wrap = document.createElement("div");
  wrap.className = "case root_-a7MRw";
  wrap.innerHTML = "<div " + marker + "><p></p></div>";
  const p = wrap.querySelector("p");
  p.textContent = text;
  host.appendChild(wrap);

  // Probe the first logical word's real position without perturbing layout.
  const range = document.createRange();
  const idx = text.indexOf(word);
  range.setStart(p.firstChild, idx);
  range.setEnd(p.firstChild, idx + word.length);
  const wb = range.getBoundingClientRect();
  const pb = p.getBoundingClientRect();
  const side = (wb.left + wb.right) / 2 < (pb.left + pb.right) / 2 ? "LEFT" : "RIGHT";
  out.push((side === want ? "ok   " : "FAIL ") + name + "  firstWord=" + side + " want=" + want);
}
document.getElementById("result").textContent = out.join("\\n");
</script>`;

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rtlx-bidi-"));
const file = path.join(dir, "bidi.html");
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

for (const line of lines) console.log("  " + line);

const failed = lines.filter((l) => l.startsWith("FAIL")).length;
if (failed) {
  console.error(`\nFAIL: ${failed}/${lines.length} bidi layout case(s) regressed`);
  process.exit(1);
}
console.log(`\nPASS: ${lines.length} bidi layout cases`);
