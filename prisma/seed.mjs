import "dotenv/config";

import { randomBytes, scryptSync } from "node:crypto";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, ClinicMembershipRole } from "@prisma/client";

import { DEMO_EXTRACTION_CANONICAL_SECTIONS } from "../lib/aftercare/demo-extraction-template-payload.mjs";

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

const DEMO_ROOM = {
  id: "room_demo_rivers_1",
  name: "Room 1",
  slug: "room-1",
};

const DEMO_DOCTOR = {
  id: "doctor_demo_rivers_default",
  name: "Dr. Demo",
  slug: "dr-demo",
};

const DEMO_PROCEDURE_TEMPLATES = [
  {
    id: "proc_tmpl_demo_starter",
    name: "Starter Procedure Walkthrough",
    slug: "starter-procedure-walkthrough",
    isActive: true,
    aftercareUrl: "https://www.example.com/aftercare/starter-procedure",
    stages: [
      {
        id: "proc_stage_demo_welcome",
        stageOrder: 1,
        title: "Welcome And Setup",
        calmCopy:
          "Take a slow breath. We will walk through each step together.",
        patientCopy:
          "We are getting the room ready. This usually takes a minute or two.",
        detailedCopy:
          "Your care team is preparing instruments and confirming your chart. You can relax; nothing has started yet.",
        defaultDurationHint: "about 2 minutes",
      },
      {
        id: "proc_stage_demo_numbing",
        stageOrder: 2,
        title: "Numbing The Area",
        calmCopy: "You may feel a small pinch. It passes quickly.",
        patientCopy:
          "We are gently numbing the area so you stay comfortable during the procedure.",
        detailedCopy:
          "Your doctor is applying a topical gel followed by a local anesthetic. The area will feel tingly, then fully numb in a few minutes.",
        defaultDurationHint: "about 3 minutes",
      },
      {
        id: "proc_stage_demo_wrapup",
        stageOrder: 3,
        title: "Wrapping Up",
        calmCopy: "You are almost done. Thank you for being patient.",
        patientCopy:
          "We are finishing up and will review aftercare instructions with you.",
        detailedCopy:
          "Your doctor is checking the work, cleaning the area, and will hand you aftercare notes before you leave.",
        defaultDurationHint: "about 2 minutes",
      },
    ],
    selectedAreaOptions: [
      {
        id: "proc_area_demo_upper_left",
        key: "upper_left",
        label: "Upper Left",
        sortOrder: 1,
      },
      {
        id: "proc_area_demo_upper_right",
        key: "upper_right",
        label: "Upper Right",
        sortOrder: 2,
      },
      {
        id: "proc_area_demo_lower_left",
        key: "lower_left",
        label: "Lower Left",
        sortOrder: 3,
      },
      {
        id: "proc_area_demo_lower_right",
        key: "lower_right",
        label: "Lower Right",
        sortOrder: 4,
      },
    ],
  },
  {
    id: "proc_tmpl_scaling_root_planing",
    name: "Scaling and Root Planing",
    slug: "scaling-and-root-planing",
    isActive: true,
    aftercareUrl:
      "https://www.exampleclinic.com/aftercare/scaling-and-root-planing",
    stages: [
      {
        id: "proc_stage_scaling_root_planing_settled",
        stageOrder: 1,
        title: "Getting settled",
        calmCopy: "We are getting you comfortable and ready to begin.",
        patientCopy:
          "We are getting everything ready and making sure you are comfortable before treatment starts.",
        detailedCopy:
          "This first stage is about helping you settle in and preparing to begin the cleaning treatment in a calm, organised way.",
        defaultDurationHint: "2–5 min",
        illustrationUrl: null,
      },
      {
        id: "proc_stage_scaling_root_planing_numbing",
        stageOrder: 2,
        title: "Numbing the area",
        calmCopy: "We are gently numbing the area now.",
        patientCopy:
          "A local anaesthetic is being used so the area can be treated more comfortably.",
        detailedCopy:
          "The gum and nearby teeth are being numbed with local anaesthetic so the deeper cleaning can be carried out with better comfort.",
        defaultDurationHint: "3–8 min",
        illustrationUrl: null,
      },
      {
        id: "proc_stage_scaling_root_planing_checking",
        stageOrder: 3,
        title: "Checking the gums",
        calmCopy: "We are taking a close look before cleaning.",
        patientCopy:
          "The gums and tooth surfaces are being checked carefully so the cleaning can focus on the right areas.",
        detailedCopy:
          "Before the main cleaning, the periodontist is closely checking the gumline and root areas to guide the treatment and work thoroughly where it is needed.",
        defaultDurationHint: "2–5 min",
        illustrationUrl: null,
      },
      {
        id: "proc_stage_scaling_root_planing_cleaning",
        stageOrder: 4,
        title: "Deep cleaning begins",
        calmCopy: "We are cleaning below the gumline now.",
        patientCopy:
          "The deeper cleaning is now starting to remove build-up from around the teeth and under the gums.",
        detailedCopy:
          "This stage removes plaque, tartar, and deposits from tooth surfaces and from below the gumline where a regular clean cannot reach.",
        defaultDurationHint: "5–15 min",
        illustrationUrl: null,
      },
      {
        id: "proc_stage_scaling_root_planing_root_surface",
        stageOrder: 5,
        title: "Cleaning the root surface",
        calmCopy: "We are smoothing the root surface now.",
        patientCopy:
          "The root surfaces are being carefully cleaned and smoothed to help the gums heal against the teeth.",
        detailedCopy:
          "This part of treatment focuses on the tooth roots. Cleaning and smoothing these areas helps reduce places where bacteria and deposits can cling.",
        defaultDurationHint: "5–15 min",
        illustrationUrl: null,
      },
      {
        id: "proc_stage_scaling_root_planing_detail",
        stageOrder: 6,
        title: "Detailed treatment",
        calmCopy: "We are working carefully through the area.",
        patientCopy:
          "The team is carefully treating the remaining spots to make the cleaning as thorough as possible.",
        detailedCopy:
          "The periodontist is methodically working across the selected area, revisiting deeper or harder-to-reach spots to complete the treatment carefully.",
        defaultDurationHint: "5–12 min",
        illustrationUrl: null,
      },
      {
        id: "proc_stage_scaling_root_planing_final_rinse",
        stageOrder: 7,
        title: "Final rinse and check",
        calmCopy: "We are finishing the area and checking everything.",
        patientCopy:
          "The area is being rinsed and checked to make sure the treatment stage is complete.",
        detailedCopy:
          "The treated area is being cleaned away and reviewed so the periodontist can confirm the root surfaces and gumline have been addressed as planned.",
        defaultDurationHint: "2–5 min",
        illustrationUrl: null,
      },
      {
        id: "proc_stage_scaling_root_planing_complete",
        stageOrder: 8,
        title: "Procedure complete",
        calmCopy: "This part of your treatment is complete.",
        patientCopy:
          "This treatment visit is complete. Before you leave, you may be given simple aftercare guidance for the next day or two.",
        detailedCopy:
          "The scaling and root planing for this selected area is now complete. A short recovery period is normal, and you may be directed to general aftercare information after the appointment.",
        defaultDurationHint: "1–3 min",
        illustrationUrl: null,
      },
    ],
    selectedAreaOptions: [
      {
        id: "proc_area_scaling_root_planing_upper_right",
        key: "upper_right",
        label: "Upper right",
        sortOrder: 1,
      },
      {
        id: "proc_area_scaling_root_planing_upper_left",
        key: "upper_left",
        label: "Upper left",
        sortOrder: 2,
      },
      {
        id: "proc_area_scaling_root_planing_lower_right",
        key: "lower_right",
        label: "Lower right",
        sortOrder: 3,
      },
      {
        id: "proc_area_scaling_root_planing_lower_left",
        key: "lower_left",
        label: "Lower left",
        sortOrder: 4,
      },
    ],
  },
];

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

