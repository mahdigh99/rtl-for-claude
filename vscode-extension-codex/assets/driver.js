/* ============================================================================
 * RTL for Codex (VS Code) — webview driver.
 *
 * Runs inside the Codex webview. The webview is sandboxed, so we are loaded
 * via a patched webview/index.html. We detect Persian/Arabic text in user and
 * assistant messages and mark the stable elements; styles.css then flips the
 * direction and font. This is resilient to React re-renders because the
 * markers are re-applied by the MutationObserver every tick.
 *
 * Config comes from window.__RTLX_SETTINGS (optional). Defaults are below.
 * ========================================================================== */
;(function () {
  "use strict";
  if (window.__rtlCodex) return;
  window.__rtlCodex = true;

  var S = Object.assign(
    {
      enabled: true,
      fontStack: '"Vazirmatn RTLX", "Vazirmatn", var(--vscode-font-family), Tahoma, sans-serif',
      fontScale: 1,
      lineHeight: 1.85,
      applyToInput: true,
      keepCodeLTR: true,
    },
    window.__RTLX_SETTINGS || {}
  );
  if (!S.enabled) return;

  var RTL_RE = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;
  var RTL_G = new RegExp(RTL_RE.source, "g");
  var LTR_G = /[A-Za-z\u00C0-\u024F\u0300-\u036F\u1E00-\u1EFF]/g;

  function reportError(error) {
    if (window.console && typeof window.console.error === "function") {
      window.console.error("[RTL for Codex]", error);
    }
  }

  function dirByRatio(text, thr) {
    if (!text) return null;
    var s = text.length > 600 ? text.slice(0, 600) : text;
    var r = (s.match(RTL_G) || []).length;
    var l = (s.match(LTR_G) || []).length;
    if (!(r + l)) return null;
    return r / (r + l) >= (thr || 0.1) ? "rtl" : "ltr";
  }

  function isCodeBlock(el) {
    return (
      el.closest("pre, code, kbd, samp, .rtlx-code, [class*='codeBlock'], [class*='CodeBlock']") !== null
    );
  }

  function isMediaParagraph(el) {
    var cls = el.className || "";
    return typeof cls === "string" && cls.indexOf("mediaParagraph") !== -1;
  }

  function applyVars() {
    var de = document.documentElement;
    de.style.setProperty("--rtlx-font-stack", S.fontStack);
    de.style.setProperty("--rtlx-font-scale", String(S.fontScale));
    de.style.setProperty("--rtlx-line-height", String(S.lineHeight));
    de.classList.toggle("rtlx-code-ltr", !!S.keepCodeLTR);
  }

  // ---- user messages --------------------------------------------------------
  var USER_TEXT_SELS = [
    ".text-size-chat.min-w-0.font-medium.break-words.text-token-foreground",
    ".text-size-chat.mt-2.whitespace-pre-wrap.text-token-foreground",
  ];

  function markUserMessages() {
    USER_TEXT_SELS.forEach(function (sel) {
      var nodes = document.querySelectorAll(sel);
      for (var i = 0; i < nodes.length; i++) {
        var el = nodes[i];
        if (isCodeBlock(el)) continue;
        var text = el.textContent || "";
        var rtl = RTL_RE.test(text) && dirByRatio(text) === "rtl";
        el.classList.toggle("rtlx-rtl", rtl);
        // Mark a stable ancestor for CSS scoping.
        var turn = el.closest("[data-virtualized-turn-content]");
        var group = el.closest("[class*='group/thread-details']");
        var host = turn || group || el.parentElement;
        if (host) host.toggleAttribute("data-rtlx-user-rtl", rtl);
      }
    });
  }

  // ---- assistant markdown ---------------------------------------------------
  var MD_BLOCK_SELS = [
    "[class*='_markdownContent_']",
    "[class*='_paragraph_']",
    "[class*='_markdownBlock_']",
    "[class*='_heading_']",
    "[class*='_list_']",
    "[class*='_listItem_']",
    "[class*='_blockquote_']",
    "[class*='_tableCell_']",
    "[class*='_tableHeaderCell_']",
  ];

  function markAssistantMarkdown() {
    var nodes = document.querySelectorAll(MD_BLOCK_SELS.join(","));
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (isCodeBlock(el)) continue;
      if (isMediaParagraph(el)) continue;
      var text = el.textContent || "";
      var rtl = RTL_RE.test(text) && dirByRatio(text) === "rtl";
      el.classList.toggle("rtlx-rtl", rtl);
      if (rtl) {
        var turn = el.closest("[data-virtualized-turn-content]");
        if (turn) turn.setAttribute("data-rtlx-assistant-rtl", "1");
      }
    }
  }

  // ---- composer input -------------------------------------------------------
  function applyInputDirection() {
    if (!S.applyToInput) return;
    var inputs = document.querySelectorAll("textarea[data-autoresize]");
    for (var i = 0; i < inputs.length; i++) {
      var ta = inputs[i];
      var text = ta.value || "";
      var hasText = /\S/.test(text);
      var rtl = RTL_RE.test(text) && dirByRatio(text) === "rtl";
      ta.classList.toggle("rtlx-input-rtl", rtl);
      ta.classList.toggle("rtlx-input-ltr", !rtl && hasText);
    }
  }

  // ---- global toggle --------------------------------------------------------
  var gEl = null;
  var globalForce = "auto"; // auto | rtl | ltr
  function gLabel() {
    if (!gEl) return;
    gEl.textContent = globalForce === "rtl" ? "⇥ RTL" : globalForce === "ltr" ? "⇤ LTR" : "⇌ Auto";
    gEl.dataset.state = globalForce;
  }
  function ensureGlobalToggle() {
    if (!document.body) return;
    if (gEl && document.body.contains(gEl)) return;
    gEl = document.createElement("button");
    gEl.id = "rtlx-global";
    gEl.type = "button";
    gEl.title = "Flip the whole chat: Auto → RTL → LTR";
    gEl.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      globalForce = globalForce === "auto" ? "rtl" : globalForce === "rtl" ? "ltr" : "auto";
      var de = document.documentElement;
      if (globalForce === "auto") de.removeAttribute("data-rtlx-force-all");
      else de.setAttribute("data-rtlx-force-all", globalForce);
      gLabel();
    });
    gLabel();
    document.body.appendChild(gEl);
  }

  // ---- sweep + observer -----------------------------------------------------
  function sweep() {
    try {
      markUserMessages();
      markAssistantMarkdown();
      applyInputDirection();
      ensureGlobalToggle();
    } catch (error) {
      reportError(error);
    }
  }

  var pending = false;
  function schedule() {
    if (pending) return;
    pending = true;
    setTimeout(function () {
      pending = false;
      sweep();
    }, 120);
  }

  applyVars();
  sweep();

  try {
    new MutationObserver(function () {
      schedule();
    }).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  } catch (error) {
    reportError(error);
  }

  // Re-check periodically in case very slow mutations slip through.
  setInterval(sweep, 2000);
})();
