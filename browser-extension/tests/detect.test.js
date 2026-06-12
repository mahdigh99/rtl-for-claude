/* Minimal, dependency-free unit test for the universal RTL direction detector.
 * Run: node tests/detect.test.js   (exits non-zero on failure) */
const fs = require("fs");
const path = require("path");

const code = fs.readFileSync(
  path.join(__dirname, "../src/rtl-engine.js"),
  "utf8",
);
// Load the IIFE with a fake `window` so it attaches RTLX there.
const RTLX = new Function("window", code + "\n;return window.RTLX;")({});

const cases = [
  // text, expected-ratio, expected-first-strong
  ["سلام دنیا", "rtl", "rtl"], // Persian
  ["Hello world", null, null], // no RTL chars at all → leave the page alone
  ["این یک تست است with some English words", "rtl", "rtl"], // Persian-dominant mix
  ["The word سلام simply means hello", "ltr", "ltr"], // English-dominant mix
  ["1234567", null, null], // digits are neutral
  ["برنامه‌نویسی با Python خیلی خوبه", "rtl", "rtl"], // Persian + tech term
  ["مرحبا بالعالم", "rtl", "rtl"], // Arabic
  ["שלום עולם", "rtl", "rtl"], // Hebrew
  ["اردو زبان بہت خوبصورت ہے", "rtl", "rtl"], // Urdu
  ["زمانی کوردی زۆر جوانە", "rtl", "rtl"], // Kurdish (Sorani)
  ["ܠܫܢܐ ܣܘܪܝܝܐ", "rtl", "rtl"], // Syriac
  ["ދިވެހި ބަސް", "rtl", "rtl"], // Thaana (Dhivehi)
  ["console.log('سلام')", "ltr", "ltr"], // mostly latin → stays LTR
  ["۱۲۳۴۵ tickets sold", null, null], // Persian digits are weak (AN) → leave alone
  ["١٢٣ items", null, null], // Arabic-Indic digits are weak → leave alone
  ["نسخه‌ی ۲.۱.۳ منتشر شد", "rtl", "rtl"], // Persian letters present → RTL
];

let pass = 0,
  fail = 0;
for (const [text, expRatio, expFirst] of cases) {
  const r = RTLX.detectDirection(text, { mode: "ratio", threshold: 0.3 });
  const f = RTLX.detectDirection(text, { mode: "first-strong" });
  const ok = r === expRatio && f === expFirst;
  ok ? pass++ : fail++;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${JSON.stringify(text).padEnd(46)} ratio=${String(r).padEnd(5)} first=${String(f).padEnd(5)}` +
      (ok ? "" : `  (expected ratio=${expRatio} first=${expFirst})`),
  );
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
