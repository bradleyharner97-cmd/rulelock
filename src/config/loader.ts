import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { ZodError } from "zod";
import { configSchema, type RuleLockConfig } from "./schema.js";

export class ConfigError extends Error {}

export async function loadConfig(cwd: string): Promise<RuleLockConfig> {
  const file = path.join(cwd, "rulelock.yml");
  try {
    return configSchema.parse(YAML.parse(await readFile(file, "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new ConfigError("rulelock.yml was not found. Run `rulelock init` first.");
    }
    if (error instanceof ZodError) {
      const details = error.issues.map((issue) => `${issue.path.join(".") || "config"}: ${issue.message}`).join("; ");
      throw new ConfigError(`Invalid rulelock.yml: ${details}`);
    }
    if (error instanceof YAML.YAMLParseError) throw new ConfigError(`Invalid YAML in rulelock.yml: ${error.message}`);
    throw error;
  }
}

export async function saveConfig(cwd: string, config: RuleLockConfig): Promise<void> {
  await writeFile(path.join(cwd, "rulelock.yml"), YAML.stringify(configSchema.parse(config), { lineWidth: 0 }));
}
