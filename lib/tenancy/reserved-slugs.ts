export const RESERVED_TENANT_SLUGS = [
  "www",
  "app",
  "admin",
  "api",
  "login",
  "dashboard",
  "display",
  "sessions",
  "session",
  "auth",
  "static",
  "cdn",
  "assets",
  "mail",
  "status",
  "health",
  "support",
  "docs",
  "blog",
  "pricing",
  "contact",
  "about",
  "privacy",
  "terms",
  "operator",
  "localhost",
  "staging",
  "prod",
  "production",
  "test",
  "_sites",
  "sites",
] as const;

export type ReservedTenantSlug = (typeof RESERVED_TENANT_SLUGS)[number];

const RESERVED_SLUG_SET = new Set<string>(RESERVED_TENANT_SLUGS);

export function isReservedTenantSlug(label: string): boolean {
  return RESERVED_SLUG_SET.has(label);
}
