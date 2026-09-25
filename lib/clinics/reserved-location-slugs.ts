import { STAFF_PATH_PREFIXES } from "@/lib/tenancy/paths";

/**
 * First path segments that cannot be a location slug. Tenant hosts already
 * reject staff prefixes in the proxy, and `/print` is the guide print route.
 */
const LOCATION_PATH_SLUGS = [
  "print",
  "_sites",
  "_marketing",
  ...STAFF_PATH_PREFIXES.map((prefix) => prefix.slice(1).split("/")[0] ?? ""),
].filter((slug) => slug.length > 0);

const RESERVED_LOCATION_SLUGS = new Set<string>(LOCATION_PATH_SLUGS);

export function isReservedLocationSlug(slug: string): boolean {
  return RESERVED_LOCATION_SLUGS.has(slug);
}
