import { beforeEach, describe, expect, it, vi } from "vitest";

const templateCount = vi.hoisted(() => vi.fn());
const templateFindMany = vi.hoisted(() => vi.fn());
const guideCount = vi.hoisted(() => vi.fn());
const guideFindMany = vi.hoisted(() => vi.fn());
const clinicFindUnique = vi.hoisted(() => vi.fn());

vi.mock("next/headers", () => ({
  headers: async () =>
    new Headers({
      host: "app.localhost:3000",
      "x-forwarded-proto": "http",
    }),
}));

vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    guideTemplate: {
      count: templateCount,
      findMany: templateFindMany,
    },
    practiceGuide: {
      count: guideCount,
      findMany: guideFindMany,
    },
    clinic: {
      findUnique: clinicFindUnique,
    },
  }),
}));

import { loadClinicGuideDirectory } from "@/lib/clinic-portal/list-clinic-guides";
import { queryOperatorCanonicalTemplates } from "@/lib/operator/canonical-templates/list-operator-canonical-templates";

describe("admin table query shape", () => {
  beforeEach(() => {
    templateCount.mockReset();
    templateFindMany.mockReset();
    guideCount.mockReset();
    guideFindMany.mockReset();
    clinicFindUnique.mockReset();
    templateFindMany.mockResolvedValue([]);
    guideFindMany.mockResolvedValue([]);
    clinicFindUnique.mockResolvedValue({
      id: "clinic-1",
      sites: [],
    });
  });

  it("counts and reads one bounded template page with the same filter", async () => {
    templateCount.mockResolvedValue(83);
    const page = await queryOperatorCanonicalTemplates({
      serviceCategory: "DENTAL",
      activity: "active",
      publication: "published",
      q: "implant",
      sort: "template",
      direction: "asc",
      requestedPage: 2,
      pageSize: 25,
    });
    expect(page).toMatchObject({
      total: 83,
      page: 2,
      pageSize: 25,
      totalPages: 4,
      redirect: false,
    });
    const where = {
      serviceCategory: "DENTAL",
      isActive: true,
      revisions: { some: { status: "PUBLISHED" } },
      OR: [
        { title: { contains: "implant", mode: "insensitive" } },
        { slug: { contains: "implant", mode: "insensitive" } },
      ],
    };
    expect(templateCount).toHaveBeenCalledWith({ where });
    expect(templateFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where,
        skip: 25,
        take: 25,
        orderBy: [{ title: "asc" }, { id: "asc" }],
      })
    );
    expect(JSON.stringify(templateFindMany.mock.calls[0]?.[0])).not.toContain(
      "body"
    );
  });

  it("does not read template rows when the requested page is out of range", async () => {
    templateCount.mockResolvedValue(12);
    const page = await queryOperatorCanonicalTemplates({
      sort: "service",
      direction: "desc",
      requestedPage: 99,
      pageSize: 10,
    });
    expect(page.redirect).toBe(true);
    expect(page.page).toBe(2);
    expect(page.rows).toEqual([]);
    expect(templateFindMany).not.toHaveBeenCalled();
  });

  it("paginates active clinic guides and keeps retained guides on a separate read", async () => {
    guideCount.mockResolvedValue(30);
    const directory = await loadClinicGuideDirectory({
      clinicId: "clinic-1",
      q: "implant",
      sort: "guide",
      direction: "asc",
      requestedPage: 2,
      pageSize: 10,
    });
    expect(directory.active).toMatchObject({
      total: 30,
      page: 2,
      pageSize: 10,
      totalPages: 3,
      redirect: false,
    });
    const activeWhere = guideCount.mock.calls[0]?.[0].where;
    expect(activeWhere.clinicId).toBe("clinic-1");
    expect(JSON.stringify(activeWhere)).toContain("implant");
    expect(JSON.stringify(activeWhere)).not.toContain("body");
    expect(guideFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: activeWhere,
        skip: 10,
        take: 10,
      })
    );
    const retainedCall = guideFindMany.mock.calls.find(
      (call) => call[0]?.where?.downgradeRetentionUntil
    );
    expect(retainedCall?.[0].where.clinicId).toBe("clinic-1");
    expect(retainedCall?.[0].take).toBeUndefined();
  });
});
