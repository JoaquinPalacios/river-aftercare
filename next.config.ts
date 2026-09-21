import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

import { createSentryBuildOptions } from "./lib/observability/sentry-build-options";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["*.localhost"],
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
