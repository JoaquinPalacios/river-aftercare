import { CanonicalTemplateImportError } from "@/lib/canonical-templates/import/errors";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);

export type CanonicalImportTargetKind = "local" | "remote";

export interface CanonicalImportTarget {
  kind: CanonicalImportTargetKind;
  /**
   * Operator-facing class. A non-local host is not split into production and
   * staging: Neon preview branches and any other remote host share this label.
   */
  label: "LOCAL" | "PRODUCTION / REMOTE";
}

function databaseHostname(databaseUrl: string): string {
  let hostname = "";
  try {
    hostname = new URL(databaseUrl).hostname;
  } catch {
    throw new CanonicalTemplateImportError(
      "DATABASE_URL is not a valid URL.",
      "usage"
    );
  }
  return hostname.replace(/^\[|\]$/g, "").toLowerCase();
}

function isLoopbackHost(hostname: string): boolean {
  return LOOPBACK_HOSTS.has(hostname) || hostname.endsWith(".localhost");
}

/**
 * Classifies the import target without connecting.
 *
 * Local means a loopback host and a process that is not Vercel production or
 * preview. Every other target is PRODUCTION / REMOTE. neon.tech is not treated
 * as proof of production, because Neon branches can be non-production, and it
 * is not treated as safe either. Remote apply stays refused until both
 * production flags are present.
 */
export function classifyCanonicalImportTarget(
  databaseUrl: string | undefined,
  vercelEnv: string | undefined = process.env.VERCEL_ENV
): CanonicalImportTarget {
  const value = databaseUrl?.trim() ?? "";
  if (!value) {
    throw new CanonicalTemplateImportError(
      "DATABASE_URL is required.",
      "usage"
    );
  }
  const hostname = databaseHostname(value);
  const deployed = vercelEnv === "production" || vercelEnv === "preview";
  if (deployed || !isLoopbackHost(hostname)) {
    return { kind: "remote", label: "PRODUCTION / REMOTE" };
  }
  return { kind: "local", label: "LOCAL" };
}

/**
 * Dry-run is always allowed. Local apply needs no extra flag.
 * Remote apply needs both --allow-production and --confirm-draft-import.
 * --apply alone never authorises a remote write.
 */
export function assertCanonicalImportApplyAllowed(input: {
  target: CanonicalImportTarget;
  apply: boolean;
  allowProduction: boolean;
  confirmDraftImport: boolean;
}): void {
  if (!input.apply || input.target.kind === "local") {
    return;
  }
  if (!input.allowProduction) {
    throw new CanonicalTemplateImportError(
      "Remote or production apply is refused. --apply alone does not write to this database. Pass --allow-production and --confirm-draft-import. Import still creates drafts only.",
      "usage"
    );
  }
  if (!input.confirmDraftImport) {
    throw new CanonicalTemplateImportError(
      "Remote or production apply requires --confirm-draft-import as well as --allow-production. Import still creates drafts only.",
      "usage"
    );
  }
}
