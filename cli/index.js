#!/usr/bin/env node
/* ============================================================================
 * rtl-for-claude — the one-command installer.
 *
 *   npx rtl-for-claude
 *
 * Exists for one reason: the manual path (download the repo, unzip, open a
 * terminal, cd, run a script) loses people who are not developers. This is a
 * THIN WRAPPER — it finds the packaged shell script and runs it, so both paths
 * execute the exact same patch logic and there is never a second implementation
 * to keep in sync. If something is wrong with patching, fix the shell script.
 *
 * Deliberately ZERO dependencies: `npx` stays fast, there is no supply chain to
 * trust, and nothing to break on a future Node release.
 *
 * It never writes inside its own package directory (npx caches it read-only)
 * and never touches /Applications/Claude.app — the desktop patcher builds a
 * separate copy at ~/Applications/Claude-RTL.app.
 * ========================================================================== */
"use strict";

const path = require("path");
const fs = require("fs");
const os = require("os");
const { spawnSync } = require("child_process");
const doctor = require("./doctor");
const ui = require("./ui");

const ROOT = path.join(__dirname, ".."); // package root == repo layout
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));

const c = ui.makeColors(process.stdout);

const say = (s) => console.log(s === undefined ? "" : s);
const ok = (s) => say(c.green("✓ ") + s);
const warn = (s) => say(c.yellow("! ") + s);
const err = (s) => console.error(c.red("✗ ") + s);
const rule = () => say(c.dim("  " + "─".repeat(46)));

// --- the three things this can install --------------------------------------
// `script` is relative to the package root; `args` are the script's own flags.
const TARGETS = {
  desktop: {
    title: "Claude Desktop app (macOS)",
    script: "desktop-app/apply-rtl.sh",
    what:
      "Builds a patched COPY of Claude at ~/Applications/Claude-RTL.app.\n" +
      "Your existing Claude.app is never modified — it keeps working, and\n" +
      "removing the copy is the complete uninstall.",
    undo: "npx rtl-for-claude --desktop --remove",
  },
  "claude-code": {
    title: "Claude Code chat in VS Code",
    script: "vscode-extension/apply-rtl.sh",
    what:
      "Patches the Claude Code chat panel in every editor it finds (VS Code,\n" +
      "Cursor, Windsurf …). The original files are backed up next to them and\n" +
      "restored byte-for-byte on removal.\n" +
      "Tip: the Marketplace extension does this for you and survives updates —\n" +
      "option 4 in the menu, or search \"RTL for Claude\" in the editor.",
    undo: "npx rtl-for-claude --claude-code --remove",
  },
  codex: {
    title: "Codex chat in VS Code",
    script: "vscode-extension-codex/apply-rtl.sh",
    what:
      "Patches the Codex chat panel. The original webview is backed up and\n" +
      "restored byte-for-byte on removal.",
    undo: "npx rtl-for-claude --codex --remove",
  },
};

const EXTENSION_ID = "mahdigh99.rtl-for-claude";

// --- arguments ---------------------------------------------------------------

function parseArgs(argv) {
  const a = { action: null, remove: false, status: false, yes: false, help: false, doctor: false, version: false };
  for (const arg of argv) {
    switch (arg) {
      case "--desktop": a.action = "desktop"; break;
      case "--claude-code": a.action = "claude-code"; break;
      case "--codex": a.action = "codex"; break;
      case "--vscode-extension": a.action = "vscode-ext"; break;
      case "--remove": case "--uninstall": a.remove = true; break;
      case "--status": case "--list": a.status = true; break;
      case "-y": case "--yes": a.yes = true; break;
      case "-h": case "--help": a.help = true; break;
      case "--doctor": a.doctor = true; break;
      case "-v": case "--version": a.version = true; break;
      default: return { error: arg };
    }
  }
  return a;
}

function usage() {
  say(c.bold("rtl-for-claude " + pkg.version) + " — right-to-left text in Claude");
  say();
  say("  npx rtl-for-claude                 interactive menu");
  say();
  say("  --desktop                          Claude Desktop app (macOS)");
  say("  --claude-code                      Claude Code chat in VS Code");
  say("  --codex                            Codex chat in VS Code");
  say("  --vscode-extension                 install the VS Code extension");
  say("  --remove                           undo the target above");
  say("  --status                           what is installed right now");
  say("  --doctor                           check the prerequisites, change nothing");
  say("  --yes                              don't ask for confirmation");
  say("  --version, --help");
  say();
  say(c.dim("  Everything runs locally and is reversible. Source:"));
  say(c.dim("  https://github.com/mahdigh99/rtl-for-claude"));
}

