import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { approveCommand, revokeApprovalCommand } from "../src/cli/commands/approve.js";
import { checkCommand } from "../src/cli/commands/check.js";
import { guardPathCommand } from "../src/cli/commands/guard-path.js";
import { guardCommand } from "../src/cli/commands/guard.js";
import { installHooks, removeHooks } from "../src/cli/commands/hooks.js";
import { initCommand } from "../src/cli/commands/init.js";
import { installCommand } from "../src/cli/commands/install.js";
import { runCommand } from "../src/cli/commands/run.js";
import { testRuleCommand } from "../src/cli/commands/test-rule.js";
import { displayCommand } from "../src/commands/parser.js";
import { saveConfig } from "../src/config/loader.js";
import { safeConfig } from "../src/config/schema.js";
import { createApproval } from "../src/approvals/store.js";
import { fixtureRepo, git } from "./helpers.js";

describe("end-to-end flows", () => {
  it("records successful evidence and detects staleness", async () => {
    const cwd = await fixtureRepo();
    await initCommand(cwd, {});
    const argv = [process.execPath, "-e", "process.exit(0)"];
    const required = displayCommand(argv);
    await saveConfig(cwd, { ...safeConfig, dependency_changes: { require_approval: false }, completion: { require: [required], require_clean_rulelock_check: true } });
    git(cwd, "add", "rulelock.yml");
    git(cwd, "commit", "-m", "configure rulelock");
    expect((await checkCommand(cwd)).output).toContain("REQUIRED CHECK MISSING");
    expect((await runCommand(cwd, argv)).exitCode).toBe(0);
    expect((await checkCommand(cwd)).exitCode).toBe(0);
    await writeFile(path.join(cwd, "src.ts"), "export const value = 2;\n");
    const stale = await checkCommand(cwd);
    expect(stale.exitCode).toBe(1);
    expect(stale.output).toContain("REQUIRED CHECK STALE");
  });

  it("records failed evidence and never treats it as passed", async () => {
    const cwd = await fixtureRepo();
    await initCommand(cwd, {});
    const argv = [process.execPath, "-e", "process.exit(7)"];
    const required = displayCommand(argv);
    await saveConfig(cwd, { ...safeConfig, dependency_changes: { require_approval: false }, completion: { require: [required], require_clean_rulelock_check: true } });
    git(cwd, "add", "rulelock.yml");
    git(cwd, "commit", "-m", "configure rulelock");
    expect((await runCommand(cwd, argv)).exitCode).toBe(7);
    const result = await checkCommand(cwd);
    expect(result.output).toContain("REQUIRED CHECK FAILED");
  });

  it("does not pretend CI can reconstruct absent local evidence", async () => {
    const cwd = await fixtureRepo();
    await initCommand(cwd, {});
    await saveConfig(cwd, { ...safeConfig, dependency_changes: { require_approval: false }, completion: { require: ["npm test"], require_clean_rulelock_check: true } });
    expect((await checkCommand(cwd)).exitCode).toBe(1);
    expect((await checkCommand(cwd, false, true)).exitCode).toBe(0);
  });

  it("supports command and path guards without executing test-rule input", async () => {
    const cwd = await fixtureRepo();
    await initCommand(cwd, { preset: "strict" });
    expect((await guardCommand(cwd, ["git", "push", "origin", "main"], { checkOnly: true })).exitCode).toBe(1);
    expect((await guardCommand(cwd, ["git", "status"], { checkOnly: true })).exitCode).toBe(0);
    expect((await testRuleCommand(cwd, "command", "git push --force origin feature")).output).toContain("FORCE PUSH BLOCKED");
    expect((await testRuleCommand(cwd, "path", ".env.production")).output).toContain(".env.*");
    expect((await guardPathCommand(cwd, "migrations/001.sql", "write")).exitCode).toBe(2);
    await createApproval(cwd, "migrations/001.sql", "approved path guard");
    expect((await guardPathCommand(cwd, "migrations/001.sql", "write")).exitCode).toBe(0);
  });

  it("completes the protected-path approval plus required-check workflow", async () => {
    const cwd = await fixtureRepo();
    await initCommand(cwd, {});
    const argv = [process.execPath, "-e", "process.exit(0)"];
    const required = displayCommand(argv);
    await saveConfig(cwd, {
      ...safeConfig,
      protected_paths: ["migrations/**"],
      dependency_changes: { require_approval: false },
      completion: { require: [required], require_clean_rulelock_check: true },
    });
    git(cwd, "add", "rulelock.yml");
    git(cwd, "commit", "-m", "configure rulelock");
    await writeFile(path.join(cwd, "migrations.sql"), "not protected\n");
    await mkdir(path.join(cwd, "migrations"));
    await writeFile(path.join(cwd, "migrations", "001.sql"), "select 1;\n");
    expect((await checkCommand(cwd)).output).toContain("PROTECTED PATH");
    const approvalOutput = await approveCommand(cwd, "migrations/001.sql", "Required migration");
    expect(approvalOutput).toContain("RL-A001");
    expect((await checkCommand(cwd)).output).toContain("REQUIRED CHECK MISSING");
    await runCommand(cwd, argv);
    expect((await checkCommand(cwd)).exitCode).toBe(0);
    expect(await revokeApprovalCommand(cwd, "RL-A001")).toContain("Revoked");
    expect((await checkCommand(cwd)).exitCode).toBe(1);
  });

  it("installs agent instructions idempotently without overwriting existing content", async () => {
    const cwd = await fixtureRepo();
    await writeFile(path.join(cwd, "AGENTS.md"), "# Existing guidance\n");
    expect(await installCommand(cwd, "codex")).toContain("Installed");
    expect(await installCommand(cwd, "codex")).toContain("Already installed");
    const content = await readFile(path.join(cwd, "AGENTS.md"), "utf8");
    expect(content).toContain("Existing guidance");
    expect(content.match(/<!-- rulelock:start -->/gu)).toHaveLength(1);
  });

  it("chains and removes Git hooks while preserving unrelated content", async () => {
    const cwd = await fixtureRepo();
    const hook = path.join(cwd, ".git", "hooks", "pre-commit");
    await writeFile(hook, "#!/bin/sh\necho existing\n");
    expect(await installHooks(cwd)).toContain("Installed");
    expect(await installHooks(cwd)).toContain("Already installed");
    expect(await readFile(hook, "utf8")).toContain("echo existing");
    await removeHooks(cwd);
    const remaining = await readFile(hook, "utf8");
    expect(remaining).toContain("echo existing");
    expect(remaining).not.toContain("rulelock:start");
  });
});
