// fallow-ignore-file unused-file -- copied into the Codex webview by apply-rtl.sh
/* ============================================================================
 * rtl-math.js — pure, DOM-free math/LaTeX segmentation + table direction.
 *
 * Why: inside an RTL paragraph the bidi algorithm mirrors bare arithmetic
 * ("2 + 3 = 5" renders as "5 = 3 + 2") and scrambles raw LaTeX ("$x^2$").
 * This module finds those runs so the DOM layer (rtl-engine.js) can wrap each
 * in an LTR-isolated span. It also classifies table cells/columns so a
 * Persian-column table can flip while its English cells stay put.
 *
 * Ported (MIT) from shraga100/claude-desktop-rtl-patch `src/rtl-core.js`, with
 * one deliberate extension: Persian & Arabic-Indic digits (۰-۹ / ٠-٩) count as
 * digits, so "۲ + ۳ = ۵" is isolated exactly like "2 + 3 = 5".
 *
 * Copy of browser-extension/src/rtl-math.js — keep the two in sync.
 *
 * Zero DOM access. apply-rtl.sh copies it into the Codex webview and loads it
 * via a <script> tag BEFORE the driver; exposed as global `RTLXMath` and as
 * module.exports for the node unit tests. The driver degrades to a no-op when
 * this global is absent, so a CSS-only patch still works.
 * ========================================================================== */
