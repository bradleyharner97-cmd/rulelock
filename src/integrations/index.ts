import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { RULELOCK_END, RULELOCK_START, rules } from "./generic.js";

export type AgentName = "codex" | "claude" | "cursor" | "generic";

export interface IntegrationStatus {
  id: AgentName;
  installed: boolean;
  path: string;
  enforcement: "instructions";
}

export interface InstallResult extends IntegrationStatus { changed: boolean }

export interface AgentIntegration {
  id: AgentName;
  path: string;
  content: string;
  detect(cwd: string): Promise<boolean>;
  install(cwd: string): Promise<InstallResult>;
  status(cwd: string): Promise<IntegrationStatus>;
}

async function exists(file: string): Promise<boolean> { try { await access(file); return true; } catch { return false; } }

function integration(id: AgentName, relative: string, content = rules): AgentIntegration {
  const detect = async (cwd: string): Promise<boolean> => {
    try { return (await readFile(path.join(cwd, relative), "utf8")).includes(RULELOCK_START); }
    catch { return false; }
  };
  return {
    id, path: relative, content, detect,
    async install(cwd) {
      const file = path.join(cwd, relative);
      const installed = await detect(cwd);
      if (installed) return { id, installed: true, changed: false, path: relative, enforcement: "instructions" };
      const current = await exists(file) ? await readFile(file, "utf8") : "";
      const next = current.trim() ? `${current.trimEnd()}\n\n${content}\n` : `${content}\n`;
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, next);
      return { id, installed: true, changed: true, path: relative, enforcement: "instructions" };
    },
    async status(cwd) { return { id, installed: await detect(cwd), path: relative, enforcement: "instructions" }; },
  };
}

const cursorContent = `---\ndescription: Enforce repository policy with RuleLock\nalwaysApply: true\n---\n\n${rules}`;

const integrations: Record<AgentName, AgentIntegration> = {
  codex: integration("codex", "AGENTS.md"),
  claude: integration("claude", "CLAUDE.md"),
  cursor: integration("cursor", ".cursor/rules/rulelock.mdc", cursorContent),
  generic: integration("generic", ".rulelock/AGENT.md"),
};

export function integrationFor(name: AgentName): AgentIntegration { return integrations[name]; }

export async function installedIntegrations(cwd: string): Promise<IntegrationStatus[]> {
  return Promise.all(Object.values(integrations).map((item) => item.status(cwd)));
}

export { RULELOCK_END, RULELOCK_START };
