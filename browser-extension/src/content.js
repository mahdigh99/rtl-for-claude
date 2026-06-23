/* ============================================================================
 * content.js — orchestration: read settings, watch the DOM, drive RTLX.
 *
 * Loaded after rtl-engine.js (see manifest js order), so the global RTLX
 * exists. Site-agnostic; claude.ai is the primary target. Design follows the
 * proven pattern for AI chats: ONE MutationObserver on <body>, throttled,
 * idle-scheduled, idempotent re-application, plus SPA-navigation + end-of-
 * stream re-passes.
 * ========================================================================== */
(function () {
  "use strict";

  // chrome.* callbacks work in BOTH Chrome and Firefox (Firefox aliases it),
  // so no webextension-polyfill is needed for storage + messaging.
  const api = typeof browser !== "undefined" ? browser : chrome;

  const DEFAULT_SETTINGS = {
    enabled: true,
    mode: "ratio", // "ratio" | "first-strong"
    threshold: 0.1, // ratio mode: min RTL share to call a block RTL (low = turns
    // RTL early & stays stable while streaming; Persian answers cross it fast)
    fontEnabled: true,
    fontFamily: '"Vazirmatn RTLX", "Vazirmatn", "Sahel", Tahoma, sans-serif',
    fontScale: 1,
    lineHeight: 1.85,
    letterSpacing: 0,
    applyToInput: true,
    showToggles: true, // show the floating whole-chat direction toggle
    forceAll: null, // global direction pin from the floating toggle: null | "rtl" | "ltr"
    sites: {
      "claude.ai": true,
      "chatgpt.com": true,
      "chat.openai.com": true,
      "gemini.google.com": true,
      "*": true,
    },
  };

  let settings = DEFAULT_SETTINGS;
  let observer = null;
  let active = false;
  let historyHooked = false;

  // --- settings -------------------------------------------------------------

  function hostEnabled(s) {
    const host = baseHost();
    if (host in s.sites) return s.sites[host];
    return s.sites["*"] !== false;
  }

  function loadSettings() {
    return new Promise((resolve) => {
      api.storage.sync.get(DEFAULT_SETTINGS, (stored) => {
        settings = Object.assign({}, DEFAULT_SETTINGS, stored || {});
        settings.sites = Object.assign({}, DEFAULT_SETTINGS.sites, stored && stored.sites);
        resolve(settings);
      });
    });
  }

  function applyCssVars() {
    const root = document.documentElement;
    root.style.setProperty("--rtlx-font-stack", settings.fontFamily);
    root.style.setProperty("--rtlx-font-scale", String(settings.fontScale));
    root.style.setProperty("--rtlx-line-height", String(settings.lineHeight));
    root.style.setProperty("--rtlx-letter-spacing", settings.letterSpacing + "em");
  }

  // --- scheduling: throttle streaming mutations (apply ~5x/sec max) --------

  const pending = new Set();
  const THROTTLE_MS = 200;
  let timerId = 0;
  let lastRun = 0;

  function now() {
    return typeof performance !== "undefined" ? performance.now() : Date.now();
  }

  function flush() {
    timerId = 0;
    lastRun = now();
    const roots = [...pending];
    pending.clear();
    const run = () => {
      if (!active) return; // a stop() may have landed after this idle cb was queued
      ensureGlobalToggle(); // re-assert the floating button if a re-render dropped it
      for (const root of roots) {
        if (!root || !root.isConnected) continue;
        try {
          RTLX.processSubtree(root, settings);
        } catch (e) {
          /* never let one bad node break the loop */
        }
      }
    };
    if ("requestIdleCallback" in window) requestIdleCallback(run, { timeout: 400 });
    else run();
  }

  function schedule(root) {
    if (!active || !observer) return;
    pending.add(root);
    if (timerId) return;
    const elapsed = now() - lastRun;
    const wait = elapsed >= THROTTLE_MS ? 0 : THROTTLE_MS - elapsed;
    timerId = setTimeout(flush, wait);
  }

  // --- compose box ----------------------------------------------------------

  function isComposeBox(el) {
    return !!el && (el.tagName === "TEXTAREA" || el.isContentEditable);
  }

  function onInput(e) {
    if (!settings.applyToInput) return;
    if (isComposeBox(e.target)) RTLX.applyToInput(e.target, settings);
  }

  // Named (not anonymous) so stop() can remove it — otherwise it would
  // accumulate one handler per restart().
  function onFocusIn(e) {
    if (settings.applyToInput && isComposeBox(e.target))
      RTLX.applyToInput(e.target, settings);
  }

  // Where a "message" / real content lives, per site. Fed to the engine as
  // settings.contentSelector so a <div> only flips INSIDE content (never the
  // app chrome). Unknown sites → null → prose-tags-only (always chrome-safe).
  const SITE_SELECTORS = {
    "claude.ai": '.font-claude-message, [data-testid="user-message"]',
    "chatgpt.com": "[data-message-author-role]",
    "chat.openai.com": "[data-message-author-role]",
    "gemini.google.com": "message-content, .query-content",
  };

  // Resolve the registrable site key even on subdomains (app.claude.ai →
  // claude.ai) so a known site keeps its content selector — and forceAll stays
  // confined to messages — no matter which subdomain serves the app.
  function baseHost() {
    const h = location.hostname.replace(/^www\./, "");
    if (SITE_SELECTORS[h]) return h;
    const k = Object.keys(SITE_SELECTORS).find((key) => h === key || h.endsWith("." + key));
    return k || h;
  }

  function messageSelector() {
    return SITE_SELECTORS[baseHost()] || null;
  }

  // --- global direction toggle (one floating button for the WHOLE chat) -----
  //
  // Auto-detection is excellent but never 100%. A per-message button fought
  // each site's own message toolbars (and broke on Claude). Instead we float
  // ONE button on the viewport that pins the whole conversation:
  //   auto (⇌) → RTL → LTR → auto.
  // The choice is saved (storage.sync.forceAll), so it sticks across reloads,
  // and because it's a fixed element on <body> it behaves identically on every
  // site regardless of message structure.

  const GLOBAL_ID = "rtlx-global-toggle";

  function paintGlobalToggle(btn) {
    const v = settings.forceAll; // null = auto; "rtl" / "ltr" = forced
    let label, title, st;
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
    // Write ONLY on change. Setting textContent — even to the same string —
    // replaces the text node and fires a childList mutation that our own
    // MutationObserver would see and reschedule, a permanent ~5×/sec self-flush
    // loop. Guarding makes a steady-state repaint emit zero mutations.
    if (btn.textContent !== label) btn.textContent = label;
    if (btn.title !== title) btn.title = title;
    if (btn.dataset.state !== st) btn.dataset.state = st;
  }

  // Reflect the global pin onto <html> as data-rtlx-force-all; the stylesheet
  // does the rest (no per-node writes → nothing for the app to fight).
  function applyForceMarker() {
    const de = document.documentElement;
    if (!de) return;
    if (settings.forceAll === "rtl" || settings.forceAll === "ltr")
      de.setAttribute(RTLX.FORCE_ALL_ATTR, settings.forceAll);
    else de.removeAttribute(RTLX.FORCE_ALL_ATTR);
  }

  function applyForceAllNow() {
    if (!active) return;
    applyForceMarker();
    settings.contentSelector = messageSelector();
    try {
      RTLX.processSubtree(document.body, settings);
    } catch (e) {}
  }

  // The floating button pins the WHOLE chat's direction, cycling:
  //   auto (⇌) → RTL → LTR → auto → …
  function cycleGlobal() {
    const cur = settings.forceAll;
    settings.forceAll = cur === "rtl" ? "ltr" : cur === "ltr" ? null : "rtl";
    // Apply RIGHT NOW, synchronously, in this tab — never depend on the
    // storage.onChanged round-trip (it can be async or swallowed). Persist too.
    applyForceAllNow();
    try {
      api.storage.sync.set({ forceAll: settings.forceAll });
    } catch (e) {}
  }

  function ensureGlobalToggle() {
    if (!settings.showToggles) {
      removeGlobalToggle();
      return;
    }
    let btn = document.getElementById(GLOBAL_ID);
    if (!btn) {
      btn = document.createElement("button");
      btn.id = GLOBAL_ID;
      btn.className = "rtlx-global-toggle";
      btn.type = "button";
      btn.setAttribute("aria-label", "تغییر جهتِ کلِ گفتگو");
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        cycleGlobal();
        paintGlobalToggle(btn); // instant feedback before the storage round-trip
      });
      (document.body || document.documentElement).appendChild(btn);
    }
    paintGlobalToggle(btn);
  }

  function removeGlobalToggle() {
    const btn = document.getElementById(GLOBAL_ID);
    if (btn) btn.remove();
  }

  // --- SPA navigation (Claude swaps conversations without a reload) --------

  function fullSweep() {
    schedule(document.body);
  }

  function hookHistory() {
    if (historyHooked) return;
    historyHooked = true;
    ["pushState", "replaceState"].forEach((fn) => {
      const orig = history[fn];
      if (typeof orig !== "function" || orig.__rtlx) return;
      const wrapped = function () {
        const r = orig.apply(this, arguments);
        fullSweep();
        return r;
      };
      wrapped.__rtlx = true;
      history[fn] = wrapped;
    });
    window.addEventListener("popstate", fullSweep);
  }

  // --- lifecycle ------------------------------------------------------------

  function start() {
    if (active) return;
    if (!settings.enabled || !hostEnabled(settings)) return;
    active = true;
    // Tell the engine where "real content" lives on this site. Outside it, a
    // <div> is treated as layout and never flipped (keeps the app chrome intact);
    // inside it, content <div>s flip too. null on unknown sites → prose-only,
    // which is always chrome-safe.
    settings.contentSelector = messageSelector();
    applyCssVars();
    applyForceMarker();
    hookHistory();

    // Initial pass over everything already on screen (the engine skips inputs).
    try {
      RTLX.processSubtree(document.body, settings);
    } catch (e) {}
    ensureGlobalToggle();

    observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === "attributes") {
          // data-is-streaming flips true->false when an answer finishes:
          // do a final clean pass over that message.
          if (m.target.nodeType === 1) schedule(m.target);
          continue;
        }
        if (m.type === "characterData") {
          schedule(m.target.parentElement || document.body);
          continue;
        }
        // childList: react to the smallest changed subtree we can.
        if (m.addedNodes && m.addedNodes.length) {
          m.addedNodes.forEach((n) => {
            if (n.nodeType === 1) {
              // Ignore our own injected toggle button — otherwise appending it
              // would schedule a redundant re-sweep.
              if (n.classList && n.classList.contains("rtlx-global-toggle")) return;
              // Direct newly-inserted streamed content SYNCHRONOUSLY so a fresh
              // <p>/<li> never paints in the page-default direction for a 200ms
              // throttle cycle (the visible left↔right "flash"). The throttled
              // pass below still re-checks it as it keeps growing.
              try { RTLX.processSubtree(n, settings); } catch (e) {}
              schedule(n);
            } else if (n.nodeType === 3 && n.parentElement) {
              // Skip the toggle's own label text node (its repaint) so we never
              // reschedule ourselves.
              if (n.parentElement.id === GLOBAL_ID) return;
              schedule(n.parentElement);
            }
          });
        } else {
          const root = m.target.nodeType === 1 ? m.target : m.target.parentElement;
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
  }

  function stop() {
    if (!active) return;
    active = false;
    if (observer) observer.disconnect();
    observer = null;
    if (timerId) {
      clearTimeout(timerId);
      timerId = 0;
    }
    pending.clear();
    document.removeEventListener("input", onInput, true);
    document.removeEventListener("focusin", onFocusIn, true);
    removeGlobalToggle();
    // Reset so a later start() re-validates the history hooks. (The wrappers
    // themselves persist and are guarded by `active`, but keeping this flag
    // honest avoids surprises if stop() ever learns to unhook.)
    historyHooked = false;
    RTLX.teardown(document);
  }

  function restart() {
    stop();
    start();
  }

  // --- react to popup/options changes --------------------------------------

  // Serialize reactions to settings changes: chain them so two rapid toggles
  // can never run stop()/start() concurrently (which would leak observers).
  let settingsOp = Promise.resolve();
  api.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "sync") return;
    // The floating toggle already applied forceAll instantly in its own tab; a
    // lone forceAll change must not trigger a teardown/restart that fights it.
    const keys = Object.keys(changes || {});
    if (keys.length === 1 && keys[0] === "forceAll") return;
    settingsOp = settingsOp
      .then(() => loadSettings())
      .then(() => {
        applyCssVars();
        if (settings.enabled && hostEnabled(settings)) restart();
        else stop();
      })
      .catch(() => {});
  });

  if (api.runtime && api.runtime.onMessage) {
    api.runtime.onMessage.addListener((msg) => {
      if (!msg) return;
      if (msg.type === "rtlx:reprocess" && active) fullSweep();
      if (msg.type === "rtlx:toggle") {
        settings.enabled = !settings.enabled;
        api.storage.sync.set({ enabled: settings.enabled });
      }
    });
  }

  // --- boot -----------------------------------------------------------------

  function boot() {
    loadSettings().then(start);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
