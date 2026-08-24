import { loadApprovals } from "../../approvals/store.js";
import { loadConfig } from "../../config/loader.js";
import { evaluateRepository } from "../../engine/engine.js";
import { installedIntegrations } from "../../integrations/index.js";

export async function statusCommand(cwd: string): Promise<string> {
  const config = await loadConfig(cwd);
  const result = await evaluateRepository(cwd, config);
  const integrations = (await installedIntegrations(cwd)).filter((item) => item.installed).map((item) => item.id);
  const approvals = await loadApprovals(cwd);
  const checks = config.completion.require.map((command) => {
    const violation = result.violations.find((item) => item.target === command);
    return `${violation ? "✗" : "✓"} ${command}${violation ? ` — ${violation.ruleId.replace("REQUIRED_CHECK_", "").toLowerCase()}` : ""}`;
  });
  return `RULELOCK STATUS\n\nMode: ${config.mode}\nAgent: ${integrations.join(", ") || "not installed"}\nBranch: ${result.summary.branch}\nChanged files: ${result.summary.filesChanged}${config.limits.max_files_changed ? ` / ${config.limits.max_files_changed} allowed` : ""}\nApprovals recorded: ${approvals.approvals.length}\n\nRequired checks:\n${checks.join("\n") || "None configured"}\n\nStatus: ${result.status === "cleared" ? "CLEARED" : result.status === "warn" ? "WARN" : "NOT CLEARED"}`;
}
