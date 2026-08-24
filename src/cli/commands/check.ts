import { loadConfig } from "../../config/loader.js";
import { evaluateRepository } from "../../engine/engine.js";
import { renderJson } from "../../output/json.js";
import { renderCheck } from "../../output/terminal.js";

export async function checkCommand(cwd: string, json = false, ci = false): Promise<{ output: string; exitCode: number }> {
  const config = await loadConfig(cwd);
  const result = await evaluateRepository(cwd, config, { ci });
  return { output: json ? renderJson(result) : renderCheck(result), exitCode: result.status === "blocked" ? 1 : 0 };
}
