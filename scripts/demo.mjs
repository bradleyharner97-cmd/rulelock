import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const root = path.resolve(import.meta.dirname, "..");
const cli = path.join(root, "dist", "cli", "index.js");
const fixture = mkdtempSync(path.join(os.tmpdir(), "rulelock-demo-"));

function git(...args) { execFileSync("git", args, { cwd: fixture, stdio: "ignore" }); }
function rulelock(args, expected) {
  const result = spawnSync(process.execPath, [cli, ...args], { cwd: fixture, encoding: "utf8" });
  process.stdout.write(`${result.stdout}${result.stderr}`);
  if (result.status !== expected) throw new Error(`Expected exit ${expected}, received ${result.status}: rulelock ${args.join(" ")}`);
}

git("init", "--initial-branch=feature/demo");
git("config", "user.email", "rulelock@example.test");
git("config", "user.name", "RuleLock Demo");
writeFileSync(path.join(fixture, "package.json"), '{"name":"rulelock-demo","scripts":{"test":"node --test"}}\n');
writeFileSync(path.join(fixture, "app.js"), "export const ready = true;\n");
git("add", ".");
git("commit", "-m", "initial");

writeFileSync(path.join(fixture, "rulelock.yml"), `version: 1
mode: block
protected_branches:
  - main
protected_paths:
  - migrations/**
blocked_commands:
  - git push --force
dependency_changes:
  require_approval: false
completion:
  require:
    - npm test
`);

process.stdout.write("\nDEMO 1 — protected branch\n\n");
rulelock(["guard", "--check-only", "--", "git", "push", "origin", "main"], 1);

process.stdout.write("\nDEMO 2 — protected path\n\n");
mkdirSync(path.join(fixture, "migrations"));
writeFileSync(path.join(fixture, "migrations", "001.sql"), "create table demo(id int);\n");
rulelock(["check"], 1);
rulelock(["approve", "migrations/001.sql", "--reason", "Required migration"], 0);

process.stdout.write("\nDEMO 3 — completion evidence\n\n");
rulelock(["check"], 1);
rulelock(["run", "--", "npm", "test"], 0);
rulelock(["check"], 0);

process.stdout.write(`\n✓ Demo complete in ${fixture}\n`);
