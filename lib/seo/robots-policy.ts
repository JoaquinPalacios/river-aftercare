export const INDEXABLE_ROBOTS = {
  index: true,
  follow: true,
} as const;

export const PRIVATE_ROBOTS = {
  index: false,
  follow: false,
} as const;

/** Launch policy: tenant aftercare is shareable but not a search-acquisition surface. */
export const TENANT_LAUNCH_ROBOTS = {
  index: false,
  follow: true,
} as const;

/**
 * Pre-approval robots for Privacy and Terms. Owner approval on 28 November 2026
 * moved those routes to `INDEXABLE_ROBOTS`. This constant remains the explicit
 * noindex policy if a later decision withdraws that approval.
 */
export const DRAFT_LEGAL_ROBOTS = {
  index: false,
  follow: true,
} as const;

export const ROBOTS_ALLOW_PUBLIC = [
  "/",
  "/pricing",
  "/contact",
  "/about",
  "/privacy",
  "/terms",
  "/clinics",
  "/dental",
  "/physiotherapy",
  "/chiropractic",
  "/cosmetic-clinics",
  "/llms.txt",
] as const;

export const ROBOTS_DISALLOW_INTERNAL = [
  "/_marketing",
  "/_sites",
  "/login",
  "/register",
  "/verify-registration",
  "/forgot-password",
  "/reset-password",
  "/accept-invitation",
  "/confirm-email-change",
  "/account",
  "/dashboard",
  "/guides",
  "/practice",
  "/operator",
  // Retired chairside URLs. Disallowed so old links are not advertised as crawl targets.
  "/sessions",
  "/session",
  "/display",
  "/api",
] as const;
