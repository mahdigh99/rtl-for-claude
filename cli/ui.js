/* ============================================================================
 * ui.js — terminal UI: colours, a boxed header, and an arrow-key menu.
 *
 * Written by hand rather than pulled from npm on purpose. An installer whose
 * whole promise is "one command, nothing to trust" should not drag five
 * transitive dependencies into `npx`, and the reference project this idea came
 * from had two of its eight reported bugs caused by exactly those deps.
 *
 * Everything degrades: no TTY, a dumb terminal, NO_COLOR, or a stdin that can't
 * go into raw mode (CI, a pipe, some IDE consoles) → plain text and a numbered
 * prompt. The menu is never the only way to do something; every action also has
 * a flag.
 *
 * Key handling goes through readline.emitKeypressEvents rather than parsing
 * escape bytes by hand, so arrow keys work the same on Windows Terminal.
 * ========================================================================== */
"use strict";

const readline = require("readline");

// --- colours -----------------------------------------------------------------
// Honour NO_COLOR (https://no-color.org) and FORCE_COLOR, and never emit codes
// into a pipe — a log full of \x1b[38;5;209m helps nobody.
function colorSupport(stream) {
  if (process.env.NO_COLOR) return 0;
  if (process.env.FORCE_COLOR) return Number(process.env.FORCE_COLOR) || 2;
  if (!stream || !stream.isTTY) return 0;
  if (process.env.TERM === "dumb") return 0;
  const t = process.env.TERM || "";
  const rich = process.env.COLORTERM || /256|kitty|alacritty|ghostty|xterm|screen|tmux/i.test(t);
  return rich ? 2 : 1;
}

function makeColors(stream) {
  const level = colorSupport(stream);
  const wrap = (open, close) => (s) => (level ? "\x1b[" + open + "m" + s + "\x1b[" + close + "m" : s);
  // The accent is Claude's terracotta; on a 16-colour terminal it falls back to
  // yellow, which is the closest thing that still reads as "highlight".
  const accentOpen = level >= 2 ? "38;5;209" : "33";
  return {
    level,
    bold: wrap("1", "22"),
    dim: wrap("2", "22"),
    accent: wrap(accentOpen, "39"),
    green: wrap("32", "39"),
    yellow: wrap("33", "39"),
    red: wrap("31", "39"),
    cyan: wrap("36", "39"),
    inverse: wrap("7", "27"),
  };
}

// --- box header ---------------------------------------------------------------

