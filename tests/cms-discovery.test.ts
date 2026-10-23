import { describe, expect, it } from "vitest";

import { buildCmsDiscoveryContext } from "@/lib/cms-discovery/context";
import {
  cmsTourHandoffHref,
  discoveryPathMatches,
  isSafeDiscoveryHref,
  isSafeDiscoveryPath,
  suppressesAutomaticDiscovery,
} from "@/lib/cms-discovery/navigation";
import {
  keepTourCardOnScreen,
  placeTourCard,
  visibleLayoutSize,
} from "@/lib/cms-discovery/placement";
import {
  CMS_DISCOVERY_EXPERIENCES,
  CMS_INTRODUCTION_ID,
  CMS_PAGE_TOUR_IDS,
} from "@/lib/cms-discovery/registry";
import {
  isCmsDiscoverySettled,
  resolveCmsDiscovery,
} from "@/lib/cms-discovery/resolve";
import {
  cmsDiscoveryStorageKey,
  emptyCmsDiscoveryStore,
  parseCmsDiscoveryStore,
  readCmsDiscoveryStore,
  writeCmsDiscoveryRecord,
  type CmsDiscoverySubject,
} from "@/lib/cms-discovery/storage";
import type {
  CmsDiscoveryContext,
  CmsDiscoveryExperience,
  CmsDiscoveryStore,
} from "@/lib/cms-discovery/types";
import { cmsDiscoveryRegistryIssues } from "@/lib/cms-discovery/validate";

function context(
  overrides: {
    userId?: string;
    role?: CmsDiscoveryContext["role"];
    assisting?: boolean;
    requirements?: Partial<CmsDiscoveryContext["requirements"]>;
  } = {}
): CmsDiscoveryContext {
  return {
    userId: "user_ada",
    clinicId: "clinic_ada",
    role: "ADMIN",
    assisting: false,
    ...overrides,
    requirements: {
      productNav: true,
      canManagePractice: true,
      hasPatientSite: true,
      assistedOnboarding: false,
      ...overrides.requirements,
    },
  };
}

const sampleAnnouncement: CmsDiscoveryExperience = {
  id: "share-menu",
  version: 1,
  kind: "announcement",
  title: "Share a guide",
  body: "Copy the patient link from the guide list.",
  audience: { roles: ["ADMIN", "STAFF"], requires: ["productNav"] },
  showMeTourId: "share-menu-tour",
};

const sampleTour: CmsDiscoveryExperience = {
  id: "share-menu-tour",
  version: 1,
  kind: "tour",
  offer: "manual",
  title: "Share a guide",
  body: "The share menu is on the guide row.",
  audience: { roles: ["ADMIN", "STAFF"], requires: ["productNav"] },
  steps: [
    {
      id: "share",
      title: "Share",
      body: "Open the share menu on a guide.",
      target: "guide-share",
      fallbackTarget: "nav-guides",
      path: "/guides",
    },
  ],
};

