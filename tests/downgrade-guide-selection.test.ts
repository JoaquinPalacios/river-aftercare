import "dotenv/config";

import {
  BillingStatus,
  ClinicMembershipRole,
  DowngradePreparationStatus,
  EntitlementStatus,
  GuideRevisionStatus,
  GuideSectionKind,
  PlatformRole,
  PracticeGuideStatus,
  PracticeSectionProvenance,
} from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";

import {
  executeOperatorDowngradeReversal,
  executeOperatorPlanDowngrade,
} from "@/lib/billing/plan-downgrade";
import { getPublishedPracticeGuide } from "@/lib/aftercare/get-published-practice-guide";
import { listPublishedPracticeGuides } from "@/lib/aftercare/list-published-practice-guides";
import { ClinicPortalError } from "@/lib/clinic-portal/errors";
import { savePracticeGuideDraft } from "@/lib/clinic-portal/save-practice-guide-draft";
import {
  actorMayConfirmDowngradeSelection,
  assessGuideRestore,
  assessOperatorExtraChangeForDowngrade,
  confirmClinicDowngradeSelection,
  prepareClinicDowngrade,
  validateKeepSelection,
} from "@/lib/entitlements/downgrade-selection";
import { assessEssentialDowngradeReadiness } from "@/lib/entitlements/downgrade-readiness";
import {
  DOWNGRADE_GUIDE_RETENTION_DAYS,
  applyDowngradeGuideTransition,
  downgradeRetainedDirectUrlVisible,
  downgradeRetentionUntilFrom,
  planDowngradeGuideRetention,
  type RetentionGuideFields,
} from "@/lib/entitlements/downgrade-retention";
import { countOriginalCustomGuides } from "@/lib/entitlements/guide-usage";
import { updateOperatorAllowanceExtras } from "@/lib/entitlements/operator-extras";
import { essentialGuideLimits } from "@/lib/entitlements/downgrade-retention";
import { getPrisma } from "@/lib/prisma";
import { BILLING_TEST_ENV } from "@/tests/helpers/billing";

const LIMITS = essentialGuideLimits({
  teamMembers: 0,
  customGuides: 0,
  templateAdaptations: 0,
});

function guide(
  id: string,
  kind: "custom" | "adapted" | "pinned",
  overrides: Partial<RetentionGuideFields> = {}
): RetentionGuideFields {
  return {
    id,
    guideTemplateId: kind === "pinned" ? "template_1" : null,
    sourceGuideTemplateId: kind === "adapted" ? "template_1" : null,
    adaptedAt: kind === "adapted" ? new Date("2026-01-01T00:00:00.000Z") : null,
    downgradeRetainedAt: null,
    downgradeRetentionUntil: null,
    ...overrides,
  };
}

function many(kind: "custom" | "adapted", count: number, prefix: string) {
  return Array.from({ length: count }, (_, index) =>
    guide(`${prefix}_${index}`, kind)
  );
}

describe("downgrade guide selection rules", () => {
  it("accepts 2 custom and 2 edited templates, including a smaller set and none", () => {
    const guides = [
      ...many("custom", 3, "c").map((row, index) => ({
        ...row,
        clinicId: "clinic",
      })),
      ...many("adapted", 3, "a").map((row) => ({ ...row, clinicId: "clinic" })),
    ];
    const full = validateKeepSelection({
      clinicId: "clinic",
      guides,
      selectedIds: ["c_0", "c_1", "a_0", "a_1"],
      limits: LIMITS,
    });
    expect(full).toMatchObject({
      ok: true,
      custom: 2,
      adapted: 2,
      combined: 4,
    });
    const smaller = validateKeepSelection({
      clinicId: "clinic",
      guides,
      selectedIds: ["c_0", "a_0"],
      limits: LIMITS,
    });
    expect(smaller).toMatchObject({ ok: true, custom: 1, adapted: 1 });
    const none = validateKeepSelection({
      clinicId: "clinic",
      guides,
      selectedIds: [],
      limits: LIMITS,
    });
    expect(none).toMatchObject({
      ok: true,
      custom: 0,
      adapted: 0,
      combined: 0,
    });
  });

  it("rejects category and combined overflow, including extras", () => {
    const guides = [
      ...many("custom", 4, "c").map((row) => ({ ...row, clinicId: "clinic" })),
      ...many("adapted", 4, "a").map((row) => ({ ...row, clinicId: "clinic" })),
    ];
    expect(
      validateKeepSelection({
        clinicId: "clinic",
        guides,
        selectedIds: ["c_0", "c_1", "c_2"],
        limits: LIMITS,
      }).ok
    ).toBe(false);
    expect(
      validateKeepSelection({
        clinicId: "clinic",
        guides,
        selectedIds: ["a_0", "a_1", "a_2"],
        limits: LIMITS,
      }).ok
    ).toBe(false);
    expect(
      validateKeepSelection({
        clinicId: "clinic",
        guides,
        selectedIds: ["c_0", "c_1", "a_0", "a_1", "a_2"],
        limits: LIMITS,
      }).ok
    ).toBe(false);
    const withExtras = essentialGuideLimits({
      teamMembers: 0,
      customGuides: 1,
      templateAdaptations: 2,
    });
    expect(withExtras).toEqual({ custom: 3, adapted: 4, combined: 7 });
    expect(
      validateKeepSelection({
        clinicId: "clinic",
        guides,
        selectedIds: ["c_0", "c_1", "c_2", "a_0", "a_1", "a_2", "a_3"],
        limits: withExtras,
      })
    ).toMatchObject({ ok: true, custom: 3, adapted: 4, combined: 7 });
  });

  it("rejects another clinic, pinned templates, retained guides, and unknown ids", () => {
    const guides = [
      { ...guide("custom", "custom"), clinicId: "clinic" },
      { ...guide("pinned", "pinned"), clinicId: "clinic" },
      {
        ...guide("retained", "custom", {
          downgradeRetainedAt: new Date("2026-01-01T00:00:00.000Z"),
        }),
        clinicId: "clinic",
      },
      { ...guide("other", "custom"), clinicId: "other" },
    ];
    expect(
      validateKeepSelection({
        clinicId: "clinic",
        guides,
        selectedIds: ["missing"],
        limits: LIMITS,
      })
    ).toMatchObject({ ok: false, code: "unknown_guide" });
    expect(
      validateKeepSelection({
        clinicId: "clinic",
        guides,
        selectedIds: ["other"],
        limits: LIMITS,
      })
    ).toMatchObject({ ok: false, code: "unknown_guide" });
    expect(
      validateKeepSelection({
        clinicId: "clinic",
        guides,
        selectedIds: ["pinned"],
        limits: LIMITS,
      })
    ).toMatchObject({ ok: false, code: "not_selectable" });
    expect(
      validateKeepSelection({
        clinicId: "clinic",
        guides,
        selectedIds: ["retained"],
        limits: LIMITS,
      })
    ).toMatchObject({ ok: false, code: "not_selectable" });
  });

  it("lets a clinic administrator confirm and refuses staff and operator support", () => {
    expect(
      actorMayConfirmDowngradeSelection({
        membershipRole: ClinicMembershipRole.ADMIN,
        membershipActive: true,
        operatorSupport: false,
      })
    ).toBe(true);
    expect(
      actorMayConfirmDowngradeSelection({
        membershipRole: ClinicMembershipRole.STAFF,
        membershipActive: true,
        operatorSupport: false,
      })
    ).toBe(false);
    expect(
      actorMayConfirmDowngradeSelection({
        membershipRole: ClinicMembershipRole.ADMIN,
        membershipActive: true,
        operatorSupport: true,
      })
    ).toBe(false);
  });
});

