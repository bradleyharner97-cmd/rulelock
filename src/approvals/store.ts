import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { currentCommit } from "../git/git.js";
import { repositoryFingerprint } from "../evidence/fingerprint.js";
import type { Approval } from "../types.js";

interface ApprovalFile { version: 1; nextId: number; approvals: Approval[] }

const empty = (): ApprovalFile => ({ version: 1, nextId: 1, approvals: [] });

export async function loadApprovals(cwd: string): Promise<ApprovalFile> {
  try {
    const parsed = JSON.parse(await readFile(path.join(cwd, ".rulelock", "approvals.json"), "utf8")) as ApprovalFile;
    return parsed.version === 1 && Array.isArray(parsed.approvals) ? parsed : empty();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return empty();
    if (error instanceof SyntaxError) throw new Error("Invalid .rulelock/approvals.json");
    throw error;
  }
}

async function saveApprovals(cwd: string, file: ApprovalFile): Promise<void> {
  await mkdir(path.join(cwd, ".rulelock"), { recursive: true });
  await writeFile(path.join(cwd, ".rulelock", "approvals.json"), `${JSON.stringify(file, null, 2)}\n`);
}

export async function createApproval(cwd: string, target: string, reason: string, scope: Approval["scope"] = "path"): Promise<Approval> {
  const file = await loadApprovals(cwd);
  const approval: Approval = {
    id: `RL-A${String(file.nextId).padStart(3, "0")}`,
    scope,
    target,
    reason,
    createdAt: new Date().toISOString(),
    gitHead: currentCommit(cwd),
    fingerprint: await repositoryFingerprint(cwd),
  };
  file.nextId += 1;
  file.approvals.push(approval);
  await saveApprovals(cwd, file);
  return approval;
}

export async function revokeApproval(cwd: string, id: string): Promise<boolean> {
  const file = await loadApprovals(cwd);
  const remaining = file.approvals.filter((approval) => approval.id !== id);
  if (remaining.length === file.approvals.length) return false;
  file.approvals = remaining;
  await saveApprovals(cwd, file);
  return true;
}

export function activeApproval(approvals: Approval[], target: string, head: string, fingerprint: string, expireOnCommit: boolean): Approval | undefined {
  return approvals.find((approval) => approval.target === target && approval.fingerprint === fingerprint && (!expireOnCommit || approval.gitHead === head));
}
