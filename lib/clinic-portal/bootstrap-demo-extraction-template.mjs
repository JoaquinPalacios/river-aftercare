import { GuideRevisionStatus } from "@prisma/client";

import {
  DEMO_EXTRACTION_CANONICAL_SECTIONS,
  DEMO_EXTRACTION_TEMPLATE_SLUG,
  DEMO_EXTRACTION_TEMPLATE_SPECIALTY,
  DEMO_EXTRACTION_TEMPLATE_TITLE,
  DEMO_EXTRACTION_TEMPLATE_VERSION,
} from "../aftercare/demo-extraction-template-payload.mjs";

export const BOOTSTRAP_DEMO_TEMPLATE_NOTICE =
  "SAMPLE / NON-CLINICAL Tooth Extraction template for the interactive demo tenant only. This is not clinical approval.";

function expectedSections() {
  return DEMO_EXTRACTION_CANONICAL_SECTIONS.map((section) => ({
    key: section.key,
    kind: section.kind,
    title: section.title,
    body: section.body,
    periodLabel: section.periodLabel,
    startDay: section.startDay,
    endDay: section.endDay,
    sortOrder: section.sortOrder,
  }));
}

function sameNullable(left, right) {
  return left === right;
}

function describeMismatch(existing) {
  if (existing.slug !== DEMO_EXTRACTION_TEMPLATE_SLUG) {
    return `Expected slug "${DEMO_EXTRACTION_TEMPLATE_SLUG}".`;
  }
  if (existing.title !== DEMO_EXTRACTION_TEMPLATE_TITLE) {
    return `Title mismatch: found "${existing.title}".`;
  }
  if (existing.specialty !== DEMO_EXTRACTION_TEMPLATE_SPECIALTY) {
    return `Specialty mismatch: found "${existing.specialty}".`;
  }
  if (!existing.isActive) {
    return "Existing extraction template is inactive.";
  }
  if (existing.revisions.length !== 1) {
    return `Expected exactly 1 revision, found ${existing.revisions.length}.`;
  }

  const revision = existing.revisions[0];
  if (revision.version !== DEMO_EXTRACTION_TEMPLATE_VERSION) {
    return `Revision version mismatch: found ${revision.version}.`;
  }
  if (revision.status !== GuideRevisionStatus.PUBLISHED) {
    return `Revision status mismatch: found ${revision.status}.`;
  }
  if (revision.reviewedAt != null) {
    return "Review metadata is unexpectedly present (reviewedAt).";
  }
  if (
    revision.reviewedBy != null &&
    String(revision.reviewedBy).trim() !== ""
  ) {
    return "Review metadata is unexpectedly present (reviewedBy).";
  }
  const expected = expectedSections();
  if (revision.sections.length !== expected.length) {
    return `Expected ${expected.length} sections, found ${revision.sections.length}.`;
  }

  for (const [index, section] of expected.entries()) {
    const actual = revision.sections[index];
    if (
      actual.key !== section.key ||
      actual.kind !== section.kind ||
      actual.title !== section.title ||
      actual.body !== section.body ||
      !sameNullable(actual.periodLabel, section.periodLabel) ||
      actual.startDay !== section.startDay ||
      actual.endDay !== section.endDay ||
      actual.sortOrder !== section.sortOrder
    ) {
      return `Section mismatch at sortOrder ${section.sortOrder} (key "${section.key}").`;
    }
  }

  return "";
}

