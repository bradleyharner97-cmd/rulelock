import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { minimalConfig, safeConfig, strictConfig, type RuleLockConfig } from "../../config/schema.js";

export type Preset = "minimal" | "safe" | "strict";
export interface InitOptions { force?: boolean; preset?: Preset }

async function exists(file: string): Promise<boolean> { try { await access(file); return true; } catch { return false; } }

function presetConfig(name: Preset): RuleLockConfig {
  return { minimal: minimalConfig, safe: safeConfig, strict: strictConfig }[name];
}

export async function initCommand(cwd: string, options: InitOptions = {}): Promise<string> {
  const configFile = path.join(cwd, "rulelock.yml");
  const directory = path.join(cwd, ".rulelock");
  const preset = options.preset ?? "safe";
  const created: string[] = [];
  const kept: string[] = [];
  await mkdir(directory, { recursive: true });
  if (!options.force && await exists(configFile)) kept.push("rulelock.yml");
  else { await writeFile(configFile, YAML.stringify(presetConfig(preset), { lineWidth: 0 })); created.push("rulelock.yml"); }
  for (const [name, content] of [
    ["approvals.json", '{\n  "version": 1,\n  "nextId": 1,\n  "approvals": []\n}\n'],
    ["evidence.json", '{\n  "version": 1,\n  "records": []\n}\n'],
  ] as const) {
    const file = path.join(directory, name);
    if (!options.force && await exists(file)) kept.push(`.rulelock/${name}`);
    else { await writeFile(file, content); created.push(`.rulelock/${name}`); }
  }
  return `RULELOCK\n\n✓ Initialized with the ${preset} preset\n\nCreated:\n${created.map((file) => `- ${file}`).join("\n") || "- Nothing"}${kept.length ? `\n\nKept existing:\n${kept.map((file) => `- ${file}`).join("\n")}` : ""}\n\nNext:\n\nnpx rulelock install codex`;
}
