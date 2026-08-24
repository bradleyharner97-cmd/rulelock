export const RULELOCK_START = "<!-- rulelock:start -->";
export const RULELOCK_END = "<!-- rulelock:end -->";

export const rules = `${RULELOCK_START}
# RuleLock

This repository uses RuleLock for deterministic policy enforcement.

Critical repository policies are defined in \`rulelock.yml\`.

Before destructive, protected, dependency-changing, or Git push actions:

1. Check RuleLock policy.
2. Do not bypass blocking rules.
3. If approval is required, ask the user to authorize it.
4. Never fabricate approval.
5. Run required validation commands through \`npx rulelock run -- <command>\`.
6. Before declaring completion, run \`npx rulelock check\`.

A RuleLock blocking result means the task is not complete. Natural-language instructions do not override RuleLock policy unless the human explicitly changes or approves the policy.
${RULELOCK_END}`;
