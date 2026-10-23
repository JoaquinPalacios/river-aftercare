import type { CmsDiscoveryExperience } from "@/lib/cms-discovery/types";

/**
 * Code-owned CMS discovery registry.
 *
 * Add a future announcement here. Do not build an operator editor for it.
 * Bump `version` when the copy or steps change enough that someone who
 * already dismissed the previous version should see it again. Completion,
 * dismissal, and skip are stored separately per experience id.
 *
 * Target people with `audience.roles` and `audience.requires`
 * (`productNav`, `canManagePractice`, `hasPatientSite`, `assistedOnboarding`).
 * An assisting operator in a clinic workspace matches those same rules.
 * Set `includeAssisting: false` to keep one experience off assisted sessions.
 * Steps can repeat `requires` so a clinic admin sees Practice and a clinic
 * staff member does not. An assisting operator follows the controls that
 * session already has, including Practice.
 *
 * Point `data-cms-discovery` at a real control. A tour stays on one page:
 * the workspace introduction highlights navigation and does not change
 * routes. A page tour sets `page` so Show me can open that route first,
 * then start the tour with no overlay left across the navigation.
 * Set `fallbackTarget` when a control can be absent while the page loads.
 * Set `showMeTourId` on an announcement to offer Show me. The tour itself
 * should use `offer: "manual"` unless it is the one welcome tour.
 *
 * The live list intentionally has no announcement. Shipping one would show a
 * card to every eligible clinic user.
 */
export const CMS_INTRODUCTION_ID = "cms-introduction";

export const CMS_PAGE_TOUR_IDS = {
  overview: "cms-page-overview",
  guides: "cms-page-guides",
  practice: "cms-page-practice",
  sites: "cms-page-sites",
  help: "cms-page-help",
} as const;

const clinicAudience = {
  roles: ["ADMIN", "STAFF"],
  requires: ["productNav"],
} as const;

