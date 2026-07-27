/* DOM-level test for the "use a font installed on my computer" mode.
 *
 * Covers both halves of the mechanism and the rules that keep it safe:
 *   1. a scoped @font-face family declared from local() ONLY, per weight, with
 *      unicode-range limiting it to RTL codepoints (scope "rtl") or nothing at
 *      all (scope "all") — so an absent font simply fails to load and the
 *      bundled Vazirmatn behind it takes over;
 *   2. same-origin font-family rules re-declared verbatim with that family
 *      prepended, appended LAST so source order settles the tie, @media/@supports
 *      conditions preserved, !important preserved;
 *   3. mono / icon / KaTeX / emoji / math stacks skipped — code must stay
 *      monospace and icon fonts map codepoints privately;
 *   4. CSS variables never rewritten;
 *   5. idempotent re-runs, and teardown removing every trace.
 *
 * Runs the real rtl-engine.js in headless Chrome; skips cleanly when Chrome is
 * absent.  Run: node tests/local-font.test.js */
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
  console.log("SKIP: local-font DOM test (no Chrome/Chromium found)");
  process.exit(0);
}

const engineJs = path.join(__dirname, "../src/rtl-engine.js");

const page = `<meta charset="utf-8">
<style id="site-css">
  :root { --site-font: "SiteVar", sans-serif; }
  .prose { font-family: "SiteSans", Arial, sans-serif; }
  .bold  { font-family: "SiteSans"; font-weight: 700 !important; }
  .loud  { font-family: "SiteSans", serif !important; }
  .code  { font-family: ui-monospace, SFMono-Regular, monospace; }
  .icon  { font-family: "Material Icons"; }
  .katex { font-family: KaTeX_Main, serif; }
  .var   { font-family: var(--site-font); }
  @media (min-width: 1px) { .responsive { font-family: "SiteSans", serif; } }
</style>
<script src="file://${engineJs}"><\/script>
<div class="prose">متن فارسی</div>
<pre id="result"></pre>
<script>
const out = [];
const check = (label, pass) => out.push((pass ? "ok   " : "FAIL ") + label);
const sheet = () => {
  const el = document.getElementById(RTLX.LOCAL_STYLE_ID);
  return el ? el.textContent : "";
};

// A hostile family name: quotes, a semicolon and a brace would end the string,
// the declaration and the rule. It must survive sanitisation as inert text.
RTLX.applyLocalFont({ localFont: 'My Font"; } body{color:red}', localFontScope: "rtl" });
let css = sheet();
check("sheet injected", !!css);
// Everything that could terminate the string, the declaration or the rule is
// gone, so the leftovers are inert text inside a quoted family name.
// The name as it actually landed inside the first local("…") argument.
const open = css.indexOf('src:local("') + 'src:local("'.length;
const kept = css.slice(open, css.indexOf('"', open));
check("name sanitised, nothing that could break out survived (kept: " + kept + ")",
  kept.length > 0 && !/["';{}()<>,\\\\]/.test(kept));
check("the injected CSS gained no rule of its own from the name", css.indexOf("{color") === -1);
check("family is the scoped one", css.indexOf('font-family:"' + RTLX.LOCAL_FONT_FAMILY + '"') !== -1);

// 1. the @font-face half
check("four weight-specific faces", (css.match(/@font-face\\{/g) || []).length === 4);
check("declared from local() only — never a url()", /src:local\\(/.test(css) && css.indexOf("url(") === -1);
check("PostScript-style alias too (local(\\"Name-Bold\\"))", /local\\("[^"]*-Bold"\\)/.test(css));
check("unicode-range scopes the face to RTL codepoints", /unicode-range:U\\+0590-08FF/.test(css));

// 2. the re-declaration half
// (getPropertyValue() hands back the browser's own serialisation, which drops
// quotes a family doesn't need — hence SiteSans, not "SiteSans".)
check("same-origin rule re-declared with the family prepended",
  css.indexOf('.prose{font-family:"' + RTLX.LOCAL_FONT_FAMILY + '",SiteSans, Arial, sans-serif}') !== -1);
check("!important preserved", /\\.loud\\{font-family:[^}]*!important\\}/.test(css));
check("@media condition preserved around its rule",
  /@media \\(min-width: 1px\\)\\{\\.responsive\\{font-family:"/.test(css));

// 3. stacks we must not touch
check("mono stack skipped", css.indexOf(".code{") === -1);
check("icon stack skipped", css.indexOf(".icon{") === -1);
check("katex stack skipped", css.indexOf(".katex{") === -1);

// 4. variables are read, never rewritten
check("CSS variable definition untouched", css.indexOf("--site-font:") === -1);

// The sheet must be the last thing in <head> or late chunk CSS would out-order it.
check("sheet is last in <head>", document.head.lastElementChild.id === RTLX.LOCAL_STYLE_ID);

// The prepended family really reaches the element (it resolves to the fallback
// because the font isn't installed — that IS the graceful degradation).
const ff = getComputedStyle(document.querySelector(".prose")).fontFamily.replace(/"/g, "");
check("computed stack starts with the scoped family (got " + ff.slice(0, 40) + ")",
  ff.indexOf(RTLX.LOCAL_FONT_FAMILY) === 0);
check("the site's own families stay behind it, none lost", ff.indexOf("SiteSans, Arial, sans-serif") !== -1);

// 5. idempotence
RTLX.applyLocalFont({ localFont: 'My Font"; } body{color:red}', localFontScope: "rtl" });
check("re-run is idempotent (one sheet, same text)",
  document.querySelectorAll("#" + RTLX.LOCAL_STYLE_ID).length === 1 && sheet() === css);
check("re-run does not stack the family onto body's own rule",
  (sheet().match(/body\\{font-family:"[^"]+"/g) || []).length <= 1);

// scope "all" drops the unicode-range so the font may claim every glyph it has
RTLX.applyLocalFont({ localFont: "Estedad", localFontScope: "all" });
check("scope=all has no unicode-range", sheet().indexOf("unicode-range") === -1);
check("scope=all still declares the faces", (sheet().match(/@font-face\\{/g) || []).length === 4);

// empty name = off
RTLX.applyLocalFont({ localFont: "" });
check("empty family removes the sheet", !document.getElementById(RTLX.LOCAL_STYLE_ID));

// teardown must not leave it behind either
RTLX.applyLocalFont({ localFont: "Estedad" });
RTLX.teardown(document);
check("teardown removes the sheet", !document.getElementById(RTLX.LOCAL_STYLE_ID));

document.getElementById("result").textContent = out.join("\\n");
<\/script>`;

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rtlx-localfont-"));
const file = path.join(dir, "local-font.html");
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
  console.error(`\nFAIL: ${failed}/${lines.length} local-font case(s) regressed`);
  process.exit(1);
}
console.log(`\nPASS: ${lines.length} local-font cases`);
