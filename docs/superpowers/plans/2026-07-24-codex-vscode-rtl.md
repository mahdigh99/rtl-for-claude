# Codex VS Code RTL Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a tested, reversible RTL patcher for the official Codex VS Code extension and open a focused GitHub Pull Request.

**Architecture:** Keep Codex support in a standalone `vscode-extension-codex/` directory so it cannot regress the existing Claude patcher. The shell entrypoint locates the current Codex extension by its retained `openai.chatgpt` identifier, injects local CSS and JavaScript into its webview, and provides idempotent install, list, and remove operations.

**Tech Stack:** Bash, Python 3 helpers embedded in Bash, browser JavaScript, CSS, Node.js syntax checks, ShellCheck, Fallow, Git, GitHub CLI.

## Global Constraints

- Refer to the product as “Codex” in user-facing text and documentation.
- Continue targeting the extension identifier `openai.chatgpt`.
- Keep the Codex patcher independent from the existing Claude patcher.
- Never modify an installed extension during automated tests.
- Preserve code and preformatted content as left-to-right.
- Exclude archives, editor metadata, generated output, and installed extension files from Git.

---

### Task 1: Establish a Mocked Patcher Test

**Files:**
- Create: `vscode-extension-codex/tests/apply-rtl.test.sh`
- Rename: `vscode-extension-chatgpt/` to `vscode-extension-codex/`

**Interfaces:**
- Consumes: `vscode-extension-codex/apply-rtl.sh` command-line modes `--list`, `--install`, and `--remove`.
- Produces: A non-destructive shell regression test that controls discovery through a temporary `HOME`.

- [ ] **Step 1: Rename the feature directory without changing its behavior**

Run:

```bash
mv vscode-extension-chatgpt vscode-extension-codex
```

Expected: all new patcher sources are under `vscode-extension-codex/`.

- [ ] **Step 2: Write the temporary-home regression test**

Create `vscode-extension-codex/tests/apply-rtl.test.sh` with strict Bash mode. The test must:

```bash
test_root="$(mktemp -d)"
trap 'rm -rf "$test_root"' EXIT
export HOME="$test_root/home"
webview="$HOME/.vscode/extensions/openai.chatgpt-test/webview"
mkdir -p "$webview/assets"
printf '<html><head><title>Codex</title></head><body></body></html>\n' > "$webview/index.html"
cp "$webview/index.html" "$test_root/original.html"
```

It then asserts that `--list` finds the mock path, install adds exactly one
`RTL-PATCH (begin)` marker and all three assets, a second install still has one
marker, and remove makes `cmp -s "$test_root/original.html" "$webview/index.html"`
succeed while removing the copied assets and backup.

- [ ] **Step 3: Run the test to establish current behavior**

Run:

```bash
bash vscode-extension-codex/tests/apply-rtl.test.sh
```

Expected: PASS, or a precise failure identifying behavior that must be corrected in Task 2.

- [ ] **Step 4: Commit the isolated test and directory rename**

```bash
git add vscode-extension-codex
git commit -m "test: cover Codex RTL patch lifecycle"
```

### Task 2: Standardize and Harden the Codex Patcher

**Files:**
- Modify: `vscode-extension-codex/apply-rtl.sh`
- Modify: `vscode-extension-codex/assets/driver.js`
- Modify: `vscode-extension-codex/assets/styles.css`
- Modify: `vscode-extension-codex/README.md`
- Modify: `vscode-extension-codex/PR_DESCRIPTION.md`
- Test: `vscode-extension-codex/tests/apply-rtl.test.sh`

**Interfaces:**
- Consumes: Installed extension directories named `openai.chatgpt-*` containing `webview/index.html`.
- Produces: `apply-rtl.sh [--install|--remove|--list]`, injected `rtl-codex-styles.css`, `rtl-codex-driver.js`, and `vazirmatn-codex.woff2`.

- [ ] **Step 1: Update product and asset naming**

Replace user-facing “ChatGPT” references with “Codex”, rename asset identifiers
from `rtl-chatgpt-*` to `rtl-codex-*`, rename the bundled font to
`vazirmatn-codex.woff2`, and retain only the technical discovery glob:

```bash
find "$root" -maxdepth 3 -type f \
  -path "*/openai.chatgpt-*/webview/index.html" 2>/dev/null
```

- [ ] **Step 2: Match the existing Claude patcher’s safety guarantees**

Review `vscode-extension/apply-rtl.sh` and ensure Codex install validates all
source assets before discovery, removes only the marked injected block during
re-application, backs up pristine HTML, and restores the backup before deleting
only the three Codex-owned copied assets.

- [ ] **Step 3: Remove silent JavaScript failure paths**

