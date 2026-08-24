export type RuleSeverity = "info" | "warning" | "block";
export type ChangeStatus = "added" | "modified" | "deleted" | "renamed";

export interface ChangedFile {
  path: string;
  oldPath?: string;
  status: ChangeStatus;
}

export interface RuleViolation {
  ruleId: string;
  ruleType: string;
  severity: RuleSeverity;
  message: string;
  target?: string;
  approvalRequired?: boolean;
  evidence?: {
    command?: string;
    file?: string;
    branch?: string;
    matched?: string;
  };
}

export interface CheckResult {
  status: "cleared" | "warn" | "blocked";
  summary: {
    branch: string;
    filesChanged: number;
    rules: number;
    violations: number;
    approvals: number;
  };
  violations: RuleViolation[];
}

export interface CommandDecision {
  status: "allowed" | "blocked";
  violations: RuleViolation[];
}

export interface Approval {
  id: string;
  scope: "path" | "dependency";
  target: string;
  reason: string;
  createdAt: string;
  gitHead: string;
  fingerprint: string;
}

export interface EvidenceRecord {
  command: string;
  argv: string[];
  exitCode: number;
  completedAt: string;
  gitHead: string;
  workingTreeHash: string;
}
