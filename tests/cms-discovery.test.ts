import { describe, expect, it } from "vitest";

import { buildCmsDiscoveryContext } from "@/lib/cms-discovery/context";
import {
  discoveryPathMatches,
  isSafeDiscoveryPath,
  suppressesAutomaticDiscovery,
} from "@/lib/cms-discovery/navigation";
import { placeTourCard } from "@/lib/cms-discovery/placement";
import {
  CMS_DISCOVERY_EXPERIENCES,
  CMS_INTRODUCTION_ID,
} from "@/lib/cms-discovery/registry";
import {
  isCmsDiscoverySettled,
  resolveCmsDiscovery,
} from "@/lib/cms-discovery/resolve";
import {
  cmsDiscoveryStorageKey,
  emptyCmsDiscoveryStore,
  parseCmsDiscoveryStore,
  writeCmsDiscoveryRecord,
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
});

describe("CMS discovery audience", () => {
  const experiences = [
    ...CMS_DISCOVERY_EXPERIENCES,
    sampleAnnouncement,
    sampleTour,
  ];

  it("hides the workspace from assisting operators and from billing-only access", () => {
    const assisting = resolveCmsDiscovery(
      experiences,
      context({ assisting: true }),
      emptyCmsDiscoveryStore()
    );
    const billing = resolveCmsDiscovery(
      experiences,
      context({ requirements: { productNav: false } }),
      emptyCmsDiscoveryStore()
    );

    expect(assisting.welcome).toBeNull();
    expect(assisting.announcements).toEqual([]);
    expect(assisting.tours).toEqual([]);
    expect(billing.welcome).toBeNull();
    expect(billing.announcements).toEqual([]);
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
      const next = writeCmsDiscoveryRecord("user_ada", initial, {
        id: CMS_INTRODUCTION_ID,
        version: 1,
        status: "completed",
      });

      expect(next.experiences).toEqual({
        "share-menu": { version: 1, status: "dismissed" },
        [CMS_INTRODUCTION_ID]: { version: 1, status: "completed" },
      });
      expect(cmsDiscoveryStorageKey("user_ada")).toBe(
        "river-aftercare:cms-discovery:user_ada"
      );
      expect(storage.get("river-aftercare:cms-discovery:user_ada")).toContain(
        "completed"
      );
      expect(cmsDiscoveryStorageKey("user/ada")).toBeNull();
      expect(
        writeCmsDiscoveryRecord("user/ada", initial, {
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
        role: "STAFF",
        assisting: false,
        productNav: true,
        canManagePractice: false,
        hasPatientSite: true,
        assistedOnboarding: true,
      })
    ).toEqual({
      userId: "user_ada",
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
