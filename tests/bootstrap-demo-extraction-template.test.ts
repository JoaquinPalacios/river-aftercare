import "dotenv/config";

import { afterAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { DEMO_AFTERCARE_TENANT_SLUG } from "@/lib/aftercare/demo-tenant";
import {
  DEMO_EXTRACTION_SECTIONS,
  DEMO_EXTRACTION_TEMPLATE_SLUG,
} from "@/lib/aftercare/demo-extraction-template";
import {
  bootstrapDemoExtractionTemplate,
  formatDemoExtractionBootstrapPlan,
  planDemoExtractionBootstrap,
  type DemoExtractionTemplateSnapshot,
} from "@/lib/clinic-portal/bootstrap-demo-extraction-template";

const DEMO_SEED_USER_IDS = [
  "user_demo_admin",
  "user_demo_staff",
  "user_demo_operator",
] as const;

async function ownedDemoBootstrapState(client: PrismaClient) {
  const extractionWhere = { slug: DEMO_EXTRACTION_TEMPLATE_SLUG };
  const [
    templateCount,
    revisionCount,
    sectionCount,
    demoClinicCount,
    demoUserCount,
  ] = await Promise.all([
    client.guideTemplate.count({ where: extractionWhere }),
    client.guideTemplateRevision.count({
      where: { guideTemplate: extractionWhere },
    }),
    client.guideTemplateSection.count({
      where: { revision: { guideTemplate: extractionWhere } },
    }),
    client.clinic.count({ where: { slug: DEMO_AFTERCARE_TENANT_SLUG } }),
    client.user.count({ where: { id: { in: [...DEMO_SEED_USER_IDS] } } }),
  ]);
  const demoClinic = await client.clinic.findUnique({
    where: { slug: DEMO_AFTERCARE_TENANT_SLUG },
    select: { id: true, name: true, slug: true },
  });

  return {
    templateCount,
    revisionCount,
    sectionCount,
    demoClinicCount,
    demoClinicId: demoClinic?.id ?? null,
    demoClinicName: demoClinic?.name ?? null,
    demoUserCount,
  };
}

function expectedCreatePlan() {
  return planDemoExtractionBootstrap(null);
}

function matchingSnapshot(): DemoExtractionTemplateSnapshot {
  const create = expectedCreatePlan();
  if (create.action !== "create") {
    throw new Error("Expected a create plan from an empty snapshot.");
  }
  return {
    slug: create.template.slug,
    title: create.template.title,
    specialty: create.template.specialty,
    isActive: true,
    isSample: true,
    revisions: [
      {
        version: create.revision.version,
        status: create.revision.status,
        reviewedAt: null,
        reviewedBy: null,
        sections: create.sections,
      },
    ],
  };
}

describe("demo extraction bootstrap planner", () => {
  it("plans exactly one template, one published unreviewed revision, and eight sections", () => {
    const plan = expectedCreatePlan();
    expect(plan.action).toBe("create");
    if (plan.action !== "create") {
      return;
    }
    expect(plan.changed).toBe(true);
    expect(plan.template).toEqual({
      slug: "extraction",
      title: "Tooth Extraction",
      specialty: "DENTAL",
      isActive: true,
      isSample: true,
    });
    expect(plan.revision).toEqual({
      version: 1,
      status: "PUBLISHED",
      reviewedAt: null,
      reviewedBy: null,
    });
    expect(plan.sections).toHaveLength(8);
    expect(plan.sections.map((section) => section.key)).toEqual(
      DEMO_EXTRACTION_SECTIONS.map((section) => section.key)
    );
    expect(plan.notice).toContain("SAMPLE / NON-CLINICAL");
    expect(plan.notice).toContain("not clinical approval");
    expect(plan.notice).not.toContain("clinically approved");

    const formatted = formatDemoExtractionBootstrapPlan(plan);
    expect(formatted).toContain("Action: create");
    expect(formatted).toContain(
      "- 1 GuideTemplate slug=extraction title=Tooth Extraction specialty=DENTAL isActive=true isSample=true"
    );
    expect(formatted).toContain(
      "- 1 GuideTemplateRevision version=1 status=PUBLISHED reviewedAt=null reviewedBy=null"
    );
    expect(formatted).toContain("- 8 GuideTemplateSection rows");
    expect(formatted).toContain(
      "Would not create Clinic, ClinicProfile, User, membership, room, doctor, procedure, or PracticeGuide records."
    );
    expect(formatted).toContain("Changed: yes");
  });

  it("no-ops on an exact match and refuses mismatches or extra revisions", () => {
    expect(planDemoExtractionBootstrap(matchingSnapshot()).action).toBe("noop");

    const extraRevision = matchingSnapshot();
    extraRevision.revisions.push({
      version: 2,
      status: "PUBLISHED",
      reviewedAt: null,
      reviewedBy: null,
      sections: extraRevision.revisions[0].sections,
    });
    const extra = planDemoExtractionBootstrap(extraRevision);
    expect(extra.action).toBe("refuse");
    if (extra.action === "refuse") {
      expect(extra.reason).toContain("exactly 1 revision");
      expect(formatDemoExtractionBootstrapPlan(extra)).toContain("No writes.");
    }

    const reviewed = matchingSnapshot();
    reviewed.revisions[0].reviewedAt = new Date("2026-09-01");
    reviewed.revisions[0].reviewedBy = "Someone";
    const refusedReview = planDemoExtractionBootstrap(reviewed);
    expect(refusedReview.action).toBe("refuse");
    if (refusedReview.action === "refuse") {
      expect(refusedReview.reason).toContain("reviewedAt");
    }

    const retitled = matchingSnapshot();
    retitled.title = "Different title";
    expect(planDemoExtractionBootstrap(retitled).action).toBe("refuse");

    const notSample = matchingSnapshot();
    notSample.isSample = false;
    const refusedSample = planDemoExtractionBootstrap(notSample);
    expect(refusedSample.action).toBe("refuse");
    if (refusedSample.action === "refuse") {
      expect(refusedSample.reason).toContain("isSample");
    }

    const reordered = matchingSnapshot();
    reordered.revisions[0].sections[0].body = "Changed body";
    expect(planDemoExtractionBootstrap(reordered).action).toBe("refuse");
  });
});

describe("demo extraction bootstrap writes", () => {
  let prisma: PrismaClient | null = null;
  let dbAvailable = false;

  afterAll(async () => {
    if (!prisma) {
      return;
    }
    await prisma.$disconnect();
  });

  it("dry-run makes no writes, apply creates 1/1/8 or no-ops an exact match, and never touches clinic rows", async (ctx) => {
    try {
      const { getPrisma } = await import("@/lib/prisma");
      prisma = getPrisma();
      await prisma.$queryRaw`SELECT 1`;
      dbAvailable = true;
    } catch {
      ctx.skip();
      return;
    }

    const client = prisma;
    const before = await ownedDemoBootstrapState(client);

    const dryRun = await bootstrapDemoExtractionTemplate({
      prisma: client,
      apply: false,
    });
    expect(dryRun.applied).toBe(false);
    expect(await ownedDemoBootstrapState(client)).toEqual(before);

    const existing = await client.guideTemplate.findUnique({
      where: { slug: DEMO_EXTRACTION_TEMPLATE_SLUG },
      include: { revisions: { include: { sections: true } } },
    });

    const apply = await bootstrapDemoExtractionTemplate({
      prisma: client,
      apply: true,
    });
    const afterApply = await ownedDemoBootstrapState(client);

    expect(afterApply.demoClinicCount).toBe(before.demoClinicCount);
    expect(afterApply.demoClinicCount).toBeLessThanOrEqual(1);
    expect(afterApply.demoClinicId).toBe(before.demoClinicId);
    expect(afterApply.demoUserCount).toBe(before.demoUserCount);

    if (!existing) {
      expect(apply.plan.action).toBe("create");
      expect(apply.applied).toBe(true);
      const created = await client.guideTemplate.findUniqueOrThrow({
        where: { slug: DEMO_EXTRACTION_TEMPLATE_SLUG },
        include: {
          revisions: { include: { sections: true } },
        },
      });
      expect(created.title).toBe("Tooth Extraction");
      expect(created.isSample).toBe(true);
      expect(created.revisions).toHaveLength(1);
      expect(created.revisions[0]?.sections).toHaveLength(8);
      expect(created.revisions[0]?.reviewedAt).toBeNull();
      expect(created.revisions[0]?.reviewedBy).toBeNull();
      expect(afterApply.templateCount).toBe(1);
      expect(afterApply.revisionCount).toBe(1);
      expect(afterApply.sectionCount).toBe(8);
    } else {
      expect(apply.applied).toBe(false);
      expect(["noop", "refuse"]).toContain(apply.plan.action);
      expect(afterApply.templateCount).toBe(before.templateCount);
    }

    const second = await bootstrapDemoExtractionTemplate({
      prisma: client,
      apply: true,
    });
    const afterSecond = await ownedDemoBootstrapState(client);
    expect(second.applied).toBe(false);
    expect(afterSecond.templateCount).toBe(afterApply.templateCount);
    expect(afterSecond.demoClinicCount).toBe(before.demoClinicCount);
    expect(afterSecond.demoClinicId).toBe(before.demoClinicId);
    if (apply.plan.action === "create" || apply.plan.action === "noop") {
      expect(second.plan.action).toBe("noop");
      expect(afterSecond.templateCount).toBe(1);
      expect(afterSecond.revisionCount).toBe(1);
      expect(afterSecond.sectionCount).toBe(8);
    }

    const concurrent = await Promise.all([
      bootstrapDemoExtractionTemplate({ prisma: client, apply: true }),
      bootstrapDemoExtractionTemplate({ prisma: client, apply: true }),
    ]);
    const afterConcurrent = await ownedDemoBootstrapState(client);
    expect(concurrent.map((result) => result.applied)).toEqual([false, false]);
    expect(afterConcurrent.templateCount).toBe(afterSecond.templateCount);
    expect(afterConcurrent.demoClinicCount).toBe(before.demoClinicCount);
    expect(afterConcurrent.demoClinicCount).toBeLessThanOrEqual(1);
    expect(afterConcurrent.demoClinicId).toBe(before.demoClinicId);
    if (second.plan.action === "noop") {
      expect(concurrent.map((result) => result.plan.action)).toEqual([
        "noop",
        "noop",
      ]);
      expect(afterConcurrent.templateCount).toBe(1);
    }

    void dbAvailable;
  });
});
