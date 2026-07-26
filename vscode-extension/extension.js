/* ============================================================================
 * RTL for Claude — VS Code companion extension.
 *
 * The Claude Code chat is a sandboxed webview no extension can reach into at
 * runtime, so we patch its on-disk files (webview/index.css + index.js). Your
 * settings — from the left-sidebar panel or the Settings UI — are compiled into
 * the injected CSS variables + a settings object the in-webview engine reads.
 * We re-apply on startup, whenever a setting changes, and — via a watcher on
 * each extensions directory — the moment a Claude Code update drops a new
 * version folder. Only the Claude Code webview is touched; nothing else. Fully
 * reversible (each original file is kept as *.rtl-backup).
 *
 * All file mutation lives in patcher.js (zero vscode imports: cross-process
 * lock + atomic writes + size guard); this file is the vscode-facing shell.
 * ========================================================================== */
const vscode = require("vscode");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const patcher = require("./patcher");

const FONT_DEST = patcher.FONT_DEST;
const PANEL_ID = "rtlForClaude.panel";

// Update-watcher tuning. An update fires many fs events while the new folder
// is extracted: debounce, then retry a few times, a few seconds apart, for the
// case where webview/ isn't extracted yet on the first look. Env overrides
// exist ONLY so the lifecycle test doesn't have to wait out real seconds.
const WATCH_DEBOUNCE_MS = Number(process.env.RTLX_WATCH_DEBOUNCE_MS || "") || 2000;
const WATCH_RETRY_DELAY_MS = Number(process.env.RTLX_WATCH_RETRY_MS || "") || 2500;
const WATCH_RETRIES = 3;

const FONT_STACKS = {
  Vazirmatn: '"Vazirmatn RTLX", "Vazirmatn", var(--vscode-font-family), Tahoma, sans-serif',
  Sahel: '"Sahel", "Vazirmatn RTLX", var(--vscode-font-family), Tahoma, sans-serif',
  "System default": "var(--vscode-font-family), Tahoma, sans-serif",
};

// --- discovery -------------------------------------------------------------

// Known editors' extensions dirs + the RUNNING fork's own dir. The latter is
// resolved from where the IDE says Claude Code lives, so a fork whose dotdir
// isn't in the hardcoded list (the list stays as fallback for the shell
// scripts, which have no runtime API) still gets patched.
function extensionRoots() {
  const roots = patcher.defaultExtensionRoots(os.homedir());
  try {
    const ext = vscode.extensions.getExtension("anthropic.claude-code");
    if (ext && ext.extensionPath) {
      // <extensions-dir>/anthropic.claude-code-<ver>  →  <extensions-dir>
      const dir = path.dirname(ext.extensionPath);
      if (roots.indexOf(dir) === -1) roots.push(dir);
    }
  } catch (e) {}
  return roots;
}

// ALL installed Claude Code version folders (an update keeps the old folder
// running until the editor's own reload — both need the patch).
function claudeWebviewDirs() {
  return patcher.findWebviewDirs(extensionRoots());
}

// --- settings --------------------------------------------------------------

// Raw config values, keyed exactly as the sidebar panel expects.
function rawSettings() {
  const c = vscode.workspace.getConfiguration("rtlForClaude");
  return {
    enabled: c.get("enabled", true),
    language: c.get("language", "auto"),
    autoApplyOnStartup: c.get("autoApplyOnStartup", true),
    showInActivityBar: c.get("showInActivityBar", true),
    showStatusBar: c.get("showStatusBar", true),
    "font.family": c.get("font.family", "Vazirmatn"),
    "font.custom": c.get("font.custom", ""),
    "font.scale": c.get("font.scale", 1),
    "font.lineHeight": c.get("font.lineHeight", 1.85),
    "detection.mode": c.get("detection.mode", "ratio"),
    "detection.threshold": c.get("detection.threshold", 0.3),
    applyToInput: c.get("applyToInput", true),
    showMessageToggles: c.get("showMessageToggles", true),
    keepCodeLeftToRight: c.get("keepCodeLeftToRight", true),
    togglePlacement: c.get("togglePlacement", "toolbar"),
  };
}

