import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import {
  PRODUCT_ATTRIBUTION,
  PRODUCT_MARKETING_ORIGIN,
  PRODUCT_NAME,
} from "@/lib/branding/product-name";

function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      walk(path, acc);
      continue;
    }
    if (/\.(ts|tsx|js|jsx|svg|css)$/.test(name)) {
      acc.push(path);
    }
  }
  return acc;
}

describe("product brand", () => {
  it("uses River Aftercare as the visible product name", () => {
    expect(PRODUCT_NAME).toBe("River Aftercare");
    expect(PRODUCT_ATTRIBUTION).toBe("Powered by River Aftercare");
    expect(PRODUCT_MARKETING_ORIGIN).toBe("https://riveraftercare.com.au");
  });

  it("does not hardcode Aftercare Guide in current runtime surfaces", () => {
    const files = [
      ...walk("app"),
      ...walk("lib"),
      ...walk("public/brand"),
      ...walk("public/favicons"),
    ];
    const hits = files.filter((file) =>
      readFileSync(file, "utf8").includes("Aftercare Guide")
    );
    expect(hits).toEqual([]);
  });
});
