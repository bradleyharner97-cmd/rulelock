import { writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig, saveConfig } from "../src/config/loader.js";
import { safeConfig } from "../src/config/schema.js";
import { initCommand } from "../src/cli/commands/init.js";
import { fixtureRepo } from "./helpers.js";

describe("configuration", () => {
  it("initializes a strict, readable safe preset", async () => {
    const cwd = await fixtureRepo();
    await initCommand(cwd, { preset: "safe" });
    const config = await loadConfig(cwd);
    expect(config).toEqual(safeConfig);
    expect(config.mode).toBe("block");
  });

  it("does not overwrite existing policy without force", async () => {
    const cwd = await fixtureRepo();
    await initCommand(cwd, {});
    await writeFile(path.join(cwd, "rulelock.yml"), "version: 1\nmode: warn\n");
    expect(await initCommand(cwd, {})).toContain("Kept existing");
    expect((await loadConfig(cwd)).mode).toBe("warn");
  });

  it("rejects malformed YAML and unknown keys", async () => {
    const cwd = await fixtureRepo();
    await writeFile(path.join(cwd, "rulelock.yml"), "mode: [\n");
    await expect(loadConfig(cwd)).rejects.toBeInstanceOf(ConfigError);
    await writeFile(path.join(cwd, "rulelock.yml"), "version: 1\ntelemetry: true\n");
    await expect(loadConfig(cwd)).rejects.toBeInstanceOf(ConfigError);
  });

  it("round-trips validated YAML", async () => {
    const cwd = await fixtureRepo();
    await saveConfig(cwd, { ...safeConfig, mode: "warn" });
    expect((await loadConfig(cwd)).mode).toBe("warn");
  });
});
