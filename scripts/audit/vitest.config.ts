import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

/**
 * Audit-only runner. Not included in `pnpm test`.
 * Refuses to be pointed at a non-local database by the test itself.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("../../", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    setupFiles: ["scripts/audit/setup.ts"],
    include: ["scripts/audit/post-multilocation-query-baseline.test.ts"],
    fileParallelism: false,
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
