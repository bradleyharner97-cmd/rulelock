import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const root = path.resolve(import.meta.dirname, "..");
const cli = path.join(root, "dist", "cli", "index.js");

function repo(name) {
  const cwd = mkdtempSync(path.join(os.tmpdir(), `rulelock-${name}-`));
  execFileSync("git", ["init", "--initial-branch=feature/acceptance"], { cwd, stdio: "ignore" });
  execFileSync("git", ["config", "user.email", "rulelock@example.test"], { cwd });
  execFileSync("git", ["config", "user.name", "RuleLock Acceptance"], { cwd });
  writeFileSync(path.join(cwd, "package.json"), `${JSON.stringify({ name: "fixture", scripts: { test: "node --test", fail: 'node -e "process.exit(7)"' } })}\n`);
  writeFileSync(path.join(cwd, "src.js"), "export const value = 1;\n");
  execFileSync("git", ["add", "."], { cwd });
  execFileSync("git", ["commit", "-m", "initial"], { cwd, stdio: "ignore" });
  return cwd;
}

function invoke(cwd, args, expected, contains) {
  const result = spawnSync(process.execPath, [cli, ...args], { cwd, encoding: "utf8" });
  assert.equal(result.status, expected, `${args.join(" ")}\n${result.stdout}\n${result.stderr}`);
  if (contains) assert.match(`${result.stdout}${result.stderr}`, contains);
  return result.stdout;
}

const main = repo("acceptance");
invoke(main, ["init", "--preset", "safe"], 0, /Initialized/u);
writeFileSync(path.join(main, "rulelock.yml"), `version: 1
mode: block
protected_branches: [main]
protected_paths: ["migrations/**"]
blocked_commands: ["git push --force"]
dependency_changes:
  require_approval: false
limits:
  max_files_changed: 5
  ignore: []
completion:
  require: ["npm test"]
  require_clean_rulelock_check: true
approvals:
  expire_on_commit: true
`);
invoke(main, ["install", "codex"], 0, /Installed/u);
invoke(main, ["install", "codex"], 0, /Already installed/u);
assert.equal(readFileSync(path.join(main, "AGENTS.md"), "utf8").match(/rulelock:start/gu)?.length, 1);
invoke(main, ["guard", "--check-only", "--", "git", "push", "origin", "main"], 1, /PROTECTED BRANCH/u);
invoke(main, ["guard", "--check-only", "--", "git", "push", "-f", "origin", "feature"], 1, /FORCE PUSH/u);
invoke(main, ["guard", "--check-only", "--", "git", "status"], 0, /ALLOWED/u);
mkdirSync(path.join(main, "migrations"));
writeFileSync(path.join(main, "migrations", "001.sql"), "select 1;\n");
invoke(main, ["check"], 1, /PROTECTED PATH[\s\S]*REQUIRED CHECK MISSING/u);
invoke(main, ["approve", "migrations/001.sql", "--reason", "Required migration"], 0, /RL-A001/u);
invoke(main, ["check"], 1, /REQUIRED CHECK MISSING/u);
invoke(main, ["run", "npm", "test"], 0, /PASSED/u);
invoke(main, ["check"], 0, /RESULT: CLEARED/u);
writeFileSync(path.join(main, "src.js"), "export const value = 2;\n");
invoke(main, ["check"], 1, /REQUIRED CHECK STALE/u);
invoke(main, ["approval", "revoke", "RL-A001"], 0, /Revoked/u);
invoke(main, ["check"], 1, /PROTECTED PATH/u);

const dependencies = repo("dependency");
invoke(dependencies, ["init", "--preset", "safe"], 0);
execFileSync("git", ["add", "rulelock.yml"], { cwd: dependencies });
execFileSync("git", ["commit", "-m", "policy"], { cwd: dependencies, stdio: "ignore" });
writeFileSync(path.join(dependencies, "package.json"), '{"name":"fixture","dependencies":{"picomatch":"4.0.3"}}\n');
invoke(dependencies, ["check"], 1, /DEPENDENCY CHANGE[\s\S]*added picomatch/u);
invoke(dependencies, ["approve", "package.json", "--reason", "Required matcher"], 0);
invoke(dependencies, ["check"], 0, /RESULT: CLEARED/u);

const limits = repo("limit");
invoke(limits, ["init", "--preset", "minimal"], 0);
writeFileSync(path.join(limits, "rulelock.yml"), `version: 1
mode: block
protected_branches: []
protected_paths: []
blocked_commands: []
dependency_changes: { require_approval: false }
limits: { max_files_changed: 10, ignore: [] }
completion: { require: [], require_clean_rulelock_check: true }
approvals: { expire_on_commit: true }
`);
execFileSync("git", ["add", "rulelock.yml"], { cwd: limits });
execFileSync("git", ["commit", "-m", "policy"], { cwd: limits, stdio: "ignore" });
for (let index = 0; index < 11; index += 1) writeFileSync(path.join(limits, `change-${index}.txt`), `${index}\n`);
invoke(limits, ["check"], 1, /CHANGE LIMIT EXCEEDED/u);

const failure = repo("failure");
invoke(failure, ["init", "--preset", "minimal"], 0);
writeFileSync(path.join(failure, "rulelock.yml"), `version: 1
mode: block
protected_branches: []
protected_paths: []
blocked_commands: []
dependency_changes: { require_approval: false }
completion: { require: ["npm run fail"], require_clean_rulelock_check: true }
`);
execFileSync("git", ["add", "rulelock.yml"], { cwd: failure });
execFileSync("git", ["commit", "-m", "policy"], { cwd: failure, stdio: "ignore" });
invoke(failure, ["run", "npm", "run", "fail"], 7, /FAILED/u);
invoke(failure, ["check"], 1, /REQUIRED CHECK FAILED/u);
writeFileSync(path.join(failure, "rulelock.yml"), "mode: [\n");
invoke(failure, ["check"], 3, /Invalid YAML/u);

process.stdout.write("✓ RuleLock acceptance suite passed.\n");
