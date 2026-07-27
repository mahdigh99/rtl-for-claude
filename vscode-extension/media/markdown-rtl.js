/* ============================================================================
 * markdown-rtl.js — RTL for VS Code's BUILT-IN Markdown preview.
 *
 * Injected through the official `markdown.previewScripts` contribution point
 * (package.json) — no file patching, nothing for a VS Code update to break.
 *
 * Per-block direction with the same character coverage as the chat engine:
 * every RTL script (Persian, Arabic, Urdu, Hebrew, Pashto, Kurdish, …), not
 * just one language. A block is flipped only when its text is clearly RTL
 * (ratio of strong characters), a clearly-LTR block inside an RTL container
 * gets its direction back, and a `dir` the document author set is never
 * touched. English-only documents are left byte-for-byte untouched.
 * ========================================================================== */
(function () {
  "use strict";

  // Keep in sync with browser-extension/src/rtl-engine.js (the source of
  // truth for both classes — tests/markdown-preview.test.js enforces this).
  var RTL_CHARS = "֐-ٟ٪-ۯۺ-ࣿיִ-﷿ﹰ-﻿";
  var LTR_CHARS = "A-Za-zÀ-ɏͰ-ϿЀ-ӿḀ-ỿ";

  var RTL_RE = new RegExp("[" + RTL_CHARS + "]", "g");
  var LTR_RE = new RegExp("[" + LTR_CHARS + "]", "g");
  var HAS_RTL_RE = new RegExp("[" + RTL_CHARS + "]");

  // Blocks classified from their own text (nested blocks decide for themselves)…
  var LEAF_SELECTOR = "p, li, h1, h2, h3, h4, h5, h6, dt, dd, figcaption, summary, caption, td, th";
  // …and containers classified from everything inside (they own the geometry:
  // list bullets, table column order, the blockquote border side).
  var CONTAINER_TAGS = { UL: 1, OL: 1, TABLE: 1, BLOCKQUOTE: 1 };
  var WALK_SELECTOR = LEAF_SELECTOR + ", ul, ol, table, blockquote";

  // Never classified, never entered: code is LTR by definition; rendered math
  // handles its own bidi.
  var SKIP_TAGS = { PRE: 1, CODE: 1, KBD: 1, SAMP: 1, SCRIPT: 1, STYLE: 1, SVG: 1, MATH: 1, TEXTAREA: 1 };
  var SKIP_CLOSEST = "pre, code, kbd, samp, .katex, .katex-display, mjx-container";

  var MARK = "data-rtlx-md"; // stamps we own — only these are ever rewritten
  var THRESHOLD = 0.1;       // same default as the chat engine's ratio mode
                             // (rtl-engine.js DEFAULT_THRESHOLD — keep in sync)

  function count(re, s) {
    var m = s.match(re);
    return m ? m.length : 0;
  }

  /** "rtl" | "ltr" | null (no strong evidence — leave the block alone). */
  function decide(text) {
    if (!text || !HAS_RTL_RE.test(text)) {
      return text && count(LTR_RE, text) > 0 ? "ltr" : null;
    }
    var rtl = count(RTL_RE, text);
    var ltr = count(LTR_RE, text);
    if (rtl + ltr === 0) return null;
    return rtl / (rtl + ltr) >= THRESHOLD ? "rtl" : "ltr";
  }

  /** A leaf block's own text: direct text + inline descendants, not nested blocks. */
  function ownText(el) {
    var out = "";
    for (var node = el.firstChild; node; node = node.nextSibling) {
      if (node.nodeType === 3) out += node.nodeValue;
      else if (node.nodeType === 1) {
        var tag = node.tagName;
        if (SKIP_TAGS[tag]) continue;
        if (CONTAINER_TAGS[tag] || node.matches(LEAF_SELECTOR)) continue;
        out += node.textContent || "";
      }
      if (out.length > 600) break;
    }
    return out;
  }

  /** The direction el would inherit if we set nothing on it. */
  function inheritedDir(el) {
    var host = el.parentElement && el.parentElement.closest("[dir]");
    if (!host) return "ltr";
    var d = host.getAttribute("dir");
    return d === "rtl" ? "rtl" : d === "auto" ? "auto" : "ltr";
  }

  function classify(el) {
    if (el.closest(SKIP_CLOSEST)) return;
    // A dir we did not write is the author's — never touch it.
    if (el.hasAttribute("dir") && !el.hasAttribute(MARK)) return;

    var text = CONTAINER_TAGS[el.tagName] ? (el.textContent || "").slice(0, 4000) : ownText(el);
    var want = decide(text);
    var inh = inheritedDir(el);
    var set = null;
    if (want === "rtl" && inh !== "rtl") set = "rtl";
    else if (want === "ltr" && inh === "rtl") set = "ltr"; // counter-flow (English block in an RTL doc)

    if (set) {
      if (el.getAttribute("dir") !== set) el.setAttribute("dir", set);
      el.setAttribute(MARK, "1");
    } else if (el.hasAttribute(MARK)) {
      // Our old stamp no longer matches the (edited) text — undo it.
      el.removeAttribute("dir");
      el.removeAttribute(MARK);
    }
  }

  function apply(root) {
    var scope = root && root.querySelectorAll ? root : document;
    // Document.textContent is null by spec — gate on <body> for full passes.
    var textHost = scope.nodeType === 9 ? scope.body : scope;
    // An all-LTR document stays untouched — but stale stamps from a previous
    // RTL revision of the same DOM still get cleaned up.
    if (!HAS_RTL_RE.test((textHost && textHost.textContent) || "")) {
      scope.querySelectorAll("[" + MARK + "]").forEach(function (el) {
        el.removeAttribute("dir");
        el.removeAttribute(MARK);
      });
      return;
    }
    var els = scope.querySelectorAll(WALK_SELECTOR);
    var budget = 4000; // a giant document must not lock the preview's thread
    for (var i = 0; i < els.length && budget-- > 0; i++) classify(els[i]);
  }

  var timer = 0;
  function schedule() {
    if (timer) return;
    timer = setTimeout(function () {
      timer = 0;
      apply(document);
    }, 50); // preview updates arrive in bursts — coalesce them into one pass
  }

  function init() {
    apply(document);
    // The preview morphs the DOM in place on edit: text-only changes surface
    // as characterData mutations, structural ones as childList — watch both.
    new MutationObserver(schedule).observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
