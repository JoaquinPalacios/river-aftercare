import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GuideRevisionStatus, PracticeGuideStatus } from "@prisma/client";

const prismaMock = vi.hoisted(() => ({
  clinic: { findUnique: vi.fn() },
  practiceGuide: { findMany: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({
  getPrisma: () => prismaMock,
}));

vi.mock("next/headers", () => ({
  headers: async () =>
    new Headers({
      host: "app.localhost:3000",
      "x-forwarded-proto": "http",
    }),
}));

import { getClinicPortalOverview } from "@/lib/clinic-portal/get-clinic-portal";
import { listClinicPortalGuides } from "@/lib/clinic-portal/list-clinic-guides";

function clinicRecord(input: {
  id: string;
  name: string;
  slug: string;
  displayName: string;
  phone: string;
  guides: Array<{ status: PracticeGuideStatus }>;
}) {
  return {
    id: input.id,
    name: input.name,
    practiceGuides: input.guides,
    sites: [
      {
        slug: input.slug,
        displayName: input.displayName,
        clinicId: input.id,
        logoUrl: "/demo/riverside-mark.svg",
        primaryColor: "#0f766e",
        accentColor: "#f59e0b",
        themeMode: "SYSTEM",
        locations: [
          {
            clinicId: input.id,
            phone: input.phone,
            contactUrl: "https://www.example.com/contact",
            emergencyInstructions: "Call the clinic.",
          },
        ],
      },
    ],
  };
}

const CLINIC_A = clinicRecord({
  id: "clinic_a",
  name: "Rivers Care Demo Clinic",
  slug: "demodental",
  displayName: "Riverside Dental Demo",
  phone: "02 5550 0100",
  guides: [{ status: PracticeGuideStatus.PUBLISHED }],
});

const CLINIC_B = clinicRecord({
  id: "clinic_b",
  name: "Harbor Family Dental",
  slug: "harbordental",
  displayName: "Harbor Family Dental",
  phone: "555-0199",
  guides: [{ status: PracticeGuideStatus.DRAFT }],
});

describe("clinic portal loaders", () => {
  const previousRoot = process.env.CARE_GUIDE_ROOT_DOMAIN;

  beforeEach(() => {
    process.env.CARE_GUIDE_ROOT_DOMAIN = "localhost";
    prismaMock.clinic.findUnique.mockReset();
    prismaMock.practiceGuide.findMany.mockReset();
  });

  afterEach(() => {
    if (previousRoot === undefined) {
      delete process.env.CARE_GUIDE_ROOT_DOMAIN;
    } else {
      process.env.CARE_GUIDE_ROOT_DOMAIN = previousRoot;
    }
  });

  it("loads overview data only for the requested clinic id", async () => {
    prismaMock.clinic.findUnique.mockImplementation(
      async ({ where }: { where: { id: string } }) => {
        if (where.id === CLINIC_A.id) {
          return CLINIC_A;
        }
        if (where.id === CLINIC_B.id) {
          return CLINIC_B;
        }
        return null;
      }
    );

    const overview = await getClinicPortalOverview(CLINIC_A.id);

    expect(prismaMock.clinic.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: CLINIC_A.id },
      })
    );
    expect(overview?.displayName).toBe("Riverside Dental Demo");
    expect(overview?.slug).toBe("demodental");
    expect(overview?.publishedGuideCount).toBe(1);
    expect(overview?.draftGuideCount).toBe(0);
    expect(overview?.patientSiteHref).toBe("http://demodental.localhost:3000/");
    expect(overview?.displayName).not.toBe("Harbor Family Dental");
    expect(JSON.stringify(overview)).not.toMatch(/session/i);
    expect(JSON.stringify(overview)).not.toMatch(/analytics/i);
  });

  it("lists only the authenticated clinic's guides and preview URLs", async () => {
    prismaMock.clinic.findUnique.mockResolvedValue({
      id: CLINIC_A.id,
      sites: [{ slug: "demodental", clinicId: CLINIC_A.id }],
    });
    prismaMock.practiceGuide.findMany.mockResolvedValue([
      {
        id: "pg_extraction",
        publicSlug: "extraction",
        status: PracticeGuideStatus.PUBLISHED,
        isEnabled: true,
        updatedAt: new Date("2026-09-01T00:00:00.000Z"),
        title: "Tooth Extraction",
        guideTemplate: {
          title: "Tooth Extraction",
          slug: "extraction",
          specialty: "DENTAL",
        },
        pinnedRevision: { status: GuideRevisionStatus.PUBLISHED },
        placements: [{ publicSlug: "extraction" }],
        contentRevisions: [
          {
            version: 1,
            status: GuideRevisionStatus.PUBLISHED,
            title: "Tooth Extraction",
            updatedAt: new Date("2026-09-01T00:00:00.000Z"),
            publishedAt: new Date("2026-09-01T00:00:00.000Z"),
          },
        ],
      },
      {
        id: "pg_draft",
        publicSlug: "draft-guide",
        status: PracticeGuideStatus.DRAFT,
        isEnabled: false,
        updatedAt: new Date("2026-09-02T00:00:00.000Z"),
        title: "Draft Guide",
        guideTemplate: {
          title: "Draft Guide",
          slug: "draft-guide",
          specialty: "DENTAL",
        },
        pinnedRevision: { status: GuideRevisionStatus.DRAFT },
        placements: [{ publicSlug: "draft-guide" }],
        contentRevisions: [],
      },
    ]);

    const guides = await listClinicPortalGuides(CLINIC_A.id);

    expect(prismaMock.practiceGuide.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { clinicId: CLINIC_A.id },
      })
    );
    expect(guides).toHaveLength(2);
    expect(guides[0]?.title).toBe("Tooth Extraction");
    expect(guides[0]?.previewHref).toBe(
      "http://demodental.localhost:3000/extraction"
    );
    expect(guides[1]?.previewHref).toBeNull();
    expect(guides.map((guide) => guide.title)).not.toContain("Wisdom Teeth");
    expect(guides.map((guide) => guide.title)).not.toContain("Root Canal");
  });

  it("does not return another clinic when asked for a missing id", async () => {
    prismaMock.clinic.findUnique.mockResolvedValue(null);

    await expect(getClinicPortalOverview("clinic_other")).resolves.toBeNull();
    expect(prismaMock.clinic.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "clinic_other" },
      })
    );
  });
});
