import { build } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * The Vercel Node builder traces `api/*.js` without Next's bundler.
 * It does not resolve the `@/` path alias, and it does not select the
 * `react-server` export of `server-only` (that export is the empty module;
 * the default export throws). This bundle is the private schedule function
 * only. Node packages stay external so Prisma and `@vercel/schedules` are
 * traced as normal dependencies. `server-only` becomes an empty module here
 * and nowhere else.
 */
await build({
  absWorkingDir: root,
  entryPoints: [
    path.join(root, "lib/schedules/registration-intents-cleanup.ts"),
  ],
  outfile: path.join(root, "api/registration-intents-cleanup.js"),
  bundle: true,
  platform: "node",
  format: "esm",
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