describe("downgrade retention planning", () => {
  const transitionAt = new Date("2026-10-22T01:00:00.000Z");

  it("retains every non-selected clinic-owned guide for exactly 60 days", () => {
    const guides = [
      ...many("custom", 30, "c"),
      ...many("adapted", 10, "a"),
      guide("pinned", "pinned"),
    ];
    const plan = planDowngradeGuideRetention({
      previousPlan: "PRACTICE",
      projectedPlan: "ESSENTIAL",
      cancellationSuperseded: false,
      transitionAt,
      limits: LIMITS,
      guides,
      confirmedSelectedIds: ["c_0", "c_1", "a_0", "a_1"],
    });
    expect(plan.anomaly).toBe("none");
    expect(plan.retainGuideIds).toHaveLength(36);
    expect(plan.retainGuideIds).not.toContain("c_0");
    expect(plan.retainGuideIds).not.toContain("pinned");
    expect(plan.retentionUntil?.toISOString()).toBe("2026-12-21T01:00:00.000Z");
    expect(DOWNGRADE_GUIDE_RETENTION_DAYS).toBe(60);
    expect(downgradeRetentionUntilFrom(transitionAt).toISOString()).toBe(
      plan.retentionUntil?.toISOString()
    );
  });

  it("keeps a guide created after selection in the retained set", () => {
    const plan = planDowngradeGuideRetention({
      previousPlan: "PRACTICE",
      projectedPlan: "ESSENTIAL",
      cancellationSuperseded: false,
      transitionAt,
      limits: LIMITS,
      guides: [
        guide("kept_custom", "custom"),
        guide("kept_custom_2", "custom"),
        guide("kept_adapted", "adapted"),
        guide("kept_adapted_2", "adapted"),
        guide("new_custom", "custom"),
      ],
      confirmedSelectedIds: [
        "kept_custom",
        "kept_custom_2",
        "kept_adapted",
        "kept_adapted_2",
      ],
    });
    expect(plan.retainGuideIds).toEqual(["new_custom"]);
  });

  it("does not retain guides when cancellation supersedes the downgrade", () => {
    const plan = planDowngradeGuideRetention({
      previousPlan: "PRACTICE",
      projectedPlan: "PRACTICE",
      cancellationSuperseded: true,
      transitionAt,
      limits: LIMITS,
      guides: [guide("custom", "custom")],
      confirmedSelectedIds: [],
    });
    expect(plan.retainGuideIds).toEqual([]);
    expect(plan.clearPreparation).toBe(true);
  });

  it("keeps selected guides active when the confirmed set is unexpectedly over the limit", () => {
    const plan = planDowngradeGuideRetention({
      previousPlan: "PRACTICE",
      projectedPlan: "ESSENTIAL",
      cancellationSuperseded: false,
      transitionAt,
      limits: LIMITS,
      guides: many("custom", 4, "c"),
      confirmedSelectedIds: ["c_0", "c_1", "c_2"],
    });
    expect(plan.anomaly).toBe("invalid_selection");
    expect(plan.retainGuideIds).toEqual(["c_3"]);
  });

  it("does not move an existing retention clock on a repeated transition", () => {
    const firstUntil = downgradeRetentionUntilFrom(transitionAt);
    const already = guide("old", "custom", {
      downgradeRetainedAt: transitionAt,
      downgradeRetentionUntil: firstUntil,
    });
    const plan = planDowngradeGuideRetention({
      previousPlan: "ESSENTIAL",
      projectedPlan: "ESSENTIAL",
      cancellationSuperseded: false,
      transitionAt: new Date("2026-11-01T00:00:00.000Z"),
      limits: LIMITS,
      guides: [already, guide("kept", "custom")],
      confirmedSelectedIds: ["kept"],
    });
    expect(plan.retainGuideIds).toEqual([]);
    expect(plan.retentionUntil).toBeNull();
  });
});

