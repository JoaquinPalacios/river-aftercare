import "dotenv/config";

import { randomBytes, scryptSync } from "node:crypto";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, ClinicMembershipRole } from "@prisma/client";

import { DEMO_EXTRACTION_CANONICAL_SECTIONS } from "../lib/aftercare/demo-extraction-template-payload.mjs";
import { ensurePrimarySiteAndRootLocation } from "../lib/clinics/primary-site-location.mjs";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({ adapter });

const LOCAL_LOGIN_ACCOUNTS = [
  {
    role: ClinicMembershipRole.ADMIN,
    userId: "user_demo_admin",
    name: "Demo Admin",
    emailKey: "LOCAL_ADMIN_EMAIL",
    passwordKey: "LOCAL_ADMIN_PASSWORD",
    platformRole: "NONE",
    clinicMembership: true,
  },
  {
    role: ClinicMembershipRole.STAFF,
    userId: "user_demo_staff",
    name: "Demo Staff",
    emailKey: "LOCAL_STAFF_EMAIL",
    passwordKey: "LOCAL_STAFF_PASSWORD",
    platformRole: "NONE",
    clinicMembership: true,
  },
  {
    role: null,
    userId: "user_demo_operator",
    name: "Demo Operator",
    emailKey: "LOCAL_OPERATOR_EMAIL",
    passwordKey: "LOCAL_OPERATOR_PASSWORD",
    platformRole: "OPERATOR",
    clinicMembership: false,
  },
];

const DEMO_CLINIC = {
  id: "clinic_demo_rivers",
  name: "Rivers Care Demo Clinic",
  slug: "demodental",
};

const DEMO_CLINIC_PROFILE = {
  displayName: "Riverside Dental Demo",
  logoUrl: "/demo/riverside-mark.svg",
  primaryColor: "#0f766e",
  accentColor: "#f59e0b",
  neutralColor: "#ffffff",
  radiusPreset: "SOFT",
  instructionTerminology: "POST_TREATMENT",
  themeMode: "SYSTEM",
  allowPatientThemeToggle: true,
  phone: "02 5550 0100",
  addressLine1: "12 Riverside Demo Street",
  addressLine2: null,
  city: "Sydney",
  region: "NSW",
  postalCode: "2000",
  country: "AU",
  bookingUrl: "https://www.example.com/riverside-dental-demo/book",
  contactUrl: "https://www.example.com/riverside-dental-demo/contact",
  contactEmail: "hello@riverside-dental-demo.example",
  emergencyInstructions:
    "Call the clinic during hours. Use emergency services if you have trouble breathing, uncontrolled bleeding, or rapidly worsening swelling.",
  showCareGuideAttribution: true,
};

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
  specialty: "DENTAL",
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

function resolveLocalLoginAccounts(env = process.env) {
  const production = env.NODE_ENV === "production";
  const configured = LOCAL_LOGIN_ACCOUNTS.some(
    (account) => env[account.emailKey] || env[account.passwordKey]
  );

  if (production && configured) {
    return {
      status: "refused",
      reason:
        "LOCAL_* authentication variables must not be set in production. Development accounts were not created.",
      accounts: [],
    };
  }

  if (production) {
    return { status: "skipped", reason: "production", accounts: [] };
  }

  const accounts = LOCAL_LOGIN_ACCOUNTS.flatMap((account) => {
    const email = env[account.emailKey]?.trim() ?? "";
    const password = env[account.passwordKey] ?? "";
    if (!email || !password) {
      return [];
    }
    return [{ ...account, email, password }];
  });

  if (accounts.length === 0) {
    return { status: "skipped", reason: "missing", accounts: [] };
  }

  return { status: "seed", accounts };
}

