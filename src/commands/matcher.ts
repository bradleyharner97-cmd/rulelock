import type { RuleLockConfig } from "../config/schema.js";
import type { CommandDecision, RuleViolation } from "../types.js";
import { displayCommand, tokenizeCommand } from "./parser.js";

function canonical(token: string): string {
  return token.toLowerCase();
}

function containsSequence(argv: string[], pattern: string[]): boolean {
  if (pattern.length === 0 || argv.length < pattern.length) return false;
  const haystack = argv.map(canonical);
  const needle = pattern.map(canonical);
  return haystack.some((_, index) => needle.every((token, offset) => haystack[index + offset] === token));
}

function gitArguments(argv: string[]): string[] | undefined {
  const index = argv.findIndex((token) => canonical(token).replace(/\\/gu, "/").split("/").at(-1) === "git");
  return index < 0 ? undefined : argv.slice(index + 1);
}

function forcePush(args: string[]): boolean {
  return args[0] === "push" && args.slice(1).some((token) => token === "-f" || token === "--force" || token.startsWith("--force="));
}

function hardReset(args: string[]): boolean {
  return args[0] === "reset" && args.slice(1).includes("--hard");
}

function destructiveDelete(argv: string[]): boolean {
  const index = argv.findIndex((token) => canonical(token).replace(/\\/gu, "/").split("/").at(-1) === "rm");
  if (index < 0) return false;
  const flags = argv.slice(index + 1).filter((token) => token.startsWith("-")).join("");
  return flags.includes("r") && flags.includes("f");
}

function pushTargets(args: string[], currentBranch: string): string[] {
  if (args[0] !== "push") return [];
  const values = args.slice(1).filter((token) => !token.startsWith("-") && token !== "--");
  const refspecs = values.slice(1);
  if (refspecs.length === 0) return currentBranch === "DETACHED" ? [] : [currentBranch];
  return refspecs.map((refspec) => {
    const destination = refspec.includes(":") ? refspec.split(":").at(-1) ?? "" : refspec;
    return destination.replace(/^\+?/u, "").replace(/^refs\/heads\//u, "");
  });
}

function violation(ruleId: string, message: string, command: string, extra?: { branch?: string; matched?: string }): RuleViolation {
  return {
    ruleId,
    ruleType: ruleId === "PUSH_PROTECTED_BRANCH" ? "protected_branch" : "blocked_command",
    severity: "block",
    message,
    ...((extra?.branch ?? extra?.matched) ? { target: extra?.branch ?? extra?.matched } : {}),
    evidence: { command, ...(extra?.branch ? { branch: extra.branch } : {}), ...(extra?.matched ? { matched: extra.matched } : {}) },
  };
}

export function evaluateCommand(config: RuleLockConfig, argv: string[], currentBranch: string): CommandDecision {
  const command = displayCommand(argv);
  const violations: RuleViolation[] = [];
  const gitArgs = gitArguments(argv)?.map(canonical);
  const configuredPatterns = config.blocked_commands.map((item) => ({ source: item, argv: tokenizeCommand(item).map(canonical) }));
  const forcePushEnabled = configuredPatterns.some((item) => { const args = gitArguments(item.argv); return args ? forcePush(args) : false; });
  const hardResetEnabled = configuredPatterns.some((item) => { const args = gitArguments(item.argv); return args ? hardReset(args) : false; });
  const destructiveDeleteEnabled = configuredPatterns.some((item) => destructiveDelete(item.argv));
  if (gitArgs && forcePushEnabled && forcePush(gitArgs)) violations.push(violation("GIT_FORCE_PUSH", "Force pushes are prohibited by repository policy.", command));
  if (gitArgs && hardResetEnabled && hardReset(gitArgs)) violations.push(violation("GIT_HARD_RESET", "Hard resets are prohibited by repository policy.", command));
  if (destructiveDeleteEnabled && destructiveDelete(argv)) violations.push(violation("DESTRUCTIVE_DELETE", "Recursive forced deletion is prohibited by repository policy.", command));

  if (gitArgs) {
    const target = pushTargets(gitArgs, currentBranch).find((branch) => config.protected_branches.includes(branch));
    if (target) violations.push(violation("PUSH_PROTECTED_BRANCH", `Direct pushes to protected branch \`${target}\` are prohibited. Create a feature branch and open a PR instead.`, command, { branch: target }));
  }

  for (const { source: configured, argv: pattern } of configuredPatterns) {
    const coveredByBuiltIn = (gitArgs && forcePush(gitArgs) && forcePush(gitArguments(pattern) ?? []))
      || (gitArgs && hardReset(gitArgs) && hardReset(gitArguments(pattern) ?? []))
      || (destructiveDelete(argv) && destructiveDelete(pattern));
    if (containsSequence(argv, pattern) && !coveredByBuiltIn) {
      violations.push(violation(`BLOCKED_COMMAND:${configured}`, `Command matches blocked policy \`${configured}\`.`, command, { matched: configured }));
    }
  }
  return { status: violations.length ? "blocked" : "allowed", violations };
}
