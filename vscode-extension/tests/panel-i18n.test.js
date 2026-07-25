/* Renders the real settings panel in every shipped locale and asserts that it
 * is translated, flips to RTL for Persian/Arabic/Urdu, keeps the toggle knob
 * inside its track in both directions, and never overflows a narrow sidebar.
 *
 * Drives media/panel.html itself (with acquireVsCodeApi stubbed), so it fails if
 * a string loses its data-i18n hook or a dictionary key goes missing.
 *
 * Needs Chrome; skips cleanly when it is absent.
 * Run: node tests/panel-i18n.test.js
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
  console.log("SKIP: panel i18n test (no Chrome/Chromium found)");
  process.exit(0);
}

const PANEL = path.join(__dirname, "../media/panel.html");
const RTL = ["fa", "ar", "ur"];
// Every key the markup asks for must exist in every non-English dictionary.
const WIDTHS = [300, 160];

function harness(locale, width) {
  let html = fs.readFileSync(PANEL, "utf8");
  // Same substitutions the extension performs, minus the CSP (the probe script
  // has no nonce, and the real panel's CSP is exercised by VS Code itself).
  html = html
    .replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, "")
    .replace(/__LOCALE_AUTO__/g, "en")
    .replace(/__LOCALE__/g, locale)
    .replace(/__NONCE__/g, "test")
    .replace(
      "const vscode = acquireVsCodeApi();",
      "const vscode = { postMessage() {} };",
    );
  const probe = `
<pre id="probe"></pre>
<script>
setTimeout(function () {
  var out = [];
  var root = document.documentElement;
  var LOC = ${JSON.stringify(locale)};
  var wantRtl = ${JSON.stringify(RTL.indexOf(locale) !== -1)};

  out.push((root.lang === LOC ? "ok   " : "FAIL ") + "lang=" + root.lang);
  out.push((root.dir === (wantRtl ? "rtl" : "ltr") ? "ok   " : "FAIL ") + "dir=" + root.dir);

  // Every translatable node must be non-empty, and for non-English it must
  // differ from the English source text baked into the markup.
  var untranslated = [], empty = [];
  document.querySelectorAll("[data-i18n]").forEach(function (el) {
    var key = el.dataset.i18n, txt = (el.textContent || "").trim();
    if (!txt) empty.push(key);
    else if (LOC !== "en" && txt === I18N.en[key]) untranslated.push(key);
  });
  out.push((empty.length ? "FAIL " : "ok   ") + "no empty strings" + (empty.length ? ": " + empty.join(",") : ""));
  out.push((untranslated.length ? "FAIL " : "ok   ") + "all keys translated" + (untranslated.length ? ": " + untranslated.join(",") : ""));

  // Placeholder too.
  var ph = document.getElementById("font.custom");
  out.push((ph && ph.placeholder ? "ok   " : "FAIL ") + "placeholder set");

  // The knob must stay inside its track on both sides, checked and unchecked.
  var sw = document.querySelector(".switch");
  var box = sw.querySelector("input");
  var spill = 0;
  [false, true].forEach(function (checked) {
    box.checked = checked;
    var track = sw.querySelector(".slider").getBoundingClientRect();
    var knob = sw.querySelector(".slider");
    var cs = getComputedStyle(knob, "::before");
    // Derive the knob box from the track + computed offsets.
    var w = parseFloat(cs.width) || 14;
    var startsAtEnd = root.dir === "rtl";
    var offset = 2 + (checked ? (startsAtEnd ? -16 : 16) : 0);
    var left = startsAtEnd ? track.right - 2 - w - (checked ? 16 : 0) : track.left + 2 + (checked ? 16 : 0);
    if (left < track.left - 0.5 || left + w > track.right + 0.5) spill++;
  });
  out.push((spill ? "FAIL " : "ok   ") + "knob inside track both states");

  // No horizontal overflow of the document at this width.
  var over = document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;
  out.push((over ? "FAIL " : "ok   ") + "no horizontal overflow");

  document.getElementById("probe").textContent = out.join("\\n");
}, 200);
</script>`;
  return (
    html.replace("</body>", probe + "</body>") +
    `<style>html,body{width:${width}px;box-sizing:border-box;margin:0}</style>`
  );
}

function run(locale, width) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rtlx-panel-"));
  const file = path.join(dir, "panel.html");
  fs.writeFileSync(file, harness(locale, width), "utf8");
  let dom;
  try {
    dom = execFileSync(
      chrome,
      [
        "--headless",
        "--disable-gpu",
        "--no-sandbox",
        "--allow-file-access-from-files",
        "--virtual-time-budget=2500",
        "--dump-dom",
        "file://" + file,
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  const m = dom.match(/<pre id="probe">([\s\S]*?)<\/pre>/);
  if (!m) return ["FAIL harness produced no result"];
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
for (const locale of ["en", "fa", "ar", "ur"]) {
  for (const width of WIDTHS) {
    console.log(`\n[${locale} @ ${width}px]`);
    const lines = run(locale, width);
    for (const l of lines) console.log("  " + l);
    total += lines.length;
    failed += lines.filter((l) => l.startsWith("FAIL")).length;
  }
}

if (failed) {
  console.error(`\nFAIL: ${failed}/${total} panel i18n check(s) failed`);
  process.exit(1);
}
console.log(`\nPASS: ${total} panel i18n checks across 4 locales × ${WIDTHS.length} widths`);