export function planDemoExtractionBootstrap(existing) {
  const notice = BOOTSTRAP_DEMO_TEMPLATE_NOTICE;

  if (!existing) {
    return {
      action: "create",
      changed: true,
      notice,
      template: {
        slug: DEMO_EXTRACTION_TEMPLATE_SLUG,
        title: DEMO_EXTRACTION_TEMPLATE_TITLE,
        specialty: DEMO_EXTRACTION_TEMPLATE_SPECIALTY,
        isActive: true,
      },
      revision: {
        version: DEMO_EXTRACTION_TEMPLATE_VERSION,
        status: "PUBLISHED",
        reviewedAt: null,
        reviewedBy: null,
      },
      sections: expectedSections(),
    };
  }

  const mismatch = describeMismatch(existing);
  if (mismatch) {
    return {
      action: "refuse",
      changed: false,
      notice,
      reason: mismatch,
    };
  }

  return {
    action: "noop",
    changed: false,
    notice,
    reason: `Canonical template "${DEMO_EXTRACTION_TEMPLATE_SLUG}" already matches the sample payload.`,
  };
}

export async function loadDemoExtractionTemplateSnapshot(prisma) {
  return prisma.guideTemplate.findUnique({
    where: { slug: DEMO_EXTRACTION_TEMPLATE_SLUG },
    select: {
      slug: true,
      title: true,
      specialty: true,
      isActive: true,
      revisions: {
        orderBy: { version: "asc" },
        select: {
          version: true,
          status: true,
          reviewedAt: true,
          reviewedBy: true,
          sections: {
            orderBy: [{ sortOrder: "asc" }, { key: "asc" }],
            select: {
              key: true,
              kind: true,
              title: true,
              body: true,
              periodLabel: true,
              startDay: true,
              endDay: true,
              sortOrder: true,
            },
          },
        },
      },
    },
  });
}

async function createDemoExtractionTemplate(prisma, plan) {
  await prisma.$transaction(async (tx) => {
    const existing = await tx.guideTemplate.findUnique({
      where: { slug: DEMO_EXTRACTION_TEMPLATE_SLUG },
      select: { id: true },
    });
    if (existing) {
      throw new Error(
        `Refusing to create: slug "${DEMO_EXTRACTION_TEMPLATE_SLUG}" appeared during apply.`
      );
    }

    await tx.guideTemplate.create({
      data: {
        slug: plan.template.slug,
        title: plan.template.title,
        specialty: plan.template.specialty,
        isActive: plan.template.isActive,
        revisions: {
          create: {
            version: plan.revision.version,
            status: GuideRevisionStatus.PUBLISHED,
            publishedAt: new Date(),
            reviewedAt: null,
            reviewedBy: null,
            sections: {
              create: plan.sections.map((section) => ({
                key: section.key,
                kind: section.kind,
                title: section.title,
                body: section.body,
                periodLabel: section.periodLabel,
                startDay: section.startDay,
                endDay: section.endDay,
                sortOrder: section.sortOrder,
              })),
            },
          },
        },
      },
    });
  });
}

export async function bootstrapDemoExtractionTemplate(input) {
  const existing = await loadDemoExtractionTemplateSnapshot(input.prisma);
  const plan = planDemoExtractionBootstrap(existing);

  if (plan.action === "refuse") {
    return { plan, applied: false };
  }

  if (!input.apply || plan.action === "noop") {
    return { plan, applied: false };
  }

  await createDemoExtractionTemplate(input.prisma, plan);
  return { plan, applied: true };
}

export function formatDemoExtractionBootstrapPlan(plan) {
  const lines = [plan.notice, `Action: ${plan.action}`];

  if (plan.action === "create") {
    lines.push(
      "Would create:",
      `- 1 GuideTemplate slug=${plan.template.slug} title=${plan.template.title} specialty=${plan.template.specialty} isActive=true`,
      `- 1 GuideTemplateRevision version=${plan.revision.version} status=${plan.revision.status} reviewedAt=null reviewedBy=null`,
      `- ${plan.sections.length} GuideTemplateSection rows (${plan.sections.map((section) => section.key).join(", ")})`,
      "Would not create Clinic, ClinicProfile, User, membership, room, doctor, procedure, or PracticeGuide records."
    );
  } else {
    lines.push(plan.reason);
    lines.push("No writes.");
  }

  lines.push(`Changed: ${plan.changed ? "yes" : "no"}`);
  return lines.join("\n");
}
