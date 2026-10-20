import { AsyncLocalStorage } from "node:async_hooks";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import { EntitlementStatus, GuideRevisionStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Vitest loads the client `react` build, whose `cache()` does not memoize.
 * This file installs React's server `cache()` and a per-call request map so
 * the assertions exercise the same request boundary Next uses.
 */
function requestStorage(): AsyncLocalStorage<Map<unknown, unknown>> {
  const host = globalThis as typeof globalThis & {
    __riverPatientGuideRequestCache?: AsyncLocalStorage<Map<unknown, unknown>>;
  };
  host.__riverPatientGuideRequestCache ??= new AsyncLocalStorage();
  return host.__riverPatientGuideRequestCache;
}

function installServerCache() {
  const require = createRequire(import.meta.url);
  const reactServer = require(
    fileURLToPath(
      new URL(
        "../node_modules/react/cjs/react.react-server.development.js",
        import.meta.url
      )
    )
  ) as {
    cache: <T extends (...args: never[]) => unknown>(fn: T) => T;
    __SERVER_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE: {
      A: {
        getCacheForType: (resourceType: () => unknown) => unknown;
        cacheSignal: () => null;
      } | null;
    };
  };
  reactServer.__SERVER_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE.A =
    {
      getCacheForType(resourceType: () => unknown) {
        const store = requestStorage().getStore();
        if (!store) {
          return resourceType();
        }
        const existing = store.get(resourceType);
        if (existing !== undefined) {
          return existing;
        }
        const created = resourceType();
        store.set(resourceType, created);
        return created;
      },
      cacheSignal() {
        return null;
      },
    };
  return reactServer.cache;
}

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return {
    ...actual,
    cache: installServerCache(),
  };
});