// Build the CSS font-family value. "Custom" uses the user's own family name
// (sanitised, then quoted) with Vazirmatn kept as a graceful fallback.
function fontStackFor(r) {
  if (r["font.family"] === "Custom") {
    const name = String(r["font.custom"] || "").trim().replace(/["'\\;{}<>]/g, "");
    if (name)
      return '"' + name + '", "Vazirmatn RTLX", "Vazirmatn", var(--vscode-font-family), Tahoma, sans-serif';
  }
  return FONT_STACKS[r["font.family"]] || FONT_STACKS.Vazirmatn;
}

// Shape the in-webview engine wants.
function engineSettings() {
  const r = rawSettings();
  return {
    enabled: r.enabled,
    autoApply: r.autoApplyOnStartup,
    fontStack: fontStackFor(r),
    fontScale: r["font.scale"],
    lineHeight: r["font.lineHeight"],
    mode: r["detection.mode"],
    threshold: r["detection.threshold"],
    applyToInput: r.applyToInput,
    showToggles: r.showMessageToggles,
    keepCodeLTR: r.keepCodeLeftToRight,
    togglePlacement: r.togglePlacement,
  };
}

function asset(context, name) {
  return path.join(context.extensionPath, "assets", name);
}

function buildJs(context, s) {
  const settingsObj = {
    mode: s.mode,
    threshold: s.threshold,
    fontStack: s.fontStack,
    fontScale: s.fontScale,
    lineHeight: s.lineHeight,
    applyToInput: s.applyToInput,
    showToggles: s.showToggles,
    keepCodeLTR: s.keepCodeLTR,
    togglePlacement: s.togglePlacement,
    enabled: true,
  };
  // rtl-math.js must precede driver.js — the driver reads the RTLXMath global
  // at sweep time (and no-ops without it, so a math-less patch still works).
  const math = fs.readFileSync(asset(context, "rtl-math.js"), "utf8");
  const driver = fs.readFileSync(asset(context, "driver.js"), "utf8");
  const head = "window.__RTLX_SETTINGS=" + JSON.stringify(settingsObj) + ";";
  const fp = crypto
    .createHash("sha1")
    .update(head + "|" + math.length + "|" + driver.length)
    .digest("hex")
    .slice(0, 12);
  const js = "/* rtlx-fp:" + fp + " */\n" + head + "\n" + math + "\n" + driver;
  return { js, fp };
}

// --- apply / remove --------------------------------------------------------

/**
 * Patch every discovered install. Dirs already carrying the current
 * fingerprint are skipped unless opts.force (the manual "re-apply now"
 * actions force; the silent startup/watcher/settings paths don't).
 * Returns { ok, wrote } — `wrote` = how many dirs were actually written.
 */
async function apply(context, opts) {
  opts = opts || {};
  const s = engineSettings();
  if (!s.enabled) return { ok: false, wrote: 0, reason: "disabled" };
  const dirs = claudeWebviewDirs();
  if (!dirs.length) {
    if (!opts.silent)
      vscode.window.showWarningMessage("RTL for Claude: the Claude Code extension was not found.");
    return { ok: false, wrote: 0, reason: "no-claude" };
  }
  const sources = {
    css: fs.readFileSync(asset(context, "styles.css"), "utf8"),
    fontPath: asset(context, "Vazirmatn-Regular.woff2"),
  };
  const built = buildJs(context, s);
  sources.js = built.js;

  let okCount = 0;
  let wrote = 0;
  const problems = [];
  for (const dir of dirs) {
    if (!opts.force && patcher.isPatched(dir) && patcher.isCurrent(dir, built.fp)) {
      okCount++;
      continue;
    }
    try {
      const r = await patcher.patchWebviewDir(dir, sources);
      if (r.ok) okCount++;
      if (r.wrote) wrote++;
      problems.push(...r.warnings);
    } catch (e) {
      problems.push(dir + ": " + e.message);
    }
  }
  if (problems.length && !opts.silent)
    vscode.window.showWarningMessage("RTL for Claude: " + problems[0]);
  if (!okCount) {
    if (!opts.silent)
      vscode.window.showErrorMessage(
        "RTL for Claude: failed to patch — " + (problems[0] || "unknown error")
      );
    return { ok: false, wrote, reason: problems[0] || "patch failed" };
  }
  return { ok: true, wrote };
}

/** Undo every discovered install. Returns the number of files restored. */
async function remove() {
  let n = 0;
  for (const dir of claudeWebviewDirs()) {
    try {
      n += await patcher.removeWebviewDir(dir);
    } catch (e) {}
  }
  return n;
}

// --- update watcher (catch Claude Code updates mid-session) ----------------

// When Claude Code updates, the editor extracts a NEW anthropic.claude-code-*
// folder (un-patched). A non-recursive watch per extensions dir is cheap and
// only fires on top-level entries — our own writes land in webview/ subfolders
// and don't re-trigger it.
let dirWatchers = [];
let reinjectTimer = null;
let watchGeneration = 0; // bumping it invalidates any in-flight retry loop

function delay(ms) {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    if (t.unref) t.unref();
  });
}