Keep observer callbacks resilient, but report unexpected sweep and observer
setup failures through a single guarded `console.error("[RTL for Codex]", error)`
so webview changes can be diagnosed without breaking the host page.

- [ ] **Step 4: Run the lifecycle and syntax tests**

Run:

```bash
bash -n vscode-extension-codex/apply-rtl.sh
bash vscode-extension-codex/tests/apply-rtl.test.sh
node --check vscode-extension-codex/assets/driver.js
```

Expected: all commands exit 0; the lifecycle test prints its passing summary.

- [ ] **Step 5: Run ShellCheck when installed**

Run:

```bash
if command -v shellcheck >/dev/null 2>&1; then
  shellcheck vscode-extension-codex/apply-rtl.sh \
    vscode-extension-codex/tests/apply-rtl.test.sh
fi
```

Expected: exit 0, or actionable findings are fixed and the command is repeated.

- [ ] **Step 6: Commit the hardened patcher**

```bash
git add vscode-extension-codex
git commit -m "feat: add RTL support for Codex in VS Code"
```

### Task 3: Integrate Repository Documentation

**Files:**
- Modify: `README.md`
- Modify: `README.fa.md`
- Modify: `CHANGELOG.md`
- Modify: `.gitignore` only if final status reveals an uncovered local artifact.

**Interfaces:**
- Consumes: `vscode-extension-codex/apply-rtl.sh`.
- Produces: Discoverable English and Persian installation, update, and removal instructions.

- [ ] **Step 1: Add Codex to the main installation guide**

Add a “VS Code — Codex” subsection pointing to
`vscode-extension-codex/README.md` and showing:

```bash
bash vscode-extension-codex/apply-rtl.sh
```

State that users re-run it after Codex extension updates and can restore with
`bash vscode-extension-codex/apply-rtl.sh --remove`.

- [ ] **Step 2: Add equivalent Persian instructions**

Update `README.fa.md` with the same commands and the distinction that the
current Codex product still installs under the technical identifier
`openai.chatgpt`.

- [ ] **Step 3: Record the unreleased feature**

Add an unreleased changelog entry for standalone Codex VS Code RTL support,
including automatic paragraph direction, composer direction, code preservation,
and reversible installation.

- [ ] **Step 4: Validate documentation links and whitespace**

Run:

```bash
test -f vscode-extension-codex/README.md
test -x vscode-extension-codex/apply-rtl.sh
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 5: Commit documentation**

```bash
git add README.md README.fa.md CHANGELOG.md
git commit -m "docs: document Codex VS Code RTL support"
```

### Task 4: Audit and Deliver the Pull Request

**Files:**
- Review: all files changed from `origin/main`
- Modify: `vscode-extension-codex/PR_DESCRIPTION.md` if verification evidence differs from its draft.

**Interfaces:**
- Consumes: the completed feature branch and fresh verification output.
- Produces: a pushed branch and GitHub Pull Request targeting `main`.

- [ ] **Step 1: Run project and feature verification**

Run:

```bash
node --test browser-extension/tests/detect.test.js
bash -n vscode-extension/apply-rtl.sh
node --check vscode-extension/assets/driver.js
bash -n vscode-extension-codex/apply-rtl.sh
bash vscode-extension-codex/tests/apply-rtl.test.sh
node --check vscode-extension-codex/assets/driver.js
```

Expected: every command exits 0.

- [ ] **Step 2: Run the changed-code audit**

Run:

```bash
fallow audit --base origin/main --format json --quiet --explain 2>/dev/null || true
```

Expected: valid JSON with no unresolved error-severity finding attributable to
the Codex change. Manually verify any warnings before editing.

- [ ] **Step 3: Review exact scope**

Run:

```bash
git diff --check origin/main...HEAD
git diff --stat origin/main...HEAD
git status --short
git log --oneline origin/main..HEAD
```

Expected: only design/plan documentation, Codex patcher sources and tests,
repository documentation, and the PR draft are included; the worktree is clean.

- [ ] **Step 4: Finalize the PR description**

Ensure `vscode-extension-codex/PR_DESCRIPTION.md` uses “Pull Request” and
“Codex”, explains the retained `openai.chatgpt` identifier, lists exact
verification commands and results, and identifies DOM selector maintenance as
the primary compatibility risk.

- [ ] **Step 5: Push without force**

```bash
git push -u origin feat/codex-vscode-rtl
```

Expected: the remote branch is created successfully.

- [ ] **Step 6: Open the Pull Request**

```bash
gh pr create \
  --base main \
  --head feat/codex-vscode-rtl \
  --title "feat: add RTL support for Codex in VS Code" \
  --body-file vscode-extension-codex/PR_DESCRIPTION.md
```

Expected: GitHub returns the new Pull Request URL.