// --- running the packaged scripts --------------------------------------------

/** Run one of the shell scripts, streaming its output straight through. */
function runScript(target, args) {
  const script = path.join(ROOT, TARGETS[target].script);
  if (!fs.existsSync(script)) {
    err("This package is incomplete: " + TARGETS[target].script + " is missing.");
    err("Please report it at " + pkg.bugs.url);
    return 1;
  }
  const r = spawnSync("bash", [script].concat(args || []), { stdio: "inherit" });
  if (r.error) {
    err("Could not run bash: " + r.error.message);
    return 1;
  }
  return r.status === null ? 1 : r.status;
}

function installVsCodeExtension() {
  const check = doctor.preflight("vscode-ext");
  if (!check.ok) {
    say(check.text);
    return 2;
  }
  const cli = check.checks.find((c) => c.id === "code-cli").detail;
  say("Installing " + EXTENSION_ID + " with " + cli + " …");
  const r = spawnSync(cli, ["--install-extension", EXTENSION_ID], { stdio: "inherit" });
  if (r.status === 0) {
    ok("Installed. Run \"Developer: Reload Window\" in the editor to see it.");
    return 0;
  }
  err("The editor's CLI reported an error. You can also install it from inside");
  err("the editor: Extensions → search \"RTL for Claude\".");
  return 1;
}

// --- confirmation -------------------------------------------------------------

/**
 * Destructive actions state what they will do and wait for a yes. Skipped by
 * --yes, and impossible without a TTY (a piped stdin can't answer).
 *
 * Returns "yes" | "no" | "cannot-ask" — the last two are NOT the same thing: a
 * user answering "n" got what they wanted (exit 0), while a script that could
 * never be asked did not (exit 2, the same code as an unmet prerequisite).
 */
async function confirm(target, removing, yes) {
  const t = TARGETS[target];
  say();
  say("  " + (removing ? c.yellow("Remove") : c.accent("Install")) + "  " + c.bold(t.title));
  rule();
  for (const line of (removing ? "This restores everything to how it was." : t.what).split("\n"))
    say("  " + line);
  if (!removing) {
    say();
    say(c.dim("  Undo any time with:  ") + t.undo);
  }
  say();
  if (yes) return "yes";
  if (!process.stdin.isTTY) {
    err("Not a terminal — re-run with --yes to confirm non-interactively.");
    return "cannot-ask";
  }
  return (await ui.confirm("  " + c.bold("Continue?") + c.dim(" [y/N] "))) ? "yes" : "no";
}

async function doAction(target, opts) {
  if (target === "vscode-ext") return installVsCodeExtension();

  const pre = doctor.preflight(target);
  if (!pre.ok) {
    say();
    err("Not ready yet:");
    say(pre.text);
    return 2;
  }
  const answer = await confirm(target, opts.remove, opts.yes);
  if (answer !== "yes") {
    say("Nothing was changed.");
    return answer === "no" ? 0 : 2;
  }
  say();
  const code = runScript(target, [opts.remove ? "--remove" : "--install"]);
  if (code === 0 && !opts.remove) {
    say();
    if (target === "desktop") ok("Open " + c.bold("Claude-RTL") + " from your Applications folder.");
    else ok("Run " + c.bold("Developer: Reload Window") + " in the editor to see it.");
    say(c.dim("  Undo:  " + TARGETS[target].undo));
  }
  return code;
}

function showStatus() {
  for (const key of Object.keys(TARGETS)) {
    say();
    say("  " + c.bold(TARGETS[key].title));
    if (key === "desktop" && process.platform !== "darwin") {
      say("  (macOS only)");
      continue;
    }
    runScript(key, ["--list"]);
  }
  // A report, not a verdict: "not installed" is a perfectly fine answer, so
  // this never fails — callers that need a verdict use --doctor.
  return 0;
}

// --- menu ---------------------------------------------------------------------

