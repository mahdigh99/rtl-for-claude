/* Behavioral test for src/dom-guard.js — the React-crash guard.
 *
 * The guard's whole contract: every VALID removeChild/insertBefore behaves
 * exactly as before, and only the two calls that would otherwise throw a
 * DOMException (node moved out from under React) are softened. Verified here
 * against a minimal hand-rolled Node implementation whose unpatched methods
 * throw exactly like the DOM does.
 * Run: node browser-extension/tests/dom-guard.test.js
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const src = fs.readFileSync(path.join(__dirname, "..", "src", "dom-guard.js"), "utf8");

function FakeNode() {
  this.children = [];
  this.parentNode = null;
}
FakeNode.prototype.removeChild = function (c) {
  const i = this.children.indexOf(c);
  if (i === -1) throw new Error("NotFoundError: not a child of this node");
  this.children.splice(i, 1);
  c.parentNode = null;
  return c;
};
FakeNode.prototype.insertBefore = function (n, ref) {
  if (ref) {
    const i = this.children.indexOf(ref);
    if (i === -1) throw new Error("NotFoundError: reference node is not a child");
    this.children.splice(i, 0, n);
  } else this.children.push(n);
  n.parentNode = this;
  return n;
};
FakeNode.prototype.appendChild = function (n) {
  this.children.push(n);
  n.parentNode = this;
  return n;
};

const window = { Node: FakeNode };
vm.runInNewContext(src, { window });

let failures = 0;
function check(cond, msg) {
  if (cond) console.log("  ok:", msg);
  else {
    console.error("  FAIL:", msg);
    failures++;
  }
}

check(window.__rtlxDomGuard === true, "guard marks itself installed");

// valid operations behave exactly as before
const parent = new FakeNode();
const a = new FakeNode();
const b = new FakeNode();
parent.appendChild(a);
parent.appendChild(b);
check(parent.removeChild(a) === a && parent.children.length === 1, "valid removeChild still removes");
const c = new FakeNode();
check(parent.insertBefore(c, b) === c && parent.children[0] === c, "valid insertBefore still inserts in place");

// the two crash cases are softened
const stranger = new FakeNode();
let threw = false;
let ret;
try {
  ret = parent.removeChild(stranger);
} catch (e) {
  threw = true;
}
check(!threw && ret === stranger, "removeChild on a moved node returns it instead of throwing");
check(parent.children.length === 2, "…and the parent's real children are untouched");

// a node that MOVED to another parent still leaves the screen — the caller
// asked for a removal; leaving it attached would render as ghost text
const oldParent = new FakeNode();
const newParent = new FakeNode();
const mover = new FakeNode();
newParent.appendChild(mover);
threw = false;
try {
  ret = oldParent.removeChild(mover);
} catch (e) {
  threw = true;
}
check(!threw && ret === mover, "removeChild on a re-parented node returns it instead of throwing");
check(newParent.children.length === 0 && mover.parentNode === null,
  "…and the node is detached from its REAL parent (no ghost left behind)");

const d = new FakeNode();
threw = false;
try {
  ret = parent.insertBefore(d, stranger);
} catch (e) {
  threw = true;
}
check(!threw && ret === d, "insertBefore with a moved reference appends instead of throwing");
check(parent.children[parent.children.length - 1] === d, "…the node still ends up in the tree");

// double install is a no-op (no re-wrapping into an ever-deeper chain)
const removeBefore = window.Node.prototype.removeChild;
vm.runInNewContext(src, { window });
check(window.Node.prototype.removeChild === removeBefore, "second install leaves the patched methods alone");

if (failures) {
  console.error(`\nFAIL dom-guard — ${failures} assertion(s) failed`);
  process.exit(1);
}
console.log("\nPASS dom-guard");
