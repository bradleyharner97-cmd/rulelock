import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { displayCommand, tokenizeCommand } from "../commands/parser.js";
import type { EvidenceRecord } from "../types.js";

interface EvidenceFile { version: 1; records: EvidenceRecord[] }

const empty = (): EvidenceFile => ({ version: 1, records: [] });

export async function loadEvidence(cwd: string): Promise<EvidenceFile> {
  try {
    const parsed = JSON.parse(await readFile(path.join(cwd, ".rulelock", "evidence.json"), "utf8")) as EvidenceFile;
    return parsed.version === 1 && Array.isArray(parsed.records) ? parsed : empty();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return empty();
    if (error instanceof SyntaxError) throw new Error("Invalid .rulelock/evidence.json");
    throw error;
  }
}

export async function recordEvidence(cwd: string, record: EvidenceRecord): Promise<void> {
  const file = await loadEvidence(cwd);
  file.records = [record, ...file.records.filter((item) => item.command !== record.command)].slice(0, 100);
  await mkdir(path.join(cwd, ".rulelock"), { recursive: true });
  await writeFile(path.join(cwd, ".rulelock", "evidence.json"), `${JSON.stringify(file, null, 2)}\n`);
}

export function latestEvidence(records: EvidenceRecord[], command: string): EvidenceRecord | undefined {
  const normalized = displayCommand(tokenizeCommand(command));
  return records.find((item) => displayCommand(tokenizeCommand(item.command)) === normalized);
}
