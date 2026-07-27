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
const readline = require("readline");
const { spawnSync } = require("child_process");
const doctor = require("./doctor");

const ROOT = path.join(__dirname, ".."); // package root == repo layout
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));

const C = process.stdout.isTTY
  ? { b: "\x1b[1m", dim: "\x1b[2m", g: "\x1b[32m", y: "\x1b[33m", r: "\x1b[31m", x: "\x1b[0m" }
  : { b: "", dim: "", g: "", y: "", r: "", x: "" };

const say = (s) => console.log(s === undefined ? "" : s);
const ok = (s) => say(C.g + "✓ " + C.x + s);
const warn = (s) => say(C.y + "! " + C.x + s);
const err = (s) => console.error(C.r + "✗ " + C.x + s);

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
  say(C.b + "rtl-for-claude " + pkg.version + C.x + " — right-to-left text in Claude");
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
  say(C.dim + "  Everything runs locally and is reversible. Source:" + C.x);
  say(C.dim + "  https://github.com/mahdigh99/rtl-for-claude" + C.x);
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

function ask(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(String(answer || "").trim().toLowerCase());
    });
  });
}

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
  say(C.b + (removing ? "Remove: " : "Install: ") + t.title + C.x);
  say();
  for (const line of (removing ? "This restores everything to how it was." : t.what).split("\n"))
    say("  " + line);
  say();
  if (!removing) say(C.dim + "  Undo any time with:  " + t.undo + C.x);
  if (yes) return "yes";
  if (!process.stdin.isTTY) {
    err("Not a terminal — re-run with --yes to confirm non-interactively.");
    return "cannot-ask";
  }
  const answer = await ask("\nContinue? [y/N] ");
  return answer === "y" || answer === "yes" ? "yes" : "no";
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
    if (target === "desktop") ok("Open \"Claude-RTL\" from your Applications folder.");
    else ok("Run \"Developer: Reload Window\" in the editor to see it.");
    say(C.dim + "Undo:  " + TARGETS[target].undo + C.x);
  }
  return code;
}

function showStatus() {
  for (const key of Object.keys(TARGETS)) {
    say();
    say(C.b + TARGETS[key].title + C.x);
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

async function menu() {
  say();
  say(C.b + "RTL for Claude" + C.x + C.dim + "  v" + pkg.version + C.x);
  say("Right-to-left text and the Vazirmatn font, everywhere Claude runs.");
  say();
  say("  1) " + TARGETS.desktop.title + C.dim + "   ← the Claude app itself" + C.x);
  say("  2) " + TARGETS["claude-code"].title);
  say("  3) " + TARGETS.codex.title);
  say("  4) VS Code extension" + C.dim + "   ← recommended instead of 2" + C.x);
  say("  5) Check what is installed");
  say("  6) Remove something");
  say("  7) Check prerequisites (changes nothing)");
  say("  q) Quit");
  say();
  const choice = await ask("Choose [1-7, q]: ");
  switch (choice) {
    case "1": return doAction("desktop", { yes: false, remove: false });
    case "2": return doAction("claude-code", { yes: false, remove: false });
    case "3": return doAction("codex", { yes: false, remove: false });
    case "4": return installVsCodeExtension();
    case "5": return showStatus();
    case "6": return removeMenu();
    case "7": return runDoctor();
    case "q": case "quit": case "": return 0;
    default:
      warn("Didn't catch that.");
      return menu();
  }
}

async function removeMenu() {
  say();
  say("  1) " + TARGETS.desktop.title);
  say("  2) " + TARGETS["claude-code"].title);
  say("  3) " + TARGETS.codex.title);
  say("  q) Back");
  say();
  const choice = await ask("Remove which? [1-3, q]: ");
  const target = { 1: "desktop", 2: "claude-code", 3: "codex" }[choice];
  if (!target) return 0;
  return doAction(target, { yes: false, remove: true });
}

function runDoctor() {
  say();
  say(C.b + "Prerequisites" + C.x);
  const r = doctor.report(doctor.allChecks());
  say(r.text);
  say();
  if (r.ok) ok("Everything needed is in place.");
  else say(C.dim + "Fix the ✗ lines above, then run this again. Nothing was changed." + C.x);
  say(C.dim + "Include this list if you report a problem: " + pkg.bugs.url + C.x);
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
