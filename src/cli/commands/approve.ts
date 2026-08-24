import path from "node:path";
import { createApproval, loadApprovals, revokeApproval } from "../../approvals/store.js";

function repositoryTarget(cwd: string, target: string): string {
  const relative = path.isAbsolute(target) ? path.relative(cwd, target) : path.normalize(target);
  if (!relative || relative === "." || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Approval target must be a file inside the repository.");
  }
  return relative.split(path.sep).join("/");
}

export async function approveCommand(cwd: string, target: string, reason: string): Promise<string> {
  if (!reason.trim()) throw new Error("Approval reason must not be empty.");
  const normalized = repositoryTarget(cwd, target);
  const approval = await createApproval(cwd, normalized, reason.trim());
  return `RULELOCK APPROVAL\n\n✓ ${approval.id}\nTarget: ${approval.target}\nReason: ${approval.reason}\nCommit: ${approval.gitHead}\n\nThis approval covers only the current repository state.`;
}

export async function approvalsCommand(cwd: string, json = false): Promise<string> {
  const file = await loadApprovals(cwd);
  if (json) return JSON.stringify(file, null, 2);
  if (!file.approvals.length) return "RULELOCK APPROVALS\n\nNo approvals recorded.";
  return `RULELOCK APPROVALS\n\n${file.approvals.map((item) => `${item.id}  ${item.target}\n  ${item.reason}\n  ${item.createdAt}`).join("\n\n")}`;
}

export async function revokeApprovalCommand(cwd: string, id: string): Promise<string> {
  if (!await revokeApproval(cwd, id)) throw new Error(`Approval ${id} was not found.`);
  return `✓ Revoked approval ${id}.`;
}
