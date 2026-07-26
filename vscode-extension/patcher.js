/* ============================================================================
 * patcher.js — all on-disk patch logic for the Claude Code webview files.
 *
 * ZERO vscode imports (fs/path only), so this module runs — and is tested —
 * outside the editor (tests/patcher-*.test.js, plain node). extension.js is a
 * thin vscode-facing shell around it.
 *
 * Why the ceremony: every open IDE window runs its own extension host and they
 * all patch the SAME webview/index.css|js on disk. Interleaved read-modify-
 * write cycles have truncated index.js in the wild (4.8 MB → ~1 MB → blank
 * Claude panel). Three defenses, applied to every write:
 *   1. withFileLock  — one patcher at a time per webview dir, across processes.
 *   2. atomicWrite   — full content to a temp file, then rename() over the
 *                      target; a reader never observes a half-written file.
 *   3. size guard    — injection only ADDS bytes, so a result smaller than the
 *                      pristine backup means we read a torn file: abort without
 *                      writing and keep the good backup.
 * ========================================================================== */
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");

const BEGIN = "/* ==== RTL-PATCH (begin) ==== */";
const END = "/* ==== RTL-PATCH (end) ==== */";
const FONT_DEST = "vazirmatn.woff2";
const BACKUP_SUFFIX = ".rtl-backup";
const LOCK_NAME = ".rtlx.lock";

// Lock tuning. A patch pass takes well under a second, so contenders retry
// often (100 ms); a lock older than 30 s can only be a crashed window's
// leftover and is broken; after 20 s of waiting we proceed unlocked (with a
// warning) rather than hang the extension host forever.
const LOCK_RETRY_MS = 100;
const LOCK_STALE_MS = 30_000;
const LOCK_MAX_WAIT_MS = 20_000;

// NOTE: deliberately NOT unref'd — a process waiting on the lock must stay
// alive until its patch completes (an unref'd timer would let node exit
// mid-wait when nothing else is pending).
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

// --- concurrency-safe primitives -------------------------------------------

/**
 * Run `fn` while holding an exclusive lock file inside `lockDir`.
 * Best-effort: stale locks are broken, and after LOCK_MAX_WAIT_MS we proceed
 * anyway (pushing a note onto `warnings`) rather than block forever.
 */
async function withFileLock(lockDir, fn, warnings) {
  const lockPath = path.join(lockDir, LOCK_NAME);
  const start = Date.now();
  let handle;
  for (;;) {
    try {
      handle = await fsp.open(lockPath, "wx"); // exclusive create — fails if held
      await handle.writeFile(String(process.pid));
      break;
    } catch (e) {
      if (e.code !== "EEXIST") throw e;
      try {
        const st = await fsp.stat(lockPath);
        if (Date.now() - st.mtimeMs > LOCK_STALE_MS) {
          await fsp.rm(lockPath, { force: true });
          continue; // retry immediately after breaking a stale lock
        }
      } catch (e2) {
        continue; // lock vanished between open and stat — retry
      }
      if (Date.now() - start > LOCK_MAX_WAIT_MS) {
        if (warnings)
          warnings.push("lock wait timed out — proceeding without it: " + lockPath);
        break; // proceed unlocked rather than hang
      }
      await delay(LOCK_RETRY_MS);
    }
  }
  try {
    return await fn();
  } finally {
    if (handle) {
      await handle.close().catch(() => {});
      await fsp.rm(lockPath, { force: true }).catch(() => {});
    }
  }
}

// The pid alone is not unique inside one process; the counter covers the
// (lock-timed-out) case of two same-process writers racing the same target.
let tmpSeq = 0;

/** Write atomically: temp file in the same dir, then rename over the target. */
async function atomicWrite(file, data) {
  const tmp = file + ".tmp." + process.pid + "-" + tmpSeq++;
  try {
    await fsp.writeFile(tmp, data, "utf8");
    await fsp.rename(tmp, file);
  } catch (e) {
    await fsp.rm(tmp, { force: true }).catch(() => {});
    throw e;
  }
}

// --- single-file patch / unpatch (call under the dir lock) -----------------

/**
 * Append our marked block to `target` (replacing any previous version of it).
 * Creates the pristine one-time backup, enforces the size invariant, writes
 * atomically. Returns true when the file was written, false when the size
 * guard refused (a note is pushed onto `warnings`).
 */
