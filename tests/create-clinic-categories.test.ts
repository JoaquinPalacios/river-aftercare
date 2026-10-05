import "dotenv/config";

import { GuideRevisionStatus, type PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { listCanonicalGuideTemplates } from "@/lib/clinic-portal/list-canonical-templates";
import { ClinicPortalError } from "@/lib/clinic-portal/errors";
import { ensurePrimarySiteForClinic } from "@/lib/clinics/primary-site-location.mjs";
import { suggestGuideSlug } from "@/lib/clinics/slug-suggestion";
import {
  copyClinicSiteServiceCategories,
  listAccountServiceCategories,
  replaceClinicSiteServiceCategories,
} from "@/lib/clinics/site-service-categories";
import { isLocalDevelopmentDatabase } from "@/lib/dev/database-target";
import {
  createOperatorClinic,
  createOperatorClinicSchema,
  OPERATOR_CLINIC_CATEGORY_INVALID_MESSAGE,
  OPERATOR_CLINIC_CATEGORY_REQUIRED_MESSAGE,
} from "@/lib/operator/create-operator-clinic";
import { getPrisma } from "@/lib/prisma";
import { withSampleCategoryLock } from "@/tests/active-sample-slot";

const SLUG_PREFIX = "ccat5f7c-";
const TEMPLATE_PREFIX = "ccat5f7c_";
const local = isLocalDevelopmentDatabase(process.env.DATABASE_URL);
const describeDb = local ? describe : describe.skip;

function categoryIssue(categories: string[]) {
  const parsed = createOperatorClinicSchema.safeParse({
    name: "Harbour Dental",
    slug: "harbour-dental",
    serviceCategories: categories,
  });
  expect(parsed.success).toBe(false);
  if (parsed.success) {
    return "";
  }
  const issue = parsed.error.issues.find(
    (item) => item.path[0] === "serviceCategories"
  );
  expect(issue).toBeDefined();
  return issue?.message ?? "";
}

describe("create clinic practice categories", () => {
  it("requires at least one supported category and keeps duplicates in canonical order", () => {
    expect(categoryIssue([])).toBe(OPERATOR_CLINIC_CATEGORY_REQUIRED_MESSAGE);
    expect(categoryIssue(["ORTHODONTIC"])).toBe(
      OPERATOR_CLINIC_CATEGORY_INVALID_MESSAGE
    );

    const parsed = createOperatorClinicSchema.safeParse({
      name: "Harbour Dental",
      slug: suggestGuideSlug("Harbour Dental"),
      serviceCategories: ["COSMETIC_AESTHETIC", "DENTAL", "DENTAL"],
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) {
      return;
    }
    expect(parsed.data.serviceCategories).toEqual([
      "DENTAL",
      "COSMETIC_AESTHETIC",
    ]);
    expect(parsed.data.slug).toBe("harbour-dental");
  });

  it("rejects a new clinic with no categories before any account write", async () => {
    await expect(
      createOperatorClinic({
        name: "Unclassified New Clinic",
        slug: `${SLUG_PREFIX}empty`,
        serviceCategories: [],
      })
    ).rejects.toMatchObject({
      message: OPERATOR_CLINIC_CATEGORY_REQUIRED_MESSAGE,
      code: "invalid",
    });
    await expect(
      createOperatorClinic({
        name: "Reserved Category Clinic",
        slug: "admin",
        serviceCategories: ["DENTAL"],
      })
    ).rejects.toBeInstanceOf(ClinicPortalError);
  });
});

describeDb("create clinic practice categories in the database", () => {
  let prisma: PrismaClient | null = null;

  function db(): PrismaClient {
    if (!prisma) {
      throw new Error("Prisma is not connected.");
    }
    return prisma;
  }

  async function cleanup() {
    await db().clinic.deleteMany({
      where: {
        OR: [
          { slug: { startsWith: SLUG_PREFIX } },
          { id: { startsWith: TEMPLATE_PREFIX } },
        ],
      },
    });
    await db().guideTemplate.deleteMany({
      where: { id: { startsWith: TEMPLATE_PREFIX } },
    });
  }

  async function publishedTemplate(input: {
    key: string;
    serviceCategory: "DENTAL" | "COSMETIC_AESTHETIC" | "CHIROPRACTIC";
    isSample?: boolean;
  }) {
    return db().guideTemplate.create({
      data: {
        id: `${TEMPLATE_PREFIX}${input.key}`,
        slug: `${SLUG_PREFIX}${input.key}`,
        title: `${input.key} placeholder`,
        serviceCategory: input.serviceCategory,
        isActive: true,
        isSample: input.isSample ?? false,
        revisions: {
          create: {
            version: 1,
            status: GuideRevisionStatus.PUBLISHED,
            publishedAt: new Date("2026-10-05T00:00:00.000Z"),
            sections: {
              create: {
                key: "introduction",
                kind: "INTRODUCTION",
                title: "Introduction",
                body: "Placeholder body.",
                sortOrder: 1,
              },
            },
          },
        },
      },
      select: { id: true },
    });
  }

  beforeAll(async () => {
    prisma = getPrisma();
    await prisma.$queryRaw`SELECT 1`;
    await cleanup();
  });

  afterAll(async () => {
    if (!prisma) {
      return;
    }
    await cleanup();
    await prisma.$disconnect();
  });

  it("stores one category with the generated slug and creates no guides", async () => {
    const name = "Ccat5f7c Harbour Dental";
    const slug = suggestGuideSlug(name);
    expect(slug).toBe(`${SLUG_PREFIX}harbour-dental`);
    const created = await createOperatorClinic({
      name,
      slug,
      serviceCategories: ["DENTAL"],
    });
    const clinic = await db().clinic.findUniqueOrThrow({
      where: { id: created.id },
      include: {
        profile: true,
        practiceGuides: true,
        sites: {
          include: { locations: true, serviceCategories: true },
        },
      },
    });
    expect(clinic.practiceGuides).toEqual([]);
    expect(clinic.profile?.displayName).toBe(name);
    expect(clinic.sites).toHaveLength(1);
    const site = clinic.sites[0];
    expect(site).toMatchObject({ slug, isPrimary: true, clinicId: clinic.id });
    expect(site?.locations).toHaveLength(1);
    expect(site?.locations[0]).toMatchObject({
      servesSiteRoot: true,
      clinicId: clinic.id,
    });
    expect(site?.serviceCategories).toEqual([
      expect.objectContaining({
        clinicId: clinic.id,
        clinicSiteId: site?.id,
        serviceCategory: "DENTAL",
      }),
    ]);
    expect(
      await db().guideTemplate.count({
        where: { id: { startsWith: TEMPLATE_PREFIX } },
      })
    ).toBe(0);
  });

  it("stores several categories for a multidisciplinary clinic", async () => {
    const created = await createOperatorClinic({
      name: "Ccat5f7c Harbour Aesthetic",
      slug: `${SLUG_PREFIX}multi`,
      serviceCategories: ["COSMETIC_AESTHETIC", "DENTAL", "DENTAL"],
    });
    const rows = await db().clinicSiteServiceCategory.findMany({
      where: { clinicId: created.id },
      orderBy: { serviceCategory: "asc" },
    });
    expect(rows.map((row) => row.serviceCategory)).toEqual([
      "DENTAL",
      "COSMETIC_AESTHETIC",
    ]);
    expect(new Set(rows.map((row) => row.clinicId))).toEqual(
      new Set([created.id])
    );
    expect(
      await db().practiceGuide.count({ where: { clinicId: created.id } })
    ).toBe(0);
  });

  it("leaves no category rows when the slug is reserved or already used", async () => {
    const reservedBefore = await db().clinic.findUnique({
      where: { slug: "admin" },
      select: { id: true },
    });
    await expect(
      createOperatorClinic({
        name: "Ccat5f7c Reserved",
        slug: "admin",
        serviceCategories: ["DENTAL", "PHYSIOTHERAPY"],
      })
    ).rejects.toMatchObject({
      message: "That hostname is reserved by the platform.",
      code: "invalid",
    });
    const reservedAfter = await db().clinic.findUnique({
      where: { slug: "admin" },
      select: { id: true },
    });
    expect(reservedAfter?.id ?? null).toBe(reservedBefore?.id ?? null);

    await createOperatorClinic({
      name: "Ccat5f7c Taken",
      slug: `${SLUG_PREFIX}taken`,
      serviceCategories: ["DENTAL"],
    });
    await expect(
      createOperatorClinic({
        name: "Ccat5f7c Taken Again",
        slug: `${SLUG_PREFIX}taken`,
        serviceCategories: ["PHYSIOTHERAPY", "CHIROPRACTIC"],
      })
    ).rejects.toMatchObject({
      message: "That tenant slug is already in use.",
      code: "conflict",
    });
    const rows = await db().clinicSiteServiceCategory.findMany({
      where: { clinicSite: { slug: `${SLUG_PREFIX}taken` } },
    });
    expect(rows.map((row) => row.serviceCategory)).toEqual(["DENTAL"]);
    expect(
      await db().clinic.count({ where: { slug: `${SLUG_PREFIX}taken` } })
    ).toBe(1);
  });

  it("matches eligible production templates and hides samples", async () => {
    const dental = await publishedTemplate({
      key: "dental",
      serviceCategory: "DENTAL",
    });
    const cosmetic = await publishedTemplate({
      key: "cosmetic",
      serviceCategory: "COSMETIC_AESTHETIC",
    });

    await withSampleCategoryLock(["COSMETIC_AESTHETIC"], async () => {
      let createdSampleId: string | null = null;
      try {
        const existingSample = await db().guideTemplate.findFirst({
          where: {
            serviceCategory: "COSMETIC_AESTHETIC",
            isSample: true,
            isActive: true,
            revisions: { some: { status: GuideRevisionStatus.PUBLISHED } },
          },
          select: { id: true },
        });
        let sample = existingSample;
        if (!sample) {
          try {
            sample = await publishedTemplate({
              key: "sample",
              serviceCategory: "COSMETIC_AESTHETIC",
              isSample: true,
            });
            createdSampleId = sample.id;
          } catch (error) {
            const uniqueConflict =
              typeof error === "object" &&
              error !== null &&
              "code" in error &&
              error.code === "P2002";
            if (!uniqueConflict) {
              throw error;
            }
            sample = await db().guideTemplate.findFirst({
              where: {
                serviceCategory: "COSMETIC_AESTHETIC",
                isSample: true,
                isActive: true,
              },
              select: { id: true },
            });
          }
        }
        if (!sample) {
          throw new Error("Cosmetic sample template was not available.");
        }

        const dentalClinic = await createOperatorClinic({
          name: "Ccat5f7c Dental Only",
          slug: `${SLUG_PREFIX}dental-only`,
          serviceCategories: ["DENTAL"],
        });
        const cosmeticClinic = await createOperatorClinic({
          name: "Ccat5f7c Cosmetic Only",
          slug: `${SLUG_PREFIX}cosmetic-only`,
          serviceCategories: ["COSMETIC_AESTHETIC"],
        });
        const mixedClinic = await createOperatorClinic({
          name: "Ccat5f7c Dental Cosmetic",
          slug: `${SLUG_PREFIX}dental-cosmetic`,
          serviceCategories: ["DENTAL", "COSMETIC_AESTHETIC"],
        });
        const emptyCategoryClinic = await createOperatorClinic({
          name: "Ccat5f7c Chiropractic",
          slug: `${SLUG_PREFIX}chiropractic`,
          serviceCategories: ["CHIROPRACTIC"],
        });

        const dentalList = await listCanonicalGuideTemplates(dentalClinic.id);
        const cosmeticList = await listCanonicalGuideTemplates(
          cosmeticClinic.id
        );
        const mixedList = await listCanonicalGuideTemplates(mixedClinic.id);
        const chiropracticList = await listCanonicalGuideTemplates(
          emptyCategoryClinic.id
        );

        expect(dentalList.templates.map((template) => template.id)).toContain(
          dental.id
        );
        expect(
          dentalList.templates.map((template) => template.id)
        ).not.toContain(cosmetic.id);
        expect(
          dentalList.templates.map((template) => template.id)
        ).not.toContain(sample.id);
        expect(
          dentalList.templates.every(
            (template) =>
              template.serviceCategory === "DENTAL" &&
              template.availability === "published"
          )
        ).toBe(true);

        expect(cosmeticList.templates.map((template) => template.id)).toContain(
          cosmetic.id
        );
        expect(
          cosmeticList.templates.map((template) => template.id)
        ).not.toContain(dental.id);
        expect(
          cosmeticList.templates.map((template) => template.id)
        ).not.toContain(sample.id);
        expect(
          cosmeticList.templates.every(
            (template) =>
              template.serviceCategory === "COSMETIC_AESTHETIC" &&
              template.availability === "published"
          )
        ).toBe(true);

        const mixedIds = mixedList.templates.map((template) => template.id);
        expect(mixedIds).toContain(dental.id);
        expect(mixedIds).toContain(cosmetic.id);
        expect(mixedIds).not.toContain(sample.id);
        expect(mixedList.serviceCategories).toEqual([
          "DENTAL",
          "COSMETIC_AESTHETIC",
        ]);
        expect(
          mixedList.templates.every(
            (template) =>
              (template.serviceCategory === "DENTAL" ||
                template.serviceCategory === "COSMETIC_AESTHETIC") &&
              template.availability === "published"
          )
        ).toBe(true);

        expect(chiropracticList.templatesNeedServiceCategories).toBe(false);
        expect(chiropracticList.serviceCategories).toEqual(["CHIROPRACTIC"]);
        expect(
          chiropracticList.templates.every(
            (template) =>
              template.serviceCategory === "CHIROPRACTIC" &&
              template.availability === "published"
          )
        ).toBe(true);
        expect(
          chiropracticList.templates.map((template) => template.id)
        ).not.toContain(dental.id);
        expect(
          chiropracticList.templates.map((template) => template.id)
        ).not.toContain(cosmetic.id);
        expect(
          chiropracticList.templates.map((template) => template.id)
        ).not.toContain(sample.id);
        expect(
          await db().practiceGuide.count({
            where: {
              clinicId: {
                in: [
                  dentalClinic.id,
                  cosmeticClinic.id,
                  mixedClinic.id,
                  emptyCategoryClinic.id,
                ],
              },
            },
          })
        ).toBe(0);
      } finally {
        if (createdSampleId) {
          await db().guideTemplate.deleteMany({
            where: { id: createdSampleId },
          });
        }
      }
    });
  });

  it("keeps a historical clinic with no categories valid", async () => {
    const clinicId = `${TEMPLATE_PREFIX}historical`;
    await db().clinic.create({
      data: {
        id: clinicId,
        name: "Historical unclassified",
        slug: `${SLUG_PREFIX}historical`,
        profile: { create: { displayName: "Historical unclassified" } },
      },
    });
    await ensurePrimarySiteForClinic(db(), clinicId);
    const categories = await db().clinicSiteServiceCategory.findMany({
      where: { clinicId },
    });
    expect(categories).toEqual([]);
    const listed = await listCanonicalGuideTemplates(clinicId);
    expect(listed.templatesNeedServiceCategories).toBe(true);
    expect(listed.templates).toEqual([]);
    const site = await db().clinicSite.findFirstOrThrow({
      where: { clinicId, isPrimary: true },
    });
    await replaceClinicSiteServiceCategories({
      clinicId,
      siteId: site.id,
      serviceCategories: [],
    });
    expect(
      await db().clinicSiteServiceCategory.count({ where: { clinicId } })
    ).toBe(0);
    expect(await db().practiceGuide.count({ where: { clinicId } })).toBe(0);
  });

  it("keeps created categories on their own account and copyable by a split", async () => {
    const source = await createOperatorClinic({
      name: "Ccat5f7c Source",
      slug: `${SLUG_PREFIX}source`,
      serviceCategories: ["DENTAL", "COSMETIC_AESTHETIC"],
    });
    const destination = await createOperatorClinic({
      name: "Ccat5f7c Destination",
      slug: `${SLUG_PREFIX}destination`,
      serviceCategories: ["PHYSIOTHERAPY"],
    });
    expect(await listAccountServiceCategories(db(), source.id)).toEqual([
      "DENTAL",
      "COSMETIC_AESTHETIC",
    ]);
    expect(await listAccountServiceCategories(db(), destination.id)).toEqual([
      "PHYSIOTHERAPY",
    ]);

    const sourceSite = await db().clinicSite.findFirstOrThrow({
      where: { clinicId: source.id, isPrimary: true },
    });
    const destinationSite = await db().clinicSite.findFirstOrThrow({
      where: { clinicId: destination.id, isPrimary: true },
    });
    await expect(
      replaceClinicSiteServiceCategories({
        clinicId: destination.id,
        siteId: sourceSite.id,
        serviceCategories: ["CHIROPRACTIC"],
      })
    ).rejects.toMatchObject({ code: "not_found" });
    expect(await listAccountServiceCategories(db(), source.id)).toEqual([
      "DENTAL",
      "COSMETIC_AESTHETIC",
    ]);

    await copyClinicSiteServiceCategories(db(), {
      sourceClinicId: source.id,
      sourceClinicSiteId: sourceSite.id,
      destinationClinicId: destination.id,
      destinationClinicSiteId: destinationSite.id,
    });
    expect(await listAccountServiceCategories(db(), source.id)).toEqual([
      "DENTAL",
      "COSMETIC_AESTHETIC",
    ]);
    expect(await listAccountServiceCategories(db(), destination.id)).toEqual([
      "DENTAL",
      "PHYSIOTHERAPY",
      "COSMETIC_AESTHETIC",
    ]);
  });
});