export const CMS_DISCOVERY_EXPERIENCES: readonly CmsDiscoveryExperience[] = [
  {
    id: CMS_INTRODUCTION_ID,
    version: 2,
    kind: "tour",
    offer: "welcome",
    title: "Workspace tour",
    body: "A short tour of the navigation. It stays on this page.",
    audience: clinicAudience,
    steps: [
      {
        id: "overview",
        title: "Overview",
        body: "Overview is the clinic snapshot. Published and draft guide counts, and the setup items that still need attention, are on that page.",
        target: "nav-overview",
      },
      {
        id: "guides",
        title: "Guides",
        body: "Guides are the aftercare pages patients open. A clinic admin can create, edit, and publish them. Clinic staff can read them.",
        target: "nav-guides",
      },
      {
        id: "practice",
        title: "Practice",
        body: "Practice is where a clinic admin sets the name, branding, contact details, and emergency guidance patients see, and manages who can sign in.",
        target: "nav-practice",
        requires: ["canManagePractice"],
      },
      {
        id: "sites",
        title: "Sites & Locations",
        body: "Sites & Locations lists the clinic's public sites and the places under each one. Patients open a guide at the location where the clinic offers it.",
        target: "nav-sites",
      },
      {
        id: "patient-site",
        title: "Patient site",
        body: "View patient site opens the published clinic site in a new tab. Drafts stay off that site until a clinic admin publishes them.",
        target: "nav-patient-site",
        requires: ["hasPatientSite"],
      },
      {
        id: "help",
        title: "Help & feedback",
        body: "Help & feedback sends a problem, a question, or a suggestion to River Aftercare. Tours can be replayed from that page.",
        target: "nav-help",
      },
    ],
  },
  {
    id: CMS_PAGE_TOUR_IDS.overview,
    version: 1,
    kind: "tour",
    offer: "manual",
    title: "Overview",
    body: "Published guides, drafts, and the setup items on this page.",
    audience: clinicAudience,
    page: { path: "/dashboard", match: "exact" },
    steps: [
      {
        id: "summary",
        title: "Guide summary",
        body: "Published guides are live for patients. Drafts stay in the clinic until a clinic admin publishes them.",
        target: "guide-summary",
      },
      {
        id: "setup",
        title: "Clinic setup",
        body: "These items show what is already configured and what still needs attention before the clinic site is ready.",
        target: "overview-setup",
      },
      {
        id: "patient-site",
        title: "View patient site",
        body: "This opens the published clinic site in a new tab.",
        target: "overview-patient-site",
        requires: ["hasPatientSite"],
      },
    ],
  },
  {
    id: CMS_PAGE_TOUR_IDS.guides,
    version: 1,
    kind: "tour",
    offer: "manual",
    title: "Guides",
    body: "The clinic's aftercare guides.",
    audience: clinicAudience,
    page: { path: "/guides", match: "exact" },
    steps: [
      {
        id: "library",
        title: "Guide library",
        body: "This page lists the aftercare guides for the clinic. Patients open a published guide from the clinic site.",
        target: "guides-library",
      },
      {
        id: "search",
        title: "Search",
        body: "Search narrows the list by the guide title. Clear the search to see the full list again.",
        target: "guides-search",
      },
      {
        id: "create",
        title: "Create guide",
        body: "A clinic admin can start a guide from a template or as a custom guide. It stays a draft until it is published.",
        target: "guides-create",
        requires: ["canManagePractice"],
      },
      {
        id: "list",
        title: "Guide list",
        body: "Each guide shows its status and the actions available to you. Clinic staff can read guides. A clinic admin can open and update them.",
        target: "guides-list",
        fallbackTarget: "guides-library",
      },
    ],
  },
  {
    id: CMS_PAGE_TOUR_IDS.practice,
    version: 1,
    kind: "tour",
    offer: "manual",
    title: "Practice",
    body: "Identity, branding, contact, and the people who can sign in.",
    audience: {
      roles: ["ADMIN", "STAFF"],
      requires: ["productNav", "canManagePractice"],
    },
    page: { path: "/practice", match: "exact" },
    steps: [
      {
        id: "members",
        title: "Members",
        body: "Members are the people who can sign in to this clinic. A clinic admin can invite an administrator or a staff member.",
        target: "practice-members",
      },
      {
        id: "branding",
        title: "Branding",
        body: "Logo, colours, and typeface here are what patients see on the clinic site.",
        target: "practice-branding",
      },
      {
        id: "contact",
        title: "Contact",
        body: "Phone, contact link, and address are shown to patients with the clinic's aftercare guides.",
        target: "practice-contact",
      },
      {
        id: "emergency",
        title: "Emergency guidance",
        body: "Emergency instructions are the urgent-help text patients see on the clinic site. Save changes on this page to update them.",
        target: "practice-emergency",
      },
    ],
  },
  {
    id: CMS_PAGE_TOUR_IDS.sites,
    version: 1,
    kind: "tour",
    offer: "manual",
    title: "Sites & Locations",
    body: "Public sites and the places under them.",
    audience: clinicAudience,
    page: { path: "/practice/sites", match: "exact" },
    steps: [
      {
        id: "sites",
        title: "Sites and locations",
        body: "A site is a public address for the clinic. Locations are the places under that site.",
        target: "sites-locations",
      },
      {
        id: "capacity",
        title: "Capacity",
        body: "These counts are the clinic's active sites and locations against the number the current plan includes.",
        target: "sites-capacity",
      },
      {
        id: "list",
        title: "Site list",
        body: "Each site shows its address and locations. Manage site opens that site's places and services.",
        target: "sites-list",
        fallbackTarget: "sites-locations",
      },
    ],
  },
  {
    id: CMS_PAGE_TOUR_IDS.help,
    version: 1,
    kind: "tour",
    offer: "manual",
    title: "Help & feedback",
    body: "Send a message, or replay a tour.",
    audience: clinicAudience,
    page: { path: "/account/help", match: "exact" },
    steps: [
      {
        id: "replay",
        title: "Tours",
        body: "Replay the workspace tour from here, or open a tour of another clinic page. Page tours can also be started with Tour this page.",
        target: "help-replay",
      },
      {
        id: "categories",
        title: "Your message",
        body: "Choose a problem, a question, or a feature suggestion. The form for that choice opens underneath.",
        target: "help-categories",
      },
    ],
  },
];
