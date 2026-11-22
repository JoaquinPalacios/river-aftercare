import { build } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * The tracked function entry is `api/registration-intents-cleanup.js`.
 * Vercel matches that path in the Git upload, before this script runs.
 * This bundle is the implementation that entry requires. It lives outside
 * `api/` so it is not a second function. The Node builder does not resolve
 * `@/` and does not select the empty `react-server` export of `server-only`
 * (the default export throws). Node packages stay external. `server-only`
 * becomes an empty module in this bundle only. CommonJS matches the
 * Node builder, which loads this project as CommonJS.
 */
await build({
  absWorkingDir: root,
  entryPoints: [
    path.join(root, "lib/schedules/registration-intents-cleanup.ts"),
  ],
  outfile: path.join(
    root,
    "lib/schedules/registration-intents-cleanup-bundle.js"
  ),
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node24",
  packages: "external",
  legalComments: "none",
  logOverride: {
    "ignored-bare-import": "silent",
  },
  plugins: [
    {
      name: "river-aftercare-schedule-bundle",
      setup(pluginBuild) {
        pluginBuild.onResolve({ filter: /^server-only$/ }, () => ({
          path: "server-only",
          namespace: "empty-server-only",
          sideEffects: false,
        }));
        pluginBuild.onLoad(
          { filter: /.*/, namespace: "empty-server-only" },
          () => ({
            contents: "export {};",
            loader: "js",
          })
        );
        pluginBuild.onResolve({ filter: /^@\// }, async (args) => {
          const resolved = await pluginBuild.resolve(
            `./${args.path.slice(2)}`,
            {
              resolveDir: root,
              kind: args.kind,
            }
          );
          if (resolved.errors.length > 0) {
            return resolved;
          }
          // Local modules are pure. Without this, importing one binding
          // keeps every top-level import in that file, including
          // `next/navigation`, which this private Node function cannot load.
          return { path: resolved.path, sideEffects: false };
        });
      },
    },
  ],
});