const prismaMock = vi.hoisted(() => ({
  clinicSite: { findUnique: vi.fn() },
  clinicEntitlement: { findUnique: vi.fn() },
  practiceGuidePlacement: { findMany: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({
  getPrisma: () => prismaMock,
}));

import { getClinicBySlug } from "@/lib/aftercare/get-clinic-by-slug";
import { getPublishedPracticeGuide } from "@/lib/aftercare/get-published-practice-guide";

function withRequest<T>(run: () => Promise<T>): Promise<T> {
  return requestStorage().run(new Map(), run);
}

const PUBLISHED_AT = new Date("2026-08-31T00:00:00.000Z");

function site(slug: string, clinicId: string, name: string) {
  return {
    id: `site_${clinicId}`,
    clinicId,
    slug,
    displayName: name,
    active: true,
    logoUrl: null,
    darkLogoUrl: null,
    faviconUrl: null,
    primaryColor: "#0f766e",
    accentColor: "#f59e0b",
    darkPrimaryColor: null,
    darkAccentColor: null,
    useCustomDarkBranding: false,
    neutralColor: null,
    radiusPreset: "MEDIUM",
    typeface: null,
    instructionTerminology: "AFTERCARE",
    themeMode: "SYSTEM",
    allowPatientThemeToggle: false,
    showCareGuideAttribution: true,
    clinic: {
      id: clinicId,
      name,
      deactivatedAt: null,
      archivedAt: null,
    },
    locations: [
      {
        id: `loc_${clinicId}`,
        clinicId,
        clinicSiteId: `site_${clinicId}`,
        phone: null,
        addressLine1: null,
        addressLine2: null,
        city: null,
        region: null,
        postalCode: null,
        country: null,
        bookingUrl: null,
        contactUrl: null,
        contactEmail: null,
        emergencyInstructions: "Call the practice.",
      },
    ],
  };
}

function placement(clinicId: string, slug: string, publicSlug: string) {
  return {
    id: `placement_${clinicId}_${publicSlug}`,
    clinicId,
    publicSlug,
    isEnabled: true,
    publishedPracticeGuideRevisionId: null,
    location: {
      clinicId,
      clinicSite: { slug, clinicId, active: true },
    },
    publishedPracticeGuideRevision: null,
    practiceGuide: {
      id: `guide_${clinicId}_${publicSlug}`,
      clinicId,
      title: publicSlug === "extraction" ? "Tooth Extraction" : "Other guide",
      publicSlug,
      publishedAt: PUBLISHED_AT,
      downgradeRetainedAt: null,
      downgradeRetentionUntil: null,
      guideTemplate: null,
      pinnedRevision: {
        id: `rev_${clinicId}_${publicSlug}`,
        version: 1,
        status: GuideRevisionStatus.PUBLISHED,
        reviewedAt: PUBLISHED_AT,
        sections: [
          {
            key: "introduction",
            kind: "INTRODUCTION",
            title: "Introduction",
            body: `${clinicId} intro for ${publicSlug}`,
            periodLabel: null,
            startDay: null,
            endDay: null,
            sortOrder: 1,
            homeCareInstructions: [],
          },
        ],
      },
      overrides: [],
      additions: [],
    },
  };
}

describe("patient guide request cache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.clinicEntitlement.findUnique.mockResolvedValue(null);
    prismaMock.clinicSite.findUnique.mockImplementation(
      async (args: { where: { slug: string } }) => {
        if (args.where.slug === "demodental") {
          return site("demodental", "clinic_a", "Demo Clinic");
        }
        if (args.where.slug === "otherclinic") {
          return site("otherclinic", "clinic_b", "Other Clinic");
        }
        return null;
      }
    );
    prismaMock.practiceGuidePlacement.findMany.mockImplementation(
      async (args: {
        where: { publicSlug?: string; clinicId?: string; locationId?: string };
      }) => {
        const { publicSlug, clinicId, locationId } = args.where;
        if (locationId || !publicSlug || !clinicId) {
          return [];
        }
        const slug = clinicId === "clinic_a" ? "demodental" : "otherclinic";
        if (clinicId !== "clinic_a" && clinicId !== "clinic_b") {
          return [];
        }
        return [placement(clinicId, slug, publicSlug)];
      }
    );
  });

  it("reuses one clinic lookup inside a request, including the demo alias", async () => {
    await withRequest(async () => {
      const first = await getClinicBySlug("demo");
      const second = await getClinicBySlug("demo");
      expect(first?.slug).toBe("demodental");
      expect(second).toBe(first);
    });

    expect(prismaMock.clinicSite.findUnique).toHaveBeenCalledTimes(1);
    expect(prismaMock.clinicSite.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { slug: "demodental" } })
    );
  });

  it("does not share a clinic cache entry across different slugs", async () => {
    await withRequest(async () => {
      const demo = await getClinicBySlug("demo");
      const legacy = await getClinicBySlug("demodental");
      const other = await getClinicBySlug("otherclinic");
      expect(demo?.id).toBe("clinic_a");
      expect(legacy?.id).toBe("clinic_a");
      expect(demo).not.toBe(legacy);
      expect(other?.id).toBe("clinic_b");
    });

    expect(prismaMock.clinicSite.findUnique).toHaveBeenCalledTimes(3);
  });

  it("shares the published guide between metadata and the page, and with the layout clinic lookup", async () => {
    await withRequest(async () => {
      await getClinicBySlug("demodental");
      const metadata = await getPublishedPracticeGuide({
        clinicSlug: "demodental",
        publicSlug: "extraction",
      });
      const page = await getPublishedPracticeGuide({
        clinicSlug: "demodental",
        publicSlug: "extraction",
      });
      expect(metadata?.title).toBe("Tooth Extraction");
      expect(metadata?.sections[0]?.body).toBe("clinic_a intro for extraction");
      expect(page).toBe(metadata);
    });

    expect(prismaMock.clinicSite.findUnique).toHaveBeenCalledTimes(1);
    expect(prismaMock.practiceGuidePlacement.findMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.clinicEntitlement.findUnique).toHaveBeenCalledTimes(1);
  });

  it("keeps guide and location keys independent", async () => {
    await withRequest(async () => {
      const extraction = await getPublishedPracticeGuide({
        clinicSlug: "demodental",
        publicSlug: "extraction",
      });
      const implants = await getPublishedPracticeGuide({
        clinicSlug: "demodental",
        publicSlug: "implants",
      });
      const bondi = await getPublishedPracticeGuide({
        clinicSlug: "demodental",
        publicSlug: "extraction",
        locationSlug: "bondi",
      });
      const bondiAgain = await getPublishedPracticeGuide({
        clinicSlug: "demodental",
        publicSlug: "extraction",
        locationSlug: "bondi",
      });
      const manly = await getPublishedPracticeGuide({
        clinicSlug: "demodental",
        publicSlug: "extraction",
        locationSlug: "manly",
      });
      expect(extraction?.practiceGuide.publicSlug).toBe("extraction");
      expect(implants?.practiceGuide.publicSlug).toBe("implants");
      expect(extraction).not.toBe(implants);
      expect(bondi).toBeNull();
      expect(bondiAgain).toBeNull();
      expect(manly).toBeNull();
      expect(bondi).not.toBe(extraction);
    });

    expect(prismaMock.practiceGuidePlacement.findMany).toHaveBeenCalledTimes(2);
    const locationLookups = prismaMock.clinicSite.findUnique.mock.calls.filter(
      (call) => {
        const select = call[0]?.select as
          { locations?: { where?: { servesSiteRoot?: boolean } } } | undefined;
        return select?.locations?.where?.servesSiteRoot === false;
      }
    );
    expect(locationLookups).toHaveLength(2);
  });

  it("isolates concurrent requests and reads again on the next request", async () => {
    let lookups = 0;
    prismaMock.clinicSite.findUnique.mockImplementation(async () => {
      lookups += 1;
      await new Promise((resolve) => setTimeout(resolve, 15));
      return site("demodental", "clinic_a", "Demo Clinic");
    });

    await Promise.all([
      withRequest(async () => {
        const [left, right] = await Promise.all([
          getClinicBySlug("demodental"),
          getClinicBySlug("demodental"),
        ]);
        expect(left).toBe(right);
      }),
      withRequest(async () => {
        const [left, right] = await Promise.all([
          getClinicBySlug("demodental"),
          getClinicBySlug("demodental"),
        ]);
        expect(left).toBe(right);
      }),
    ]);
    expect(lookups).toBe(2);

    await withRequest(() => getClinicBySlug("demodental"));
    expect(lookups).toBe(3);
  });

  it("does not memoize outside a React request", async () => {
    await getClinicBySlug("demodental");
    await getClinicBySlug("demodental");
    await getPublishedPracticeGuide({
      clinicSlug: "demodental",
      publicSlug: "extraction",
    });
    await getPublishedPracticeGuide({
      clinicSlug: "demodental",
      publicSlug: "extraction",
    });

    expect(prismaMock.clinicSite.findUnique).toHaveBeenCalledTimes(4);
    expect(prismaMock.practiceGuidePlacement.findMany).toHaveBeenCalledTimes(2);
  });

  it("does not let an explicit clock reuse an earlier retention decision", async () => {
    prismaMock.clinicEntitlement.findUnique.mockResolvedValue({
      entitlementStatus: EntitlementStatus.ENDED,
      publicGuideRetentionUntil: new Date("2026-06-01T00:00:00.000Z"),
    });

    await withRequest(async () => {
      const during = await getPublishedPracticeGuide({
        clinicSlug: "demodental",
        publicSlug: "extraction",
        now: new Date("2026-05-01T00:00:00.000Z"),
      });
      const expired = await getPublishedPracticeGuide({
        clinicSlug: "demodental",
        publicSlug: "extraction",
        now: new Date("2026-07-01T00:00:00.000Z"),
      });
      expect(during?.title).toBe("Tooth Extraction");
      expect(expired).toBeNull();
    });

    expect(prismaMock.practiceGuidePlacement.findMany).toHaveBeenCalledTimes(2);
  });
});
