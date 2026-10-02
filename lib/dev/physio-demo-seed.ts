import type { PrismaClient } from "@prisma/client";

import { PHYSIO_DEMO_TENANT_SLUG } from "@/lib/aftercare/demo-tenant";
import { isLocalDevelopmentDatabase } from "@/lib/dev/database-target";
import {
  syncRiversidePracticePublication,
  type RiversideSeedSection,
} from "@/lib/dev/riverside-demo-seed";
import { ensurePrimarySiteAndRootLocation } from "@/lib/clinics/primary-site-location.mjs";

export const PHYSIO_DEMO_CLINIC_ID = "clinic_demo_physio";
export const PHYSIO_DEMO_TEMPLATE_ID = "guide_tmpl_demo_physio_home_exercise";
export const PHYSIO_DEMO_CANONICAL_REVISION_ID =
  "guide_rev_demo_physio_home_exercise_v1";
export const PHYSIO_DEMO_PRACTICE_GUIDE_ID =
  "practice_guide_demo_physio_home_exercise";
export const PHYSIO_DEMO_PUBLIC_SLUG = "home-exercise-plan";

const PUBLISHED_AT = new Date("2026-10-02T00:00:00.000Z");

const PROFILE = {
  displayName: "River Physio Demo",
  logoUrl: "/demo/physio-mark.svg",
  primaryColor: "#146f88",
  accentColor: "#2d3bb8",
  neutralColor: "#f4fbff",
  radiusPreset: "SOFT" as const,
  instructionTerminology: "AFTERCARE" as const,
  themeMode: "SYSTEM" as const,
  allowPatientThemeToggle: true,
  phone: null,
  addressLine1: null,
  addressLine2: null,
  city: null,
  region: null,
  postalCode: null,
  country: null,
  bookingUrl: null,
  contactUrl: "https://example.com/river-physio-demo",
  contactEmail: null,
  emergencyInstructions:
    "This is a fictional demonstration clinic. It is not a real physiotherapy practice and cannot give clinical advice. In a real emergency, contact local emergency services.",
  showCareGuideAttribution: true,
};

const HOME_CARE = [
  {
    key: "demonstration-repetition",
    title: "Demonstration repetition",
    body: "This line shows a written instruction and its schedule. It is not an exercise prescription.",
    frequencyCount: 1,
    frequencyPeriod: "DAY" as const,
    timingLabel: "Morning",
    durationValue: 7,
    durationUnit: "DAYS" as const,
    sortOrder: 1,
  },
  {
    key: "demonstration-weekly",
    title: "Demonstration weekly note",
    body: "This second line shows a weekly schedule summary. Nothing here is tracked or prescribed.",
    frequencyCount: 3,
    frequencyPeriod: "WEEK" as const,
    timingLabel: null,
    durationValue: 4,
    durationUnit: "WEEKS" as const,
    sortOrder: 2,
  },
];

const CANONICAL_SECTIONS = [
  {
    key: "introduction",
    kind: "INTRODUCTION" as const,
    title: "Introduction",
    body: "This page demonstrates how a physiotherapy home-care guide can look. The clinic is fictional. The text is not an individually prescribed plan and it is not clinical advice.",
    sortOrder: 1,
  },
  {
    key: "home-care-plan",
    kind: "HOME_CARE_PLAN" as const,
    title: "Home care instructions",
    body: "These instructions are sample layout only. They do not record completion, adherence, or progress.",
    sortOrder: 2,
    homeCareInstructions: HOME_CARE,
  },
  {
    key: "expected-symptoms",
    kind: "WHAT_IS_NORMAL" as const,
    title: "Expected symptoms",
    body: "A published guide can describe what the clinic expects a patient to notice. This sentence is a placeholder, not a symptom list.",
    sortOrder: 3,
  },
  {
    key: "activity-guidance",
    kind: "RESTRICTIONS" as const,
    title: "Activity guidance",
    body: "A published guide can describe activity the clinic wants the patient to read again. This sentence is not activity advice.",
    sortOrder: 4,
  },
  {
    key: "contact-practice",
    kind: "CONTACT_PRACTICE" as const,
    title: "Contact information",
    body: "River Physio Demo does not have a real phone number, address, or practitioner. Use the demonstration contact link only to see how contact details appear.",
    sortOrder: 5,
  },
  {
    key: "warning-signs",
    kind: "WARNING_SIGNS" as const,
    title: "Warning signs",
    body: "A published guide can include warning signs chosen by the clinic. This placeholder is not a warning for a real patient.",
    sortOrder: 6,
  },
  {
    key: "emergency",
    kind: "EMERGENCY" as const,
    title: "Emergency",
    body: "This demonstration cannot help in an emergency. A real emergency needs local emergency services.",
    sortOrder: 7,
  },
];

