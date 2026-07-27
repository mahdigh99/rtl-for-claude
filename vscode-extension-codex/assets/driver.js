// fallow-ignore-file unused-file -- copied into the Codex webview by apply-rtl.sh
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
// fallow-ignore-next-line complexity -- self-contained webview runtime entrypoint
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
      letterSpacing: 0,
      // Detection defaults, matching the browser engine's exactly (rtl-engine.js
      // DEFAULT_THRESHOLD) and the Claude Code driver's.
      mode: "ratio", // ratio | first-strong
      threshold: 0.1,
      applyToInput: true,
      keepCodeLTR: true,
    },
    window.__RTLX_SETTINGS || {}
  );
  if (!S.enabled) return;

  var RTL_RE = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;
  var RTL_G = new RegExp(RTL_RE.source, "g");
  var LTR_G = /[A-Za-z\u00C0-\u024F\u0300-\u036F\u1E00-\u1EFF]/g;

  var FORCE_ALL = "data-rtlx-force-all";
  var ISLAND = "data-rtlx-island";
  var TABLE = "data-rtlx-table";
  var CELL = "data-rtlx-cell";

  // --- persisted global pin --------------------------------------------------
  // The Auto/RTL/LTR pin used to be in-memory only (`globalForce`) and reset on
  // every webview reload. Persist it in the webview's localStorage and re-apply
  // it here \u2014 synchronously, during script evaluation \u2014 so a pinned chat is
  // pinned from the first paint. localStorage may be unavailable in a sandboxed
  // webview; degrade to the old in-memory behaviour.
  var STORE_KEY = "rtlx-global-force";
  function loadForce() {
    try {
      var v = window.localStorage && localStorage.getItem(STORE_KEY);
      return v === "rtl" || v === "ltr" ? v : "auto";
    } catch (e) {
      return "auto";
    }
  }
  function saveForce(v) {
    try {
      if (!window.localStorage) return;
      if (v === "auto") localStorage.removeItem(STORE_KEY);
      else localStorage.setItem(STORE_KEY, v);
    } catch (e) {}
  }
  var globalForce = loadForce(); // auto | rtl | ltr
  if (globalForce !== "auto") document.documentElement.setAttribute(FORCE_ALL, globalForce);

  // A `dir` the APP set (not us): the nearest dir'd ancestor-or-self below
  // <html>/<body>. This driver never writes dir attributes, so any such host is
  // native. If it already points the right way ("rtl", or "auto") the app
  // handled this block \u2014 adding our classes on top would double-apply and
  // fight future native updates; native dirs are never removed or overridden.
  // A native dir="ltr" on genuinely RTL text is a gap we still fill.
  function nativelyHandled(el) {
    if (!el || !el.closest) return false;
    var host = null;
    try { host = el.closest("[dir]"); } catch (e) {}
    if (!host || host === document.documentElement || host === document.body) return false;
    var d = host.getAttribute("dir");
    return d === "rtl" || d === "auto";
  }

  function reportError(error) {
    if (window.console && typeof window.console.error === "function") {
      window.console.error("[RTL for Codex]", error);
    }
  }

  var FIRST_STRONG_RE = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFFA-Za-z\u00C0-\u024F\u1E00-\u1EFF]/;

  // fallow-ignore-next-line complexity -- compact Unicode ratio calculation
  function dirByRatio(text, thr) {
    if (!text) return null;
    var s = text.length > 600 ? text.slice(0, 600) : text;
    // "First letter" mode mirrors the browser's native dir="auto": the first
    // strong character decides, regardless of what follows.
    if (S.mode === "first-strong") {
      var m = s.match(FIRST_STRONG_RE);
      if (!m) return null;
      return RTL_RE.test(m[0]) ? "rtl" : "ltr";
    }
    var r = (s.match(RTL_G) || []).length;
    var l = (s.match(LTR_G) || []).length;
    if (!(r + l)) return null;
    return r / (r + l) >= (typeof thr === "number" ? thr : S.threshold) ? "rtl" : "ltr";
  }

  // Forcing LTR must also drop the auto-detected RTL marks, otherwise the
  // per-message !important rules keep winning over the global toggle.
  function detectRtl(text) {
    if (globalForce === "ltr") return false;
    return RTL_RE.test(text) && dirByRatio(text) === "rtl";
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
    de.style.setProperty("--rtlx-letter-spacing", Number(S.letterSpacing || 0) + "em");
    de.classList.toggle("rtlx-code-ltr", !!S.keepCodeLTR);
  }

  // ---- user messages --------------------------------------------------------
  var USER_TEXT_SELS = [
    ".text-size-chat.min-w-0.font-medium.break-words.text-token-foreground",
    ".text-size-chat.mt-2.whitespace-pre-wrap.text-token-foreground",
  ];

  function markUserMessages() {
    // fallow-ignore-next-line complexity -- DOM guards keep virtualized message variants safe
    USER_TEXT_SELS.forEach(function (sel) {
      var nodes = document.querySelectorAll(sel);
      for (var i = 0; i < nodes.length; i++) {
        var el = nodes[i];
        if (isCodeBlock(el)) continue;
        var text = el.textContent || "";
        var rtl = detectRtl(text) && !nativelyHandled(el);
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

  // fallow-ignore-next-line complexity -- handles multiple Codex Markdown surfaces
  function markAssistantMarkdown() {
    var nodes = document.querySelectorAll(MD_BLOCK_SELS.join(","));
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (isCodeBlock(el)) continue;
      if (isMediaParagraph(el)) continue;
      var text = el.textContent || "";
      var rtl = detectRtl(text) && !nativelyHandled(el);
      el.classList.toggle("rtlx-rtl", rtl);
      if (rtl) {
        var turn = el.closest("[data-virtualized-turn-content]");
        if (turn) turn.setAttribute("data-rtlx-assistant-rtl", "1");
      }
    }
  }

  // ---- composer input -------------------------------------------------------
  // fallow-ignore-next-line complexity -- composer state requires independent guards
  function applyInputDirection() {
    if (!S.applyToInput) return;
    var inputs = document.querySelectorAll("textarea[data-autoresize]");
    for (var i = 0; i < inputs.length; i++) {
      var ta = inputs[i];
      var text = ta.value || "";
      var hasText = /\S/.test(text);
      var rtl = detectRtl(text);
      ta.classList.toggle("rtlx-input-rtl", rtl);
      ta.classList.toggle("rtlx-input-ltr", !rtl && hasText);
    }
  }

  // ---- math / LaTeX isolation (mirrors browser rtl-engine.js) ---------------

  // True where the rendered base direction is (or will be) RTL — the only
  // place bidi mirroring happens, hence the only place islands are needed.
  function inRTLContext(el) {
    var forced = document.documentElement.getAttribute(FORCE_ALL);
    if (forced === "ltr") return false;
    if (forced === "rtl") return true;
    var host = null;
    try {
      host = el.closest(
        ".rtlx-rtl, [data-rtlx-user-rtl], [data-rtlx-assistant-rtl], [" + TABLE + '="rtl"], [dir="rtl"]'
      );
    } catch (e) {}
    return !!host;
  }

  /**
   * Wrap raw-LaTeX and bare-arithmetic runs inside RTL prose in LTR-isolated
   * spans, so "۲ + ۳ = ۵" / "2 + 3 = 5" don't bidi-mirror and "$x^2$" doesn't
   * scramble. Segmentation lives in RTLXMath (rtl-math.js, loaded via its own
   * <script> tag before this driver); no-ops gracefully when that global is
   * absent so a CSS-only patch still works. DOM discipline: createTreeWalker +
   * replaceChild on text nodes — never innerHTML — to stay gentle on React.
   */
  // fallow-ignore-next-line complexity -- straight port of the browser engine's walker
  function isolateMath(root) {
    var M = window.RTLXMath;
    if (!M || !document.createTreeWalker) return;
    if (!root || root.nodeType !== 1) return;
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        var v = node.nodeValue;
        if (!v || v.length < 3) return NodeFilter.FILTER_REJECT;
        // Cheap pre-filter: a LaTeX hint ($ or \) OR digits near an operator.
        var hasTex = v.indexOf("$") !== -1 || v.indexOf("\\") !== -1;
        var hasNum = M.MATH_DIGIT_RE.test(v) && M.MATH_OP_RE.test(v);
        if (!hasTex && !hasNum) return NodeFilter.FILTER_REJECT;
        var p = node.parentElement;
        if (!p) return NodeFilter.FILTER_REJECT;
        if (p.hasAttribute(ISLAND)) return NodeFilter.FILTER_REJECT;
        if (isCodeBlock(p)) return NodeFilter.FILTER_REJECT;
        if (
          p.closest(
            "[" + ISLAND + '], [contenteditable]:not([contenteditable="false"]), [role="textbox"], textarea'
          )
        )
          return NodeFilter.FILTER_REJECT;
        // Rendered math (KaTeX/MathJax) is already isolated by the app.
        if (p.closest('[class*="katex"], mjx-container, math')) return NodeFilter.FILTER_REJECT;
        if (!inRTLContext(p)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    // Collect first — mutating during the walk invalidates the walker.
    var targets = [];
    var n;
    var budget = 2000;
    while ((n = walker.nextNode()) && budget-- > 0) targets.push(n);
    for (var i = 0; i < targets.length; i++) {
      var textNode = targets[i];
      var segs = M.segmentText(textNode.nodeValue);
      var hasMath = false;
      for (var s = 0; s < segs.length; s++) {
        if (segs[s].type === "math") { hasMath = true; break; }
      }
      if (!hasMath) continue;
      var frag = document.createDocumentFragment();
      for (var k = 0; k < segs.length; k++) {
        if (segs[k].type === "math") {
          var span = document.createElement("span");
          span.setAttribute(ISLAND, "1");
          // Inline styles as belt-and-suspenders with the stylesheet rule.
          span.style.unicodeBidi = "isolate";
          span.style.direction = "ltr";
          span.textContent = segs[k].value;
          frag.appendChild(span);
        } else {
          frag.appendChild(document.createTextNode(segs[k].value));
        }
      }
      if (textNode.parentNode) textNode.parentNode.replaceChild(frag, textNode);
    }
  }

  // ---- tables (mirrors browser rtl-engine.js) -------------------------------

  /**
   * Per-cell + whole-table direction: flip a Persian-column table as a whole
   * (TABLE attr + CSS) and give counter-flow cells their own direction back
   * (an English cell in an RTL table, a Persian cell in an LTR one) via CELL
   * attr. Native dirs are only ever read, never written. Stands down entirely
   * while the global pin is active — the pin wins wholesale.
   */
  // fallow-ignore-next-line complexity -- straight port of the browser engine's table pass
  function processTables(root) {
    var M = window.RTLXMath;
    if (!M || !root || root.nodeType !== 1 || !root.querySelectorAll) return;
    var forced = document.documentElement.getAttribute(FORCE_ALL);
    if (forced === "rtl" || forced === "ltr") return;
    var tables = root.querySelectorAll("table");
    var budget = 40; // tables are heavier than blocks; keep each pass bounded
    for (var i = 0; i < tables.length; i++) {
      var t = tables[i];
      if (budget-- <= 0) break;
      if (t.closest('pre, code, [contenteditable]:not([contenteditable="false"])')) continue;

      // Effective direction of the table as rendered.
      var tdir;
      if (t.getAttribute(TABLE) === "rtl") {
        tdir = "rtl";
      } else if (nativelyHandled(t)) {
        tdir = "rtl"; // native already flipped it — per-cell work only
      } else {
        var headerCells = t.querySelectorAll("thead th");
        if (!headerCells.length) {
          var firstRow = t.querySelector("tr");
          headerCells = firstRow ? firstRow.querySelectorAll("th, td") : [];
        }
        var headerDirs = [];
        for (var h = 0; h < headerCells.length; h++) {
          headerDirs.push(M.cellDir(headerCells[h].textContent || ""));
        }
        var rows = t.querySelectorAll("tbody tr");
        if (!rows.length) {
          rows = Array.prototype.slice.call(t.querySelectorAll("tr"), 1);
        }
        var firstColDirs = [];
        for (var r = 0; r < rows.length; r++) {
          var first = rows[r].querySelector("th, td");
          firstColDirs.push(first ? M.cellDir(first.textContent || "") : null);
        }
        if (M.tableDirFromCells(headerDirs, firstColDirs) === "rtl") {
          t.setAttribute(TABLE, "rtl");
          tdir = "rtl";
        } else {
          tdir = "ltr";
        }
      }

      // Per-cell counter-flow direction.
      var cells = t.querySelectorAll("td, th");
      var cbudget = 400;
      for (var c = 0; c < cells.length; c++) {
        var cell = cells[c];
        if (cbudget-- <= 0) break;
        var d = M.cellDir(cell.textContent || "");
        var want =
          tdir === "rtl" && d === "ltr" ? "ltr" :
          tdir !== "rtl" && d === "rtl" ? "rtl" : null;
        if (want) {
          if (cell.getAttribute(CELL) !== want) cell.setAttribute(CELL, want);
        } else if (cell.hasAttribute(CELL)) {
          cell.removeAttribute(CELL);
        }
      }
    }
  }

  // ---- global toggle --------------------------------------------------------
  var gEl = null;
  function gLabel() {
    if (!gEl) return;
    gEl.textContent = globalForce === "rtl" ? "⇥ RTL" : globalForce === "ltr" ? "⇤ LTR" : "⇌ Auto";
    gEl.dataset.state = globalForce;
  }
  function cycleGlobalForce() {
    globalForce = globalForce === "auto" ? "rtl" : globalForce === "rtl" ? "ltr" : "auto";
    var de = document.documentElement;
    if (globalForce === "auto") de.removeAttribute(FORCE_ALL);
    else de.setAttribute(FORCE_ALL, globalForce);
    saveForce(globalForce); // survive webview reloads
    gLabel();
    sweep();
  }
  function ensureGlobalToggle() {
    if (!document.body) return;
    if (gEl && document.body.contains(gEl)) return;
    gEl = document.createElement("button");
    gEl.id = "rtlx-global";
    gEl.type = "button";
    gEl.title = "Flip the whole chat: Auto → RTL → LTR (Ctrl/Cmd+Shift+9)";
    gEl.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      cycleGlobalForce(); // same path as the keyboard shortcut
    });
    gLabel();
    document.body.appendChild(gEl);
  }

  // ---- keyboard shortcut ----------------------------------------------------
  // Ctrl/Cmd+Shift+9 cycles Auto → RTL → LTR. The pin lives inside the sandboxed
  // webview, so a VS Code keybinding could never reach it — the driver has to
  // own the shortcut. Keyed on e.code (physical key) so a Persian keyboard
  // layout, where `9` types another character, still triggers it.
  function onKeydown(e) {
    if (!e || !(e.ctrlKey || e.metaKey) || !e.shiftKey || e.altKey) return;
    if (e.code !== "Digit9") return;
    e.preventDefault();
    e.stopPropagation();
    cycleGlobalForce();
  }

  // ---- sweep + observer -----------------------------------------------------
  function sweep() {
    try {
      markUserMessages();
      markAssistantMarkdown();
      applyInputDirection();
      // Math/table passes run on this throttled sweep only and no-op without
      // RTLXMath (rtl-math.js), so a CSS-only patch still works.
      processTables(document.body);
      isolateMath(document.body);
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
  document.addEventListener("keydown", onKeydown, true);

  // The observer is the ONLY steady-state trigger: it fires on every DOM change
  // Codex makes, so a 2 s poll on top of it was pure duplicate work (a full
  // querySelectorAll sweep of the whole document, forever, in every open
  // webview). The interval survives only as the fallback for the one case the
  // observer can't cover — it failed to attach at all.
  try {
    new MutationObserver(function () {
      schedule();
    }).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  } catch (error) {
    reportError(error);
    setInterval(sweep, 2000);
  }
})();
