import "dotenv/config";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import {
  BillingStatus,
  EntitlementStatus,
  Prisma,
  type PrismaClient,
} from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { hashAccountToken } from "@/lib/auth/account-token";
import { acceptInvitationWithToken } from "@/lib/auth/accept-invitation";
import { DESTINATION_ADMIN_BLOCKER_MESSAGE } from "@/lib/account-split/policy";
import { createClinicCheckout } from "@/lib/billing/checkout";
import { saveBillingSetup } from "@/lib/billing/save-billing-setup";
import { prepareClinicCommercialOffer } from "@/lib/billing/prepare-offer";
import { processVerifiedStripeEvent } from "@/lib/billing/webhook-processor";
import {
  clearTransactionalEmailMemoryInbox,
  getTransactionalEmailMemoryInbox,
} from "@/lib/email/transactional-mailer";
import { inviteClinicUser } from "@/lib/operator/invite-clinic-user";
import { BILLING_TEST_ENV } from "@/tests/helpers/billing";
import {
  cancelAccountSplitPreparation,
  createAccountSplitPreparation,
  createSplitDestinationAccount,
  previewAccountSplit,
  revalidateAccountSplitPreparation,
  saveAccountSplitSiteDecisions,
  saveAccountSplitStaffSelections,
} from "@/lib/account-split/preparation";
import { allocateSplitShellSlug } from "@/lib/account-split/shell-slug";
import { ClinicPortalError } from "@/lib/clinic-portal/errors";
import { getPrisma } from "@/lib/prisma";

const PREFIX = "aspl_";

function db(): PrismaClient {
  return getPrisma();
}

async function cleanup(): Promise<void> {
  const prisma = db();
  const preparations = await prisma.clinicAccountSplitPreparation.findMany({
    where: { sourceClinicId: { startsWith: PREFIX } },
    select: { destinationClinicId: true },
  });
  const destinationIds = preparations.flatMap((row) =>
    row.destinationClinicId ? [row.destinationClinicId] : []
  );
  await prisma.clinic.deleteMany({ where: { id: { startsWith: PREFIX } } });
  if (destinationIds.length > 0) {
    await prisma.clinic.deleteMany({ where: { id: { in: destinationIds } } });
  }
  await prisma.guideTemplate.deleteMany({
    where: { slug: { startsWith: PREFIX } },
  });
  await prisma.stripeEventReceipt.deleteMany({
    where: { stripeEventId: { startsWith: "evt_aspl_" } },
  });
  await prisma.user.deleteMany({
    where: {
      OR: [{ id: { startsWith: PREFIX } }, { email: { startsWith: PREFIX } }],
    },
  });
}

async function seedGroup(key: string): Promise<{
  clinicId: string;
  operatorId: string;
  adminId: string;
  staffId: string;
  keptSiteId: string;
  splitSiteId: string;
  keptLocationId: string;
  splitLocationId: string;
  keptSlug: string;
  splitSlug: string;
}> {
  const clinicId = `${PREFIX}${key}`;
  const operatorId = `${PREFIX}op_${key}`;
  const adminId = `${PREFIX}admin_${key}`;
  const staffId = `${PREFIX}staff_${key}`;
  const keptSlug = `aspl-kept-${key}`.slice(0, 32);
  const splitSlug = `aspl-move-${key}`.slice(0, 32);
  await db().user.createMany({
    data: [
      {
        id: operatorId,
        email: `${operatorId}@example.test`,
        name: "Operator",
        platformRole: "OPERATOR",
      },
      {
        id: adminId,
        email: `${adminId}@example.test`,
        name: "Ada Admin",
        platformRole: "NONE",
      },
      {
        id: staffId,
        email: `${staffId}@example.test`,
        name: "Sam Staff",
        platformRole: "NONE",
      },
    ],
  });
  await db().clinic.create({
    data: {
      id: clinicId,
      name: `Group ${key}`,
      slug: `aspl-acct-${key}`.slice(0, 32),
      profile: { create: { displayName: `Group ${key}` } },
      memberships: {
        create: [
          { userId: adminId, role: "ADMIN" },
          { userId: staffId, role: "STAFF" },
        ],
      },
      entitlement: {
        create: {
          commercialPlan: "GROUP",
          billingInterval: "MONTHLY",
          billingStatus: BillingStatus.ACTIVE,
          entitlementStatus: EntitlementStatus.ACTIVE,
          siteAllowance: 3,
          locationAllowance: 5,
        },
      },
    },
  });
  const kept = await db().clinicSite.create({
    data: {
      id: `${PREFIX}kept_${key}`,
      clinicId,
      name: "Kept",
      slug: keptSlug,
      displayName: "Kept Clinic",
      active: true,
      isPrimary: true,
      logoUrl: `clinics/${clinicId}/branding/kept.png`,
      primaryColor: "#112233",
    },
  });
  const split = await db().clinicSite.create({
    data: {
      id: `${PREFIX}split_${key}`,
      clinicId,
      name: "Move",
      slug: splitSlug,
      displayName: "Moving Clinic",
      active: true,
      isPrimary: false,
      logoUrl: `clinics/${clinicId}/branding/move.png`,
      primaryColor: "#445566",
    },
  });
  const keptLocation = await db().clinicLocation.create({
    data: {
      id: `${PREFIX}keptloc_${key}`,
      clinicSiteId: kept.id,
      clinicId,
      name: "Kept root",
      slug: null,
      displayName: "Kept root",
      isPrimary: true,
      servesSiteRoot: true,
      active: true,
    },
  });
  const splitLocation = await db().clinicLocation.create({
    data: {
      id: `${PREFIX}splitloc_${key}`,
      clinicSiteId: split.id,
      clinicId,
      name: "Move root",
      slug: null,
      displayName: "Move root",
      isPrimary: true,
      servesSiteRoot: true,
      active: true,
    },
  });
  return {
    clinicId,
    operatorId,
    adminId,
    staffId,
    keptSiteId: kept.id,
    splitSiteId: split.id,
    keptLocationId: keptLocation.id,
    splitLocationId: splitLocation.id,
    keptSlug,
    splitSlug,
  };
}

