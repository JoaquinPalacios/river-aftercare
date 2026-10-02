import "dotenv/config";

import { randomBytes, scryptSync } from "node:crypto";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

import { DEMO_EXTRACTION_CANONICAL_SECTIONS } from "../lib/aftercare/demo-extraction-template-payload.mjs";
import { ensurePrimarySiteAndRootLocation } from "../lib/clinics/primary-site-location.mjs";
import {
  resolveLocalLoginSeed,
  upsertLocalLoginAccounts,
} from "../lib/dev/local-login-accounts.ts";
import { seedPhysioDemo } from "../lib/dev/physio-demo-seed.ts";
import {
  riversidePracticeSeedPlan,
  syncRiversidePracticePublication,
} from "../lib/dev/riverside-demo-seed.ts";
import {
  SHARED_DEMO_ACCOUNT,
  SHARED_DEMO_PROFILE,
} from "../lib/dev/shared-demo-brand.ts";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({ adapter });

const DEMO_CLINIC = SHARED_DEMO_ACCOUNT;

const DEMO_CLINIC_PROFILE = SHARED_DEMO_PROFILE;

const DEMO_EXTRACTION_SECTION_IDS = {
  introduction: "guide_sec_demo_extraction_intro",
  "immediate-care": "guide_sec_demo_extraction_immediate",
  "first-24-hours": "guide_sec_demo_extraction_first_day",
  "days-2-3": "guide_sec_demo_extraction_days_2_3",
  "days-4-7": "guide_sec_demo_extraction_days_4_7",
  "what-is-normal": "guide_sec_demo_extraction_normal",
  "warning-signs": "guide_sec_demo_extraction_warnings",
  "contact-practice": "guide_sec_demo_extraction_contact",
};

const DEMO_EXTRACTION_GUIDE = {
  templateId: "guide_tmpl_demo_extraction",
  serviceCategory: "DENTAL",
  slug: "extraction",
  title: "Tooth Extraction",
  revisionId: "guide_rev_demo_extraction_v1",
  version: 1,
  practiceGuideId: "practice_guide_demo_rivers_extraction",
  overrideId: "practice_override_demo_rivers_extraction_contact",
  additionId: "practice_addition_demo_rivers_extraction_hours",
  publishedAt: new Date("2026-08-31T00:00:00.000Z"),
  sections: DEMO_EXTRACTION_CANONICAL_SECTIONS.map((section) => ({
    ...section,
    id: DEMO_EXTRACTION_SECTION_IDS[section.key],
  })),
  override: {
    sectionKey: "first-24-hours",
    title: "The first day at Riverside Dental Demo",
    body: `Leave the site undisturbed. Choose soft, cool foods and take any pain relief only as the clinic advised. If you have questions during the first evening, use the after-hours number on this page.`,
  },
  addition: {
    key: "weekend-contact",
    kind: "CUSTOM",
    title: "Weekend contact",
    sortOrder: 1,
    insertAfterSectionKey: "contact-practice",
    periodLabel: null,
    body: `If you need the practice at the weekend, use the phone number on this page.`,
  },
};

function createPasswordHash(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");

  return `scrypt:${salt}:${hash}`;
}

