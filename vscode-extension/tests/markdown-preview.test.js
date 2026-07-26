/* Markdown-preview RTL (media/markdown-rtl.js + .css, wired through the
 * official markdown.previewStyles / markdown.previewScripts points).
 *
 * Node part (always runs):
 *   - package.json really contributes both files and they exist;
 *   - the RTL/LTR character classes are byte-identical to the engine's
 *     (browser-extension/src/rtl-engine.js is the source of truth — the
 *     whole point of this feature is NOT being a Hebrew-only regex).
 *
 * Chrome part (skips cleanly without Chrome): renders a preview-like fixture
 * and asserts per-block direction, ratio detection (an English-leading Persian
 * paragraph still flips), counter-flow blocks, authored-dir respect, LTR code
 * inside RTL flow, logical-property geometry, MutationObserver re-apply, and
 * stamp cleanup when an edit removes the last RTL text.
 *
 * Run: node tests/markdown-preview.test.js
 */
const assert = require("assert");
const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const JS_PATH = path.join(ROOT, "media/markdown-rtl.js");
const CSS_PATH = path.join(ROOT, "media/markdown-rtl.css");

// --- part 1: wiring + char-class sync (no browser needed) -------------------

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
assert.deepStrictEqual(
  pkg.contributes["markdown.previewStyles"],
  ["./media/markdown-rtl.css"],
  "package.json must contribute markdown.previewStyles"
);
assert.deepStrictEqual(
  pkg.contributes["markdown.previewScripts"],
  ["./media/markdown-rtl.js"],
  "package.json must contribute markdown.previewScripts"
);
const mdJs = fs.readFileSync(JS_PATH, "utf8");
const mdCss = fs.readFileSync(CSS_PATH, "utf8");

const engine = fs.readFileSync(
  path.join(ROOT, "../browser-extension/src/rtl-engine.js"),
  "utf8"
);
function extract(src, name, file) {
  const m = src.match(new RegExp(name + '\\s*=\\s*"([^"]+)"'));
  assert.ok(m, `${name} not found in ${file}`);
  return m[1];
}
assert.strictEqual(
  extract(mdJs, "RTL_CHARS", "markdown-rtl.js"),
  extract(engine, "RTL_CHARS", "rtl-engine.js"),
  "markdown-rtl.js RTL_CHARS drifted from rtl-engine.js"
);
assert.strictEqual(
  extract(mdJs, "LTR_CHARS", "markdown-rtl.js"),
  extract(engine, "LTR_CHARS", "rtl-engine.js"),
  "markdown-rtl.js LTR_CHARS drifted from rtl-engine.js"
);
// The reference implementation this feature replaces detected Hebrew only —
// make regressing to that impossible to miss.
assert.ok(/[؀-ۿ]/.test(extract(mdJs, "RTL_CHARS", "markdown-rtl.js")),
  "RTL class must cover Arabic-script languages, not just Hebrew");
assert.ok(/unicode-bidi:\s*isolate/.test(mdCss), "css must isolate code runs");
assert.ok(/border-inline-start/.test(mdCss) && /padding-inline-start/.test(mdCss),
  "css must use logical properties for the blockquote border and list padding");
console.log("PASS: contribution wiring + engine char-class sync (6 checks)");

// --- part 2: rendered behaviour (headless Chrome) ----------------------------

const CHROME_CANDIDATES = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
];
const chrome = CHROME_CANDIDATES.find((p) => fs.existsSync(p));
if (!chrome) {
  console.log("SKIP: markdown-preview DOM checks (no Chrome/Chromium found)");
  process.exit(0);
}

const MAIN_FIXTURE = `
<div class="markdown-body">
  <p id="fa">این یک بندِ فارسی است که باید راست‌چین شود.</p>
  <p id="mixedLead">Authorization اصلاً مهم است چون کلِ جمله فارسی است و باید راست‌چین بماند.</p>
  <p id="en">A purely English paragraph that must stay untouched.</p>
  <p id="he">שלום עולם — בדיקה קצרה בעברית.</p>
  <p id="ur">یہ اردو کا ایک پیراگراف ہے۔</p>
  <p id="authored" dir="ltr">متن فارسی که نویسنده خودش dir گذاشته است.</p>
  <ul id="list">
    <li id="liFa">قلمِ اولِ فهرست به فارسی</li>
    <li id="liEn">An English item inside the Persian list</li>
  </ul>
  <blockquote id="quote">
    <p id="quoteFa">نقل‌قولِ فارسی برای آزمایشِ کنارهٔ بلوک.</p>
    <pre id="pre"><code>const x = 1; // کد</code></pre>
  </blockquote>
  <table id="table">
    <tr><th id="thFa">ستون</th><th>دوم</th></tr>
    <tr><td id="tdFa">مقدارِ فارسی</td><td id="tdEn">plain English value</td></tr>
  </table>
  <p id="math">فرمول: <span class="katex-display"><span class="katex"><p id="katexInner">x=1</p></span></span></p>
</div>`;

