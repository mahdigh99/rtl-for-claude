/* Renders the real browser popup in every shipped locale and asserts that it
 * is translated, flips to RTL for Persian/Arabic/Urdu, keeps the switch knobs
 * inside their tracks in both directions, and never overflows when the popup
 * is squeezed narrower than its design width. Also drives the custom-sites
 * flow end to end against a stubbed chrome.* API: add (permission request +
 * dynamic content-script registration + sites-map entry), reject an invalid
 * host, refuse a duplicate of a built-in, and remove (unregister + revoke).
 *
 * Needs Chrome; skips cleanly when it is absent.
 * Run: node tests/popup-i18n.test.js
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
  console.log("SKIP: popup i18n test (no Chrome/Chromium found)");
  process.exit(0);
}

const SRC = path.join(__dirname, "../src");
const HTML = fs.readFileSync(path.join(SRC, "popup.html"), "utf8");
const CSS = fs.readFileSync(path.join(SRC, "popup.css"), "utf8");
const JS = fs.readFileSync(path.join(SRC, "popup.js"), "utf8");

const RTL = ["fa", "ar", "ur"];
const WIDTHS = [340, 260];

/* The stub records every chrome.* call the popup makes so the flow probe can
 * assert on them. It also pre-seeds one custom site so the list renders. */
function stubScript(locale) {
  return `
window.__calls = { reqs: [], removed: [], registered: [], unregistered: [], stored: {} };
window.__EN = {};
document.querySelectorAll("[data-i18n]").forEach(function (el) { window.__EN[el.dataset.i18n] = el.textContent; });
document.querySelectorAll("[data-i18n-ph]").forEach(function (el) { window.__EN["ph:" + el.dataset.i18nPh] = el.placeholder; });
document.querySelectorAll("[data-i18n-title]").forEach(function (el) { window.__EN["ti:" + el.dataset.i18nTitle] = el.title; });
window.chrome = {
  i18n: { getUILanguage: function () { return "fa-IR"; } },
  tabs: {
    query: function () { return Promise.resolve([{ id: 1, url: "https://claude.ai/chat/abc" }]); },
    sendMessage: function () { return Promise.resolve(); },
  },
  storage: { sync: {
    get: function (defaults, cb) {
      var stored = Object.assign({}, defaults, { language: ${JSON.stringify(locale)} });
      stored.sites = Object.assign({}, defaults.sites, {
        "chat.deepseek.com": { enabled: true, custom: true, selector: ".msg" },
      });
      cb(stored);
    },
    set: function (patch) { Object.assign(window.__calls.stored, JSON.parse(JSON.stringify(patch))); },
  } },
  permissions: {
    contains: function () { return Promise.resolve(true); },
    request: function (o) { window.__calls.reqs.push(o); return Promise.resolve(true); },
    remove: function (o) { window.__calls.removed.push(o); return Promise.resolve(true); },
  },
  scripting: {
    getRegisteredContentScripts: function () { return Promise.resolve([]); },
    registerContentScripts: function (s) { window.__calls.registered.push.apply(window.__calls.registered, s); return Promise.resolve(); },
    unregisterContentScripts: function (f) { window.__calls.unregistered.push(f); return Promise.resolve(); },
  },
};
`;
}

