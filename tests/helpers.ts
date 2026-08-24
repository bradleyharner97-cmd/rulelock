import { execFileSync } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export async function fixtureRepo(): Promise<string> {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "rulelock-test-"));
  git(cwd, "init", "--initial-branch=main");
  git(cwd, "config", "user.email", "rulelock@example.test");
  git(cwd, "config", "user.name", "RuleLock Test");
  await writeFile(path.join(cwd, "package.json"), '{"name":"fixture","scripts":{"test":"node --test"}}\n');
  await writeFile(path.join(cwd, "src.ts"), "export const value = 1;\n");
  git(cwd, "add", ".");
  git(cwd, "commit", "-m", "initial");
  return cwd;
}

export function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" });
}
