import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { ChangedFile, ChangeStatus } from "../types.js";

export class GitError extends Error {}

export function git(cwd: string, args: string[], allowFailure = false): string {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", windowsHide: true });
  if (result.error) throw new GitError(`Could not run Git: ${result.error.message}`);
  if (result.status !== 0 && !allowFailure) throw new GitError((result.stderr || "Git command failed").trim());
  return result.stdout;
}

export function assertGitRepository(cwd: string): void {
  if (git(cwd, ["rev-parse", "--is-inside-work-tree"], true).trim() !== "true") {
    throw new GitError("RuleLock must run inside a Git repository.");
  }
}

export function currentCommit(cwd: string): string {
  assertGitRepository(cwd);
  return git(cwd, ["rev-parse", "HEAD"], true).trim() || "UNBORN";
}

export function currentBranch(cwd: string): string {
  assertGitRepository(cwd);
  return git(cwd, ["branch", "--show-current"], true).trim() || "DETACHED";
}

export function gitDirectory(cwd: string): string {
  return path.resolve(cwd, git(cwd, ["rev-parse", "--git-dir"]).trim());
}

function statusFor(code: string): ChangeStatus {
  if (code === "??" || code.includes("A")) return "added";
  if (code.includes("D")) return "deleted";
  if (code.includes("R")) return "renamed";
  return "modified";
}

export function changedFiles(cwd: string): ChangedFile[] {
  assertGitRepository(cwd);
  const fields = git(cwd, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]).split("\0");
  const files: ChangedFile[] = [];
  for (let index = 0; index < fields.length; index += 1) {
    const entry = fields[index];
    if (!entry) continue;
    const code = entry.slice(0, 2);
    const file = entry.slice(3);
    if (code.includes("R") || code.includes("C")) {
      const oldPath = fields[index + 1];
      index += 1;
      files.push({ path: file, ...(oldPath ? { oldPath } : {}), status: "renamed" });
    } else {
      files.push({ path: file, status: statusFor(code) });
    }
  }
  return files;
}

export function fileAtHead(cwd: string, relative: string): string | undefined {
  const result = spawnSync("git", ["show", `HEAD:${relative}`], { cwd, encoding: "utf8", windowsHide: true });
  return result.status === 0 ? result.stdout : undefined;
}

export async function workingFile(cwd: string, relative: string): Promise<string | undefined> {
  try { return await readFile(path.join(cwd, relative), "utf8"); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw error; }
}
