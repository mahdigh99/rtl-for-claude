/* ============================================================================
 * RTL for Claude — VS Code companion extension.
 *
 * The Claude Code chat is a sandboxed webview no extension can reach into at
 * runtime, so we patch its on-disk files (webview/index.css + index.js). Your
 * settings — from the left-sidebar panel or the Settings UI — are compiled into
 * the injected CSS variables + a settings object the in-webview engine reads.
 * We re-apply on startup and whenever a setting changes (Claude updates wipe
 * the patch). Only the Claude Code webview is touched; nothing else. Fully
 * reversible (each original file is kept as *.rtl-backup).
 * ========================================================================== */
const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const BEGIN = "/* ==== RTL-PATCH (begin) ==== */";
const END = "/* ==== RTL-PATCH (end) ==== */";
const FONT_DEST = "vazirmatn.woff2";
const PANEL_ID = "rtlForClaude.panel";

const FONT_STACKS = {
  Vazirmatn: '"Vazirmatn RTLX", "Vazirmatn", var(--vscode-font-family), Tahoma, sans-serif',
  Sahel: '"Sahel", "Vazirmatn RTLX", var(--vscode-font-family), Tahoma, sans-serif',
  "System default": "var(--vscode-font-family), Tahoma, sans-serif",
};

// --- patch primitives (shared model with apply-rtl.sh) ---------------------