const stripAnsi = (s) => s.replace(/\x1b\[[0-9;]*m/g, "");
const width = (s) => Array.from(stripAnsi(s)).length;

/** A rounded box around a few lines. Falls back to plain text without colour. */
function box(lines, c, stream) {
  const cols = (stream && stream.columns) || 80;
  const inner = Math.min(Math.max(...lines.map(width)) + 2, Math.max(cols - 4, 20));
  const pad = (s) => " " + s + " ".repeat(Math.max(inner - width(s) - 1, 0));
  if (!c.level) return lines.map((l) => "  " + stripAnsi(l)).join("\n");
  const bar = "─".repeat(inner);
  const out = [c.dim("╭" + bar + "╮")];
  for (const l of lines) out.push(c.dim("│") + pad(l) + c.dim("│"));
  out.push(c.dim("╰" + bar + "╯"));
  return out.map((l) => "  " + l).join("\n");
}

// --- the menu -----------------------------------------------------------------

const CURSOR_HIDE = "\x1b[?25l";
const CURSOR_SHOW = "\x1b[?25h";

function canPrompt(input) {
  return !!(input && input.isTTY && typeof input.setRawMode === "function");
}

/**
 * Arrow-key menu.
 *
 * items: [{ label, hint?, value, separator? }]
 * Returns the chosen value, or null if the user pressed q / Esc / Ctrl-C.
 *
 * Number keys still select directly — muscle memory from the previous version,
 * and the only way to pick an item when arrow keys are being eaten by a
 * terminal multiplexer.
 */
function select(opts) {
  const input = opts.input || process.stdin;
  const output = opts.output || process.stdout;
  const c = opts.colors || makeColors(output);
  const items = opts.items;
  const selectable = items.filter((i) => !i.separator);

  if (!canPrompt(input)) return selectFallback(opts, c, input, output);

  return new Promise((resolve) => {
    let index = 0;
    let lines = 0;

    const render = (first) => {
      let out = "";
      if (!first) out += "\x1b[" + lines + "A"; // back to the top of the block
      out += "\x1b[0J"; // clear everything below
      const rows = [];
      if (opts.title) rows.push("  " + c.bold(opts.title));
      if (opts.hint) rows.push("  " + c.dim(opts.hint));
      if (opts.title || opts.hint) rows.push("");
      let n = 0;
      for (const item of items) {
        if (item.separator) {
          rows.push("  " + c.dim(item.label || ""));
          continue;
        }
        const active = selectable[index] === item;
        n++;
        const marker = active ? c.accent("❯") : " ";
        const num = c.dim(String(n) + ".");
        const label = active ? c.accent(c.bold(item.label)) : item.label;
        const hint = item.hint ? "  " + c.dim(item.hint) : "";
        rows.push("  " + marker + " " + num + " " + label + hint);
      }
      rows.push("");
      rows.push("  " + c.dim("↑↓ move · enter select · q quit"));
      lines = rows.length;
      out += rows.join("\n") + "\n";
      output.write(out);
    };

    const done = (value) => {
      input.removeListener("keypress", onKey);
      if (input.isTTY) input.setRawMode(false);
      input.pause();
      output.write(CURSOR_SHOW);
      resolve(value);
    };

    const onKey = (str, key) => {
      key = key || {};
      if (key.ctrl && key.name === "c") {
        output.write(CURSOR_SHOW);
        process.exit(130); // 128 + SIGINT, what a shell expects
      }
      if (key.name === "up" || key.name === "k") index = (index - 1 + selectable.length) % selectable.length;
      else if (key.name === "down" || key.name === "j" || key.name === "tab") index = (index + 1) % selectable.length;
      else if (key.name === "home") index = 0;
      else if (key.name === "end") index = selectable.length - 1;
      else if (key.name === "return" || key.name === "space") return done(selectable[index].value);
      else if (key.name === "escape" || key.name === "q") return done(null);
      else if (str && /^[1-9]$/.test(str)) {
        const pick = selectable[Number(str) - 1];
        if (pick) return done(pick.value);
        return;
      } else return;
      render(false);
    };

    readline.emitKeypressEvents(input);
    input.setRawMode(true);
    input.resume();
    output.write(CURSOR_HIDE);
    render(true);
    input.on("keypress", onKey);
  });
}

/** Numbered prompt for terminals that can't do raw mode. */
function selectFallback(opts, c, input, output) {
  const items = opts.items.filter((i) => !i.separator);
  if (opts.title) output.write("\n  " + opts.title + "\n\n");
  items.forEach((item, i) => {
    output.write("  " + (i + 1) + ") " + item.label + (item.hint ? "  — " + item.hint : "") + "\n");
  });
  output.write("\n");
  return question("  Choose [1-" + items.length + ", q]: ", input, output).then((answer) => {
    if (answer === "q" || answer === "") return null;
    const pick = items[Number(answer) - 1];
    if (pick) return pick.value;
    output.write("  Didn't catch that.\n");
    return selectFallback(opts, c, input, output);
  });
}

/** One-line text prompt. */
function question(prompt, input, output) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: input || process.stdin, output: output || process.stdout });
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(String(answer || "").trim().toLowerCase());
    });
  });
}

/** yes/no, defaulting to NO — this gate stands in front of destructive work. */
async function confirm(prompt, input, output) {
  const answer = await question(prompt, input, output);
  return answer === "y" || answer === "yes";
}

/**
 * Single-keypress pause: resolves false on Enter/Space (continue), true on
 * q/Esc (quit). The prompt promises "or q to quit", so q must work WITHOUT
 * Enter — a readline question here left people hammering q at a prompt that
 * only listened for Enter. Falls back to a line prompt when raw mode isn't
 * available; there, any answer starting with "q" quits.
 */
