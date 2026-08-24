# Contributing

RuleLock accepts focused, deterministic policy improvements and adversarial fixtures.

```bash
npm install
npm run typecheck
npm test
npm run test:acceptance
npm run build
npm run demo
```

New rules must have explicit evidence, stable structured output, tests for allowed and blocked cases, and no LLM judgment. Keep dependencies small and never execute input merely to decide whether it is allowed.
