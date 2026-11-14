import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

import { createSentryBuildOptions } from "./lib/observability/sentry-build-options";

const nextConfig: NextConfig = {
  // Playwright sets this only for its own build and `next start`. A normal
  // `pnpm dev` / `pnpm build` keeps `.next` and does not inherit port 4173.
  distDir: process.env.CARE_GUIDE_E2E_BUILD === "1" ? ".next-e2e" : ".next",
  allowedDevOrigins: ["*.localhost"],
  // `next build` uses Turbopack. Sentry's webpack treeshake options do not
  // run there, so the client bundle kept debug and tracing code even with
  // tracesSampleRate 0. These defines are Sentry's manual tree-shake flags,
  // applied by Next.js compiler.define. They do not change server Sentry:
  // @sentry/nextjs stays in serverExternalPackages.
  compiler: {
    define: {
      __SENTRY_DEBUG__: false,
      __SENTRY_TRACING__: false,
      __RRWEB_EXCLUDE_IFRAME__: true,
      __RRWEB_EXCLUDE_SHADOW_DOM__: true,
      __SENTRY_EXCLUDE_REPLAY_WORKER__: true,
    },
  },
  // jsdom/dompurify stay external so they never enter client bundles.
  // Keep jsdom on 26.1.0. jsdom 31 is still CommonJS and require()s
  // ESM-only parse5@8 and @exodus/bytes. Vercel disables require(esm),
  // so that graph throws ERR_REQUIRE_ESM. Do not set NODE_OPTIONS.
  serverExternalPackages: [
    "resend",
    "jsdom",
    "dompurify",
    "@aws-sdk/client-s3",
    "@sentry/nextjs",
    "stripe",
  ],
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
};

export default withSentryConfig(nextConfig, createSentryBuildOptions());
