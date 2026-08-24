import { z } from "zod";

export const configSchema = z.object({
  version: z.literal(1).default(1),
  mode: z.enum(["warn", "block"]).default("block"),
  protected_branches: z.array(z.string().min(1)).default(["main"]),
  protected_paths: z.array(z.string().min(1)).default([".env", ".env.*"]),
  blocked_commands: z.array(z.string().min(1)).default(["git push --force", "git reset --hard", "rm -rf"]),
  dependency_changes: z.object({
    require_approval: z.boolean().default(true),
  }).strict().default({ require_approval: true }),
  limits: z.object({
    max_files_changed: z.number().int().positive().optional(),
    ignore: z.array(z.string().min(1)).default([]),
  }).strict().default({ ignore: [] }),
  completion: z.object({
    require: z.array(z.string().min(1)).default([]),
    require_clean_rulelock_check: z.boolean().default(true),
  }).strict().default({ require: [], require_clean_rulelock_check: true }),
  approvals: z.object({
    expire_on_commit: z.boolean().default(true),
  }).strict().default({ expire_on_commit: true }),
}).strict();

export type RuleLockConfig = z.infer<typeof configSchema>;

export const safeConfig: RuleLockConfig = configSchema.parse({});

export const minimalConfig: RuleLockConfig = configSchema.parse({
  protected_paths: [],
  blocked_commands: ["git push --force", "git reset --hard"],
  dependency_changes: { require_approval: false },
});

export const strictConfig: RuleLockConfig = configSchema.parse({
  protected_paths: [".env", ".env.*", "secrets/**", "migrations/**"],
  dependency_changes: { require_approval: true },
  limits: { max_files_changed: 15, ignore: ["*.snap", "generated/**"] },
  completion: { require: ["npm test", "npm run typecheck", "npm run build"], require_clean_rulelock_check: true },
});
