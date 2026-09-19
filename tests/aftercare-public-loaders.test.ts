import { beforeEach, describe, expect, it, vi } from "vitest";

import { GuideRevisionStatus, PracticeGuideStatus } from "@prisma/client";

const prismaMock = vi.hoisted(() => ({
  clinic: { findUnique: vi.fn() },
  practiceGuide: { findFirst: vi.fn(), findMany: vi.fn() },
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
    prismaMock.practiceGuide.findFirst.mockResolvedValue(
      publishedGuideRecord()
    );

    const result = await getPublishedPracticeGuide({
      clinicSlug: "demodental",
      publicSlug: "extraction",
    });

    expect(prismaMock.practiceGuide.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          publicSlug: "extraction",
          clinic: { slug: "demodental" },
          ...PUBLIC_PRACTICE_GUIDE_WHERE,
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
    prismaMock.practiceGuide.findFirst.mockResolvedValue(null);

    await expect(
      getPublishedPracticeGuide({
        clinicSlug: "demodental",
        publicSlug: "extraction",
      })
    ).resolves.toBeNull();

    expect(
      prismaMock.practiceGuide.findFirst.mock.calls[0]?.[0].where.status
    ).toBe(PracticeGuideStatus.PUBLISHED);
  });

  it("does not resolve a disabled PracticeGuide", async () => {
    prismaMock.practiceGuide.findFirst.mockResolvedValue(null);

    await expect(
      getPublishedPracticeGuide({
        clinicSlug: "demodental",
        publicSlug: "extraction",
      })
    ).resolves.toBeNull();

    expect(
      prismaMock.practiceGuide.findFirst.mock.calls[0]?.[0].where.isEnabled
    ).toBe(true);
  });

  it("does not resolve a guide whose pinned revision is still draft", async () => {
    prismaMock.practiceGuide.findFirst.mockResolvedValue(null);

    await expect(
      getPublishedPracticeGuide({
        clinicSlug: "demodental",
        publicSlug: "extraction",
      })
    ).resolves.toBeNull();

    expect(
      prismaMock.practiceGuide.findFirst.mock.calls[0]?.[0].where.OR
    ).toEqual(PUBLIC_PRACTICE_GUIDE_WHERE.OR);
  });

  it("does not resolve an unknown guide slug", async () => {
    prismaMock.practiceGuide.findFirst.mockResolvedValue(null);

    await expect(
      getPublishedPracticeGuide({
        clinicSlug: "demodental",
        publicSlug: "unknown-guide",
      })
    ).resolves.toBeNull();
  });

  it("does not let clinic B load clinic A's PracticeGuide", async () => {
    prismaMock.practiceGuide.findFirst.mockResolvedValue(null);

    const result = await getPublishedPracticeGuide({
      clinicSlug: "otherclinic",
      publicSlug: "extraction",
    });

    expect(result).toBeNull();
    expect(prismaMock.practiceGuide.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          publicSlug: "extraction",
          clinic: { slug: "otherclinic" },
          ...PUBLIC_PRACTICE_GUIDE_WHERE,
        }),
      })
    );
  });

  it("does not return clinic A override, addition, or profile to clinic B", async () => {
    prismaMock.clinic.findUnique.mockResolvedValue(CLINIC_B);
    prismaMock.practiceGuide.findMany.mockResolvedValue([]);

    const listed = await listPublishedPracticeGuides("otherclinic");

    expect(listed?.clinic.id).toBe(CLINIC_B.id);
    expect(listed?.profile?.displayName).toBe("Other Clinic Patient Brand");
    expect(listed?.profile?.phone).toBe("555-0199");
    expect(listed?.profile?.bookingUrl).toBe("https://example.test/book");
    expect(listed?.guides).toEqual([]);
    expect(prismaMock.practiceGuide.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          clinicId: CLINIC_B.id,
          ...PUBLIC_PRACTICE_GUIDE_WHERE,
        }),
        orderBy: [{ sortOrder: "asc" }, { publicSlug: "asc" }],
      })
    );
  });

  it("returns null for an unknown clinic slug", async () => {
    prismaMock.clinic.findUnique.mockResolvedValue(null);
    prismaMock.practiceGuide.findFirst.mockResolvedValue(null);

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
    expect(prismaMock.practiceGuide.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          clinic: { slug: "missingclinic" },
        }),
      })
    );
  });
});