async function openPreparation(
  account: Awaited<ReturnType<typeof seedGroup>>,
  interval: "MONTHLY" | "YEARLY" = "MONTHLY"
) {
  return createAccountSplitPreparation({
    sourceClinicId: account.clinicId,
    keptClinicSiteId: account.keptSiteId,
    destinationPlan: "PRACTICE",
    destinationBillingInterval: interval,
    operatorUserId: account.operatorId,
  });
}

function readSplitSources(): string {
  const files = readdirSync("lib/account-split").filter((file) =>
    file.endsWith(".ts")
  );
  return files
    .map((file) => readFileSync(join("lib/account-split", file), "utf8"))
    .join("\n");
}

describe("account split preparation", () => {
  beforeEach(async () => {
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    await db().$disconnect();
  });

  it("allows one open preparation and lets a cancelled one be replaced", async () => {
    const account = await seedGroup("open");
    const first = await openPreparation(account);
    await expect(openPreparation(account)).rejects.toBeInstanceOf(
      ClinicPortalError
    );
    await cancelAccountSplitPreparation(first.id);
    const second = await openPreparation(account);
    expect(second.id).not.toBe(first.id);
    const rows = await db().clinicAccountSplitPreparation.findMany({
      where: { sourceClinicId: account.clinicId },
    });
    expect(rows.map((row) => row.status).sort()).toEqual([
      "CANCELLED",
      "DRAFT",
    ]);
  });

  it("enforces site and staff decision uniqueness", async () => {
    const account = await seedGroup("uniq");
    const preparation = await openPreparation(account);
    await db().clinicAccountSplitSiteDecision.create({
      data: {
        preparationId: preparation.id,
        clinicSiteId: account.splitSiteId,
        decision: "SPLIT",
      },
    });
    await expect(
      db().clinicAccountSplitSiteDecision.create({
        data: {
          preparationId: preparation.id,
          clinicSiteId: account.splitSiteId,
          decision: "DEACTIVATE",
        },
      })
    ).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    await db().clinicAccountSplitStaffSelection.deleteMany({
      where: { preparationId: preparation.id, userId: account.adminId },
    });
    await db().clinicAccountSplitStaffSelection.create({
      data: {
        preparationId: preparation.id,
        userId: account.adminId,
        keepOnSource: true,
        grantOnDestination: false,
        destinationRole: "ADMIN",
      },
    });
    await expect(
      db().clinicAccountSplitStaffSelection.create({
        data: {
          preparationId: preparation.id,
          userId: account.adminId,
          keepOnSource: false,
          grantOnDestination: true,
          destinationRole: "ADMIN",
        },
      })
    ).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
  });

  it("creates an empty shell whose slug is not a patient hostname", async () => {
    const account = await seedGroup("shell");
    const preparation = await openPreparation(account);
    await saveAccountSplitSiteDecisions({
      preparationId: preparation.id,
      decisions: [{ clinicSiteId: account.splitSiteId, decision: "SPLIT" }],
    });
    const takenClinic = `${PREFIX}taken_clinic`;
    const takenSiteClinic = `${PREFIX}taken_site`;
    await db().clinic.create({
      data: {
        id: takenClinic,
        name: "Taken clinic slug",
        slug: "xsp11111111",
        profile: { create: { displayName: "Taken clinic slug" } },
      },
    });
    await db().clinic.create({
      data: {
        id: takenSiteClinic,
        name: "Taken site slug",
        slug: "aspl-holder-shell",
        profile: { create: { displayName: "Taken site slug" } },
      },
    });
    await db().clinicSite.create({
      data: {
        clinicId: takenSiteClinic,
        name: "Taken",
        slug: "xsp22222222",
        displayName: "Taken site",
        isPrimary: true,
        active: true,
      },
    });
    const reserved = await db().$transaction((tx) =>
      allocateSplitShellSlug(tx, [
        "xsp11111111",
        "xsp22222222",
        "not-a-shell",
        "xsp33333333",
      ])
    );
    expect(reserved).toBe("xsp33333333");

    const shell = await createSplitDestinationAccount(preparation.id);
    const again = await createSplitDestinationAccount(preparation.id);
    expect(again.id).toBe(shell.id);
    expect(shell.slug).toMatch(/^xsp[a-f0-9]{8}$/);
    expect(shell.id).not.toBe(account.clinicId);
    const sites = await db().clinicSite.count({
      where: { clinicId: shell.id },
    });
    const locations = await db().clinicLocation.count({
      where: { clinicId: shell.id },
    });
    const guides = await db().practiceGuide.count({
      where: { clinicId: shell.id },
    });
    const placements = await db().practiceGuidePlacement.count({
      where: { clinicId: shell.id },
    });
    const billing = await db().clinicBillingProfile.count({
      where: { clinicId: shell.id },
    });
    const entitlement = await db().clinicEntitlement.count({
      where: { clinicId: shell.id },
    });
    const legal = await db().legalAcceptance.count({
      where: { clinicId: shell.id },
    });
    expect(sites).toBe(0);
    expect(locations).toBe(0);
    expect(guides).toBe(0);
    expect(placements).toBe(0);
    expect(billing).toBe(0);
    expect(entitlement).toBe(0);
    expect(legal).toBe(0);
    expect(
      await db().clinicSite.findUnique({ where: { slug: shell.slug } })
    ).toBeNull();
    const source = await db().clinic.findUniqueOrThrow({
      where: { id: account.clinicId },
    });
    expect(source.slug).toBe(`aspl-acct-shell`);
    const splitSite = await db().clinicSite.findUniqueOrThrow({
      where: { id: account.splitSiteId },
    });
    expect(splitSite.clinicId).toBe(account.clinicId);
    expect(splitSite.logoUrl).toBe(
      `clinics/${account.clinicId}/branding/move.png`
    );
  });

  it("rejects a site or user outside the preparation", async () => {
    const account = await seedGroup("bound");
    const other = await seedGroup("other");
    const preparation = await openPreparation(account);
    await expect(
      saveAccountSplitSiteDecisions({
        preparationId: preparation.id,
        decisions: [{ clinicSiteId: other.splitSiteId, decision: "SPLIT" }],
      })
    ).rejects.toBeInstanceOf(ClinicPortalError);
    expect(
      await db().clinicAccountSplitSiteDecision.count({
        where: { preparationId: preparation.id },
      })
    ).toBe(0);
    await expect(
      saveAccountSplitStaffSelections({
        preparationId: preparation.id,
        selections: [
          {
            userId: other.adminId,
            keepOnSource: false,
            grantOnDestination: true,
            destinationRole: "ADMIN",
          },
          {
            userId: account.staffId,
            keepOnSource: true,
            grantOnDestination: false,
            destinationRole: "STAFF",
          },
        ],
      })
    ).rejects.toBeInstanceOf(ClinicPortalError);
    const admin = await db().clinicAccountSplitStaffSelection.findUniqueOrThrow(
      {
        where: {
          preparationId_userId: {
            preparationId: preparation.id,
            userId: account.adminId,
          },
        },
      }
    );
    expect(admin.keepOnSource).toBe(true);
    expect(admin.grantOnDestination).toBe(false);
  });

  it("keeps memberships on the source and blocks dual membership and a missing destination admin", async () => {
    const account = await seedGroup("staff");
    const preparation = await openPreparation(account);
    const defaults = await db().clinicAccountSplitStaffSelection.findMany({
      where: { preparationId: preparation.id },
    });
    expect(defaults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          userId: account.adminId,
          keepOnSource: true,
          grantOnDestination: false,
          destinationRole: "ADMIN",
        }),
        expect.objectContaining({
          userId: account.staffId,
          keepOnSource: true,
          grantOnDestination: false,
          destinationRole: "STAFF",
        }),
      ])
    );
    await saveAccountSplitSiteDecisions({
      preparationId: preparation.id,
      decisions: [{ clinicSiteId: account.splitSiteId, decision: "SPLIT" }],
    });
    await saveAccountSplitStaffSelections({
      preparationId: preparation.id,
      selections: [
        {
          userId: account.adminId,
          keepOnSource: false,
          grantOnDestination: true,
          destinationRole: "ADMIN",
        },
        {
          userId: account.staffId,
          keepOnSource: true,
          grantOnDestination: false,
          destinationRole: "STAFF",
        },
      ],
    });
    const membership = await db().clinicMembership.findFirstOrThrow({
      where: { clinicId: account.clinicId, userId: account.adminId },
    });
    expect(membership.role).toBe("ADMIN");
    expect(membership.active).toBe(true);
    expect(
      await db().clinicMembership.count({
        where: { userId: account.adminId },
      })
    ).toBe(1);

    await saveAccountSplitStaffSelections({
      preparationId: preparation.id,
      selections: [
        {
          userId: account.adminId,
          keepOnSource: true,
          grantOnDestination: true,
          destinationRole: "ADMIN",
        },
        {
          userId: account.staffId,
          keepOnSource: true,
          grantOnDestination: false,
          destinationRole: "STAFF",
        },
      ],
    });
    const dual = await previewAccountSplit(preparation.id);
    expect(dual?.blockers.map((blocker) => blocker.code)).toContain(
      "dual_membership"
    );
    expect(dual?.status).not.toBe("READY_TO_EXECUTE");

    await saveAccountSplitStaffSelections({
      preparationId: preparation.id,
      selections: [
        {
          userId: account.adminId,
          keepOnSource: true,
          grantOnDestination: false,
          destinationRole: "ADMIN",
        },
        {
          userId: account.staffId,
          keepOnSource: false,
          grantOnDestination: true,
          destinationRole: "STAFF",
        },
      ],
    });
    const noAdmin = await previewAccountSplit(preparation.id);
    expect(
      noAdmin?.blockers.find(
        (blocker) => blocker.code === "destination_admin_required"
      )?.message
    ).toBe(DESTINATION_ADMIN_BLOCKER_MESSAGE);
    expect(membership.clinicId).toBe(account.clinicId);
  });

  it("previews the full guide copy set without structural changes", async () => {
    const account = await seedGroup("preview");
    await db().clinicSite.create({
      data: {
        id: `${PREFIX}old_preview`,
        clinicId: account.clinicId,
        name: "Old",
        slug: "aspl-old-preview",
        displayName: "Old Clinic",
        active: false,
        isPrimary: false,
      },
    });
    await db().clinicLocation.create({
      data: {
        id: `${PREFIX}west_preview`,
        clinicSiteId: account.splitSiteId,
        clinicId: account.clinicId,
        name: "West",
        slug: "west",
        displayName: "West",
        isPrimary: false,
        servesSiteRoot: false,
        active: true,
      },
    });
    const template = await db().guideTemplate.create({
      data: {
        slug: `${PREFIX}template_preview`,
        title: "Template",
        specialty: "DENTAL",
        revisions: {
          create: { version: 1, status: "PUBLISHED" },
        },
      },
      include: { revisions: true },
    });
    const templateRevisionId = template.revisions[0]?.id;
    const shared = await db().practiceGuide.create({
      data: {
        id: `${PREFIX}guide_shared`,
        clinicId: account.clinicId,
        title: "Shared extraction",
        publicSlug: "shared-extraction",
        status: "PUBLISHED",
        overrides: {
          create: {
            sectionKey: "pain",
            title: "Pain",
            body: "Call us.",
          },
        },
        additions: {
          create: {
            key: "local",
            kind: "CUSTOM",
            title: "Local",
            body: "Local note.",
            sortOrder: 1,
          },
        },
        contentRevisions: {
          create: [
            {
              id: `${PREFIX}rev_shared_draft`,
              version: 0,
              status: "DRAFT",
              title: "Shared extraction",
              createdByUserId: account.adminId,
              sections: {
                create: {
                  key: "introduction",
                  kind: "INTRODUCTION",
                  title: "About",
                  body: "Draft",
                  sortOrder: 0,
                  provenance: "PRACTICE_CUSTOM",
                },
              },
            },
            {
              id: `${PREFIX}rev_shared_pub`,
              version: 1,
              status: "PUBLISHED",
              title: "Shared extraction",
              createdByUserId: account.adminId,
              reviewAttestedByUserId: account.adminId,
              sections: {
                create: [
                  {
                    key: "introduction",
                    kind: "INTRODUCTION",
                    title: "About",
                    body: "Published",
                    sortOrder: 0,
                    provenance: "PRACTICE_CUSTOM",
                  },
                  {
                    key: "pain",
                    kind: "PAIN",
                    title: "Pain",
                    body: "Published pain",
                    sortOrder: 1,
                    provenance: "PRACTICE_OVERRIDE",
                  },
                ],
              },
            },
          ],
        },
      },
    });
    const onlySplit = await db().practiceGuide.create({
      data: {
        id: `${PREFIX}guide_only`,
        clinicId: account.clinicId,
        title: "West only",
        publicSlug: "west-only",
        contentRevisions: {
          create: {
            id: `${PREFIX}rev_only_draft`,
            version: 0,
            status: "DRAFT",
            title: "West only",
            createdByUserId: account.staffId,
            sections: {
              create: {
                key: "introduction",
                kind: "INTRODUCTION",
                title: "About",
                body: "Only",
                sortOrder: 0,
                provenance: "PRACTICE_CUSTOM",
              },
            },
          },
        },
      },
    });
    await db().practiceGuide.create({
      data: {
        id: `${PREFIX}guide_template`,
        clinicId: account.clinicId,
        title: "Template guide",
        publicSlug: "template-guide",
        guideTemplateId: template.id,
        pinnedRevisionId: templateRevisionId,
        contentRevisions: {
          create: [
            {
              id: `${PREFIX}rev_template_draft`,
              version: 0,
              status: "DRAFT",
              title: "Template guide",
              sections: {
                create: {
                  key: "introduction",
                  kind: "INTRODUCTION",
                  title: "About",
                  body: "Template draft",
                  sortOrder: 0,
                  provenance: "CANONICAL",
                },
              },
            },
            {
              id: `${PREFIX}rev_template_pub`,
              version: 1,
              status: "PUBLISHED",
              title: "Template guide",
              sections: {
                create: {
                  key: "introduction",
                  kind: "INTRODUCTION",
                  title: "About",
                  body: "Template published",
                  sortOrder: 0,
                  provenance: "CANONICAL",
                },
              },
            },
          ],
        },
      },
    });
    await db().practiceGuidePlacement.createMany({
      data: [
        {
          practiceGuideId: shared.id,
          locationId: account.keptLocationId,
          clinicId: account.clinicId,
          publicSlug: "shared-extraction",
          isEnabled: true,
          publishedPracticeGuideRevisionId: `${PREFIX}rev_shared_pub`,
        },
        {
          practiceGuideId: shared.id,
          locationId: account.splitLocationId,
          clinicId: account.clinicId,
          publicSlug: "shared-extraction",
          isEnabled: true,
          publishedPracticeGuideRevisionId: `${PREFIX}rev_shared_pub`,
        },
        {
          practiceGuideId: onlySplit.id,
          locationId: `${PREFIX}west_preview`,
          clinicId: account.clinicId,
          publicSlug: "west-only",
          isEnabled: false,
        },
        {
          practiceGuideId: `${PREFIX}guide_template`,
          locationId: account.splitLocationId,
          clinicId: account.clinicId,
          publicSlug: "template-guide",
          isEnabled: true,
          publishedPracticeGuideRevisionId: `${PREFIX}rev_template_pub`,
        },
      ],
    });
    await db().accountToken.create({
      data: {
        type: "INVITATION",
        tokenHash: `${PREFIX}invite_preview`,
        userId: account.staffId,
        clinicId: account.clinicId,
        role: "STAFF",
        email: "invite-preview@example.test",
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    const preparation = await openPreparation(account);
    await saveAccountSplitSiteDecisions({
      preparationId: preparation.id,
      decisions: [
        { clinicSiteId: account.splitSiteId, decision: "SPLIT" },
        { clinicSiteId: `${PREFIX}old_preview`, decision: "DEACTIVATE" },
      ],
    });
    const before = await structuralFingerprint(account.clinicId);
    const beforeStatus = await db().clinicAccountSplitPreparation.findUnique({
      where: { id: preparation.id },
      select: { status: true, updatedAt: true },
    });
    const preview = await previewAccountSplit(preparation.id);
    const after = await structuralFingerprint(account.clinicId);
    const afterStatus = await db().clinicAccountSplitPreparation.findUnique({
      where: { id: preparation.id },
      select: { status: true, updatedAt: true },
    });
    expect(after).toEqual(before);
    expect(afterStatus).toEqual(beforeStatus);
    expect(await db().clinicAccountSplitGuideMap.count()).toBe(0);
    expect(await db().clinicAccountSplitRevisionMap.count()).toBe(0);
    expect(preview?.splitSite?.slug).toBe(account.splitSlug);
    expect(preview?.destinationPreview.guideCount).toBe(3);
    expect(preview?.destinationPreview.draftRevisionCount).toBe(3);
    expect(preview?.destinationPreview.publishedRevisionCount).toBe(2);
    expect(preview?.destinationPreview.sectionCount).toBe(6);
    expect(preview?.destinationPreview.overrideCount).toBe(1);
    expect(preview?.destinationPreview.additionCount).toBe(1);
    expect(preview?.destinationPreview.placementCount).toBe(3);
    expect(preview?.destinationPreview.pinnedPlacementCount).toBe(2);
    expect(preview?.destinationPreview.templateBackedGuideCount).toBe(1);
    expect(preview?.destinationPreview.sharedWithKeptSiteCount).toBe(1);
    expect(preview?.destinationPreview.publicUrlStatement).toBe(
      "PUBLIC URLS WILL NOT CHANGE"
    );
    expect(preview?.destinationPreview.publicUrls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          hostname: account.splitSlug,
          path: "/shared-extraction",
        }),
        expect.objectContaining({
          hostname: account.splitSlug,
          path: "/west/west-only",
        }),
      ])
    );
    expect(preview?.destinationPreview.brandingUnchanged).toBe(true);
    expect(
      preview?.destinationPreview.locations.map((location) => location.slug)
    ).toEqual(expect.arrayContaining([null, "west"]));
    const sharedPreview = preview?.destinationPreview.guides.find(
      (guide) => guide.id === shared.id
    );
    expect(sharedPreview?.destinationCopiedFromPracticeGuideId).toBeNull();
    expect(sharedPreview?.historicalUserIds).toEqual([account.adminId]);
    expect(sharedPreview?.guideTemplateId).toBeNull();
    expect(
      preview?.destinationPreview.guides.find(
        (guide) => guide.id === `${PREFIX}guide_template`
      )?.pinnedTemplateRevisionId
    ).toBe(templateRevisionId);
    expect(
      preview?.sourcePreview.guidesLosingAllPlacements
        .map((guide) => guide.id)
        .sort()
    ).toEqual([`${PREFIX}guide_only`, `${PREFIX}guide_template`].sort());
    expect(preview?.warnings.map((warning) => warning.code)).toContain(
      "outstanding_source_invitations"
    );
    expect(
      await db().accountToken.findFirst({
        where: { tokenHash: `${PREFIX}invite_preview` },
      })
    ).toMatchObject({ clinicId: account.clinicId, revokedAt: null });
    const sourcePlan = await db().clinicEntitlement.findUnique({
      where: { clinicId: account.clinicId },
    });
    expect(sourcePlan?.commercialPlan).toBe("GROUP");
  });

  it("reaches billing ready only from the local active projection and can revoke it", async () => {
    const account = await seedGroup("bill");
    const preparation = await openPreparation(account);
    await saveAccountSplitSiteDecisions({
      preparationId: preparation.id,
      decisions: [{ clinicSiteId: account.splitSiteId, decision: "SPLIT" }],
    });
    await saveAccountSplitStaffSelections({
      preparationId: preparation.id,
      selections: [
        {
          userId: account.adminId,
          keepOnSource: false,
          grantOnDestination: true,
          destinationRole: "ADMIN",
        },
        {
          userId: account.staffId,
          keepOnSource: true,
          grantOnDestination: false,
          destinationRole: "STAFF",
        },
      ],
    });
    const shell = await createSplitDestinationAccount(preparation.id);
    await revalidateAccountSplitPreparation(preparation.id);
    expect((await previewAccountSplit(preparation.id))?.status).toBe(
      "DESTINATION_READY"
    );

    async function setBilling(
      data: Prisma.ClinicEntitlementUncheckedCreateInput
    ) {
      const { clinicId: _clinicId, ...changes } = data;
      await db().clinicEntitlement.upsert({
        where: { clinicId: shell.id },
        create: data,
        update: changes,
      });
      await revalidateAccountSplitPreparation(preparation.id);
      return previewAccountSplit(preparation.id);
    }

    const base = {
      clinicId: shell.id,
      commercialPlan: "PRACTICE" as const,
      billingInterval: "MONTHLY" as const,
      billingStatus: BillingStatus.ACTIVE,
      entitlementStatus: EntitlementStatus.ACTIVE,
      siteAllowance: 1,
      locationAllowance: 1,
      cancelAtPeriodEnd: false,
      scheduledCommercialPlan: null,
    };
    expect(
      (
        await setBilling({
          ...base,
          entitlementStatus: EntitlementStatus.PENDING,
          billingStatus: BillingStatus.PAYMENT_PENDING,
        })
      )?.status
    ).toBe("AWAITING_PAYMENT");
    expect(
      (
        await setBilling({
          ...base,
          entitlementStatus: EntitlementStatus.ENDED,
          billingStatus: BillingStatus.ENDED,
        })
      )?.status
    ).not.toBe("BILLING_READY");
    expect(
      (
        await setBilling({ ...base, commercialPlan: "ESSENTIAL" })
      )?.blockers.map((blocker) => blocker.code)
    ).toContain("billing_not_ready");
    expect(
      (await setBilling({ ...base, billingInterval: "YEARLY" }))?.status
    ).toBe("DESTINATION_READY");
    expect(
      (await setBilling({ ...base, cancelAtPeriodEnd: true }))?.blockers
        .map((blocker) => blocker.message)
        .join(" ")
    ).toContain("scheduled to cancel");
    expect(
      (
        await setBilling({
          ...base,
          scheduledCommercialPlan: "ESSENTIAL",
        })
      )?.status
    ).not.toBe("BILLING_READY");
    await db().clinicLocation.create({
      data: {
        id: `${PREFIX}extra_bill`,
        clinicSiteId: account.splitSiteId,
        clinicId: account.clinicId,
        name: "Extra",
        slug: "extra",
        displayName: "Extra",
        active: true,
        servesSiteRoot: false,
        isPrimary: false,
      },
    });
    expect(
      (await setBilling({ ...base, locationAllowance: 1 }))?.blockers.map(
        (blocker) => blocker.code
      )
    ).toContain("destination_location_allowance");
    const ready = await setBilling({ ...base, locationAllowance: 2 });
    expect(ready?.status).toBe("READY_TO_EXECUTE");
    expect(ready?.billing.phase).toBe("ready");

    const joinerId = `${PREFIX}joiner_bill`;
    await db().user.create({
      data: {
        id: joinerId,
        email: `${joinerId}@example.test`,
        name: "New Member",
      },
    });
    await db().clinicMembership.create({
      data: {
        clinicId: account.clinicId,
        userId: joinerId,
        role: "STAFF",
      },
    });
    await revalidateAccountSplitPreparation(preparation.id);
    const revoked = await previewAccountSplit(preparation.id);
    expect(revoked?.status).toBe("DRAFT");
    expect(revoked?.blockers.map((blocker) => blocker.code)).toContain(
      "staff_selection_missing"
    );
    expect(revoked?.status).not.toBe("COMPLETED");
    const stored = await db().clinicAccountSplitPreparation.findUniqueOrThrow({
      where: { id: preparation.id },
    });
    expect(stored.status).not.toBe("COMPLETED");
    expect(stored.executedAt).toBeNull();
  });

  it("lets a three-site group split one site and retain another", async () => {
    const account = await seedGroup("seq");
    const retained = await addSite(account, "retain", "Northern Dental");
    const preparation = await openPreparation(account);
    await saveAccountSplitSiteDecisions({
      preparationId: preparation.id,
      decisions: [
        { clinicSiteId: account.splitSiteId, decision: "SPLIT" },
        { clinicSiteId: retained.id, decision: "RETAIN_ON_SOURCE" },
      ],
    });
    await moveAdminToDestination(preparation.id, account);
    const shell = await createSplitDestinationAccount(preparation.id);
    await activateDestinationBilling(shell.id);
    await revalidateAccountSplitPreparation(preparation.id);
    const preview = await previewAccountSplit(preparation.id);
    expect(preview?.status).toBe("READY_TO_EXECUTE");
    expect(preview?.practiceDowngradeReady).toBe(false);
    expect(
      preview?.practiceDowngradeBlockers.map((blocker) => blocker.message)
    ).toContain(
      "Source Account will remain Group because 1 additional active Clinic Site is retained for a later split."
    );
    expect(
      preview?.sourcePreview.activeSites.map((site) => site.displayName).sort()
    ).toEqual(["Kept Clinic", "Northern Dental"]);
    expect(preview?.sourcePreview.planRemains).toBe("GROUP");
    const sourcePlan = await db().clinicEntitlement.findUnique({
      where: { clinicId: account.clinicId },
    });
    expect(sourcePlan?.commercialPlan).toBe("GROUP");
    await expect(openPreparation(account)).rejects.toBeInstanceOf(
      ClinicPortalError
    );

    await db().clinicAccountSplitPreparation.update({
      where: { id: preparation.id },
      data: { status: "COMPLETED" },
    });
    const later = await openPreparation(account);
    await saveAccountSplitSiteDecisions({
      preparationId: later.id,
      decisions: [
        { clinicSiteId: retained.id, decision: "SPLIT" },
        { clinicSiteId: account.splitSiteId, decision: "RETAIN_ON_SOURCE" },
      ],
    });
    const laterPreview = await previewAccountSplit(later.id);
    expect(laterPreview?.keptSite?.id).toBe(account.keptSiteId);
    expect(laterPreview?.splitSite?.id).toBe(retained.id);
    expect(laterPreview?.status).not.toBe("COMPLETED");
  });

  it("marks practice downgrade ready when the only extra site is deactivated", async () => {
    const account = await seedGroup("final");
    const extra = await addSite(account, "extra", "Northern Dental");
    const preparation = await openPreparation(account);
    await saveAccountSplitSiteDecisions({
      preparationId: preparation.id,
      decisions: [
        { clinicSiteId: account.splitSiteId, decision: "SPLIT" },
        { clinicSiteId: extra.id, decision: "DEACTIVATE" },
      ],
    });
    const preview = await previewAccountSplit(preparation.id);
    expect(preview?.practiceDowngradeReady).toBe(true);
    expect(preview?.sourcePreview.activeSiteCount).toBe(1);
    expect(preview?.sourcePreview.planRemains).toBe("GROUP");
    const sourcePlan = await db().clinicEntitlement.findUnique({
      where: { clinicId: account.clinicId },
    });
    expect(sourcePlan?.commercialPlan).toBe("GROUP");
    expect(preview?.status).not.toBe("COMPLETED");
  });

  it("allows more than one site to stay active on the source", async () => {
    const account = await seedGroup("four");
    const north = await addSite(account, "north", "Northern Dental");
    const west = await addSite(account, "west", "Western Dental");
    const preparation = await openPreparation(account);
    await saveAccountSplitSiteDecisions({
      preparationId: preparation.id,
      decisions: [
        { clinicSiteId: account.splitSiteId, decision: "SPLIT" },
        { clinicSiteId: north.id, decision: "RETAIN_ON_SOURCE" },
        { clinicSiteId: west.id, decision: "RETAIN_ON_SOURCE" },
      ],
    });
    const preview = await previewAccountSplit(preparation.id);
    expect(preview?.splitSite?.id).toBe(account.splitSiteId);
    expect(preview?.sourcePreview.retainedSiteIds.sort()).toEqual(
      [north.id, west.id].sort()
    );
    expect(preview?.sourcePreview.activeSiteCount).toBe(3);
    expect(preview?.practiceDowngradeReady).toBe(false);
    expect(
      preview?.practiceDowngradeBlockers
        .map((blocker) => blocker.message)
        .join(" ")
    ).toContain("2 additional active Clinic Sites are retained");
  });

  it("previews primary promotion when the kept site is not primary", async () => {
    const account = await seedGroup("promo");
    const primary = await addSite(account, "primary", "Pacific Dental");
    await db().clinicSite.update({
      where: { id: account.keptSiteId },
      data: { isPrimary: false },
    });
    await db().clinicSite.update({
      where: { id: primary.id },
      data: { isPrimary: true },
    });
    const preparation = await openPreparation(account);
    await saveAccountSplitSiteDecisions({
      preparationId: preparation.id,
      decisions: [
        { clinicSiteId: account.splitSiteId, decision: "SPLIT" },
        { clinicSiteId: primary.id, decision: "DEACTIVATE" },
      ],
    });
    await moveAdminToDestination(preparation.id, account);
    const shell = await createSplitDestinationAccount(preparation.id);
    await activateDestinationBilling(shell.id);
    const preview = await previewAccountSplit(preparation.id);
    expect(preview?.primaryPromotion.required).toBe(true);
    expect(preview?.primaryPromotion.currentPrimarySite?.displayName).toBe(
      "Pacific Dental"
    );
    expect(preview?.primaryPromotion.futurePrimarySite?.id).toBe(
      account.keptSiteId
    );
    expect(preview?.primaryPromotion.message).toBe(
      "Kept Clinic will become the source Account primary Clinic Site during execution."
    );
    expect(preview?.blockers.map((blocker) => blocker.code)).not.toContain(
      "missing_primary_site"
    );
    expect(preview?.status).toBe("READY_TO_EXECUTE");
    const storedPrimary = await db().clinicSite.findUniqueOrThrow({
      where: { id: primary.id },
    });
    expect(storedPrimary.isPrimary).toBe(true);
    expect(storedPrimary.active).toBe(true);
  });

  it("onboards a destination admin on a shell without creating a site", async () => {
    const account = await seedGroup("onboard");
    const preparation = await openPreparation(account);
    await saveAccountSplitSiteDecisions({
      preparationId: preparation.id,
      decisions: [{ clinicSiteId: account.splitSiteId, decision: "SPLIT" }],
    });
    const shell = await createSplitDestinationAccount(preparation.id);
    expect(await db().clinicSite.count({ where: { clinicId: shell.id } })).toBe(
      0
    );

    clearTransactionalEmailMemoryInbox();
    const invited = await inviteClinicUser({
      clinicId: shell.id,
      invitedByUserId: account.operatorId,
      name: "Dest Admin",
      email: `${PREFIX}dest_${account.clinicId}@example.test`,
      role: "ADMIN",
    });
    expect(invited.ok).toBe(true);
    if (!invited.ok || invited.outcome !== "INVITATION_SENT") {
      throw new Error("destination invitation was not created");
    }
    const tokenRow = await db().accountToken.findFirstOrThrow({
      where: { userId: invited.userId, consumedAt: null, revokedAt: null },
    });
    const rawToken = recoverInvitationToken(tokenRow.tokenHash);
    expect(rawToken).toBeTruthy();
    const accepted = await acceptInvitationWithToken({
      rawToken: rawToken!,
      newPassword: "LocalOnly12345!",
      confirmPassword: "LocalOnly12345!",
    });
    expect(accepted.ok).toBe(true);
    const membership = await db().clinicMembership.findFirstOrThrow({
      where: { clinicId: shell.id, userId: invited.userId },
    });
    expect(membership.role).toBe("ADMIN");
    expect(membership.active).toBe(true);
    expect(
      await db().clinicMembership.count({
        where: { userId: invited.userId, clinicId: account.clinicId },
      })
    ).toBe(0);

    const setup = await saveBillingSetup({
      clinicId: shell.id,
      userId: invited.userId,
      form: {
        legalEntityName: "Coast Dental Pty Ltd",
        tradingName: "Coast Dental",
        billingContactName: "Dest Admin",
        billingEmail: "billing.coast@example.test",
        addressLine1: "10 River Street",
        addressLine2: "",
        city: "Tweed Heads",
        region: "NSW",
        postalCode: "2486",
        country: "AU",
        businessNumberKind: "abn",
        abn: "32 671 297 130",
        acn: "",
        termsAccepted: true,
      },
    });
    expect(setup.ok).toBe(true);
    const acceptance = await db().legalAcceptance.findFirstOrThrow({
      where: { clinicId: shell.id, userId: invited.userId },
    });
    expect(acceptance.clinicId).toBe(shell.id);
    expect(
      await db().legalAcceptance.count({
        where: { clinicId: account.clinicId },
      })
    ).toBe(0);

    const offer = await prepareClinicCommercialOffer(
      {
        clinicId: shell.id,
        commercialPlan: "PRACTICE",
        billingInterval: "MONTHLY",
      },
      db()
    );
    expect(offer.ok).toBe(true);
    const checkout = await createClinicCheckout({
      clinicId: shell.id,
      userId: invited.userId,
      successUrl: "https://staff.example.test/account/billing/complete",
      cancelUrl: "https://staff.example.test/account/billing",
      env: BILLING_TEST_ENV,
      db: db(),
      stripe: fakeCheckoutStripe(),
    });
    expect(checkout.ok).toBe(true);

    const projected = await processVerifiedStripeEvent(
      {
        id: "evt_aspl_onboard",
        object: "event",
        created: 1_747_000_000,
        type: "invoice.paid",
        data: {
          object: {
            id: "in_aspl_onboard",
            object: "invoice",
            customer: "cus_aspl_onboard",
            status: "paid",
            metadata: { clinicId: shell.id },
            parent: {
              type: "subscription_details",
              subscription_details: {
                subscription: "sub_aspl_onboard",
                metadata: { clinicId: shell.id },
              },
            },
            lines: {
              object: "list",
              data: [
                {
                  id: "il_aspl_onboard",
                  object: "line_item",
                  pricing: {
                    type: "price_details",
                    price_details: {
                      price: "price_test_practice_monthly",
                      product: "prod_aspl",
                    },
                  },
                },
              ],
            },
            period_start: 1_746_000_000,
            period_end: 1_748_600_000,
          },
        },
      } as never,
      {
        env: BILLING_TEST_ENV,
        reader: {
          async retrieveSubscription() {
            return {
              id: "sub_aspl_onboard",
              object: "subscription",
              status: "active",
              customer: "cus_aspl_onboard",
              cancel_at_period_end: false,
              metadata: { clinicId: shell.id },
              items: {
                object: "list",
                data: [
                  {
                    id: "si_aspl_onboard",
                    price: { id: "price_test_practice_monthly" },
                    current_period_start: 1_746_000_000,
                    current_period_end: 1_748_600_000,
                  },
                ],
              },
            } as never;
          },
        },
        downgradeStripe: null,
      }
    );
    expect(projected.outcome).toBe("processed");
    await revalidateAccountSplitPreparation(preparation.id);
    const preview = await previewAccountSplit(preparation.id);
    expect(preview?.billing.phase).toBe("ready");
    expect(preview?.status).toBe("READY_TO_EXECUTE");
    expect(await db().clinicSite.count({ where: { clinicId: shell.id } })).toBe(
      0
    );
    expect(
      await db().clinicLocation.count({ where: { clinicId: shell.id } })
    ).toBe(0);
  });

  it("does not contain execution writes", () => {
    const source = readSplitSources();
    expect(source).not.toContain("clinicSite.update");
    expect(source).not.toContain("clinicSite.create");
    expect(source).not.toContain("clinicLocation.update");
    expect(source).not.toContain("clinicLocation.create");
    expect(source).not.toContain("practiceGuide.create");
    expect(source).not.toContain("practiceGuidePlacement.create");
    expect(source).not.toContain("practiceGuidePlacement.update");
    expect(source).not.toContain("practiceGuidePlacement.delete");
    expect(source).not.toContain("clinicMembership.update");
    expect(source).not.toContain("clinicMembership.create");
    expect(source).not.toContain("clinicMembership.delete");
    expect(source).not.toMatch(/status:\s*"COMPLETED"/);
    expect(source).not.toContain("stripe");
    expect(source).not.toContain("resend");
  });
});

