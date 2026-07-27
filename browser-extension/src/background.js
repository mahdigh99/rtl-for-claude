/* ============================================================================
 * background.js — the ONLY reason this extension has a background script:
 * chrome.commands (keyboard shortcuts) can be delivered nowhere else.
 *
 * It is event-driven and does no work at rest: two commands, each a handful of
 * lines. Everything else (settings, custom-site registration, all DOM work)
 * still lives in the popup and the content script.
 *
 * Cross-browser note: Chrome MV3 wants `background.service_worker`, Firefox MV3
 * wants `background.scripts` (event page). manifest.json declares BOTH — each
 * browser picks the key it understands and warns about the other — so this file
 * must stay valid as a service worker AND as a classic script: no DOM, no
 * top-level await, no imports.
 * ========================================================================== */
"use strict";

const api = typeof browser !== "undefined" ? browser : chrome;

// The shortcut targets the tab the user is looking at. `tabs.query` gives us the
// id without the "tabs" permission (only privileged fields like url are gated),
// and sendMessage rejects on a tab with no content script — which is exactly the
// behaviour we want on, say, a settings page: do nothing, quietly.
//
// Promise style here (not callbacks) to match popup.js: it is what works in
// Firefox's `browser.*` namespace as well as Chrome's.
async function sendToActiveTab(message) {
  try {
    const [tab] = await api.tabs.query({ active: true, currentWindow: true });
    if (!tab || tab.id == null) return;
    await api.tabs.sendMessage(tab.id, message);
  } catch (e) {
    /* restricted page, or no content script there */
  }
}

function toggleEnabled() {
  // Callback style for storage, matching content.js/popup.js.
  api.storage.sync.get({ enabled: true }, (stored) => {
    // The content script reacts through storage.onChanged, in every open tab —
    // the same path the popup's switch uses, so the two can never disagree.
    api.storage.sync.set({ enabled: !(stored && stored.enabled !== false) });
  });
}

if (api.commands && api.commands.onCommand) {
  api.commands.onCommand.addListener((command) => {
    if (command === "cycle-direction") sendToActiveTab({ type: "rtlx:cycle" });
    else if (command === "toggle-enabled") toggleEnabled();
  });
}
