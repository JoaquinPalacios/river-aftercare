import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  EntitlementStatus,
  GuideRevisionStatus,
  PracticeGuideStatus,
} from "@prisma/client";

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
import { listPublishedPracticeGuides } from "@/lib/aftercare/list-published-practice-guides";
import { PUBLIC_PRACTICE_GUIDE_WHERE } from "@/lib/aftercare/public-practice-guide-predicates";

const CLINIC_A = {
  id: "clinic_a",
  slug: "demodental",
  name: "Rivers Care Demo Clinic",
  profile: {
    displayName: "Riverside Dental Demo",
    logoUrl: null,
    primaryColor: "#0f766e",
    accentColor: "#f59e0b",
    phone: "555-0100",
    addressLine1: "1 Demo Street",
    addressLine2: null,
    city: "Riverside",
    region: "NSW",
    postalCode: "2000",
    country: "AU",
    bookingUrl: "https://example.test/book",
    contactUrl: "https://example.test/contact",
    contactEmail: "hello@example.test",
    emergencyInstructions: "Call 000 in an emergency.",
    showCareGuideAttribution: true,
    typeface: null,
  },
};

const CLINIC_B = {
  id: "clinic_b",
  slug: "otherclinic",
  name: "Other Clinic",
  profile: {
    ...CLINIC_A.profile,
    displayName: "Other Clinic Patient Brand",
    phone: "555-0199",
    emergencyInstructions: "Other clinic emergency copy.",
  },
};

const PUBLISHED_AT = new Date("2026-08-31T00:00:00.000Z");

function publishedGuideRecord(clinic = CLINIC_A) {
  return {
    id: "pg_extraction",
    clinicId: clinic.id,
    publicSlug: "extraction",
    title: "Tooth Extraction",
    publishedAt: PUBLISHED_AT,
    contentRevisions: [],
    clinic,
    guideTemplate: {
      id: "tmpl_extraction",
      slug: "extraction",
      title: "Tooth Extraction",
      specialty: "DENTAL",
    },
    pinnedRevision: {
      id: "rev_extraction_v1",
      version: 1,
      reviewedAt: PUBLISHED_AT,
      sections: [
        {
          key: "introduction",
          kind: "INTRODUCTION",
          title: "Introduction",
          body: "Canonical intro",
          sortOrder: 1,
        },
        {
          key: "contact-practice",
          kind: "CONTACT_PRACTICE",
          title: "Contact",
          body: "Canonical contact",
          sortOrder: 2,
        },
      ],
    },
    overrides: [
      {
        sectionKey: "contact-practice",
        title: "Call Riverside",
        body: "Clinic A override",
      },
    ],
    additions: [
      {
        key: "weekend-hours",
        kind: "CUSTOM",
        title: "Weekend hours",
        body: "Clinic A addition",
        sortOrder: 1,
        insertAfterSectionKey: "contact-practice",
      },
    ],
  };
}

function siteFromClinic(clinic: typeof CLINIC_A) {
  return {
    id: `site_${clinic.id}`,
    clinicId: clinic.id,
    slug: clinic.slug,
    displayName: clinic.profile.displayName,
    active: true,
    logoUrl: clinic.profile.logoUrl,
    darkLogoUrl: null,
    faviconUrl: null,
    primaryColor: clinic.profile.primaryColor,
    accentColor: clinic.profile.accentColor,
    darkPrimaryColor: null,
    darkAccentColor: null,
    useCustomDarkBranding: false,
    neutralColor: null,
    radiusPreset: "MEDIUM",
    typeface: clinic.profile.typeface,
    instructionTerminology: "AFTERCARE",
    themeMode: "SYSTEM",
    allowPatientThemeToggle: false,
    showCareGuideAttribution: clinic.profile.showCareGuideAttribution,
    clinic: { id: clinic.id, name: clinic.name },
    locations: [
      {
        id: `loc_${clinic.id}`,
        clinicId: clinic.id,
        clinicSiteId: `site_${clinic.id}`,
        phone: clinic.profile.phone,
        addressLine1: clinic.profile.addressLine1,
        addressLine2: clinic.profile.addressLine2,
        city: clinic.profile.city,
        region: clinic.profile.region,
        postalCode: clinic.profile.postalCode,
        country: clinic.profile.country,
        bookingUrl: clinic.profile.bookingUrl,
        contactUrl: clinic.profile.contactUrl,
        contactEmail: clinic.profile.contactEmail,
        emergencyInstructions: clinic.profile.emergencyInstructions,
      },
    ],
  };
}

