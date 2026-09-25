import { lookup } from "node:dns/promises";

import {
  backfilledLocationId,
  ensurePrimarySiteForClinic,
} from "@/lib/clinics/primary-site-location.mjs";
import { e2ePrisma as prisma } from "../helpers/prisma";
import { HARBOR } from "./harbor";

export { HARBOR };

const PREFIX = "e2e_p1e_";

const DRAFT = {
  templateId: `${PREFIX}tmpl_draft`,
  revisionId: `${PREFIX}rev_draft`,
  sectionId: `${PREFIX}sec_draft`,
  guideId: `${PREFIX}guide_draft`,
  templateSlug: "e2e-draft-guide",
  publicSlug: "draft-guide",
} as const;

const DISABLED = {
  templateId: `${PREFIX}tmpl_disabled`,
  revisionId: `${PREFIX}rev_disabled`,
  sectionId: `${PREFIX}sec_disabled`,
  guideId: `${PREFIX}guide_disabled`,
  templateSlug: "e2e-disabled-guide",
  publicSlug: "disabled-guide",
} as const;

const PINNED_DRAFT = {
  templateId: `${PREFIX}tmpl_pinned_draft`,
  revisionId: `${PREFIX}rev_pinned_draft`,
  sectionId: `${PREFIX}sec_pinned_draft`,
  guideId: `${PREFIX}guide_pinned_draft`,
  templateSlug: "e2e-pinned-draft",
  publicSlug: "pinned-draft",
} as const;

const EXTRACTION_TEMPLATE_ID = "guide_tmpl_demo_extraction";
const EXTRACTION_REVISION_ID = "guide_rev_demo_extraction_v1";

export async function assertLocalhostTenantsResolve(): Promise<void> {
  for (const host of [
    "localhost",
    "demodental.localhost",
    `${HARBOR.slug}.localhost`,
    "unknown.localhost",
  ]) {
    const result = await lookup(host);
    if (!result.address) {
      throw new Error(
        `${host} did not resolve. Phase 1E browser tests require RFC 6761 *.localhost support, not /etc/hosts.`
      );
    }
  }
}

export async function cleanupPhase1eFixtures(): Promise<void> {
  await prisma.practiceGuide.deleteMany({
    where: { id: { startsWith: PREFIX } },
  });
  await prisma.guideTemplateRevision.deleteMany({
    where: { id: { startsWith: PREFIX } },
  });
  await prisma.guideTemplate.deleteMany({
    where: { id: { startsWith: PREFIX } },
  });
  await prisma.clinic.deleteMany({
    where: { id: { startsWith: PREFIX } },
  });
}

async function upsertRootPlacement(input: {
  guideId: string;
  publicSlug: string;
  isEnabled: boolean;
}): Promise<void> {
  const locationId = backfilledLocationId(HARBOR.clinicId);
  await prisma.practiceGuidePlacement.upsert({
    where: {
      locationId_practiceGuideId: {
        locationId,
        practiceGuideId: input.guideId,
      },
    },
    create: {
      practiceGuideId: input.guideId,
      locationId,
      clinicId: HARBOR.clinicId,
      publicSlug: input.publicSlug,
      isEnabled: input.isEnabled,
      publishedPracticeGuideRevisionId: null,
    },
    update: {
      publicSlug: input.publicSlug,
      isEnabled: input.isEnabled,
      publishedPracticeGuideRevisionId: null,
    },
  });
}

async function upsertUnpublishedGuide(input: {
  templateId: string;
  revisionId: string;
  sectionId: string;
  guideId: string;
  templateSlug: string;
  publicSlug: string;
  clinicId: string;
  title: string;
  guideStatus: "DRAFT" | "PUBLISHED";
  isEnabled: boolean;
  revisionStatus: "DRAFT" | "PUBLISHED";
}): Promise<void> {
  const publishedAt =
    input.revisionStatus === "PUBLISHED" ? new Date("2026-09-01") : null;

  await prisma.guideTemplate.upsert({
    where: { id: input.templateId },
    update: {
      slug: input.templateSlug,
      title: input.title,
      specialty: "DENTAL",
      isActive: false,
    },
    create: {
      id: input.templateId,
      slug: input.templateSlug,
      title: input.title,
      specialty: "DENTAL",
      isActive: false,
    },
  });

  await prisma.guideTemplateRevision.upsert({
    where: { id: input.revisionId },
    update: {
      guideTemplateId: input.templateId,
      version: 1,
      status: input.revisionStatus,
      publishedAt,
    },
    create: {
      id: input.revisionId,
      guideTemplateId: input.templateId,
      version: 1,
      status: input.revisionStatus,
      publishedAt,
    },
  });

  await prisma.guideTemplateSection.upsert({
    where: { id: input.sectionId },
    update: {
      revisionId: input.revisionId,
      key: "introduction",
      kind: "INTRODUCTION",
      title: input.title,
      body: `${input.title} body must not appear on the public tenant.`,
      sortOrder: 1,
    },
    create: {
      id: input.sectionId,
      revisionId: input.revisionId,
      key: "introduction",
      kind: "INTRODUCTION",
      title: input.title,
      body: `${input.title} body must not appear on the public tenant.`,
      sortOrder: 1,
    },
  });

  await prisma.practiceGuide.upsert({
    where: { id: input.guideId },
    update: {
      clinicId: input.clinicId,
      title: input.title,
      guideTemplateId: input.templateId,
      pinnedRevisionId: input.revisionId,
      publicSlug: input.publicSlug,
      isEnabled: input.isEnabled,
      status: input.guideStatus,
      sortOrder: 9,
      publishedAt:
        input.guideStatus === "PUBLISHED" ? new Date("2026-09-01") : null,
    },
    create: {
      id: input.guideId,
      clinicId: input.clinicId,
      title: input.title,
      guideTemplateId: input.templateId,
      pinnedRevisionId: input.revisionId,
      publicSlug: input.publicSlug,
      isEnabled: input.isEnabled,
      status: input.guideStatus,
      sortOrder: 9,
      publishedAt:
        input.guideStatus === "PUBLISHED" ? new Date("2026-09-01") : null,
    },
  });
  await upsertRootPlacement({
    guideId: input.guideId,
    publicSlug: input.publicSlug,
    isEnabled: false,
  });
}

