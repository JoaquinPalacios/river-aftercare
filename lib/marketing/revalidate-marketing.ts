import { MARKETING_SEO_PATHS, type MarketingSeoPath } from "@/lib/seo/types";

/**
 * Filesystem route for a public marketing URL.
 *
 * The hostname proxy rewrites `/pricing` to `/_marketing/pricing` before
 * the page renders. `revalidatePath` tags the route file, so the
 * destination is the path that must be invalidated.
 */
export function marketingDeliveryPath(path: MarketingSeoPath): string {
  return path === "/" ? "/_marketing" : `/_marketing${path}`;
}

export const MARKETING_DELIVERY_PATHS: readonly string[] =
  MARKETING_SEO_PATHS.map(marketingDeliveryPath);

const PATIENT_OR_STAFF_PREFIXES = [
  "/_sites",
  "/login",
  "/practice",
  "/guides",
  "/account",
  "/dashboard",
  "/api",
] as const;

export function isPatientOrStaffRevalidatePath(path: string): boolean {
  if (path === "/") {
    return true;
  }
  return PATIENT_OR_STAFF_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`)
  );
}
