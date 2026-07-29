/* The extension's bundled Codex assets and codex.js MUST stay interchangeable
 * with the standalone patcher in vscode-extension-codex/ — that is the whole
 * compatibility contract (either tool can replace or undo the other's patch).
 * This test pins it:
 *   1. the four vendored files in assets/codex/ are byte-identical to the
 *      standalone patcher's assets/;
 *   2. the markers and on-disk asset filenames in codex.js are the exact
 *      strings apply-rtl.sh uses.
 * Run: node tests/codex-sync.test.js
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const extRoot = path.resolve(__dirname, "..");
const codex = require(path.join(extRoot, "codex.js"));
const standalone = path.resolve(extRoot, "..", "vscode-extension-codex");

let failures = 0;
function check(cond, msg) {
  if (cond) console.log("  ok:", msg);
  else {
    console.error("  FAIL:", msg);
    failures++;
  }
}

// 1. vendored assets are byte-identical to the standalone patcher's.
for (const f of ["driver.js", "rtl-math.js", "styles.css", "vazirmatn-codex.woff2"]) {
  const ours = fs.readFileSync(path.join(extRoot, "assets", "codex", f));
  const theirs = fs.readFileSync(path.join(standalone, "assets", f));
  check(ours.equals(theirs), "assets/codex/" + f + " is byte-identical to the standalone patcher's");
}

// 2. markers + installed filenames match apply-rtl.sh literally.
const sh = fs.readFileSync(path.join(standalone, "apply-rtl.sh"), "utf8");
check(sh.includes('BEGIN_MARK="' + codex.BEGIN_MARK + '"'), "BEGIN_MARK matches apply-rtl.sh");
check(sh.includes('END_MARK="' + codex.END_MARK + '"'), "END_MARK matches apply-rtl.sh");
check(sh.includes('ASSET_STYLES="' + codex.ASSET_STYLES + '"'), "ASSET_STYLES matches apply-rtl.sh");
check(sh.includes('ASSET_MATH="' + codex.ASSET_MATH + '"'), "ASSET_MATH matches apply-rtl.sh");
check(sh.includes('ASSET_DRIVER="' + codex.ASSET_DRIVER + '"'), "ASSET_DRIVER matches apply-rtl.sh");
check(sh.includes('ASSET_FONT="' + codex.ASSET_FONT + '"'), "ASSET_FONT matches apply-rtl.sh");

// 3. the block we inject only references those filenames (no drift possible).
const block = codex.buildBlock("{}", "0123456789ab");
for (const name of [codex.ASSET_STYLES, codex.ASSET_MATH, codex.ASSET_DRIVER])
  check(block.includes("./assets/" + name), "injected block references " + name);
check(block.startsWith(codex.BEGIN_MARK) && block.trimEnd().endsWith(codex.END_MARK), "block is fully inside the markers");

if (failures) {
  console.error(`\nFAIL codex-sync — ${failures} assertion(s) failed`);
  process.exit(1);
}
console.log("\nPASS codex-sync");
