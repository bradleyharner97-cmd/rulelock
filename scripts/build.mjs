import { execFileSync } from "node:child_process";
import { chmodSync, rmSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const root = path.resolve(import.meta.dirname, "..");
rmSync(path.join(root, "dist"), { recursive: true, force: true });
execFileSync(process.execPath, [path.join(root, "node_modules", "typescript", "bin", "tsc"), "-p", path.join(root, "tsconfig.json")], { stdio: "inherit" });
chmodSync(path.join(root, "dist", "cli", "index.js"), 0o755);
