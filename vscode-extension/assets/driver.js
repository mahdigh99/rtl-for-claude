/* ============================================================================
 * RTL for Claude — webview driver (runs inside the Claude Code chat).
 *
 * Deliberately simple and self-healing: it targets the chat's message
 * containers directly (no whole-DOM walk, no budget) and re-stamps dir="auto"
 * on every mutation, so it survives React/ProseMirror re-renders that strip our
 * attributes. Config comes from window.__RTLX_SETTINGS (the extension injects it
 * from your settings; the no-install script omits it → defaults below).
 * ========================================================================== */
;(function () {
  "use strict";
  if (window.__rtlDriver) return;
  window.__rtlDriver = true;

  var S = Object.assign(
    {
      enabled: true,
      fontStack: '"Vazirmatn RTLX", "Vazirmatn", var(--vscode-font-family), Tahoma, sans-serif',
      fontScale: 1,
      lineHeight: 1.85,
      applyToInput: true,
      showToggles: true,
      keepCodeLTR: true,
    },
    window.__RTLX_SETTINGS || {}
  );
  if (!S.enabled) return;

  var FORCE = "data-rtlx-force";
  var MSG = '[class*="message_"],[class*="userMessage"]'; // userMessage_ (bubble) + userMessageContainer_
  var QBOX = '[class*="questionsContainer"]'; // the AskUserQuestion box (options + radios)
  var BLOCK = "p,li,h1,h2,h3,h4,h5,h6,blockquote,td,dd,summary,figcaption";
  var INPUT = '[class*="inputContainer_"]';
  var RTL_RE = /[֐-ࣿיִ-﷿ﹰ-﻿]/;
  var globalForce = "auto"; // auto | rtl | ltr  (the floating button)

  // Streaming-stable direction WITHOUT any lock/memory: MEMORYLESS detection with
  // a LOW threshold (0.1). A Persian answer's RTL share crosses 0.1 very early and
  // never drops below it, so each paragraph turns RTL early and never flips — even
  // though the webview re-creates the <p>/<li> per token (the re-created node sees
  // the same accumulated text → the same decision). The toggle pins exact dir.
  var RTL_G = new RegExp(RTL_RE.source, "g");
  var LTR_G = /[A-Za-zÀ-ɏͰ-ϿЀ-ӿḀ-ỿ]/g;
  function dirByRatio(text, thr) {
    if (!text) return null;
    var s = text.length > 600 ? text.slice(0, 600) : text;
    var r = (s.match(RTL_G) || []).length, l = (s.match(LTR_G) || []).length;
    if (!(r + l)) return null;
    return r / (r + l) >= (thr || 0.1) ? "rtl" : "ltr";
  }

  // The compose box paints TRANSPARENT text in the contenteditable
  // (.messageInput, which owns the caret) and shows the real glyphs in a
  // separate overlaid mirror (.mentionMirror). We read the text from the
  // editable, then flag the whole input container; the stylesheet flips BOTH
  // layers together — otherwise the caret and the glyphs drift apart.
  function applyInput(container) {
    var ed =
      container.querySelector('[class*="messageInput_"]') ||
      container.querySelector("[contenteditable], textarea");
    var text = ed ? (ed.tagName === "TEXTAREA" ? ed.value : ed.textContent || "") : "";
    var rtl = RTL_RE.test(text);
    var hasText = /\S/.test(text);
    container.classList.toggle("rtlx-input-rtl", rtl);
    container.classList.toggle("rtlx-input-ltr", !rtl && hasText);
  }

  var de = document.documentElement;
  function applyVars() {
    de.style.setProperty("--rtlx-font-stack", S.fontStack);
    de.style.setProperty("--rtlx-font-scale", String(S.fontScale));
    de.style.setProperty("--rtlx-line-height", String(S.lineHeight));
    de.classList.toggle("rtlx-code-ltr", !!S.keepCodeLTR);
  }

  var SEEN = "data-rtlx-seen";
  var FORCE_ALL = "data-rtlx-force-all";

  // We NEVER write dir/classes to the streamed paragraphs (the webview re-creates
  // them per token and would wipe our changes → flicker). Instead we mark the
  // STABLE message container with SEEN once it shows Persian, and CSS styles its
  // prose descendants — current and any re-created one — with nothing to wipe.
  function markSeen(msg) {
    if (msg.hasAttribute(SEEN)) return;
    var rtl = false;
    var blocks = msg.querySelectorAll(BLOCK);
    if (blocks.length) {
      for (var i = 0; i < blocks.length; i++) {
        var b = blocks[i];
        if (b.closest("pre, code")) continue;
        if (RTL_RE.test(b.textContent || "") && dirByRatio(b.textContent || "") === "rtl") { rtl = true; break; }
      }
    } else if (RTL_RE.test(msg.textContent || "") && dirByRatio(msg.textContent || "") === "rtl") {
      rtl = true;
    }
    if (rtl) msg.setAttribute(SEEN, "1");
  }

  // SYNCHRONOUS + cheap: (re)assert the SEEN marker on every message. Runs inside
  // the MutationObserver callback (a microtask, BEFORE the browser paints), so if
  // the webview re-creates a message container mid-stream and drops our marker,
  // the marker is back before the next paint → the message never flickers LTR.
  // Once a message has SEEN, markSeen() short-circuits, so this stays cheap.
  function ensureSeenAll() {
    var msgs = document.querySelectorAll(MSG);
    for (var i = 0; i < msgs.length; i++) markSeen(msgs[i]);
    var q = document.querySelectorAll(QBOX); // AskUserQuestion boxes too
    for (var j = 0; j < q.length; j++) markSeen(q[j]);
  }

  function processMsg(msg) {
    markSeen(msg);
    addToggle(msg);
  }

  function sweep() {
    var msgs = document.querySelectorAll(MSG);
    for (var i = 0; i < msgs.length; i++) processMsg(msgs[i]);
    var q = document.querySelectorAll(QBOX); // AskUserQuestion boxes
    for (var j = 0; j < q.length; j++) markSeen(q[j]);
    if (S.applyToInput) {
      var ins = document.querySelectorAll(INPUT);
      for (var k = 0; k < ins.length; k++) applyInput(ins[k]);
    }
    ensureGlobalToggle();
  }

  // --- per-message ⇌ toggle --------------------------------------------------
  function label(c, b) {
    var v = c.getAttribute(FORCE);
    b.textContent = v === "rtl" ? "RTL" : v === "ltr" ? "LTR" : "⇌";
    b.dataset.state = v || "auto";
  }
  function addToggle(msg) {
    if (!S.showToggles) return;
    if (msg.querySelector(":scope > .rtlx-toggle")) return;
    msg.classList.add("rtlx-host");
    var b = document.createElement("button");
    b.className = "rtlx-toggle";
    b.type = "button";
    b.setAttribute("aria-label", "Toggle this message's direction");
    b.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      var v = msg.getAttribute(FORCE);
      var n = v === "rtl" ? "ltr" : v === "ltr" ? null : "rtl";
      if (n) msg.setAttribute(FORCE, n);
      else msg.removeAttribute(FORCE);
      label(msg, b);
      processMsg(msg);
    });
    label(msg, b);
    msg.appendChild(b);
  }

  // --- global floating toggle (flip the whole chat, no reload) --------------
  var gEl = null;
  function gLabel() {
    if (!gEl) return;
    gEl.textContent = globalForce === "rtl" ? "⇥ RTL" : globalForce === "ltr" ? "⇤ LTR" : "⇌ Auto";
    gEl.dataset.state = globalForce;
  }
  function ensureGlobalToggle() {
    if (gEl && document.body.contains(gEl)) return;
    gEl = document.createElement("button");
    gEl.id = "rtlx-global";
    gEl.type = "button";
    gEl.title = "Flip the whole chat: Auto → RTL → LTR";
    gEl.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      globalForce = globalForce === "auto" ? "rtl" : globalForce === "rtl" ? "ltr" : "auto";
      if (globalForce === "auto") de.removeAttribute(FORCE_ALL);
      else de.setAttribute(FORCE_ALL, globalForce);
      gLabel();
    });
    gLabel();
    document.body.appendChild(gEl);
  }

  // --- throttled observer ----------------------------------------------------
  var pending = false;
  function schedule() {
    if (pending) return;
    pending = true;
    setTimeout(function () {
      pending = false;
      try {
        sweep();
      } catch (e) {}
    }, 120);
  }

  function boot() {
    applyVars();
    try {
      sweep();
    } catch (e) {}
    try {
      new MutationObserver(function () {
        // Re-assert markers synchronously (before paint) so a re-created message
        // container never loses RTL mid-stream; defer the heavier work (toggles,
        // input) to the throttled sweep.
        try { ensureSeenAll(); } catch (e) {}
        schedule();
      }).observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    } catch (e) {}
    if (S.applyToInput) {
      document.addEventListener(
        "input",
        function (e) {
          var t = e.target;
          if (!t || !(t.tagName === "TEXTAREA" || t.isContentEditable)) return;
          var c = t.closest && t.closest('[class*="inputContainer_"]');
          if (c) applyInput(c);
        },
        true
      );
    }
  }

  if (document.body) boot();
  else document.addEventListener("DOMContentLoaded", boot, { once: true });
})();
