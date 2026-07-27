/* popup.js — reads/writes settings via storage.sync; the content script
 * reacts through storage.onChanged, so we don't push DOM changes from here.
 *
 * Also owns the "custom sites" feature: the user adds any AI-chat host, we
 * request access at runtime (optional_host_permissions) and register the
 * content scripts dynamically (chrome.scripting) — removal revokes both. */
(function () {
  "use strict";
  const api = typeof browser !== "undefined" ? browser : chrome;

  const DEFAULTS = {
    enabled: true,
    mode: "ratio",
    threshold: 0.1,
    fontEnabled: true,
    fontFamily: '"Vazirmatn RTLX", "Vazirmatn", Tahoma, sans-serif',
    localFont: "",
    localFontScope: "rtl",
    fontScale: 1,
    lineHeight: 1.85,
    letterSpacing: 0,
    applyToInput: true,
    showToggles: true,
    forceAll: null,
    language: "auto",
    sites: { "claude.ai": true, "chatgpt.com": true, "chat.openai.com": true, "gemini.google.com": true, "*": true },
  };

  // Hosts covered by the static content_scripts in manifest.json. Custom sites
  // must not duplicate these (they already work without any extra permission).
  const BUILTIN_SITES = ["claude.ai", "chatgpt.com", "chat.openai.com", "gemini.google.com"];

  const $ = (id) => document.getElementById(id);
  const faNum = (n) => String(n); // plain (Latin) numerals in the popup UI

  let settings = DEFAULTS;
  let host = "";

  // --- i18n ------------------------------------------------------------------
  // Same inline-dictionary + data-i18n pattern as the VS Code panel
  // (vscode-extension/media/panel.html): `en` is captured from the markup so it
  // stays the single source of truth; fa/ar/ur flip the whole popup to RTL.
  const I18N = {
    en: {},
    fa: {
      onOff: "روشن / خاموش",
      language: "زبان",
      langAuto: "خودکار (مرورگر)",
      thisSite: "این سایت",
      detectionMode: "حالتِ تشخیص",
      detSmart: "هوشمند (نسبت)",
      detFirst: "حرفِ اول",
      modeHint: "«هوشمند» برای پاراگراف‌های راست‌چینِ پُر از واژه‌های انگلیسی بهتر است.",
      sensitivity: "حساسیتِ راست‌چین",
      sensitivityHint: "کمتر = راحت‌تر راست‌چین می‌شود.",
      prettyFont: "فونتِ زیبای راست‌چین (وزیرمتن)",
      font: "فونت",
      fontTahoma: "Tahoma (سیستم)",
      fontSite: "فونتِ خودِ سایت",
      localFont: "فونتِ نصب‌شده روی کامپیوترم",
      localFontPh: "مثلاً Vazirmatn",
      localFontHint: "خالی بگذارید تا از فونتِ همراهِ افزونه استفاده شود. اگر فونت نصب نباشد، خودکار به همان برمی‌گردد.",
      scopeRtl: "فقط حروفِ راست‌چین",
      scopeAll: "همهٔ متن‌ها",
      textSize: "اندازهٔ متن",
      lineSpacing: "فاصلهٔ خط‌ها",
      applyToInput: "اعمال روی کادرِ پیام",
      showToggles: "دکمهٔ شناورِ جهت",
      customSites: "سایت‌های دلخواه",
      customSitesHint: "روی هر چتِ هوش مصنوعی کار می‌کند — مرورگر اجازهٔ دسترسی را از خودت می‌پرسد.",
      hostPh: "مثلاً chat.deepseek.com",
      selectorPh: "سلکتور CSS پیام‌ها (اختیاری)",
      addSite: "افزودن",
      removeSite: "حذف",
      allow: "اجازه",
      invalidHost: "این نامِ دامنه معتبر به نظر نمی‌رسد.",
      alreadySupported: "این سایت از قبل پشتیبانی می‌شود.",
      invalidSelector: "سلکتور CSS معتبر نیست.",
      permDenied: "اجازهٔ دسترسی داده نشد.",
      reprocess: "اعمالِ دوباره روی صفحه",
      reset: "بازنشانی",
    },
    ar: {
      onOff: "تشغيل / إيقاف",
      language: "اللغة",
      langAuto: "تلقائي (المتصفح)",
      thisSite: "هذا الموقع",
      detectionMode: "وضع الاكتشاف",
      detSmart: "ذكي (نسبة)",
      detFirst: "أول حرف",
      modeHint: "«الذكي» أفضل للفقرات اليمينية المليئة بالمصطلحات الإنجليزية.",
      sensitivity: "حساسية الاتجاه اليميني",
      sensitivityHint: "أقل = ينقلب إلى اليمين بسهولة أكبر.",
      prettyFont: "خط جميل للنص اليميني (Vazirmatn)",
      font: "الخط",
      fontTahoma: "Tahoma (النظام)",
      fontSite: "خط الموقع نفسه",
      localFont: "خط مثبَّت على جهازي",
      localFontPh: "مثال: Vazirmatn",
      localFontHint: "اتركه فارغًا لاستخدام الخط المرفق. وإن لم يكن الخط مثبّتًا، يُستخدم المرفق تلقائيًا.",
      scopeRtl: "الحروف اليمينية فقط",
      scopeAll: "كل النصوص",
      textSize: "حجم النص",
      lineSpacing: "تباعد الأسطر",
      applyToInput: "تطبيق على صندوق الكتابة",
      showToggles: "زر الاتجاه العائم",
      customSites: "مواقع مخصّصة",
      customSitesHint: "يعمل على أي محادثة ذكاء اصطناعي — سيطلب المتصفح إذنك بالوصول.",
      hostPh: "مثال: chat.deepseek.com",
      selectorPh: "مُحدِّد CSS للرسائل (اختياري)",
      addSite: "إضافة",
      removeSite: "إزالة",
      allow: "السماح",
      invalidHost: "لا يبدو هذا نطاقًا صالحًا.",
      alreadySupported: "هذا الموقع مدعوم بالفعل.",
      invalidSelector: "مُحدِّد CSS غير صالح.",
      permDenied: "لم يُمنح الإذن.",
      reprocess: "إعادة التطبيق على الصفحة",
      reset: "إعادة تعيين",
    },
    ur: {
      onOff: "آن / آف",
      language: "زبان",
      langAuto: "خودکار (براؤزر)",
      thisSite: "یہ سائٹ",
      detectionMode: "پہچان کا طریقہ",
      detSmart: "سمارٹ (تناسب)",
      detFirst: "پہلا حرف",
      modeHint: "انگریزی اصطلاحات سے بھرے RTL پیراگراف کے لیے «سمارٹ» بہتر ہے۔",
      sensitivity: "RTL حساسیت",
      sensitivityHint: "کم = زیادہ آسانی سے دائیں سے بائیں ہو جاتا ہے۔",
      prettyFont: "خوبصورت RTL فونٹ (Vazirmatn)",
      font: "فونٹ",
      fontTahoma: "Tahoma (سسٹم)",
      fontSite: "سائٹ کا اپنا فونٹ",
      localFont: "میرے کمپیوٹر پر نصب فونٹ",
      localFontPh: "مثلاً Vazirmatn",
      localFontHint: "خالی چھوڑیں تو شامل فونٹ استعمال ہوگا۔ اگر فونٹ نصب نہ ہو تو خودکار طور پر وہی استعمال ہوتا ہے۔",
      scopeRtl: "صرف RTL حروف",
      scopeAll: "تمام متن",
      textSize: "متن کا سائز",
      lineSpacing: "سطروں کا فاصلہ",
      applyToInput: "پیغام کے خانے پر لاگو کریں",
      showToggles: "سمت کا تیرتا بٹن",
      customSites: "اپنی مرضی کی سائٹیں",
      customSitesHint: "کسی بھی AI چیٹ پر کام کرتا ہے — براؤزر آپ سے رسائی کی اجازت مانگے گا۔",
      hostPh: "مثلاً chat.deepseek.com",
      selectorPh: "پیغامات کا CSS سلیکٹر (اختیاری)",
      addSite: "شامل کریں",
      removeSite: "ہٹائیں",
      allow: "اجازت دیں",
      invalidHost: "یہ درست ڈومین نہیں لگتا۔",
      alreadySupported: "یہ سائٹ پہلے ہی شامل ہے۔",
      invalidSelector: "CSS سلیکٹر درست نہیں۔",
      permDenied: "اجازت نہیں دی گئی۔",
      reprocess: "صفحے پر دوبارہ لاگو کریں",
      reset: "ری سیٹ",
    },
  };
  const RTL_LOCALES = ["fa", "ar", "ur"];
  // The English text already in the markup IS the en dictionary — capture it
  // once so switching back to English restores the originals.
  document.querySelectorAll("[data-i18n]").forEach((el) => { I18N.en[el.dataset.i18n] = el.textContent; });
  document.querySelectorAll("[data-i18n-ph]").forEach((el) => { I18N.en[el.dataset.i18nPh] = el.placeholder; });
  document.querySelectorAll("[data-i18n-title]").forEach((el) => { I18N.en[el.dataset.i18nTitle] = el.title; });
  // Keys that only ever appear on dynamically-created nodes (site rows, error
  // line) have no markup element to capture from — English lives here.
  Object.assign(I18N.en, {
    allow: "Allow",
    removeSite: "Remove",
    invalidHost: "That doesn't look like a valid host.",
    alreadySupported: "This site is already supported.",
    invalidSelector: "That CSS selector is not valid.",
    permDenied: "Access was not granted.",
  });

  function resolveLocale(pick) {
    if (pick && pick !== "auto" && I18N[pick]) return pick;
    let ui = "";
    try { ui = (api.i18n && api.i18n.getUILanguage && api.i18n.getUILanguage()) || ""; } catch (e) {}
    ui = (ui || navigator.language || "en").slice(0, 2).toLowerCase();
    return I18N[ui] ? ui : "en";
  }
  function t(key) {
    const d = I18N[resolveLocale(settings.language)] || I18N.en;
    return d[key] !== undefined ? d[key] : I18N.en[key];
  }
  function applyLocale() {
    const loc = resolveLocale(settings.language);
    const d = I18N[loc] || I18N.en;
    const pickText = (key) => (d[key] !== undefined ? d[key] : I18N.en[key]);
    const root = document.documentElement;
    root.lang = loc;
    root.dir = RTL_LOCALES.indexOf(loc) !== -1 ? "rtl" : "ltr";
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const v = pickText(el.dataset.i18n);
      if (v !== undefined && el.textContent !== v) el.textContent = v;
    });
    document.querySelectorAll("[data-i18n-ph]").forEach((el) => {
      const v = pickText(el.dataset.i18nPh);
      if (v !== undefined) el.placeholder = v;
    });
    document.querySelectorAll("[data-i18n-title]").forEach((el) => {
      const v = pickText(el.dataset.i18nTitle);
      if (v !== undefined) el.title = v;
    });
  }

  // --- custom sites ------------------------------------------------------------
  // Per-site config lives in the existing `sites` map. Built-ins keep their plain
  // boolean; a custom site is an object: { enabled, custom: true, selector? }.

  function siteOn(v) { return v && typeof v === "object" ? v.enabled !== false : v; }
  function customHosts() {
    return Object.keys(settings.sites).filter((k) => {
      const v = settings.sites[k];
      return v && typeof v === "object" && v.custom;
    });
  }
  function originsFor(h) { return ["https://" + h + "/*", "https://*." + h + "/*"]; }
  function scriptIdFor(h) { return "rtlx-" + h; }

  // Accept "chat.deepseek.com", "https://x.ai/grok", "www.perplexity.ai" … and
  // reduce them all to a bare registrable host (URL() also punycodes IDNs).
  function normalizeHost(raw) {
    let s = (raw || "").trim();
    if (!s) return null;
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = "https://" + s;
    let u;
    try { u = new URL(s); } catch (e) { return null; }
    const h = (u.hostname || "").replace(/^www\./, "").toLowerCase();
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(h)) return null;
    return h;
  }

  // Register the same files, in the same order, as the static declaration in
  // manifest.json — rtl-math.js MUST load before rtl-engine.js.
  async function registerSite(h) {
    if (!api.scripting) return;
    try {
      const existing = await api.scripting.getRegisteredContentScripts({ ids: [scriptIdFor(h)] });
      if (existing && existing.length) return;
    } catch (e) {}
    try {
      await api.scripting.registerContentScripts([{
        id: scriptIdFor(h),
        matches: originsFor(h),
        js: ["src/rtl-math.js", "src/rtl-engine.js", "src/content.js"],
        css: ["src/styles.css"],
        runAt: "document_idle",
        persistAcrossSessions: true,
      }]);
    } catch (e) { /* already registered or unsupported — the row's Allow button retries */ }
  }

  async function unregisterSite(h) {
    if (!api.scripting) return;
    try { await api.scripting.unregisterContentScripts({ ids: [scriptIdFor(h)] }); } catch (e) {}
  }

  async function revokeSite(h) {
    try { await api.permissions.remove({ origins: originsFor(h) }); } catch (e) {}
  }

  function showErr(key) {
    const el = $("siteErr");
    el.textContent = t(key);
    el.hidden = false;
  }
  function hideErr() { $("siteErr").hidden = true; }

  async function addSite() {
    hideErr();
    const h = normalizeHost($("newHost").value);
    if (!h) return showErr("invalidHost");
    const known = BUILTIN_SITES.concat(customHosts());
    if (known.some((k) => h === k || h.endsWith("." + k))) return showErr("alreadySupported");
    const selRaw = $("newSelector").value.trim();
    if (selRaw) {
      try { document.createDocumentFragment().querySelector(selRaw); }
      catch (e) { return showErr("invalidSelector"); }
    }
    // permissions.request MUST be the first async call after the click so the
    // user-gesture context survives (Firefox is strict about this).
    let granted = false;
    try { granted = await api.permissions.request({ origins: originsFor(h) }); } catch (e) {}
    if (!granted) return showErr("permDenied");
    await registerSite(h);
    const sites = Object.assign({}, settings.sites);
    sites[h] = { enabled: true, custom: true };
    if (selRaw) sites[h].selector = selRaw;
    $("newHost").value = "";
    $("newSelector").value = "";
    save({ sites });
  }

  async function removeSite(h) {
    hideErr();
    // Removal must revoke cleanly: dynamic scripts gone, permission returned.
    await unregisterSite(h);
    await revokeSite(h);
    const sites = Object.assign({}, settings.sites);
    delete sites[h];
    save({ sites });
  }

  // Heal lost registrations (e.g. extension reinstalled while storage.sync kept
  // the sites map): permission still granted → quietly re-register the scripts;
  // permission gone → show an Allow button on the row instead.
  async function syncRegistrations() {
    for (const h of customHosts()) {
      let ok = false;
      try { ok = await api.permissions.contains({ origins: originsFor(h) }); } catch (e) {}
      if (ok) await registerSite(h);
    }
  }

  let siteListGen = 0; // stale async renders must never repaint over a newer one
  async function renderSites() {
    const gen = ++siteListGen;
    const hosts = customHosts();
    const rows = [];
    for (const h of hosts) {
      let granted = true;
      try { granted = await api.permissions.contains({ origins: originsFor(h) }); } catch (e) {}
      rows.push({ h, granted, selector: (settings.sites[h] || {}).selector });
    }
    if (gen !== siteListGen) return;
    const list = $("siteList");
    list.textContent = "";
    list.hidden = rows.length === 0;
    for (const r of rows) {
      const row = document.createElement("div");
      row.className = "site-row";
      const name = document.createElement("b");
      name.dir = "ltr";
      name.textContent = r.h;
      if (r.selector) name.title = r.selector;
      row.appendChild(name);
      if (!r.granted) {
        const grant = document.createElement("button");
        grant.type = "button";
        grant.className = "mini";
        grant.textContent = t("allow");
        grant.addEventListener("click", async () => {
          let ok = false;
          try { ok = await api.permissions.request({ origins: originsFor(r.h) }); } catch (e) {}
          if (ok) { await registerSite(r.h); renderSites(); }
        });
        row.appendChild(grant);
      }
      const del = document.createElement("button");
      del.type = "button";
      del.className = "mini danger";
      del.textContent = "✕";
      del.title = t("removeSite");
      del.setAttribute("aria-label", t("removeSite"));
      del.addEventListener("click", () => removeSite(r.h));
      row.appendChild(del);
      list.appendChild(row);
    }
  }

  // --- rendering ---------------------------------------------------------------

  // Same subdomain resolution as content.js baseHost(): app.claude.ai must hit
  // the claude.ai entry, chat on a custom domain must hit its custom entry.
  function hostKey() {
    if (!host) return "*";
    if (host in settings.sites) return host;
    const k = Object.keys(settings.sites).find(
      (key) => key !== "*" && (host === key || host.endsWith("." + key))
    );
    return k || host;
  }

  function render() {
    applyLocale();
    $("enabled").checked = settings.enabled;
    $("host").textContent = host || "—";
    const key = hostKey();
    const siteVal = key in settings.sites ? siteOn(settings.sites[key]) : settings.sites["*"] !== false;
    $("siteEnabled").checked = siteVal;

    $("language").value = settings.language || "auto";

    document.querySelectorAll(".seg-btn").forEach((b) =>
      b.classList.toggle("active", b.dataset.mode === settings.mode)
    );

    $("threshold").value = settings.threshold;
    $("thresholdVal").textContent = faNum(Math.round(settings.threshold * 100)) + "%";
    $("thresholdWrap").style.display = settings.mode === "ratio" ? "" : "none";

    $("fontEnabled").checked = settings.fontEnabled;
    $("fontFamily").value = settings.fontFamily;
    // Don't clobber the field while the user is typing in it (save is debounced).
    if (document.activeElement !== $("localFont")) $("localFont").value = settings.localFont || "";
    $("localFontScope").value = settings.localFontScope || "rtl";
    $("fontScale").value = settings.fontScale;
    $("scaleVal").textContent = faNum(Math.round(settings.fontScale * 100)) + "%";
    $("lineHeight").value = settings.lineHeight;
    $("lhVal").textContent = faNum(settings.lineHeight);
    $("applyToInput").checked = settings.applyToInput;
    $("showToggles").checked = settings.showToggles;
    renderSites();
  }

  function save(patch) {
    settings = Object.assign({}, settings, patch);
    api.storage.sync.set(patch);
    render();
  }

  function saveSite(enabled) {
    const sites = Object.assign({}, settings.sites);
    const key = hostKey();
    const v = sites[key];
    if (v && typeof v === "object") sites[key] = Object.assign({}, v, { enabled });
    else sites[key] = enabled;
    save({ sites });
  }

  function wire() {
    $("enabled").addEventListener("change", (e) => save({ enabled: e.target.checked }));
    $("siteEnabled").addEventListener("change", (e) => saveSite(e.target.checked));
    $("language").addEventListener("change", (e) => save({ language: e.target.value }));

    document.querySelectorAll(".seg-btn").forEach((b) =>
      b.addEventListener("click", () => save({ mode: b.dataset.mode }))
    );

    $("threshold").addEventListener("input", (e) => {
      $("thresholdVal").textContent = faNum(Math.round(e.target.value * 100)) + "%";
    });
    $("threshold").addEventListener("change", (e) => save({ threshold: parseFloat(e.target.value) }));

    $("fontEnabled").addEventListener("change", (e) => save({ fontEnabled: e.target.checked }));
    $("fontFamily").addEventListener("change", (e) => save({ fontFamily: e.target.value }));

    // Free text: persist when the user pauses, not on every keystroke (each
    // save re-renders the popup and wakes every content script).
    let localFontTimer;
    $("localFont").addEventListener("input", (e) => {
      clearTimeout(localFontTimer);
      const v = e.target.value;
      localFontTimer = setTimeout(() => save({ localFont: v.trim() }), 400);
    });
    $("localFont").addEventListener("change", (e) => {
      clearTimeout(localFontTimer);
      save({ localFont: e.target.value.trim() });
    });
    $("localFontScope").addEventListener("change", (e) => save({ localFontScope: e.target.value }));

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

    $("addSite").addEventListener("click", addSite);
    $("newHost").addEventListener("keydown", (e) => { if (e.key === "Enter") addSite(); });

    $("reprocess").addEventListener("click", async () => {
      const [tab] = await api.tabs.query({ active: true, currentWindow: true });
      if (tab) api.tabs.sendMessage(tab.id, { type: "rtlx:reprocess" }).catch(() => {});
    });

    $("reset").addEventListener("click", async () => {
      // Reset returns the browser to a pre-install state for custom sites too:
      // dynamic scripts unregistered and every runtime-granted origin revoked.
      for (const h of customHosts()) {
        await unregisterSite(h);
        await revokeSite(h);
      }
      api.storage.sync.set(DEFAULTS);
      settings = Object.assign({}, DEFAULTS, { sites: Object.assign({}, DEFAULTS.sites) });
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
      syncRegistrations();
    });
  }

  init();
})();
