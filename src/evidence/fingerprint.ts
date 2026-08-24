import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { changedFiles, currentCommit, git } from "../git/git.js";

export async function repositoryFingerprint(cwd: string): Promise<string> {
  const hash = createHash("sha256");
  hash.update(`head\0${currentCommit(cwd)}\0`);
  hash.update(git(cwd, ["diff", "--binary", "HEAD", "--", ".", ":(exclude).rulelock/**"], true));
  hash.update(git(cwd, ["diff", "--binary", "--cached", "HEAD", "--", ".", ":(exclude).rulelock/**"], true));
  for (const file of changedFiles(cwd).filter((item) => item.status === "added" && !item.path.startsWith(".rulelock/")).sort((a, b) => a.path.localeCompare(b.path))) {
    hash.update(`file\0${file.path}\0`);
    try { hash.update(await readFile(path.join(cwd, file.path))); } catch { hash.update("missing"); }
  }
  return hash.digest("hex");
}
