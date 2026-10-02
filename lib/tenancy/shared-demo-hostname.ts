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
