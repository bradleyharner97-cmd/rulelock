import { access, chmod, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { gitDirectory } from "../../git/git.js";

const START = "# rulelock:start";
const END = "# rulelock:end";

const BLOCKS = {
  "pre-commit": `${START}\nnpx --no-install rulelock check --stage pre-commit || exit $?\n${END}`,
  "pre-push": `${START}\nremote_name="$1"\nwhile read -r local_ref local_sha remote_ref remote_sha; do\n  npx --no-install rulelock guard --check-only -- git push "$remote_name" "$remote_ref" || exit $?\ndone\nnpx --no-install rulelock check --stage pre-push || exit $?\n${END}`,
} as const;

async function exists(file: string): Promise<boolean> { try { await access(file); return true; } catch { return false; } }

async function installOne(directory: string, name: keyof typeof BLOCKS): Promise<"installed" | "present"> {
  const file = path.join(directory, name);
  const current = await exists(file) ? await readFile(file, "utf8") : "#!/bin/sh\n";
  if (current.includes(START)) return "present";
  await writeFile(file, `${current.trimEnd()}\n\n${BLOCKS[name]}\n`);
  await chmod(file, 0o755);
  return "installed";
}

export async function installHooks(cwd: string): Promise<string> {
  const directory = path.join(gitDirectory(cwd), "hooks");
  const commit = await installOne(directory, "pre-commit");
  const push = await installOne(directory, "pre-push");
  return `RULELOCK HOOKS\n\n${commit === "installed" ? "✓ Installed" : "✓ Already installed"}: pre-commit\n${push === "installed" ? "✓ Installed" : "✓ Already installed"}: pre-push`;
}

async function removeOne(directory: string, name: keyof typeof BLOCKS): Promise<boolean> {
  const file = path.join(directory, name);
  if (!await exists(file)) return false;
  const current = await readFile(file, "utf8");
  if (!current.includes(START)) return false;
  const cleaned = current.replace(new RegExp(`\\n?${START}[\\s\\S]*?${END}\\n?`, "u"), "\n").trim();
  if (cleaned && cleaned !== "#!/bin/sh") await writeFile(file, `${cleaned}\n`);
  else await unlink(file);
  return true;
}

export async function removeHooks(cwd: string): Promise<string> {
  const directory = path.join(gitDirectory(cwd), "hooks");
  const removed = [await removeOne(directory, "pre-commit"), await removeOne(directory, "pre-push")].filter(Boolean).length;
  return removed ? `✓ Removed RuleLock from ${removed} Git hook${removed === 1 ? "" : "s"}.` : "No RuleLock Git hooks were installed.";
}