describe("CMS discovery registry", () => {
  it("is a valid single welcome tour with no live announcement", () => {
    expect(cmsDiscoveryRegistryIssues(CMS_DISCOVERY_EXPERIENCES)).toEqual([]);
    expect(
      CMS_DISCOVERY_EXPERIENCES.filter(
        (experience) =>
          experience.kind === "tour" && experience.offer === "welcome"
      )
    ).toHaveLength(1);
    expect(
      CMS_DISCOVERY_EXPERIENCES.some(
        (experience) => experience.kind === "announcement"
      )
    ).toBe(false);
    const serialized = JSON.stringify(CMS_DISCOVERY_EXPERIENCES);
    expect(serialized).not.toContain("@");
    expect(serialized.toLowerCase()).not.toContain("patient name");
  });

  it("keeps four to six introduction steps for each clinic role", () => {
    const admin = resolveCmsDiscovery(
      CMS_DISCOVERY_EXPERIENCES,
      context(),
      emptyCmsDiscoveryStore()
    );
    const staff = resolveCmsDiscovery(
      CMS_DISCOVERY_EXPERIENCES,
      context({
        role: "STAFF",
        requirements: { canManagePractice: false, hasPatientSite: false },
      }),
      emptyCmsDiscoveryStore()
    );

    expect(admin.welcome?.steps.map((step) => step.id)).toEqual([
      "overview",
      "guides",
      "practice",
      "sites",
      "patient-site",
      "help",
    ]);
    expect(admin.welcome?.steps.map((step) => step.target)).toEqual([
      "nav-overview",
      "nav-guides",
      "nav-practice",
      "nav-sites",
      "nav-patient-site",
      "nav-help",
    ]);
    expect(admin.welcome?.steps.every((step) => !step.path)).toBe(true);
    expect(admin.welcome?.page).toBeNull();
    expect(staff.welcome?.steps.map((step) => step.id)).toEqual([
      "overview",
      "guides",
      "sites",
      "help",
    ]);
    expect(staff.tours[0]?.steps.some((step) => step.id === "practice")).toBe(
      false
    );
  });

  it("keeps page tours manual, on their own page, and independent of each other", () => {
    const admin = resolveCmsDiscovery(
      CMS_DISCOVERY_EXPERIENCES,
      context(),
      emptyCmsDiscoveryStore()
    );
    const staff = resolveCmsDiscovery(
      CMS_DISCOVERY_EXPERIENCES,
      context({
        role: "STAFF",
        requirements: { canManagePractice: false, hasPatientSite: false },
      }),
      emptyCmsDiscoveryStore()
    );
    const completedOverview = resolveCmsDiscovery(
      CMS_DISCOVERY_EXPERIENCES,
      context(),
      {
        schema: 1,
        experiences: {
          [CMS_PAGE_TOUR_IDS.overview]: { version: 1, status: "completed" },
        },
      }
    );

    expect(admin.tours.map((tour) => tour.id)).toEqual([
      CMS_INTRODUCTION_ID,
      CMS_PAGE_TOUR_IDS.overview,
      CMS_PAGE_TOUR_IDS.guides,
      CMS_PAGE_TOUR_IDS.practice,
      CMS_PAGE_TOUR_IDS.sites,
      CMS_PAGE_TOUR_IDS.help,
    ]);
    expect(
      admin.tours
        .filter((tour) => tour.id !== CMS_INTRODUCTION_ID)
        .every(
          (tour) =>
            tour.page && tour.steps.length >= 2 && tour.steps.length <= 4
        )
    ).toBe(true);
    expect(staff.tours.map((tour) => tour.id)).not.toContain(
      CMS_PAGE_TOUR_IDS.practice
    );
    expect(
      staff.tours
        .find((tour) => tour.id === CMS_PAGE_TOUR_IDS.guides)
        ?.steps.some((step) => step.id === "create")
    ).toBe(false);
    expect(
      staff.tours
        .find((tour) => tour.id === CMS_PAGE_TOUR_IDS.overview)
        ?.steps.some((step) => step.id === "patient-site")
    ).toBe(false);
    expect(completedOverview.welcome?.id).toBe(CMS_INTRODUCTION_ID);
    expect(completedOverview.tours.map((tour) => tour.id)).toContain(
      CMS_PAGE_TOUR_IDS.guides
    );
    expect(completedOverview.tours.map((tour) => tour.id)).toContain(
      CMS_PAGE_TOUR_IDS.overview
    );
  });
});

