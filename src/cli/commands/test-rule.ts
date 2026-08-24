import { evaluateCommand } from "../../commands/matcher.js";
import { tokenizeCommand } from "../../commands/parser.js";
import { loadConfig } from "../../config/loader.js";
import { currentBranch } from "../../git/git.js";
import { renderDecision } from "../../output/terminal.js";
import { matchingPattern } from "../../utils/match.js";

export async function testRuleCommand(cwd: string, kind: "command" | "path", value: string): Promise<{ output: string; exitCode: number }> {
  const config = await loadConfig(cwd);
  if (kind === "command") {
    const decision = evaluateCommand(config, tokenizeCommand(value), currentBranch(cwd));
    return { output: renderDecision(decision.status, decision.violations), exitCode: decision.status === "blocked" && config.mode === "block" ? 1 : 0 };
  }
  const matched = matchingPattern(value, config.protected_paths);
  return matched
    ? { output: `BLOCKED\n\nRule:\nprotected_paths\n\nMatched pattern:\n${matched}`, exitCode: config.mode === "block" ? 1 : 0 }
    : { output: "ALLOWED", exitCode: 0 };
}
