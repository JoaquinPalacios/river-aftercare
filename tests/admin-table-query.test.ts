import "dotenv/config";

import { GuideRevisionStatus } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  headers: async () =>
    new Headers({
      host: "app.localhost:3000",
      "x-forwarded-proto": "http",
    }),
}));

import { loadClinicGuideDirectory } from "@/lib/clinic-portal/list-clinic-guides";
import { queryOperatorCanonicalTemplates } from "@/lib/operator/canonical-templates/list-operator-canonical-templates";
import { getPrisma } from "@/lib/prisma";

const hasDatabase = Boolean(process.env.DATABASE_URL?.trim());
const describeDb = hasDatabase ? describe : describe.skip;

const CLINIC_ID = "zz_table_ctl_clinic";
const SLUG_PREFIX = "zz-table-ctl-";

describeDb("admin table queries", () => {
  const prisma = getPrisma();

  beforeAll(async () => {
    await cleanup();
    for (let index = 1; index <= 26; index += 1) {
      const number = String(index).padStart(2, "0");
      await prisma.guideTemplate.create({
        data: {
          title:
            index === 5 ? "Dental Implant Placement" : `ZZ Table ${number}`,
          slug: `${SLUG_PREFIX}${number}`,
          serviceCategory: index <= 20 ? "DENTAL" : "PHYSIOTHERAPY",
          isActive: index !== 20,
          revisions:
            index === 1
              ? {
                  create: {
                    version: 1,
                    status: GuideRevisionStatus.DRAFT,
                  },
                }
              : index === 2
                ? {
                    create: {
                      version: 1,
                      status: GuideRevisionStatus.PUBLISHED,
                      publishedAt: new Date("2026-09-01T00:00:00.000Z"),
                    },
                  }
                : undefined,
        },
      });
    }

    await prisma.clinic.create({
      data: {
        id: CLINIC_ID,
        name: "ZZ Table Controls",
        slug: "zz-table-ctl-clinic",
      },
    });
    for (let index = 1; index <= 12; index += 1) {
      const number = String(index).padStart(2, "0");
      await prisma.practiceGuide.create({
        data: {
          clinicId: CLINIC_ID,
          title: index === 4 ? "Dental Implant Placement" : `Guide ${number}`,
          publicSlug: `${SLUG_PREFIX}guide-${number}`,
          status: index % 2 === 0 ? "PUBLISHED" : "DRAFT",
          isEnabled: index % 2 === 0,
        },
      });
    }
    const draftTitle = await prisma.practiceGuide.create({
      data: {
        clinicId: CLINIC_ID,
        title: "Stored name",
        publicSlug: `${SLUG_PREFIX}guide-draft`,
        status: "DRAFT",
        contentRevisions: {
          create: {
            version: 0,
            status: GuideRevisionStatus.DRAFT,
            title: "Night guard notes",
            sections: {
              create: [
                {
                  key: "intro",
                  kind: "INTRODUCTION",
                  title: "Intro",
                  body: "unique-body-token-xyz",
                  sortOrder: 1,
                  provenance: "PRACTICE_CUSTOM",
                },
              ],
            },
          },
        },
      },
    });
    expect(draftTitle.id).toBeTruthy();
    await prisma.practiceGuide.create({
      data: {
        clinicId: CLINIC_ID,
        title: "Retained guide",
        publicSlug: `${SLUG_PREFIX}guide-retained`,
        status: "PUBLISHED",
        isEnabled: false,
        downgradeRetainedAt: new Date("2026-09-01T00:00:00.000Z"),
        downgradeRetentionUntil: new Date("2099-01-01T00:00:00.000Z"),
      },
    });
  });

  afterAll(async () => {
    if (!hasDatabase) {
      return;
    }
    await cleanup();
    await prisma.$disconnect();
  });

  async function cleanup() {
    await prisma.practiceGuide.deleteMany({ where: { clinicId: CLINIC_ID } });
    await prisma.clinic.deleteMany({ where: { id: CLINIC_ID } });
    await prisma.guideTemplate.deleteMany({
      where: { slug: { startsWith: SLUG_PREFIX } },
    });
  }

  it("pages, searches, filters, and sorts canonical templates", async () => {
    const first = await queryOperatorCanonicalTemplates({
      sort: "template",
      direction: "asc",
      requestedPage: 1,
      pageSize: 25,
      q: SLUG_PREFIX.slice(0, 0),
    });
    const scoped = await queryOperatorCanonicalTemplates({
      sort: "template",
      direction: "asc",
      requestedPage: 1,
      pageSize: 10,
      q: "zz table",
    });
    expect(scoped.total).toBe(25);
    expect(scoped.rows).toHaveLength(10);
    expect(scoped.totalPages).toBe(3);
    expect(scoped.rows[0]?.title).toBe("ZZ Table 01");

    const last = await queryOperatorCanonicalTemplates({
      sort: "template",
      direction: "asc",
      requestedPage: 3,
      pageSize: 10,
      q: "zz table",
    });
    expect(last.rows).toHaveLength(5);
    expect(last.redirect).toBe(false);

    const invalid = await queryOperatorCanonicalTemplates({
      sort: "template",
      direction: "asc",
      requestedPage: 40,
      pageSize: 10,
      q: "zz table",
    });
    expect(invalid.redirect).toBe(true);
    expect(invalid.page).toBe(3);
    expect(invalid.rows).toEqual([]);

    const byTitle = await queryOperatorCanonicalTemplates({
      sort: "template",
      direction: "asc",
      requestedPage: 1,
      pageSize: 25,
      q: "implant",
    });
    expect(byTitle.rows.map((row) => row.slug)).toEqual([`${SLUG_PREFIX}05`]);

    const bySlug = await queryOperatorCanonicalTemplates({
      sort: "template",
      direction: "asc",
      requestedPage: 1,
      pageSize: 25,
      q: `${SLUG_PREFIX}05`,
    });
    expect(bySlug.total).toBe(1);

    const missing = await queryOperatorCanonicalTemplates({
      sort: "template",
      direction: "asc",
      requestedPage: 1,
      pageSize: 25,
      q: "zzzz-missing",
    });
    expect(missing.total).toBe(0);
    expect(missing.rows).toEqual([]);

    const filtered = await queryOperatorCanonicalTemplates({
      serviceCategory: "DENTAL",
      activity: "active",
      publication: "draft",
      q: "zz table",
      sort: "template",
      direction: "desc",
      requestedPage: 1,
      pageSize: 25,
    });
    expect(filtered.total).toBe(1);
    expect(filtered.rows[0]?.slug).toBe(`${SLUG_PREFIX}01`);
    expect(filtered.rows[0]?.draft?.version).toBe(1);

    const descending = await queryOperatorCanonicalTemplates({
      sort: "template",
      direction: "desc",
      requestedPage: 1,
      pageSize: 10,
      q: "zz table",
    });
    expect(descending.rows[0]?.title).toBe("ZZ Table 26");
    expect(first.total).toBeGreaterThanOrEqual(26);
  });

  it("pages and searches clinic guides without reading rich text", async () => {
    const page = await loadClinicGuideDirectory({
      clinicId: CLINIC_ID,
      q: "",
      sort: "guide",
      direction: "asc",
      requestedPage: 1,
      pageSize: 10,
    });
    expect(page.active.total).toBe(13);
    expect(page.active.rows).toHaveLength(10);
    expect(page.active.totalPages).toBe(2);
    expect(page.retained.map((guide) => guide.title)).toEqual([
      "Retained guide",
    ]);

    const second = await loadClinicGuideDirectory({
      clinicId: CLINIC_ID,
      q: "",
      sort: "guide",
      direction: "asc",
      requestedPage: 2,
      pageSize: 10,
    });
    expect(second.active.rows).toHaveLength(3);

    const invalid = await loadClinicGuideDirectory({
      clinicId: CLINIC_ID,
      q: "",
      sort: "status",
      direction: "asc",
      requestedPage: 8,
      pageSize: 10,
    });
    expect(invalid.active.redirect).toBe(true);
    expect(invalid.active.page).toBe(2);

    const byTitle = await loadClinicGuideDirectory({
      clinicId: CLINIC_ID,
      q: "implant",
      sort: "guide",
      direction: "asc",
      requestedPage: 1,
      pageSize: 25,
    });
    expect(byTitle.active.rows.map((guide) => guide.publicSlug)).toEqual([
      `${SLUG_PREFIX}guide-04`,
    ]);

    const bySlug = await loadClinicGuideDirectory({
      clinicId: CLINIC_ID,
      q: `${SLUG_PREFIX}guide-03`,
      sort: "guide",
      direction: "asc",
      requestedPage: 1,
      pageSize: 25,
    });
    expect(bySlug.active.total).toBe(1);
    expect(bySlug.active.rows[0]?.title).toBe("Guide 03");

    const byDraftTitle = await loadClinicGuideDirectory({
      clinicId: CLINIC_ID,
      q: "night guard",
      sort: "updated",
      direction: "desc",
      requestedPage: 1,
      pageSize: 25,
    });
    expect(byDraftTitle.active.rows.map((guide) => guide.title)).toEqual([
      "Night guard notes",
    ]);

    const body = await loadClinicGuideDirectory({
      clinicId: CLINIC_ID,
      q: "unique-body-token-xyz",
      sort: "guide",
      direction: "asc",
      requestedPage: 1,
      pageSize: 25,
    });
    expect(body.active.total).toBe(0);
  });
});
