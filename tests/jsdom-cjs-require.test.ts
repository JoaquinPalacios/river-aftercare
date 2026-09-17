import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

describe("jsdom CJS production loader", () => {
  it("does not depend on ESM-only @exodus/bytes via html-encoding-sniffer", () => {
    const rootRequire = createRequire(import.meta.url);
    const jsdomPkgPath = rootRequire.resolve("jsdom/package.json");
    const require = createRequire(jsdomPkgPath);
    const sniffer = require("html-encoding-sniffer/package.json") as {
      version: string;
      dependencies?: Record<string, string>;
    };
    expect(sniffer.dependencies?.["@exodus/bytes"]).toBeUndefined();
    expect(Number.parseInt(sniffer.version, 10)).toBeLessThan(6);

    const jsdomPkg = require("./package.json") as { version: string };
    expect(jsdomPkg.version.startsWith("26.")).toBe(true);
    expect(() => require("jsdom")).not.toThrow();
    expect(() => require("html-encoding-sniffer")).not.toThrow();
  });

  it("loads under Node with require(esm) disabled", () => {
    const result = spawnSync(
      process.execPath,
      [
        "--no-experimental-require-module",
        "-e",
        `
          const { JSDOM } = require("jsdom");
          const dom = new JSDOM(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"></svg>',
            { contentType: "image/svg+xml" }
          );
          if (dom.window.document.documentElement.localName !== "svg") {
            process.exit(2);
          }
        `,
      ],
      { encoding: "utf8", cwd: process.cwd() }
    );

    const output = `${result.stderr}\n${result.stdout}`;
    if (/bad option|is not allowed in NODE_OPTIONS/i.test(output)) {
      const require = createRequire(import.meta.url);
      expect(() => require("jsdom")).not.toThrow();
      return;
    }

    expect(output).not.toMatch(/ERR_REQUIRE_ESM/);
    expect(result.status, output).toBe(0);
  });
});
