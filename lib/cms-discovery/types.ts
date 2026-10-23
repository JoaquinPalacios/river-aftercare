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
  clinicId: string;
  role: CmsDiscoveryRole;
  assisting: boolean;
  requirements: Record<CmsDiscoveryRequirement, boolean>;
};

export type CmsDiscoveryAudience = {
  roles?: readonly CmsDiscoveryRole[];
  /**
   * Assisting operators use the same role and requirement rules.
   * Set false to keep an experience off assisted clinic sessions.
   */
  includeAssisting?: boolean;
  requires?: readonly CmsDiscoveryRequirement[];
};

export type CmsDiscoveryPage = {
  /** In-app CMS path. An announcement opens this route before its tour starts. */
  path: string;
  match?: "exact" | "prefix";
};

export type CmsDiscoveryStep = {
  id: string;
  title: string;
  body: string;
  /** Value of `data-cms-discovery` on the element to highlight. */
  target: string;
  /** Used when the primary target is not on screen. */
  fallbackTarget?: string;
  /**
   * Kept so an older registry entry still type-checks. The tour does not
   * change routes from a step path. Set `page` on the tour instead.
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
  /**
   * Page this tour explains. Absent for the workspace introduction, which
   * highlights navigation and does not leave the current page. Show me opens
   * this path before starting the tour when the person is somewhere else.
   */
  page?: CmsDiscoveryPage;
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
  page: CmsDiscoveryPage | null;
  steps: CmsDiscoveryStep[];
};

export type ResolvedAnnouncement = {
  id: string;
  version: number;
  title: string;
  body: string;
  showMeTourId: string | null;
};
