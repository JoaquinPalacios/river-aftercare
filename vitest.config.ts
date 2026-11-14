import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const workspaceRoot = fileURLToPath(new URL("./", import.meta.url));

/**
 * Database tests import dotenv and share one Postgres database. Running those
 * files in parallel makes global row counts and shared catalogues race.
 * Database-independent tests stay parallel and must not inherit that coupling.
 */
function databaseTestFiles(): string[] {
  const testsRoot = path.join(workspaceRoot, "tests");
  const found: string[] = [];

  function walk(directory: string): void {
    for (const name of readdirSync(directory)) {
      const fullPath = path.join(directory, name);
      if (statSync(fullPath).isDirectory()) {
        walk(fullPath);
        continue;
      }
      if (!name.endsWith(".test.ts") && !name.endsWith(".test.tsx")) {
        continue;
      }
      const source = readFileSync(fullPath, "utf8");
      if (/import ["']dotenv\/config["']/.test(source)) {
        found.push(path.relative(workspaceRoot, fullPath));
      }
    }
  }

  walk(testsRoot);
  return found;
}

const databaseTests = databaseTestFiles();

export default defineConfig({
  resolve: {
    alias: {
      "@": workspaceRoot,
    },
  },
  test: {
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    exclude: ["e2e/**", "node_modules/**", ".next/**"],
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
          exclude: [...databaseTests, "e2e/**", "node_modules/**", ".next/**"],
        },
      },
      {
        extends: true,
        test: {
          name: "database",
          include: databaseTests,
          fileParallelism: false,
          maxWorkers: 1,
        },
      },
    ],
  },
});
