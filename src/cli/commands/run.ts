import { spawn } from "node:child_process";
import { evaluateCommand } from "../../commands/matcher.js";
import { displayCommand } from "../../commands/parser.js";
import { loadConfig } from "../../config/loader.js";
import { repositoryFingerprint } from "../../evidence/fingerprint.js";
import { recordEvidence } from "../../evidence/store.js";
import { currentBranch, currentCommit } from "../../git/git.js";

function execute(cwd: string, argv: string[]): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(argv[0]!, argv.slice(1), { cwd, stdio: "inherit", shell: false, windowsHide: true });
    child.on("error", reject);
    child.on("exit", (code, signal) => resolve(code ?? (signal ? 1 : 0)));
  });
}

export async function runCommand(cwd: string, argv: string[]): Promise<{ output: string; exitCode: number }> {
  if (!argv.length) throw new Error("Provide a command after `rulelock run --`.");
  const config = await loadConfig(cwd);
  const decision = evaluateCommand(config, argv, currentBranch(cwd));
  if (decision.status === "blocked" && config.mode === "block") {
    return { output: `🔒 RULELOCK RUN BLOCKED\n\n${decision.violations.map((item) => item.message).join("\n")}`, exitCode: 1 };
  }
  const command = displayCommand(argv);
  const exitCode = await execute(cwd, argv);
  await recordEvidence(cwd, {
    command,
    argv,
    exitCode,
    completedAt: new Date().toISOString(),
    gitHead: currentCommit(cwd),
    workingTreeHash: await repositoryFingerprint(cwd),
  });
  return { output: `RULELOCK EVIDENCE\n\n${exitCode === 0 ? "✓ PASSED" : "✗ FAILED"}\nCommand: ${command}\nExit code: ${exitCode}\n\nEvidence recorded in .rulelock/evidence.json`, exitCode };
}
