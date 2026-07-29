/* Minimal hand-rolled `vscode` API mock — just enough to load and exercise
 * extension.js outside the editor (see patcher-lifecycle.test.js). Records UI
 * calls so tests can assert on prompts; the config store fires
 * onDidChangeConfiguration listeners exactly like the real API. */

const calls = { info: [], warning: [], error: [], executedCommands: [] };
function _reset() {
  calls.info.length = 0;
  calls.warning.length = 0;
  calls.error.length = 0;
  calls.executedCommands.length = 0;
}

// --- configuration ---------------------------------------------------------

const cfgStore = {}; // "rtlForClaude.enabled" → value; unset keys fall to defaults
const cfgListeners = [];
function fireConfigChange(changedKey) {
  const e = {
    affectsConfiguration(section) {
      return (
        changedKey === section ||
        changedKey.indexOf(section + ".") === 0 ||
        section.indexOf(changedKey + ".") === 0
      );
    },
  };
  for (const fn of cfgListeners.slice()) fn(e);
}

const workspace = {
  getConfiguration(section) {
    return {
      get(key, dflt) {
        const k = section + "." + key;
        return k in cfgStore ? cfgStore[k] : dflt;
      },
      async update(key, value) {
        cfgStore[section + "." + key] = value;
        fireConfigChange(section + "." + key);
      },
      inspect(key) {
        const k = section + "." + key;
        return k in cfgStore ? { globalValue: cfgStore[k] } : {};
      },
    };
  },
  onDidChangeConfiguration(fn) {
    cfgListeners.push(fn);
    return {
      dispose() {
        const i = cfgListeners.indexOf(fn);
        if (i !== -1) cfgListeners.splice(i, 1);
      },
    };
  },
};

// Test helper: set a value + fire the change event, like the Settings UI does.
function _setConfig(fullKey, value) {
  cfgStore[fullKey] = value;
  fireConfigChange(fullKey);
}

// --- window / commands / extensions ----------------------------------------

const window = {
  createStatusBarItem() {
    return { text: "", tooltip: "", command: "", show() {}, hide() {}, dispose() {} };
  },
  registerWebviewViewProvider() {
    return { dispose() {} };
  },
  showInformationMessage(msg) {
    calls.info.push(msg);
    return Promise.resolve(undefined); // user dismisses → no reload
  },
  showWarningMessage(msg) {
    calls.warning.push(msg);
    return Promise.resolve(undefined);
  },
  showErrorMessage(msg) {
    calls.error.push(msg);
    return Promise.resolve(undefined);
  },
  showQuickPick() {
    return Promise.resolve(undefined);
  },
};

const registered = new Map();
const commands = {
  registerCommand(id, handler) {
    registered.set(id, handler);
    return {
      dispose() {
        registered.delete(id);
      },
    };
  },
  async executeCommand(id, ...args) {
    calls.executedCommands.push(id);
    const h = registered.get(id);
    if (h) return h(...args);
  },
};

// Where the running IDE says Claude Code lives — lets a test exercise fork-dir
// discovery (an extensions dir that is in none of the hardcoded roots).
let claudeExtensionPath = undefined;
function _setClaudeExtensionPath(p) {
  claudeExtensionPath = p;
}
const extensions = {
  getExtension(id) {
    if (id === "anthropic.claude-code" && claudeExtensionPath)
      return { extensionPath: claudeExtensionPath };
    return undefined;
  },
};

module.exports = {
  // the vscode API surface extension.js touches
  workspace,
  window,
  commands,
  extensions,
  env: { language: "en" },
  StatusBarAlignment: { Left: 1, Right: 2 },
  ConfigurationTarget: { Global: 1 },
  // test hooks
  calls,
  _reset,
  _setConfig,
  _setClaudeExtensionPath,
};
