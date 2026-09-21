import { readErrorTrackingRelease } from "./error-tracking-runtime";

type Env = Record<string, string | undefined>;

function readOptional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function shouldUploadSentrySourceMaps(env: Env = process.env): boolean {
  if (env.VITEST || env.NODE_ENV === "test") {
    return false;
  }

  return Boolean(
    readOptional(env.SENTRY_AUTH_TOKEN) &&
    readOptional(env.SENTRY_ORG) &&
    readOptional(env.SENTRY_PROJECT)
  );
}

export function createSentryBuildOptions(env: Env = process.env) {
  const upload = shouldUploadSentrySourceMaps(env);
  const org = readOptional(env.SENTRY_ORG);
  const project = readOptional(env.SENTRY_PROJECT);
  const authToken = readOptional(env.SENTRY_AUTH_TOKEN);
  const release = readErrorTrackingRelease(env);

  return {
    ...(org ? { org } : {}),
    ...(project ? { project } : {}),
    ...(authToken ? { authToken } : {}),
    silent: true,
    telemetry: false,
    sourcemaps: {
      disable: !upload,
    },
    release: {
      ...(release ? { name: release } : {}),
      create: upload,
      finalize: upload,
    },
    bundleSizeOptimizations: {
      excludeDebugStatements: true,
      excludeTracing: true,
      excludeReplayShadowDom: true,
      excludeReplayIframe: true,
      excludeReplayWorker: true,
    },
    routeManifestInjection: false as const,
    errorHandler() {
      // Source-map upload or Sentry CLI failure must never fail the app build.
    },
  };
}