const I18N_PROBE = `
<pre id="probe"></pre>
<script>
setTimeout(function () {
  var out = [];
  var ok = function (pass, label) { out.push((pass ? "ok   " : "FAIL ") + label); };
  var root = document.documentElement;
  var LOC = __LOC__;
  var EXP = LOC === "auto" ? "fa" : LOC; // the stub's browser UI language is fa-IR
  var wantRtl = __WANT_RTL__;

  ok(root.lang === EXP, "lang=" + root.lang);
  ok(root.dir === (wantRtl ? "rtl" : "ltr"), "dir=" + root.dir);

  // Every translatable node must be non-empty; for non-English it must differ
  // from the English source text captured from the markup before popup.js ran.
  var untranslated = [], empty = [];
  document.querySelectorAll("[data-i18n]").forEach(function (el) {
    var key = el.dataset.i18n, txt = (el.textContent || "").trim();
    if (!txt) empty.push(key);
    else if (EXP !== "en" && txt === window.__EN[key]) untranslated.push(key);
  });
  document.querySelectorAll("[data-i18n-ph]").forEach(function (el) {
    var key = el.dataset.i18nPh;
    if (!el.placeholder) empty.push("ph:" + key);
    else if (EXP !== "en" && el.placeholder === window.__EN["ph:" + key]) untranslated.push("ph:" + key);
  });
  document.querySelectorAll("[data-i18n-title]").forEach(function (el) {
    var key = el.dataset.i18nTitle;
    if (!el.title) empty.push("ti:" + key);
    else if (EXP !== "en" && el.title === window.__EN["ti:" + key]) untranslated.push("ti:" + key);
  });
  ok(document.querySelectorAll("[data-i18n]").length >= 15, "markup carries data-i18n hooks");
  ok(!empty.length, "no empty strings" + (empty.length ? ": " + empty.join(",") : ""));
  ok(!untranslated.length, "all keys translated" + (untranslated.length ? ": " + untranslated.join(",") : ""));

  // The pre-seeded custom site renders as a row with an LTR host.
  var row = document.querySelector(".site-row b");
  ok(!!row && row.textContent === "chat.deepseek.com", "custom-site row rendered");
  ok(!!row && getComputedStyle(row).direction === "ltr", "hostname stays LTR");

  // Knob inside its track for every switch, checked and unchecked, both dirs.
  var spill = 0;
  document.querySelectorAll(".switch").forEach(function (sw) {
    var box = sw.querySelector("input");
    var slider = sw.querySelector(".slider");
    [false, true].forEach(function (checked) {
      box.checked = checked;
      var cs = getComputedStyle(slider, "::before");
      var w = parseFloat(cs.width) || 18;
      var tx = 0;
      var m = (cs.transform || "").match(/matrix\\([^,]+,[^,]+,[^,]+,[^,]+,\\s*(-?[\\d.]+)/);
      if (m) tx = parseFloat(m[1]);
      var track = slider.getBoundingClientRect();
      var left = root.dir === "rtl" ? track.right - 3 - w + tx : track.left + 3 + tx;
      if (left < track.left - 0.5 || left + w > track.right + 0.5) spill++;
    });
  });
  ok(!spill, "knob inside track for all switches/states");

  // No horizontal overflow at the forced body width (headless Chrome clamps
  // --window-size, so the harness narrows the body itself instead).
  var over = document.body.scrollWidth > document.body.clientWidth + 1;
  ok(!over, "no horizontal overflow (scroll " + document.body.scrollWidth + " vs client " + document.body.clientWidth + ")");

  document.getElementById("probe").textContent = out.join("\\n");
}, 300);
</script>`;

