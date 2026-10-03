import { DEMO_AFTERCARE_TENANT_SLUG } from "@/lib/aftercare/demo-tenant";

/**
 * Public hostname label for the one shared demonstration.
 * It is not a ClinicSite.slug. `demodental` stays the historical site slug
 * so existing patient links keep resolving.
 */
export const SHARED_DEMO_HOSTNAME_LABEL = "demo";

export const SHARED_DEMO_PUBLIC_ORIGIN = "https://demo.riveraftercare.com.au";

/**
 * Maps only the designated shared-demo hostname onto the existing site slug.
 * Any other label, including unknown subdomains, returns null.
 */
export function sharedDemoSiteSlugForHostname(label: string): string | null {
  if (label !== SHARED_DEMO_HOSTNAME_LABEL) {
    return null;
  }
  return DEMO_AFTERCARE_TENANT_SLUG;
}

export function isSharedDemoHostnameLabel(label: string): boolean {
  return label === SHARED_DEMO_HOSTNAME_LABEL;
}

/**
 * Hostname label used when publishing a ClinicSite slug.
 * The shared demo keeps its internal slug and publishes on the preferred label.
 * Every other site publishes on its own slug.
 */
export function publicHostnameLabelForSiteSlug(siteSlug: string): string {
  if (siteSlug === DEMO_AFTERCARE_TENANT_SLUG) {
    return SHARED_DEMO_HOSTNAME_LABEL;
  }
  return siteSlug;
}

/**
 * Canonical host for one request host.
 * The historical shared-demo hostname and the preferred hostname share one
 * canonical. Every other host is unchanged. This does not redirect.
 */
export function canonicalPublicHost(
  hostHeader: string,
  rootDomain: string
): string {
  const trimmed = hostHeader.trim();
  const root = rootDomain.trim().toLowerCase();
  if (!trimmed || !root) {
    return trimmed;
  }

  const lower = trimmed.toLowerCase();
  const legacyHost = `${DEMO_AFTERCARE_TENANT_SLUG}.${root}`;
  if (lower === legacyHost) {
    return `${SHARED_DEMO_HOSTNAME_LABEL}.${root}`;
  }
  if (lower.startsWith(`${legacyHost}:`)) {
    return `${SHARED_DEMO_HOSTNAME_LABEL}.${root}${trimmed.slice(legacyHost.length)}`;
  }
  return trimmed;
}