(function (global) {
  "use strict";

  // Strong-RTL code-point ranges, [lo, hi] inclusive, INCLUDING the explicit
  // RTL bidi controls (RLM/RLE/RLO/RLI) — an author's explicit RLM must count.
  // Checked via codePointAt so astral scripts (Adlam …) work too. Used only
  // for table-cell classification ("does this cell contain ANY RTL char"),
  // which needs presence, not the engine's ratio machinery.
  var RTL_RANGES = [
    [0x0590, 0x05ff], // Hebrew
    [0x0600, 0x06ff], // Arabic (incl. Persian)
    [0x0700, 0x074f], // Syriac
    [0x0750, 0x077f], // Arabic Supplement
    [0x0780, 0x07bf], // Thaana
    [0x07c0, 0x07ff], // NKo
    [0x0800, 0x083f], // Samaritan
    [0x0840, 0x085f], // Mandaic
    [0x0860, 0x086f], // Syriac Supplement
    [0x0870, 0x089f], // Arabic Extended-B
    [0x08a0, 0x08ff], // Arabic Extended-A
    [0x200f, 0x200f], // Right-to-Left Mark (RLM)
    [0x202b, 0x202b], // Right-to-Left Embedding (RLE)
    [0x202e, 0x202e], // Right-to-Left Override (RLO)
    [0x2067, 0x2067], // Right-to-Left Isolate (RLI)
    [0xfb1d, 0xfb4f], // Hebrew presentation forms
    [0xfb50, 0xfdff], // Arabic presentation forms-A
    [0xfe70, 0xfeff], // Arabic presentation forms-B
    [0x10800, 0x1083f], // Cypriot Syllabary (early RTL scripts)
    [0x10840, 0x1085f], // Imperial Aramaic
    [0x10a00, 0x10a5f], // Kharoshthi
    [0x10e60, 0x10e7f], // Rumi Numeral Symbols
    [0x1e800, 0x1e8df], // Mende Kikakui
    [0x1e900, 0x1e95f], // Adlam
    [0x1ee00, 0x1eeff], // Arabic Mathematical Alphabetic Symbols
  ];

  function isRTLCp(cp) {
    for (var i = 0; i < RTL_RANGES.length; i++) {
      if (cp >= RTL_RANGES[i][0] && cp <= RTL_RANGES[i][1]) return true;
    }
    return false;
  }

  function hasRTL(text) {
    if (!text) return false;
    for (var i = 0; i < text.length; ) {
      var cp = text.codePointAt(i);
      if (isRTLCp(cp)) return true;
      i += cp > 0xffff ? 2 : 1;
    }
    return false;
  }

  // Direction of the first strong character: 'rtl', 'ltr', or null.
  function firstStrong(text) {
    if (!text) return null;
    for (var i = 0; i < text.length; ) {
      var cp = text.codePointAt(i);
      if (isRTLCp(cp)) return "rtl";
      if ((cp >= 0x41 && cp <= 0x5a) || (cp >= 0x61 && cp <= 0x7a)) return "ltr";
      i += cp > 0xffff ? 2 : 1;
    }
    return null;
  }

  // --- LaTeX ----------------------------------------------------------------

  // A "$...$" body is math only with a real LaTeX signal, so currency ("$5.99")
  // stays plain text.
  var LATEX_SIGNAL = /[\\^_{}]|\b(?:frac|sqrt|sum|prod|int|lim|infty|cdot|times|div|leq|geq|neq|approx|partial|nabla|alpha|beta|gamma|delta|theta|lambda|mu|pi|sigma|omega|matrix|begin|end|left|right|text|mathbb|mathcal|vec|hat|bar|overline|underline)\b/;

  function hasLatexSignal(body) {
    return LATEX_SIGNAL.test(body);
  }

  // Find LaTeX regions as [start, end) index pairs. Unambiguous delimiters
  // ($$...$$, \[...\], \(...\)) always count; single $...$ only with a LaTeX
  // signal and only outside already-claimed regions.
  function findLatexRanges(text) {
    var ranges = [];
    if (!text) return ranges;

    function overlaps(s, e) {
      for (var i = 0; i < ranges.length; i++) {
        if (s < ranges[i][1] && e > ranges[i][0]) return true;
      }
      return false;
    }
    function claim(re, requireSignal, bodyStart, bodyEnd) {
      var m;
      re.lastIndex = 0;
      while ((m = re.exec(text)) !== null) {
        var start = m.index;
        var end = m.index + m[0].length;
        if (overlaps(start, end)) continue;
        if (requireSignal) {
          var body = m[0].slice(bodyStart, m[0].length - bodyEnd);
          if (!hasLatexSignal(body)) {
            // Fix over the reference impl: a rejected "$...$" candidate must
            // not swallow its closing $, which may OPEN the next island —
            // "قیمت $5.99 ولی $x^2$" would otherwise miss $x^2$. Rescan from
            // just past the rejected opening delimiter.
            re.lastIndex = m.index + 1;
            continue;
          }
        }
        ranges.push([start, end]);
      }
    }

    // Claim the unambiguous, greedier delimiters first.
    claim(/\$\$[\s\S]+?\$\$/g, false, 0, 0);
    claim(/\\\[[\s\S]+?\\\]/g, false, 0, 0);
    claim(/\\\([\s\S]+?\\\)/g, false, 0, 0);
    claim(/\$[^$\n]+?\$/g, true, 1, 1); // single $...$: no newline + LaTeX signal

    ranges.sort(function (a, b) {
      return a[0] - b[0];
    });
    return ranges;
  }

  // --- Bare numeric / arithmetic runs ---------------------------------------

  // Operator characters proving a run is a genuine expression.
  // × ÷ ± − ≤ ≥ ≠ ≈ → · • ∙ ∗ ⋅ √  ('-' escaped for the regex class).
  var MATH_OP_CHARS =
    "+\\-*/=<>%" +
    String.fromCharCode(
      0xd7, 0xf7, 0xb1, 0x2212, 0x2264, 0x2265, 0x2260,
      0x2248, 0x2192, 0xb7, 0x2022, 0x2219, 0x2217, 0x22c5, 0x221a,
    );
  // Digits: ASCII + Arabic-Indic (٠-٩) + Extended/Persian (۰-۹). The bidi
  // class of the eastern digits is AN (weak), but a mirrored "۵ = ۳ + ۲" is
  // exactly as wrong as the ASCII version, so they qualify a run as math.
  var DIGIT_CHARS = "0-9\\u0660-\\u0669\\u06F0-\\u06F9";
  var MATH_OP_RE = new RegExp("[" + MATH_OP_CHARS + "]");
  var MATH_DIGIT_RE = new RegExp("[" + DIGIT_CHARS + "]");
  // A token is "mathy" when built only from digits and math punctuation
  // (incl. the Arabic decimal/thousands separators ٫ ٬), OR it is a single
  // Latin variable letter (x, y, n). Multi-letter Latin tokens ("3D", words)
  // break a run and keep prose out of the island.
  var MATH_TOKEN_RE = new RegExp(
    "^(?:[" + DIGIT_CHARS + ".,:;()\\[\\]{}|\\u066B\\u066C" + MATH_OP_CHARS + "]+|[A-Za-z])$",
  );

  function isMathyToken(tok) {
    return !!tok && MATH_TOKEN_RE.test(tok);
  }

  // A token may BOUND a run only if it carries an operand (a digit or a single
  // Latin variable letter). Pure operator/punctuation tokens sit inside but
  // never bound it.
  function isOperandToken(tok) {
    return MATH_DIGIT_RE.test(tok) || /^[A-Za-z]$/.test(tok);
  }

  // Find bare numeric/arithmetic runs as [start, end) pairs. A run must be
  // whitespace/line delimited, operand-bounded, and contain a digit AND an
  // operator. Lone numbers, "$5", version strings ("2.1.3"), IPs and "1." list
  // markers are left alone (dots are not operators).
  function findMathRanges(text) {
    var ranges = [];
    if (!text || !MATH_OP_RE.test(text) || !MATH_DIGIT_RE.test(text)) return ranges;

    // Scan line by line so a run never spans a newline (each line is its own
    // bidi paragraph). `base` is the absolute offset of the current line.
    var base = 0;
    var lines = text.split("\n");
    for (var li = 0; li < lines.length; li++) {
      scanLine(lines[li], base);
      base += lines[li].length + 1; // +1 for the '\n' removed by split
    }
    return ranges;

    function scanLine(line, off) {
      var toks = [];
      var re = /\S+/g;
      var m;
      while ((m = re.exec(line)) !== null) {
        toks.push({ v: m[0], start: m.index, end: m.index + m[0].length });
      }
      var i = 0;
      while (i < toks.length) {
        if (!isMathyToken(toks[i].v)) {
          i++;
          continue;
        }
        var j = i;
        while (j + 1 < toks.length && isMathyToken(toks[j + 1].v)) j++;
        // Trim non-operand tokens off both ends so the run is operand-bounded.
        var a = i,
          b = j;
        while (a <= b && !isOperandToken(toks[a].v)) a++;
        while (b >= a && !isOperandToken(toks[b].v)) b--;
        if (a <= b) {
          var s = off + toks[a].start;
          var e = off + toks[b].end;
          // Drop sentence punctuation clinging to the ends.
          while (e > s && ".,:;".indexOf(text.charAt(e - 1)) !== -1) e--;
          while (e > s && ",:;".indexOf(text.charAt(s)) !== -1) s++;
          var sub = text.slice(s, e);
          if (e - s >= 2 && MATH_DIGIT_RE.test(sub) && MATH_OP_RE.test(sub)) {
            ranges.push([s, e]);
          }
        }
        i = j + 1;
      }
    }
  }

  // Split text into alternating {type:'text'|'math', value} segments. 'math'
  // covers LaTeX islands and bare arithmetic; LaTeX wins when the two overlap.
  function segmentText(text) {
    var segs = [];
    if (!text) return segs;
    var ranges = findLatexRanges(text);
    var numeric = findMathRanges(text);
    for (var n = 0; n < numeric.length; n++) {
      var ns = numeric[n][0],
        ne = numeric[n][1],
        clash = false;
      for (var c = 0; c < ranges.length; c++) {
        if (ns < ranges[c][1] && ne > ranges[c][0]) {
          clash = true;
          break;
        }
      }
      if (!clash) ranges.push(numeric[n]);
    }
    if (!ranges.length) {
      segs.push({ type: "text", value: text });
      return segs;
    }
    ranges.sort(function (a, b) {
      return a[0] - b[0];
    });
    var pos = 0;
    for (var i = 0; i < ranges.length; i++) {
      if (ranges[i][0] > pos) {
        segs.push({ type: "text", value: text.slice(pos, ranges[i][0]) });
      }
      segs.push({ type: "math", value: text.slice(ranges[i][0], ranges[i][1]) });
      pos = ranges[i][1];
    }
    if (pos < text.length) segs.push({ type: "text", value: text.slice(pos) });
    return segs;
  }

  // --- Tables ---------------------------------------------------------------

  // A cell is RTL if it *contains* any RTL char (header labels often start
  // with a Latin term yet belong to a Persian column, so first-strong is too
  // weak here). Neutral cells return null so they don't sway the majority.
  function cellDir(text) {
    if (hasRTL(text)) return "rtl";
    if (firstStrong(text) === "ltr") return "ltr";
    return null;
  }

  function majorityDir(dirs) {
    var r = 0,
      l = 0;
    for (var i = 0; i < dirs.length; i++) {
      if (dirs[i] === "rtl") r++;
      else if (dirs[i] === "ltr") l++;
    }
    if (r > l) return "rtl";
    if (l > r) return "ltr";
    return null;
  }

  // Decide a table's column direction from header / first-column cell dirs
  // (each an array of 'rtl'|'ltr'|null). Header wins; first column is the
  // tie-breaker. Returns 'rtl' (flip columns) or null (leave LTR).
  function tableDirFromCells(headerDirs, firstColDirs) {
    // First header is the semantic key column: if it and the first data cell
    // are both RTL, it's an RTL table regardless of Latin names later on.
    if (
      headerDirs && headerDirs[0] === "rtl" &&
      firstColDirs && firstColDirs[0] === "rtl"
    )
      return "rtl";
    var h = majorityDir(headerDirs || []);
    if (h === "rtl") return "rtl";
    if (h === "ltr") return null;
    var c = majorityDir(firstColDirs || []);
    return c === "rtl" ? "rtl" : null;
  }

  var API = {
    hasRTL: hasRTL,
    firstStrong: firstStrong,
    // Cheap pre-filter regexes for callers walking many text nodes.
    MATH_DIGIT_RE: MATH_DIGIT_RE,
    MATH_OP_RE: MATH_OP_RE,
    hasLatexSignal: hasLatexSignal,
    findLatexRanges: findLatexRanges,
    findMathRanges: findMathRanges,
    segmentText: segmentText,
    cellDir: cellDir,
    tableDirFromCells: tableDirFromCells,
    majorityDir: majorityDir,
  };

  global.RTLXMath = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})(typeof window !== "undefined" ? window : this);
