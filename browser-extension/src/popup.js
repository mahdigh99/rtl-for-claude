/* popup.js — reads/writes settings via storage.sync; the content script
 * reacts through storage.onChanged, so we don't push DOM changes from here. */
(function () {
  "use strict";
  const api = typeof browser !== "undefined" ? browser : chrome;

  const DEFAULTS = {
    enabled: true,
    mode: "ratio",
    threshold: 0.1,
    fontEnabled: true,
    fontFamily: '"Vazirmatn RTLX", "Vazirmatn", Tahoma, sans-serif',
    fontScale: 1,
    lineHeight: 1.85,
    letterSpacing: 0,
    applyToInput: true,
    showToggles: true,
    forceAll: null,
    sites: { "claude.ai": true, "chatgpt.com": true, "chat.openai.com": true, "gemini.google.com": true, "*": true },
  };

  const $ = (id) => document.getElementById(id);
  const faNum = (n) => String(n); // plain (Latin) numerals in the popup UI

  let settings = DEFAULTS;
  let host = "";

  function currentHostKey() {
    return host in settings.sites || host ? host : "*";
  }

  function render() {
    $("enabled").checked = settings.enabled;
    $("host").textContent = host || "—";
    const siteVal = host in settings.sites ? settings.sites[host] : settings.sites["*"] !== false;
    $("siteEnabled").checked = siteVal;

    document.querySelectorAll(".seg-btn").forEach((b) =>
      b.classList.toggle("active", b.dataset.mode === settings.mode)
    );

    $("threshold").value = settings.threshold;
    $("thresholdVal").textContent = faNum(Math.round(settings.threshold * 100)) + "%";
    $("thresholdWrap").style.display = settings.mode === "ratio" ? "" : "none";

    $("fontEnabled").checked = settings.fontEnabled;
    $("fontFamily").value = settings.fontFamily;
    $("fontScale").value = settings.fontScale;
    $("scaleVal").textContent = faNum(Math.round(settings.fontScale * 100)) + "%";
    $("lineHeight").value = settings.lineHeight;
    $("lhVal").textContent = faNum(settings.lineHeight);
    $("applyToInput").checked = settings.applyToInput;
    $("showToggles").checked = settings.showToggles;
  }

  function save(patch) {
    settings = Object.assign({}, settings, patch);
    api.storage.sync.set(patch);
    render();
  }

  function saveSite(enabled) {
    const sites = Object.assign({}, settings.sites);
    if (host) sites[host] = enabled;
    else sites["*"] = enabled;
    save({ sites });
  }

  function wire() {
    $("enabled").addEventListener("change", (e) => save({ enabled: e.target.checked }));
    $("siteEnabled").addEventListener("change", (e) => saveSite(e.target.checked));

    document.querySelectorAll(".seg-btn").forEach((b) =>
      b.addEventListener("click", () => save({ mode: b.dataset.mode }))
    );

    $("threshold").addEventListener("input", (e) => {
      $("thresholdVal").textContent = faNum(Math.round(e.target.value * 100)) + "%";
    });
    $("threshold").addEventListener("change", (e) => save({ threshold: parseFloat(e.target.value) }));

    $("fontEnabled").addEventListener("change", (e) => save({ fontEnabled: e.target.checked }));
    $("fontFamily").addEventListener("change", (e) => save({ fontFamily: e.target.value }));

    $("fontScale").addEventListener("input", (e) => {
      $("scaleVal").textContent = faNum(Math.round(e.target.value * 100)) + "%";
    });
    $("fontScale").addEventListener("change", (e) => save({ fontScale: parseFloat(e.target.value) }));

    $("lineHeight").addEventListener("input", (e) => {
      $("lhVal").textContent = faNum(e.target.value);
    });
    $("lineHeight").addEventListener("change", (e) => save({ lineHeight: parseFloat(e.target.value) }));

    $("applyToInput").addEventListener("change", (e) => save({ applyToInput: e.target.checked }));
    $("showToggles").addEventListener("change", (e) => save({ showToggles: e.target.checked }));

    $("reprocess").addEventListener("click", async () => {
      const [tab] = await api.tabs.query({ active: true, currentWindow: true });
      if (tab) api.tabs.sendMessage(tab.id, { type: "rtlx:reprocess" }).catch(() => {});
    });

    $("reset").addEventListener("click", () => {
      api.storage.sync.set(DEFAULTS);
      settings = Object.assign({}, DEFAULTS);
      render();
    });
  }

  async function init() {
    try {
      const [tab] = await api.tabs.query({ active: true, currentWindow: true });
      if (tab && tab.url) host = new URL(tab.url).hostname.replace(/^www\./, "");
    } catch (e) { /* file:// or restricted page */ }

    api.storage.sync.get(DEFAULTS, (stored) => {
      settings = Object.assign({}, DEFAULTS, stored || {});
      settings.sites = Object.assign({}, DEFAULTS.sites, stored && stored.sites);
      render();
      wire();
    });
  }

  init();
})();