async function upsertLocalLoginUser(account) {
  const passwordHash = createPasswordHash(account.password);

  return prisma.user.upsert({
    where: { id: account.userId },
    update: {
      name: account.name,
      email: account.email,
      passwordHash,
      platformRole: account.platformRole,
    },
    create: {
      id: account.userId,
      name: account.name,
      email: account.email,
      passwordHash,
      platformRole: account.platformRole,
    },
  });
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
  await ensurePrimarySiteAndRootLocation(prisma, {
    clinicId: clinic.id,
    clinicName: clinic.name,
    slug: clinic.slug,
    profile,
  });

  const template = await prisma.guideTemplate.upsert({
    where: { id: DEMO_EXTRACTION_GUIDE.templateId },
    update: {
      specialty: DEMO_EXTRACTION_GUIDE.specialty,
      slug: DEMO_EXTRACTION_GUIDE.slug,
      title: DEMO_EXTRACTION_GUIDE.title,
      isActive: true,
      isSample: true,
    },
    create: {
      id: DEMO_EXTRACTION_GUIDE.templateId,
      specialty: DEMO_EXTRACTION_GUIDE.specialty,
      slug: DEMO_EXTRACTION_GUIDE.slug,
      title: DEMO_EXTRACTION_GUIDE.title,
      isActive: true,
      isSample: true,
    },
  });

  const revision = await prisma.guideTemplateRevision.upsert({
    where: { id: DEMO_EXTRACTION_GUIDE.revisionId },
    update: {
      guideTemplateId: template.id,
      version: DEMO_EXTRACTION_GUIDE.version,
      status: "PUBLISHED",
      publishedAt: DEMO_EXTRACTION_GUIDE.publishedAt,
      reviewedAt: null,
      reviewedBy: null,
    },
    create: {
      id: DEMO_EXTRACTION_GUIDE.revisionId,
      guideTemplateId: template.id,
      version: DEMO_EXTRACTION_GUIDE.version,
      status: "PUBLISHED",
      publishedAt: DEMO_EXTRACTION_GUIDE.publishedAt,
      reviewedAt: null,
      reviewedBy: null,
    },
  });

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

  const practiceGuide = await prisma.practiceGuide.upsert({
    where: { id: DEMO_EXTRACTION_GUIDE.practiceGuideId },
    update: {
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

  await snapshotDemoPracticeRevisions(practiceGuide.id);

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

async function snapshotDemoPracticeRevisions(practiceGuideId) {
  // Historical demo publications are not clinic attestations. Leave
  // reviewAttestedAt / reviewAttestedByUserId null.
  await prisma.practiceGuideRevision.deleteMany({
    where: { practiceGuideId },
  });

  const sections = demoComposedSections().map((section, index) => ({
    ...section,
    sortOrder: index + 1,
  }));

  await prisma.practiceGuideRevision.create({
    data: {
      id: "practice_rev_demo_rivers_extraction_draft",
      practiceGuideId,
      version: 0,
      status: "DRAFT",
      title: DEMO_EXTRACTION_GUIDE.title,
      sections: { create: sections },
    },
  });

  await prisma.practiceGuideRevision.create({
    data: {
      id: "practice_rev_demo_rivers_extraction_v1",
      practiceGuideId,
      version: 1,
      status: "PUBLISHED",
      title: DEMO_EXTRACTION_GUIDE.title,
      publishedAt: DEMO_EXTRACTION_GUIDE.publishedAt,
      sections: { create: sections },
    },
  });
}

async function main() {
  const clinic = await prisma.clinic.upsert({
    where: { id: DEMO_CLINIC.id },
    update: {
      name: DEMO_CLINIC.name,
      slug: DEMO_CLINIC.slug,
    },
    create: DEMO_CLINIC,
  });

  const localLogin = resolveLocalLoginAccounts();
  if (localLogin.status === "refused") {
    console.error(localLogin.reason);
  } else if (
    localLogin.status === "skipped" &&
    localLogin.reason === "missing"
  ) {
    console.info(
      "No LOCAL_ADMIN_* / LOCAL_STAFF_* credentials found. Staff login accounts were not seeded."
    );
  }

  for (const account of localLogin.accounts) {
    const user = await upsertLocalLoginUser(account);
    if (!account.clinicMembership || !account.role) {
      continue;
    }
    await prisma.clinicMembership.upsert({
      where: {
        clinicId_userId: {
          clinicId: clinic.id,
          userId: user.id,
        },
      },
      update: {
        role: account.role,
        active: true,
      },
      create: {
        clinicId: clinic.id,
        userId: user.id,
        role: account.role,
        active: true,
      },
    });
  }

  const aftercareDemo = await upsertAftercareDemo(clinic.id);

  console.info("Seeded clinic-scoped demo data:");
  console.info(
    `- Clinic: ${clinic.name} (${clinic.id}) slug=${DEMO_CLINIC.slug}`
  );
  if (localLogin.accounts.length > 0) {
    for (const account of localLogin.accounts) {
      console.info(
        `- ${account.role ?? account.platformRole}: ${account.email} (${account.emailKey} / ${account.passwordKey})`
      );
    }
  }
  console.info(
    `- Clinic profile: ${DEMO_CLINIC_PROFILE.displayName} (patient-facing)`
  );
  console.info(
    `- Aftercare template: ${aftercareDemo.template.title} (${aftercareDemo.template.slug}) revision v${aftercareDemo.revision.version} SAMPLE/NON-CLINICAL demo-only (isSample=true, reviewedAt/reviewedBy null)`
  );
  console.info(
    `- Practice guide: ${aftercareDemo.practiceGuide.publicSlug} pinned=${aftercareDemo.revision.id} published/enabled`
  );
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