async function addSite(
  account: { clinicId: string },
  key: string,
  displayName: string
) {
  const site = await db().clinicSite.create({
    data: {
      id: `${PREFIX}site_${key}`,
      clinicId: account.clinicId,
      name: displayName,
      slug: `aspl-${key}`.slice(0, 32),
      displayName,
      active: true,
      isPrimary: false,
    },
  });
  await db().clinicLocation.create({
    data: {
      id: `${PREFIX}loc_${key}`,
      clinicSiteId: site.id,
      clinicId: account.clinicId,
      name: `${displayName} root`,
      slug: null,
      displayName: `${displayName} root`,
      isPrimary: true,
      servesSiteRoot: true,
      active: true,
    },
  });
  return site;
}

async function moveAdminToDestination(
  preparationId: string,
  account: { adminId: string; staffId: string }
) {
  await saveAccountSplitStaffSelections({
    preparationId,
    selections: [
      {
        userId: account.adminId,
        keepOnSource: false,
        grantOnDestination: true,
        destinationRole: "ADMIN",
      },
      {
        userId: account.staffId,
        keepOnSource: true,
        grantOnDestination: false,
        destinationRole: "STAFF",
      },
    ],
  });
}

async function activateDestinationBilling(clinicId: string) {
  await db().clinicEntitlement.upsert({
    where: { clinicId },
    create: {
      clinicId,
      commercialPlan: "PRACTICE",
      billingInterval: "MONTHLY",
      billingStatus: BillingStatus.ACTIVE,
      entitlementStatus: EntitlementStatus.ACTIVE,
      siteAllowance: 1,
      locationAllowance: 1,
      cancelAtPeriodEnd: false,
    },
    update: {
      commercialPlan: "PRACTICE",
      billingInterval: "MONTHLY",
      billingStatus: BillingStatus.ACTIVE,
      entitlementStatus: EntitlementStatus.ACTIVE,
      siteAllowance: 1,
      locationAllowance: 1,
      cancelAtPeriodEnd: false,
      scheduledCommercialPlan: null,
    },
  });
}

