import "dotenv/config";

import { afterAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

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
      "- 1 GuideTemplate slug=extraction title=Tooth Extraction specialty=DENTAL isActive=true"
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
    const clinicCount = await client.clinic.count();
    const userCount = await client.user.count();
    const guideCount = await client.practiceGuide.count();
    const templateCount = await client.guideTemplate.count();
    const revisionCount = await client.guideTemplateRevision.count();
    const sectionCount = await client.guideTemplateSection.count();

    const dryRun = await bootstrapDemoExtractionTemplate({
      prisma: client,
      apply: false,
    });
    expect(dryRun.applied).toBe(false);
    expect(await client.clinic.count()).toBe(clinicCount);
    expect(await client.user.count()).toBe(userCount);
    expect(await client.practiceGuide.count()).toBe(guideCount);
    expect(await client.guideTemplate.count()).toBe(templateCount);
    expect(await client.guideTemplateRevision.count()).toBe(revisionCount);
    expect(await client.guideTemplateSection.count()).toBe(sectionCount);

    const existing = await client.guideTemplate.findUnique({
      where: { slug: DEMO_EXTRACTION_TEMPLATE_SLUG },
      include: { revisions: { include: { sections: true } } },
    });

    const apply = await bootstrapDemoExtractionTemplate({
      prisma: client,
      apply: true,
    });

    expect(await client.clinic.count()).toBe(clinicCount);
    expect(await client.user.count()).toBe(userCount);
    expect(await client.practiceGuide.count()).toBe(guideCount);

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
      expect(created.revisions).toHaveLength(1);
      expect(created.revisions[0]?.sections).toHaveLength(8);
      expect(created.revisions[0]?.reviewedAt).toBeNull();
      expect(created.revisions[0]?.reviewedBy).toBeNull();
      expect(await client.guideTemplate.count()).toBe(templateCount + 1);
      expect(await client.guideTemplateRevision.count()).toBe(
        revisionCount + 1
      );
      expect(await client.guideTemplateSection.count()).toBe(sectionCount + 8);

      const second = await bootstrapDemoExtractionTemplate({
        prisma: client,
        apply: true,
      });
      expect(second.plan.action).toBe("noop");
      expect(second.applied).toBe(false);
      expect(await client.guideTemplate.count()).toBe(templateCount + 1);
      return;
    }

    expect(apply.applied).toBe(false);
    expect(["noop", "refuse"]).toContain(apply.plan.action);
    if (apply.plan.action === "noop") {
      const second = await bootstrapDemoExtractionTemplate({
        prisma: client,
        apply: true,
      });
      expect(second.plan.action).toBe("noop");
      expect(second.applied).toBe(false);
      expect(await client.guideTemplate.count()).toBe(templateCount);
    }

    void dbAvailable;
  });
});
