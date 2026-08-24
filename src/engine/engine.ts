import path from "node:path";
import { activeApproval, loadApprovals } from "../approvals/store.js";
import type { RuleLockConfig } from "../config/schema.js";
import { latestEvidence, loadEvidence } from "../evidence/store.js";
import { repositoryFingerprint } from "../evidence/fingerprint.js";
import { changedFiles, currentBranch, currentCommit, fileAtHead, workingFile } from "../git/git.js";
import type { ChangedFile, CheckResult, RuleViolation } from "../types.js";
import { matchingPattern, matchesPath } from "../utils/match.js";

export const DEPENDENCY_FILES = [
  "package.json", "package-lock.json", "pnpm-lock.yaml", "yarn.lock", "bun.lock", "bun.lockb",
  "pyproject.toml", "requirements.txt", "go.mod", "Cargo.toml",
];

function dependencyMessage(cwd: string, file: ChangedFile): Promise<string> {
  if (path.basename(file.path) !== "package.json") return Promise.resolve(`${file.path} changed. Repository policy requires approval for dependency changes.`);
  return workingFile(cwd, file.path).then((current) => {
    const previous = fileAtHead(cwd, file.oldPath ?? file.path);
    try {
      const before = previous ? JSON.parse(previous) as Record<string, unknown> : {};
      const after = current ? JSON.parse(current) as Record<string, unknown> : {};
      const sections = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"];
      const changes: string[] = [];
      for (const section of sections) {
        const left = (before[section] ?? {}) as Record<string, string>;
        const right = (after[section] ?? {}) as Record<string, string>;
        for (const name of new Set([...Object.keys(left), ...Object.keys(right)])) {
          if (!(name in left)) changes.push(`added ${name}@${right[name]}`);
          else if (!(name in right)) changes.push(`removed ${name}`);
          else if (left[name] !== right[name]) changes.push(`changed ${name}: ${left[name]} → ${right[name]}`);
        }
      }
      const detail = changes.length ? ` (${changes.join(", ")})` : "";
      return `${file.path} changed${detail}. Repository policy requires approval for dependency changes.`;
    } catch { return `${file.path} changed. Repository policy requires approval for dependency changes.`; }
  });
}

function requiredRuleCount(config: RuleLockConfig): number {
  return config.protected_paths.length + config.protected_branches.length + config.blocked_commands.length
    + Number(config.dependency_changes.require_approval) + Number(config.limits.max_files_changed !== undefined)
    + config.completion.require.length;
}

export interface EvaluateOptions { ci?: boolean }

export async function evaluateRepository(cwd: string, config: RuleLockConfig, options: EvaluateOptions = {}): Promise<CheckResult> {
  const allFiles = changedFiles(cwd).filter((file) => !matchesPath(file.path, [".rulelock/**"]));
  const counted = allFiles.filter((file) => !matchesPath(file.path, config.limits.ignore));
  const approvalsFile = await loadApprovals(cwd);
  const evidenceFile = await loadEvidence(cwd);
  const head = currentCommit(cwd);
  const fingerprint = await repositoryFingerprint(cwd);
  const violations: RuleViolation[] = [];
  const usedApprovals = new Set<string>();

  for (const file of allFiles) {
    const candidates = [file.path, ...(file.oldPath ? [file.oldPath] : [])];
    const matched = candidates.map((candidate) => matchingPattern(candidate, config.protected_paths)).find(Boolean);
    if (!matched) continue;
    const approval = activeApproval(approvalsFile.approvals, file.path, head, fingerprint, config.approvals.expire_on_commit);
    if (approval) { usedApprovals.add(approval.id); continue; }
    violations.push({
      ruleId: "PROTECTED_PATH", ruleType: "protected_path", severity: "block", approvalRequired: true,
      target: file.path, message: `${file.path} is protected and requires explicit human approval.`,
      evidence: { file: file.path, matched },
    });
  }

  if (config.dependency_changes.require_approval) {
    for (const file of allFiles.filter((item) => DEPENDENCY_FILES.includes(path.basename(item.path)))) {
      const approval = activeApproval(approvalsFile.approvals, file.path, head, fingerprint, config.approvals.expire_on_commit);
      if (approval) { usedApprovals.add(approval.id); continue; }
      violations.push({
        ruleId: "DEPENDENCY_CHANGE", ruleType: "dependency_change", severity: "block", approvalRequired: true,
        target: file.path, message: await dependencyMessage(cwd, file), evidence: { file: file.path },
      });
    }
  }

  const maximum = config.limits.max_files_changed;
  if (maximum !== undefined && counted.length > maximum) {
    violations.push({
      ruleId: "MAX_FILES_CHANGED", ruleType: "change_limit", severity: "block", target: String(counted.length),
      message: `${counted.length} files changed; repository policy allows at most ${maximum}.`,
    });
  }

  for (const required of config.completion.require) {
    const record = latestEvidence(evidenceFile.records, required);
    if (!record) {
      if (options.ci) continue;
      violations.push({ ruleId: "REQUIRED_CHECK_MISSING", ruleType: "required_check", severity: "block", target: required, message: `Required check \`${required}\` has not been executed through RuleLock. Run: rulelock run -- ${required}` });
    } else if (record.exitCode !== 0) {
      violations.push({ ruleId: "REQUIRED_CHECK_FAILED", ruleType: "required_check", severity: "block", target: required, message: `Required check \`${required}\` failed with exit code ${record.exitCode}.` });
    } else if (record.gitHead !== head || record.workingTreeHash !== fingerprint) {
      violations.push({ ruleId: "REQUIRED_CHECK_STALE", ruleType: "required_check", severity: "block", target: required, message: `Required check \`${required}\` passed previously, but repository contents changed afterward. Run: rulelock run -- ${required}` });
    }
  }

  const blocked = violations.some((item) => item.severity === "block");
  return {
    status: blocked ? (config.mode === "warn" ? "warn" : "blocked") : "cleared",
    summary: {
      branch: currentBranch(cwd), filesChanged: allFiles.length, rules: requiredRuleCount(config),
      violations: violations.length, approvals: usedApprovals.size,
    },
    violations,
  };
}
