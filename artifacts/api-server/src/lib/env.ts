import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const originalEnvKeys = new Set(Object.keys(process.env));

function parseEnvLine(line: string): [string, string] | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;
  const normalized = trimmed.startsWith("export ") ? trimmed.slice("export ".length).trim() : trimmed;
  const equalsAt = normalized.indexOf("=");
  if (equalsAt <= 0) return null;
  const key = normalized.slice(0, equalsAt).trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return null;
  let value = normalized.slice(equalsAt + 1).trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  return [key, value];
}

function loadEnvFile(filePath: string, loadedKeys: Set<string>) {
  if (!existsSync(filePath)) return;
  const content = readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const parsed = parseEnvLine(line);
    if (!parsed) continue;
    const [key, value] = parsed;
    if (originalEnvKeys.has(key)) continue;
    process.env[key] = value;
    loadedKeys.add(key);
  }
}

function findRepoRoot(startAt: string): string {
  let current = path.resolve(startAt);
  for (;;) {
    if (existsSync(path.join(current, "pnpm-workspace.yaml"))) return current;
    const parent = path.dirname(current);
    if (parent === current) return path.resolve(startAt, "..", "..");
    current = parent;
  }
}

export function loadLocalEnv() {
  const cwd = process.cwd();
  const repoRoot = findRepoRoot(cwd);
  const apiRoot = path.join(repoRoot, "artifacts", "api-server");
  const loadedKeys = new Set<string>();
  for (const filePath of [
    path.join(repoRoot, ".env"),
    path.join(repoRoot, ".env.local"),
    path.join(apiRoot, ".env"),
    path.join(apiRoot, ".env.local"),
    path.join(cwd, ".env"),
    path.join(cwd, ".env.local"),
  ]) {
    loadEnvFile(filePath, loadedKeys);
  }
}
