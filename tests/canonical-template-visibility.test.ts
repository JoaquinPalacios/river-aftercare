import "dotenv/config";

import { afterAll, describe, expect, it } from "vitest";
import { GuideRevisionStatus, type PrismaClient } from "@prisma/client";

import { DEMO_AFTERCARE_TENANT_SLUG } from "@/lib/aftercare/demo-tenant";
import { DEMO_EXTRACTION_TEMPLATE_SLUG } from "@/lib/aftercare/demo-extraction-template";
import { createPracticeGuideFromTemplate } from "@/lib/clinic-portal/create-practice-guide";
import { ClinicPortalError } from "@/lib/clinic-portal/errors";
import { listCanonicalGuideTemplates } from "@/lib/clinic-portal/list-canonical-templates";

const PREFIX = "test_tmpl_vis_";
const SLUG = "test-tmpl-vis-";
const FALLBACK_DEMO_CLINIC_ID = `${PREFIX}demo`;
const NORMAL_CLINIC_ID = `${PREFIX}normal`;
const USER_ID = `${PREFIX}admin`;
const SAMPLE_TEMPLATE_ID = `${PREFIX}sample`;
const REVIEWED_TEMPLATE_ID = `${PREFIX}reviewed`;
const INACTIVE_TEMPLATE_ID = `${PREFIX}inactive`;
const DRAFT_TEMPLATE_ID = `${PREFIX}draft`;
const UNREVIEWED_GENERIC_ID = `${PREFIX}unreviewed`;

let createdFallbackDemoClinic = false;
let prisma: PrismaClient | null = null;

function db(): PrismaClient {
  if (!prisma) {
    throw new Error("Prisma is not connected.");
  }
  return prisma;
}

async function cleanup() {
  const client = db();
  await client.practiceGuide.deleteMany({
    where: {
      OR: [
        { clinicId: NORMAL_CLINIC_ID },
        { guideTemplateId: { startsWith: PREFIX } },
      ],
    },
  });
  await client.guideTemplate.deleteMany({
    where: { id: { startsWith: PREFIX } },
  });
  await client.clinic.deleteMany({
    where: { id: NORMAL_CLINIC_ID },
  });
  if (createdFallbackDemoClinic) {
    await client.clinic.deleteMany({
      where: { id: FALLBACK_DEMO_CLINIC_ID },
    });
    createdFallbackDemoClinic = false;
  }
  await client.user.deleteMany({ where: { id: USER_ID } });
}

async function resolveDemoClinicId(): Promise<string> {
  const client = db();
  const existing = await client.clinic.findUnique({
    where: { slug: DEMO_AFTERCARE_TENANT_SLUG },
    select: { id: true },
  });
  if (existing) {
    return existing.id;
  }

  await client.clinic.create({
    data: {
      id: FALLBACK_DEMO_CLINIC_ID,
      name: "Demo visibility clinic",
      slug: DEMO_AFTERCARE_TENANT_SLUG,
    },
  });
  createdFallbackDemoClinic = true;
  return FALLBACK_DEMO_CLINIC_ID;
}

async function seedFixtures() {
  await cleanup();
  const client = db();
  await client.user.create({
    data: {
      id: USER_ID,
      email: `${PREFIX}admin@example.test`,
      name: "Template visibility admin",
    },
  });
  const demoClinicId = await resolveDemoClinicId();
  await client.clinic.create({
    data: {
      id: NORMAL_CLINIC_ID,
      name: "Normal visibility clinic",
      slug: `${SLUG}normal`,
    },
  });
  return demoClinicId;
}

async function connectOrSkip(ctx: { skip: () => void }): Promise<boolean> {
  try {
    const { getPrisma } = await import("@/lib/prisma");
    prisma = getPrisma();
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    ctx.skip();
    return false;
  }
}