const OVERRIDE = {
  sectionKey: "introduction",
  title: "About this demonstration",
  body: CANONICAL_SECTIONS[0]?.body ?? "",
};

const ADDITION = {
  key: "demonstration-note",
  kind: "CUSTOM" as const,
  title: "Demonstration note",
  body: "River Physio Demo and this guide are illustrations. They are not individually prescribed clinical guidance.",
  sortOrder: 1,
  insertAfterSectionKey: "contact-practice",
};

type SeedPrisma = PrismaClient;

export function composedPhysioPracticeSections(): RiversideSeedSection[] {
  return CANONICAL_SECTIONS.flatMap((section, index) => {
    const overridden = section.key === OVERRIDE.sectionKey;
    const composed: RiversideSeedSection = {
      key: section.key,
      kind: section.kind,
      title: overridden ? OVERRIDE.title : section.title,
      body: overridden ? OVERRIDE.body : section.body,
      periodLabel: null,
      startDay: null,
      endDay: null,
      sortOrder: index + 1,
      provenance: overridden ? "PRACTICE_OVERRIDE" : "CANONICAL",
      homeCareInstructions: section.homeCareInstructions,
    };
    if (section.key !== ADDITION.insertAfterSectionKey) {
      return [composed];
    }
    return [
      composed,
      {
        key: ADDITION.key,
        kind: ADDITION.kind,
        title: ADDITION.title,
        body: ADDITION.body,
        periodLabel: null,
        startDay: null,
        endDay: null,
        sortOrder: index + 2,
        provenance: "PRACTICE_ADDITION",
      },
    ];
  });
}

/**
 * Local seed may create the fictional clinic, the synthetic sample, and the
 * original practice snapshot. A remote database is left untouched.
 * A newer published practice revision keeps its pin and snapshot.
 * A different active physiotherapy sample keeps the category slot.
 */