function recoverInvitationToken(tokenHash: string): string | null {
  for (const message of getTransactionalEmailMemoryInbox()) {
    const match = message.text.match(/#token=([A-Za-z0-9_-]+)/);
    if (match?.[1] && hashAccountToken(match[1]) === tokenHash) {
      return match[1];
    }
  }
  return null;
}

function fakeCheckoutStripe() {
  return {
    customers: {
      async create() {
        return { id: "cus_aspl_onboard" };
      },
      async update(id: string) {
        return { id };
      },
    },
    checkout: {
      sessions: {
        async create() {
          return {
            id: "cs_aspl_onboard",
            url: "https://checkout.stripe.com/c/pay/cs_aspl_onboard",
            status: "open" as const,
          };
        },
        async retrieve(id: string) {
          return {
            id,
            url: "https://checkout.stripe.com/c/pay/cs_aspl_onboard",
            status: "open" as const,
            line_items: {
              data: [{ price: { id: "price_test_practice_monthly" } }],
            },
          };
        },
        async expire(id: string) {
          return { id };
        },
      },
    },
  };
}

async function structuralFingerprint(clinicId: string) {
  const prisma = db();
  const sites = await prisma.clinicSite.findMany({
    where: { clinicId },
    orderBy: { id: "asc" },
    select: {
      id: true,
      clinicId: true,
      slug: true,
      active: true,
      logoUrl: true,
    },
  });
  const locations = await prisma.clinicLocation.findMany({
    where: { clinicId },
    orderBy: { id: "asc" },
    select: {
      id: true,
      clinicId: true,
      clinicSiteId: true,
      slug: true,
      active: true,
    },
  });
  const guides = await prisma.practiceGuide.findMany({
    where: { clinicId },
    orderBy: { id: "asc" },
    select: { id: true, clinicId: true, copiedFromPracticeGuideId: true },
  });
  const placements = await prisma.practiceGuidePlacement.findMany({
    where: { clinicId },
    orderBy: { id: "asc" },
    select: {
      id: true,
      clinicId: true,
      locationId: true,
      practiceGuideId: true,
      isEnabled: true,
    },
  });
  const memberships = await prisma.clinicMembership.findMany({
    where: { clinicId },
    orderBy: { userId: "asc" },
    select: { userId: true, role: true, active: true, clinicId: true },
  });
  const entitlement = await prisma.clinicEntitlement.findUnique({
    where: { clinicId },
    select: { commercialPlan: true, billingStatus: true },
  });
  return { sites, locations, guides, placements, memberships, entitlement };
}