function startWatching(context) {
  stopWatching();
  for (const root of extensionRoots()) {
    try {
      const w = fs.watch(root, { persistent: false }, (_event, filename) => {
        if (filename && String(filename).indexOf(patcher.CLAUDE_CODE_PREFIX) === 0)
          scheduleReinject(context);
      });
      w.on("error", () => {});
      dirWatchers.push(w);
    } catch (e) {
      // Root doesn't exist (editor not installed) — skip.
    }
  }
}

function stopWatching() {
  watchGeneration++;
  if (reinjectTimer) {
    clearTimeout(reinjectTimer);
    reinjectTimer = null;
  }
  for (const w of dirWatchers) {
    try {
      w.close();
    } catch (e) {}
  }
  dirWatchers = [];
}

function scheduleReinject(context) {
  if (reinjectTimer) clearTimeout(reinjectTimer);
  reinjectTimer = setTimeout(() => {
    reinjectTimer = null;
    reinjectWithRetries(context);
  }, WATCH_DEBOUNCE_MS);
}

async function reinjectWithRetries(context) {
  const gen = ++watchGeneration;
  let patchedAny = false;
  for (let attempt = 0; attempt < WATCH_RETRIES; attempt++) {
    if (attempt) await delay(WATCH_RETRY_DELAY_MS);
    if (gen !== watchGeneration) return; // torn down / superseded meanwhile
    // Re-check the setting INSIDE every retry: a Disable that lands while
    // we're waiting must win — never follow it with a re-patch.
    const s = engineSettings();
    if (!s.enabled || !s.autoApply) return;
    if ((await apply(context, { silent: true })).wrote > 0) patchedAny = true;
  }
  if (patchedAny && gen === watchGeneration)
    offerReload("Claude Code was updated — RTL re-applied. Reload to see it.");
}

// --- UI: status bar + reload prompt ----------------------------------------

let statusBar = null; // single item; clicking it opens a quick menu
function updateStatusBar() {
  if (!statusBar) return;
  const c = vscode.workspace.getConfiguration("rtlForClaude");
  if (!c.get("showStatusBar", true)) {
    statusBar.hide();
    return;
  }
  const on = c.get("enabled", true);
  statusBar.text = on ? "$(text-size) RTL" : "$(text-size) RTL $(circle-slash)";
  statusBar.tooltip = "RTL for Claude is " + (on ? "on" : "off") + " — click for options";
  statusBar.show();
}

function offerReload(message) {
  vscode.window.showInformationMessage(message, "Reload Window").then((c) => {
    if (c === "Reload Window") vscode.commands.executeCommand("workbench.action.reloadWindow");
  });
}

