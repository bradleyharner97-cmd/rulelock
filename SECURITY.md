# Security policy

Report potential vulnerabilities privately through GitHub security advisories for the repository.

RuleLock evaluates command arguments separately from execution. Guarded and evidence commands use `spawn` with `shell: false`; policy tests never execute their input. Configuration is parsed as data-only YAML and validated with a strict schema.

RuleLock is a local defense-in-depth control, not a sandbox. A malicious process with repository and Git-hook write access can remove or alter local enforcement. Pair it with reviewed policy changes, protected branches, CI, and operating-system isolation where adversarial code is in scope.
