/* Regression test for concurrent-write corruption (backlog item 1.1).
 *
 * Every open IDE window runs its own extension host, and they all patch the
 * SAME webview/index.css|js on disk. Without serialization their read-modify-
 * write cycles interleave and truncate the shared files (observed in the wild
 * in a competing extension: index.js shrinking 4.8 MB → ~1 MB → blank panel).
 *
 * patcher.js has zero vscode imports, so this test exercises the REAL patch
 * code with no editor and no mock: N simultaneous patchers on one fixture
 * install must leave it untruncated, with exactly one marker block, a pristine
 * backup, a byte-for-byte restore, and no lock/tmp litter.
 *
 * Run: node tests/patcher-concurrency.test.js
 */
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const patcher = require("../patcher.js");

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rtlx-race-"));
const webview = path.join(tmpRoot, "anthropic.claude-code-9.9.9", "webview");
fs.mkdirSync(webview, { recursive: true });

// index.js is large (~5 MB) — the file that got truncated in the wild.
const origJs = "/* claude code webview bundle */\n" + "a".repeat(5_000_000) + "\nexport{};\n";
const origCss = ":root{--x:1}\n.chat{color:red}\n";
fs.writeFileSync(path.join(webview, "index.js"), origJs);
fs.writeFileSync(path.join(webview, "index.css"), origCss);

const fontSrc = path.join(tmpRoot, "font.woff2");
fs.writeFileSync(fontSrc, "not-really-a-font");

const sources = {
  css: "/* injected rtl styles */\nbody{direction:rtl}",
  js: "/* rtlx-fp:test */\nconsole.log('rtl driver');",
  fontPath: fontSrc,
};

const count = (text, needle) => text.split(needle).length - 1;

async function main() {
  // Simulate N IDE windows patching the SAME install at once.
  const WINDOWS = 8;
  const results = await Promise.all(
    Array.from({ length: WINDOWS }, () => patcher.patchWebviewDir(webview, sources))
  );
  assert.ok(results.every((r) => r.ok), "every concurrent patcher reported ok");

  const js = fs.readFileSync(path.join(webview, "index.js"), "utf8");
  const css = fs.readFileSync(path.join(webview, "index.css"), "utf8");

  // 1. No truncation: injection only adds bytes.
  assert.ok(js.length >= origJs.length, `index.js truncated: ${js.length} < ${origJs.length}`);
  assert.ok(css.length >= origCss.length, `index.css shrank: ${css.length} < ${origCss.length}`);
  assert.ok(js.startsWith(origJs.slice(0, 100)), "original index.js body lost");

  // 2. Exactly ONE marker block — concurrent patchers never stack.
  assert.strictEqual(count(js, patcher.BEGIN), 1, "index.js marker count != 1");
  assert.strictEqual(count(css, patcher.BEGIN), 1, "index.css marker count != 1");

  // 3. Backups are the pristine originals.
  assert.strictEqual(
    fs.readFileSync(path.join(webview, "index.js" + patcher.BACKUP_SUFFIX), "utf8"),
    origJs,
    "index.js backup drifted"
  );
  assert.strictEqual(
    fs.readFileSync(path.join(webview, "index.css" + patcher.BACKUP_SUFFIX), "utf8"),
    origCss,
    "index.css backup drifted"
  );

  // 4. Font landed, and no lock/tmp litter is left behind.
  assert.ok(fs.existsSync(path.join(webview, patcher.FONT_DEST)), "font not copied");
  const litter = fs
    .readdirSync(webview)
    .filter((f) => f.includes(".tmp.") || f === patcher.LOCK_NAME);
  assert.strictEqual(litter.length, 0, "leftover lock/tmp files: " + litter.join(", "));

  // 5. Size guard: a torn (truncated) target must be refused, backup kept.
  fs.writeFileSync(path.join(webview, "index.js"), origJs.slice(0, 1000)); // simulate torn file
  const guarded = await patcher.patchWebviewDir(webview, sources);
  assert.ok(!guarded.ok && guarded.warnings.some((w) => w.includes("size guard")),
    "size guard did not refuse a torn index.js");
  assert.strictEqual(
    fs.readFileSync(path.join(webview, "index.js"), "utf8"),
    origJs.slice(0, 1000),
    "size guard wrote to a torn file"
  );

  // 6. Removal restores everything byte-for-byte (backup wins even after the
  //    simulated tear) and deletes backups + font.
  await patcher.removeWebviewDir(webview);
  assert.strictEqual(fs.readFileSync(path.join(webview, "index.js"), "utf8"), origJs, "index.js not restored");
  assert.strictEqual(fs.readFileSync(path.join(webview, "index.css"), "utf8"), origCss, "index.css not restored");
  assert.ok(!fs.existsSync(path.join(webview, "index.js" + patcher.BACKUP_SUFFIX)), "js backup left behind");
  assert.ok(!fs.existsSync(path.join(webview, patcher.FONT_DEST)), "font left behind");

  console.log(`PASS patcher-concurrency — ${WINDOWS} concurrent patchers, no corruption, guard + restore ok`);
}

main()
  .then(() => fs.rmSync(tmpRoot, { recursive: true, force: true }))
  .catch((e) => {
    console.error("FAIL patcher-concurrency:", e.message);
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    process.exit(1);
  });
