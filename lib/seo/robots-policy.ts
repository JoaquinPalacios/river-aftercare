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
 * Privacy and Terms while they remain explicit drafts for legal review.
 * Links may still be followed; page-level robots metadata is the noindex control.
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
  "/llms.txt",
] as const;

export const ROBOTS_DISALLOW_INTERNAL = [
  "/_marketing",
  "/_sites",
  "/login",
  "/dashboard",
  "/guides",
  "/practice",
  "/operator",
  "/sessions",
  "/session",
  "/display",
  "/api",
] as const;
