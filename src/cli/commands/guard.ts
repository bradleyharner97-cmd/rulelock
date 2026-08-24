import { spawn } from "node:child_process";
import { loadConfig } from "../../config/loader.js";
import { evaluateCommand } from "../../commands/matcher.js";
import { displayCommand } from "../../commands/parser.js";
import { currentBranch } from "../../git/git.js";
import { renderJson } from "../../output/json.js";
import { renderDecision } from "../../output/terminal.js";

export interface GuardOptions { json?: boolean; checkOnly?: boolean; announce?: (message: string) => void }

function execute(cwd: string, argv: string[]): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(argv[0]!, argv.slice(1), { cwd, stdio: "inherit", shell: false, windowsHide: true });
    child.on("error", reject);
    child.on("exit", (code, signal) => resolve(code ?? (signal ? 1 : 0)));
  });
}

function executeCaptured(cwd: string, argv: string[]): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(argv[0]!, argv.slice(1), { cwd, stdio: ["inherit", "pipe", "pipe"], shell: false, windowsHide: true });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", reject);
    child.on("exit", (code, signal) => resolve({ exitCode: code ?? (signal ? 1 : 0), stdout: Buffer.concat(stdout).toString("utf8"), stderr: Buffer.concat(stderr).toString("utf8") }));
  });
}

export async function guardCommand(cwd: string, argv: string[], options: GuardOptions = {}): Promise<{ output: string; exitCode: number }> {
  if (!argv.length) throw new Error("Provide a command after `rulelock guard --`.");
  const config = await loadConfig(cwd);
  const decision = evaluateCommand(config, argv, currentBranch(cwd));
  const output = options.json ? renderJson(decision) : renderDecision(decision.status, decision.violations);
  if (decision.status === "blocked" && config.mode === "block") return { output, exitCode: 1 };
  if (options.checkOnly) return { output, exitCode: 0 };
  if (options.json) {
    const execution = await executeCaptured(cwd, argv);
    return { output: renderJson({ ...decision, execution: { command: displayCommand(argv), ...execution } }), exitCode: execution.exitCode };
  }
  const prefix = options.json ? output : `${output}\n\nExecuting:\n${displayCommand(argv)}`;
  options.announce?.(prefix);
  return { output: options.announce ? "" : prefix, exitCode: await execute(cwd, argv) };
}