export async function seedPhysioDemo(
  prisma: SeedPrisma,
  env: NodeJS.ProcessEnv = process.env
): Promise<{ applied: boolean; sampleSkipped: boolean }> {
  if (!isLocalDevelopmentDatabase(env.DATABASE_URL, env.VERCEL_ENV)) {
    return { applied: false, sampleSkipped: false };
  }

  const existingClinic = await prisma.clinic.findFirst({
    where: {
      OR: [{ id: PHYSIO_DEMO_CLINIC_ID }, { slug: PHYSIO_DEMO_TENANT_SLUG }],
    },
    select: { id: true },
  });
  const clinicId = existingClinic?.id ?? PHYSIO_DEMO_CLINIC_ID;
  await prisma.clinic.upsert({
    where: { id: clinicId },
    update: { name: "River Physio Demo", slug: PHYSIO_DEMO_TENANT_SLUG },
    create: {
      id: PHYSIO_DEMO_CLINIC_ID,
      name: "River Physio Demo",
      slug: PHYSIO_DEMO_TENANT_SLUG,
    },
  });
  await prisma.clinicProfile.upsert({
    where: { clinicId },
    update: PROFILE,
    create: { clinicId, ...PROFILE },
  });
  const profile = await prisma.clinicProfile.findUniqueOrThrow({
    where: { clinicId },
  });
  const hierarchy = await ensurePrimarySiteAndRootLocation(prisma, {
    clinicId,
    clinicName: "River Physio Demo",
    slug: PHYSIO_DEMO_TENANT_SLUG,
    profile,
  });

  const occupant = await prisma.guideTemplate.findFirst({
    where: {
      serviceCategory: "PHYSIOTHERAPY",
      isSample: true,
      isActive: true,
      NOT: { id: PHYSIO_DEMO_TEMPLATE_ID },
    },
    select: { id: true },
  });
  if (occupant) {
    return { applied: true, sampleSkipped: true };
  }

  const published = await prisma.guideTemplateRevision.findMany({
    where: {
      guideTemplateId: PHYSIO_DEMO_TEMPLATE_ID,
      status: "PUBLISHED",
    },
    select: { version: true },
  });
  const preserveCanonical = published.some((revision) => revision.version > 1);

  if (!preserveCanonical) {
    await prisma.guideTemplate.upsert({
      where: { id: PHYSIO_DEMO_TEMPLATE_ID },
      update: {
        serviceCategory: "PHYSIOTHERAPY",
        slug: PHYSIO_DEMO_PUBLIC_SLUG,
        title: "Physiotherapy Home Exercise Plan",
        isActive: true,
        isSample: true,
      },
      create: {
        id: PHYSIO_DEMO_TEMPLATE_ID,
        serviceCategory: "PHYSIOTHERAPY",
        slug: PHYSIO_DEMO_PUBLIC_SLUG,
        title: "Physiotherapy Home Exercise Plan",
        isActive: true,
        isSample: true,
      },
    });
    await prisma.guideTemplateRevision.upsert({
      where: { id: PHYSIO_DEMO_CANONICAL_REVISION_ID },
      update: {
        guideTemplateId: PHYSIO_DEMO_TEMPLATE_ID,
        version: 1,
        status: "PUBLISHED",
        publishedAt: PUBLISHED_AT,
        reviewedAt: null,
        reviewerName: null,
        reviewRecordedByUserId: null,
      },
      create: {
        id: PHYSIO_DEMO_CANONICAL_REVISION_ID,
        guideTemplateId: PHYSIO_DEMO_TEMPLATE_ID,
        version: 1,
        status: "PUBLISHED",
        publishedAt: PUBLISHED_AT,
        reviewedAt: null,
        reviewerName: null,
        reviewRecordedByUserId: null,
      },
    });
    await prisma.guideTemplateSection.deleteMany({
      where: { revisionId: PHYSIO_DEMO_CANONICAL_REVISION_ID },
    });
    for (const section of CANONICAL_SECTIONS) {
      await prisma.guideTemplateSection.create({
        data: {
          revisionId: PHYSIO_DEMO_CANONICAL_REVISION_ID,
          key: section.key,
          kind: section.kind,
          title: section.title,
          body: section.body,
          sortOrder: section.sortOrder,
          homeCareInstructions: section.homeCareInstructions
            ? {
                create: section.homeCareInstructions.map((item) => ({
                  ...item,
                })),
              }
            : undefined,
        },
      });
    }
  }

  const practiceVersions = await prisma.practiceGuideRevision.findMany({
    where: {
      practiceGuideId: PHYSIO_DEMO_PRACTICE_GUIDE_ID,
      status: "PUBLISHED",
    },
    select: { version: true },
  });
  const preservePractice = practiceVersions.some(
    (revision) => revision.version > 1
  );

  await prisma.practiceGuide.upsert({
    where: { id: PHYSIO_DEMO_PRACTICE_GUIDE_ID },
    update: {
      clinicId,
      title: "Physiotherapy Home Exercise Plan",
      guideTemplateId: PHYSIO_DEMO_TEMPLATE_ID,
      publicSlug: PHYSIO_DEMO_PUBLIC_SLUG,
      isEnabled: true,
      status: "PUBLISHED",
      sortOrder: 1,
      ...(preservePractice
        ? {}
        : {
            pinnedRevisionId: PHYSIO_DEMO_CANONICAL_REVISION_ID,
            publishedAt: PUBLISHED_AT,
          }),
    },
    create: {
      id: PHYSIO_DEMO_PRACTICE_GUIDE_ID,
      clinicId,
      title: "Physiotherapy Home Exercise Plan",
      guideTemplateId: PHYSIO_DEMO_TEMPLATE_ID,
      pinnedRevisionId: PHYSIO_DEMO_CANONICAL_REVISION_ID,
      publicSlug: PHYSIO_DEMO_PUBLIC_SLUG,
      isEnabled: true,
      status: "PUBLISHED",
      sortOrder: 1,
      publishedAt: PUBLISHED_AT,
    },
  });

  if (!preservePractice) {
    await prisma.practiceGuideOverride.upsert({
      where: { id: "practice_override_demo_physio_intro" },
      update: {
        practiceGuideId: PHYSIO_DEMO_PRACTICE_GUIDE_ID,
        sectionKey: OVERRIDE.sectionKey,
        title: OVERRIDE.title,
        body: OVERRIDE.body,
      },
      create: {
        id: "practice_override_demo_physio_intro",
        practiceGuideId: PHYSIO_DEMO_PRACTICE_GUIDE_ID,
        sectionKey: OVERRIDE.sectionKey,
        title: OVERRIDE.title,
        body: OVERRIDE.body,
      },
    });
    await prisma.practiceGuideAddition.upsert({
      where: { id: "practice_addition_demo_physio_note" },
      update: {
        practiceGuideId: PHYSIO_DEMO_PRACTICE_GUIDE_ID,
        key: ADDITION.key,
        kind: ADDITION.kind,
        title: ADDITION.title,
        body: ADDITION.body,
        sortOrder: ADDITION.sortOrder,
        insertAfterSectionKey: ADDITION.insertAfterSectionKey,
      },
      create: {
        id: "practice_addition_demo_physio_note",
        practiceGuideId: PHYSIO_DEMO_PRACTICE_GUIDE_ID,
        key: ADDITION.key,
        kind: ADDITION.kind,
        title: ADDITION.title,
        body: ADDITION.body,
        sortOrder: ADDITION.sortOrder,
        insertAfterSectionKey: ADDITION.insertAfterSectionKey,
      },
    });
  }

  await syncRiversidePracticePublication(prisma, {
    practiceGuideId: PHYSIO_DEMO_PRACTICE_GUIDE_ID,
    clinicId,
    locationId: hierarchy.locationId,
    seededPinnedRevisionId: PHYSIO_DEMO_CANONICAL_REVISION_ID,
    seededPublishedRevisionId: "practice_rev_demo_physio_home_exercise_v1",
    seededDraftRevisionId: "practice_rev_demo_physio_home_exercise_draft",
    title: "Physiotherapy Home Exercise Plan",
    publicSlug: PHYSIO_DEMO_PUBLIC_SLUG,
    publishedAt: PUBLISHED_AT,
    sections: composedPhysioPracticeSections(),
  });

  return { applied: true, sampleSkipped: false };
}