const FLOW_PROBE = `
<pre id="probe"></pre>
<script>
(function () {
  var out = [];
  var ok = function (pass, label) { out.push((pass ? "ok   " : "FAIL ") + label); };
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var $ = function (id) { return document.getElementById(id); };
  setTimeout(async function () {
    var calls = window.__calls;
    ok(document.querySelectorAll(".site-row").length === 1, "pre-seeded row rendered");

    // Invalid host → inline error, no permission prompt.
    $("newHost").value = "not a host!!";
    $("addSite").click();
    await sleep(60);
    ok(!$("siteErr").hidden && $("siteErr").textContent.length > 3 && $("siteErr").textContent !== "undefined",
      "invalid host shows an error");
    ok(calls.reqs.length === 0, "invalid host asks for no permission");

    // A built-in (or its subdomain) is refused as a duplicate.
    $("newHost").value = "app.claude.ai";
    $("addSite").click();
    await sleep(60);
    ok(!$("siteErr").hidden, "built-in duplicate refused");
    ok(calls.reqs.length === 0, "duplicate asks for no permission");

    // Valid add: URL pasted with path/query, www stripped, selector kept.
    $("newHost").value = "https://www.chat.example.org/some/path?x=1";
    $("newSelector").value = ".msg, [data-m]";
    $("addSite").click();
    await sleep(120);
    var req = calls.reqs[0];
    ok(!!req && req.origins.join("|") === "https://chat.example.org/*|https://*.chat.example.org/*",
      "permission requested for host + subdomains");
    var reg = null;
    calls.registered.forEach(function (r) { if (r.id === "rtlx-chat.example.org") reg = r; });
    ok(!!reg, "content scripts registered");
    ok(!!reg && reg.js.join("|") === "src/rtl-math.js|src/rtl-engine.js|src/content.js",
      "math loads before engine before content");
    ok(!!reg && reg.css.join("|") === "src/styles.css", "stylesheet registered");
    ok(!!reg && reg.persistAcrossSessions === true, "registration survives restarts");
    var entry = calls.stored.sites && calls.stored.sites["chat.example.org"];
    ok(!!entry && entry.custom === true && entry.enabled === true && entry.selector === ".msg, [data-m]",
      "sites map entry stored with selector");
    ok(document.querySelectorAll(".site-row").length === 2, "row for the new site appears");
    ok($("newHost").value === "" && $("newSelector").value === "", "inputs cleared after add");

    // Remove it: dynamic scripts unregistered, permission revoked, entry gone.
    var target = null;
    document.querySelectorAll(".site-row").forEach(function (r) {
      if (r.querySelector("b").textContent === "chat.example.org") target = r;
    });
    ok(!!target, "new row found for removal");
    var delBtn = target.querySelector(".mini.danger");
    ok(!!delBtn && delBtn.title.length > 0 && delBtn.title !== "undefined", "remove button carries a real tooltip");
    delBtn.click();
    await sleep(120);
    ok(calls.unregistered.some(function (f) { return f.ids && f.ids[0] === "rtlx-chat.example.org"; }),
      "scripts unregistered on remove");
    ok(calls.removed.some(function (o) {
      return o.origins && o.origins.join("|") === "https://chat.example.org/*|https://*.chat.example.org/*";
    }), "permission revoked on remove");
    ok(!(calls.stored.sites && Object.prototype.hasOwnProperty.call(calls.stored.sites, "chat.example.org")),
      "sites map entry deleted");
    ok(document.querySelectorAll(".site-row").length === 1, "row disappears");

    document.getElementById("probe").textContent = out.join("\\n");
  }, 300);
})();
</script>`;

function harness(mode, locale, width) {
  let html = HTML.replace(
    /<link rel="stylesheet" href="popup.css" \/>/,
    "<style>" + CSS.replace(/@font-face[\s\S]*?}\n/, "") + "</style>"
  );
  const probe =
    mode === "flow"
      ? FLOW_PROBE
      : I18N_PROBE.replace("__LOC__", JSON.stringify(locale)).replace(
          "__WANT_RTL__",
          JSON.stringify(RTL.indexOf(locale === "auto" ? "fa" : locale) !== -1)
        );
  html = html.replace(
    /<script src="popup.js"><\/script>/,
    "<script>" + stubScript(locale) + "</script>\n<script>" + JS + "</script>" + probe
  );
  // Headless Chrome clamps --window-size to a ~500px minimum, so narrow-width
  // resilience is exercised by narrowing the body itself.
  return html + `<style>body{width:${width}px !important;max-width:${width}px !important;}</style>`;
}

function run(mode, locale, width) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rtlx-popup-"));
  const file = path.join(dir, "popup.html");
  fs.writeFileSync(file, harness(mode, locale, width), "utf8");
  let dom;
  try {
    dom = execFileSync(
      chrome,
      [
        "--headless",
        "--disable-gpu",
        "--no-sandbox",
        `--window-size=${width},900`,
        "--allow-file-access-from-files",
        "--virtual-time-budget=4000",
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
// "auto" exercises resolveLocale(): the stubbed browser UI language is fa-IR,
// so the popup must come up in Persian without an explicit pick.
for (const locale of ["en", "fa", "ar", "ur", "auto"]) {
  for (const width of WIDTHS) {
    console.log(`\n[${locale} @ ${width}px]`);
    const lines = run("i18n", locale, width);
    for (const l of lines) console.log("  " + l);
    total += lines.length;
    failed += lines.filter((l) => l.startsWith("FAIL")).length;
  }
}
console.log("\n[custom-sites flow @ 340px]");
const flow = run("flow", "en", 340);
for (const l of flow) console.log("  " + l);
total += flow.length;
failed += flow.filter((l) => l.startsWith("FAIL")).length;

if (failed) {
  console.error(`\nFAIL: ${failed}/${total} popup check(s) failed`);
  process.exit(1);
}
console.log(`\nPASS: ${total} popup checks (5 locales × ${WIDTHS.length} widths + custom-sites flow)`);