describe("CMS discovery audience", () => {
  const experiences = [
    ...CMS_DISCOVERY_EXPERIENCES,
    sampleAnnouncement,
    sampleTour,
  ];

  it("offers an assisting operator the controls that clinic session already has", () => {
    const assisting = resolveCmsDiscovery(
      experiences,
      context({ assisting: true }),
      emptyCmsDiscoveryStore()
    );
    const withoutPatientSite = resolveCmsDiscovery(
      experiences,
      context({
        assisting: true,
        requirements: { hasPatientSite: false },
      }),
      emptyCmsDiscoveryStore()
    );
    const billing = resolveCmsDiscovery(
      experiences,
      context({ requirements: { productNav: false } }),
      emptyCmsDiscoveryStore()
    );
    const optedOut = resolveCmsDiscovery(
      experiences.map((experience) =>
        experience.id === "share-menu"
          ? {
              ...experience,
              audience: { ...experience.audience, includeAssisting: false },
            }
          : experience
      ),
      context({ assisting: true }),
      emptyCmsDiscoveryStore()
    );

    expect(assisting.welcome?.steps.map((step) => step.id)).toEqual([
      "overview",
      "guides",
      "practice",
      "sites",
      "patient-site",
      "help",
    ]);
    expect(assisting.announcements.map((item) => item.id)).toEqual([
      "share-menu",
    ]);
    expect(assisting.tours.map((tour) => tour.id)).toContain("share-menu-tour");
    expect(
      withoutPatientSite.welcome?.steps.some(
        (step) => step.id === "patient-site"
      )
    ).toBe(false);
    expect(withoutPatientSite.welcome?.steps).toContainEqual(
      expect.objectContaining({ id: "practice" })
    );
    expect(billing.welcome).toBeNull();
    expect(billing.announcements).toEqual([]);
    expect(optedOut.announcements).toEqual([]);
    expect(optedOut.welcome?.id).toBe(CMS_INTRODUCTION_ID);
  });

  it("offers an announcement until that version is dismissed, including Show me", () => {
    const first = resolveCmsDiscovery(
      experiences,
      context(),
      emptyCmsDiscoveryStore()
    );
    expect(first.announcements).toEqual([
      {
        id: "share-menu",
        version: 1,
        title: "Share a guide",
        body: "Copy the patient link from the guide list.",
        showMeTourId: "share-menu-tour",
      },
    ]);

    const settled = resolveCmsDiscovery(experiences, context(), {
      schema: 1,
      experiences: { "share-menu": { version: 1, status: "dismissed" } },
    });
    expect(settled.announcements).toEqual([]);

    const bumped = resolveCmsDiscovery(
      [
        { ...sampleAnnouncement, version: 2 },
        sampleTour,
        ...CMS_DISCOVERY_EXPERIENCES,
      ],
      context(),
      {
        schema: 1,
        experiences: { "share-menu": { version: 1, status: "dismissed" } },
      }
    );
    expect(bumped.announcements.map((item) => item.version)).toEqual([2]);
  });

  it("drops Show me when the linked tour is not available to this person", () => {
    const staffOnlyTour: CmsDiscoveryExperience = {
      ...sampleTour,
      audience: { roles: ["STAFF"], requires: ["productNav"] },
    };
    const resolved = resolveCmsDiscovery(
      [sampleAnnouncement, staffOnlyTour],
      context({ role: "ADMIN" }),
      emptyCmsDiscoveryStore()
    );

    expect(resolved.announcements[0]?.showMeTourId).toBeNull();
    expect(resolved.tours).toEqual([]);
  });

  it("treats an older stored version as unfinished and a newer one as settled", () => {
    expect(isCmsDiscoverySettled({ version: 1, status: "completed" }, 2)).toBe(
      false
    );
    expect(isCmsDiscoverySettled({ version: 3, status: "dismissed" }, 2)).toBe(
      true
    );
    expect(isCmsDiscoverySettled(undefined, 1)).toBe(false);
  });
});