async function upsertProcedureTemplate(clinicId, template) {
  const procedureTemplate = await prisma.procedureTemplate.upsert({
    where: { id: template.id },
    update: {
      clinicId,
      name: template.name,
      slug: template.slug,
      isActive: template.isActive,
      aftercareUrl: template.aftercareUrl,
    },
    create: {
      id: template.id,
      clinicId,
      name: template.name,
      slug: template.slug,
      isActive: template.isActive,
      aftercareUrl: template.aftercareUrl,
    },
  });

  for (const stage of template.stages) {
    await prisma.procedureStageTemplate.upsert({
      where: { id: stage.id },
      update: {
        procedureTemplateId: procedureTemplate.id,
        stageOrder: stage.stageOrder,
        title: stage.title,
        calmCopy: stage.calmCopy,
        patientCopy: stage.patientCopy,
        detailedCopy: stage.detailedCopy,
        illustrationUrl: stage.illustrationUrl ?? null,
        defaultDurationHint: stage.defaultDurationHint ?? null,
      },
      create: {
        id: stage.id,
        procedureTemplateId: procedureTemplate.id,
        stageOrder: stage.stageOrder,
        title: stage.title,
        calmCopy: stage.calmCopy,
        patientCopy: stage.patientCopy,
        detailedCopy: stage.detailedCopy,
        illustrationUrl: stage.illustrationUrl ?? null,
        defaultDurationHint: stage.defaultDurationHint ?? null,
      },
    });
  }

  for (const option of template.selectedAreaOptions) {
    await prisma.procedureTemplateSelectedAreaOption.upsert({
      where: { id: option.id },
      update: {
        procedureTemplateId: procedureTemplate.id,
        key: option.key,
        label: option.label,
        sortOrder: option.sortOrder,
      },
      create: {
        id: option.id,
        procedureTemplateId: procedureTemplate.id,
        key: option.key,
        label: option.label,
        sortOrder: option.sortOrder,
      },
    });
  }

  return procedureTemplate;
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

  const room = await prisma.room.upsert({
    where: { id: DEMO_ROOM.id },
    update: {
      clinicId: clinic.id,
      name: DEMO_ROOM.name,
      slug: DEMO_ROOM.slug,
    },
    create: {
      id: DEMO_ROOM.id,
      clinicId: clinic.id,
      name: DEMO_ROOM.name,
      slug: DEMO_ROOM.slug,
    },
  });

  const doctor = await prisma.doctor.upsert({
    where: { id: DEMO_DOCTOR.id },
    update: {
      clinicId: clinic.id,
      name: DEMO_DOCTOR.name,
      slug: DEMO_DOCTOR.slug,
    },
    create: {
      id: DEMO_DOCTOR.id,
      clinicId: clinic.id,
      name: DEMO_DOCTOR.name,
      slug: DEMO_DOCTOR.slug,
    },
  });

  const procedureTemplates = [];
  for (const template of DEMO_PROCEDURE_TEMPLATES) {
    procedureTemplates.push(await upsertProcedureTemplate(clinic.id, template));
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
  for (const [index, template] of procedureTemplates.entries()) {
    const seededTemplate = DEMO_PROCEDURE_TEMPLATES[index];
    console.info(
      `- Procedure template: ${template.name} (${template.id}) with ${seededTemplate.stages.length} stages and ${seededTemplate.selectedAreaOptions.length} selected-area options`
    );
  }
  console.info(`- Room: ${room.name} (${room.id})`);
  console.info(`- Doctor: ${doctor.name} (${doctor.id})`);
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
