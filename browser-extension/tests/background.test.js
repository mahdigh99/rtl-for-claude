/* Functional test for the keyboard-shortcut background script.
 *
 * background.js exists for one reason — chrome.commands can be delivered
 * nowhere else — and it is invisible in normal use: if it silently stops
 * working, the shortcut just does nothing and nobody files a bug. So the whole
 * script is exercised here against a stubbed extension API, in both the Chrome
 * (`chrome.*`) and Firefox (`browser.*`) namespaces.
 *
 * Pure node — no browser needed.  Run: node tests/background.test.js
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const SRC = fs.readFileSync(path.join(__dirname, "../src/background.js"), "utf8");

let failed = 0;
let total = 0;
function ok(pass, label) {
  total++;
  if (!pass) failed++;
  console.log((pass ? "  ok   " : "  FAIL ") + label);
}

/* A stub that records everything and lets us drive the command listener. */
function makeApi(opts) {
  opts = opts || {};
  const calls = { sent: [], queried: [], set: [], listeners: [] };
  const api = {
    commands: {
      onCommand: { addListener: (fn) => calls.listeners.push(fn) },
    },
    tabs: {
      query: (q) => {
        calls.queried.push(q);
        return Promise.resolve(opts.tabs !== undefined ? opts.tabs : [{ id: 7 }]);
      },
      sendMessage: (id, msg) => {
        calls.sent.push({ id, msg });
        // A tab with no content script rejects — the common case on any page
        // that isn't a supported chat.
        return opts.noReceiver ? Promise.reject(new Error("no receiver")) : Promise.resolve();
      },
    },
    storage: {
      sync: {
        get: (defaults, cb) => cb(Object.assign({}, defaults, opts.stored || {})),
        set: (patch) => calls.set.push(patch),
      },
    },
    runtime: { lastError: null },
  };
  return { api, calls };
}

function load(globals) {
  const ctx = vm.createContext(Object.assign({ console }, globals));
  vm.runInContext(SRC, ctx, { filename: "background.js" });
  return ctx;
}

const settle = () => new Promise((r) => setTimeout(r, 0));

(async () => {
  // --- Chrome namespace ----------------------------------------------------
  const chromeStub = makeApi();
  load({ chrome: chromeStub.api });
  ok(chromeStub.calls.listeners.length === 1, "registers exactly one command listener");
  const fire = chromeStub.calls.listeners[0];

  fire("cycle-direction");
  await settle();
  ok(chromeStub.calls.queried.length === 1 &&
     chromeStub.calls.queried[0].active === true &&
     chromeStub.calls.queried[0].currentWindow === true,
    "cycle-direction targets the active tab of the current window");
  ok(chromeStub.calls.sent.length === 1 && chromeStub.calls.sent[0].id === 7 &&
     chromeStub.calls.sent[0].msg.type === "rtlx:cycle",
    "cycle-direction sends rtlx:cycle to that tab");

  fire("toggle-enabled");
  await settle();
  ok(chromeStub.calls.set.length === 1 && chromeStub.calls.set[0].enabled === false,
    "toggle-enabled flips the stored setting (true → false)");
  ok(chromeStub.calls.sent.length === 1,
    "toggle-enabled does NOT message the tab — storage.onChanged reaches every tab");

  fire("something-else");
  await settle();
  ok(chromeStub.calls.sent.length === 1 && chromeStub.calls.set.length === 1,
    "an unknown command does nothing");

  // --- Firefox namespace ---------------------------------------------------
  // Firefox exposes `browser`; the script must pick it up (and use the
  // promise-style calls that namespace requires).
  const ffStub = makeApi({ stored: { enabled: false } });
  load({ browser: ffStub.api });
  ok(ffStub.calls.listeners.length === 1, "browser.* namespace is used when present");
  ffStub.calls.listeners[0]("toggle-enabled");
  await settle();
  ok(ffStub.calls.set.length === 1 && ffStub.calls.set[0].enabled === true,
    "toggle-enabled flips back on (false → true)");

  // --- pages with no content script ---------------------------------------
  const deadStub = makeApi({ noReceiver: true });
  const rejections = [];
  const onUnhandled = (e) => rejections.push(e);
  process.on("unhandledRejection", onUnhandled);
  load({ chrome: deadStub.api });
  deadStub.calls.listeners[0]("cycle-direction");
  await settle();
  await settle();
  process.removeListener("unhandledRejection", onUnhandled);
  ok(rejections.length === 0, "a tab with no content script is swallowed, not thrown");

  const emptyStub = makeApi({ tabs: [] });
  load({ chrome: emptyStub.api });
  emptyStub.calls.listeners[0]("cycle-direction");
  await settle();
  ok(emptyStub.calls.sent.length === 0, "no active tab → nothing sent");

  if (failed) {
    console.error("\nFAIL: " + failed + "/" + total + " background case(s) regressed");
    process.exit(1);
  }
  console.log("\nPASS: " + total + " background shortcut cases");
})();