function reEsc(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
// Our block is always appended at end-of-file; anchor to EOF so we never fuse
// two surrounding lines.
function stripBlock(text) {
  const re = new RegExp(
    "\\n?" + reEsc(BEGIN) + "[\\s\\S]*?" + reEsc(END) + "[^\\S\\r\\n]*\\n?$"
  );
  return text.replace(re, "");
}

function claudeWebviewDir() {
  const ext = vscode.extensions.getExtension("anthropic.claude-code");
  if (!ext) return null;
  const dir = path.join(ext.extensionPath, "webview");
  try {
    return fs.existsSync(dir) ? dir : null;
  } catch (e) {
    return null;
  }
}

function patchFile(target, addition) {
  let text = fs.readFileSync(target, "utf8");
  const bak = target + ".rtl-backup";
  if (!fs.existsSync(bak)) {
    try {
      fs.writeFileSync(bak, text);
    } catch (e) {}
  }
  text = stripBlock(text);
  if (text.length && !text.endsWith("\n")) text += "\n";
  text += BEGIN + "\n" + addition + "\n" + END + "\n";
  fs.writeFileSync(target, text);
}

function unpatchFile(target) {
  if (!fs.existsSync(target)) return false;
  const bak = target + ".rtl-backup";
  if (fs.existsSync(bak)) {
    try {
      fs.copyFileSync(bak, target);
      fs.unlinkSync(bak);
      return true;
    } catch (e) {}
  }
  const text = fs.readFileSync(target, "utf8");
  if (text.indexOf(BEGIN) === -1) return false;
  fs.writeFileSync(target, stripBlock(text));
  return true;
}

// --- settings --------------------------------------------------------------

// Raw config values, keyed exactly as the sidebar panel expects.
function rawSettings() {
  const c = vscode.workspace.getConfiguration("rtlForClaude");
  return {
    enabled: c.get("enabled", true),
    autoApplyOnStartup: c.get("autoApplyOnStartup", true),
    showInActivityBar: c.get("showInActivityBar", true),
    showStatusBar: c.get("showStatusBar", true),
    "font.family": c.get("font.family", "Vazirmatn"),
    "font.scale": c.get("font.scale", 1),
    "font.lineHeight": c.get("font.lineHeight", 1.85),
    "detection.mode": c.get("detection.mode", "ratio"),
    "detection.threshold": c.get("detection.threshold", 0.3),
    applyToInput: c.get("applyToInput", true),
    showMessageToggles: c.get("showMessageToggles", true),
    keepCodeLeftToRight: c.get("keepCodeLeftToRight", true),
  };
}

// Shape the in-webview engine wants.
function engineSettings() {
  const r = rawSettings();
  return {
    enabled: r.enabled,
    autoApply: r.autoApplyOnStartup,
    fontStack: FONT_STACKS[r["font.family"]] || FONT_STACKS.Vazirmatn,
    fontScale: r["font.scale"],
    lineHeight: r["font.lineHeight"],
    mode: r["detection.mode"],
    threshold: r["detection.threshold"],
    applyToInput: r.applyToInput,
    showToggles: r.showMessageToggles,
    keepCodeLTR: r.keepCodeLeftToRight,
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
    enabled: true,
  };
  const driver = fs.readFileSync(asset(context, "driver.js"), "utf8");
  const head = "window.__RTLX_SETTINGS=" + JSON.stringify(settingsObj) + ";";
  const fp = crypto
    .createHash("sha1")
    .update(head + "|" + driver.length)
    .digest("hex")
    .slice(0, 12);
  const js = "/* rtlx-fp:" + fp + " */\n" + head + "\n" + driver;
  return { js, fp };
}

function isPatched(dir) {
  try {
    return fs.readFileSync(path.join(dir, "index.css"), "utf8").indexOf(BEGIN) !== -1;
  } catch (e) {
    return false;
  }
}
function isCurrent(dir, fp) {
  try {
    return fs.readFileSync(path.join(dir, "index.js"), "utf8").indexOf("rtlx-fp:" + fp) !== -1;
  } catch (e) {
    return false;
  }
}

// --- apply / remove --------------------------------------------------------

function apply(context, opts) {
  opts = opts || {};
  const s = engineSettings();
  if (!s.enabled) return { ok: false, reason: "disabled" };
  const dir = claudeWebviewDir();
  if (!dir) {
    if (!opts.silent)
      vscode.window.showWarningMessage("RTL for Claude: the Claude Code extension was not found.");
    return { ok: false, reason: "no-claude" };
  }
  try {
    patchFile(path.join(dir, "index.css"), fs.readFileSync(asset(context, "styles.css"), "utf8"));
    const jsPath = path.join(dir, "index.js");
    if (fs.existsSync(jsPath)) patchFile(jsPath, buildJs(context, s).js);
    fs.copyFileSync(asset(context, "Vazirmatn-Regular.woff2"), path.join(dir, FONT_DEST));
    return { ok: true, dir };
  } catch (e) {
    if (!opts.silent)
      vscode.window.showErrorMessage("RTL for Claude: failed to patch — " + e.message);
    return { ok: false, reason: e.message };
  }
}

function remove() {
  const dir = claudeWebviewDir();
  if (!dir) return 0;
  let n = 0;
  if (unpatchFile(path.join(dir, "index.css"))) n++;
  if (unpatchFile(path.join(dir, "index.js"))) n++;
  try {
    fs.unlinkSync(path.join(dir, FONT_DEST));
  } catch (e) {}
  return n;
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
  applyTimer = setTimeout(() => {
    applyTimer = null;
    if (engineSettings().enabled) {
      if (apply(context, { silent: true }).ok)
        offerReload("RTL for Claude settings updated — reload to see them in the chat.");
    } else if (remove() > 0) {
      offerReload("RTL for Claude turned off — reload to restore the original chat.");
    }
  }, 500);
}

// --- sidebar panel (Activity Bar) ------------------------------------------

function panelHtml(context, webview) {
  const nonce = crypto.randomBytes(16).toString("hex");
  let html = fs.readFileSync(path.join(context.extensionPath, "media", "panel.html"), "utf8");
  return html.replace(/__NONCE__/g, nonce);
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
      v.webview.onDidReceiveMessage((m) => {
        if (!m) return;
        if (m.type === "ready") this.post();
        else if (m.type === "set")
          vscode.workspace
            .getConfiguration("rtlForClaude")
            .update(m.key, m.value, vscode.ConfigurationTarget.Global);
        else if (m.type === "cmd") {
          if (m.name === "apply") {
            const r = apply(context, {});
            if (r.ok) offerReload("RTL for Claude applied — reload to see it.");
            else if (r.reason === "disabled")
              vscode.window.showInformationMessage("Turn RTL for Claude on first.");
          } else if (m.name === "remove") {
            offerReload(remove() > 0 ? "RTL for Claude removed — reload to restore the chat." : "Nothing to remove.");
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
        const r = apply(context, {});
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
    vscode.commands.registerCommand("rtlForClaude.apply", () => {
      const r = apply(context, {});
      if (r.ok) offerReload("RTL for Claude applied — reload to see it.");
      else if (r.reason === "disabled")
        vscode.window.showInformationMessage("RTL for Claude is off. Turn it on first.");
    }),
    vscode.commands.registerCommand("rtlForClaude.remove", () => {
      offerReload(remove() > 0 ? "RTL for Claude removed — reload to restore the chat." : "RTL for Claude: nothing to remove.");
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
      ];
      if (webviewKeys.some((k) => e.affectsConfiguration(k))) scheduleReapply(context);
    })
  );

  // Startup: re-apply if needed (Claude update wiped it, or settings changed).
  // Deferred so it never blocks the activation chain.
  setTimeout(() => {
    const dir = claudeWebviewDir();
    if (!dir) return;
    const s = engineSettings();
    if (s.enabled && s.autoApply) {
      const { fp } = buildJs(context, s);
      if (!isCurrent(dir, fp) && apply(context, { silent: true }).ok)
        offerReload("RTL for Claude is ready — reload to apply it to the chat.");
    } else if (!s.enabled && isPatched(dir) && remove() > 0) {
      offerReload("RTL for Claude is off — reload to restore the original chat.");
    }
  }, 0);
}

function deactivate() {}

module.exports = { activate, deactivate };