export type PhysioDemoClinicShellPlan =
  | { action: "create" }
  | { action: "noop"; reason: string }
  | { action: "refuse"; reason: string };

export function planPhysioDemoClinicShell(input: {
  local: boolean;
  apply: boolean;
  allowProduction: boolean;
  confirmDemoClinic: boolean;
  clinicExists: boolean;
}): PhysioDemoClinicShellPlan {
  if (!input.apply) {
    return input.clinicExists
      ? { action: "noop", reason: "The clinic shell already exists." }
      : { action: "create" };
  }
  if (!input.local && (!input.allowProduction || !input.confirmDemoClinic)) {
    return {
      action: "refuse",
      reason:
        "Remote clinic creation is refused. Pass --allow-production and --confirm-demo-clinic. This command does not publish a sample or open Stripe Checkout.",
    };
  }
  if (input.clinicExists) {
    return { action: "noop", reason: "The clinic shell already exists." };
  }
  return { action: "create" };
}

export async function loadPhysioDemoClinicExists(
  prisma: Pick<PrismaClient, "clinic">
): Promise<boolean> {
  const clinic = await prisma.clinic.findUnique({
    where: { slug: PHYSIO_DEMO_TENANT_SLUG },
    select: { id: true },
  });
  return clinic !== null;
}

/**
 * Creates only the account, profile, primary site, and root location.
 * It does not create a sample, a practice guide, or a Stripe customer.
 */
export async function createPhysioDemoClinicShell(
  prisma: SeedPrisma
): Promise<void> {
  await prisma.clinic.create({
    data: {
      name: "River Physio Demo",
      slug: PHYSIO_DEMO_TENANT_SLUG,
      profile: { create: PROFILE },
    },
  });
  const clinic = await prisma.clinic.findUniqueOrThrow({
    where: { slug: PHYSIO_DEMO_TENANT_SLUG },
    include: { profile: true },
  });
  await ensurePrimarySiteAndRootLocation(prisma, {
    clinicId: clinic.id,
    clinicName: clinic.name,
    slug: clinic.slug,
    profile: clinic.profile,
  });
}
