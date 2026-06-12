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
  var MSG = '[class*="message_"],[class*="userMessage_"]';
  var BLOCK = "p,li,h1,h2,h3,h4,h5,h6,blockquote,td,dd,summary,figcaption";
  var INPUT = '[class*="inputContainer_"]';
  var RTL_RE = /[֐-ࣿיִ-﷿ﹰ-﻿]/;
  var globalForce = "auto"; // auto | rtl | ltr  (the floating button)

  // Direction by RATIO, not first-strong: a paragraph that is mostly RTL stays
  // RTL even when it opens with an English word (e.g. "dist/ ..."), which
  // dir="auto" would wrongly flip to LTR.
  var RTL_G = new RegExp(RTL_RE.source, "g");
  var LTR_G = /[A-Za-zÀ-ɏͰ-ϿЀ-ӿḀ-ỿ]/g;
  function detectDir(text) {
    if (!text) return null;
    var r = (text.match(RTL_G) || []).length;
    var l = (text.match(LTR_G) || []).length;
    if (!(r + l)) return null; // no strong letters → don't touch it
    return r / (r + l) >= 0.3 ? "rtl" : "ltr";
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

  function setDir(el, want) {
    if (want === "auto") {
      var d = detectDir(el.textContent || "");
      if (d === null) return; // no strong letters yet — leave it untouched
      want = d;
    }
    if (el.getAttribute("dir") !== want) el.setAttribute("dir", want); // self-heal
    if (!el.classList.contains("rtlx-font")) el.classList.add("rtlx-font");
  }

  function wantFor(container) {
    if (globalForce === "rtl" || globalForce === "ltr") return globalForce;
    var f = container.getAttribute(FORCE);
    return f === "rtl" || f === "ltr" ? f : "auto";
  }

  function processMsg(msg) {
    var want = wantFor(msg);
    var blocks = msg.querySelectorAll(BLOCK);
    if (blocks.length) {
      for (var i = 0; i < blocks.length; i++) {
        if (!blocks[i].closest("pre, code")) setDir(blocks[i], want);
      }
    } else if (!(msg.closest && msg.closest("pre, code"))) {
      setDir(msg, want); // message with no block children of its own
    }
    addToggle(msg);
  }

  function sweep() {
    var msgs = document.querySelectorAll(MSG);
    for (var i = 0; i < msgs.length; i++) processMsg(msgs[i]);
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
      gLabel();
      sweep();
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
      new MutationObserver(schedule).observe(document.body, {
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
