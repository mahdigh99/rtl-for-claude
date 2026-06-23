/* ============================================================================
 * rtl-engine.js — pure, framework-agnostic RTL detection + DOM application.
 *
 * No site-specific selectors live here. It works on ANY page by classifying
 * text-bearing block elements and the compose box. Site quirks (claude.ai)
 * are handled by thin config in content.js. Universal: handles every RTL
 * script, not just Persian/Arabic.
 *
 * Exposed as a global `RTLX` because content scripts are classic scripts.
 * ========================================================================== */
(function (global) {
  "use strict";

  // --- Unicode ranges -------------------------------------------------------
  // Strong RTL across ALL right-to-left scripts. U+0590–U+08FF is one
  // contiguous region covering Hebrew, Arabic, Syriac, Thaana, N'Ko, Samaritan,
  // Mandaic, Syriac Supplement, Arabic Supplement and Arabic Extended-A/B — i.e.
  // Persian, Arabic, Urdu, Pashto, Kurdish (Sorani), Sindhi, Uyghur, Hebrew,
  // Dhivehi, Syriac, N'Ko, Samaritan, Mandaic … — plus the Hebrew/Arabic
  // presentation forms. (Adlam & Hanifi Rohingya live in the SMP and are
  // omitted to keep this a simple, fast BMP regex.)
  // Arabic-Indic & Persian DIGITS (U+0660-0669, U+06F0-06F9) are EXCLUDED:
  // they are bidi-weak (AN), so they must not be counted as strong RTL.
  // (\u escapes keep the source pure-ASCII and unambiguous.)
  const RTL_CHARS = "֐-ٟ٪-ۯۺ-ࣿיִ-﷿ﹰ-﻿";

  // Strong LTR: Latin (incl. extended), Greek, Cyrillic — enough to detect
  // "this paragraph is really English/European".
  const LTR_CHARS = "A-Za-zÀ-ɏͰ-ϿЀ-ӿḀ-ỿ";

  const RTL_RE = new RegExp("[" + RTL_CHARS + "]", "g");
  const LTR_RE = new RegExp("[" + LTR_CHARS + "]", "g");
  const HAS_RTL_RE = new RegExp("[" + RTL_CHARS + "]");
  // First strong directional char (RTL or LTR), used for the "first-strong"
  // mode that mirrors the native HTML dir="auto" behaviour.
  const FIRST_STRONG_RE = new RegExp("[" + RTL_CHARS + LTR_CHARS + "]");

  function countMatches(re, str) {
    const m = str.match(re);
    return m ? m.length : 0;
  }

  /**
   * Decide the direction of a piece of text.
   * @param {string} text
   * @param {object} opts
   *   - mode: "ratio" (default) | "first-strong"
   *   - threshold: 0..1 — for ratio mode, min share of strong chars that must
   *     be RTL to call the block RTL. Default 0.3 (RTL "wins ties" because an
   *     RTL paragraph routinely contains English technical terms).
   * @returns {"rtl"|"ltr"|null}  null = no strong chars, leave the page alone.
   */
  function detectDirection(text, opts, currentDir) {
    opts = opts || {};
    if (!text) return null;
    // Fast path: no RTL script at all → never our concern.
    if (!HAS_RTL_RE.test(text)) return null;

    if (opts.mode === "first-strong") {
      const m = text.match(FIRST_STRONG_RE);
      if (!m) return null;
      return HAS_RTL_RE.test(m[0]) ? "rtl" : "ltr";
    }

    const rtl = countMatches(RTL_RE, text);
    const ltr = countMatches(LTR_RE, text);
    const strong = rtl + ltr;
    if (strong === 0) return null;
    const threshold = typeof opts.threshold === "number" ? opts.threshold : 0.3;
    const ratio = rtl / strong;
    // Hysteresis (deadband). While an answer STREAMS in, this same block is
    // re-classified on every token; the RTL share crosses `threshold` back and
    // forth, which made the text visibly jump left↔right. Once a block already
    // has a direction, resist flipping until the text is CLEARLY the other way:
    //   • already RTL → stay RTL unless RTL share collapses (well below thresh)
    //   • already LTR → become RTL only with a clear RTL majority
    // A block with no prior decision uses the plain threshold.
    if (currentDir === "rtl") return ratio >= threshold * 0.4 ? "rtl" : "ltr";
    if (currentDir === "ltr") return ratio >= Math.min(0.6, threshold + 0.15) ? "rtl" : "ltr";
    return ratio >= threshold ? "rtl" : "ltr";
  }

  // --- DOM helpers ----------------------------------------------------------

  // Block-level, text-bearing tags we classify individually so a single
  // message can mix an RTL paragraph and an English one correctly.
  const BLOCK_TAGS = new Set([
    "P", "LI", "H1", "H2", "H3", "H4", "H5", "H6",
    "BLOCKQUOTE", "TD", "TH", "DD", "DT", "FIGCAPTION",
    "SUMMARY", "CAPTION", "DIV",
  ]);

  // Never recurse into these — code/preformatted stays LTR, controls are not
  // prose, and we don't want to fight the page's own editors except the one
  // we explicitly opt into.
  const SKIP_TAGS = new Set([
    "PRE", "CODE", "KBD", "SAMP", "SCRIPT", "STYLE", "NOSCRIPT",
    "SVG", "CANVAS", "VIDEO", "AUDIO", "IMG", "TEXTAREA", "INPUT",
    "SELECT", "OPTION", "BUTTON",
  ]);

  /**
   * The text a block "owns" — its own text plus inline descendants, but NOT
   * the text of nested block elements (those get classified on their own).
   * This is what makes per-paragraph direction work.
   */
  function ownText(el) {
    let out = "";
    for (const node of el.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        out += node.nodeValue;
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const tag = node.tagName;
        if (SKIP_TAGS.has(tag)) continue;
        if (BLOCK_TAGS.has(tag)) continue; // own classification later
        out += node.textContent || "";
      }
      if (out.length > 600) break; // plenty to decide; keep it cheap
    }
    return out;
  }

  const DIR_RTL = "rtlx-rtl";
  const DIR_LTR = "rtlx-ltr";
  const DIR_AUTO = "rtlx-auto";
  const FONT = "rtlx-font";
  const SCALE = "rtlx-scale";
  // Marker storing the last applied decision so streaming re-runs are near free.
  const STAMP = "data-rtlx";
  // Manual per-message override set by the toggle button (rtl | ltr | auto).
  const FORCE_ATTR = "data-rtlx-force";
  // ONE-WAY "this message is RTL" flag, stamped on a message's STABLE container
  // once it shows enough Persian. It is never removed (until teardown), so once a
  // Persian answer turns RTL it STAYS RTL — even if a long English run streams in
  // mid-paragraph and momentarily drops the ratio. This is the whole anti-jump
  // mechanism: at most ONE flip (the moment Persian becomes significant), then
  // rock-stable, and it survives the site re-creating the paragraph per token
  // because the flag lives on the container, not the volatile leaf.
  const SEEN_ATTR = "data-rtlx-seen";
  // Global pin from the floating toggle, set on <html> by content.js; CSS keys on
  // it to force the whole conversation one way without touching any node.
  const FORCE_ALL_ATTR = "data-rtlx-force-all";

  // The STABLE container that carries the one-way RTL flag. Reuse an ancestor
  // that ALREADY has the flag (sticky anchor); else the site's message container;
  // else the nearest big-enough ancestor; else the parent. Never the leaf.
  function seenContainer(el, settings) {
    if (el.closest) {
      let s = null;
      try { s = el.closest("[" + SEEN_ATTR + "]"); } catch (e) {}
      if (s) return s;
      const sel = settings && settings.contentSelector;
      if (sel) {
        let c = null;
        try { c = el.closest(sel); } catch (e) {}
        if (c) return c;
      }
    }
    let node = el.parentElement, hops = 0;
    while (node && hops < 6) {
      if ((node.textContent || "").length >= 150) return node;
      node = node.parentElement;
      hops++;
    }
    return el.parentElement || el;
  }

  /**
   * Apply (or update) the classification on a single block element.
   * Returns true if it touched the element.
   *
   * Anti-jump strategy (see SEEN_ATTR): detection is memoryless and RTL-eager
   * (low threshold), and once a message has shown enough Persian we pin a ONE-WAY
   * RTL flag on its stable container so it can never flip back to LTR while it
   * streams. Net: ≤1 flip per message (Persian becomes significant), then stable;
   * survives per-token re-creation; pure-English prose is left untouched; a truly
   * English paragraph inside an RTL message still renders LTR. The toggle pins an
   * exact rtl/ltr.
   */
  function applyToBlock(el, settings) {
    if (SKIP_TAGS.has(el.tagName)) return false;
    // Skip code and editable areas; the compose box is handled by applyToInput.
    if (el.closest && el.closest('pre, code, [contenteditable]:not([contenteditable="false"]), [role="textbox"]'))
      return false;

    const text = ownText(el);
    if (!HAS_RTL_RE.test(text)) return false; // no RTL script → not our concern

    // CRITICAL: we do NOT set dir/classes on this block. The block is volatile —
    // the app (React/Angular) re-creates it on every streamed token, and if it
    // also owns a `dir`, it wipes ours each render; we re-apply; it wipes again →
    // the left↔right "jumping". Instead we mark the message's STABLE container
    // with SEEN, and a CSS rule (with !important, which beats the app's own dir
    // attribute) styles every prose descendant — current AND any re-created one —
    // automatically. There is no per-node attribute for the app to wipe, so it
    // can never flicker.
    const container = seenContainer(el, settings);
    if (container && !container.hasAttribute(SEEN_ATTR) && detectDirection(text, settings) === "rtl") {
      container.setAttribute(SEEN_ATTR, "1");
      return true;
    }
    return false;
  }

  function fontKey(settings) {
    return settings.fontEnabled ? "+f" : "";
  }

  function clearBlock(el) {
    // Capture ownership BEFORE we wipe the stamp — we only ever set `dir`
    // on elements we also stamped, so the stamp is our proof of ownership.
    const owned = el.hasAttribute(STAMP);
    el.classList.remove(DIR_RTL, DIR_LTR, DIR_AUTO, FONT, SCALE);
    el.removeAttribute(STAMP);
    if (owned) el.removeAttribute("dir");
  }

  /**
   * Walk a subtree and classify every block element in it. Cheap enough to
   * call on each streaming mutation because applyToBlock short-circuits when
   * the decision is unchanged.
   */
  function processSubtree(root, settings) {
    if (!root || root.nodeType !== Node.ELEMENT_NODE) {
      root = root && root.parentElement;
      if (!root) return;
    }
    // Classify the root itself if it qualifies…
    if (BLOCK_TAGS.has(root.tagName)) applyToBlock(root, settings);
    // …and every block descendant, skipping forbidden subtrees.
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
      acceptNode(node) {
        if (SKIP_TAGS.has(node.tagName)) return NodeFilter.FILTER_REJECT;
        return BLOCK_TAGS.has(node.tagName)
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_SKIP;
      },
    });
    let n;
    let budget = 4000; // hard cap so a giant DOM can't lock the main thread
    while ((n = walker.nextNode()) && budget-- > 0) {
      applyToBlock(n, settings);
    }
  }

  /**
   * Classify a compose box (textarea or contenteditable) live as typed.
   * We use dir="auto" rather than an explicit direction: on a contenteditable
   * (e.g. ProseMirror) an explicit dir can land on a wrapper while the text
   * lives in a child <p>, leaving the caret on one side and the glyphs on the
   * other. dir="auto" lets the browser pick each paragraph's direction from its
   * own content — caret and text stay together — and we stamp the inner blocks
   * too so ProseMirror re-renders keep it.
   */
  function applyToInput(el, settings) {
    const isText = el.tagName === "TEXTAREA" || el.tagName === "INPUT";
    const text = isText ? el.value : el.textContent;
    const has = detectDirection(text, settings) !== null;
    el.classList.remove("rtlx-input-rtl", "rtlx-input-ltr");
    if (has) {
      el.classList.add("rtlx-input");
      el.setAttribute("dir", "auto");
    } else {
      el.classList.remove("rtlx-input");
      el.removeAttribute("dir");
    }
    if (!isText) {
      const blocks = el.querySelectorAll("p, div, li, h1, h2, h3, blockquote");
      for (let i = 0; i < blocks.length; i++) {
        const t = blocks[i].textContent;
        if (t && /\S/.test(t)) blocks[i].setAttribute("dir", "auto");
      }
    }
  }

  /** Remove every trace of the engine from the page. */
  function teardown(rootDoc) {
    const doc = rootDoc || document;
    doc
      .querySelectorAll("[" + STAMP + "], .rtlx-input, .rtlx-input-rtl, .rtlx-input-ltr")
      .forEach((el) => {
        clearBlock(el);
        el.classList.remove("rtlx-input", "rtlx-input-rtl", "rtlx-input-ltr");
      });
    doc.querySelectorAll("[" + SEEN_ATTR + "]").forEach((el) => el.removeAttribute(SEEN_ATTR));
    if (doc.documentElement) doc.documentElement.removeAttribute(FORCE_ALL_ATTR);
  }

  global.RTLX = {
    detectDirection,
    ownText,
    applyToBlock,
    processSubtree,
    applyToInput,
    teardown,
    BLOCK_TAGS,
    SKIP_TAGS,
    FORCE_ATTR,
    SEEN_ATTR,
    FORCE_ALL_ATTR,
  };
})(typeof window !== "undefined" ? window : this);
