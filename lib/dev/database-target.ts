const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);

/**
 * Local means a loopback database and a process that is not a Vercel
 * production or preview deployment. Remote hosts, including Neon, are not local.
 */
export function isLocalDevelopmentDatabase(
  databaseUrl: string | undefined,
  vercelEnv: string | undefined = process.env.VERCEL_ENV
): boolean {
  const value = databaseUrl?.trim() ?? "";
  if (!value) {
    return false;
  }
  if (vercelEnv === "production" || vercelEnv === "preview") {
    return false;
  }
  try {
    const hostname = new URL(value).hostname
      .replace(/^\[|\]$/g, "")
      .toLowerCase();
    return LOOPBACK_HOSTS.has(hostname) || hostname.endsWith(".localhost");
  } catch {
    return false;
  }
}
