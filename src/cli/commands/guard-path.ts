import path from "node:path";
import { activeApproval, loadApprovals } from "../../approvals/store.js";
import { loadConfig } from "../../config/loader.js";
import { repositoryFingerprint } from "../../evidence/fingerprint.js";
import { currentCommit } from "../../git/git.js";
import { renderJson } from "../../output/json.js";
import { matchingPattern } from "../../utils/match.js";

export async function guardPathCommand(cwd: string, target: string, operation: string, json = false): Promise<{ output: string; exitCode: number }> {
  const config = await loadConfig(cwd);
  const relative = (path.isAbsolute(target) ? path.relative(cwd, target) : path.normalize(target)).split(path.sep).join("/");
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Guarded path must be inside the repository.");
  const matched = matchingPattern(relative, config.protected_paths);
  if (!matched) {
    const result = { status: "allowed", operation, target: relative, violations: [] };
    return { output: json ? renderJson(result) : `RULELOCK PATH GUARD\n\n✓ ALLOWED\n\n${operation}: ${relative}`, exitCode: 0 };
  }
  const approvals = await loadApprovals(cwd);
  const approved = activeApproval(approvals.approvals, relative, currentCommit(cwd), await repositoryFingerprint(cwd), config.approvals.expire_on_commit);
  if (approved) {
    const result = { status: "allowed", operation, target: relative, approval: approved.id, violations: [] };
    return { output: json ? renderJson(result) : `RULELOCK PATH GUARD\n\n✓ ALLOWED BY ${approved.id}\n\n${operation}: ${relative}`, exitCode: 0 };
  }
  const result = { status: "approval_required", operation, target: relative, violations: [{ ruleId: "PROTECTED_PATH", severity: "block", matched }] };
  return { output: json ? renderJson(result) : `🔒 APPROVAL REQUIRED\n\n${operation}: ${relative}\n\nMatched pattern:\n${matched}\n\nUse: rulelock approve ${relative} --reason <reason>`, exitCode: config.mode === "warn" ? 0 : 2 };
}
