import "dotenv/config";

import { existsSync, statSync } from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

const nodeMajor = Number(process.versions.node.split(".")[0]);
if (!Number.isInteger(nodeMajor) || nodeMajor < 24) {
  console.error(
    `Canonical template import requires Node.js 24. This process is Node ${process.versions.node}.`
  );
  process.exit(1);
}

if (!process.execArgv.includes("--experimental-transform-types")) {
  console.error(
    "Run pnpm canonical-template:import so Node can load the TypeScript lifecycle services."
  );
  process.exit(1);
}

const root = path.resolve(import.meta.dirname, "..");
const stubUrl = pathToFileURL(
  path.join(import.meta.dirname, "server-only-stub.mjs")
).href;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return { url: stubUrl, shortCircuit: true };
    }
    if (specifier.startsWith("@/")) {
      const relative = specifier.slice(2);
      const candidates = [
        relative,
        `${relative}.ts`,
        `${relative}.tsx`,
        `${relative}.mts`,
        `${relative}.mjs`,
        `${relative}.js`,
        `${relative}.json`,
      ];
      for (const candidate of candidates) {
        const absolute = path.join(root, candidate);
        if (existsSync(absolute) && statSync(absolute).isFile()) {
          return {
            url: pathToFileURL(absolute).href,
            shortCircuit: true,
          };
        }
      }
    }
    return nextResolve(specifier, context);
  },
});

const { runCanonicalTemplateImportCli } =
  await import("../lib/canonical-templates/import/cli.ts");

const code = await runCanonicalTemplateImportCli(process.argv.slice(2));
process.exitCode = code;