/** Cheap, synchronous "is it there?" for the menu badges — no subprocesses. */
function desktopInstalled() {
  const p = process.env.RTLX_PATCHED_APP || path.join(os.homedir(), "Applications", "Claude-RTL.app");
  try { return fs.existsSync(p); } catch (e) { return false; }
}

function header() {
  say();
  say(
    ui.box(
      [
        c.accent(c.bold("RTL for Claude")) + c.dim("  v" + pkg.version),
        "Right-to-left text and the Vazirmatn font,",
        "everywhere Claude runs.",
      ],
      c,
      process.stdout,
    ),
  );
  say();
}

async function menu() {
  header();
  const installed = desktopInstalled();
  const choice = await ui.select({
    title: "What would you like to do?",
    items: [
      {
        label: TARGETS.desktop.title,
        hint: process.platform !== "darwin" ? "macOS only" : installed ? "installed — reinstall" : "the Claude app itself",
        value: "desktop",
      },
      { label: "VS Code extension", hint: "recommended for the Claude Code chat", value: "vscode-ext" },
      { label: TARGETS["claude-code"].title, hint: "patch the chat without the extension", value: "claude-code" },
      { label: TARGETS.codex.title, value: "codex" },
      { separator: true, label: "" },
      { label: "Check what is installed", value: "status" },
      { label: "Remove something", value: "remove" },
      { label: "Check prerequisites", hint: "changes nothing", value: "doctor" },
      { label: "Quit", value: "quit" },
    ],
    colors: c,
  });

  switch (choice) {
    case "desktop": case "claude-code": case "codex":
      return doAction(choice, { yes: false, remove: false });
    case "vscode-ext": return installVsCodeExtension();
    case "status": return showStatus();
    case "remove": return removeMenu();
    case "doctor": return runDoctor();
    default: return 0; // Quit, Esc, q or Ctrl-C
  }
}

async function removeMenu() {
  const choice = await ui.select({
    title: "Remove which one?",
    items: [
      { label: TARGETS.desktop.title, hint: "deletes ~/Applications/Claude-RTL.app", value: "desktop" },
      { label: TARGETS["claude-code"].title, hint: "restores the original chat files", value: "claude-code" },
      { label: TARGETS.codex.title, hint: "restores the original webview", value: "codex" },
      { separator: true, label: "" },
      { label: "Back", value: null },
    ],
    colors: c,
  });
  if (!choice) return 0;
  return doAction(choice, { yes: false, remove: true });
}

function runDoctor() {
  say();
  say("  " + c.bold("Prerequisites"));
  rule();
  const r = doctor.report(doctor.allChecks());
  say(r.text);
  say();
  if (r.ok) ok("Everything needed is in place.");
  else say(c.dim("  Fix the ✗ lines above, then run this again. Nothing was changed."));
  say(c.dim("  Include this list if you report a problem: " + pkg.bugs.url));
  // Exit 2 only when a hard requirement (Node itself) is unmet: the other lines
  // are per-action and are re-checked, with the same fix text, before running.
  return doctor.allChecks().every((c) => c.ok || !c.required) ? 0 : 2;
}

// --- main ----------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.error) {
    err("Unknown option: " + args.error);
    say();
    usage();
    return 2;
  }
  if (args.help) { usage(); return 0; }
  if (args.version) { say(pkg.version); return 0; }
  if (args.doctor) return runDoctor();

  if (process.platform === "win32" && (args.action || args.status)) {
    warn("This installer's patchers need a Unix shell, so Windows is not covered.");
    say();
    say("  • VS Code: install \"RTL for Claude\" from the Marketplace (one click),");
    say("    or run vscode-extension\\apply-rtl.ps1 in PowerShell.");
    say("  • Browser: load the browser-extension folder from the repository.");
    say("  • The Claude Desktop patcher is macOS-only.");
    say();
    say("  " + pkg.homepage);
    return 2;
  }

  if (args.status) return showStatus();
  if (args.action) return doAction(args.action, { remove: args.remove, yes: args.yes });

  if (!process.stdin.isTTY) {
    // No menu is possible without a terminal; tell the caller what to pass.
    usage();
    return 2;
  }
  return menu();
}

main()
  .then((code) => process.exit(code || 0))
  .catch((e) => {
    err("Unexpected error: " + (e && e.message ? e.message : e));
    err("Please report it at " + pkg.bugs.url);
    process.exit(1);
  });
