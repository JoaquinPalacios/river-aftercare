import "dotenv/config";

import {
  ClinicMembershipRole,
  GuideRevisionStatus,
  PlatformRole,
  type PrismaClient,
  type ServiceCategory,
} from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  BILLING_SETUP_PATH,
  readClinicBillingAccess,
} from "@/lib/billing/activation-gate";
import { grantComplimentaryAccess } from "@/lib/billing/complimentary-access";
import { prepareClinicCommercialOffer } from "@/lib/billing/prepare-offer";
import { createCustomPracticeGuide } from "@/lib/clinic-portal/create-practice-guide";
import { loadOwnerGettingStarted } from "@/lib/clinic-portal/load-owner-setup";
import { practiceSettingsSchema } from "@/lib/clinic-portal/practice-settings-schema";
import { publishPracticeGuide } from "@/lib/clinic-portal/publish-practice-guide";
import { updatePracticeSettings } from "@/lib/clinic-portal/update-practice-settings";
import { isLocalDevelopmentDatabase } from "@/lib/dev/database-target";
import { createOperatorClinic } from "@/lib/operator/create-operator-clinic";
import { getPrisma } from "@/lib/prisma";
import { withSampleCategoryLock } from "@/tests/active-sample-slot";

const SLUG_PREFIX = "ownset-";
const TEMPLATE_PREFIX = "ownset_";
const EMAIL_PREFIX = "ownset-";
const OPERATOR_ID = `${TEMPLATE_PREFIX}operator`;
const local = isLocalDevelopmentDatabase(process.env.DATABASE_URL);
const describeDb = local ? describe : describe.skip;

function item(
  summary: NonNullable<Awaited<ReturnType<typeof loadOwnerGettingStarted>>>,
  id: string
) {
  const found = summary.items.find((row) => row.id === id);
  if (!found) {
    throw new Error(`Missing setup item ${id}`);
  }
  return found;
}

