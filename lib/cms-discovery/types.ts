export const CMS_DISCOVERY_STORE_SCHEMA = 1 as const;

export const CMS_DISCOVERY_REQUIREMENTS = [
  "productNav",
  "canManagePractice",
  "hasPatientSite",
  "assistedOnboarding",
] as const;

export type CmsDiscoveryRequirement =
  (typeof CMS_DISCOVERY_REQUIREMENTS)[number];

export type CmsDiscoveryRole = "ADMIN" | "STAFF";

/** Clinic workspace facts used to decide who can see an experience. */
export type CmsDiscoveryContext = {
  userId: string;
  role: CmsDiscoveryRole;
  assisting: boolean;
  requirements: Record<CmsDiscoveryRequirement, boolean>;
};

export type CmsDiscoveryAudience = {
  roles?: readonly CmsDiscoveryRole[];
  /**
   * Assisting platform operators are excluded unless this is set.
   * They are not first-time clinic staff.
   */
  includeAssisting?: boolean;
  requires?: readonly CmsDiscoveryRequirement[];
};

export type CmsDiscoveryStep = {
  id: string;
  title: string;
  body: string;
  /** Value of `data-cms-discovery` on the element to highlight. */
  target: string;
  /** Used when the primary target is not on screen, usually the matching nav row. */
  fallbackTarget?: string;
  /**
   * In-app path. When the primary target is missing, the tour navigates here
   * with the existing staff router, or through a link click when the page has
   * unsaved edits so the leave confirmation still runs.
   */
  path?: string;
  pathMatch?: "exact" | "prefix";
  requires?: readonly CmsDiscoveryRequirement[];
};

export type CmsDiscoveryTour = {
  id: string;
  version: number;
  kind: "tour";
  /** `welcome` offers a start or dismiss card. `manual` starts only from replay or Show me. */
  offer: "welcome" | "manual";
  title: string;
  body: string;
  audience: CmsDiscoveryAudience;
  steps: readonly CmsDiscoveryStep[];
};

export type CmsDiscoveryAnnouncement = {
  id: string;
  version: number;
  kind: "announcement";
  title: string;
  body: string;
  audience: CmsDiscoveryAudience;
  /** Tour id started by Show me. Omit for a dismiss-only card. */
  showMeTourId?: string;
};

export type CmsDiscoveryExperience =
  CmsDiscoveryTour | CmsDiscoveryAnnouncement;

export type CmsDiscoveryStatus = "completed" | "dismissed" | "skipped";

export type CmsDiscoveryRecord = {
  version: number;
  status: CmsDiscoveryStatus;
};

export type CmsDiscoveryStore = {
  schema: typeof CMS_DISCOVERY_STORE_SCHEMA;
  experiences: Record<string, CmsDiscoveryRecord>;
};

export type ResolvedTour = {
  id: string;
  version: number;
  title: string;
  body: string;
  steps: CmsDiscoveryStep[];
};

export type ResolvedAnnouncement = {
  id: string;
  version: number;
  title: string;
  body: string;
  showMeTourId: string | null;
};