// Debounce the file work + reload prompt so dragging a slider doesn't rewrite
// the multi-MB bundle on every tick.
let applyTimer = null;
function scheduleReapply(context) {
  if (applyTimer) clearTimeout(applyTimer);
  applyTimer = setTimeout(async () => {
    applyTimer = null;
    if (engineSettings().enabled) {
      startWatching(context); // re-arm after a disable→enable round-trip
      if ((await apply(context, { silent: true })).ok)
        offerReload("RTL for Claude settings updated — reload to see them in the chat.");
    } else {
      stopWatching(); // also cancels any in-flight update-retry loop
      if ((await remove()) > 0)
        offerReload("RTL for Claude turned off — reload to restore the original chat.");
    }
  }, 500);
}

// --- sidebar panel (Activity Bar) ------------------------------------------

// The panel ships the four languages the project has READMEs for.
const PANEL_LOCALES = ["en", "fa", "ar", "ur"];

// What "auto" resolves to: the base of the VS Code display language (fa-IR → fa),
// or English when we don't translate it.
function autoLocale() {
  const base = String(vscode.env.language || "en").toLowerCase().split(/[-_]/)[0];
  return PANEL_LOCALES.indexOf(base) !== -1 ? base : "en";
}

function panelLocale() {
  const pick = vscode.workspace.getConfiguration("rtlForClaude").get("language", "auto");
  return PANEL_LOCALES.indexOf(pick) !== -1 ? pick : autoLocale();
}

function panelHtml(context, webview) {
  const nonce = crypto.randomBytes(16).toString("hex");
  let html = fs.readFileSync(path.join(context.extensionPath, "media", "panel.html"), "utf8");
  // __LOCALE__ paints the first frame in the right language; __LOCALE_AUTO__ lets
  // the panel re-resolve "auto" itself when the user switches language.
  return html
    .replace(/__NONCE__/g, nonce)
    .replace(/__LOCALE_AUTO__/g, autoLocale())
    .replace(/__LOCALE__/g, panelLocale());
}

function makePanelProvider(context) {
  let view = null;
  return {
    post() {
      if (view) view.webview.postMessage({ type: "state", settings: rawSettings() });
    },
    resolveWebviewView(v) {
      view = v;
      v.webview.options = { enableScripts: true };
      v.webview.html = panelHtml(context, v.webview);
      v.webview.onDidReceiveMessage(async (m) => {
        if (!m) return;
        if (m.type === "ready") this.post();
        else if (m.type === "set")
          vscode.workspace
            .getConfiguration("rtlForClaude")
            .update(m.key, m.value, vscode.ConfigurationTarget.Global);
        else if (m.type === "cmd") {
          if (m.name === "apply") {
            const r = await apply(context, { force: true });
            if (r.ok) offerReload("RTL for Claude applied — reload to see it.");
            else if (r.reason === "disabled")
              vscode.window.showInformationMessage("Turn RTL for Claude on first.");
          } else if (m.name === "remove") {
            offerReload((await remove()) > 0 ? "RTL for Claude removed — reload to restore the chat." : "Nothing to remove.");
          } else if (m.name === "reload") {
            vscode.commands.executeCommand("workbench.action.reloadWindow");
          } else if (m.name === "openSettings") {
            vscode.commands.executeCommand("workbench.action.openSettings", "rtlForClaude");
          }
        }
      });
      v.onDidChangeVisibility(() => {
        if (v.visible) this.post();
      });
    },
  };
}

// --- lifecycle -------------------------------------------------------------

