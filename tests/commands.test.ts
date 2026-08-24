import { describe, expect, it } from "vitest";
import { evaluateCommand } from "../src/commands/matcher.js";
import { tokenizeCommand } from "../src/commands/parser.js";
import { safeConfig } from "../src/config/schema.js";

describe("command policy", () => {
  it.each([
    [["git", "push", "origin", "main"], "PUSH_PROTECTED_BRANCH"],
    [["git", "push", "origin", "HEAD:main"], "PUSH_PROTECTED_BRANCH"],
    [["git", "push", "-f", "origin", "feature"], "GIT_FORCE_PUSH"],
    [["git", "push", "--force", "origin", "feature"], "GIT_FORCE_PUSH"],
    [["git", "reset", "--hard", "HEAD~1"], "GIT_HARD_RESET"],
    [["rm", "-r", "-f", "build"], "DESTRUCTIVE_DELETE"],
  ])("blocks %j", (argv, rule) => {
    const result = evaluateCommand(safeConfig, argv, "feature/demo");
    expect(result.status).toBe("blocked");
    expect(result.violations.some((item) => item.ruleId === rule)).toBe(true);
  });

  it.each([
    ["git status"],
    ["git checkout main"],
    ["git push origin feature/demo"],
    ["rm build.txt"],
  ])("allows %s", (input) => {
    expect(evaluateCommand(safeConfig, tokenizeCommand(input), "feature/demo").status).toBe("allowed");
  });

  it("matches configured command prefixes with quoted tokens", () => {
    const config = { ...safeConfig, blocked_commands: ['tool deploy "production west"'] };
    const result = evaluateCommand(config, ["tool", "deploy", "production west", "--confirm"], "feature/demo");
    expect(result.violations[0]?.ruleId).toBe('BLOCKED_COMMAND:tool deploy "production west"');
  });

  it("does not enforce hidden blocked-command policy", () => {
    const config = { ...safeConfig, blocked_commands: [] };
    expect(evaluateCommand(config, ["rm", "-rf", "build"], "feature/demo").status).toBe("allowed");
    expect(evaluateCommand(config, ["git", "push", "-f", "origin", "feature"], "feature/demo").status).toBe("allowed");
  });

  it("uses one built-in violation for semantic aliases", () => {
    const result = evaluateCommand(safeConfig, ["sudo", "rm", "-r", "-f", "build"], "feature/demo");
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]?.ruleId).toBe("DESTRUCTIVE_DELETE");
  });
});