const MAIN_PROBE = `
setTimeout(function () {
  var out = [];
  var ok = function (pass, label) { out.push((pass ? "ok   " : "FAIL ") + label); };
  var $ = function (id) { return document.getElementById(id); };
  var dir = function (id) { return $(id).getAttribute("dir"); };

  ok(dir("fa") === "rtl", "Persian paragraph flips (got " + dir("fa") + ")");
  ok(dir("mixedLead") === "rtl", "English-leading Persian paragraph still flips (ratio, not first-strong)");
  ok(dir("en") === null && !$("en").hasAttribute("data-rtlx-md"), "English paragraph untouched");
  ok(dir("he") === "rtl", "Hebrew covered (full char class)");
  ok(dir("ur") === "rtl", "Urdu covered");
  ok(dir("authored") === "ltr" && !$("authored").hasAttribute("data-rtlx-md"), "authored dir respected");
  ok(dir("list") === "rtl", "Persian list container flips (bullet side)");
  ok(dir("liFa") === null, "Persian item needs no stamp of its own (inherits)");
  ok(dir("liEn") === "ltr", "counter-flow English item gets its direction back");
  ok(dir("quote") === "rtl", "blockquote flips");
  ok(dir("table") === "rtl", "Persian-majority table flips");
  ok(dir("tdEn") === "ltr", "counter-flow English cell gets its direction back");
  ok(dir("katexInner") === null, "blocks inside rendered math never touched");

  var preCS = getComputedStyle($("pre"));
  ok(preCS.direction === "ltr", "pre stays LTR inside the RTL blockquote");
  var codeCS = getComputedStyle(document.querySelector("#pre code"));
  ok(codeCS.unicodeBidi.indexOf("isolate") !== -1, "code is bidi-isolated");
  var qCS = getComputedStyle($("quote"));
  ok(qCS.borderRightWidth === "5px" && qCS.borderLeftWidth === "0px",
    "blockquote border mirrors to the right (" + qCS.borderRightWidth + "/" + qCS.borderLeftWidth + ")");
  var listCS = getComputedStyle($("list"));
  ok(listCS.paddingRight !== "0px" && listCS.paddingLeft === "0px",
    "list padding mirrors (" + listCS.paddingRight + "/" + listCS.paddingLeft + ")");

  // MutationObserver: a block added later (preview re-render) is classified.
  var late = document.createElement("p");
  late.id = "late";
  late.textContent = "بندی که بعداً اضافه شد";
  document.querySelector(".markdown-body").appendChild(late);
  setTimeout(function () {
    ok(late.getAttribute("dir") === "rtl", "late-added Persian paragraph classified by the observer");

    // In-place text edit (characterData): Persian → English must UNDO our stamp.
    $("fa").firstChild.nodeValue = "now it is plain English text";
    setTimeout(function () {
      ok($("fa").getAttribute("dir") === null && !$("fa").hasAttribute("data-rtlx-md"),
        "stamp removed when an edit turns the block LTR");
      document.getElementById("probe").textContent = out.join("\\n");
    }, 200);
  }, 200);
}, 100);`;

const CLEANUP_FIXTURE = `
<div class="markdown-body"><p id="only">تنها بندِ فارسیِ سند.</p></div>`;

const CLEANUP_PROBE = `
setTimeout(function () {
  var out = [];
  var ok = function (pass, label) { out.push((pass ? "ok   " : "FAIL ") + label); };
  var p = document.getElementById("only");
  ok(p.getAttribute("dir") === "rtl", "initially stamped");
  // The edit removes the document's LAST RTL text: the all-LTR gate must still
  // sweep stale stamps instead of returning early with them in place.
  p.firstChild.nodeValue = "every word is English now";
  setTimeout(function () {
    ok(p.getAttribute("dir") === null && !p.hasAttribute("data-rtlx-md"),
      "gate sweeps stale stamps once the document is all-LTR");
    document.getElementById("probe").textContent = out.join("\\n");
  }, 200);
}, 100);`;

function harness(fixture, probe) {
  const js = fs.readFileSync(JS_PATH, "utf8");
  const css = fs.readFileSync(CSS_PATH, "utf8");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${css}</style></head>
<body>${fixture}<pre id="probe"></pre>
<script>${js}</script>
<script>${probe}</script>
</body></html>`;
}

function run(name, fixture, probe) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rtlx-md-"));
  const file = path.join(dir, name + ".html");
  fs.writeFileSync(file, harness(fixture, probe), "utf8");
  let dom;
  try {
    dom = execFileSync(
      chrome,
      [
        "--headless", "--disable-gpu", "--no-sandbox",
        "--allow-file-access-from-files",
        "--virtual-time-budget=3000",
        "--dump-dom",
        "file://" + file,
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  const m = dom.match(/<pre id="probe">([\s\S]*?)<\/pre>/);
  if (!m || !m[1].trim()) return ["FAIL harness produced no result"];
  return m[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').trim().split("\n");
}

let total = 6; // part-1 checks already counted
let failed = 0;
for (const [name, fixture, probe] of [
  ["main", MAIN_FIXTURE, MAIN_PROBE],
  ["cleanup", CLEANUP_FIXTURE, CLEANUP_PROBE],
]) {
  console.log(`\n[${name}]`);
  const lines = run(name, fixture, probe);
  for (const l of lines) console.log("  " + l);
  total += lines.length;
  failed += lines.filter((l) => l.startsWith("FAIL")).length;
}

if (failed) {
  console.error(`\nFAIL: ${failed} markdown-preview check(s) failed`);
  process.exit(1);
}
console.log(`\nPASS: ${total} markdown-preview checks`);
