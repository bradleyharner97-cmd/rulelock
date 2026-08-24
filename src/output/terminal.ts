import type { CheckResult, RuleViolation } from "../types.js";

const TITLES: Record<string, string> = {
  PROTECTED_PATH: "PROTECTED PATH",
  DEPENDENCY_CHANGE: "DEPENDENCY CHANGE",
  MAX_FILES_CHANGED: "CHANGE LIMIT EXCEEDED",
  REQUIRED_CHECK_MISSING: "REQUIRED CHECK MISSING",
  REQUIRED_CHECK_FAILED: "REQUIRED CHECK FAILED",
  REQUIRED_CHECK_STALE: "REQUIRED CHECK STALE",
  GIT_FORCE_PUSH: "FORCE PUSH BLOCKED",
  GIT_HARD_RESET: "HARD RESET BLOCKED",
  DESTRUCTIVE_DELETE: "DESTRUCTIVE DELETE BLOCKED",
  PUSH_PROTECTED_BRANCH: "PROTECTED BRANCH",
};

export function renderViolation(item: RuleViolation): string {
  const heading = TITLES[item.ruleId] ?? (item.ruleId.startsWith("BLOCKED_COMMAND:") ? "BLOCKED COMMAND" : item.ruleId);
  const target = item.target ? `\n\nTarget:\n${item.target}` : "";
  const matched = item.evidence?.matched ? `\n\nMatched:\n${item.evidence.matched}` : "";
  const command = item.evidence?.command ? `\n\nCommand:\n${item.evidence.command}` : "";
  const approval = item.approvalRequired ? "\n\nApproval is required. Use `rulelock approve <path> --reason <reason>`." : "";
  return `🔒 ${heading}${target}${matched}${command}\n\n${item.message}${approval}\n\nRule:\n${item.ruleId}`;
}

export function renderCheck(result: CheckResult, heading = "RULELOCK CHECK"): string {
  const body = result.violations.length ? `${result.violations.map(renderViolation).join("\n\n────────────────────────\n\n")}\n\n` : "";
  const verdict = result.status === "cleared" ? "CLEARED" : result.status === "warn" ? "WARN" : "NOT CLEARED";
  return `${heading}\n\nBranch: ${result.summary.branch}\nFiles changed: ${result.summary.filesChanged}\nRules: ${result.summary.rules}\n\n${body}${result.summary.violations} blocking violation${result.summary.violations === 1 ? "" : "s"}\n${result.summary.approvals} active approval${result.summary.approvals === 1 ? "" : "s"}\n\nRESULT: ${verdict}`;
}

export function renderDecision(status: "allowed" | "blocked", violations: RuleViolation[]): string {
  if (status === "allowed") return "RULELOCK\n\n✓ ALLOWED";
  return `RULELOCK\n\n${violations.map(renderViolation).join("\n\n────────────────────────\n\n")}\n\nRESULT: BLOCKED`;
}
