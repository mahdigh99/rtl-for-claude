/* ============================================================================
 * uninstall.js — runs via the "vscode:uninstall" hook when the extension is
 * fully removed. VS Code executes this as a plain Node process (NO vscode API),
 * so we locate Claude Code by walking the editor's own extensions/ folder
 * (the same folder this extension lives in) and undo our patch — restoring the
 * original chat automatically. Self-contained: only fs + path.
 * ========================================================================== */
const fs = require("fs");
const path = require("path");

const BEGIN = "/* ==== RTL-PATCH (begin) ==== */";
const END = "/* ==== RTL-PATCH (end) ==== */";

function reEsc(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function stripBlock(text) {
  return text.replace(
    new RegExp("\\n?" + reEsc(BEGIN) + "[\\s\\S]*?" + reEsc(END) + "[^\\S\\r\\n]*\\n?$"),
    ""
  );
}

// Restore one file: prefer the pristine backup, else strip our marked block.
function restore(file) {
  try {
    const bak = file + ".rtl-backup";
    if (fs.existsSync(bak)) {
      fs.copyFileSync(bak, file);
      fs.unlinkSync(bak);
      return;
    }
    if (fs.existsSync(file)) {
      const t = fs.readFileSync(file, "utf8");
      if (t.indexOf(BEGIN) !== -1) fs.writeFileSync(file, stripBlock(t));
    }
  } catch (e) {
    /* never throw during uninstall */
  }
}

try {
  // __dirname = <editor>/extensions/<publisher>.rtl-for-claude-code-x.y.z
  // so its parent is the editor's extensions/ folder.
  const extensionsDir = path.dirname(__dirname);
  const claudeDirs = fs
    .readdirSync(extensionsDir)
    .filter((d) => /^anthropic\.claude-code-/.test(d));
  for (const d of claudeDirs) {
    const wv = path.join(extensionsDir, d, "webview");
    restore(path.join(wv, "index.css"));
    restore(path.join(wv, "index.js"));
    try {
      fs.unlinkSync(path.join(wv, "vazirmatn.woff2"));
    } catch (e) {}
  }
} catch (e) {
  /* nothing we can do; uninstall should still succeed silently */
}
