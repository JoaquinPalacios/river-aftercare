import { isValidCareGuideSlug } from "@/lib/aftercare/slug-rules";
import { isReservedTenantSlug } from "@/lib/tenancy/reserved-slugs";

export type HostnameClassification =
  | { kind: "marketing" }
  | { kind: "staff" }
  | { kind: "tenant"; slug: string }
  | { kind: "reserved"; label: string }
  | { kind: "invalid" };

const HOSTNAME_PATTERN =
  /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)(?:\.(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?))*$/;

function stripPort(host: string): string | null {
  const lastColon = host.lastIndexOf(":");
  if (lastColon === -1) {
    return host;
  }

  const port = host.slice(lastColon + 1);
  if (!/^\d+$/.test(port)) {
    return null;
  }

  return host.slice(0, lastColon);
}

export function parseHostname(
  hostHeader: string | null | undefined,
  rootDomain: string
): HostnameClassification {
  if (!hostHeader) {
    return { kind: "invalid" };
  }

  const stripped = stripPort(hostHeader.trim().toLowerCase());
  if (!stripped || !HOSTNAME_PATTERN.test(stripped)) {
    return { kind: "invalid" };
  }

  const normalizedRoot = rootDomain.trim().toLowerCase();
  if (!normalizedRoot || !HOSTNAME_PATTERN.test(normalizedRoot)) {
    return { kind: "invalid" };
  }

  if (stripped === normalizedRoot) {
    return { kind: "marketing" };
  }

  const suffix = `.${normalizedRoot}`;
  if (!stripped.endsWith(suffix)) {
    return { kind: "invalid" };
  }

  const labels = stripped.slice(0, -suffix.length);
  if (!labels || labels.includes(".")) {
    return { kind: "invalid" };
  }

  if (labels === "app") {
    return { kind: "staff" };
  }

  if (isReservedTenantSlug(labels)) {
    return { kind: "reserved", label: labels };
  }

  if (!isValidCareGuideSlug(labels)) {
    return { kind: "invalid" };
  }

  return { kind: "tenant", slug: labels };
}