describeDb("assisted clinic owner setup in the database", () => {
  let prisma: PrismaClient | null = null;

  function db(): PrismaClient {
    if (!prisma) {
      throw new Error("Prisma is not connected.");
    }
    return prisma;
  }

  async function cleanup() {
    await db().clinic.deleteMany({
      where: { slug: { startsWith: SLUG_PREFIX } },
    });
    await db().guideTemplate.deleteMany({
      where: { id: { startsWith: TEMPLATE_PREFIX } },
    });
    await db().user.deleteMany({
      where: {
        OR: [{ id: OPERATOR_ID }, { email: { startsWith: EMAIL_PREFIX } }],
      },
    });
  }

  async function createTemplate(input: {
    key: string;
    title: string;
    category: ServiceCategory;
    sample?: boolean;
    status?: "PUBLISHED" | "DRAFT";
  }) {
    const status = input.status ?? GuideRevisionStatus.PUBLISHED;
    return db().guideTemplate.create({
      data: {
        id: `${TEMPLATE_PREFIX}${input.key}`,
        slug: `${SLUG_PREFIX}${input.key}`,
        title: input.title,
        serviceCategory: input.category,
        isActive: true,
        isSample: input.sample ?? false,
        revisions: {
          create: {
            version: 1,
            status,
            publishedAt:
              status === GuideRevisionStatus.PUBLISHED
                ? new Date("2026-09-01T00:00:00.000Z")
                : null,
            sections: {
              create: {
                key: "introduction",
                kind: "INTRODUCTION",
                title: "Introduction",
                body: "Placeholder body.",
                sortOrder: 1,
              },
            },
          },
        },
      },
    });
  }

  async function membership(input: {
    clinicId: string;
    key: string;
    role: "ADMIN" | "STAFF";
  }) {
    const userId = `${TEMPLATE_PREFIX}${input.key}`;
    await db().user.create({
      data: {
        id: userId,
        email: `${EMAIL_PREFIX}${input.key}@example.test`,
        name: input.key,
        memberships: {
          create: {
            clinicId: input.clinicId,
            role: input.role,
            active: true,
          },
        },
      },
    });
    return userId;
  }

  beforeAll(async () => {
    prisma = getPrisma();
    await prisma.$queryRaw`SELECT 1`;
    await cleanup();
    await db().user.create({
      data: {
        id: OPERATOR_ID,
        email: `${EMAIL_PREFIX}operator@example.test`,
        name: "River Operator",
        platformRole: PlatformRole.OPERATOR,
      },
    });
    await createTemplate({
      key: "dental-prod",
      title: "Ownset dental production",
      category: "DENTAL",
    });
    await createTemplate({
      key: "cosmetic-prod",
      title: "Ownset cosmetic production",
      category: "COSMETIC_AESTHETIC",
    });
    await createTemplate({
      key: "dental-draft",
      title: "Ownset unpublished dental",
      category: "DENTAL",
      status: "DRAFT",
    });
  });

  afterAll(async () => {
    if (!prisma) {
      return;
    }
    await cleanup();
    await prisma.$disconnect();
  });

  it("loads getting started for the first administrator of a complimentary clinic", async () => {
    const created = await createOperatorClinic({
      name: "Ownset Harbour Dental",
      slug: `${SLUG_PREFIX}harbour`,
      serviceCategories: ["DENTAL"],
    });
    const granted = await grantComplimentaryAccess({
      actorUserId: OPERATOR_ID,
      actorPlatformRole: PlatformRole.OPERATOR,
      clinicId: created.id,
      commercialPlan: "ESSENTIAL",
      duration: "SIX_MONTHS",
      reason: "Design partner for the first year.",
      now: new Date("2026-10-05T01:00:00.000Z"),
    });
    expect(granted.ok).toBe(true);
    const adminId = await membership({
      clinicId: created.id,
      key: "harbour-admin",
      role: "ADMIN",
    });
    const guidesBefore = await db().practiceGuide.count({
      where: { clinicId: created.id },
    });
    const stamp = await db().clinic.findUniqueOrThrow({
      where: { id: created.id },
      select: { updatedAt: true, assistedOnboarding: true },
    });
    expect(stamp.assistedOnboarding).toBe(true);

    const access = await readClinicBillingAccess({
      clinic: { id: created.id, name: "Ownset Harbour Dental" },
      source: "membership",
    });
    expect(access).toMatchObject({ kind: "allow", reason: "active" });

    const summary = await loadOwnerGettingStarted(created.id, "admin");
    const resumed = await loadOwnerGettingStarted(created.id, "admin");
    expect(resumed).toEqual(summary);
    const after = await db().clinic.findUniqueOrThrow({
      where: { id: created.id },
      select: { updatedAt: true },
    });
    expect(after.updatedAt).toEqual(stamp.updatedAt);
    expect(
      await db().practiceGuide.count({ where: { clinicId: created.id } })
    ).toBe(guidesBefore);
    if (!summary) {
      throw new Error("Expected an owner setup summary.");
    }
    expect(item(summary, "practice").state).toBe("needs_attention");
    expect(item(summary, "contact").state).toBe("needs_attention");
    expect(item(summary, "emergency").state).toBe("needs_attention");
    expect(item(summary, "categories").detail).toBe("Dental");
    const dentalIds =
      summary.templateGroups[0]?.templates.map((row) => row.id) ?? [];
    expect(dentalIds).toContain(`${TEMPLATE_PREFIX}dental-prod`);
    expect(dentalIds).not.toContain(`${TEMPLATE_PREFIX}dental-draft`);
    expect(dentalIds).not.toContain(`${TEMPLATE_PREFIX}cosmetic-prod`);
    expect(dentalIds).not.toContain("guide_tmpl_demo_extraction");
    expect(JSON.stringify(summary)).not.toContain("Ownset unpublished dental");
    expect(JSON.stringify(summary)).not.toMatch(/authori[sz]e payment/i);
    expect(item(summary, "practice").actions[0]?.label).toBe(
      "Complete Practice details"
    );
    expect(
      summary.templateGroups[0]?.templates.find(
        (row) => row.id === `${TEMPLATE_PREFIX}dental-prod`
      )?.title
    ).toBe("Ownset dental production");

    const staffSummary = await loadOwnerGettingStarted(created.id, "staff");
    expect(staffSummary?.items.flatMap((row) => row.actions)).toEqual([]);
    expect(adminId).toBe(`${TEMPLATE_PREFIX}harbour-admin`);
    expect(
      await db().clinicMembership.findFirst({
        where: { clinicId: created.id, userId: adminId },
      })
    ).toMatchObject({ role: ClinicMembershipRole.ADMIN });
  });

  it("keeps a paid offer behind billing until payment is active", async () => {
    const created = await createOperatorClinic({
      name: "Ownset Paid Pending",
      slug: `${SLUG_PREFIX}paid-pending`,
      serviceCategories: ["DENTAL"],
    });
    const offer = await prepareClinicCommercialOffer({
      clinicId: created.id,
      commercialPlan: "ESSENTIAL",
      billingInterval: "MONTHLY",
    });
    expect(offer).toEqual({ ok: true });
    const access = await readClinicBillingAccess({
      clinic: { id: created.id, name: "Ownset Paid Pending" },
      source: "membership",
    });
    expect(access).toMatchObject({
      kind: "billing_required",
      href: BILLING_SETUP_PATH,
    });
    const summary = await loadOwnerGettingStarted(created.id, "admin");
    expect(summary?.items.map((row) => row.id)).not.toContain("payment");
    expect(JSON.stringify(summary)).not.toMatch(
      /authori[sz]e payment|checkout/i
    );
  });

  it("drops payment instructions once paid access is active", async () => {
    const created = await createOperatorClinic({
      name: "Ownset Paid Active",
      slug: `${SLUG_PREFIX}paid-active`,
      serviceCategories: ["DENTAL"],
    });
    await db().clinicEntitlement.create({
      data: {
        clinicId: created.id,
        commercialPlan: "ESSENTIAL",
        billingInterval: "MONTHLY",
        billingStatus: "ACTIVE",
        entitlementStatus: "ACTIVE",
        commercialArrangement: "PAID",
      },
    });
    const access = await readClinicBillingAccess({
      clinic: { id: created.id, name: "Ownset Paid Active" },
      source: "membership",
    });
    expect(access).toMatchObject({ kind: "allow", reason: "active" });
    const summary = await loadOwnerGettingStarted(created.id, "admin");
    expect(summary?.ready).toBe(false);
    expect(JSON.stringify(summary)).not.toMatch(
      /authori[sz]e payment|payment authorisation|payment authorization/i
    );
    expect(
      summary?.items
        .filter((row) => row.state === "needs_attention")
        .map((row) => row.id)
    ).not.toContain("payment");
  });

  it("leaves a historical clinic off the owner setup surface", async () => {
    const created = await createOperatorClinic({
      name: "Ownset Historical",
      slug: `${SLUG_PREFIX}historical`,
      serviceCategories: ["DENTAL"],
    });
    await db().clinic.update({
      where: { id: created.id },
      data: { assistedOnboarding: false },
    });
    await expect(
      loadOwnerGettingStarted(created.id, "admin")
    ).resolves.toBeNull();
    await expect(
      loadOwnerGettingStarted(created.id, "staff")
    ).resolves.toBeNull();
  });

  it("unions production templates and hides samples for a multidisciplinary clinic", async () => {
    await withSampleCategoryLock(["COSMETIC_AESTHETIC"], async () => {
      await createTemplate({
        key: "cosmetic-sample",
        title: "Ownset cosmetic sample",
        category: "COSMETIC_AESTHETIC",
        sample: true,
      });
      try {
        const created = await createOperatorClinic({
          name: "Ownset Multi Clinic",
          slug: `${SLUG_PREFIX}multi`,
          serviceCategories: ["DENTAL", "COSMETIC_AESTHETIC"],
        });
        await grantComplimentaryAccess({
          actorUserId: OPERATOR_ID,
          actorPlatformRole: PlatformRole.OPERATOR,
          clinicId: created.id,
          commercialPlan: "PRACTICE",
          duration: "INDEFINITE",
          reason: "Design partner for the first year.",
          now: new Date("2026-10-05T01:00:00.000Z"),
        });
        const summary = await loadOwnerGettingStarted(created.id, "admin");
        const ids =
          summary?.templateGroups.flatMap((group) =>
            group.templates.map((template) => template.id)
          ) ?? [];
        expect(ids).toContain(`${TEMPLATE_PREFIX}dental-prod`);
        expect(ids).toContain(`${TEMPLATE_PREFIX}cosmetic-prod`);
        expect(ids).not.toContain(`${TEMPLATE_PREFIX}cosmetic-sample`);
        expect(ids).not.toContain(`${TEMPLATE_PREFIX}dental-draft`);
        expect(ids).not.toContain("guide_tmpl_demo_extraction");
        expect(JSON.stringify(summary)).not.toContain("Ownset cosmetic sample");
        expect(JSON.stringify(summary)).not.toContain(
          "Ownset unpublished dental"
        );
        expect(summary?.templateGroups.map((group) => group.label)).toEqual([
          "Dental",
          "Cosmetic & Aesthetic",
        ]);
      } finally {
        await db().guideTemplate.deleteMany({
          where: { id: `${TEMPLATE_PREFIX}cosmetic-sample` },
        });
      }
    });
  });

  it("offers a custom guide when the category has no eligible template", async () => {
    const created = await createOperatorClinic({
      name: "Ownset Chiro Clinic",
      slug: `${SLUG_PREFIX}chiro`,
      serviceCategories: ["CHIROPRACTIC"],
    });
    await grantComplimentaryAccess({
      actorUserId: OPERATOR_ID,
      actorPlatformRole: PlatformRole.OPERATOR,
      clinicId: created.id,
      commercialPlan: "ESSENTIAL",
      duration: "SIX_MONTHS",
      reason: "Design partner for the first year.",
      now: new Date("2026-10-05T01:00:00.000Z"),
    });
    const summary = await loadOwnerGettingStarted(created.id, "admin");
    expect(summary?.templateGroups).toEqual([
      {
        serviceCategory: "CHIROPRACTIC",
        label: "Chiropractic",
        templates: [],
      },
    ]);
    expect(item(summary!, "guide").actions).toEqual([
      {
        href: "/guides/new#custom-guide",
        label: "Create a custom guide",
      },
    ]);
    expect(item(summary!, "guide").detail).toMatch(
      /No published template is available/
    );
    expect(JSON.stringify(summary)).not.toContain("Ownset dental production");
  });

  it("resumes from persisted practice details, guide creation, and publication", async () => {
    const created = await createOperatorClinic({
      name: "Ownset Resume Dental",
      slug: `${SLUG_PREFIX}resume`,
      serviceCategories: ["DENTAL"],
    });
    await grantComplimentaryAccess({
      actorUserId: OPERATOR_ID,
      actorPlatformRole: PlatformRole.OPERATOR,
      clinicId: created.id,
      commercialPlan: "ESSENTIAL",
      duration: "SIX_MONTHS",
      reason: "Design partner for the first year.",
      now: new Date("2026-10-05T01:00:00.000Z"),
    });
    const adminId = await membership({
      clinicId: created.id,
      key: "resume-admin",
      role: "ADMIN",
    });
    const values = practiceSettingsSchema.parse({
      displayName: "Ownset Resume Dental",
      logoUrl: "/demo/riverside-mark.svg",
      primaryColor: "#155e75",
      accentColor: "#b45309",
      useCustomDarkBranding: false,
      neutralColor: "",
      radiusPreset: "MEDIUM",
      typeface: "",
      instructionTerminology: "AFTERCARE",
      themeMode: "SYSTEM",
      allowPatientThemeToggle: false,
      phone: "0255500100",
      contactUrl: "https://example.com/contact",
      addressLine1: "",
      addressLine2: "",
      city: "",
      region: "",
      postalCode: "",
      emergencyInstructions: "Call the clinic or emergency services.",
    });
    await updatePracticeSettings({ clinicId: created.id, values });
    const afterPractice = await loadOwnerGettingStarted(created.id, "admin");
    const afterPracticeAgain = await loadOwnerGettingStarted(
      created.id,
      "admin"
    );
    expect(afterPracticeAgain).toEqual(afterPractice);
    expect(item(afterPractice!, "practice").state).toBe("configured");
    expect(item(afterPractice!, "contact").state).toBe("configured");
    expect(item(afterPractice!, "emergency").state).toBe("configured");
    expect(item(afterPractice!, "guide").state).toBe("needs_attention");

    const guide = await createCustomPracticeGuide({
      clinicId: created.id,
      actorUserId: adminId,
      values: {
        title: "After a visit",
        publicSlug: "after-a-visit",
        serviceCategory: "DENTAL",
      },
    });
    const afterGuide = await loadOwnerGettingStarted(created.id, "admin");
    expect(item(afterGuide!, "guide").state).toBe("configured");
    expect(item(afterGuide!, "guide").detail).toBe("1 custom guide is saved.");
    expect(item(afterGuide!, "published").actions).toEqual([
      {
        href: `/guides/${guide.id}/edit`,
        label: "Preview and publish",
      },
    ]);
    const afterGuideAgain = await loadOwnerGettingStarted(created.id, "admin");
    expect(afterGuideAgain).toEqual(afterGuide);

    await publishPracticeGuide({
      clinicId: created.id,
      actorUserId: adminId,
      guideId: guide.id,
    });
    const afterPublish = await loadOwnerGettingStarted(created.id, "admin");
    const afterPublishAgain = await loadOwnerGettingStarted(
      created.id,
      "admin"
    );
    expect(afterPublishAgain).toEqual(afterPublish);
    expect(item(afterPublish!, "published").state).toBe("configured");
    expect(afterPublish?.ready).toBe(true);
    expect(afterPublish?.showTemplateCatalogue).toBe(false);
    expect(afterPublish?.items.every((row) => row.actions.length === 0)).toBe(
      true
    );
  });
});
