import "dotenv/config";

import { GuideRevisionStatus, type PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";

import { adaptPracticeGuideFromTemplate } from "@/lib/clinic-portal/adapt-practice-guide";
import {
  createCustomPracticeGuide,
  createPracticeGuideFromTemplate,
} from "@/lib/clinic-portal/create-practice-guide";
import { ClinicPortalError } from "@/lib/clinic-portal/errors";
import { detachPlacementGuide } from "@/lib/clinic-portal/guide-placements";
import { setGuideAvailableAtLocation } from "@/lib/clinic-portal/guide-placements";
import { listCanonicalGuideTemplates } from "@/lib/clinic-portal/list-canonical-templates";
import { publishPracticeGuide } from "@/lib/clinic-portal/publish-practice-guide";
import { savePracticeGuideDraft } from "@/lib/clinic-portal/save-practice-guide-draft";
import { withSampleCategoryLock } from "@/tests/active-sample-slot";
import { ensurePrimarySiteForClinic } from "@/lib/clinics/primary-site-location.mjs";
import {
  assignPrimarySiteServiceCategories,
  copyClinicSiteServiceCategories,
  replaceClinicSiteServiceCategories,
} from "@/lib/clinics/site-service-categories";

const PREFIX = "test_svc_cat_";

let prisma: PrismaClient | null = null;

function db(): PrismaClient {
  if (!prisma) {
    throw new Error("Prisma is not connected.");
  }
  return prisma;
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

async function cleanup() {
  await db().clinic.deleteMany({ where: { id: { startsWith: PREFIX } } });
  await db().guideTemplate.deleteMany({
    where: { id: { startsWith: PREFIX } },
  });
  await db().user.deleteMany({ where: { id: { startsWith: PREFIX } } });
}

async function createAccount(key: string) {
  const clinicId = `${PREFIX}${key}`;
  const userId = `${PREFIX}user_${key}`;
  await db().user.create({
    data: {
      id: userId,
      email: `${key}@svc.example.test`,
      name: key,
    },
  });
  await db().clinic.create({
    data: {
      id: clinicId,
      name: key,
      slug: `${PREFIX}${key}`.replaceAll("_", "-"),
      profile: { create: { displayName: key } },
      memberships: { create: { userId, role: "ADMIN" } },
      entitlement: {
        create: {
          commercialPlan: "PRACTICE",
          billingInterval: "MONTHLY",
          billingStatus: "ACTIVE",
          entitlementStatus: "ACTIVE",
        },
      },
    },
  });
  await ensurePrimarySiteForClinic(db(), clinicId);
  const site = await db().clinicSite.findFirstOrThrow({
    where: { clinicId, isPrimary: true },
    include: { locations: true },
  });
  return { clinicId, userId, site };
}

async function addSite(
  clinicId: string,
  key: string,
  categories: Array<
    "DENTAL" | "PHYSIOTHERAPY" | "CHIROPRACTIC" | "COSMETIC_AESTHETIC"
  >
) {
  const site = await db().clinicSite.create({
    data: {
      clinicId,
      name: key,
      slug: `${PREFIX}${key}`.replaceAll("_", "-"),
      displayName: key,
      active: true,
      isPrimary: false,
      serviceCategories: {
        create: categories.map((serviceCategory) => ({
          serviceCategory,
        })),
      },
    },
  });
  const location = await db().clinicLocation.create({
    data: {
      clinicSiteId: site.id,
      clinicId,
      name: `${key} rooms`,
      displayName: `${key} rooms`,
      slug: null,
      isPrimary: true,
      servesSiteRoot: true,
      active: true,
    },
  });
  return { site, location };
}

async function createReviewedTemplate(
  key: string,
  serviceCategory: "DENTAL" | "PHYSIOTHERAPY",
  instructions = false
) {
  const reviewerId = `${PREFIX}reviewer`;
  await db().user.upsert({
    where: { id: reviewerId },
    update: {},
    create: {
      id: reviewerId,
      email: `${PREFIX}reviewer@example.test`,
      name: "Fixture reviewer",
    },
  });
  return db().guideTemplate.create({
    data: {
      id: `${PREFIX}${key}`,
      slug: `${PREFIX}${key}`.replaceAll("_", "-"),
      title: `${key} placeholder`,
      serviceCategory,
      isActive: true,
      isSample: false,
      revisions: {
        create: {
          version: 1,
          status: GuideRevisionStatus.PUBLISHED,
          publishedAt: new Date("2026-09-01T00:00:00.000Z"),
          reviewedAt: new Date("2026-09-01T00:00:00.000Z"),
          reviewerName: "Fixture reviewer",
          reviewRecordedByUserId: `${PREFIX}reviewer`,
          sections: {
            create: {
              key: instructions ? "plan" : "introduction",
              kind: instructions ? "HOME_CARE_PLAN" : "INTRODUCTION",
              title: instructions ? "Home care plan" : "Introduction",
              body: instructions ? "" : "Placeholder body.",
              sortOrder: 1,
              ...(instructions
                ? {
                    homeCareInstructions: {
                      create: [
                        {
                          key: "repeat",
                          title: "Repeated movement",
                          frequencyCount: 3,
                          frequencyPeriod: "WEEK",
                          durationValue: 4,
                          durationUnit: "WEEKS",
                          sortOrder: 1,
                        },
                      ],
                    },
                  }
                : {}),
            },
          },
        },
      },
    },
  });
}

describe("service categories and guide classification", () => {
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

  it("stores one or more unique site categories and rejects another account", async (ctx) => {
    if (!(await connectOrSkip(ctx))) {
      return;
    }
    await cleanup();
    const dental = await createAccount("dental");
    await replaceClinicSiteServiceCategories({
      clinicId: dental.clinicId,
      siteId: dental.site.id,
      serviceCategories: ["DENTAL"],
    });
    await replaceClinicSiteServiceCategories({
      clinicId: dental.clinicId,
      siteId: dental.site.id,
      serviceCategories: ["DENTAL", "COSMETIC_AESTHETIC", "DENTAL"],
    });
    const rows = await db().clinicSiteServiceCategory.findMany({
      where: { clinicSiteId: dental.site.id },
      orderBy: { serviceCategory: "asc" },
    });
    expect(rows.map((row) => row.serviceCategory)).toEqual([
      "DENTAL",
      "COSMETIC_AESTHETIC",
    ]);
    await expect(
      db().clinicSiteServiceCategory.create({
        data: {
          clinicSiteId: dental.site.id,
          clinicId: dental.clinicId,
          serviceCategory: "DENTAL",
        },
      })
    ).rejects.toThrow();

    const other = await createAccount("other");
    await expect(
      replaceClinicSiteServiceCategories({
        clinicId: other.clinicId,
        siteId: dental.site.id,
        serviceCategories: ["PHYSIOTHERAPY"],
      })
    ).rejects.toMatchObject({ code: "not_found" });
    const location = dental.site.locations[0];
    expect(location?.clinicSiteId).toBe(dental.site.id);
    expect(location).not.toHaveProperty("serviceCategory");
  });

  it("filters canonical templates by the union of site categories", async (ctx) => {
    if (!(await connectOrSkip(ctx))) {
      return;
    }
    await cleanup();
    const dentalTemplate = await createReviewedTemplate("dental_tpl", "DENTAL");
    const physioTemplate = await createReviewedTemplate(
      "physio_tpl",
      "PHYSIOTHERAPY"
    );
    await withSampleCategoryLock(["COSMETIC_AESTHETIC"], async () => {
      try {
        await db().guideTemplate.create({
          data: {
            id: `${PREFIX}sample_tpl`,
            slug: `${PREFIX}sample-tpl`,
            title: "Sample placeholder",
            serviceCategory: "COSMETIC_AESTHETIC",
            isActive: true,
            isSample: true,
            revisions: {
              create: {
                version: 1,
                status: GuideRevisionStatus.PUBLISHED,
                publishedAt: new Date("2026-09-01T00:00:00.000Z"),
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

        const dental = await createAccount("onlydental");
        await assignPrimarySiteServiceCategories(db(), dental.clinicId, [
          "DENTAL",
        ]);
        const dentalList = await listCanonicalGuideTemplates(dental.clinicId);
        expect(dentalList.templates.map((template) => template.id)).toContain(
          dentalTemplate.id
        );
        expect(
          dentalList.templates.map((template) => template.id)
        ).not.toContain(physioTemplate.id);
        expect(
          dentalList.templates.map((template) => template.id)
        ).not.toContain(`${PREFIX}sample_tpl`);

        const physio = await createAccount("onlyphysio");
        await assignPrimarySiteServiceCategories(db(), physio.clinicId, [
          "PHYSIOTHERAPY",
        ]);
        const physioList = await listCanonicalGuideTemplates(physio.clinicId);
        expect(physioList.templates.map((template) => template.id)).toContain(
          physioTemplate.id
        );
        expect(
          physioList.templates.every(
            (template) => template.serviceCategory === "PHYSIOTHERAPY"
          )
        ).toBe(true);

        const mixed = await createAccount("mixed");
        await assignPrimarySiteServiceCategories(db(), mixed.clinicId, [
          "DENTAL",
        ]);
        await addSite(mixed.clinicId, "mixed-cosmetic", ["COSMETIC_AESTHETIC"]);
        await addSite(mixed.clinicId, "mixed-physio", ["PHYSIOTHERAPY"]);
        const mixedList = await listCanonicalGuideTemplates(mixed.clinicId);
        const mixedIds = mixedList.templates.map((template) => template.id);
        expect(mixedIds).toContain(dentalTemplate.id);
        expect(mixedIds).toContain(physioTemplate.id);
        expect(mixedIds).not.toContain(`${PREFIX}sample_tpl`);
        expect(
          mixedList.templates.every((template) =>
            ["DENTAL", "PHYSIOTHERAPY"].includes(template.serviceCategory)
          )
        ).toBe(true);
        expect(mixedList.serviceCategories).toEqual([
          "DENTAL",
          "PHYSIOTHERAPY",
          "COSMETIC_AESTHETIC",
        ]);

        const blank = await createAccount("blank");
        const blankList = await listCanonicalGuideTemplates(blank.clinicId);
        expect(blankList.templates).toEqual([]);
        expect(blankList.templatesNeedServiceCategories).toBe(true);

        await expect(
          createPracticeGuideFromTemplate({
            clinicId: physio.clinicId,
            actorUserId: physio.userId,
            values: { templateId: dentalTemplate.id },
          })
        ).rejects.toBeInstanceOf(ClinicPortalError);
      } finally {
        await db().guideTemplate.deleteMany({
          where: { id: `${PREFIX}sample_tpl` },
        });
      }
    });
  });

  it("inherits, preserves, and leaves legacy custom guides unclassified", async (ctx) => {
    if (!(await connectOrSkip(ctx))) {
      return;
    }
    await cleanup();
    const template = await createReviewedTemplate(
      "inherit",
      "PHYSIOTHERAPY",
      true
    );
    const account = await createAccount("inherit");
    await assignPrimarySiteServiceCategories(db(), account.clinicId, [
      "PHYSIOTHERAPY",
    ]);
    const created = await createPracticeGuideFromTemplate({
      clinicId: account.clinicId,
      actorUserId: account.userId,
      values: { templateId: template.id },
    });
    const createdGuide = await db().practiceGuide.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect(createdGuide.serviceCategory).toBe("PHYSIOTHERAPY");
    const draft = await db().practiceGuideRevision.findFirstOrThrow({
      where: { practiceGuideId: created.id, version: 0 },
      include: {
        sections: { include: { homeCareInstructions: true } },
      },
    });
    expect(draft.sections[0]?.homeCareInstructions[0]).toMatchObject({
      title: "Repeated movement",
      frequencyCount: 3,
      frequencyPeriod: "WEEK",
      durationValue: 4,
      durationUnit: "WEEKS",
    });

    await adaptPracticeGuideFromTemplate({
      clinicId: account.clinicId,
      guideId: created.id,
    });
    const adapted = await db().practiceGuide.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect(adapted.serviceCategory).toBe("PHYSIOTHERAPY");
    expect(adapted.guideTemplateId).toBeNull();

    await savePracticeGuideDraft({
      clinicId: account.clinicId,
      actorUserId: account.userId,
      values: {
        guideId: created.id,
        title: "Adapted placeholder",
        publicSlug: createdGuide.publicSlug,
        introduction: null,
        sections: [
          {
            key: "plan",
            kind: "HOME_CARE_PLAN",
            title: "Home care plan",
            body: "",
            periodLabel: null,
            startDay: null,
            endDay: null,
            homeCareInstructions: [
              {
                key: "repeat",
                title: "Repeated movement",
                body: null,
                frequencyCount: 3,
                frequencyPeriod: "WEEK",
                timingLabel: null,
                durationValue: 4,
                durationUnit: "WEEKS",
              },
            ],
          },
        ],
      },
    });
    await publishPracticeGuide({
      clinicId: account.clinicId,
      actorUserId: account.userId,
      guideId: created.id,
    });
    const published = await db().practiceGuideRevision.findFirstOrThrow({
      where: { practiceGuideId: created.id, status: "PUBLISHED" },
      include: { sections: { include: { homeCareInstructions: true } } },
    });
    await savePracticeGuideDraft({
      clinicId: account.clinicId,
      actorUserId: account.userId,
      values: {
        guideId: created.id,
        title: "Later draft",
        publicSlug: createdGuide.publicSlug,
        introduction: null,
        sections: [
          {
            key: "plan",
            kind: "HOME_CARE_PLAN",
            title: "Changed plan",
            body: "",
            periodLabel: null,
            startDay: null,
            endDay: null,
            homeCareInstructions: [
              {
                key: "repeat",
                title: "Changed instruction",
                body: null,
                frequencyCount: 1,
                frequencyPeriod: "DAY",
                timingLabel: null,
                durationValue: 1,
                durationUnit: "DAYS",
              },
            ],
          },
        ],
      },
    });
    const publishedAfter =
      await db().practiceGuideHomeCareInstruction.findFirstOrThrow({
        where: { sectionId: published.sections[0]!.id },
      });
    expect(publishedAfter.title).toBe("Repeated movement");
    expect(publishedAfter.frequencyCount).toBe(3);

    const root = account.site.locations[0]!;
    const extra = await addSite(account.clinicId, "inherit-rooms", [
      "PHYSIOTHERAPY",
    ]);
    const placement = await db().practiceGuidePlacement.create({
      data: {
        clinicId: account.clinicId,
        practiceGuideId: created.id,
        locationId: extra.location.id,
        publicSlug: createdGuide.publicSlug,
        isEnabled: true,
        publishedPracticeGuideRevisionId: published.id,
      },
    });
    const detached = await detachPlacementGuide({
      clinicId: account.clinicId,
      actorUserId: account.userId,
      placementId: placement.id,
    });
    const copy = await db().practiceGuide.findUniqueOrThrow({
      where: { id: detached.guideId },
    });
    expect(copy.serviceCategory).toBe("PHYSIOTHERAPY");
    expect(copy.copiedFromPracticeGuideId).toBe(created.id);
    void root;

    const legacy = await db().practiceGuide.create({
      data: {
        clinicId: account.clinicId,
        title: "Legacy custom",
        publicSlug: "legacy-custom",
        status: "DRAFT",
      },
    });
    expect(legacy.serviceCategory).toBeNull();

    const custom = await createCustomPracticeGuide({
      clinicId: account.clinicId,
      actorUserId: account.userId,
      values: {
        title: "New custom",
        publicSlug: "new-custom",
        serviceCategory: "PHYSIOTHERAPY",
      },
    });
    const customGuide = await db().practiceGuide.findUniqueOrThrow({
      where: { id: custom.id },
    });
    expect(customGuide.serviceCategory).toBe("PHYSIOTHERAPY");

    const dentalOnly = await createAccount("mismatch");
    await assignPrimarySiteServiceCategories(db(), dentalOnly.clinicId, [
      "DENTAL",
    ]);
    const physioSite = await addSite(dentalOnly.clinicId, "physio-only", [
      "PHYSIOTHERAPY",
    ]);
    const guide = await createCustomPracticeGuide({
      clinicId: dentalOnly.clinicId,
      actorUserId: dentalOnly.userId,
      values: {
        title: "Dental custom",
        publicSlug: "dental-custom",
        serviceCategory: "DENTAL",
      },
    });
    await expect(
      setGuideAvailableAtLocation({
        clinicId: dentalOnly.clinicId,
        guideId: guide.id,
        locationId: physioSite.location.id,
        available: true,
      })
    ).rejects.toMatchObject({ code: "conflict" });
    await assignPrimarySiteServiceCategories(db(), dentalOnly.clinicId, [
      "DENTAL",
      "PHYSIOTHERAPY",
    ]);
    await expect(
      setGuideAvailableAtLocation({
        clinicId: dentalOnly.clinicId,
        guideId: guide.id,
        locationId: dentalOnly.site.locations[0]!.id,
        available: true,
      })
    ).resolves.toMatchObject({ enabled: false });

    await assignPrimarySiteServiceCategories(db(), account.clinicId, [
      "PHYSIOTHERAPY",
      "DENTAL",
    ]);
    const destination = await createAccount("copy-dest");
    await copyClinicSiteServiceCategories(db(), {
      sourceClinicId: account.clinicId,
      sourceClinicSiteId: account.site.id,
      destinationClinicId: destination.clinicId,
      destinationClinicSiteId: destination.site.id,
    });
    const copied = await db().clinicSiteServiceCategory.findMany({
      where: { clinicSiteId: destination.site.id },
      orderBy: { serviceCategory: "asc" },
    });
    expect(copied.map((row) => row.serviceCategory)).toEqual([
      "DENTAL",
      "PHYSIOTHERAPY",
    ]);
    expect(copied.every((row) => row.clinicId === destination.clinicId)).toBe(
      true
    );
  });

  it("keeps placement, publish, and custom categories inside the site union", async (ctx) => {
    if (!(await connectOrSkip(ctx))) {
      return;
    }
    await cleanup();

    const unclassified = await createAccount("open");
    await expect(
      createCustomPracticeGuide({
        clinicId: unclassified.clinicId,
        actorUserId: unclassified.userId,
        values: {
          title: "Anywhere",
          publicSlug: "anywhere",
          serviceCategory: "DENTAL",
        },
      })
    ).rejects.toMatchObject({
      code: "invalid",
      message: "Configure a site service before creating a custom guide.",
    });
    const legacy = await db().practiceGuide.create({
      data: {
        clinicId: unclassified.clinicId,
        title: "Legacy",
        publicSlug: "legacy-open",
        status: "DRAFT",
      },
    });
    await expect(
      setGuideAvailableAtLocation({
        clinicId: unclassified.clinicId,
        guideId: legacy.id,
        locationId: unclassified.site.locations[0]!.id,
        available: true,
      })
    ).resolves.toMatchObject({ enabled: false });

    const mixed = await createAccount("mixed");
    await assignPrimarySiteServiceCategories(db(), mixed.clinicId, [
      "DENTAL",
      "PHYSIOTHERAPY",
    ]);
    const dentalGuide = await createCustomPracticeGuide({
      clinicId: mixed.clinicId,
      actorUserId: mixed.userId,
      values: {
        title: "Dental care",
        publicSlug: "dental-care",
        serviceCategory: "DENTAL",
      },
    });
    const physioGuide = await createCustomPracticeGuide({
      clinicId: mixed.clinicId,
      actorUserId: mixed.userId,
      values: {
        title: "Physio care",
        publicSlug: "physio-care",
        serviceCategory: "PHYSIOTHERAPY",
      },
    });
    const placements = await db().practiceGuidePlacement.findMany({
      where: { clinicId: mixed.clinicId },
    });
    expect(placements).toHaveLength(2);
    expect(placements.every((row) => row.isEnabled === false)).toBe(true);

    await savePracticeGuideDraft({
      clinicId: mixed.clinicId,
      actorUserId: mixed.userId,
      values: await draftInput(physioGuide.id, "DENTAL"),
    });
    const changed = await db().practiceGuide.findUniqueOrThrow({
      where: { id: physioGuide.id },
    });
    expect(changed.serviceCategory).toBe("DENTAL");

    const dentalOnly = await createAccount("dental-root");
    await assignPrimarySiteServiceCategories(db(), dentalOnly.clinicId, [
      "DENTAL",
    ]);
    await expect(
      createCustomPracticeGuide({
        clinicId: dentalOnly.clinicId,
        actorUserId: dentalOnly.userId,
        values: {
          title: "Wrong service",
          publicSlug: "wrong-service",
          serviceCategory: "CHIROPRACTIC",
        },
      })
    ).rejects.toMatchObject({ code: "invalid" });
    const cosmetic = await createCustomPracticeGuide({
      clinicId: mixed.clinicId,
      actorUserId: mixed.userId,
      values: {
        title: "Not offered",
        publicSlug: "not-offered",
        serviceCategory: "COSMETIC_AESTHETIC",
      },
    }).catch((error: unknown) => error);
    expect(cosmetic).toMatchObject({ code: "invalid" });

    const physioRoot = await createAccount("physio-root");
    await assignPrimarySiteServiceCategories(db(), physioRoot.clinicId, [
      "PHYSIOTHERAPY",
    ]);
    await addSite(physioRoot.clinicId, "dental-wing", ["DENTAL"]);
    const unplaced = await createCustomPracticeGuide({
      clinicId: physioRoot.clinicId,
      actorUserId: physioRoot.userId,
      values: {
        title: "Dental at physio root",
        publicSlug: "dental-at-physio",
        serviceCategory: "DENTAL",
      },
    });
    expect(
      await db().practiceGuidePlacement.count({
        where: { practiceGuideId: unplaced.id },
      })
    ).toBe(0);
    const placedPhysio = await createCustomPracticeGuide({
      clinicId: physioRoot.clinicId,
      actorUserId: physioRoot.userId,
      values: {
        title: "Physio at physio root",
        publicSlug: "physio-at-physio",
        serviceCategory: "PHYSIOTHERAPY",
      },
    });
    const rootPlacement = await db().practiceGuidePlacement.findFirstOrThrow({
      where: { practiceGuideId: placedPhysio.id },
    });
    expect(rootPlacement.locationId).toBe(physioRoot.site.locations[0]!.id);

    await publishPracticeGuide({
      clinicId: physioRoot.clinicId,
      actorUserId: physioRoot.userId,
      guideId: unplaced.id,
    });
    expect(
      await db().practiceGuidePlacement.count({
        where: { practiceGuideId: unplaced.id },
      })
    ).toBe(0);
    const publishedWithoutRoute = await db().practiceGuide.findUniqueOrThrow({
      where: { id: unplaced.id },
    });
    expect(publishedWithoutRoute.status).toBe("PUBLISHED");

    const blocked = await createCustomPracticeGuide({
      clinicId: dentalOnly.clinicId,
      actorUserId: dentalOnly.userId,
      values: {
        title: "Dental draft",
        publicSlug: "dental-draft",
        serviceCategory: "DENTAL",
      },
    });
    await assignPrimarySiteServiceCategories(db(), dentalOnly.clinicId, [
      "PHYSIOTHERAPY",
    ]);
    await expect(
      publishPracticeGuide({
        clinicId: dentalOnly.clinicId,
        actorUserId: dentalOnly.userId,
        guideId: blocked.id,
      })
    ).rejects.toBeInstanceOf(ClinicPortalError);
    const blockedGuide = await db().practiceGuide.findUniqueOrThrow({
      where: { id: blocked.id },
      include: { contentRevisions: true, placements: true },
    });
    expect(blockedGuide.status).toBe("DRAFT");
    expect(
      blockedGuide.contentRevisions.some(
        (revision) => revision.status === "PUBLISHED"
      )
    ).toBe(false);
    expect(
      blockedGuide.placements.every((row) => row.isEnabled === false)
    ).toBe(true);

    await savePracticeGuideDraft({
      clinicId: dentalOnly.clinicId,
      actorUserId: dentalOnly.userId,
      values: await draftInput(blocked.id, "PHYSIOTHERAPY"),
    });
    expect(
      (
        await db().practiceGuide.findUniqueOrThrow({
          where: { id: blocked.id },
        })
      ).serviceCategory
    ).toBe("PHYSIOTHERAPY");

    const anchored = await createAccount("anchored");
    await assignPrimarySiteServiceCategories(db(), anchored.clinicId, [
      "DENTAL",
    ]);
    await addSite(anchored.clinicId, "both-wing", ["DENTAL", "PHYSIOTHERAPY"]);
    const anchoredGuide = await createCustomPracticeGuide({
      clinicId: anchored.clinicId,
      actorUserId: anchored.userId,
      values: {
        title: "Anchored dental",
        publicSlug: "anchored-dental",
        serviceCategory: "DENTAL",
      },
    });
    await expect(
      savePracticeGuideDraft({
        clinicId: anchored.clinicId,
        actorUserId: anchored.userId,
        values: await draftInput(anchoredGuide.id, "PHYSIOTHERAPY"),
      })
    ).rejects.toMatchObject({ code: "conflict" });
    expect(
      (
        await db().practiceGuide.findUniqueOrThrow({
          where: { id: anchoredGuide.id },
        })
      ).serviceCategory
    ).toBe("DENTAL");

    const other = await createAccount("other-account");
    await assignPrimarySiteServiceCategories(db(), other.clinicId, [
      "PHYSIOTHERAPY",
    ]);
    await expect(
      savePracticeGuideDraft({
        clinicId: other.clinicId,
        actorUserId: other.userId,
        values: await draftInput(blocked.id, "PHYSIOTHERAPY"),
      })
    ).rejects.toMatchObject({ code: "not_found" });

    await assignPrimarySiteServiceCategories(db(), mixed.clinicId, [
      "DENTAL",
      "COSMETIC_AESTHETIC",
    ]);
    const cosmeticGuide = await createCustomPracticeGuide({
      clinicId: mixed.clinicId,
      actorUserId: mixed.userId,
      values: {
        title: "Cosmetic care",
        publicSlug: "cosmetic-care",
        serviceCategory: "COSMETIC_AESTHETIC",
      },
    });
    expect(
      (
        await db().practiceGuide.findUniqueOrThrow({
          where: { id: cosmeticGuide.id },
        })
      ).serviceCategory
    ).toBe("COSMETIC_AESTHETIC");

    const templateAccount = await createAccount("templates");
    await assignPrimarySiteServiceCategories(db(), templateAccount.clinicId, [
      "DENTAL",
      "PHYSIOTHERAPY",
    ]);
    const template = await createReviewedTemplate("compat-dental", "DENTAL");
    const pinned = await createPracticeGuideFromTemplate({
      clinicId: templateAccount.clinicId,
      actorUserId: templateAccount.userId,
      values: { templateId: template.id },
    });
    await expect(
      savePracticeGuideDraft({
        clinicId: templateAccount.clinicId,
        actorUserId: templateAccount.userId,
        values: await draftInput(pinned.id, "PHYSIOTHERAPY"),
      })
    ).rejects.toMatchObject({ code: "conflict" });
    await adaptPracticeGuideFromTemplate({
      clinicId: templateAccount.clinicId,
      guideId: pinned.id,
    });
    await expect(
      savePracticeGuideDraft({
        clinicId: templateAccount.clinicId,
        actorUserId: templateAccount.userId,
        values: await draftInput(pinned.id, "PHYSIOTHERAPY"),
      })
    ).rejects.toMatchObject({ code: "conflict" });
    expect(
      (await db().practiceGuide.findUniqueOrThrow({ where: { id: pinned.id } }))
        .serviceCategory
    ).toBe("DENTAL");

    await publishPracticeGuide({
      clinicId: templateAccount.clinicId,
      actorUserId: templateAccount.userId,
      guideId: pinned.id,
    });
    const pinnedPlacement = await db().practiceGuidePlacement.findFirstOrThrow({
      where: { practiceGuideId: pinned.id },
    });
    const detached = await detachPlacementGuide({
      clinicId: templateAccount.clinicId,
      actorUserId: templateAccount.userId,
      placementId: pinnedPlacement.id,
    });
    await expect(
      savePracticeGuideDraft({
        clinicId: templateAccount.clinicId,
        actorUserId: templateAccount.userId,
        values: await draftInput(detached.guideId, "PHYSIOTHERAPY"),
      })
    ).rejects.toMatchObject({ code: "conflict" });
    expect(
      (
        await db().practiceGuide.findUniqueOrThrow({
          where: { id: detached.guideId },
        })
      ).serviceCategory
    ).toBe("DENTAL");

    const legacyOnClassified = await db().practiceGuide.create({
      data: {
        clinicId: templateAccount.clinicId,
        title: "Unclassified",
        publicSlug: "unclassified",
        status: "DRAFT",
      },
    });
    await expect(
      setGuideAvailableAtLocation({
        clinicId: templateAccount.clinicId,
        guideId: legacyOnClassified.id,
        locationId: templateAccount.site.locations[0]!.id,
        available: true,
      })
    ).resolves.toMatchObject({ enabled: false });
  });
});

async function draftInput(
  guideId: string,
  serviceCategory:
    "DENTAL" | "PHYSIOTHERAPY" | "CHIROPRACTIC" | "COSMETIC_AESTHETIC"
) {
  const guide = await db().practiceGuide.findUniqueOrThrow({
    where: { id: guideId },
    include: {
      contentRevisions: {
        where: { version: 0 },
        include: {
          sections: {
            orderBy: { sortOrder: "asc" },
            include: {
              homeCareInstructions: { orderBy: { sortOrder: "asc" } },
            },
          },
        },
      },
    },
  });
  const draft = guide.contentRevisions[0];
  if (!draft) {
    throw new Error("Missing working draft.");
  }
  return {
    guideId,
    title: draft.title,
    publicSlug: guide.publicSlug,
    introduction: draft.introduction,
    serviceCategory,
    sections: draft.sections.map((section) => ({
      key: section.key,
      kind: section.kind,
      title: section.title,
      body: section.body,
      periodLabel: section.periodLabel,
      startDay: section.startDay,
      endDay: section.endDay,
      homeCareInstructions: section.homeCareInstructions.map((item) => ({
        key: item.key,
        title: item.title,
        body: item.body,
        frequencyCount: item.frequencyCount,
        frequencyPeriod: item.frequencyPeriod,
        timingLabel: item.timingLabel,
        durationValue: item.durationValue,
        durationUnit: item.durationUnit,
      })),
    })),
  };
}
