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
 * Point `data-cms-discovery` at a real control. Set `path` when that control
 * lives on another CMS route. Set `fallbackTarget` to the nav row so a missing
 * or still-loading target does not block the explanation.
 * Set `showMeTourId` on an announcement to offer Show me. The tour itself
 * should use `offer: "manual"` unless it is the one welcome tour.
 *
 * The live list intentionally has no announcement. Shipping one would show a
 * card to every eligible clinic user.
 */
export const CMS_INTRODUCTION_ID = "cms-introduction";

export const CMS_DISCOVERY_EXPERIENCES: readonly CmsDiscoveryExperience[] = [
  {
    id: CMS_INTRODUCTION_ID,
    version: 1,
    kind: "tour",
    offer: "welcome",
    title: "Welcome to River Aftercare",
    body: "A short tour shows how this workspace is organised. You can replay it later from Help & feedback.",
    audience: {
      roles: ["ADMIN", "STAFF"],
      requires: ["productNav"],
    },
    steps: [
      {
        id: "overview",
        title: "Overview",
        body: "This is your clinic snapshot. Published and draft guides are counted here, along with the setup items that still need attention.",
        target: "guide-summary",
        fallbackTarget: "nav-overview",
        path: "/dashboard",
        pathMatch: "exact",
      },
      {
        id: "guides",
        title: "Guides",
        body: "Guides are the aftercare pages patients open. A clinic admin can create one from a template or as a custom guide, save the draft, and publish it when it should go live. Clinic staff can read guides.",
        target: "guides-library",
        fallbackTarget: "nav-guides",
        path: "/guides",
        pathMatch: "exact",
      },
      {
        id: "practice",
        title: "Practice",
        body: "Practice settings cover the name, branding, contact details, and emergency guidance patients see, plus the people who can sign in.",
        target: "practice-settings",
        fallbackTarget: "nav-practice",
        path: "/practice",
        pathMatch: "exact",
        requires: ["canManagePractice"],
      },
      {
        id: "sites",
        title: "Sites & Locations",
        body: "A site is a public address for the clinic. Locations are the places under that site. Patients open a guide at the location where the clinic offers it.",
        target: "sites-locations",
        fallbackTarget: "nav-sites",
        path: "/practice/sites",
        pathMatch: "exact",
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
        body: "Send a problem, a question, or a feature suggestion to River Aftercare. Replay this tour from this page whenever you need it.",
        target: "help-replay",
        fallbackTarget: "nav-help",
        path: "/account/help",
        pathMatch: "exact",
      },
    ],
  },
];
