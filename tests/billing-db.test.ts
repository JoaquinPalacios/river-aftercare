import "dotenv/config";

import {
  BillingStatus,
  EntitlementStatus,
  StripeEventProcessingStatus,
} from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";

import { getPrisma } from "@/lib/prisma";

const hasDatabase = Boolean(process.env.DATABASE_URL?.trim());

const describeDb = hasDatabase ? describe : describe.skip;

const PREFIX = "test_billing_phase1_";
const CLINIC_A = `${PREFIX}clinic_a`;
const CLINIC_B = `${PREFIX}clinic_b`;

describeDb("billing persistence constraints", () => {
  function prisma() {
    return getPrisma();
  }

  async function cleanup() {
    await prisma().stripeEventReceipt.deleteMany({
      where: { stripeEventId: { startsWith: `${PREFIX}evt_` } },
    });
    await prisma().clinicEntitlement.deleteMany({
      where: { clinicId: { in: [CLINIC_A, CLINIC_B] } },
    });
    await prisma().clinicBillingProfile.deleteMany({
      where: { clinicId: { in: [CLINIC_A, CLINIC_B] } },
    });
    await prisma().clinic.deleteMany({
      where: { id: { in: [CLINIC_A, CLINIC_B] } },
    });
  }

  afterAll(async () => {
    if (!hasDatabase) {
      return;
    }
    await cleanup();
    await prisma().$disconnect();
  });

  it("allows an existing clinic without billing rows and does not treat it as paid", async () => {
    await cleanup();
    await prisma().clinic.create({
      data: {
        id: CLINIC_A,
        name: "Billing Phase 1 Clinic A",
        slug: `${PREFIX}a`,
      },
    });

    const clinic = await prisma().clinic.findUnique({
      where: { id: CLINIC_A },
      include: { billingProfile: true, entitlement: true },
    });
    expect(clinic).not.toBeNull();
    expect(clinic?.billingProfile).toBeNull();
    expect(clinic?.entitlement).toBeNull();
  });

  it("enforces one billing profile and one entitlement projection per clinic", async () => {
    await cleanup();
    await prisma().clinic.create({
      data: {
        id: CLINIC_A,
        name: "Billing Phase 1 Clinic A",
        slug: `${PREFIX}a`,
      },
    });

    await prisma().clinicBillingProfile.create({
      data: { clinicId: CLINIC_A },
    });
    await expect(
      prisma().clinicBillingProfile.create({
        data: { clinicId: CLINIC_A },
      })
    ).rejects.toMatchObject({ code: "P2002" });

    await prisma().clinicEntitlement.create({
      data: {
        clinicId: CLINIC_A,
        billingStatus: BillingStatus.PAYMENT_PENDING,
        entitlementStatus: EntitlementStatus.PENDING,
      },
    });
    await expect(
      prisma().clinicEntitlement.create({
        data: {
          clinicId: CLINIC_A,
          billingStatus: BillingStatus.ACTIVE,
          entitlementStatus: EntitlementStatus.ACTIVE,
        },
      })
    ).rejects.toMatchObject({ code: "P2002" });

    const entitlement = await prisma().clinicEntitlement.findUnique({
      where: { clinicId: CLINIC_A },
    });
    expect(entitlement?.entitlementStatus).toBe(EntitlementStatus.PENDING);
    expect(entitlement?.commercialPlan).toBeNull();
  });

  it("enforces unique Stripe customer, subscription, and event IDs", async () => {
    await cleanup();
    await prisma().clinic.createMany({
      data: [
        {
          id: CLINIC_A,
          name: "Billing Phase 1 Clinic A",
          slug: `${PREFIX}a`,
        },
        {
          id: CLINIC_B,
          name: "Billing Phase 1 Clinic B",
          slug: `${PREFIX}b`,
        },
      ],
    });

    await prisma().clinicBillingProfile.create({
      data: {
        clinicId: CLINIC_A,
        stripeCustomerId: `${PREFIX}cus_1`,
        stripeSubscriptionId: `${PREFIX}sub_1`,
      },
    });
    await prisma().clinicBillingProfile.create({
      data: { clinicId: CLINIC_B },
    });

    await expect(
      prisma().clinicBillingProfile.update({
        where: { clinicId: CLINIC_B },
        data: { stripeCustomerId: `${PREFIX}cus_1` },
      })
    ).rejects.toMatchObject({ code: "P2002" });
    await expect(
      prisma().clinicBillingProfile.update({
        where: { clinicId: CLINIC_B },
        data: { stripeSubscriptionId: `${PREFIX}sub_1` },
      })
    ).rejects.toMatchObject({ code: "P2002" });

    await prisma().stripeEventReceipt.create({
      data: {
        stripeEventId: `${PREFIX}evt_1`,
        eventType: "invoice.paid",
        processingStatus: StripeEventProcessingStatus.PROCESSED,
      },
    });
    await expect(
      prisma().stripeEventReceipt.create({
        data: {
          stripeEventId: `${PREFIX}evt_1`,
          eventType: "invoice.paid",
        },
      })
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("allows multiple clinics with null Stripe identifiers", async () => {
    await cleanup();
    await prisma().clinic.createMany({
      data: [
        {
          id: CLINIC_A,
          name: "Billing Phase 1 Clinic A",
          slug: `${PREFIX}a`,
        },
        {
          id: CLINIC_B,
          name: "Billing Phase 1 Clinic B",
          slug: `${PREFIX}b`,
        },
      ],
    });
    await prisma().clinicBillingProfile.create({
      data: { clinicId: CLINIC_A },
    });
    await prisma().clinicBillingProfile.create({
      data: { clinicId: CLINIC_B },
    });

    const rows = await prisma().clinicBillingProfile.findMany({
      where: { clinicId: { in: [CLINIC_A, CLINIC_B] } },
    });
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.stripeCustomerId === null)).toBe(true);
    expect(rows.every((row) => row.stripeSubscriptionId === null)).toBe(true);
    expect(rows.every((row) => row.abn === null && row.acn === null)).toBe(
      true
    );
  });
});