describe("CMS discovery storage", () => {
  function subject(
    overrides: Partial<CmsDiscoverySubject> = {}
  ): CmsDiscoverySubject {
    return {
      userId: "user_ada",
      clinicId: "clinic_ada",
      assisting: false,
      ...overrides,
    };
  }

  it("ignores corrupt records and keeps experiences separate", () => {
    expect(parseCmsDiscoveryStore("not-json").experiences).toEqual({});
    expect(parseCmsDiscoveryStore('{"schema":2}').experiences).toEqual({});
    expect(
      parseCmsDiscoveryStore(
        JSON.stringify({
          schema: 1,
          experiences: {
            "cms-introduction": { version: 1, status: "completed" },
            "share-menu": { version: "1", status: "dismissed" },
            "../other": { version: 1, status: "skipped" },
          },
        })
      ).experiences
    ).toEqual({
      "cms-introduction": { version: 1, status: "completed" },
    });
  });

  it("writes one user's record without replacing another experience", () => {
    const storage = new Map<string, string>();
    const previousWindow = globalThis.window;
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        localStorage: {
          getItem: (key: string) => storage.get(key) ?? null,
          setItem: (key: string, value: string) => {
            storage.set(key, value);
          },
        },
      },
    });

    try {
      const initial: CmsDiscoveryStore = {
        schema: 1,
        experiences: {
          "share-menu": { version: 1, status: "dismissed" },
        },
      };
      const next = writeCmsDiscoveryRecord(subject(), initial, {
        id: CMS_INTRODUCTION_ID,
        version: 1,
        status: "completed",
      });

      expect(next.experiences).toEqual({
        "share-menu": { version: 1, status: "dismissed" },
        [CMS_INTRODUCTION_ID]: { version: 1, status: "completed" },
      });
      expect(cmsDiscoveryStorageKey(subject())).toBe(
        "river-aftercare:cms-discovery:user_ada"
      );
      expect(storage.get("river-aftercare:cms-discovery:user_ada")).toContain(
        "completed"
      );
      expect(
        cmsDiscoveryStorageKey(subject({ userId: "user/ada" }))
      ).toBeNull();
      expect(
        writeCmsDiscoveryRecord(subject({ userId: "user/ada" }), initial, {
          id: CMS_INTRODUCTION_ID,
          version: 1,
          status: "skipped",
        }).experiences[CMS_INTRODUCTION_ID]
      ).toEqual({ version: 1, status: "skipped" });
      expect([...storage.keys()]).toEqual([
        "river-aftercare:cms-discovery:user_ada",
      ]);
    } finally {
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: previousWindow,
      });
    }
  });

  it("keeps an assisting operator's clinics apart from each other and from members", () => {
    const storage = new Map<string, string>();
    const previousWindow = globalThis.window;
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        localStorage: {
          getItem: (key: string) => storage.get(key) ?? null,
          setItem: (key: string, value: string) => {
            storage.set(key, value);
          },
        },
      },
    });

    try {
      const member = subject();
      const clinicA = subject({ assisting: true, clinicId: "clinic_a" });
      const clinicB = subject({ assisting: true, clinicId: "clinic_b" });
      writeCmsDiscoveryRecord(member, emptyCmsDiscoveryStore(), {
        id: CMS_INTRODUCTION_ID,
        version: 1,
        status: "dismissed",
      });
      writeCmsDiscoveryRecord(clinicA, emptyCmsDiscoveryStore(), {
        id: CMS_INTRODUCTION_ID,
        version: 1,
        status: "completed",
      });
      writeCmsDiscoveryRecord(clinicA, readCmsDiscoveryStore(clinicA), {
        id: CMS_PAGE_TOUR_IDS.guides,
        version: 1,
        status: "completed",
      });

      expect(readCmsDiscoveryStore(clinicB).experiences).toEqual({});
      expect(readCmsDiscoveryStore(member).experiences).toEqual({
        [CMS_INTRODUCTION_ID]: { version: 1, status: "dismissed" },
      });
      expect(readCmsDiscoveryStore(clinicA).experiences).toEqual({
        [CMS_INTRODUCTION_ID]: { version: 1, status: "completed" },
        [CMS_PAGE_TOUR_IDS.guides]: { version: 1, status: "completed" },
      });
      expect(readCmsDiscoveryStore(member).experiences).not.toHaveProperty(
        CMS_PAGE_TOUR_IDS.guides
      );
      expect(cmsDiscoveryStorageKey(clinicA)).toBe(
        "river-aftercare:cms-discovery:user_ada:clinic_a"
      );
      expect(
        cmsDiscoveryStorageKey(
          subject({ assisting: true, clinicId: "clinic/a" })
        )
      ).toBeNull();
    } finally {
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: previousWindow,
      });
    }
  });
});

