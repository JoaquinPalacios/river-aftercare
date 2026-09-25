import "dotenv/config";

import { afterAll, describe, expect, it } from "vitest";
import {
  ClinicMembershipRole,
  GuideRevisionStatus,
  PlatformRole,
  type PrismaClient,
} from "@prisma/client";

import { DEMO_AFTERCARE_TENANT_SLUG } from "@/lib/aftercare/demo-tenant";
import { ensurePrimarySiteForClinic } from "@/lib/clinics/primary-site-location.mjs";
import { getPublishedPracticeGuide } from "@/lib/aftercare/get-published-practice-guide";
import {
  createCustomPracticeGuide,
  createPracticeGuideFromTemplate,
} from "@/lib/clinic-portal/create-practice-guide";
import { ClinicPortalError } from "@/lib/clinic-portal/errors";
import { listCanonicalGuideTemplates } from "@/lib/clinic-portal/list-canonical-templates";
import { PRACTICE_REVIEW_ATTESTATION_REQUIRED_MESSAGE } from "@/lib/clinic-portal/practice-review-attestation";
import { publishPracticeGuide } from "@/lib/clinic-portal/publish-practice-guide";
import { savePracticeGuideDraft } from "@/lib/clinic-portal/save-practice-guide-draft";

const PREFIX = "test_gov_";
const SLUG = "test-gov-";
const CLINIC_ID = `${PREFIX}clinic`;
const DEMO_FALLBACK_ID = `${PREFIX}demo`;
const ADMIN_ID = `${PREFIX}admin`;
const STAFF_ID = `${PREFIX}staff`;
const OPERATOR_ID = `${PREFIX}operator`;
const SAMPLE_ID = `${PREFIX}sample`;
const MIXED_ID = `${PREFIX}mixed`;
const REVIEWED_ID = `${PREFIX}reviewed`;
const V1_ID = `${PREFIX}v1`;
const V2_ID = `${PREFIX}v2`;
const REVIEWED_V1_ID = `${PREFIX}rv1`;
const REVIEWED_V2_ID = `${PREFIX}rv2`;

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
        { clinicId: CLINIC_ID },
        { clinicId: DEMO_FALLBACK_ID },
        { publicSlug: { startsWith: SLUG } },
        { guideTemplateId: { startsWith: PREFIX } },
      ],
    },
  });
  await client.guideTemplate.deleteMany({
    where: { id: { startsWith: PREFIX } },
  });
  await client.clinicMembership.deleteMany({
    where: { userId: { in: [ADMIN_ID, STAFF_ID] } },
  });
  await client.clinic.deleteMany({
    where: { id: CLINIC_ID },
  });
  if (createdFallbackDemoClinic) {
    await client.clinic.deleteMany({
      where: { id: DEMO_FALLBACK_ID },
    });
    createdFallbackDemoClinic = false;
  }
  await client.user.deleteMany({
    where: { id: { in: [ADMIN_ID, STAFF_ID, OPERATOR_ID] } },
  });
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

async function resolveDemoClinicId(): Promise<string> {
  const existing = await db().clinic.findUnique({
    where: { slug: DEMO_AFTERCARE_TENANT_SLUG },
    select: { id: true },
  });
  if (existing) {
    await ensurePrimarySiteForClinic(db(), existing.id);
    return existing.id;
  }

  await db().clinic.create({
    data: {
      id: DEMO_FALLBACK_ID,
      name: "Demo governance clinic",
      slug: DEMO_AFTERCARE_TENANT_SLUG,
    },
  });
  createdFallbackDemoClinic = true;
  await ensurePrimarySiteForClinic(db(), DEMO_FALLBACK_ID);
  return DEMO_FALLBACK_ID;
}

async function seedActors() {
  await cleanup();
  await db().user.create({
    data: {
      id: ADMIN_ID,
      email: `${PREFIX}admin@example.test`,
      name: "Governance Admin",
      platformRole: PlatformRole.NONE,
    },
  });
  await db().user.create({
    data: {
      id: STAFF_ID,
      email: `${PREFIX}staff@example.test`,
      name: "Governance Staff",
      platformRole: PlatformRole.NONE,
    },
  });
  await db().user.create({
    data: {
      id: OPERATOR_ID,
      email: `${PREFIX}operator@example.test`,
      name: "Governance Operator",
      platformRole: PlatformRole.OPERATOR,
    },
  });
  await db().clinic.create({
    data: {
      id: CLINIC_ID,
      name: "Governance Clinic",
      slug: `${SLUG}clinic`,
      profile: { create: { displayName: "Governance Clinic" } },
    },
  });
  await ensurePrimarySiteForClinic(db(), CLINIC_ID);
  await db().clinicMembership.create({
    data: {
      clinicId: CLINIC_ID,
      userId: ADMIN_ID,
      role: ClinicMembershipRole.ADMIN,
    },
  });
  await db().clinicMembership.create({
    data: {
      clinicId: CLINIC_ID,
      userId: STAFF_ID,
      role: ClinicMembershipRole.STAFF,
    },
  });
}

