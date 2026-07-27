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

module.exports = { makeColors, box, select, question, confirm, canPrompt, stripAnsi, width };
