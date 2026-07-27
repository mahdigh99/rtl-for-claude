/* ============================================================================
 * driver.js — Claude Desktop (macOS) driver: content.js minus chrome.*.
 *
 * Runs inside the app's sandboxed preload (mainView.js). contextIsolation
 * gives it an isolated world with FULL access to the shared claude.ai DOM —
 * exactly the browser content-script model rtl-engine.js was written for —
 * so this file is the browser content.js pattern with:
 *   • fixed settings (no storage.sync, no popup/options UI),
 *   • the stylesheet injected as a <style> element from __RTLX_DESKTOP__
 *     (CSS + data-URI Vazirmatn, base64-built by apply-rtl.sh at patch time),
 *   • the floating whole-chat toggle persisted in the page's localStorage
 *     (key "rtlx-global-force" — same scheme as the VS Code drivers).
 *
 * Load order inside the injected marker block: prelude (__RTLX_DESKTOP__) →
 * rtl-math.js → rtl-engine.js → this file. The block is APPENDED to the
 * preload (never prepended — "use strict" demotion) and must never run in
 * the Electron main process (no `document` there; we bail just in case).
 * ========================================================================== */
(function () {
  "use strict";
  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (window.__rtlxDesktop) return;
  window.__rtlxDesktop = true;

  var CFG = (typeof globalThis !== "undefined" && globalThis.__RTLX_DESKTOP__) || {};

  // --- origin guard (B6) ----------------------------------------------------
  // mainView.js is the preload of SEVERAL windows (claude.ai chat, 3P setup,
  // sign-in verify, window-manager default). apply-rtl.sh extracts the app's
  // own allowed-origin list from the bundle at patch time (CFG.origins); the
  // regex is the documented fallback covering claude.ai + preview + claude.com.
  var ORIGIN_RE = /^https:\/\/(preview\.)?claude\.(ai|com)$/;
  var allowed = false;
  try {
    if (CFG.origins && CFG.origins.length && CFG.origins.indexOf(location.origin) !== -1) allowed = true;
    if (!allowed && ORIGIN_RE.test(location.origin)) allowed = true;
  } catch (e) {}
  if (!allowed) return;

  // --- fixed settings (the browser extension's defaults for claude.ai) ------
  var settings = {
    enabled: true,
    mode: "ratio",
    threshold: 0.1, // low = turns RTL early & stays stable while streaming
    fontEnabled: true,
    fontFamily: '"Vazirmatn RTLX", "Vazirmatn", "Sahel", Tahoma, sans-serif',
    fontScale: 1,
    lineHeight: 1.85,
    letterSpacing: 0,
    applyToInput: true,
    showToggles: true,
    forceAll: null, // hydrated from localStorage below
    // Same content confinement as the browser extension on claude.ai: a <div>
    // only flips INSIDE a message, never in the app chrome.
    contentSelector: '.font-claude-message, [data-testid="user-message"]',
  };

  // --- persisted whole-chat pin (localStorage; survives app restarts) -------
  var STORE_KEY = "rtlx-global-force";
  function loadForce() {
    try {
      var v = window.localStorage && localStorage.getItem(STORE_KEY);
      return v === "rtl" || v === "ltr" ? v : null;
    } catch (e) {
      return null; // storage blocked → in-memory only
    }
  }
  function saveForce(v) {
    try {
      if (!window.localStorage) return;
      if (v === "rtl" || v === "ltr") localStorage.setItem(STORE_KEY, v);
      else localStorage.removeItem(STORE_KEY);
    } catch (e) {}
  }
  settings.forceAll = loadForce();

  // --- injected stylesheet (CSS + data-URI font, decoded from the prelude) --
  var STYLE_ID = "rtlx-desktop-style";
  var cssText = "";
  try {
    if (CFG.cssB64) {
      var bin = atob(CFG.cssB64);
      var bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      cssText = new TextDecoder("utf-8").decode(bytes); // CSS comments hold UTF-8
    }
  } catch (e) {
    cssText = "";
  }
  function ensureStyle() {
    if (!cssText) return;
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement("style");
    s.id = STYLE_ID;
    s.textContent = cssText;
    (document.head || document.documentElement).appendChild(s);
  }

  var observer = null;
  var active = false;
  var historyHooked = false;

  function applyCssVars() {
    var root = document.documentElement;
    if (!root) return;
    root.style.setProperty("--rtlx-font-stack", settings.fontFamily);
    root.style.setProperty("--rtlx-font-scale", String(settings.fontScale));
    root.style.setProperty("--rtlx-line-height", String(settings.lineHeight));
    root.style.setProperty("--rtlx-letter-spacing", settings.letterSpacing + "em");
  }

  // --- scheduling: throttle streaming mutations (apply ~5x/sec max) ---------
  var pending = new Set();
  var THROTTLE_MS = 200;
  var timerId = 0;
  var lastRun = 0;

  function now() {
    return typeof performance !== "undefined" ? performance.now() : Date.now();
  }

  function flush() {
    timerId = 0;
    lastRun = now();
    var roots = Array.from(pending);
    pending.clear();
    var run = function () {
      if (!active) return; // a stop may have landed after this idle cb was queued
      ensureStyle(); // re-assert if a re-render dropped our <style>
      ensureGlobalToggle();
      for (var i = 0; i < roots.length; i++) {
        var root = roots[i];
        if (!root || !root.isConnected) continue;
        try {
          RTLX.processSubtree(root, settings);
        } catch (e) {
          /* never let one bad node break the loop */
        }
        // Math/LaTeX islands ONLY on this throttled/idle pass — never on the
        // synchronous streaming path. isolateMath itself defers subtrees still
        // marked [data-is-streaming="true"]; the end-of-stream attribute flip
        // re-schedules the message, so the final pass catches everything.
        try {
          if (RTLX.isolateMath) RTLX.isolateMath(root, settings);
        } catch (e) {}
      }
    };
    if ("requestIdleCallback" in window) requestIdleCallback(run, { timeout: 400 });
    else run();
  }

  function schedule(root) {
    if (!active || !observer) return;
    pending.add(root);
    if (timerId) return;
    var elapsed = now() - lastRun;
    var wait = elapsed >= THROTTLE_MS ? 0 : THROTTLE_MS - elapsed;
    timerId = setTimeout(flush, wait);
  }

  // --- compose box -----------------------------------------------------------
  function isComposeBox(el) {
    return !!el && (el.tagName === "TEXTAREA" || el.isContentEditable);
  }

  function onInput(e) {
    if (!settings.applyToInput) return;
    if (isComposeBox(e.target)) RTLX.applyToInput(e.target, settings);
  }

  function onFocusIn(e) {
    if (settings.applyToInput && isComposeBox(e.target))
      RTLX.applyToInput(e.target, settings);
  }

  // --- global direction toggle (one floating button for the WHOLE chat) -----
  var GLOBAL_ID = "rtlx-global-toggle";

  function paintGlobalToggle(btn) {
    var v = settings.forceAll; // null = auto; "rtl" / "ltr" = forced
    var label, title, st;
    if (v === "rtl") {
      label = "RTL";
      title = "کلِ گفتگو: راست‌چینِ دستی — کلیک: چپ‌چین";
      st = "rtl";
    } else if (v === "ltr") {
      label = "LTR";
      title = "کلِ گفتگو: چپ‌چینِ دستی — کلیک: خودکار";
      st = "ltr";
    } else {
      label = "⇌";
      title = "جهتِ گفتگو: خودکار — کلیک: راست‌چینِ دستی";
      st = "auto";
    }
    // Write ONLY on change — setting textContent fires a childList mutation
    // our own observer would see (a permanent ~5×/sec self-flush loop).
    if (btn.textContent !== label) btn.textContent = label;
    if (btn.title !== title) btn.title = title;
    if (btn.dataset.state !== st) btn.dataset.state = st;
  }

  // Reflect the pin onto <html> as data-rtlx-force-all; the stylesheet does
  // the rest (no per-node writes → nothing for the app to fight).
  function applyForceMarker() {
    var de = document.documentElement;
    if (!de) return;
    if (settings.forceAll === "rtl" || settings.forceAll === "ltr")
      de.setAttribute(RTLX.FORCE_ALL_ATTR, settings.forceAll);
    else de.removeAttribute(RTLX.FORCE_ALL_ATTR);
  }

  function cycleGlobal() {
    var cur = settings.forceAll; // auto (⇌) → RTL → LTR → auto → …
    settings.forceAll = cur === "rtl" ? "ltr" : cur === "ltr" ? null : "rtl";
    applyForceMarker();
    saveForce(settings.forceAll);
    try {
      RTLX.processSubtree(document.body, settings);
    } catch (e) {}
  }

  function ensureGlobalToggle() {
    if (!settings.showToggles || !document.body) return;
    var btn = document.getElementById(GLOBAL_ID);
    if (!btn) {
      btn = document.createElement("button");
      btn.id = GLOBAL_ID;
      btn.className = "rtlx-global-toggle";
      btn.type = "button";
      btn.setAttribute("aria-label", "تغییر جهتِ کلِ گفتگو");
      btn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        cycleGlobal();
        paintGlobalToggle(btn);
      });
      document.body.appendChild(btn);
    }
    paintGlobalToggle(btn);
  }

  // --- keyboard shortcut ----------------------------------------------------
  // Ctrl/Cmd+Shift+9 cycles Auto → RTL → LTR, matching the browser extension's
  // command and both VS Code drivers. Keyed on e.code (physical key) so it also
  // fires on a Persian keyboard layout, where `9` types another character.
  function onKeydown(e) {
    if (!e || !(e.ctrlKey || e.metaKey) || !e.shiftKey || e.altKey) return;
    if (e.code !== "Digit9") return;
    e.preventDefault();
    e.stopPropagation();
    cycleGlobal();
    var btn = document.getElementById(GLOBAL_ID);
    if (btn) paintGlobalToggle(btn);
  }

  // --- SPA navigation (Claude swaps conversations without a reload) ---------
  function fullSweep() {
    schedule(document.body);
  }

  function hookHistory() {
    if (historyHooked) return;
    historyHooked = true;
    ["pushState", "replaceState"].forEach(function (fn) {
      var orig = history[fn];
      if (typeof orig !== "function" || orig.__rtlx) return;
      var wrapped = function () {
        var r = orig.apply(this, arguments);
        fullSweep();
        return r;
      };
      wrapped.__rtlx = true;
      history[fn] = wrapped;
    });
    window.addEventListener("popstate", fullSweep);
  }

  // --- lifecycle --------------------------------------------------------------
  function start() {
    if (active) return;
    if (!window.RTLX || !settings.enabled) return; // engine missing → do nothing
    active = true;
    ensureStyle();
    applyCssVars();
    applyForceMarker();
    hookHistory();

    // Initial pass over everything already on screen (the engine skips inputs).
    try {
      RTLX.processSubtree(document.body, settings);
    } catch (e) {}
    try {
      if (RTLX.isolateMath) RTLX.isolateMath(document.body, settings);
    } catch (e) {}
    ensureGlobalToggle();

    observer = new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var m = mutations[i];
        if (m.type === "attributes") {
          // data-is-streaming flips true→false when an answer finishes:
          // do a final clean pass over that message.
          if (m.target.nodeType === 1) schedule(m.target);
          continue;
        }
        if (m.type === "characterData") {
          schedule(m.target.parentElement || document.body);
          continue;
        }
        if (m.addedNodes && m.addedNodes.length) {
          m.addedNodes.forEach(function (n) {
            if (n.nodeType === 1) {
              // Ignore our own injected style/toggle — otherwise appending them
              // would schedule a redundant re-sweep.
              if (n.id === STYLE_ID) return;
              if (n.classList && n.classList.contains("rtlx-global-toggle")) return;
              // Direct newly-inserted streamed content SYNCHRONOUSLY so a fresh
              // <p>/<li> never paints in the page-default direction for a 200ms
              // throttle cycle (the visible left↔right "flash"). The throttled
              // pass below still re-checks it as it keeps growing.
              try { RTLX.processSubtree(n, settings); } catch (e) {}
              schedule(n);
            } else if (n.nodeType === 3 && n.parentElement) {
              // Skip the toggle's own label text node (its repaint) so we
              // never reschedule ourselves.
              if (n.parentElement.id === GLOBAL_ID) return;
              schedule(n.parentElement);
            }
          });
        } else {
          var root = m.target.nodeType === 1 ? m.target : m.target.parentElement;
          if (root) schedule(root);
        }
      }
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["data-is-streaming"],
    });

    document.addEventListener("input", onInput, true);
    document.addEventListener("focusin", onFocusIn, true);
    // Capture phase: the composer swallows plenty of keys on the way down, and
    // the shortcut must work while it has focus.
    document.addEventListener("keydown", onKeydown, true);
  }

  // --- boot -------------------------------------------------------------------
  // The preload runs before the page; wait for the DOM like a content script.
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
