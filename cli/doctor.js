/* ============================================================================
 * doctor.js — preflight checks for the installer.
 *
 * A non-technical install fails on a missing prerequisite far more often than
 * on a bug, so every check here names the problem AND the exact fix. The
 * expensive-to-discover one is `codesign`: the desktop patcher copies a ~500 MB
 * app bundle before it would ever reach the signing step, so an unmet
 * requirement has to be caught BEFORE that copy, not after it.
 *
 * Every probe is injectable (`opts.has`, `opts.exists`, `opts.platform`,
 * `opts.home`) so the tests can drive the missing-prerequisite paths on a
 * machine where everything happens to be installed.
 * ========================================================================== */
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

/** Is `cmd` runnable? (`command -v` equivalent, without a shell.) */
function commandExists(cmd) {
  try {
    execFileSync(process.platform === "win32" ? "where" : "which", [cmd], {
      stdio: "ignore",
    });
    return true;
  } catch (e) {
    return false;
  }
}

const DEFAULTS = {
  platform: process.platform,
  home: os.homedir(),
  has: commandExists,
  exists: fs.existsSync,
  nodeVersion: process.versions.node,
  // Same overrides the shell patcher honours, so a test (or a user with Claude
  // installed somewhere unusual) points both halves at the same bundle.
  sourceApp: process.env.RTLX_SOURCE_APP || "/Applications/Claude.app",
  patchedApp: process.env.RTLX_PATCHED_APP || "",
};

/**
 * Checks for one action: "desktop" | "claude-code" | "codex" | "vscode-ext".
 * Returns [{ id, label, ok, required, fix, note }] in the order they should be
 * printed and evaluated (cheapest and most fundamental first).
 */
function checksFor(action, opts) {
  const o = Object.assign({}, DEFAULTS, opts || {});
  const mac = o.platform === "darwin";
  const win = o.platform === "win32";
  const out = [];

  const major = parseInt(String(o.nodeVersion).split(".")[0], 10) || 0;
  out.push({
    id: "node",
    label: "Node.js " + o.nodeVersion + " (need 18 or newer)",
    ok: major >= 18,
    required: true,
    fix: "Install the current Node.js from https://nodejs.org and run this again.",
  });

  if (action === "desktop") {
    out.push({
      id: "macos",
      label: "macOS",
      ok: mac,
      required: true,
      fix:
        "The Claude Desktop patcher is macOS-only. On Windows or Linux use the\n" +
        "  VS Code extension or the browser extension instead.",
    });
    out.push({
      id: "npx",
      label: "npx (used to repack the app archive)",
      ok: o.has("npx") || o.has("asar"),
      required: true,
      fix: "npx ships with Node.js — reinstall Node from https://nodejs.org.",
    });
    // The one that costs the most to discover late.
    out.push({
      id: "codesign",
      label: "Xcode Command Line Tools (codesign)",
      ok: !mac || o.has("codesign"),
      required: true,
      fix:
        "Run:  xcode-select --install\n" +
        "  Click Install and wait for it to finish (a one-time download), then run\n" +
        "  this installer again. macOS refuses to launch an app bundle that was\n" +
        "  modified without being re-signed, so this step cannot be skipped.",
    });
    const src = o.sourceApp;
    out.push({
      id: "claude-app",
      label: "Claude Desktop at " + src,
      ok: o.exists(src),
      required: true,
      fix:
        "Install the Claude Desktop app from https://claude.ai/download first,\n" +
        "  and keep it in /Applications (not in your user folder).",
    });
    const patched = o.patchedApp || path.join(o.home, "Applications", "Claude-RTL.app");
    if (o.exists(patched)) {
      out.push({
        id: "already",
        label: "A patched copy already exists at " + patched,
        ok: true,
        required: false,
        note: "Installing again rebuilds it from the current Claude version.",
      });
    }
  }

  if (action === "claude-code" || action === "codex") {
    out.push({
      id: "bash",
      label: "A Unix shell (macOS or Linux)",
      ok: !win,
      required: true,
      fix:
        action === "claude-code"
          ? "On Windows, install the VS Code extension from the Marketplace\n" +
            "  (search \"RTL for Claude\"), or run vscode-extension\\apply-rtl.ps1\n" +
            "  in PowerShell."
          : "The Codex patcher needs a Unix shell; on Windows use WSL.",
    });
  }

  if (action === "vscode-ext") {
    const cli = ["code", "cursor", "windsurf", "code-insiders"].find((c) => o.has(c));
    out.push({
      id: "code-cli",
      label: cli ? "Editor command line tool (" + cli + ")" : "Editor command line tool",
      ok: !!cli,
      required: true,
      detail: cli,
      fix:
        "Open VS Code, press Cmd/Ctrl+Shift+P and run\n" +
        "  \"Shell Command: Install 'code' command in PATH\" — or just install the\n" +
        "  extension from inside the editor: search for \"RTL for Claude\".",
    });
  }

  return out;
}

/** Every check for every action, de-duplicated by id — what `--doctor` shows. */
function allChecks(opts) {
  const seen = new Set();
  const out = [];
  for (const action of ["desktop", "claude-code", "codex", "vscode-ext"]) {
    for (const c of checksFor(action, opts)) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      // Outside its own action, a failing check is informational: not having a
      // `code` CLI must not make the desktop install look broken.
      out.push(Object.assign({}, c, { required: c.required && c.id === "node" }));
    }
  }
  return out;
}

/** Human-readable report. Returns { text, ok }. */
function report(checks) {
  const lines = [];
  let ok = true;
  for (const c of checks) {
    // Indented to line up with the styled output of the shell scripts, so the
    // whole session reads as one program rather than three.
    lines.push((c.ok ? "    ✓ " : "    ✗ ") + c.label);
    if (c.note) lines.push("        " + c.note);
    if (!c.ok) {
      ok = false;
      if (c.fix) lines.push("        → " + c.fix.split("\n").join("\n        "));
    }
  }
  return { text: lines.join("\n"), ok };
}

/** The blocking gate before an action runs. Returns { ok, text }. */
function preflight(action, opts) {
  const checks = checksFor(action, opts);
  const failed = checks.filter((c) => c.required && !c.ok);
  const r = report(failed.length ? failed : checks);
  return { ok: failed.length === 0, text: r.text, checks };
}

module.exports = { commandExists, checksFor, allChecks, report, preflight };
