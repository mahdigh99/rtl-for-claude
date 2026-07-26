/* Math isolation + table direction + native-dir coexistence in the VS Code
 * drivers (Phase 2 mirror of the browser engine, backlog items 1.3/1.4/3.2).
 *
 * Drives the REAL rtl-math.js + driver.js + styles.css of each package in
 * headless Chrome and asserts:
 *   • bare arithmetic ("2 + 3 = 5") inside a Persian block is wrapped in an
 *     LTR-isolated [data-rtlx-island] span (and actually computes to ltr);
 *   • currency ("$5.99") is NOT treated as math;
 *   • real inline LaTeX ("$x^2$") IS isolated;
 *   • a Persian-column table is flipped (data-rtlx-table / SEEN) and an
 *     English counter-flow cell wins its direction back (data-rtlx-cell);
 *   • a container whose dir was set by the APP is left alone (no SEEN /
 *     no .rtlx-rtl) — the coexistence rule;
 *   • without rtl-math.js the driver still runs and simply produces no
 *     islands (graceful no-op).
 *
 * Needs Chrome; skips cleanly when it is absent.
 * Run: node tests/driver-math.test.js
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
  console.log("SKIP: driver math test (no Chrome/Chromium found)");
  process.exit(0);
}

const CLAUDE = {
  css: path.join(__dirname, "../assets/styles.css"),
  math: path.join(__dirname, "../assets/rtl-math.js"),
  driver: path.join(__dirname, "../assets/driver.js"),
};
const CODEX = {
  css: path.join(__dirname, "../../vscode-extension-codex/assets/styles.css"),
  math: path.join(__dirname, "../../vscode-extension-codex/assets/rtl-math.js"),
  driver: path.join(__dirname, "../../vscode-extension-codex/assets/driver.js"),
};

// Persian filler so every block clears the 0.1 RTL ratio easily.
const FA = "این یک پاراگراف کاملاً فارسی برای آزمایش جهت متن است";

const claudePage = (withMath) => `<meta charset="utf-8">
<link rel="stylesheet" href="file://${CLAUDE.css}">
<style>html,body{margin:0;width:700px}</style>

<div class="message_a1"><p id="arith">${FA} 2 + 3 = 5 و همچنین ۲ + ۳ = ۵</p></div>
<div class="message_a2"><p id="money">${FA} قیمت $5.99 است</p></div>
<div class="message_a3"><p id="latex">${FA} $x^2 + y^2$ است</p></div>
<div class="message_a4" id="native" dir="rtl"><p>${FA}</p></div>
<div class="message_a5">
  <table id="seen-table">
    <thead><tr><th>نام</th><th>توضیح</th></tr></thead>
    <tbody>
      <tr><td>علی</td><td>${FA}</td></tr>
      <tr><td id="counter-cell">plain English cell</td><td>${FA}</td></tr>
    </tbody>
  </table>
</div>
<table id="standalone">
  <thead><tr><th>ستون</th><th>دیگر</th></tr></thead>
  <tbody><tr><td>مقدار</td><td>Latin</td></tr></tbody>
</table>

<pre id="result"></pre>
${withMath ? `<script src="file://${CLAUDE.math}"></script>` : ""}
<script src="file://${CLAUDE.driver}"></script>
<script>
const out = [];
const t = (cond, msg) => out.push((cond ? "ok   " : "FAIL ") + msg);
setTimeout(() => {
  const islands = (el) => el.querySelectorAll("[data-rtlx-island]");
  const arith = document.getElementById("arith");
  const money = document.getElementById("money");
  const latex = document.getElementById("latex");
  if (${JSON.stringify(withMath)}) {
    t(document.querySelector(".message_a1").hasAttribute("data-rtlx-seen"), "Persian message marked SEEN");
    const isl = islands(arith);
    t(isl.length >= 2, "ASCII + Persian-digit arithmetic wrapped in islands (got " + isl.length + ")");
    t(isl.length >= 1 && getComputedStyle(isl[0]).direction === "ltr", "island computes direction:ltr");
    t(islands(money).length === 0, "currency $5.99 left alone");
    const lisl = islands(latex);
    t(lisl.length === 1 && lisl[0].textContent.indexOf("x^2") !== -1, "inline $x^2$ LaTeX isolated");
    const cell = document.getElementById("counter-cell");
    t(cell.getAttribute("data-rtlx-cell") === "ltr", "English cell in RTL table gets data-rtlx-cell=ltr");
    t(getComputedStyle(cell).direction === "ltr", "counter-flow cell computes ltr");
    const st = document.getElementById("standalone");
    t(st.getAttribute("data-rtlx-table") === "rtl", "standalone Persian table gets data-rtlx-table=rtl");
    t(getComputedStyle(st).direction === "rtl", "standalone table computes rtl");
  } else {
    t(document.querySelectorAll("[data-rtlx-island]").length === 0, "no islands without rtl-math.js");
    t(document.querySelector(".message_a1").hasAttribute("data-rtlx-seen"), "driver still marks SEEN without rtl-math.js");
  }
  t(!document.getElementById("native").hasAttribute("data-rtlx-seen"), "native dir=rtl container left alone (no SEEN)");
  document.getElementById("result").textContent = out.join("\\n");
}, 600);
</script>`;

const codexPage = () => `<meta charset="utf-8">
<link rel="stylesheet" href="file://${CODEX.css}">
<style>html,body{margin:0;width:700px}</style>

<div data-virtualized-turn-content>
  <div class="_markdownContent_x1y">
    <p id="arith" class="_paragraph_x1y">${FA} 2 + 3 = 5</p>
    <p id="money" class="_paragraph_x1y">${FA} قیمت $5.99 است</p>
    <p id="native" class="_paragraph_x1y" dir="rtl">${FA}</p>
    <table id="fa-table">
      <thead><tr><th>نام</th><th>توضیح</th></tr></thead>
      <tbody>
        <tr><td>علی</td><td>${FA}</td></tr>
        <tr><td id="counter-cell">plain English cell</td><td>${FA}</td></tr>
      </tbody>
    </table>
  </div>
</div>

<pre id="result"></pre>
<script src="file://${CODEX.math}"></script>
<script src="file://${CODEX.driver}"></script>
<script>
const out = [];
const t = (cond, msg) => out.push((cond ? "ok   " : "FAIL ") + msg);
setTimeout(() => {
  const arith = document.getElementById("arith");
  t(arith.classList.contains("rtlx-rtl"), "Persian paragraph marked rtlx-rtl");
  const isl = arith.querySelectorAll("[data-rtlx-island]");
  t(isl.length === 1 && isl[0].textContent === "2 + 3 = 5", "arithmetic wrapped in an island");
  t(isl.length === 1 && getComputedStyle(isl[0]).direction === "ltr", "island computes direction:ltr");
  t(document.getElementById("money").querySelectorAll("[data-rtlx-island]").length === 0, "currency $5.99 left alone");
  t(!document.getElementById("native").classList.contains("rtlx-rtl"), "native dir=rtl paragraph left alone (no rtlx-rtl)");
  const ft = document.getElementById("fa-table");
  t(ft.getAttribute("data-rtlx-table") === "rtl", "Persian table gets data-rtlx-table=rtl");
  t(getComputedStyle(ft).direction === "rtl", "table computes rtl");
  const cell = document.getElementById("counter-cell");
  t(cell.getAttribute("data-rtlx-cell") === "ltr", "English cell wins its direction back");
  t(getComputedStyle(cell).direction === "ltr", "counter-flow cell computes ltr");
  document.getElementById("result").textContent = out.join("\\n");
}, 600);
</script>`;

function run(html) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rtlx-math-"));
  const file = path.join(dir, "math.html");
  fs.writeFileSync(file, html, "utf8");
  let dom;
  try {
    dom = execFileSync(
      chrome,
      [
        "--headless",
        "--disable-gpu",
        "--no-sandbox",
        "--allow-file-access-from-files",
        "--virtual-time-budget=5000",
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

const CASES = [
  { name: "claude driver + rtl-math", html: claudePage(true) },
  { name: "claude driver WITHOUT rtl-math (graceful no-op)", html: claudePage(false) },
  { name: "codex driver + rtl-math", html: codexPage() },
];

let total = 0;
let failed = 0;
for (const c of CASES) {
  console.log(`\n[${c.name}]`);
  const lines = run(c.html);
  for (const line of lines) console.log("  " + line);
  total += lines.length;
  failed += lines.filter((l) => l.startsWith("FAIL")).length;
}

if (failed) {
  console.error(`\nFAIL: ${failed}/${total} driver math case(s) regressed`);
  process.exit(1);
}
console.log(`\nPASS: ${total} driver math cases across ${CASES.length} pages`);
