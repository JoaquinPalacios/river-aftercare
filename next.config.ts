import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

import { createSentryBuildOptions } from "./lib/observability/sentry-build-options";

const nextConfig: NextConfig = {
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
  // Keep jsdom on the 26.x CJS line: 27+ require()s ESM-only
  // html-encoding-sniffer → @exodus/bytes, which Vercel's Node runtime
  // rejects with ERR_REQUIRE_ESM even on Node 24.
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
