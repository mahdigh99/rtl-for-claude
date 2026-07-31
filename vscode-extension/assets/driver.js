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

  // --- React-crash guard ------------------------------------------------------
  // We wrap text nodes (math islands) and insert buttons inside a React-owned
  // tree; when React later reconciles a node we moved, removeChild/insertBefore
  // throw and the whole webview dies ("Something went wrong … Failed to execute
  // 'removeChild' on 'Node'"). Same crash Google Translate causes on React
  // apps; same well-known cure — soften exactly those two calls. This driver
  // runs in the webview's own (main) world, so patching here reaches React.
  try {
    if (!window.__rtlxDomGuard && typeof Node === "function" && Node.prototype) {
      window.__rtlxDomGuard = true;
      var __rtlxRemove = Node.prototype.removeChild;
      Node.prototype.removeChild = function (child) {
        if (child && child.parentNode !== this) return child;
        return __rtlxRemove.apply(this, arguments);
      };
      var __rtlxInsert = Node.prototype.insertBefore;
      Node.prototype.insertBefore = function (node, ref) {
        if (ref && ref.parentNode !== this) return this.appendChild(node);
        return __rtlxInsert.apply(this, arguments);
      };
    }
  } catch (e) {}

  var S = Object.assign(
    {
      enabled: true,
      fontStack: '"Vazirmatn RTLX", "Vazirmatn", var(--vscode-font-family), Tahoma, sans-serif',
      fontScale: 1,
      lineHeight: 1.85,
      letterSpacing: 0,
      // Detection defaults, matching the browser engine's exactly (rtl-engine.js
      // DEFAULT_THRESHOLD). The extension injects the user's values on top.
      mode: "ratio", // ratio | first-strong
      threshold: 0.1,
      applyToInput: true,
      showToggles: true,
      keepCodeLTR: true,
      togglePlacement: "toolbar", // toolbar | floating | hidden
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
  var FIRST_STRONG_RE = new RegExp("[" + RTL_RE.source.slice(1, -1) + "A-Za-zÀ-ɏͰ-ϿЀ-ӿḀ-ỿ]");
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
    var r = (s.match(RTL_G) || []).length, l = (s.match(LTR_G) || []).length;
    if (!(r + l)) return null;
    return r / (r + l) >= (typeof thr === "number" ? thr : S.threshold) ? "rtl" : "ltr";
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
    // Unitless 0 is a valid letter-spacing only as the keyword `normal`; the
    // stylesheet's fallback handles the absent case, so always emit `em`.
    de.style.setProperty("--rtlx-letter-spacing", Number(S.letterSpacing || 0) + "em");
    de.classList.toggle("rtlx-code-ltr", !!S.keepCodeLTR);
  }

  var SEEN = "data-rtlx-seen";
  var FORCE_ALL = "data-rtlx-force-all";
  var ISLAND = "data-rtlx-island";
  var TABLE = "data-rtlx-table";
  var CELL = "data-rtlx-cell";

  // --- persisted global pin --------------------------------------------------
  // The Auto/RTL/LTR pin used to be in-memory only (`globalForce`) and reset on
  // every webview reload. Persist it in the webview's localStorage and re-apply
  // it here — synchronously, during script evaluation — so a pinned chat is
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
  globalForce = loadForce();
  if (globalForce !== "auto") de.setAttribute(FORCE_ALL, globalForce);

  // A `dir` the APP set (not us): the nearest dir'd ancestor-or-self below
  // <html>/<body>. This driver never writes dir attributes, so any such host is
  // native. If it already points the right way ("rtl", or "auto") the app
  // handled this message — stamping SEEN on top would double-apply and fight
  // future native updates; native dirs are never removed or overridden. A
  // native dir="ltr" on genuinely RTL text is a gap we still fill. Inner
  // `<span dir="auto">` leaves do NOT count (closest() only sees ancestors), so
  // the [dir="auto"] inherit rules in styles.css keep working.
  function nativelyHandled(el) {
    if (!el || !el.closest) return false;
    var host = null;
    try { host = el.closest("[dir]"); } catch (e) {}
    if (!host || host === de || host === document.body) return false;
    var d = host.getAttribute("dir");
    return d === "rtl" || d === "auto";
  }

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
        if (RTL_RE.test(b.textContent || "") && dirByRatio(b.textContent || "") === "rtl") {
          if (nativelyHandled(b)) continue; // the app already renders this block RTL
          rtl = true;
          break;
        }
      }
    } else if (RTL_RE.test(msg.textContent || "") && dirByRatio(msg.textContent || "") === "rtl") {
      rtl = !nativelyHandled(msg);
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

  // --- math / LaTeX isolation (mirrors browser rtl-engine.js) ----------------

  // True where the rendered base direction is (or will be) RTL — the only
  // place bidi mirroring happens, hence the only place islands are needed.
  function inRTLContext(el) {
    var forced = de.getAttribute(FORCE_ALL);
    if (forced === "ltr") return false;
    if (forced === "rtl") return true;
    var f = null;
    try { f = el.closest("[" + FORCE + "]"); } catch (e) {}
    if (f) return f.getAttribute(FORCE) === "rtl";
    var host = null;
    try { host = el.closest("[" + SEEN + "], [" + TABLE + '="rtl"], [dir="rtl"]'); } catch (e) {}
    return !!host;
  }

  /**
   * Wrap raw-LaTeX and bare-arithmetic runs inside RTL prose in LTR-isolated
   * spans, so "۲ + ۳ = ۵" / "2 + 3 = 5" don't bidi-mirror and "$x^2$" doesn't
   * scramble. Segmentation lives in RTLXMath (rtl-math.js, injected before this
   * driver); no-ops gracefully when that global is absent so a CSS-only patch
   * still works. DOM discipline: createTreeWalker + replaceChild on text nodes —
   * never innerHTML — to stay gentle on React.
   */
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
        if (
          p.closest(
            "pre, code, kbd, samp, [" + ISLAND + "], " +
              '[contenteditable]:not([contenteditable="false"]), [role="textbox"]'
          )
        )
          return NodeFilter.FILTER_REJECT;
        // Rendered math (KaTeX/MathJax) is already isolated by the app.
        if (p.closest('[class*="katex"], mjx-container, math')) return NodeFilter.FILTER_REJECT;
        if (p.closest('[data-is-streaming="true"]')) return NodeFilter.FILTER_REJECT;
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

  // --- tables (mirrors browser rtl-engine.js) --------------------------------

  /**
   * Per-cell + whole-table direction. Inside a SEEN container the stylesheet
   * already flips the table; here we (a) flip standalone RTL tables the
   * container mechanism missed (TABLE attr + CSS), and (b) give counter-flow
   * cells their own direction back (an English cell in an RTL table, a Persian
   * cell in an LTR one) via CELL attr. Native dirs are only ever read, never
   * written. Stands down entirely while a user pin (global or per-message) is
   * active — the pin wins wholesale.
   */
  function processTables(root) {
    var M = window.RTLXMath;
    if (!M || !root || root.nodeType !== 1 || !root.querySelectorAll) return;
    var forced = de.getAttribute(FORCE_ALL);
    if (forced === "rtl" || forced === "ltr") return;
    var tables = root.querySelectorAll("table");
    var budget = 40; // tables are heavier than blocks; keep each pass bounded
    for (var i = 0; i < tables.length; i++) {
      var t = tables[i];
      if (budget-- <= 0) break;
      if (t.closest('pre, code, [contenteditable]:not([contenteditable="false"])')) continue;
      if (t.closest("[" + FORCE + "]")) continue; // per-message pin wins
      var inSeen = !!t.closest("[" + SEEN + "]");

      // Effective direction of the table as rendered.
      var tdir;
      if (inSeen || t.getAttribute(TABLE) === "rtl") {
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

  function sweep() {
    var msgs = document.querySelectorAll(MSG);
    for (var i = 0; i < msgs.length; i++) processMsg(msgs[i]);
    var q = document.querySelectorAll(QBOX); // AskUserQuestion boxes
    for (var j = 0; j < q.length; j++) markSeen(q[j]);
    if (S.applyToInput) {
      var ins = document.querySelectorAll(INPUT);
      for (var k = 0; k < ins.length; k++) applyInput(ins[k]);
    }
    // Math/table passes run on this throttled sweep only — never on the
    // synchronous (pre-paint) path — and no-op without RTLXMath.
    try { processTables(document.body); } catch (e) {}
    try { isolateMath(document.body); } catch (e) {}
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
    // A user message matches MSG twice — the outer userMessageContainer_ and the
    // inner userMessage_ bubble — which used to stack two buttons in the same
    // corner. Only the outermost one gets the toggle; forcing it from there
    // covers the bubble because the force rules are descendant-scoped.
    if (msg.parentElement && msg.parentElement.closest(MSG)) return;
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

  // --- global direction toggle (flip the whole chat, no reload) -------------
  // Preferred home is the panel's top toolbar, right beside the New session /
  // Session history icons — those buttons expose STABLE aria-labels, unlike the
  // hashed CSS-module classes everywhere else. If that toolbar is not present
  // (older/newer build, or not rendered yet) we fall back to a floating pill so
  // the control never disappears. Docking is re-checked every sweep, so if the
  // toolbar mounts late — or React re-creates it and drops our button — we slot
  // back in on the next tick.
  var gEl = null;
  function gLabel() {
    if (!gEl) return;
    // Icons-only when docked in the toolbar (tight space); labelled when floating.
    var docked = gEl.dataset.dock === "top";
    gEl.textContent = globalForce === "rtl"
      ? (docked ? "⇥" : "⇥ RTL")
      : globalForce === "ltr"
        ? (docked ? "⇤" : "⇤ LTR")
        : (docked ? "⇌" : "⇌ Auto");
    gEl.dataset.state = globalForce;
  }
  function toolbarAnchor() {
    // The Session-history / New-session icon buttons live in the top toolbar.
    return (
      document.querySelector('button[aria-label="Session history"]') ||
      document.querySelector('button[aria-label="New session"]')
    );
  }
  function placeToggle() {
    // "floating" pins the pill to the corner; only "toolbar" tries to dock.
    if (S.togglePlacement === "floating") {
      if (gEl.dataset.dock !== "float") {
        document.body.appendChild(gEl);
        gEl.dataset.dock = "float";
        gLabel();
      }
      return;
    }
    var anchor = toolbarAnchor();
    if (anchor && anchor.parentNode) {
      // Dock as the anchor's sibling so it sits inline with the toolbar icons.
      if (gEl.parentNode !== anchor.parentNode || gEl.dataset.dock !== "top") {
        anchor.parentNode.insertBefore(gEl, anchor.nextSibling);
        gEl.dataset.dock = "top";
        gLabel(); // switch to the compact icon-only label
      }
    } else if (gEl.dataset.dock !== "float") {
      document.body.appendChild(gEl);
      gEl.dataset.dock = "float";
      gLabel();
    }
  }
  function ensureGlobalToggle() {
    if (S.togglePlacement === "hidden") {
      if (gEl) { gEl.remove(); gEl = null; }
      return;
    }
    if (gEl && gEl.isConnected) {
      placeToggle();
      return;
    }
    gEl = document.createElement("button");
    gEl.id = "rtlx-global";
    gEl.type = "button";
    gEl.title = "Flip the whole chat: Auto → RTL → LTR";
    gEl.dataset.dock = "float";
    gEl.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      cycleGlobalForce(); // same path as the keyboard shortcut
    });
    gLabel();
    document.body.appendChild(gEl); // provisional; placeToggle may dock it
    placeToggle();
  }

  // --- keyboard shortcut -----------------------------------------------------
  // Ctrl/Cmd+Shift+9 cycles Auto → RTL → LTR, the same states the button walks.
  // A VS Code `contributes.keybindings` entry could never do this: the pin lives
  // inside the sandboxed webview, unreachable from the extension host. Keyed on
  // e.code (physical key), not e.key — on a Persian keyboard layout `9` types a
  // different character, and the shortcut must still work there.
  function cycleGlobalForce() {
    globalForce = globalForce === "auto" ? "rtl" : globalForce === "rtl" ? "ltr" : "auto";
    if (globalForce === "auto") de.removeAttribute(FORCE_ALL);
    else de.setAttribute(FORCE_ALL, globalForce);
    saveForce(globalForce);
    gLabel();
  }
  function onKeydown(e) {
    if (!e || !(e.ctrlKey || e.metaKey) || !e.shiftKey || e.altKey) return;
    if (e.code !== "Digit9") return;
    e.preventDefault();
    e.stopPropagation();
    cycleGlobalForce();
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
    // Capture phase: the chat's own editor swallows plenty of keys on the way
    // down, and the shortcut must work while the composer has focus.
    document.addEventListener("keydown", onKeydown, true);
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
