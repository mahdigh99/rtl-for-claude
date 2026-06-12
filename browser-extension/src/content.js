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
    threshold: 0.3, // ratio mode: min RTL share to call a block RTL
    fontEnabled: true,
    fontFamily: '"Vazirmatn RTLX", "Vazirmatn", "Sahel", Tahoma, sans-serif',
    fontScale: 1,
    lineHeight: 1.85,
    letterSpacing: 0,
    applyToInput: true,
    showToggles: true, // per-message manual RTL/LTR override button
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
    const host = location.hostname.replace(/^www\./, "");
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
      for (const root of roots) {
        if (!root || !root.isConnected) continue;
        try {
          RTLX.processSubtree(root, settings);
          ensureToggles(root);
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

  // --- per-message manual toggle (escape hatch when auto-detect is wrong) --
  //
  // Auto-detection is never 100% (a paragraph that opens in the minority
  // language can be mis-based). A tiny ⇌ button on each message lets the user
  // force its whole direction: auto → RTL → LTR → auto. The override is stored
  // as data-rtlx-force on the message container and respected by the engine.

  // Where a "message" is, per site. Unknown sites simply get no buttons.
  const SITE_SELECTORS = {
    "claude.ai": '.font-claude-message, [data-testid="user-message"]',
    "chatgpt.com": "[data-message-author-role]",
    "chat.openai.com": "[data-message-author-role]",
    "gemini.google.com": "message-content, .query-content",
  };

  function messageSelector() {
    return SITE_SELECTORS[location.hostname.replace(/^www\./, "")] || null;
  }

  function updateToggleLabel(container, btn) {
    const cur = container.getAttribute(RTLX.FORCE_ATTR);
    if (cur === "rtl") {
      btn.textContent = "RTL";
      btn.title = "این پیام: راست‌به‌چپ (دستی) — کلیک برای چپ‌به‌راست";
    } else if (cur === "ltr") {
      btn.textContent = "LTR";
      btn.title = "این پیام: چپ‌به‌راست (دستی) — کلیک برای خودکار";
    } else {
      btn.textContent = "⇌"; // ⇌
      btn.title = "جهت این پیام: خودکار — کلیک برای راست‌به‌چپِ دستی";
    }
    btn.dataset.state = cur || "auto";
  }

  function cycleForce(container, btn) {
    const cur = container.getAttribute(RTLX.FORCE_ATTR);
    const next = cur === "rtl" ? "ltr" : cur === "ltr" ? null : "rtl";
    if (next) container.setAttribute(RTLX.FORCE_ATTR, next);
    else container.removeAttribute(RTLX.FORCE_ATTR);
    updateToggleLabel(container, btn);
    try {
      RTLX.processSubtree(container, settings); // re-classify with new override
    } catch (e) {}
  }

  function addToggle(container) {
    if (container.querySelector(":scope > .rtlx-toggle")) return; // already has one
    container.classList.add("rtlx-host");
    const btn = document.createElement("button");
    btn.className = "rtlx-toggle";
    btn.type = "button";
    btn.setAttribute("aria-label", "تغییر جهت این پیام");
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      cycleForce(container, btn);
    });
    updateToggleLabel(container, btn);
    container.appendChild(btn);
  }

  function ensureToggles(root) {
    if (!settings.showToggles) return;
    const sel = messageSelector();
    if (!sel || !root || root.nodeType !== 1) return;
    try {
      if (root.matches && root.matches(sel)) addToggle(root);
      root.querySelectorAll(sel).forEach(addToggle);
    } catch (e) {}
  }

  function teardownToggles() {
    document.querySelectorAll(".rtlx-toggle").forEach((b) => b.remove());
    document
      .querySelectorAll(".rtlx-host")
      .forEach((c) => c.classList.remove("rtlx-host"));
    document
      .querySelectorAll("[" + RTLX.FORCE_ATTR + "]")
      .forEach((c) => c.removeAttribute(RTLX.FORCE_ATTR));
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
    applyCssVars();
    hookHistory();

    // Initial pass over everything already on screen.
    RTLX.processSubtree(document.body, settings);
    ensureToggles(document.body);

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
              // would schedule a redundant re-sweep of the message.
              if (n.classList && n.classList.contains("rtlx-toggle")) return;
              schedule(n);
            } else if (n.nodeType === 3 && n.parentElement) schedule(n.parentElement);
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
    teardownToggles();
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