function activate(context) {
  const panel = makePanelProvider(context);

  statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBar.command = "rtlForClaude.menu";
  context.subscriptions.push(statusBar);
  updateStatusBar();

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(PANEL_ID, panel, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    // One status-bar button → a small quick menu with the options.
    vscode.commands.registerCommand("rtlForClaude.menu", async () => {
      const c = vscode.workspace.getConfiguration("rtlForClaude");
      const on = c.get("enabled", true);
      const side = c.get("showInActivityBar", true);
      const items = [
        { action: "toggle", label: (on ? "$(check)" : "$(circle-slash)") + " Right-to-left", description: on ? "On — turn off" : "Off — turn on" },
        { action: "side", label: (side ? "$(eye)" : "$(eye-closed)") + " Left sidebar panel", description: side ? "Shown — hide" : "Hidden — show" },
        { action: "settings", label: "$(settings-gear) Open settings…" },
        { action: "apply", label: "$(refresh) Re-apply to the chat now" },
      ];
      const pick = await vscode.window.showQuickPick(items, { title: "RTL for Claude", placeHolder: "Choose an action" });
      if (!pick) return;
      if (pick.action === "toggle") await c.update("enabled", !on, vscode.ConfigurationTarget.Global);
      else if (pick.action === "side") await c.update("showInActivityBar", !side, vscode.ConfigurationTarget.Global);
      else if (pick.action === "settings") vscode.commands.executeCommand("workbench.action.openSettings", "rtlForClaude");
      else if (pick.action === "apply") {
        const r = await apply(context, { force: true });
        if (r.ok) offerReload("RTL for Claude applied — reload to see it.");
        else if (r.reason === "disabled") vscode.window.showInformationMessage("Turn RTL for Claude on first.");
      }
    }),
    vscode.commands.registerCommand("rtlForClaude.toggle", async () => {
      const c = vscode.workspace.getConfiguration("rtlForClaude");
      await c.update("enabled", !c.get("enabled", true), vscode.ConfigurationTarget.Global);
    }),
    vscode.commands.registerCommand("rtlForClaude.toggleSidebar", async () => {
      const c = vscode.workspace.getConfiguration("rtlForClaude");
      await c.update("showInActivityBar", !c.get("showInActivityBar", true), vscode.ConfigurationTarget.Global);
    }),
    vscode.commands.registerCommand("rtlForClaude.apply", async () => {
      const r = await apply(context, { force: true });
      if (r.ok) offerReload("RTL for Claude applied — reload to see it.");
      else if (r.reason === "disabled")
        vscode.window.showInformationMessage("RTL for Claude is off. Turn it on first.");
    }),
    vscode.commands.registerCommand("rtlForClaude.remove", async () => {
      offerReload((await remove()) > 0 ? "RTL for Claude removed — reload to restore the chat." : "RTL for Claude: nothing to remove.");
    }),
    vscode.commands.registerCommand("rtlForClaude.openSettings", () =>
      vscode.commands.executeCommand("workbench.action.openSettings", "rtlForClaude")
    ),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (!e.affectsConfiguration("rtlForClaude")) return;
      updateStatusBar();
      panel.post();
      // Only re-patch the webview when a setting that actually affects it
      // changed — toggling the sidebar / status-bar visibility must not prompt
      // a reload.
      const webviewKeys = [
        "rtlForClaude.enabled",
        "rtlForClaude.font",
        "rtlForClaude.detection",
        "rtlForClaude.applyToInput",
        "rtlForClaude.showMessageToggles",
        "rtlForClaude.keepCodeLeftToRight",
        // Placement is baked into the injected driver settings, so it needs a
        // re-patch too — `language` deliberately is not: it only skins the panel.
        "rtlForClaude.togglePlacement",
      ];
      if (webviewKeys.some((k) => e.affectsConfiguration(k))) scheduleReapply(context);
    })
  );

  // Startup: re-apply if needed (Claude update wiped it, or settings changed)
  // across every discovered install, then arm the update watcher. Deferred so
  // it never blocks the activation chain.
  setTimeout(async () => {
    const s = engineSettings();
    if (s.enabled && s.autoApply) {
      startWatching(context);
      if ((await apply(context, { silent: true })).wrote > 0)
        offerReload("RTL for Claude is ready — reload to apply it to the chat.");
    } else if (!s.enabled) {
      if (claudeWebviewDirs().some((d) => patcher.isPatched(d)) && (await remove()) > 0)
        offerReload("RTL for Claude is off — reload to restore the original chat.");
    }
  }, 0);
}

function deactivate() {
  stopWatching();
  if (applyTimer) {
    clearTimeout(applyTimer);
    applyTimer = null;
  }
}

module.exports = { activate, deactivate };