describe("canonical template visibility and enablement", () => {
  afterAll(async () => {
    if (!prisma) {
      return;
    }
    try {
      await cleanup();
    } catch {
      // No local Postgres in this environment.
    }
    await prisma.$disconnect();
  });

  it("shows sample templates only to demodental and reviewed templates to normal clinics", async (ctx) => {
    if (!(await connectOrSkip(ctx))) {
      return;
    }
    const demoClinicId = await seedFixtures();

    await db().guideTemplate.create({
      data: {
        id: SAMPLE_TEMPLATE_ID,
        slug: `${SLUG}sample`,
        title: "Sample crown",
        specialty: "DENTAL",
        isActive: true,
        isSample: true,
        revisions: {
          create: {
            version: 1,
            status: GuideRevisionStatus.PUBLISHED,
            publishedAt: new Date("2026-09-01"),
            reviewedAt: null,
            reviewedBy: null,
            sections: {
              create: {
                key: "introduction",
                kind: "INTRODUCTION",
                title: "Sample",
                body: "Sample body.",
                sortOrder: 1,
              },
            },
          },
        },
      },
    });

    await db().guideTemplate.create({
      data: {
        id: REVIEWED_TEMPLATE_ID,
        slug: `${SLUG}reviewed`,
        title: "Reviewed filling",
        specialty: "DENTAL",
        isActive: true,
        revisions: {
          create: {
            version: 1,
            status: GuideRevisionStatus.PUBLISHED,
            publishedAt: new Date("2026-09-01"),
            reviewedAt: new Date("2026-09-01"),
            reviewedBy: "Named clinical reviewer",
            sections: {
              create: {
                key: "introduction",
                kind: "INTRODUCTION",
                title: "Reviewed",
                body: "Reviewed body.",
                sortOrder: 1,
              },
            },
          },
        },
      },
    });

    await db().guideTemplate.create({
      data: {
        id: INACTIVE_TEMPLATE_ID,
        slug: `${SLUG}inactive`,
        title: "Inactive reviewed",
        specialty: "DENTAL",
        isActive: false,
        revisions: {
          create: {
            version: 1,
            status: GuideRevisionStatus.PUBLISHED,
            publishedAt: new Date("2026-09-01"),
            reviewedAt: new Date("2026-09-01"),
            reviewedBy: "Named clinical reviewer",
            sections: {
              create: {
                key: "introduction",
                kind: "INTRODUCTION",
                title: "Hidden",
                body: "Hidden.",
                sortOrder: 1,
              },
            },
          },
        },
      },
    });

    await db().guideTemplate.create({
      data: {
        id: DRAFT_TEMPLATE_ID,
        slug: `${SLUG}draft`,
        title: "Draft only",
        specialty: "DENTAL",
        isActive: true,
        revisions: {
          create: {
            version: 1,
            status: GuideRevisionStatus.DRAFT,
            reviewedAt: new Date("2026-09-01"),
            reviewedBy: "Named clinical reviewer",
            sections: {
              create: {
                key: "introduction",
                kind: "INTRODUCTION",
                title: "Draft",
                body: "Draft.",
                sortOrder: 1,
              },
            },
          },
        },
      },
    });

    await db().guideTemplate.create({
      data: {
        id: UNREVIEWED_GENERIC_ID,
        slug: `${SLUG}unreviewed`,
        title: "Unreviewed published",
        specialty: "DENTAL",
        isActive: true,
        revisions: {
          create: {
            version: 1,
            status: GuideRevisionStatus.PUBLISHED,
            publishedAt: new Date("2026-09-01"),
            reviewedAt: null,
            reviewedBy: null,
            sections: {
              create: {
                key: "introduction",
                kind: "INTRODUCTION",
                title: "Unreviewed",
                body: "Must not masquerade as reviewed.",
                sortOrder: 1,
              },
            },
          },
        },
      },
    });

    const demo = await listCanonicalGuideTemplates(demoClinicId);
    const normal = await listCanonicalGuideTemplates(NORMAL_CLINIC_ID);

    expect(demo.isDemoTenant).toBe(true);
    expect(normal.isDemoTenant).toBe(false);

    const demoIds = new Set(demo.templates.map((template) => template.id));
    const normalIds = new Set(normal.templates.map((template) => template.id));

    expect(demoIds.has(SAMPLE_TEMPLATE_ID)).toBe(true);
    expect(demoIds.has(REVIEWED_TEMPLATE_ID)).toBe(true);
    expect(demoIds.has(UNREVIEWED_GENERIC_ID)).toBe(false);
    expect(demoIds.has(INACTIVE_TEMPLATE_ID)).toBe(false);
    expect(demoIds.has(DRAFT_TEMPLATE_ID)).toBe(false);

    expect(normalIds.has(REVIEWED_TEMPLATE_ID)).toBe(true);
    expect(normalIds.has(SAMPLE_TEMPLATE_ID)).toBe(false);
    expect(normalIds.has(UNREVIEWED_GENERIC_ID)).toBe(false);
    expect(
      normal.templates.find((template) => template.id === REVIEWED_TEMPLATE_ID)
        ?.availability
    ).toBe("reviewed");

    const seededExtraction = demo.templates.find(
      (template) => template.slug === DEMO_EXTRACTION_TEMPLATE_SLUG
    );
    if (seededExtraction) {
      expect(seededExtraction.availability).toBe("sample");
      expect(seededExtraction.title).toBe("Tooth Extraction");
      expect(
        normal.templates.some(
          (template) => template.slug === DEMO_EXTRACTION_TEMPLATE_SLUG
        )
      ).toBe(false);
    }
  });

  it("lets demodental enable a sample template, defaults publicSlug, and blocks other clinics", async (ctx) => {
    if (!(await connectOrSkip(ctx))) {
      return;
    }
    const demoClinicId = await seedFixtures();

    await db().guideTemplate.create({
      data: {
        id: SAMPLE_TEMPLATE_ID,
        slug: `${SLUG}enable`,
        title: "Tooth Extraction sample",
        specialty: "DENTAL",
        isActive: true,
        isSample: true,
        revisions: {
          create: {
            version: 1,
            status: GuideRevisionStatus.PUBLISHED,
            publishedAt: new Date("2026-09-01"),
            reviewedAt: null,
            reviewedBy: null,
            sections: {
              create: {
                key: "introduction",
                kind: "INTRODUCTION",
                title: "After your extraction",
                body: "Sample body.",
                sortOrder: 1,
              },
            },
          },
        },
      },
    });

    const created = await createPracticeGuideFromTemplate({
      clinicId: demoClinicId,
      actorUserId: USER_ID,
      values: { templateId: SAMPLE_TEMPLATE_ID },
    });
    const demoGuide = await db().practiceGuide.findUniqueOrThrow({
      where: { id: created.id },
      select: { publicSlug: true, clinicId: true },
    });
    expect(demoGuide.publicSlug).toBe(`${SLUG}enable`);
    expect(demoGuide.clinicId).toBe(demoClinicId);

    await expect(
      createPracticeGuideFromTemplate({
        clinicId: demoClinicId,
        actorUserId: USER_ID,
        values: { templateId: SAMPLE_TEMPLATE_ID },
      })
    ).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof ClinicPortalError && error.code === "conflict"
    );

    await expect(
      createPracticeGuideFromTemplate({
        clinicId: NORMAL_CLINIC_ID,
        actorUserId: USER_ID,
        values: { templateId: SAMPLE_TEMPLATE_ID },
      })
    ).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof ClinicPortalError && error.code === "not_found"
    );
    expect(
      await db().practiceGuide.count({
        where: { clinicId: NORMAL_CLINIC_ID },
      })
    ).toBe(0);

    expect(DEMO_EXTRACTION_TEMPLATE_SLUG).toBe("extraction");

    // The shared demodental clinic may already occupy publicSlug "extraction".
    // Defaulting is proved above on this test's own template slug. Here, only
    // assert that a non-demo clinic still cannot enable the canonical sample.
    const extraction = await db().guideTemplate.findUnique({
      where: { slug: DEMO_EXTRACTION_TEMPLATE_SLUG },
      select: { id: true },
    });
    if (extraction) {
      await expect(
        createPracticeGuideFromTemplate({
          clinicId: NORMAL_CLINIC_ID,
          actorUserId: USER_ID,
          values: { templateId: extraction.id },
        })
      ).rejects.toSatisfy(
        (error: unknown) =>
          error instanceof ClinicPortalError && error.code === "not_found"
      );
      expect(
        await db().practiceGuide.count({
          where: {
            clinicId: NORMAL_CLINIC_ID,
            guideTemplateId: extraction.id,
          },
        })
      ).toBe(0);
    }
  });
});
