import { integrationFor, type AgentName } from "../../integrations/index.js";

export async function installCommand(cwd: string, agent: AgentName): Promise<string> {
  const result = await integrationFor(agent).install(cwd);
  const action = result.changed ? "Installed" : "Already installed";
  return `RULELOCK INTEGRATION\n\n✓ ${action}: ${agent}\nFile: ${result.path}\nEnforcement: repository instructions\n\nThe RuleLock CLI is deterministic. Agent-side interception strength depends on capabilities exposed by the agent.`;
}
