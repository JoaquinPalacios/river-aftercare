export const E2E_PORT = 4173;

export const DEMO_TENANT_SLUG = "demodental";
/** Preferred public hostname label for the shared demo. Not the site slug. */
export const SHARED_DEMO_PUBLIC_LABEL = "demo";
export const HARBOR_TENANT_SLUG = "harbordental";
export const UNKNOWN_TENANT_SLUG = "unknown";

export function marketingOrigin(): string {
  return `http://localhost:${E2E_PORT}`;
}

export function staffOrigin(): string {
  return `http://app.localhost:${E2E_PORT}`;
}

export function tenantOrigin(slug: string): string {
  return `http://${slug}.localhost:${E2E_PORT}`;
}

export function tenantUrl(slug: string, pathname = "/"): string {
  const normalized = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `${tenantOrigin(slug)}${normalized}`;
}

export function staffUrl(pathname = "/"): string {
  const normalized = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `${staffOrigin()}${normalized}`;
}

export function marketingUrl(pathname = "/"): string {
  const normalized = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `${marketingOrigin()}${normalized}`;
}