const INTRO_SECTION = {
  key: "introduction",
  kind: "INTRODUCTION" as const,
  title: "About this guide",
  body: "Practice-owned recovery information.",
  periodLabel: null,
  startDay: null,
  endDay: null,
};

describe("first-clinic clinical governance", () => {
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

  it("hides sample templates from real clinics even when review metadata is populated", async (ctx) => {
    if (!(await connectOrSkip(ctx))) {
      return;
    }
    await seedActors();
    const demoClinicId = await resolveDemoClinicId();

    await db().guideTemplate.create({
      data: {
        id: SAMPLE_ID,
        slug: `${SLUG}sample-reviewed`,
        title: "Sample with review fields",
        specialty: "DENTAL",
        isActive: true,
        isSample: true,
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
                title: "Sample",
                body: "Sample body.",
                sortOrder: 1,
              },
            },
          },
        },
      },
    });

    const demo = await listCanonicalGuideTemplates(demoClinicId);
    const normal = await listCanonicalGuideTemplates(CLINIC_ID);
    expect(demo.templates.some((template) => template.id === SAMPLE_ID)).toBe(
      true
    );
    expect(
      demo.templates.find((template) => template.id === SAMPLE_ID)?.availability
    ).toBe("sample");
    expect(normal.templates.some((template) => template.id === SAMPLE_ID)).toBe(
      false
    );

    await expect(
      createPracticeGuideFromTemplate({
        clinicId: CLINIC_ID,
        actorUserId: ADMIN_ID,
        values: { templateId: SAMPLE_ID },
      })
    ).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof ClinicPortalError && error.code === "not_found"
    );
    expect(
      await db().practiceGuide.count({ where: { clinicId: CLINIC_ID } })
    ).toBe(0);
  });

  it("pins the exact reviewed latest revision and refuses unreviewed v2", async (ctx) => {
    if (!(await connectOrSkip(ctx))) {
      return;
    }
    await seedActors();

    await db().guideTemplate.create({
      data: {
        id: MIXED_ID,
        slug: `${SLUG}mixed`,
        title: "Mixed revision template",
        specialty: "DENTAL",
        isActive: true,
        isSample: false,
        revisions: {
          create: [
            {
              id: V1_ID,
              version: 1,
              status: GuideRevisionStatus.PUBLISHED,
              publishedAt: new Date("2026-09-01"),
              reviewedAt: new Date("2026-09-01"),
              reviewedBy: "Named clinical reviewer",
              sections: {
                create: {
                  key: "introduction",
                  kind: "INTRODUCTION",
                  title: "Reviewed v1",
                  body: "Reviewed v1 body.",
                  sortOrder: 1,
                },
              },
            },
            {
              id: V2_ID,
              version: 2,
              status: GuideRevisionStatus.PUBLISHED,
              publishedAt: new Date("2026-09-11"),
              reviewedAt: null,
              reviewedBy: null,
              sections: {
                create: {
                  key: "introduction",
                  kind: "INTRODUCTION",
                  title: "Unreviewed v2",
                  body: "Must not be pinned.",
                  sortOrder: 1,
                },
              },
            },
          ],
        },
      },
    });

    const listed = await listCanonicalGuideTemplates(CLINIC_ID);
    expect(listed.templates.some((template) => template.id === MIXED_ID)).toBe(
      false
    );
    await expect(
      createPracticeGuideFromTemplate({
        clinicId: CLINIC_ID,
        actorUserId: ADMIN_ID,
        values: { templateId: MIXED_ID },
      })
    ).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof ClinicPortalError && error.code === "not_found"
    );

    await db().guideTemplate.create({
      data: {
        id: REVIEWED_ID,
        slug: `${SLUG}reviewed`,
        title: "Reviewed latest",
        specialty: "DENTAL",
        isActive: true,
        isSample: false,
        revisions: {
          create: [
            {
              id: REVIEWED_V1_ID,
              version: 1,
              status: GuideRevisionStatus.PUBLISHED,
              publishedAt: new Date("2026-09-01"),
              reviewedAt: new Date("2026-09-01"),
              reviewedBy: "Named clinical reviewer",
              sections: {
                create: {
                  key: "introduction",
                  kind: "INTRODUCTION",
                  title: "Reviewed v1",
                  body: "Older reviewed body.",
                  sortOrder: 1,
                },
              },
            },
            {
              id: REVIEWED_V2_ID,
              version: 2,
              status: GuideRevisionStatus.PUBLISHED,
              publishedAt: new Date("2026-09-11"),
              reviewedAt: new Date("2026-09-11"),
              reviewedBy: "Named clinical reviewer",
              sections: {
                create: {
                  key: "introduction",
                  kind: "INTRODUCTION",
                  title: "Reviewed v2",
                  body: "Latest reviewed body.",
                  sortOrder: 1,
                },
              },
            },
          ],
        },
      },
    });

    const created = await createPracticeGuideFromTemplate({
      clinicId: CLINIC_ID,
      actorUserId: ADMIN_ID,
      values: { templateId: REVIEWED_ID },
    });
    const pinned = await db().practiceGuide.findUniqueOrThrow({
      where: { id: created.id },
      select: {
        guideTemplateId: true,
        pinnedRevisionId: true,
      },
    });
    expect(pinned.guideTemplateId).toBe(REVIEWED_ID);
    expect(pinned.pinnedRevisionId).toBe(REVIEWED_V2_ID);
    expect(pinned.pinnedRevisionId).not.toBe(REVIEWED_V1_ID);
  });

  it("requires a fresh clinic attestation on each real-clinic publication", async (ctx) => {
    if (!(await connectOrSkip(ctx))) {
      return;
    }
    await seedActors();
    const created = await createCustomPracticeGuide({
      clinicId: CLINIC_ID,
      actorUserId: ADMIN_ID,
      values: { title: "Custom socket care", publicSlug: `${SLUG}custom` },
    });
    const custom = await db().practiceGuide.findUniqueOrThrow({
      where: { id: created.id },
      select: { guideTemplateId: true, pinnedRevisionId: true },
    });
    expect(custom.guideTemplateId).toBeNull();
    expect(custom.pinnedRevisionId).toBeNull();

    await savePracticeGuideDraft({
      clinicId: CLINIC_ID,
      actorUserId: ADMIN_ID,
      values: {
        guideId: created.id,
        title: "Custom socket care",
        publicSlug: `${SLUG}custom`,
        introduction: "Draft introduction.",
        sections: [INTRO_SECTION],
      },
    });

    await expect(
      publishPracticeGuide({
        clinicId: CLINIC_ID,
        actorUserId: ADMIN_ID,
        guideId: created.id,
      })
    ).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof ClinicPortalError &&
        error.code === "invalid" &&
        error.message === PRACTICE_REVIEW_ATTESTATION_REQUIRED_MESSAGE
    );
    await expect(
      publishPracticeGuide({
        clinicId: CLINIC_ID,
        actorUserId: ADMIN_ID,
        guideId: created.id,
        reviewAttested: false,
      })
    ).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof ClinicPortalError && error.code === "invalid"
    );

    expect(
      await db().practiceGuideRevision.count({
        where: { practiceGuideId: created.id, version: { gt: 0 } },
      })
    ).toBe(0);
    expect(
      await getPublishedPracticeGuide({
        clinicSlug: `${SLUG}clinic`,
        publicSlug: `${SLUG}custom`,
      })
    ).toBeNull();

    const first = await publishPracticeGuide({
      clinicId: CLINIC_ID,
      actorUserId: ADMIN_ID,
      guideId: created.id,
      reviewAttested: true,
    });
    expect(first.version).toBe(1);

    const v1 = await db().practiceGuideRevision.findUniqueOrThrow({
      where: {
        practiceGuideId_version: {
          practiceGuideId: created.id,
          version: 1,
        },
      },
    });
    expect(v1.reviewAttestedByUserId).toBe(ADMIN_ID);
    expect(v1.reviewAttestedAt).not.toBeNull();
    expect(v1.createdByUserId).toBe(ADMIN_ID);
    const v1AttestedAt = v1.reviewAttestedAt;

    const publicDoc = await getPublishedPracticeGuide({
      clinicSlug: `${SLUG}clinic`,
      publicSlug: `${SLUG}custom`,
    });
    expect(publicDoc?.revision.version).toBe(1);
    expect(publicDoc).not.toHaveProperty("reviewAttestedAt");
    expect(publicDoc).not.toHaveProperty("reviewAttestedByUserId");
    expect(JSON.stringify(publicDoc)).not.toContain("Governance Admin");
    expect(JSON.stringify(publicDoc)).not.toContain(ADMIN_ID);

    await savePracticeGuideDraft({
      clinicId: CLINIC_ID,
      actorUserId: ADMIN_ID,
      values: {
        guideId: created.id,
        title: "Custom socket care v2",
        publicSlug: `${SLUG}custom`,
        introduction: "Newer draft.",
        sections: [
          {
            ...INTRO_SECTION,
            body: "Updated practice-owned recovery information.",
          },
        ],
      },
    });

    const draft = await db().practiceGuideRevision.findUniqueOrThrow({
      where: {
        practiceGuideId_version: {
          practiceGuideId: created.id,
          version: 0,
        },
      },
    });
    expect(draft.reviewAttestedAt).toBeNull();
    expect(draft.reviewAttestedByUserId).toBeNull();

    await expect(
      publishPracticeGuide({
        clinicId: CLINIC_ID,
        actorUserId: ADMIN_ID,
        guideId: created.id,
      })
    ).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof ClinicPortalError && error.code === "invalid"
    );

    await new Promise((resolve) => setTimeout(resolve, 10));
    const second = await publishPracticeGuide({
      clinicId: CLINIC_ID,
      actorUserId: ADMIN_ID,
      guideId: created.id,
      reviewAttested: true,
    });
    expect(second.version).toBe(2);

    const unchangedV1 = await db().practiceGuideRevision.findUniqueOrThrow({
      where: { id: v1.id },
    });
    expect(unchangedV1.title).toBe(v1.title);
    expect(unchangedV1.reviewAttestedAt?.toISOString()).toBe(
      v1AttestedAt?.toISOString()
    );
    expect(unchangedV1.reviewAttestedByUserId).toBe(ADMIN_ID);

    const v2 = await db().practiceGuideRevision.findUniqueOrThrow({
      where: {
        practiceGuideId_version: {
          practiceGuideId: created.id,
          version: 2,
        },
      },
    });
    expect(v2.reviewAttestedByUserId).toBe(ADMIN_ID);
    expect(v2.reviewAttestedAt).not.toBeNull();
    expect(v2.reviewAttestedAt?.getTime()).toBeGreaterThan(
      v1AttestedAt?.getTime() ?? 0
    );
  });

  it("blocks STAFF and unknown actors from attesting, and lets operators publish for support", async (ctx) => {
    if (!(await connectOrSkip(ctx))) {
      return;
    }
    await seedActors();
    const created = await createCustomPracticeGuide({
      clinicId: CLINIC_ID,
      actorUserId: ADMIN_ID,
      values: { title: "Auth guide", publicSlug: `${SLUG}auth` },
    });
    await savePracticeGuideDraft({
      clinicId: CLINIC_ID,
      actorUserId: ADMIN_ID,
      values: {
        guideId: created.id,
        title: "Auth guide",
        publicSlug: `${SLUG}auth`,
        introduction: "Draft.",
        sections: [INTRO_SECTION],
      },
    });

    await expect(
      publishPracticeGuide({
        clinicId: CLINIC_ID,
        actorUserId: STAFF_ID,
        guideId: created.id,
        reviewAttested: true,
      })
    ).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof ClinicPortalError && error.code === "forbidden"
    );
    await expect(
      publishPracticeGuide({
        clinicId: CLINIC_ID,
        actorUserId: OPERATOR_ID,
        guideId: created.id,
        reviewAttested: true,
      })
    ).resolves.toMatchObject({ version: 1 });
    await expect(
      publishPracticeGuide({
        clinicId: CLINIC_ID,
        actorUserId: "missing-user",
        guideId: created.id,
        reviewAttested: true,
      })
    ).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof ClinicPortalError && error.code === "forbidden"
    );
    expect(
      await db().practiceGuideRevision.count({
        where: { practiceGuideId: created.id, version: { gt: 0 } },
      })
    ).toBe(1);
  });

  it("lets demodental publish without fabricating clinical attestation", async (ctx) => {
    if (!(await connectOrSkip(ctx))) {
      return;
    }
    await seedActors();
    const demoClinicId = await resolveDemoClinicId();
    await db().clinicMembership.create({
      data: {
        clinicId: demoClinicId,
        userId: ADMIN_ID,
        role: ClinicMembershipRole.ADMIN,
      },
    });

    const created = await createCustomPracticeGuide({
      clinicId: demoClinicId,
      actorUserId: ADMIN_ID,
      values: { title: "Demo custom", publicSlug: `${SLUG}demo` },
    });
    await savePracticeGuideDraft({
      clinicId: demoClinicId,
      actorUserId: ADMIN_ID,
      values: {
        guideId: created.id,
        title: "Demo custom",
        publicSlug: `${SLUG}demo`,
        introduction: "Demo draft.",
        sections: [INTRO_SECTION],
      },
    });

    const published = await publishPracticeGuide({
      clinicId: demoClinicId,
      actorUserId: ADMIN_ID,
      guideId: created.id,
    });
    expect(published.version).toBe(1);
    const revision = await db().practiceGuideRevision.findUniqueOrThrow({
      where: {
        practiceGuideId_version: {
          practiceGuideId: created.id,
          version: 1,
        },
      },
    });
    expect(revision.reviewAttestedAt).toBeNull();
    expect(revision.reviewAttestedByUserId).toBeNull();
    expect(revision.createdByUserId).toBe(ADMIN_ID);
  });
});