export async function seedPhase1eFixtures(): Promise<void> {
  const demo = await prisma.clinic.findUnique({
    where: { slug: "demodental" },
    select: { id: true },
  });

  if (!demo) {
    throw new Error(
      "Phase 1E browser tests require the demodental seed. Run `pnpm db:seed`."
    );
  }

  const extractionTemplate = await prisma.guideTemplate.findUnique({
    where: { id: EXTRACTION_TEMPLATE_ID },
    select: { id: true },
  });
  const extractionRevision = await prisma.guideTemplateRevision.findUnique({
    where: { id: EXTRACTION_REVISION_ID },
    select: { id: true, status: true },
  });

  if (!extractionTemplate || extractionRevision?.status !== "PUBLISHED") {
    throw new Error(
      "Phase 1E browser tests require the seeded Tooth Extraction published revision."
    );
  }

  await cleanupPhase1eFixtures();

  await prisma.clinic.create({
    data: {
      id: HARBOR.clinicId,
      name: HARBOR.name,
      slug: HARBOR.slug,
    },
  });

  await prisma.clinicProfile.create({
    data: {
      clinicId: HARBOR.clinicId,
      displayName: HARBOR.displayName,
      logoUrl: null,
      primaryColor: HARBOR.primaryColor,
      accentColor: HARBOR.accentColor,
      phone: HARBOR.phone,
      bookingUrl: HARBOR.bookingUrl,
      contactUrl: null,
      emergencyInstructions: HARBOR.emergencyInstructions,
      showCareGuideAttribution: false,
    },
  });
  await ensurePrimarySiteForClinic(prisma, HARBOR.clinicId);

  await prisma.practiceGuide.create({
    data: {
      id: HARBOR.publishedGuideId,
      clinicId: HARBOR.clinicId,
      guideTemplateId: EXTRACTION_TEMPLATE_ID,
      pinnedRevisionId: EXTRACTION_REVISION_ID,
      publicSlug: "extraction",
      title: "Tooth Extraction",
      isEnabled: true,
      status: "PUBLISHED",
      sortOrder: 1,
      publishedAt: new Date("2026-09-01"),
    },
  });

  await prisma.practiceGuideOverride.create({
    data: {
      id: HARBOR.overrideId,
      practiceGuideId: HARBOR.publishedGuideId,
      sectionKey: "first-24-hours",
      title: HARBOR.overrideTitle,
      body: HARBOR.overrideBody,
    },
  });

  await prisma.practiceGuideAddition.create({
    data: {
      id: HARBOR.additionId,
      practiceGuideId: HARBOR.publishedGuideId,
      key: HARBOR.additionKey,
      kind: "CUSTOM",
      title: HARBOR.additionTitle,
      body: HARBOR.additionBody,
      sortOrder: 1,
      insertAfterSectionKey: "contact-practice",
    },
  });
  await upsertRootPlacement({
    guideId: HARBOR.publishedGuideId,
    publicSlug: "extraction",
    isEnabled: true,
  });

  await upsertUnpublishedGuide({
    ...DRAFT,
    clinicId: HARBOR.clinicId,
    title: "Harbor Draft Guide",
    guideStatus: "DRAFT",
    isEnabled: true,
    revisionStatus: "PUBLISHED",
  });

  await upsertUnpublishedGuide({
    ...DISABLED,
    clinicId: HARBOR.clinicId,
    title: "Harbor Disabled Guide",
    guideStatus: "PUBLISHED",
    isEnabled: false,
    revisionStatus: "PUBLISHED",
  });

  await upsertUnpublishedGuide({
    ...PINNED_DRAFT,
    clinicId: HARBOR.clinicId,
    title: "Harbor Pinned Draft Revision",
    guideStatus: "PUBLISHED",
    isEnabled: true,
    revisionStatus: "DRAFT",
  });
}