async function upsertAftercareDemo(clinicId) {
  await prisma.clinicProfile.upsert({
    where: { clinicId },
    update: DEMO_CLINIC_PROFILE,
    create: {
      clinicId,
      ...DEMO_CLINIC_PROFILE,
    },
  });

  const clinic = await prisma.clinic.findUniqueOrThrow({
    where: { id: clinicId },
  });
  const profile = await prisma.clinicProfile.findUniqueOrThrow({
    where: { clinicId },
  });
  const hierarchy = await ensurePrimarySiteAndRootLocation(prisma, {
    clinicId: clinic.id,
    clinicName: clinic.name,
    slug: clinic.slug,
    profile,
  });

  const template = await prisma.guideTemplate.upsert({
    where: { id: DEMO_EXTRACTION_GUIDE.templateId },
    update: {
      serviceCategory: DEMO_EXTRACTION_GUIDE.serviceCategory,
      slug: DEMO_EXTRACTION_GUIDE.slug,
      title: DEMO_EXTRACTION_GUIDE.title,
      isActive: true,
      isSample: true,
    },
    create: {
      id: DEMO_EXTRACTION_GUIDE.templateId,
      serviceCategory: DEMO_EXTRACTION_GUIDE.serviceCategory,
      slug: DEMO_EXTRACTION_GUIDE.slug,
      title: DEMO_EXTRACTION_GUIDE.title,
      isActive: true,
      isSample: true,
    },
  });

  const publishedCanonical = await prisma.guideTemplateRevision.findMany({
    where: {
      guideTemplateId: DEMO_EXTRACTION_GUIDE.templateId,
      status: "PUBLISHED",
    },
    select: { version: true },
  });
  const preserveCanonical = publishedCanonical.some(
    (revision) => revision.version > 1
  );

  const revision = await prisma.guideTemplateRevision.upsert({
    where: { id: DEMO_EXTRACTION_GUIDE.revisionId },
    update: {
      guideTemplateId: template.id,
      version: DEMO_EXTRACTION_GUIDE.version,
      status: "PUBLISHED",
      publishedAt: DEMO_EXTRACTION_GUIDE.publishedAt,
      reviewedAt: null,
      reviewerName: null,
      reviewRecordedByUserId: null,
    },
    create: {
      id: DEMO_EXTRACTION_GUIDE.revisionId,
      guideTemplateId: template.id,
      version: DEMO_EXTRACTION_GUIDE.version,
      status: "PUBLISHED",
      publishedAt: DEMO_EXTRACTION_GUIDE.publishedAt,
      reviewedAt: null,
      reviewerName: null,
      reviewRecordedByUserId: null,
    },
  });

  if (!preserveCanonical) {
    await prisma.guideTemplateSection.deleteMany({
      where: { revisionId: revision.id },
    });

    for (const section of DEMO_EXTRACTION_GUIDE.sections) {
      await prisma.guideTemplateSection.create({
        data: {
          id: section.id,
          revisionId: revision.id,
          key: section.key,
          kind: section.kind,
          title: section.title,
          body: section.body,
          periodLabel: section.periodLabel,
          startDay: section.startDay ?? null,
          endDay: section.endDay ?? null,
          sortOrder: section.sortOrder,
        },
      });
    }
  }

  const existingPublishedRevisions =
    await prisma.practiceGuideRevision.findMany({
      where: {
        practiceGuideId: DEMO_EXTRACTION_GUIDE.practiceGuideId,
        status: "PUBLISHED",
      },
      select: { version: true },
    });
  const { preserveAdoptedRevisions } = riversidePracticeSeedPlan(
    existingPublishedRevisions.map((row) => row.version)
  );

  const practiceGuide = await prisma.practiceGuide.upsert({
    where: { id: DEMO_EXTRACTION_GUIDE.practiceGuideId },
    update: {
      clinicId,
      title: DEMO_EXTRACTION_GUIDE.title,
      guideTemplateId: template.id,
      ...(preserveAdoptedRevisions
        ? {}
        : {
            pinnedRevisionId: revision.id,
            publishedAt: DEMO_EXTRACTION_GUIDE.publishedAt,
          }),
      publicSlug: DEMO_EXTRACTION_GUIDE.slug,
      isEnabled: true,
      status: "PUBLISHED",
      sortOrder: 1,
    },
    create: {
      id: DEMO_EXTRACTION_GUIDE.practiceGuideId,
      clinicId,
      title: DEMO_EXTRACTION_GUIDE.title,
      guideTemplateId: template.id,
      pinnedRevisionId: revision.id,
      publicSlug: DEMO_EXTRACTION_GUIDE.slug,
      isEnabled: true,
      status: "PUBLISHED",
      sortOrder: 1,
      publishedAt: DEMO_EXTRACTION_GUIDE.publishedAt,
    },
  });

  if (!preserveAdoptedRevisions) {
    await prisma.practiceGuideOverride.upsert({
      where: { id: DEMO_EXTRACTION_GUIDE.overrideId },
      update: {
        practiceGuideId: practiceGuide.id,
        sectionKey: DEMO_EXTRACTION_GUIDE.override.sectionKey,
        title: DEMO_EXTRACTION_GUIDE.override.title,
        body: DEMO_EXTRACTION_GUIDE.override.body,
      },
      create: {
        id: DEMO_EXTRACTION_GUIDE.overrideId,
        practiceGuideId: practiceGuide.id,
        sectionKey: DEMO_EXTRACTION_GUIDE.override.sectionKey,
        title: DEMO_EXTRACTION_GUIDE.override.title,
        body: DEMO_EXTRACTION_GUIDE.override.body,
      },
    });

    await prisma.practiceGuideAddition.upsert({
      where: { id: DEMO_EXTRACTION_GUIDE.additionId },
      update: {
        practiceGuideId: practiceGuide.id,
        key: DEMO_EXTRACTION_GUIDE.addition.key,
        kind: DEMO_EXTRACTION_GUIDE.addition.kind,
        title: DEMO_EXTRACTION_GUIDE.addition.title,
        body: DEMO_EXTRACTION_GUIDE.addition.body,
        periodLabel: DEMO_EXTRACTION_GUIDE.addition.periodLabel,
        sortOrder: DEMO_EXTRACTION_GUIDE.addition.sortOrder,
        insertAfterSectionKey:
          DEMO_EXTRACTION_GUIDE.addition.insertAfterSectionKey,
      },
      create: {
        id: DEMO_EXTRACTION_GUIDE.additionId,
        practiceGuideId: practiceGuide.id,
        key: DEMO_EXTRACTION_GUIDE.addition.key,
        kind: DEMO_EXTRACTION_GUIDE.addition.kind,
        title: DEMO_EXTRACTION_GUIDE.addition.title,
        body: DEMO_EXTRACTION_GUIDE.addition.body,
        periodLabel: DEMO_EXTRACTION_GUIDE.addition.periodLabel,
        sortOrder: DEMO_EXTRACTION_GUIDE.addition.sortOrder,
        insertAfterSectionKey:
          DEMO_EXTRACTION_GUIDE.addition.insertAfterSectionKey,
      },
    });
  }

  await syncRiversidePracticePublication(prisma, {
    practiceGuideId: practiceGuide.id,
    clinicId,
    locationId: hierarchy.locationId,
    seededPinnedRevisionId: revision.id,
    seededPublishedRevisionId: "practice_rev_demo_rivers_extraction_v1",
    seededDraftRevisionId: "practice_rev_demo_rivers_extraction_draft",
    title: DEMO_EXTRACTION_GUIDE.title,
    publicSlug: DEMO_EXTRACTION_GUIDE.slug,
    publishedAt: DEMO_EXTRACTION_GUIDE.publishedAt,
    sections: demoComposedSections(),
  });

  return { template, revision, practiceGuide };
}