async function patchFileLocked(target, addition, warnings) {
  let text = await fsp.readFile(target, "utf8");
  const bak = target + BACKUP_SUFFIX;
  if (!fs.existsSync(bak)) await fsp.writeFile(bak, text);
  text = stripBlock(text);
  if (text.length && !text.endsWith("\n")) text += "\n";
  const out = text + BEGIN + "\n" + addition + "\n" + END + "\n";
  // Size invariant: we only ever ADD bytes on top of the pristine original, so
  // a result smaller than the backup proves the current file is torn.
  const bakSize = (await fsp.stat(bak)).size;
  if (Buffer.byteLength(out, "utf8") < bakSize) {
    if (warnings)
      warnings.push(
        "size guard: refused to write " + target +
          " (result would be smaller than the pristine backup — torn source file)"
      );
    return false;
  }
  await atomicWrite(target, out);
  return true;
}

/** Restore `target`: prefer the pristine backup, else strip our block. */
async function unpatchFileLocked(target) {
  if (!fs.existsSync(target)) return false;
  const bak = target + BACKUP_SUFFIX;
  if (fs.existsSync(bak)) {
    try {
      await fsp.copyFile(bak, target);
      await fsp.unlink(bak);
      return true;
    } catch (e) {}
  }
  const text = await fsp.readFile(target, "utf8");
  if (text.indexOf(BEGIN) === -1) return false;
  await atomicWrite(target, stripBlock(text));
  return true;
}

// --- webview-dir operations (public; each takes the dir lock) --------------

/**
 * Patch one webview folder: index.css + index.js (when present) + the font.
 * sources = { css, js, fontPath }. Returns { ok, wrote, warnings } — `wrote`
 * is true when at least one file was actually written.
 */
async function patchWebviewDir(dir, sources) {
  const warnings = [];
  const result = await withFileLock(
    dir,
    async () => {
      let wrote = false;
      const cssPath = path.join(dir, "index.css");
      if (fs.existsSync(cssPath))
        wrote = (await patchFileLocked(cssPath, sources.css, warnings)) || wrote;
      const jsPath = path.join(dir, "index.js");
      if (fs.existsSync(jsPath))
        wrote = (await patchFileLocked(jsPath, sources.js, warnings)) || wrote;
      if (sources.fontPath)
        await fsp.copyFile(sources.fontPath, path.join(dir, FONT_DEST));
      return wrote;
    },
    warnings
  );
  return { ok: warnings.length === 0, wrote: result, warnings };
}

/** Undo one webview folder. Returns the number of files restored. */
async function removeWebviewDir(dir) {
  return withFileLock(dir, async () => {
    let n = 0;
    if (await unpatchFileLocked(path.join(dir, "index.css"))) n++;
    if (await unpatchFileLocked(path.join(dir, "index.js"))) n++;
    await fsp.rm(path.join(dir, FONT_DEST), { force: true }).catch(() => {});
    return n;
  });
}

// --- status checks (cheap, lock-free reads) --------------------------------

function isPatched(dir) {
  try {
    return fs.readFileSync(path.join(dir, "index.css"), "utf8").indexOf(BEGIN) !== -1;
  } catch (e) {
    return false;
  }
}
function isCurrent(dir, fp) {
  try {
    return (
      fs.readFileSync(path.join(dir, "index.js"), "utf8").indexOf("rtlx-fp:" + fp) !== -1
    );
  } catch (e) {
    return false;
  }
}

// --- discovery -------------------------------------------------------------

const CLAUDE_CODE_PREFIX = "anthropic.claude-code-";

/**
 * The known editors' extensions dirs (same list as apply-rtl.sh). The RUNNING
 * fork's dir — which may be none of these — is appended by extension.js via
 * vscode.extensions.getExtension(); this module stays vscode-free.
 */
function defaultExtensionRoots(home) {
  return [
    ".antigravity-ide",
    ".vscode",
    ".vscode-insiders",
    ".cursor",
    ".windsurf",
    ".vscode-server",
  ].map((d) => path.join(home, d, "extensions"));
}

/**
 * Every installed Claude Code webview folder under the given extensions roots —
 * ALL version folders, not just the newest: after an update the editor may
 * still be running the previous folder until its own reload, so both must
 * carry the patch.
 */
function findWebviewDirs(roots) {
  const out = [];
  for (const root of roots) {
    let entries;
    try {
      entries = fs.readdirSync(root);
    } catch (e) {
      continue; // editor not installed
    }
    for (const name of entries) {
      if (name.indexOf(CLAUDE_CODE_PREFIX) !== 0) continue;
      const wv = path.join(root, name, "webview");
      try {
        if (fs.existsSync(path.join(wv, "index.css"))) out.push(wv);
      } catch (e) {}
    }
  }
  return out;
}

module.exports = {
  BEGIN,
  END,
  FONT_DEST,
  BACKUP_SUFFIX,
  LOCK_NAME,
  CLAUDE_CODE_PREFIX,
  stripBlock,
  withFileLock,
  atomicWrite,
  patchWebviewDir,
  removeWebviewDir,
  isPatched,
  isCurrent,
  defaultExtensionRoots,
  findWebviewDirs,
};
