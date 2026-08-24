#!/usr/bin/env node
import { realpathSync } from "node:fs";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { Command, InvalidArgumentError, Option } from "commander";
import { ConfigError } from "../config/loader.js";
import { GitError } from "../git/git.js";
import type { AgentName } from "../integrations/index.js";
import { approveCommand, approvalsCommand, revokeApprovalCommand } from "./commands/approve.js";
import { checkCommand } from "./commands/check.js";
import { guardPathCommand } from "./commands/guard-path.js";
import { guardCommand } from "./commands/guard.js";
import { installHooks, removeHooks } from "./commands/hooks.js";
import { initCommand, type Preset } from "./commands/init.js";
import { installCommand } from "./commands/install.js";
import { runCommand } from "./commands/run.js";
import { statusCommand } from "./commands/status.js";
import { testRuleCommand } from "./commands/test-rule.js";

function print(value: string): void { process.stdout.write(`${value}\n`); }
function finish(result: { output: string; exitCode: number }): void { if (result.output) print(result.output); process.exitCode = result.exitCode; }

export function createProgram(cwd = process.cwd()): Command {
  const program = new Command();
  program.name("rulelock").description("Compile repository rules into deterministic guardrails.").version("0.1.0").showHelpAfterError();

  program.command("init")
    .description("Initialize RuleLock in the current repository")
    .option("--force", "overwrite existing RuleLock files")
    .addOption(new Option("--preset <preset>", "policy preset").choices(["minimal", "safe", "strict"]).default("safe"))
    .action(async (options: { force?: boolean; preset: Preset }) => print(await initCommand(cwd, options)));

  program.command("check")
    .description("Evaluate the current repository state")
    .option("--json", "emit machine-readable JSON")
    .option("--ci", "run in CI mode")
    .option("--stage <stage>", "hook stage")
    .action(async (options: { json?: boolean; ci?: boolean }) => finish(await checkCommand(cwd, options.json, options.ci)));

  program.command("install [agent]")
    .description("Install repository instructions for an agent")
    .addOption(new Option("--agent <agent>", "agent adapter").choices(["codex", "claude", "cursor", "generic"]))
    .action(async (agent: AgentName | undefined, options: { agent?: AgentName }) => print(await installCommand(cwd, agent ?? options.agent ?? "codex")));

  program.command("status").description("Show policy, evidence, and integration status").action(async () => print(await statusCommand(cwd)));

  program.command("approve <target>")
    .description("Approve a protected path for the current repository state")
    .requiredOption("--reason <reason>", "human-readable justification")
    .action(async (target: string, options: { reason: string }) => print(await approveCommand(cwd, target, options.reason)));

  program.command("approvals").description("List recorded approvals").option("--json", "emit JSON")
    .action(async (options: { json?: boolean }) => print(await approvalsCommand(cwd, options.json)));

  const approval = program.command("approval").description("Manage an approval");
  approval.command("revoke <id>").description("Revoke an approval").action(async (id: string) => print(await revokeApprovalCommand(cwd, id)));

  program.command("test-rule <kind> <value>")
    .description("Test a command or path without performing it")
    .action(async (kind: string, value: string) => {
      if (kind !== "command" && kind !== "path") throw new InvalidArgumentError("kind must be command or path");
      finish(await testRuleCommand(cwd, kind, value));
    });

  program.command("guard")
    .description("Check and, when allowed, execute a command")
    .option("--json", "emit machine-readable JSON")
    .option("--check-only", "evaluate without executing")
    .argument("[command...]", "command and arguments")
    .allowUnknownOption(true)
    .action(async (argv: string[], options: { json?: boolean; checkOnly?: boolean }) => finish(await guardCommand(cwd, argv, { ...options, announce: print })));

  program.command("guard-path <path> <operation>")
    .description("Check a file operation against protected paths")
    .option("--json", "emit machine-readable JSON")
    .action(async (target: string, operation: string, options: { json?: boolean }) => finish(await guardPathCommand(cwd, target, operation, options.json)));

  program.command("run")
    .description("Execute a command and record verifiable evidence")
    .argument("[command...]", "command and arguments")
    .allowUnknownOption(true)
    .action(async (argv: string[]) => finish(await runCommand(cwd, argv)));

  const hooks = program.command("hooks").description("Manage Git hooks");
  hooks.command("install").description("Install pre-commit and pre-push hooks").action(async () => print(await installHooks(cwd)));
  hooks.command("remove").description("Remove RuleLock-managed hook blocks").action(async () => print(await removeHooks(cwd)));
  return program;
}

export async function run(argv = process.argv, cwd = process.cwd()): Promise<void> {
  try {
    const effective = argv.length <= 2 ? [...argv, "check"] : argv;
    await createProgram(cwd).parseAsync(effective);
  } catch (error) {
    if (error instanceof InvalidArgumentError) throw error;
    const exitCode = error instanceof ConfigError ? 3 : error instanceof GitError ? 4 : 3;
    process.stderr.write(`✗ ${(error as Error).message}\n`);
    process.exitCode = exitCode;
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) await run();