function demoComposedSections() {
  return DEMO_EXTRACTION_GUIDE.sections.flatMap((section, index) => {
    const override =
      section.key === DEMO_EXTRACTION_GUIDE.override.sectionKey
        ? DEMO_EXTRACTION_GUIDE.override
        : null;
    const composed = {
      key: section.key,
      kind: section.kind,
      title: override?.title ?? section.title,
      body: override?.body ?? section.body,
      periodLabel: section.periodLabel,
      startDay: section.startDay ?? null,
      endDay: section.endDay ?? null,
      sortOrder: index + 1,
      provenance: override ? "PRACTICE_OVERRIDE" : "CANONICAL",
    };
    if (section.key !== DEMO_EXTRACTION_GUIDE.addition.insertAfterSectionKey) {
      return [composed];
    }
    return [
      composed,
      {
        key: DEMO_EXTRACTION_GUIDE.addition.key,
        kind: DEMO_EXTRACTION_GUIDE.addition.kind,
        title: DEMO_EXTRACTION_GUIDE.addition.title,
        body: DEMO_EXTRACTION_GUIDE.addition.body,
        periodLabel: DEMO_EXTRACTION_GUIDE.addition.periodLabel,
        startDay: null,
        endDay: null,
        sortOrder: index + 2,
        provenance: "PRACTICE_ADDITION",
      },
    ];
  });
}

async function main() {
  const login = resolveLocalLoginSeed();
  if (login.status === "refused" || login.status === "invalid") {
    console.error(login.reason);
    process.exitCode = 1;
    return;
  }

  const clinic = await prisma.clinic.upsert({
    where: { id: DEMO_CLINIC.id },
    update: {
      name: DEMO_CLINIC.name,
      slug: DEMO_CLINIC.slug,
    },
    create: DEMO_CLINIC,
  });

  if (login.status === "skipped" && login.reason === "missing") {
    console.info(
      "No complete Admin, Staff, or Operator development credentials found. Login accounts were not seeded."
    );
  }

  if (login.status === "seed") {
    await upsertLocalLoginAccounts({
      prisma,
      clinicId: clinic.id,
      accounts: login.accounts,
      hashPassword: createPasswordHash,
    });
  }

  const aftercareDemo = await upsertAftercareDemo(clinic.id);
  const physioDemo = await seedPhysioDemo(prisma, process.env);

  console.info("Seeded clinic-scoped demo data:");
  console.info(
    `- Clinic: ${clinic.name} (${clinic.id}) slug=${DEMO_CLINIC.slug}`
  );
  if (login.status === "seed") {
    for (const account of login.accounts) {
      console.info(
        `- ${account.role}: seeded from ${account.emailKey} / ${account.passwordKey}`
      );
    }
  }
  console.info(
    `- Clinic profile: ${DEMO_CLINIC_PROFILE.displayName} (patient-facing)`
  );
  console.info(
    `- Aftercare template: ${aftercareDemo.template.title} (${aftercareDemo.template.slug}) revision v${aftercareDemo.revision.version} SAMPLE/NON-CLINICAL demo-only (isSample=true, reviewedAt/reviewerName null)`
  );
  console.info(
    `- Practice guide: ${aftercareDemo.practiceGuide.publicSlug} pinned=${aftercareDemo.revision.id} published/enabled`
  );
  if (!physioDemo.applied) {
    console.info(
      "- Physiotherapy demo: not seeded. Remote and production databases are left unchanged."
    );
  } else if (physioDemo.sampleSkipped) {
    console.info(
      "- Shared demo: the active physiotherapy sample was left in place."
    );
  } else {
    console.info(
      "- Shared demo: synthetic Home Exercise Plan sample on demodental."
    );
  }
}

main()
  .catch((error) => {
    console.error("Prisma seed failed.");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
