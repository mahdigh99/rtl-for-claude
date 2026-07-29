/* ============================================================================
 * codex.js — on-disk patch logic for the OpenAI Codex (openai.chatgpt) webview.
 *
 * Same discipline as patcher.js: ZERO vscode imports, every write goes through
 * the shared cross-process lock + atomic rename, and a size guard refuses to
 * write a result smaller than the pristine backup.
 *
 * COMPATIBILITY CONTRACT: the markers and asset filenames here are the exact
 * ones vscode-extension-codex/apply-rtl.sh uses (a test enforces it). Either
 * tool can therefore strip, replace or remove the other's patch cleanly — the
 * only difference is that this module also injects window.__RTLX_SETTINGS and
 * an rtlx-fp fingerprint INSIDE the marked block, which the script's stripper
 * removes together with the rest of the block.
 * ========================================================================== */
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const patcher = require("./patcher");

const CODEX_PREFIX = "openai.chatgpt-";
const BEGIN_MARK = "<!-- ==== RTL-PATCH (begin) ==== -->";
const END_MARK = "<!-- ==== RTL-PATCH (end) ==== -->";
const ASSET_STYLES = "rtl-codex-styles.css";
const ASSET_MATH = "rtl-codex-math.js";
const ASSET_DRIVER = "rtl-codex-driver.js";
const ASSET_FONT = "vazirmatn-codex.woff2";

/** Every installed Codex webview folder (all versions) under the given roots. */
function findCodexWebviewDirs(roots) {
  const out = [];
  for (const root of roots) {
    let entries;
    try {
      entries = fs.readdirSync(root);
    } catch (e) {
      continue; // editor not installed
    }
    for (const name of entries) {
      if (name.indexOf(CODEX_PREFIX) !== 0) continue;
      const wv = path.join(root, name, "webview");
      try {
        if (fs.existsSync(path.join(wv, "index.html"))) out.push(wv);
      } catch (e) {}
    }
  }
  return out;
}

/**
 * Remove EVERY marked block (the shell script may have left one, and a torn
 * earlier run could in theory leave two). Works on minified single-line HTML —
 * plain string scanning, no line assumptions.
 */
function stripHtmlBlock(text) {
  for (;;) {
    const i = text.indexOf(BEGIN_MARK);
    if (i === -1) return text;
    const j = text.indexOf(END_MARK, i);
    if (j === -1) return text; // unmatched begin: leave the file alone
    let tail = text.slice(j + END_MARK.length);
    while (tail.charAt(0) === "\n") tail = tail.slice(1);
    text = text.slice(0, i) + tail;
  }
}

/** The marked block: settings + fingerprint + the same three tags the .sh injects. */
function buildBlock(settingsJson, fp) {
  return (
    BEGIN_MARK +
    "\n<!-- rtlx-fp:" + fp + " -->" +
    "\n<script>window.__RTLX_SETTINGS=" + settingsJson + ";</script>" +
    '\n<link rel="stylesheet" href="./assets/' + ASSET_STYLES + '">' +
    '\n<script src="./assets/' + ASSET_MATH + '"></script>' +
    '\n<script src="./assets/' + ASSET_DRIVER + '"></script>\n' +
    END_MARK +
    "\n"
  );
}

/** Insert the block before </head>, or append when there is none. */
function injectHtmlBlock(text, block) {
  const i = text.indexOf("</head>");
  if (i !== -1) return text.slice(0, i) + block + text.slice(i);
  return text.replace(/\n+$/, "") + "\n" + block;
}

/**
 * Patch one Codex webview folder: copy the four assets into webview/assets/,
 * then rewrite index.html with the marked block (replacing any previous one).
 * sources = { settingsJson, fp, stylesPath, mathPath, driverPath, fontPath }.
 * Returns { ok, wrote, warnings } like patcher.patchWebviewDir.
 */
async function patchCodexDir(dir, sources) {
  const warnings = [];
  const wrote = await patcher.withFileLock(
    dir,
    async () => {
      const html = path.join(dir, "index.html");
      if (!fs.existsSync(html)) return false;
      const assets = path.join(dir, "assets");
      await fsp.mkdir(assets, { recursive: true });
      await fsp.copyFile(sources.stylesPath, path.join(assets, ASSET_STYLES));
      await fsp.copyFile(sources.mathPath, path.join(assets, ASSET_MATH));
      await fsp.copyFile(sources.driverPath, path.join(assets, ASSET_DRIVER));
      await fsp.copyFile(sources.fontPath, path.join(assets, ASSET_FONT));

      let text = await fsp.readFile(html, "utf8");
      text = stripHtmlBlock(text);
      const bak = html + patcher.BACKUP_SUFFIX;
      if (!fs.existsSync(bak)) await fsp.writeFile(bak, text);
      const out = injectHtmlBlock(text, buildBlock(sources.settingsJson, sources.fp));
      // Same size invariant as the CSS/JS patcher: injection only adds bytes.
      const bakSize = (await fsp.stat(bak)).size;
      if (Buffer.byteLength(out, "utf8") < bakSize) {
        warnings.push(
          "size guard: refused to write " + html +
            " (result would be smaller than the pristine backup — torn source file)"
        );
        return false;
      }
      await patcher.atomicWrite(html, out);
      return true;
    },
    warnings
  );
  return { ok: warnings.length === 0, wrote, warnings };
}

/** Undo one Codex webview folder. Returns the number of files restored. */
async function removeCodexDir(dir) {
  return patcher.withFileLock(dir, async () => {
    let n = 0;
    const html = path.join(dir, "index.html");
    const bak = html + patcher.BACKUP_SUFFIX;
    if (fs.existsSync(bak)) {
      try {
        await fsp.copyFile(bak, html);
        await fsp.unlink(bak);
        n++;
      } catch (e) {}
    } else if (fs.existsSync(html)) {
      const text = await fsp.readFile(html, "utf8");
      if (text.indexOf(BEGIN_MARK) !== -1) {
        await patcher.atomicWrite(html, stripHtmlBlock(text));
        n++;
      }
    }
    for (const a of [ASSET_STYLES, ASSET_MATH, ASSET_DRIVER, ASSET_FONT])
      await fsp.rm(path.join(dir, "assets", a), { force: true }).catch(() => {});
    return n;
  });
}

// --- status checks (cheap, lock-free reads) ---------------------------------

function isPatched(dir) {
  try {
    return fs.readFileSync(path.join(dir, "index.html"), "utf8").indexOf(BEGIN_MARK) !== -1;
  } catch (e) {
    return false;
  }
}
function isCurrent(dir, fp) {
  try {
    return (
      fs.readFileSync(path.join(dir, "index.html"), "utf8").indexOf("rtlx-fp:" + fp) !== -1
    );
  } catch (e) {
    return false;
  }
}

module.exports = {
  CODEX_PREFIX,
  BEGIN_MARK,
  END_MARK,
  ASSET_STYLES,
  ASSET_MATH,
  ASSET_DRIVER,
  ASSET_FONT,
  findCodexWebviewDirs,
  stripHtmlBlock,
  injectHtmlBlock,
  buildBlock,
  patchCodexDir,
  removeCodexDir,
  isPatched,
  isCurrent,
};