function pause(prompt, opts) {
  opts = opts || {};
  const input = opts.input || process.stdin;
  const output = opts.output || process.stdout;
  if (!canPrompt(input)) {
    return question(prompt, input, output).then((a) => a.charAt(0) === "q");
  }
  return new Promise((resolve) => {
    output.write(prompt);
    const done = (quit) => {
      input.removeListener("keypress", onKey);
      if (input.isTTY) input.setRawMode(false);
      input.pause();
      output.write("\n");
      resolve(quit);
    };
    const onKey = (str, key) => {
      key = key || {};
      if (key.ctrl && key.name === "c") {
        output.write(CURSOR_SHOW + "\n");
        process.exit(130);
      }
      if (key.name === "q" || key.name === "escape") return done(true);
      if (key.name === "return" || key.name === "enter" || key.name === "space") return done(false);
      // anything else: keep waiting — this is a two-answer question
    };
    readline.emitKeypressEvents(input);
    input.setRawMode(true);
    input.resume();
    input.on("keypress", onKey);
  });
}

// --- framing the output of the shell scripts ---------------------------------

/**
 * A section heading, so the menu and the scripts' output read as one program.
 */
function section(title, c, output) {
  const out = output || process.stdout;
  out.write("\n  " + c.accent("●") + " " + c.bold(title) + "\n");
  out.write("  " + c.dim("─".repeat(Math.min(((out.columns || 80) - 4), 60))) + "\n");
}

/**
 * Re-style one line of a shell script's output.
 *
 * The scripts are also run by hand (that is the whole "transparent path"), so
 * they keep their own plain `[+] / [*] / [!] / [X]` vocabulary. Here we strip
 * whatever colour they emitted and re-render it in the CLI's own language, so
 * one program doesn't speak two dialects. Anything unrecognised is passed
 * through untouched but indented — never swallowed, because a message we
 * didn't anticipate is exactly the one the user needs to see.
 */
function styleLine(line, c) {
  const raw = stripAnsi(line).replace(/\s+$/, "");
  if (!raw.trim()) return "";
  const t = raw.trim();
  let m;
  if ((m = t.match(/^\[\+\]\s*(.*)$/))) return "    " + c.green("✓") + " " + m[1];
  if ((m = t.match(/^\[\*\]\s*(.*)$/))) return "    " + c.dim("·") + " " + m[1];
  if ((m = t.match(/^\[!\]\s*(.*)$/))) return "    " + c.yellow("!") + " " + c.yellow(m[1]);
  if ((m = t.match(/^\[[Xx]\]\s*(.*)$/))) return "    " + c.red("✗") + " " + c.red(m[1]);
  if ((m = t.match(/^(ERROR|WARNING):\s*(.*)$/i)))
    return "    " + (/^E/i.test(m[1]) ? c.red("✗") : c.yellow("!")) + " " + m[2];
  if ((m = t.match(/^patched:\s*(.*)$/))) return "    " + c.green("✓") + " " + m[1];
  if ((m = t.match(/^unpatched:\s*(.*)$/))) return "    " + c.dim("·") + " restored " + m[1];
  if ((m = t.match(/^\(no patch present\):\s*(.*)$/))) return "    " + c.dim("· not patched  " + m[1]);
  // Bare filesystem paths are context, not news.
  if (/^\//.test(t)) return "    " + c.dim(t);
  if ((m = t.match(/^Done \((.*)\)\.\s*(.*)$/))) return "    " + c.green("✓") + " " + m[1] + ". " + m[2];
  if ((m = t.match(/^(\d+) webview folder\(s\) would be patched\.$/)))
    return "    " + c.dim("·") + " " + c.accent(m[1]) + " webview folder(s) can be patched";
  if ((m = t.match(/^(Removed from .*|No .* extension found.*|Install the .*)$/))) return "    " + c.dim(m[1]);
  return "    " + t;
}

/**
 * Stream `readable` line by line through styleLine into `output`.
 * Line-buffered so a long-running script (the desktop install takes a minute)
 * still prints as it goes instead of all at once at the end.
 */
function styleStream(readable, output, c, onDone) {
  let buf = "";
  readable.setEncoding("utf8");
  readable.on("data", (chunk) => {
    buf += chunk;
    let i;
    while ((i = buf.indexOf("\n")) !== -1) {
      const line = buf.slice(0, i);
      buf = buf.slice(i + 1);
      output.write(styleLine(line, c) + "\n");
    }
  });
  readable.on("end", () => {
    if (buf.length) output.write(styleLine(buf, c) + "\n");
    if (onDone) onDone();
  });
}

module.exports = {
  makeColors, box, select, question, confirm, pause, canPrompt, stripAnsi, width,
  section, styleLine, styleStream,
};
