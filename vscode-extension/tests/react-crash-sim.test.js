/* End-to-end simulation of the React reconciliation crash the DOM guard
 * exists for — against the REAL driver, in REAL Chrome, on the real DOM.
 *
 * React keeps references to the DOM nodes it created (fiber stateNodes) and
 * later commits against those SAVED references: nodeValue writes, and
 * insertBefore/removeChild with the saved node as argument. When the driver
 * wraps a text node into a math island, the saved reference goes stale, and
 * every one of those commits either throws (the "Something went wrong …
 * insertBefore/removeChild" screen) or silently updates a node that is no
 * longer on screen (invisible typing in the composer).
 *
 * This test replays exactly those commits:
 *   • guarded page — the shipped driver: stale insertBefore/removeChild must
 *     NOT throw, the inserted node must land in the tree, a node the app asks
 *     to remove must actually leave its REAL parent (no ghost text), and the
 *     composer mirror's text node must still be the live, on-screen node so
 *     typing stays visible;
 *   • unguarded page — same driver with the guard pre-disabled
 *     (window.__rtlxDomGuard = true before it loads): the SAME stale commits
 *     MUST throw the native DOMException. This proves the simulation really
 *     reproduces the user-visible crash, so the green run above means
 *     something.
 *
 * Needs Chrome; skips cleanly when it is absent.
 * Run: node tests/react-crash-sim.test.js
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
  console.log("SKIP: react crash sim (no Chrome/Chromium found)");
  process.exit(0);
}

const ASSETS = {
  css: path.join(__dirname, "../assets/styles.css"),
  math: path.join(__dirname, "../assets/rtl-math.js"),
  driver: path.join(__dirname, "../assets/driver.js"),
};

// Persian filler so the message clears the 0.1 RTL ratio and gets wrapped.
const FA = "این یک پاراگراف کاملاً فارسی برای آزمایش جهت متن است";

const page = (guarded) => `<meta charset="utf-8">
<link rel="stylesheet" href="file://${ASSETS.css}">

<div class="message_a1"><p id="arith">${FA} 2 + 3 = 5</p></div>

<div dir="rtl">
  <div class="inputContainer_c1">
    <div class="mentionMirror_m1" id="mirror">${FA} قیمت $12 + 3</div>
  </div>
</div>

<div id="ghost-old"><span id="ghost-child">ghost?</span></div>
<div id="ghost-new"></div>

<pre id="result"></pre>
<script>
// React saves its stateNode references BEFORE anything rewrites the DOM.
window.savedMsgText = document.getElementById("arith").firstChild;
window.savedMirrorText = document.getElementById("mirror").firstChild;
${guarded ? "" : "window.__rtlxDomGuard = true; // pre-claim the flag: the driver skips installing"}
</script>
<script src="file://${ASSETS.math}"></script>
<script src="file://${ASSETS.driver}"></script>
<script>
const out = [];
const t = (cond, msg) => out.push((cond ? "ok   " : "FAIL ") + msg);
setTimeout(() => {
  const p = document.getElementById("arith");
  // Precondition for the whole scenario: the driver really wrapped the
  // message text node, so React's saved reference is stale.
  t(p.querySelectorAll("[data-rtlx-island]").length >= 1, "precondition: message arithmetic got wrapped");
  t(window.savedMsgText.parentNode === null, "precondition: React's saved text reference went stale");

  if (${JSON.stringify(guarded)}) {
    // -- commitPlacement with a stale ref must not throw, node must land --
    const placed = document.createElement("span");
    placed.id = "placed";
    let threw = null;
    try { p.insertBefore(placed, window.savedMsgText); } catch (e) { threw = e; }
    t(!threw, "stale insertBefore does not throw (was: " + (threw && threw.message) + ")");
    t(placed.parentNode === p, "…and the inserted node still lands in the parent");

    // -- commitDeletion with a stale ref must not throw --
    threw = null;
    try { p.removeChild(window.savedMsgText); } catch (e) { threw = e; }
    t(!threw, "stale removeChild does not throw");

    // -- a removal must really remove: no ghost text left on screen --
    const child = document.getElementById("ghost-child");
    const oldParent = document.getElementById("ghost-old");
    document.getElementById("ghost-new").appendChild(child); // node got moved
    threw = null;
    try { oldParent.removeChild(child); } catch (e) { threw = e; }
    t(!threw, "removeChild on a re-parented node does not throw");
    t(!child.parentNode && !document.getElementById("ghost-child"),
      "…and the node really left the screen (no ghost text)");

    // -- the composer: typing must stay VISIBLE --
    const mirror = document.getElementById("mirror");
    t(window.savedMirrorText.parentNode === mirror,
      "composer mirror text node is still the live on-screen node");
    window.savedMirrorText.nodeValue = "TYPED-AFTER-SWEEP";
    t(mirror.textContent === "TYPED-AFTER-SWEEP",
      "a keystroke committed via the saved reference is visible on screen");
  } else {
    // Unguarded: the SAME commits must reproduce the user-visible crash.
    let threw = null;
    try { p.insertBefore(document.createElement("span"), window.savedMsgText); } catch (e) { threw = e; }
    t(!!threw && String(threw).indexOf("insertBefore") !== -1,
      "without the guard, stale insertBefore throws the native error (got: " + threw + ")");
    threw = null;
    try { p.removeChild(window.savedMsgText); } catch (e) { threw = e; }
    t(!!threw && String(threw).indexOf("removeChild") !== -1,
      "without the guard, stale removeChild throws the native error");
  }
  document.getElementById("result").textContent = out.join("\\n");
}, 600);
</script>`;

function run(html) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rtlx-crash-"));
  const file = path.join(dir, "sim.html");
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
  { name: "guarded driver survives React's stale commits", html: page(true) },
  { name: "unguarded driver reproduces the crash (sim is faithful)", html: page(false) },
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
  console.error(`\nFAIL: ${failed}/${total} crash-sim case(s) regressed`);
  process.exit(1);
}
console.log(`\nPASS: ${total} crash-sim cases across 2 pages`);