describe("public downgrade retention", () => {
  const retainedAt = new Date("2026-10-22T00:00:00.000Z");
  const retentionUntil = downgradeRetentionUntilFrom(retainedAt);

  it("serves a published retained guide on day 0 and day 59, then stops", () => {
    expect(
      downgradeRetainedDirectUrlVisible({
        downgradeRetainedAt: retainedAt,
        downgradeRetentionUntil: retentionUntil,
        clinicGuidesRemainPublic: true,
        now: retainedAt,
      })
    ).toBe(true);
    expect(
      downgradeRetainedDirectUrlVisible({
        downgradeRetainedAt: retainedAt,
        downgradeRetentionUntil: retentionUntil,
        clinicGuidesRemainPublic: true,
        now: new Date(retentionUntil.getTime() - 1),
      })
    ).toBe(true);
    expect(
      downgradeRetainedDirectUrlVisible({
        downgradeRetainedAt: retainedAt,
        downgradeRetentionUntil: retentionUntil,
        clinicGuidesRemainPublic: true,
        now: retentionUntil,
      })
    ).toBe(false);
  });

  it("does not let clinic-level retention extend or bypass guide retention", () => {
    expect(
      downgradeRetainedDirectUrlVisible({
        downgradeRetainedAt: retainedAt,
        downgradeRetentionUntil: retentionUntil,
        clinicGuidesRemainPublic: false,
        now: retainedAt,
      })
    ).toBe(false);
    expect(
      downgradeRetainedDirectUrlVisible({
        downgradeRetainedAt: null,
        downgradeRetentionUntil: null,
        clinicGuidesRemainPublic: false,
        now: retainedAt,
      })
    ).toBe(false);
  });
});

describe("retained guide restore rules", () => {
  const now = new Date("2026-11-01T00:00:00.000Z");
  const guideRow = {
    ...guide("custom_1", "custom", {
      downgradeRetainedAt: new Date("2026-10-01T00:00:00.000Z"),
      downgradeRetentionUntil: new Date("2026-11-30T00:00:00.000Z"),
    }),
    clinicId: "clinic",
  };

  it("consumes custom and combined capacity while the window is open", () => {
    expect(
      assessGuideRestore({
        guide: guideRow,
        clinicId: "clinic",
        now,
        activeCustom: 1,
        activeAdapted: 1,
        limits: LIMITS,
        retentionOpen: true,
      })
    ).toMatchObject({ ok: true, consumes: "custom" });
    expect(
      assessGuideRestore({
        guide: guideRow,
        clinicId: "clinic",
        now,
        activeCustom: 2,
        activeAdapted: 0,
        limits: LIMITS,
        retentionOpen: true,
      })
    ).toMatchObject({ ok: false, code: "custom_limit" });
  });

  it("consumes edited-template capacity for an adapted guide", () => {
    expect(
      assessGuideRestore({
        guide: {
          ...guide("adapted_1", "adapted", {
            downgradeRetainedAt: guideRow.downgradeRetainedAt,
            downgradeRetentionUntil: guideRow.downgradeRetentionUntil,
          }),
          clinicId: "clinic",
        },
        clinicId: "clinic",
        now,
        activeCustom: 1,
        activeAdapted: 1,
        limits: LIMITS,
        retentionOpen: true,
      })
    ).toMatchObject({ ok: true, consumes: "adapted" });
  });

  it("blocks restore after the recovery period", () => {
    expect(
      assessGuideRestore({
        guide: guideRow,
        clinicId: "clinic",
        now,
        activeCustom: 0,
        activeAdapted: 0,
        limits: LIMITS,
        retentionOpen: false,
      })
    ).toMatchObject({ ok: false, code: "expired" });
  });
});

describe("operator extra changes during a downgrade", () => {
  it("blocks a scheduled reduction that invalidates the keep-set and unconfirms while preparing", () => {
    expect(
      assessOperatorExtraChangeForDowngrade({
        scheduled: true,
        preparationConfirmed: true,
        selectionFitsNextLimits: false,
        activeUsageFitsNextLimits: false,
      }).blocked
    ).toBe(true);
    expect(
      assessOperatorExtraChangeForDowngrade({
        scheduled: false,
        preparationConfirmed: true,
        selectionFitsNextLimits: false,
        activeUsageFitsNextLimits: false,
      })
    ).toMatchObject({ blocked: false, unconfirmSelection: true });
    expect(
      assessOperatorExtraChangeForDowngrade({
        scheduled: true,
        preparationConfirmed: true,
        selectionFitsNextLimits: true,
        activeUsageFitsNextLimits: false,
      }).blocked
    ).toBe(false);
  });
});

const PREFIX = "test_dg_sel_";
const CLINIC_ID = `${PREFIX}clinic`;
const OTHER_CLINIC_ID = `${PREFIX}other`;
const ADMIN_ID = `${PREFIX}admin`;
const STAFF_ID = `${PREFIX}staff`;
const OPERATOR_ID = `${PREFIX}operator`;
const TEMPLATE_ID = `${PREFIX}template`;

