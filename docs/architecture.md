# Architecture

RuleLock separates repository observation, policy evaluation, state records, output, and adapters.

```text
rulelock.yml
    ↓ strict YAML + Zod loader
typed configuration
    ↓
policy engine ← Git status / branch / fingerprint
    ↑            ↑
approvals       execution evidence
    ↓
terminal + JSON + guards + integrations + hooks
```

`src/engine/engine.ts` evaluates repository-state rules. `src/commands/matcher.ts` evaluates commands without executing them. Both emit structured violations consumed by terminal and JSON renderers. Adapters never reimplement policy.

Approvals include their exact repository fingerprint. Evidence is only created by spawning the provided argument array with `shell: false`; a caller cannot directly mark a command as passed. The working-tree fingerprint includes the current commit, tracked binary diffs, and untracked file contents while excluding `.rulelock/` runtime state.

The Git CLI is the only repository backend. YAML is parsed as data and validated strictly. No evaluation path invokes a command under inspection.
