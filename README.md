# RuleLock

**Prompts are suggestions. Compile your AI rules into laws.**

You told your coding agent:

> Never push directly to main.

It pushed to main.

The problem is not your prompt. The problem is that a prompt is not enforcement.

```yaml
protected_branches:
  - main
```

```bash
npx rulelock install codex
npx rulelock guard -- git push origin main
```

```text
🔒 PROTECTED BRANCH

Direct pushes to protected branch `main` are prohibited.

RESULT: BLOCKED
```

RuleLock turns critical repository rules into deterministic local checks, command and path guards, scoped approvals, fresh execution evidence, agent instructions, and Git hooks. It is a compiler and runtime for repository-level AI agent rules.

> RuleLock reads repository policy and Git state locally. No source code or command history is uploaded. There are no accounts, API keys, servers, or telemetry.

## Install

RuleLock requires Node.js 20 or newer and Git.

```bash
npm install --save-dev rulelock
npx rulelock init --preset safe
npx rulelock install codex
```

`rulelock init` never overwrites existing files unless `--force` is supplied. The generated YAML shows every enabled policy; presets contain no hidden rules.

## Configuration

```yaml
version: 1
mode: block

protected_branches:
  - main
  - production

protected_paths:
  - .env
  - .env.*
  - secrets/**
  - migrations/**

blocked_commands:
  - git push --force
  - git reset --hard
  - rm -rf

dependency_changes:
  require_approval: true

limits:
  max_files_changed: 15
  ignore:
    - "*.snap"
    - generated/**

completion:
  require:
    - npm test
    - npm run typecheck
  require_clean_rulelock_check: true

approvals:
  expire_on_commit: true
```

Configuration is strict, parsed as data-only YAML, and validated with Zod. Unknown keys and malformed values fail closed. Set `mode: warn` to report findings without returning policy-violation exit codes.

## Commands

| Command | Purpose |
| --- | --- |
| `rulelock init [--preset minimal\|safe\|strict]` | Create `rulelock.yml` and local state files. |
| `rulelock check [--json]` | Evaluate changed paths, dependencies, limits, approvals, and completion evidence. |
| `rulelock install [codex\|claude\|cursor\|generic]` | Add an idempotent, marked instruction block without replacing existing guidance. |
| `rulelock status` | Summarize policy state, integrations, approvals, and required checks. |
| `rulelock approve <path> --reason <text>` | Approve one path for the exact current repository state. |
| `rulelock approvals [--json]` | Inspect approval records. |
| `rulelock approval revoke <id>` | Revoke an explicit approval. |
| `rulelock test-rule command "<command>"` | Evaluate command policy without executing anything. |
| `rulelock test-rule path <path>` | Explain which protected-path pattern matches. |
| `rulelock guard -- <command>` | Block a forbidden command or execute an allowed one without a shell. |
| `rulelock guard-path <path> <operation>` | Return allowed or approval-required for editor hooks. |
| `rulelock run -- <command>` | Execute without a shell and record real pass/fail evidence. |
| `rulelock hooks install\|remove` | Safely add or remove marked pre-commit and pre-push hook blocks. |

Running `npx rulelock` with no command is the same as `npx rulelock check`.

## Prompt vs RuleLock

```text
Prompt: "Please don't edit migrations."
Agent:  "Sure."
Later:  edits migrations.

RuleLock:
protected_paths:
  - migrations/**

Agent attempts write:
APPROVAL REQUIRED.
```

```text
Prompt: "Always run tests."
Agent:  "Tests should pass."

RuleLock:
completion:
  require:
    - npm test

Result:
NOT CLEARED — npm test has not been executed.
```

## Fresh proof, not promises

Required checks only pass when executed through RuleLock:

```bash
npx rulelock run -- npm test
npx rulelock check
```

The evidence record includes the command, argument array, real exit code, completion time, Git commit, and a working-tree fingerprint. The fingerprint combines `HEAD`, tracked changes, and the content of untracked files. If code changes after a successful run, RuleLock reports `REQUIRED_CHECK_STALE`.

RuleLock state files are excluded from the fingerprint, so recording evidence or approval does not invalidate itself.

## Scoped approvals

```bash
npx rulelock approve migrations/001_add_users.sql \
  --reason "Required schema change"
npx rulelock approvals
npx rulelock approval revoke RL-A001
```

Approvals are visible JSON records, limited to one path, tied to the exact repository fingerprint, and tied to the current commit by default. A later edit or commit requires a new approval. RuleLock does not create permanent invisible bypasses.

## Agent integrations

Codex is the primary adapter:

```bash
npx rulelock install codex
```

It adds a marked block to `AGENTS.md`, preserving unrelated instructions. Claude receives the same block in `CLAUDE.md`; Cursor receives `.cursor/rules/rulelock.mdc`; generic tools receive `.rulelock/AGENT.md`. Installation is idempotent.

The RuleLock CLI, path guard, command guard, evidence validation, and Git hooks are deterministic. Agent-side enforcement strength depends on the interception capabilities exposed by each agent. Repository instructions alone cannot make an untrusted process impossible to bypass. Use `rulelock guard`, Git hooks, branch protection, and CI as independent enforcement layers.

## Git hooks and CI

```bash
npx rulelock hooks install
```

RuleLock appends clearly marked blocks to existing pre-commit and pre-push hooks and preserves unrelated hook content. The pre-push hook evaluates the actual remote ref through the command engine. Removal only removes RuleLock-managed blocks.

Example GitHub Actions job:

```yaml
name: RuleLock
on: [pull_request]
jobs:
  rulelock:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npx rulelock check --ci
```

CI can reliably enforce repository-state policies. It cannot reconstruct an interactive approval or local evidence file that was never persisted.

## JSON and exit codes

`check`, `guard`, `guard-path`, and approval listing offer stable JSON output for adapters. Structured violations include `ruleId`, `ruleType`, `severity`, `message`, target, evidence, and whether approval is required.

| Code | Meaning |
| --- | --- |
| `0` | Allowed, cleared, or a finding reported in warn mode. |
| `1` | Blocking rule violation. |
| `2` | Approval required by a path guard. |
| `3` | Invalid configuration or command usage. |
| `4` | Git or repository environment error. |

## What RuleLock is not

RuleLock is not another giant `AGENTS.md`, a prompt-template library, a coding agent, a linter, an AI judge, or an autonomous security product. It does not use an LLM to decide whether a hard rule was violated.

The rule compiler has one source of truth and many adapters:

```text
rulelock.yml → validated rule model → policy engine
                                      ├─ CLI checks
                                      ├─ command guard
                                      ├─ path guard
                                      ├─ agent instructions
                                      ├─ Git hooks
                                      └─ CI
```

## Limitations and false positives

- A local tool can be bypassed by a process that deliberately avoids invoking it; server-side branch protection remains the final authority for Git hosting.
- Command matching is conservative and deterministic, not a full shell parser. RuleLock executes guarded commands as argument arrays with `shell: false`.
- Protected paths use glob matching and can intentionally be broad. Use `test-rule path` before rolling out a new policy.
- Dependency policy is path-based across common ecosystems. `package.json` receives added, removed, and version-change detail; other formats are reported at file level.
- Approvals are state-specific. This can require re-approval after an unrelated change, favoring safety over convenience.

See [docs/architecture.md](docs/architecture.md), [SECURITY.md](SECURITY.md), and [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT
