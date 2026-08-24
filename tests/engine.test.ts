import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createApproval, revokeApproval } from "../src/approvals/store.js";
import { saveConfig } from "../src/config/loader.js";
import { safeConfig } from "../src/config/schema.js";
import { evaluateRepository } from "../src/engine/engine.js";
import { fixtureRepo, git } from "./helpers.js";

describe("repository policy", () => {
  it("blocks added, modified, deleted, and renamed protected paths", async () => {
    const cwd = await fixtureRepo();
    await mkdir(path.join(cwd, "migrations"));
    await writeFile(path.join(cwd, "migrations", "old.sql"), "select 1;\n");
    git(cwd, "add", ".");
    git(cwd, "commit", "-m", "migration");
    await writeFile(path.join(cwd, "migrations", "old.sql"), "select 2;\n");
    await writeFile(path.join(cwd, "migrations", "new.sql"), "select 3;\n");
    git(cwd, "mv", "migrations/old.sql", "migrations/renamed.sql");
    const config = { ...safeConfig, protected_paths: ["migrations/**"], dependency_changes: { require_approval: false } };
    const result = await evaluateRepository(cwd, config);
    expect(result.status).toBe("blocked");
    expect(result.violations.filter((item) => item.ruleId === "PROTECTED_PATH")).toHaveLength(2);
  });

  it("allows a normal source edit", async () => {
    const cwd = await fixtureRepo();
    await writeFile(path.join(cwd, "src.ts"), "export const value = 2;\n");
    const config = { ...safeConfig, protected_paths: ["migrations/**"], dependency_changes: { require_approval: false } };
    expect((await evaluateRepository(cwd, config)).status).toBe("cleared");
  });

  it("requires exact-state approval and supports revocation", async () => {
    const cwd = await fixtureRepo();
    await mkdir(path.join(cwd, "migrations"));
    await writeFile(path.join(cwd, "migrations", "001.sql"), "select 1;\n");
    const config = { ...safeConfig, protected_paths: ["migrations/**"], dependency_changes: { require_approval: false } };
    expect((await evaluateRepository(cwd, config)).status).toBe("blocked");
    const approval = await createApproval(cwd, "migrations/001.sql", "required fixture");
    expect((await evaluateRepository(cwd, config)).status).toBe("cleared");
    await writeFile(path.join(cwd, "migrations", "001.sql"), "select 2;\n");
    expect((await evaluateRepository(cwd, config)).status).toBe("blocked");
    const replacement = await createApproval(cwd, "migrations/001.sql", "updated fixture");
    expect((await evaluateRepository(cwd, config)).status).toBe("cleared");
    expect(await revokeApproval(cwd, replacement.id)).toBe(true);
    expect(await revokeApproval(cwd, approval.id)).toBe(true);
    expect((await evaluateRepository(cwd, config)).status).toBe("blocked");
  });

  it("reports package dependency detail and enforces approval", async () => {
    const cwd = await fixtureRepo();
    await writeFile(path.join(cwd, "package.json"), '{"name":"fixture","dependencies":{"picomatch":"4.0.3"}}\n');
    const result = await evaluateRepository(cwd, safeConfig);
    expect(result.violations[0]).toMatchObject({ ruleId: "DEPENDENCY_CHANGE", approvalRequired: true });
    expect(result.violations[0]?.message).toContain("added picomatch@4.0.3");
    await createApproval(cwd, "package.json", "needed dependency");
    expect((await evaluateRepository(cwd, safeConfig)).status).toBe("cleared");
  });

  it("enforces file-count limits with ignores", async () => {
    const cwd = await fixtureRepo();
    await writeFile(path.join(cwd, "a.ts"), "a\n");
    await writeFile(path.join(cwd, "b.ts"), "b\n");
    await writeFile(path.join(cwd, "ignored.snap"), "snapshot\n");
    const config = { ...safeConfig, dependency_changes: { require_approval: false }, limits: { max_files_changed: 1, ignore: ["*.snap"] } };
    expect((await evaluateRepository(cwd, config)).violations).toContainEqual(expect.objectContaining({ ruleId: "MAX_FILES_CHANGED" }));
  });

  it("honors warn mode without hiding findings", async () => {
    const cwd = await fixtureRepo();
    await writeFile(path.join(cwd, ".env"), "TOKEN=x\n");
    const result = await evaluateRepository(cwd, { ...safeConfig, mode: "warn" });
    expect(result.status).toBe("warn");
    expect(result.violations).toHaveLength(1);
  });
});