function placementFromGuide(clinic = CLINIC_A) {
  const guide = publishedGuideRecord(clinic);
  return {
    id: "placement_extraction",
    clinicId: clinic.id,
    publicSlug: guide.publicSlug,
    isEnabled: true,
    publishedPracticeGuideRevisionId: null,
    location: {
      clinicId: clinic.id,
      clinicSite: {
        slug: clinic.slug,
        clinicId: clinic.id,
        active: true,
      },
    },
    publishedPracticeGuideRevision: null,
    practiceGuide: {
      id: guide.id,
      clinicId: clinic.id,
      title: guide.title,
      publicSlug: guide.publicSlug,
      publishedAt: guide.publishedAt,
      downgradeRetainedAt: null,
      downgradeRetentionUntil: null,
      guideTemplate: guide.guideTemplate,
      pinnedRevision: {
        ...guide.pinnedRevision,
        status: GuideRevisionStatus.PUBLISHED,
      },
      overrides: guide.overrides,
      additions: guide.additions.map((addition) => ({
        ...addition,
        periodLabel: null,
        startDay: null,
        endDay: null,
      })),
    },
  };
}

describe("aftercare public loaders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires enabled, published, and a published pinned revision", () => {
    expect(PUBLIC_PRACTICE_GUIDE_WHERE).toMatchObject({
      isEnabled: true,
      status: PracticeGuideStatus.PUBLISHED,
    });
    expect(PUBLIC_PRACTICE_GUIDE_WHERE.OR).toHaveLength(2);
  });

  it("resolves a published enabled guide with a published pinned revision", async () => {
    prismaMock.clinicSite.findUnique.mockResolvedValue(
      siteFromClinic(CLINIC_A)
    );
    prismaMock.practiceGuidePlacement.findMany.mockResolvedValue([
      placementFromGuide(),
    ]);

    const result = await getPublishedPracticeGuide({
      clinicSlug: "demodental",
      publicSlug: "extraction",
    });

    expect(prismaMock.clinicSite.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { slug: "demodental" },
      })
    );
    expect(prismaMock.practiceGuidePlacement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          publicSlug: "extraction",
          isEnabled: true,
          clinicId: CLINIC_A.id,
          practiceGuide: expect.objectContaining(PUBLIC_PRACTICE_GUIDE_WHERE),
          location: expect.objectContaining({
            servesSiteRoot: true,
            clinicSite: expect.objectContaining({ slug: "demodental" }),
          }),
        }),
      })
    );
    expect(result?.title).toBe("Tooth Extraction");
    expect(result?.practiceGuide.publicSlug).toBe("extraction");
    expect(result?.sections.map((section) => section.provenance)).toEqual([
      "canonical",
      "practice_override",
      "practice_addition",
    ]);
  });

  it("does not resolve a draft PracticeGuide", async () => {
    prismaMock.clinicSite.findUnique.mockResolvedValue(
      siteFromClinic(CLINIC_A)
    );
    prismaMock.practiceGuidePlacement.findMany.mockResolvedValue([]);

    await expect(
      getPublishedPracticeGuide({
        clinicSlug: "demodental",
        publicSlug: "extraction",
      })
    ).resolves.toBeNull();

    expect(
      prismaMock.practiceGuidePlacement.findMany.mock.calls[0]?.[0].where
        .practiceGuide.status
    ).toBe(PracticeGuideStatus.PUBLISHED);
  });

  it("does not resolve a disabled PracticeGuide", async () => {
    prismaMock.clinicSite.findUnique.mockResolvedValue(
      siteFromClinic(CLINIC_A)
    );
    prismaMock.practiceGuidePlacement.findMany.mockResolvedValue([]);

    await expect(
      getPublishedPracticeGuide({
        clinicSlug: "demodental",
        publicSlug: "extraction",
      })
    ).resolves.toBeNull();

    expect(
      prismaMock.practiceGuidePlacement.findMany.mock.calls[0]?.[0].where
        .isEnabled
    ).toBe(true);
  });

  it("does not resolve a guide whose pinned revision is still draft", async () => {
    prismaMock.clinicSite.findUnique.mockResolvedValue(
      siteFromClinic(CLINIC_A)
    );
    prismaMock.practiceGuidePlacement.findMany.mockResolvedValue([]);

    await expect(
      getPublishedPracticeGuide({
        clinicSlug: "demodental",
        publicSlug: "extraction",
      })
    ).resolves.toBeNull();

    expect(
      prismaMock.practiceGuidePlacement.findMany.mock.calls[0]?.[0].where
        .practiceGuide.OR
    ).toEqual(PUBLIC_PRACTICE_GUIDE_WHERE.OR);
  });

  it("does not resolve an unknown guide slug", async () => {
    prismaMock.clinicSite.findUnique.mockResolvedValue(
      siteFromClinic(CLINIC_A)
    );
    prismaMock.practiceGuidePlacement.findMany.mockResolvedValue([]);

    await expect(
      getPublishedPracticeGuide({
        clinicSlug: "demodental",
        publicSlug: "unknown-guide",
      })
    ).resolves.toBeNull();
  });

  it("does not let clinic B load clinic A's PracticeGuide", async () => {
    prismaMock.clinicSite.findUnique.mockResolvedValue(
      siteFromClinic(CLINIC_B)
    );
    prismaMock.practiceGuidePlacement.findMany.mockResolvedValue([]);

    const result = await getPublishedPracticeGuide({
      clinicSlug: "otherclinic",
      publicSlug: "extraction",
    });

    expect(result).toBeNull();
    expect(prismaMock.practiceGuidePlacement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          publicSlug: "extraction",
          clinicId: CLINIC_B.id,
          practiceGuide: expect.objectContaining({
            clinicId: CLINIC_B.id,
            ...PUBLIC_PRACTICE_GUIDE_WHERE,
          }),
        }),
      })
    );
  });

  it("does not return clinic A override, addition, or profile to clinic B", async () => {
    prismaMock.clinicSite.findUnique.mockResolvedValue(
      siteFromClinic(CLINIC_B)
    );
    prismaMock.practiceGuidePlacement.findMany.mockResolvedValue([]);

    const listed = await listPublishedPracticeGuides("otherclinic");

    expect(listed?.clinic.id).toBe(CLINIC_B.id);
    expect(listed?.profile?.displayName).toBe("Other Clinic Patient Brand");
    expect(listed?.profile?.phone).toBe("555-0199");
    expect(listed?.profile?.bookingUrl).toBe("https://example.test/book");
    expect(listed?.guides).toEqual([]);
    expect(prismaMock.practiceGuidePlacement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          clinicId: CLINIC_B.id,
          practiceGuide: expect.objectContaining({
            clinicId: CLINIC_B.id,
            ...PUBLIC_PRACTICE_GUIDE_WHERE,
          }),
        }),
        orderBy: [
          { practiceGuide: { sortOrder: "asc" } },
          { publicSlug: "asc" },
        ],
      })
    );
  });

  it("returns null for an unknown clinic slug", async () => {
    prismaMock.clinicSite.findUnique.mockResolvedValue(null);

    await expect(getClinicBySlug("missingclinic")).resolves.toBeNull();
    await expect(
      listPublishedPracticeGuides("missingclinic")
    ).resolves.toBeNull();
    await expect(
      getPublishedPracticeGuide({
        clinicSlug: "missingclinic",
        publicSlug: "extraction",
      })
    ).resolves.toBeNull();
    expect(prismaMock.clinicSite.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { slug: "missingclinic" },
      })
    );
    expect(prismaMock.practiceGuidePlacement.findMany).not.toHaveBeenCalled();
  });

  it("keeps a published guide available during the retention window", async () => {
    prismaMock.clinicSite.findUnique.mockResolvedValue(
      siteFromClinic(CLINIC_A)
    );
    prismaMock.practiceGuidePlacement.findMany.mockResolvedValue([
      placementFromGuide(),
    ]);
    prismaMock.clinicEntitlement.findUnique.mockResolvedValue({
      entitlementStatus: EntitlementStatus.ENDED,
      publicGuideRetentionUntil: new Date("2099-01-01T00:00:00.000Z"),
    });

    const result = await getPublishedPracticeGuide({
      clinicSlug: "demodental",
      publicSlug: "extraction",
    });

    expect(result?.practiceGuide.publicSlug).toBe("extraction");
  });

  it("takes a published guide offline after retention expires", async () => {
    prismaMock.clinicSite.findUnique.mockResolvedValue(
      siteFromClinic(CLINIC_A)
    );
    prismaMock.practiceGuidePlacement.findMany.mockResolvedValue([
      placementFromGuide(),
    ]);
    prismaMock.clinicEntitlement.findUnique.mockResolvedValue({
      entitlementStatus: EntitlementStatus.ENDED,
      publicGuideRetentionUntil: new Date("2020-01-01T00:00:00.000Z"),
    });

    await expect(
      getPublishedPracticeGuide({
        clinicSlug: "demodental",
        publicSlug: "extraction",
      })
    ).resolves.toBeNull();
  });

  it("keeps published guides available when the clinic is restricted for non-payment", async () => {
    prismaMock.clinicSite.findUnique.mockResolvedValue(
      siteFromClinic(CLINIC_A)
    );
    prismaMock.clinicEntitlement.findUnique.mockResolvedValue({
      entitlementStatus: EntitlementStatus.RESTRICTED,
      publicGuideRetentionUntil: null,
    });
    prismaMock.practiceGuidePlacement.findMany.mockResolvedValue([
      {
        publicSlug: "extraction",
        clinicId: CLINIC_A.id,
        publishedPracticeGuideRevision: null,
        practiceGuide: {
          id: "pg_extraction",
          clinicId: CLINIC_A.id,
          title: "Tooth Extraction",
          sortOrder: 1,
          publishedAt: PUBLISHED_AT,
          guideTemplate: { title: "Tooth Extraction" },
        },
      },
    ]);

    const listed = await listPublishedPracticeGuides("demodental");
    expect(listed?.guides).toHaveLength(1);
  });

  it("lists no guides after retention expires and does not publish drafts", async () => {
    prismaMock.clinicSite.findUnique.mockResolvedValue(
      siteFromClinic(CLINIC_A)
    );
    prismaMock.clinicEntitlement.findUnique.mockResolvedValue({
      entitlementStatus: EntitlementStatus.ENDED,
      publicGuideRetentionUntil: new Date("2020-01-01T00:00:00.000Z"),
    });

    const listed = await listPublishedPracticeGuides("demodental");
    expect(listed?.guides).toEqual([]);
    expect(prismaMock.practiceGuidePlacement.findMany).not.toHaveBeenCalled();
    expect(PUBLIC_PRACTICE_GUIDE_WHERE.status).toBe(
      PracticeGuideStatus.PUBLISHED
    );
  });
});