describe("CMS discovery placement and routes", () => {
  it("places the card to the right of a sidebar target", () => {
    const placement = placeTourCard({
      viewportWidth: 1280,
      viewportHeight: 800,
      target: { top: 160, left: 16, width: 220, height: 44 },
      cardHeight: 220,
    });

    expect(placement.spot).toEqual({
      top: 154,
      left: 10,
      width: 232,
      height: 56,
    });
    expect(placement.left).toBeGreaterThan(240);
    expect(placement.top).toBe(154);
  });

  it("pins the card to the bottom of a narrow screen", () => {
    const placement = placeTourCard({
      viewportWidth: 390,
      viewportHeight: 700,
      target: { top: 120, left: 16, width: 280, height: 44 },
      cardHeight: 220,
    });

    expect(placement.spot).toEqual({
      top: 114,
      left: 10,
      width: 292,
      height: 56,
    });
    expect(placement.left).toBe(16);
    expect(placement.top).toBe(464);
    expect(placement.width).toBe(352);
  });

  it("keeps a card inside the viewport when the painted box runs off the right", () => {
    const fitted = keepTourCardOnScreen({
      placement: {
        spot: { top: 164, left: 694, width: 1112, height: 102 },
        top: 164,
        left: 1818,
        width: 352,
      },
      card: { top: 164, left: 1818, width: 480, height: 220 },
      viewportWidth: 1920,
      viewportHeight: 1080,
    });

    expect(fitted.left).toBeGreaterThanOrEqual(16);
    expect(fitted.left + fitted.width).toBeLessThanOrEqual(1920 - 16);
    expect(fitted.top).toBeGreaterThan(164);
  });

  it("pulls a card back from the left edge of the viewport", () => {
    const fitted = keepTourCardOnScreen({
      placement: {
        spot: { top: 300, left: 8, width: 240, height: 56 },
        top: 300,
        left: -180,
        width: 352,
      },
      card: { top: 300, left: -180, width: 352, height: 220 },
      viewportWidth: 1280,
      viewportHeight: 800,
    });

    expect(fitted.left).toBe(16);
    expect(fitted.top).toBe(300);
  });

  it("keeps the layout viewport when the window is fully on screen", () => {
    const visible = visibleLayoutSize({
      width: 1951,
      height: 1104,
      screenX: 0,
      screenY: 29,
      outerWidth: 1920,
      outerHeight: 1171,
      availWidth: 1920,
      availHeight: 1200,
    });
    expect(visible).toEqual({ width: 1951, height: 1104 });
  });

  it("keeps the layout viewport when screen size is the emulated viewport", () => {
    expect(
      visibleLayoutSize({
        width: 375,
        height: 740,
        screenX: 40,
        screenY: 40,
        outerWidth: 508,
        outerHeight: 825,
        availWidth: 390,
        availHeight: 740,
      })
    ).toEqual({ width: 375, height: 740 });
  });

  it("shrinks the layout viewport when the window hangs off the screen", () => {
    const visible = visibleLayoutSize({
      width: 1951,
      height: 1104,
      screenX: 200,
      screenY: 0,
      outerWidth: 1920,
      outerHeight: 1100,
      availWidth: 1920,
      availHeight: 1200,
    });

    expect(visible.width).toBeLessThan(1800);
    expect(visible.width).toBeGreaterThan(1700);
    expect(visible.height).toBe(1104);
  });

  it("centers the card when the target is missing", () => {
    const placement = placeTourCard({
      viewportWidth: 390,
      viewportHeight: 700,
      target: null,
      cardHeight: 200,
    });

    expect(placement.spot).toBeNull();
    expect(placement.width).toBeLessThanOrEqual(352);
    expect(placement.left).toBeGreaterThanOrEqual(16);
    expect(placement.top).toBeGreaterThanOrEqual(16);
  });

  it("matches in-app paths and refuses external addresses", () => {
    expect(
      discoveryPathMatches(
        "/practice/sites/site_1",
        "/practice/sites",
        "prefix"
      )
    ).toBe(true);
    expect(discoveryPathMatches("/practice", "/practice/sites", "exact")).toBe(
      false
    );
    expect(isSafeDiscoveryPath("/guides")).toBe(true);
    expect(isSafeDiscoveryPath("//evil.test")).toBe(false);
    expect(isSafeDiscoveryPath("https://evil.test")).toBe(false);
    expect(isSafeDiscoveryHref("/guides?cmsTour=cms-page-guides")).toBe(true);
    expect(cmsTourHandoffHref("/guides", "cms-page-guides")).toBe(
      "/guides?cmsTour=cms-page-guides"
    );
    expect(
      isSafeDiscoveryHref("/guides?cmsTour=cms-page-guides&next=/admin")
    ).toBe(false);
    expect(
      isSafeDiscoveryHref("https://evil.test?cmsTour=cms-page-guides")
    ).toBe(false);
    expect(cmsTourHandoffHref("//evil.test", "cms-page-guides")).toBeNull();
    expect(suppressesAutomaticDiscovery("/guides/new")).toBe(true);
    expect(suppressesAutomaticDiscovery("/guides/guide_1/edit")).toBe(true);
    expect(suppressesAutomaticDiscovery("/guides/guide_1/preview")).toBe(false);
    expect(suppressesAutomaticDiscovery("/dashboard")).toBe(false);
  });
});

describe("CMS discovery context", () => {
  it("accepts clinic roles and refuses an empty user", () => {
    expect(
      buildCmsDiscoveryContext({
        userId: " user_ada ",
        clinicId: " clinic_ada ",
        role: "STAFF",
        assisting: false,
        productNav: true,
        canManagePractice: false,
        hasPatientSite: true,
        assistedOnboarding: true,
      })
    ).toEqual({
      userId: "user_ada",
      clinicId: "clinic_ada",
      role: "STAFF",
      assisting: false,
      requirements: {
        productNav: true,
        canManagePractice: false,
        hasPatientSite: true,
        assistedOnboarding: true,
      },
    });
    expect(
      buildCmsDiscoveryContext({
        userId: " ",
        clinicId: "clinic_ada",
        role: "ADMIN",
        assisting: false,
        productNav: true,
        canManagePractice: true,
        hasPatientSite: false,
        assistedOnboarding: false,
      })
    ).toBeNull();
    expect(
      buildCmsDiscoveryContext({
        userId: "user_ada",
        clinicId: "clinic_ada",
        role: "OPERATOR",
        assisting: false,
        productNav: true,
        canManagePractice: true,
        hasPatientSite: false,
        assistedOnboarding: false,
      })
    ).toBeNull();
  });
});
