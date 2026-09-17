import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const ROOT_LAYOUTS = [
  "app/(marketing)/layout.tsx",
  "app/(staff)/layout.tsx",
  "app/(aftercare)/layout.tsx",
] as const;

describe("Vercel Web Analytics", () => {
  it("loads the Next.js Analytics component from every root layout", () => {
    for (const path of ROOT_LAYOUTS) {
      const source = readFileSync(path, "utf8");
      expect(source, path).toContain(
        'import { Analytics } from "@vercel/analytics/next"'
      );
      expect(source, path).toContain("<Analytics />");
      expect(source, path).not.toMatch(/['"]use client['"]/);
    }
  });
});