describe("downgrade guide selection persistence", () => {
  const prisma = getPrisma();

  async function cleanup() {
    await prisma.clinicDowngradePreparation.deleteMany({
      where: { clinicId: { in: [CLINIC_ID, OTHER_CLINIC_ID] } },
    });
    await prisma.practiceGuide.deleteMany({
      where: { clinicId: { in: [CLINIC_ID, OTHER_CLINIC_ID] } },
    });
    await prisma.clinicMembership.deleteMany({
      where: { clinicId: { in: [CLINIC_ID, OTHER_CLINIC_ID] } },
    });
    await prisma.clinicEntitlement.deleteMany({
      where: { clinicId: { in: [CLINIC_ID, OTHER_CLINIC_ID] } },
    });
    await prisma.clinicBillingProfile.deleteMany({
      where: { clinicId: { in: [CLINIC_ID, OTHER_CLINIC_ID] } },
    });
    await prisma.clinic.deleteMany({
      where: { id: { in: [CLINIC_ID, OTHER_CLINIC_ID] } },
    });
    await prisma.guideTemplate.deleteMany({ where: { id: TEMPLATE_ID } });
    await prisma.user.deleteMany({
      where: { id: { in: [ADMIN_ID, STAFF_ID, OPERATOR_ID] } },
    });
  }

  async function seedPractice() {
    await cleanup();
    await prisma.user.createMany({
      data: [
        {
          id: ADMIN_ID,
          email: `${PREFIX}admin@example.test`,
          name: "Admin",
        },
        {
          id: STAFF_ID,
          email: `${PREFIX}staff@example.test`,
          name: "Staff",
        },
        {
          id: OPERATOR_ID,
          email: `${PREFIX}operator@example.test`,
          name: "Operator",
          platformRole: PlatformRole.OPERATOR,
        },
      ],
    });
    await prisma.clinic.create({
      data: {
        id: CLINIC_ID,
        name: "Downgrade Selection Clinic",
        slug: "test-dg-sel-clinic",
      },
    });
    await prisma.clinicMembership.createMany({
      data: [
        {
          clinicId: CLINIC_ID,
          userId: ADMIN_ID,
          role: ClinicMembershipRole.ADMIN,
          active: true,
        },
        {
          clinicId: CLINIC_ID,
          userId: STAFF_ID,
          role: ClinicMembershipRole.STAFF,
          active: true,
        },
      ],
    });
    await prisma.clinicEntitlement.create({
      data: {
        clinicId: CLINIC_ID,
        commercialPlan: "PRACTICE",
        billingInterval: "MONTHLY",
        billingStatus: BillingStatus.ACTIVE,
        entitlementStatus: EntitlementStatus.ACTIVE,
        stripePriceId: "price_test_practice_monthly",
      },
    });
    await prisma.clinicBillingProfile.create({
      data: {
        clinicId: CLINIC_ID,
        stripeCustomerId: `${PREFIX}cus`,
        stripeSubscriptionId: `${PREFIX}sub`,
        stripeSubscriptionScheduleId: `${PREFIX}sched`,
      },
    });
    await prisma.guideTemplate.create({
      data: {
        id: TEMPLATE_ID,
        specialty: "DENTAL",
        slug: "test-dg-sel-template",
        title: "Source template",
      },
    });
  }

  async function createOwnedGuide(input: {
    id: string;
    title: string;
    slug: string;
    kind: "custom" | "adapted";
    status?: PracticeGuideStatus;
    retainedAt?: Date | null;
    retentionUntil?: Date | null;
  }) {
    return prisma.practiceGuide.create({
      data: {
        id: input.id,
        clinicId: CLINIC_ID,
        title: input.title,
        publicSlug: input.slug,
        status: input.status ?? PracticeGuideStatus.DRAFT,
        isEnabled: input.status === PracticeGuideStatus.PUBLISHED,
        guideTemplateId: null,
        sourceGuideTemplateId: input.kind === "adapted" ? TEMPLATE_ID : null,
        adaptedAt:
          input.kind === "adapted"
            ? new Date("2026-01-01T00:00:00.000Z")
            : null,
        downgradeRetainedAt: input.retainedAt ?? null,
        downgradeRetentionUntil: input.retentionUntil ?? null,
      },
    });
  }

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it("lets the clinic admin confirm a valid set and refuses staff and foreign guides", async () => {
    await seedPractice();
    await createOwnedGuide({
      id: `${PREFIX}c1`,
      title: "Custom one",
      slug: "custom-one",
      kind: "custom",
    });
    await createOwnedGuide({
      id: `${PREFIX}c2`,
      title: "Custom two",
      slug: "custom-two",
      kind: "custom",
    });
    await createOwnedGuide({
      id: `${PREFIX}c3`,
      title: "Custom three",
      slug: "custom-three",
      kind: "custom",
    });
    await createOwnedGuide({
      id: `${PREFIX}a1`,
      title: "Edited one",
      slug: "edited-one",
      kind: "adapted",
    });
    await createOwnedGuide({
      id: `${PREFIX}a2`,
      title: "Edited two",
      slug: "edited-two",
      kind: "adapted",
    });
    const prepared = await prepareClinicDowngrade({
      actorPlatformRole: PlatformRole.OPERATOR,
      clinicId: CLINIC_ID,
    });
    expect(prepared).toMatchObject({ ok: true, status: "awaiting" });
    const storedPrep =
      await prisma.clinicDowngradePreparation.findUniqueOrThrow({
        where: { clinicId: CLINIC_ID },
      });
    expect(storedPrep.confirmedAt).toBeNull();
    expect(storedPrep.status).toBe(
      DowngradePreparationStatus.AWAITING_SELECTION
    );

    const staff = await confirmClinicDowngradeSelection({
      actorUserId: STAFF_ID,
      clinicId: CLINIC_ID,
      selectedIds: [`${PREFIX}c1`],
    });
    expect(staff).toMatchObject({ ok: false, code: "forbidden" });

    const tooMany = await confirmClinicDowngradeSelection({
      actorUserId: ADMIN_ID,
      clinicId: CLINIC_ID,
      selectedIds: [`${PREFIX}c1`, `${PREFIX}c2`, `${PREFIX}c3`],
    });
    expect(tooMany.ok).toBe(false);

    const confirmed = await confirmClinicDowngradeSelection({
      actorUserId: ADMIN_ID,
      clinicId: CLINIC_ID,
      selectedIds: [`${PREFIX}c1`, `${PREFIX}c2`, `${PREFIX}a1`, `${PREFIX}a2`],
    });
    expect(confirmed).toMatchObject({
      ok: true,
      custom: 2,
      adapted: 2,
      combined: 4,
    });

    await prisma.clinic.create({
      data: {
        id: OTHER_CLINIC_ID,
        name: "Other",
        slug: "test-dg-sel-other",
      },
    });
    await prisma.practiceGuide.create({
      data: {
        id: `${PREFIX}foreign`,
        clinicId: OTHER_CLINIC_ID,
        title: "Foreign",
        publicSlug: "foreign",
      },
    });
    const foreign = await confirmClinicDowngradeSelection({
      actorUserId: ADMIN_ID,
      clinicId: CLINIC_ID,
      selectedIds: [`${PREFIX}foreign`],
    });
    expect(foreign).toMatchObject({ ok: false, code: "unknown_guide" });
    const still = await prisma.downgradeGuideSelection.findMany({
      where: { preparation: { clinicId: CLINIC_ID } },
    });
    expect(still).toHaveLength(4);
  });

  it("applies retention once and leaves the clock unchanged on replay", async () => {
    await seedPractice();
    const ids = ["c1", "c2", "c3", "a1", "a2", "a3"].map(
      (suffix) => `${PREFIX}${suffix}`
    );
    await createOwnedGuide({
      id: ids[0]!,
      title: "C1",
      slug: "c1",
      kind: "custom",
    });
    await createOwnedGuide({
      id: ids[1]!,
      title: "C2",
      slug: "c2",
      kind: "custom",
    });
    await createOwnedGuide({
      id: ids[2]!,
      title: "C3",
      slug: "c3",
      kind: "custom",
    });
    await createOwnedGuide({
      id: ids[3]!,
      title: "A1",
      slug: "a1",
      kind: "adapted",
    });
    await createOwnedGuide({
      id: ids[4]!,
      title: "A2",
      slug: "a2",
      kind: "adapted",
    });
    await createOwnedGuide({
      id: ids[5]!,
      title: "A3",
      slug: "a3",
      kind: "adapted",
    });
    await prisma.clinicDowngradePreparation.create({
      data: {
        clinicId: CLINIC_ID,
        targetPlan: "ESSENTIAL",
        status: DowngradePreparationStatus.SELECTION_CONFIRMED,
        confirmedAt: new Date("2026-10-01T00:00:00.000Z"),
        confirmedByUserId: ADMIN_ID,
        selections: {
          create: [{ practiceGuideId: ids[0]! }, { practiceGuideId: ids[3]! }],
        },
      },
    });
    const transitionAt = new Date("2026-10-22T01:00:00.000Z");
    const input = {
      db: prisma,
      clinicId: CLINIC_ID,
      previousPlan: "PRACTICE" as const,
      projectedPlan: "ESSENTIAL" as const,
      transitionAt,
      cancellationSuperseded: false,
    };
    await applyDowngradeGuideTransition(input);
    await applyDowngradeGuideTransition({
      ...input,
      transitionAt: new Date("2026-12-01T00:00:00.000Z"),
    });
    const rows = await prisma.practiceGuide.findMany({
      where: { clinicId: CLINIC_ID },
      orderBy: { publicSlug: "asc" },
    });
    const retained = rows.filter((row) => row.downgradeRetainedAt);
    expect(retained.map((row) => row.publicSlug).sort()).toEqual([
      "a2",
      "a3",
      "c2",
      "c3",
    ]);
    expect(
      retained.every(
        (row) =>
          row.downgradeRetainedAt?.toISOString() === transitionAt.toISOString()
      )
    ).toBe(true);
    expect(
      retained.every(
        (row) =>
          row.downgradeRetentionUntil?.toISOString() ===
          "2026-12-21T01:00:00.000Z"
      )
    ).toBe(true);
    expect(await countOriginalCustomGuides(prisma, CLINIC_ID)).toBe(1);
    expect(
      await prisma.clinicDowngradePreparation.findUnique({
        where: { clinicId: CLINIC_ID },
      })
    ).toBeNull();
    const kept = rows.find((row) => row.publicSlug === "c1");
    expect(kept?.downgradeRetainedAt).toBeNull();
  });

  it("keeps a published retained URL until the deadline and hides it from the clinic index", async () => {
    await seedPractice();
    const transitionAt = new Date("2026-10-22T00:00:00.000Z");
    const until = downgradeRetentionUntilFrom(transitionAt);
    const published = await prisma.practiceGuide.create({
      data: {
        clinicId: CLINIC_ID,
        title: "Published retained",
        publicSlug: "published-retained",
        status: PracticeGuideStatus.PUBLISHED,
        isEnabled: true,
        publishedAt: transitionAt,
        downgradeRetainedAt: transitionAt,
        downgradeRetentionUntil: until,
        contentRevisions: {
          create: {
            version: 1,
            status: GuideRevisionStatus.PUBLISHED,
            title: "Published retained",
            publishedAt: transitionAt,
            sections: {
              create: {
                key: "care",
                kind: GuideSectionKind.IMMEDIATE_CARE,
                title: "Care",
                body: "Rest.",
                sortOrder: 0,
                provenance: PracticeSectionProvenance.PRACTICE_CUSTOM,
              },
            },
          },
        },
      },
    });
    await prisma.practiceGuide.create({
      data: {
        clinicId: CLINIC_ID,
        title: "Draft retained",
        publicSlug: "draft-retained",
        status: PracticeGuideStatus.DRAFT,
        downgradeRetainedAt: transitionAt,
        downgradeRetentionUntil: until,
      },
    });
    const during = await getPublishedPracticeGuide({
      clinicSlug: "test-dg-sel-clinic",
      publicSlug: "published-retained",
      now: new Date(until.getTime() - 1),
    });
    expect(during?.title).toBe("Published retained");
    const expired = await getPublishedPracticeGuide({
      clinicSlug: "test-dg-sel-clinic",
      publicSlug: "published-retained",
      now: until,
    });
    expect(expired).toBeNull();
    const draft = await getPublishedPracticeGuide({
      clinicSlug: "test-dg-sel-clinic",
      publicSlug: "draft-retained",
      now: transitionAt,
    });
    expect(draft).toBeNull();
    const listed = await listPublishedPracticeGuides("test-dg-sel-clinic");
    expect(listed?.guides.map((row) => row.publicSlug)).not.toContain(
      "published-retained"
    );
    await expect(
      savePracticeGuideDraft({
        clinicId: CLINIC_ID,
        actorUserId: ADMIN_ID,
        values: {
          guideId: published.id,
          title: "Changed",
          publicSlug: "published-retained",
          introduction: "",
          sections: [],
        },
      })
    ).rejects.toBeInstanceOf(ClinicPortalError);
  });

  it("restores a retained guide when capacity exists and refuses an expired one", async () => {
    await seedPractice();
    const openUntil = new Date("2026-12-21T00:00:00.000Z");
    await createOwnedGuide({
      id: `${PREFIX}restore`,
      title: "Restore me",
      slug: "restore-me",
      kind: "custom",
      retainedAt: new Date("2026-10-22T00:00:00.000Z"),
      retentionUntil: openUntil,
    });
    const { restoreDowngradeRetainedGuide } =
      await import("@/lib/entitlements/downgrade-selection");
    const restored = await restoreDowngradeRetainedGuide({
      actorUserId: ADMIN_ID,
      clinicId: CLINIC_ID,
      guideId: `${PREFIX}restore`,
      now: new Date("2026-11-01T00:00:00.000Z"),
    });
    expect(restored.ok).toBe(true);
    const active = await prisma.practiceGuide.findUniqueOrThrow({
      where: { id: `${PREFIX}restore` },
    });
    expect(active.downgradeRetainedAt).toBeNull();
    expect(active.downgradeRetentionUntil).toBeNull();
    expect(active.sourceGuideTemplateId).toBeNull();

    await prisma.practiceGuide.update({
      where: { id: `${PREFIX}restore` },
      data: {
        downgradeRetainedAt: new Date("2026-01-01T00:00:00.000Z"),
        downgradeRetentionUntil: new Date("2026-03-02T00:00:00.000Z"),
      },
    });
    const expired = await restoreDowngradeRetainedGuide({
      actorUserId: ADMIN_ID,
      clinicId: CLINIC_ID,
      guideId: `${PREFIX}restore`,
      now: new Date("2026-04-01T00:00:00.000Z"),
    });
    expect(expired).toMatchObject({ ok: false, code: "expired" });
  });

  it("keeps a confirmed keep-set when scheduling fails", async () => {
    await seedPractice();
    await prisma.clinicBillingProfile.update({
      where: { clinicId: CLINIC_ID },
      data: {
        stripeSubscriptionScheduleId: null,
        stripePlanDowngradeAttemptId: null,
      },
    });
    await createOwnedGuide({
      id: `${PREFIX}keepfail`,
      title: "Keep",
      slug: "keep-fail",
      kind: "custom",
    });
    const confirmedAt = new Date("2026-10-01T00:00:00.000Z");
    await prisma.clinicDowngradePreparation.create({
      data: {
        clinicId: CLINIC_ID,
        targetPlan: "ESSENTIAL",
        status: DowngradePreparationStatus.SELECTION_CONFIRMED,
        confirmedAt,
        confirmedByUserId: ADMIN_ID,
        selections: { create: [{ practiceGuideId: `${PREFIX}keepfail` }] },
      },
    });
    const readiness = assessEssentialDowngradeReadiness({
      occupiedTeamPlaces: 1,
      customGuideCount: 4,
      adaptedTemplateCount: 1,
      extras: { teamMembers: 0, customGuides: 0, templateAdaptations: 0 },
    });
    const downgradeState = {
      clinicId: CLINIC_ID,
      commercialPlan: "PRACTICE" as const,
      billingInterval: "MONTHLY" as const,
      entitlementStatus: EntitlementStatus.ACTIVE,
      billingStatus: BillingStatus.ACTIVE,
      cancelAtPeriodEnd: false,
      stripeSubscriptionId: `${PREFIX}sub`,
      stripeSubscriptionScheduleId: null,
      stripePlanDowngradeAttemptId: `${PREFIX}attempt`,
      stripeCheckoutSessionId: null,
      scheduledCommercialPlan: null,
      scheduledPlanEffectiveAt: null,
    };
    const guideSelection = {
      confirmed: true as const,
      customCount: 1,
      adaptedCount: 0,
      combinedCount: 1,
    };
    const subscription = {
      id: `${PREFIX}sub`,
      status: "active",
      scheduleId: null as string | null,
      cancelAtPeriodEnd: false,
      itemCount: 1,
      itemId: "si",
      priceId: "price_test_practice_monthly",
      quantity: 1,
      periodEnd: 1_792_647_594,
      discountsPresent: false,
      trialPresent: false,
      taxRatesPresent: false,
    };
    const failures = [
      {
        create: async () => {
          throw new Error("create failed");
        },
        update: async () => {
          throw new Error("not reached");
        },
      },
      {
        create: async () => {
          subscription.scheduleId = `${PREFIX}sched`;
          return {
            id: `${PREFIX}sched`,
            status: "active",
            endBehavior: "release",
            subscriptionId: `${PREFIX}sub`,
            releasedSubscriptionId: null,
            metadataClinicId: null,
            metadataPurpose: null,
            metadataAttemptId: null,
            phases: [
              {
                priceId: "price_test_practice_monthly",
                quantity: 1,
                startDate: 1_761_169_194,
                endDate: 1_792_647_594,
                prorationBehavior: "none",
                billingCycleAnchor: null,
                hasExtras: false,
              },
            ],
          };
        },
        update: async () => {
          throw new Error("update failed");
        },
      },
      {
        create: async () => ({
          id: "sub_sched_replayed",
          status: "active",
          endBehavior: "release",
          subscriptionId: `${PREFIX}sub`,
          releasedSubscriptionId: null,
          metadataClinicId: CLINIC_ID,
          metadataPurpose: "practice_to_essential",
          metadataAttemptId: `${PREFIX}attempt`,
          phases: [
            {
              priceId: "price_test_practice_monthly",
              quantity: 1,
              startDate: 1_761_169_194,
              endDate: 1_792_647_594,
              prorationBehavior: "none",
              billingCycleAnchor: null,
              hasExtras: false,
            },
          ],
        }),
        update: async () => {
          throw new Error("must not update a schedule that is not attached");
        },
      },
      {
        create: async () => {
          subscription.scheduleId = `${PREFIX}sched-invalid`;
          return {
            id: `${PREFIX}sched-invalid`,
            status: "active",
            endBehavior: "release",
            subscriptionId: `${PREFIX}sub`,
            releasedSubscriptionId: null,
            metadataClinicId: null,
            metadataPurpose: null,
            metadataAttemptId: null,
            phases: [
              {
                priceId: "price_test_practice_monthly",
                quantity: 1,
                startDate: 1_761_169_194,
                endDate: 1_792_647_594,
                prorationBehavior: "none",
                billingCycleAnchor: null,
                hasExtras: false,
              },
            ],
          };
        },
        update: async () => ({
          id: `${PREFIX}sched-invalid`,
          status: "active",
          endBehavior: "release",
          subscriptionId: `${PREFIX}sub`,
          releasedSubscriptionId: null,
          metadataClinicId: CLINIC_ID,
          metadataPurpose: "practice_to_essential",
          metadataAttemptId: `${PREFIX}attempt`,
          phases: [],
        }),
      },
    ];
    for (const failure of failures) {
      subscription.scheduleId = null;
      const result = await executeOperatorPlanDowngrade({
        state: downgradeState,
        readiness,
        guideSelection,
        env: BILLING_TEST_ENV,
        ensureAttempt: async () => ({
          attemptId: `${PREFIX}attempt`,
          created: false,
        }),
        clearProjection: async () => undefined,
        persist: async () => {
          throw new Error("must not persist");
        },
        stripe: {
          subscriptions: {
            async retrieve() {
              return subscription;
            },
          },
          subscriptionSchedules: {
            create: failure.create,
            async retrieve() {
              return {
                id: subscription.scheduleId ?? "missing",
                status: "active",
                endBehavior: "release",
                subscriptionId: `${PREFIX}sub`,
                releasedSubscriptionId: null,
                metadataClinicId: null,
                metadataPurpose: null,
                metadataAttemptId: null,
                phases: [
                  {
                    priceId: "price_test_practice_monthly",
                    quantity: 1,
                    startDate: 1_761_169_194,
                    endDate: 1_792_647_594,
                    prorationBehavior: "create_prorations",
                    billingCycleAnchor: null,
                    hasExtras: false,
                  },
                ],
              };
            },
            update: failure.update,
            async release() {
              throw new Error("must not release");
            },
          },
        },
      });
      expect(result).toMatchObject({ ok: false, code: "schedule_failed" });
      const preparation = await prisma.clinicDowngradePreparation.findUnique({
        where: { clinicId: CLINIC_ID },
        include: { selections: true },
      });
      expect(preparation?.status).toBe(
        DowngradePreparationStatus.SELECTION_CONFIRMED
      );
      expect(preparation?.confirmedAt).toEqual(confirmedAt);
      expect(preparation?.confirmedByUserId).toBe(ADMIN_ID);
      expect(preparation?.selections).toHaveLength(1);
      const entitlement = await prisma.clinicEntitlement.findUniqueOrThrow({
        where: { clinicId: CLINIC_ID },
      });
      expect(entitlement.commercialPlan).toBe("PRACTICE");
      expect(entitlement.scheduledCommercialPlan).toBeNull();
      const guide = await prisma.practiceGuide.findUniqueOrThrow({
        where: { id: `${PREFIX}keepfail` },
      });
      expect(guide.downgradeRetainedAt).toBeNull();
    }
  });

  it("clears preparation on Keep Practice and does not retain guides", async () => {
    await seedPractice();
    await createOwnedGuide({
      id: `${PREFIX}stay`,
      title: "Stay",
      slug: "stay",
      kind: "custom",
    });
    await prisma.clinicEntitlement.update({
      where: { clinicId: CLINIC_ID },
      data: {
        scheduledCommercialPlan: "ESSENTIAL",
        scheduledPlanEffectiveAt: new Date("2026-10-22T00:00:00.000Z"),
      },
    });
    await prisma.clinicDowngradePreparation.create({
      data: {
        clinicId: CLINIC_ID,
        targetPlan: "ESSENTIAL",
        status: DowngradePreparationStatus.SELECTION_CONFIRMED,
        confirmedAt: new Date("2026-10-01T00:00:00.000Z"),
        confirmedByUserId: ADMIN_ID,
        selections: { create: [{ practiceGuideId: `${PREFIX}stay` }] },
      },
    });
    const result = await executeOperatorDowngradeReversal({
      state: {
        clinicId: CLINIC_ID,
        commercialPlan: "PRACTICE",
        billingInterval: "MONTHLY",
        entitlementStatus: EntitlementStatus.ACTIVE,
        billingStatus: BillingStatus.ACTIVE,
        cancelAtPeriodEnd: false,
        stripeSubscriptionId: `${PREFIX}sub`,
        stripeSubscriptionScheduleId: `${PREFIX}sched`,
        stripePlanDowngradeAttemptId: `${PREFIX}attempt`,
        stripeCheckoutSessionId: null,
        scheduledCommercialPlan: "ESSENTIAL",
        scheduledPlanEffectiveAt: new Date("2026-10-22T00:00:00.000Z"),
      },
      env: BILLING_TEST_ENV,
      stripe: (() => {
        let scheduleId: string | null = `${PREFIX}sched`;
        let released = false;
        const schedule = () => ({
          id: `${PREFIX}sched`,
          status: released ? "released" : "active",
          endBehavior: "release",
          subscriptionId: released ? null : `${PREFIX}sub`,
          releasedSubscriptionId: released ? `${PREFIX}sub` : null,
          metadataClinicId: CLINIC_ID,
          metadataPurpose: "practice_to_essential",
          metadataAttemptId: `${PREFIX}attempt`,
          phases: [],
        });
        return {
          subscriptions: {
            async retrieve() {
              return {
                id: `${PREFIX}sub`,
                status: "active",
                scheduleId,
                cancelAtPeriodEnd: false,
                itemCount: 1,
                itemId: "si",
                priceId: "price_test_practice_monthly",
                quantity: 1,
                periodEnd: 1_792_647_594,
                discountsPresent: false,
                trialPresent: false,
                taxRatesPresent: false,
              };
            },
          },
          subscriptionSchedules: {
            async create() {
              throw new Error("not used");
            },
            async retrieve() {
              return schedule();
            },
            async update() {
              throw new Error("not used");
            },
            async release() {
              released = true;
              scheduleId = null;
              return schedule();
            },
          },
        };
      })(),
    });
    expect(result.ok).toBe(true);
    expect(
      await prisma.clinicDowngradePreparation.findUnique({
        where: { clinicId: CLINIC_ID },
      })
    ).toBeNull();
    const guideRow = await prisma.practiceGuide.findUniqueOrThrow({
      where: { id: `${PREFIX}stay` },
    });
    expect(guideRow.downgradeRetainedAt).toBeNull();
  });

  it("refuses an extra reduction that would invalidate a scheduled keep-set", async () => {
    await seedPractice();
    await createOwnedGuide({
      id: `${PREFIX}extra`,
      title: "Extra",
      slug: "extra",
      kind: "custom",
    });
    await prisma.clinicEntitlement.update({
      where: { clinicId: CLINIC_ID },
      data: {
        extraCustomGuideAllowance: 1,
        scheduledCommercialPlan: "ESSENTIAL",
        scheduledPlanEffectiveAt: new Date("2026-10-22T00:00:00.000Z"),
      },
    });
    await prisma.clinicDowngradePreparation.create({
      data: {
        clinicId: CLINIC_ID,
        targetPlan: "ESSENTIAL",
        status: DowngradePreparationStatus.SELECTION_CONFIRMED,
        confirmedAt: new Date("2026-10-01T00:00:00.000Z"),
        confirmedByUserId: ADMIN_ID,
        selections: { create: [{ practiceGuideId: `${PREFIX}extra` }] },
      },
    });
    await prisma.practiceGuide.create({
      data: {
        id: `${PREFIX}extra2`,
        clinicId: CLINIC_ID,
        title: "Second",
        publicSlug: "second-custom",
      },
    });
    await prisma.practiceGuide.create({
      data: {
        id: `${PREFIX}extra3`,
        clinicId: CLINIC_ID,
        title: "Third",
        publicSlug: "third-custom",
      },
    });
    await prisma.downgradeGuideSelection.createMany({
      data: [
        {
          preparationId: (
            await prisma.clinicDowngradePreparation.findUniqueOrThrow({
              where: { clinicId: CLINIC_ID },
            })
          ).id,
          practiceGuideId: `${PREFIX}extra2`,
        },
        {
          preparationId: (
            await prisma.clinicDowngradePreparation.findUniqueOrThrow({
              where: { clinicId: CLINIC_ID },
            })
          ).id,
          practiceGuideId: `${PREFIX}extra3`,
        },
      ],
    });
    const blocked = await updateOperatorAllowanceExtras({
      actorUserId: OPERATOR_ID,
      actorPlatformRole: PlatformRole.OPERATOR,
      clinicId: CLINIC_ID,
      extras: { teamMembers: 0, customGuides: 0, templateAdaptations: 0 },
    });
    expect(blocked.ok).toBe(false);
    const entitlement = await prisma.clinicEntitlement.findUniqueOrThrow({
      where: { clinicId: CLINIC_ID },
    });
    expect(entitlement.extraCustomGuideAllowance).toBe(1);
    const preparation =
      await prisma.clinicDowngradePreparation.findUniqueOrThrow({
        where: { clinicId: CLINIC_ID },
      });
    expect(preparation.status).toBe(
      DowngradePreparationStatus.SELECTION_CONFIRMED
    );
  });
});
