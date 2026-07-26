/* DOM-level regression test for the engine's Phase-1 features:
 *   1. native-dir coexistence — a container the SITE already dir'd gets NO
 *      data-rtlx-seen and no attributes from us;
 *   2. math/LaTeX isolation — bare arithmetic and $x^2$ inside RTL prose get
 *      wrapped in LTR [data-rtlx-island] spans, currency stays untouched, and
 *      streaming messages are deferred until data-is-streaming clears;
 *   3. tables — standalone RTL tables get data-rtlx-table, counter-flow cells
 *      get data-rtlx-cell;
 *   4. teardown removes every trace and unwraps islands losslessly.
 *
 * Runs the real rtl-math.js + rtl-engine.js in headless Chrome; skips cleanly
 * when Chrome is absent.  Run: node tests/engine-dom.test.js */
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
  console.log("SKIP: engine DOM test (no Chrome/Chromium found)");
  process.exit(0);
}

const mathJs = path.join(__dirname, "../src/rtl-math.js");
const engineJs = path.join(__dirname, "../src/rtl-engine.js");

const page = `<meta charset="utf-8">
<script src="file://${mathJs}"><\/script>
<script src="file://${engineJs}"><\/script>

<!-- 1: the site already set dir="rtl" — we must add nothing -->
<div class="msg" id="f1" dir="rtl"><p>این متن فارسی است و سایت خودش جهتش را درست کرده است.</p></div>

<!-- 2: no native dir — we stamp SEEN on the container -->
<div class="msg" id="f2">
  <p>این متن فارسی است و جهتی ندارد پس موتور باید کانتینر را علامت بزند.</p>
  <p id="p-math">حاصل جمع 2 + 3 = 5 است و همین را می‌خواستیم.</p>
  <p id="p-tex">قیمت آن $5.99 است ولی تابع $x^2$ ریاضی است.</p>
</div>

<!-- 5: streaming message — islands must wait for the stream to end -->
<div class="msg" id="f5" data-is-streaming="true"><p id="p-stream">در حال تولید 4 - 1 = 3 هستیم الان</p></div>

<!-- 6: table inside a SEEN message with one English cell -->
<div class="msg" id="f6">
  <p>جدول زیر فارسی است و پیام هم فارسی است تا کانتینر علامت بخورد.</p>
  <table id="t1"><thead><tr><th>نام</th><th>توضیح</th></tr></thead>
  <tbody><tr><td>ابزار</td><td id="cell-en">GitHub Actions</td></tr></tbody></table>
</div>

<!-- 7: standalone table — mixed cells stay under the SEEN threshold, but the
     cells CONTAIN Persian, so the table itself must flip via data-rtlx-table -->
<div class="msg" id="f7">
  <table id="t2"><thead><tr><th>Item نام</th><th>Price قیمت</th></tr></thead>
  <tbody><tr><td>Widget A</td><td>100</td></tr></tbody></table>
</div>

<pre id="result"></pre>
<script>
const out = [];
function check(name, cond) { out.push((cond ? "ok   " : "FAIL ") + name); }
const S = { threshold: 0.1, contentSelector: ".msg" };

// --- 1+2: native coexistence vs normal stamping ---
RTLX.processSubtree(document.getElementById("f1"), S);
RTLX.processSubtree(document.getElementById("f2"), S);
const f1 = document.getElementById("f1");
check("native dir container: no data-rtlx-seen", !f1.hasAttribute("data-rtlx-seen"));
check("native dir container: only its own dir attribute", f1.attributes.length === 3 /* class,id,dir */);
check("native dir untouched", f1.getAttribute("dir") === "rtl");
check("plain container gets data-rtlx-seen", document.getElementById("f2").hasAttribute("data-rtlx-seen"));

// --- 3: math islands ---
RTLX.isolateMath(document.getElementById("f2"), S);
const islands2 = document.getElementById("p-math").querySelectorAll("[data-rtlx-island]");
check("arithmetic wrapped in one island", islands2.length === 1 && islands2[0].textContent === "2 + 3 = 5");
check("island is LTR-isolated inline", islands2.length === 1 && islands2[0].style.direction === "ltr" && islands2[0].style.unicodeBidi === "isolate");
const texIslands = [...document.getElementById("p-tex").querySelectorAll("[data-rtlx-island]")].map(s => s.textContent);
check("$x^2$ isolated, $5.99 untouched", JSON.stringify(texIslands) === JSON.stringify(["$x^2$"]));
check("paragraph text unchanged by wrapping", document.getElementById("p-math").textContent === "حاصل جمع 2 + 3 = 5 است و همین را می‌خواستیم.");

// --- streaming deferral ---
const f5 = document.getElementById("f5");
RTLX.processSubtree(f5, S);
RTLX.isolateMath(f5, S);
check("streaming: no island yet", f5.querySelectorAll("[data-rtlx-island]").length === 0);
f5.removeAttribute("data-is-streaming");
RTLX.isolateMath(f5, S);
check("stream ended: island appears", f5.querySelectorAll("[data-rtlx-island]").length === 1);

// --- tables ---
RTLX.processSubtree(document.getElementById("f6"), S);
check("cell in RTL table wins back LTR", document.getElementById("cell-en").getAttribute("data-rtlx-cell") === "ltr");
RTLX.processSubtree(document.getElementById("f7"), { threshold: 0.9, contentSelector: ".msg" });
check("standalone mixed table flips via data-rtlx-table", document.getElementById("t2").getAttribute("data-rtlx-table") === "rtl");

// --- teardown ---
RTLX.teardown(document);
check("teardown: no seen/island/table/cell markers left",
  document.querySelectorAll("[data-rtlx-seen], [data-rtlx-island], [data-rtlx-table], [data-rtlx-cell]").length === 0);
check("teardown: island text merged back", document.getElementById("p-math").textContent === "حاصل جمع 2 + 3 = 5 است و همین را می‌خواستیم.");
check("teardown: native dir still untouched", f1.getAttribute("dir") === "rtl");

document.getElementById("result").textContent = out.join("\\n");
<\/script>`;

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rtlx-engine-"));
const file = path.join(dir, "engine.html");
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
if (!m || !m[1].trim()) {
  console.error("FAIL: the harness produced no result block (script error?)");
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
  console.error(`\nFAIL: ${failed}/${lines.length} engine DOM case(s) regressed`);
  process.exit(1);
}
console.log(`\nPASS: ${lines.length} engine DOM cases`);
