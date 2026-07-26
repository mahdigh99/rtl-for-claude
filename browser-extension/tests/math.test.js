/* Unit tests for rtl-math.js — math/LaTeX segmentation + table direction.
 * Pure node, no DOM. Run: node tests/math.test.js (exits non-zero on failure) */
const M = require("../src/rtl-math.js");

let pass = 0,
  fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${name}` +
      (ok ? "" : `\n      got:  ${JSON.stringify(got)}\n      want: ${JSON.stringify(want)}`),
  );
}

// Math segments extracted from a text (just the substrings, in order).
function mathParts(text) {
  return M.segmentText(text)
    .filter((s) => s.type === "math")
    .map((s) => s.value);
}

// --- bare arithmetic --------------------------------------------------------

check("ASCII arithmetic in Persian prose", mathParts("جواب این است: 2 + 3 = 5 و تمام."), ["2 + 3 = 5"]);
check("Persian-digit arithmetic", mathParts("جواب: ۲ + ۳ = ۵ است."), ["۲ + ۳ = ۵"]);
check("Arabic-Indic-digit arithmetic", mathParts("الجواب: ٢ + ٣ = ٥ نعم"), ["٢ + ٣ = ٥"]);
check("glued expression", mathParts("مقدار 12*4=48 شد"), ["12*4=48"]);
check("single variable in run", mathParts("فرض کن x + 1 = 4 باشد"), ["x + 1 = 4"]);
check("lone number NOT math", mathParts("سال 1403 بود"), []);
check("version string NOT math (dots are not operators)", mathParts("نسخه 2.1.3 منتشر شد"), []);
check("IP address NOT math", mathParts("سرور 192.168.1.1 بالا است"), []);
check("list marker '1.' NOT math", mathParts("1. سلام دنیا"), []);
check("multi-letter token breaks run", mathParts("حدود 3 GB و 4 KB"), []);
check("trailing sentence punctuation trimmed", mathParts("پس 7 - 2 = 5."), ["7 - 2 = 5"]);
// Each line is its own bidi paragraph: the "4 +" fragment on line 1 dies (no
// operand-bounded expression), while line 2's complete "2 = 6" stands alone.
check("run never spans a newline", mathParts("الف 4 +\n2 = 6 ب"), ["2 = 6"]);

// --- currency vs LaTeX ------------------------------------------------------

check("currency $5.99 untouched", mathParts("قیمت آن $5.99 است"), []);
check("inline $x^2$ isolated", mathParts("تابع $x^2$ صعودی است"), ["$x^2$"]);
check("plain $word$ NOT latex", mathParts("این $کلمه$ ریاضی نیست"), []);
check("display $$..$$ isolated", mathParts("فرمول: $$a+b$$ اینجاست"), ["$$a+b$$"]);
check("\\(..\\) isolated", mathParts("و \\(E=mc^2\\) مشهور است"), ["\\(E=mc^2\\)"]);
check("\\[..\\] isolated", mathParts("پس \\[\\frac{a}{b}\\] داریم"), ["\\[\\frac{a}{b}\\]"]);
check(
  "latex wins overlap with arithmetic",
  mathParts("ببین $1 + 2 = 3^2$ چطور"),
  ["$1 + 2 = 3^2$"],
);
check(
  "rejected currency $ does not swallow the next island's opener",
  mathParts("قیمت آن $5.99 است ولی تابع $x^2$ ریاضی است."),
  ["$x^2$"],
);

// segmentText round-trips the original text.
{
  const t = "جواب: ۲ + ۳ = ۵ و $x^2$ و تمام.";
  check(
    "segments concatenate back to input",
    M.segmentText(t).map((s) => s.value).join(""),
    t,
  );
}

// --- tables -----------------------------------------------------------------

check("cellDir: any RTL char ⇒ rtl", M.cellDir("API نام"), "rtl");
check("cellDir: pure Latin ⇒ ltr", M.cellDir("name"), "ltr");
check("cellDir: neutral ⇒ null", M.cellDir("123"), null);
check(
  "table: Persian headers flip",
  M.tableDirFromCells(["rtl", "rtl", "ltr"], ["ltr", "ltr"]),
  "rtl",
);
check(
  "table: English headers stay",
  M.tableDirFromCells(["ltr", "ltr", "rtl"], ["rtl", "rtl"]),
  null,
);
check(
  "table: first header + first cell RTL wins over Latin rest",
  M.tableDirFromCells(["rtl", "ltr", "ltr"], ["rtl", "ltr", "ltr"]),
  "rtl",
);
check(
  "table: neutral headers fall to first column",
  M.tableDirFromCells([null, null], ["rtl", "rtl", "ltr"]),
  "rtl",
);
check("table: no signal ⇒ null", M.tableDirFromCells([], []), null);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
