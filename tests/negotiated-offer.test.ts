import "dotenv/config";

import {
  BillingStatus,
  ClinicMembershipRole,
  EntitlementStatus,
  PlatformRole,
  PracticeGuideStatus,
} from "@prisma/client";
import type Stripe from "stripe";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createAccountSplitPreparation } from "@/lib/account-split/preparation";
import { assertClinicCheckoutActor } from "@/lib/billing/checkout";
import {
  extendComplimentaryAccess,
  grantComplimentaryAccess,
} from "@/lib/billing/complimentary-access";
import {
  ensureNegotiatedStripePrice,
  NEGOTIATED_SPLIT_BLOCK,
  prepareNegotiatedOffer,
  startNegotiatedCheckout,
  withdrawNegotiatedOffer,
  type NegotiatedStripePort,
} from "@/lib/billing/negotiated-offer";
import { processVerifiedStripeEvent } from "@/lib/billing/webhook-processor";
import { ClinicPortalError } from "@/lib/clinic-portal/errors";
import {
  PRIVACY_ACKNOWLEDGEMENT_VERSION,
  TERMS_ACCEPTANCE_VERSION,
} from "@/lib/legal/status";
import { getPrisma } from "@/lib/prisma";
import { BILLING_TEST_ENV } from "./helpers/billing";

const prisma = getPrisma();
const PREFIX = "test_neg_price_";
const NOW = new Date("2026-10-05T01:00:00.000Z");

function id(label: string) {
  return `${PREFIX}${label}`;
}

function offerInput(clinicId: string, overrides: Record<string, unknown> = {}) {
  return {
    clinicId,
    actorUserId: id("operator"),
    actorPlatformRole: PlatformRole.OPERATOR,
    billingInterval: "MONTHLY",
    amount: "49.00",
    startMode: "CUSTOMER_INITIATED",
    billingStartDate: "",
    commercialTerms: "A$49 per month. The price does not increase.",
    now: NOW,
    ...overrides,
  };
}

async function cleanup() {
  await prisma.stripeEventReceipt.deleteMany({
    where: { stripeEventId: { startsWith: "evt_neg_db_" } },
  });
  await prisma.clinicAccountSplitPreparation.deleteMany({
    where: {
      OR: [
        { sourceClinicId: { startsWith: PREFIX } },
        { destinationClinicId: { startsWith: PREFIX } },
      ],
    },
  });
  await prisma.clinic.deleteMany({ where: { id: { startsWith: PREFIX } } });
  await prisma.user.deleteMany({ where: { id: { startsWith: PREFIX } } });
}

async function createOperator() {
  await prisma.user.create({
    data: {
      id: id("operator"),
      email: `${id("operator")}@example.test`,
      name: "River Operator",
      platformRole: PlatformRole.OPERATOR,
    },
  });
}

async function complimentaryClinic(
  label: string,
  plan: "ESSENTIAL" | "PRACTICE"
) {
  const clinic = await prisma.clinic.create({
    data: {
      id: id(label),
      name: label,
      slug: `neg-${label}`,
    },
  });
  const granted = await grantComplimentaryAccess({
    actorUserId: id("operator"),
    actorPlatformRole: PlatformRole.OPERATOR,
    clinicId: clinic.id,
    commercialPlan: plan,
    duration: "SIX_MONTHS",
    reason: "Teaching collaboration",
    now: NOW,
  });
  expect(granted.ok).toBe(true);
  return clinic;
}

describe("negotiated Stripe prices", () => {
  it("creates one account price and reuses it for the same amount", async () => {
    const created: unknown[] = [];
    const price = {
      id: "price_neg_49",
      active: true,
      currency: "aud",
      unit_amount: 4900,
      product: "prod_essential",
      recurring: { interval: "month" },
    };
    let listed = false;
    const stripe: NegotiatedStripePort = {
      prices: {
        retrieve: async () => ({
          id: "price_test_essential_monthly",
          product: "prod_essential",
          currency: "aud",
          unit_amount: 7900,
          recurring: { interval: "month" },
        }),
        list: async () => {
          if (!listed) {
            listed = true;
            return { data: [] };
          }
          return { data: [price] };
        },
        create: async (params, options) => {
          created.push({ params, options });
          return price;
        },
      },
      customers: {
        create: async () => ({ id: "cus" }),
        update: async () => ({ id: "cus" }),
      },
      checkout: {
        sessions: {
          create: async () => ({ id: "cs", url: null, status: "open" }),
          retrieve: async () => ({ id: "cs", url: null, status: "open" }),
          expire: async () => ({}),
        },
      },
    };
    const first = await ensureNegotiatedStripePrice({
      stripe,
      catalogPriceId: "price_test_essential_monthly",
      clinicId: "clinic_1",
      offerId: "offer_1",
      commercialPlan: "ESSENTIAL",
      billingInterval: "MONTHLY",
      amountCents: 4900,
    });
    const second = await ensureNegotiatedStripePrice({
      stripe,
      catalogPriceId: "price_test_essential_monthly",
      clinicId: "clinic_1",
      offerId: "offer_1",
      commercialPlan: "ESSENTIAL",
      billingInterval: "MONTHLY",
      amountCents: 4900,
    });
    expect(first).toEqual({
      ok: true,
      priceId: "price_neg_49",
      productId: "prod_essential",
    });
    expect(second).toEqual(first);
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      params: {
        currency: "aud",
        unit_amount: 4900,
        product: "prod_essential",
        recurring: { interval: "month" },
        lookup_key: "river-negotiated-clinic_1-ESSENTIAL-MONTHLY-4900",
        tax_behavior: "unspecified",
      },
      options: {
        idempotencyKey:
          "river-price-river-negotiated-clinic_1-ESSENTIAL-MONTHLY-4900",
      },
    });
  });
});

describe("negotiated offers", () => {
  beforeAll(async () => {
    await cleanup();
    await createOperator();
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it("refuses anyone who is not a platform operator, and refuses staff payment", async () => {
    const clinic = await complimentaryClinic("auth", "ESSENTIAL");
    const denied = await prepareNegotiatedOffer({
      ...offerInput(clinic.id),
      actorPlatformRole: PlatformRole.NONE,
    });
    expect(denied).toEqual({
      ok: false,
      error: "Only a platform operator can prepare a negotiated price.",
    });
    expect(
      assertClinicCheckoutActor({
        role: "STAFF",
        membershipSource: "membership",
        sessionClinicId: clinic.id,
        submittedClinicId: clinic.id,
      })
    ).toEqual({ ok: false, code: "staff_forbidden" });
    expect(
      assertClinicCheckoutActor({
        role: "ADMIN",
        membershipSource: "operator_support",
        sessionClinicId: clinic.id,
        submittedClinicId: clinic.id,
      })
    ).toEqual({ ok: false, code: "operator_forbidden" });
    expect(
      await prisma.clinicNegotiatedOffer.count({
        where: { clinicId: clinic.id },
      })
    ).toBe(0);
  });

  it("stores monthly and annual cents without a new functional plan", async () => {
    const monthly = await complimentaryClinic("monthly", "ESSENTIAL");
    const prepared = await prepareNegotiatedOffer(offerInput(monthly.id));
    expect(prepared.ok).toBe(true);
    const row = await prisma.clinicNegotiatedOffer.findFirstOrThrow({
      where: { clinicId: monthly.id, status: "PREPARED" },
    });
    expect(row).toMatchObject({
      commercialPlan: "ESSENTIAL",
      billingInterval: "MONTHLY",
      amountCents: 4900,
      currency: "aud",
      taxTreatment: "NO_GST",
      startMode: "CUSTOMER_INITIATED",
      billingStartsAt: null,
    });
    expect(row.stripePriceId).toBeNull();

    const annual = await complimentaryClinic("annual", "PRACTICE");
    const yearly = await prepareNegotiatedOffer({
      ...offerInput(annual.id),
      billingInterval: "YEARLY",
      amount: "A$499",
      startMode: "AGREED_DATE",
      billingStartDate: "2026-11-02",
      commercialTerms: "A$499 per year until a later written change.",
    });
    expect(yearly.ok).toBe(true);
    const annualRow = await prisma.clinicNegotiatedOffer.findFirstOrThrow({
      where: { clinicId: annual.id, status: "PREPARED" },
    });
    expect(annualRow).toMatchObject({
      commercialPlan: "PRACTICE",
      billingInterval: "YEARLY",
      amountCents: 49900,
    });
    expect(annualRow.billingStartsAt).not.toBeNull();
    const entitlement = await prisma.clinicEntitlement.findUniqueOrThrow({
      where: { clinicId: annual.id },
    });
    expect(entitlement).toMatchObject({
      commercialPlan: "PRACTICE",
      commercialArrangement: "COMPLIMENTARY",
      billingStatus: BillingStatus.NOT_BILLED,
    });
  });

  it("keeps one open offer, blocks complimentary changes, and preserves the clinic", async () => {
    const clinic = await complimentaryClinic("history", "ESSENTIAL");
    const site = await prisma.clinicSite.create({
      data: {
        clinicId: clinic.id,
        name: "Main",
        slug: "neg-history-site",
        displayName: "Main",
        isPrimary: true,
        primaryColor: "#112233",
      },
    });
    const admin = await prisma.user.create({
      data: {
        id: id("history-admin"),
        email: `${id("history-admin")}@example.test`,
        name: "Admin",
      },
    });
    await prisma.clinicMembership.create({
      data: {
        clinicId: clinic.id,
        userId: admin.id,
        role: ClinicMembershipRole.ADMIN,
      },
    });
    const guide = await prisma.practiceGuide.create({
      data: {
        clinicId: clinic.id,
        title: "After extraction",
        publicSlug: "after-extraction",
        status: PracticeGuideStatus.PUBLISHED,
        isEnabled: true,
        publishedAt: NOW,
      },
    });
    const first = await prepareNegotiatedOffer(
      offerInput(clinic.id, { amount: "59" })
    );
    const second = await prepareNegotiatedOffer(
      offerInput(clinic.id, { amount: "49" })
    );
    expect(first.ok && second.ok).toBe(true);
    const rows = await prisma.clinicNegotiatedOffer.findMany({
      where: { clinicId: clinic.id },
      orderBy: { createdAt: "asc" },
    });
    expect(rows.map((row) => [row.amountCents, row.status])).toEqual([
      [5900, "WITHDRAWN"],
      [4900, "PREPARED"],
    ]);
    const blocked = await extendComplimentaryAccess({
      actorUserId: id("operator"),
      actorPlatformRole: PlatformRole.OPERATOR,
      clinicId: clinic.id,
      duration: "TWELVE_MONTHS",
      reason: "Another semester",
      now: NOW,
    });
    expect(blocked).toEqual({
      ok: false,
      error:
        "A negotiated price is open for this clinic. Withdraw it before changing complimentary access.",
    });
    expect(
      await prisma.clinicSite.findUnique({ where: { id: site.id } })
    ).toMatchObject({
      displayName: "Main",
      primaryColor: "#112233",
    });
    expect(
      await prisma.practiceGuide.findUnique({ where: { id: guide.id } })
    ).toMatchObject({
      title: "After extraction",
      status: PracticeGuideStatus.PUBLISHED,
    });
    expect(
      await prisma.clinicMembership.count({ where: { clinicId: clinic.id } })
    ).toBe(1);
    expect(
      await prisma.clinicComplimentaryAccessEvent.count({
        where: { clinicId: clinic.id },
      })
    ).toBe(1);
  });

  it("serializes concurrent prepares to one open offer", async () => {
    const clinic = await complimentaryClinic("race", "ESSENTIAL");
    const results = await Promise.all([
      prepareNegotiatedOffer(offerInput(clinic.id, { amount: "49" })),
      prepareNegotiatedOffer(offerInput(clinic.id, { amount: "59" })),
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(2);
    const open = await prisma.clinicNegotiatedOffer.findMany({
      where: {
        clinicId: clinic.id,
        status: { in: ["PREPARED", "CHECKOUT_OPEN"] },
      },
    });
    expect(open).toHaveLength(1);
    expect([4900, 5900]).toContain(open[0]?.amountCents);
  });

  it("refuses an offer while a paid subscription or an account split would conflict", async () => {
    const paid = await complimentaryClinic("paid", "ESSENTIAL");
    await prisma.clinicBillingProfile.create({
      data: { clinicId: paid.id, stripeSubscriptionId: id("sub-paid") },
    });
    expect(await prepareNegotiatedOffer(offerInput(paid.id))).toMatchObject({
      ok: false,
    });

    const source = await complimentaryClinic("split", "ESSENTIAL");
    await prepareNegotiatedOffer(offerInput(source.id));
    await expect(
      createAccountSplitPreparation({
        sourceClinicId: source.id,
        keptClinicSiteId: "missing-site",
        destinationPlan: "ESSENTIAL",
        destinationBillingInterval: "MONTHLY",
        operatorUserId: id("operator"),
      })
    ).rejects.toThrow(NEGOTIATED_SPLIT_BLOCK);
    await expect(
      createAccountSplitPreparation({
        sourceClinicId: source.id,
        keptClinicSiteId: "missing-site",
        destinationPlan: "ESSENTIAL",
        destinationBillingInterval: "MONTHLY",
        operatorUserId: id("operator"),
      })
    ).rejects.toBeInstanceOf(ClinicPortalError);
    expect(
      await prisma.clinicAccountSplitPreparation.count({
        where: { sourceClinicId: source.id },
      })
    ).toBe(0);
  });

  it("requires accepted terms and uses the stored price for Checkout", async () => {
    const clinic = await complimentaryClinic("checkout", "ESSENTIAL");
    const admin = await prisma.user.create({
      data: {
        id: id("checkout-admin"),
        email: `${id("checkout-admin")}@example.test`,
        name: "Admin",
      },
    });
    await prisma.clinicMembership.create({
      data: {
        clinicId: clinic.id,
        userId: admin.id,
        role: ClinicMembershipRole.ADMIN,
      },
    });
    await prisma.legalAcceptance.create({
      data: {
        clinicId: clinic.id,
        userId: admin.id,
        termsVersion: TERMS_ACCEPTANCE_VERSION,
        privacyVersionAcknowledged: PRIVACY_ACKNOWLEDGEMENT_VERSION,
        source: "BILLING_CHECKOUT",
      },
    });
    await prisma.clinicBillingProfile.create({
      data: {
        clinicId: clinic.id,
        legalEntityName: "River Dental",
        billingEmail: "billing@example.test",
        addressLine1: "1 River Street",
        city: "Sydney",
        region: "NSW",
        postalCode: "2000",
        country: "AU",
      },
    });
    const prepared = await prepareNegotiatedOffer(
      offerInput(clinic.id, {
        commercialTerms: "A$49 per month until a later written change.",
      })
    );
    expect(prepared.ok).toBe(true);

    const calls: Array<{
      subscriptionKeys: string[];
      key?: string;
    }> = [];
    let sessionSeq = 0;
    const sessions = new Map<
      string,
      { id: string; url: string; status: string; priceId: string }
    >();
    const stripe = fakeCheckoutStripe({
      onCreate(params, options) {
        calls.push({
          subscriptionKeys: Object.keys(params.subscription_data),
          key: options?.idempotencyKey,
        });
        sessionSeq += 1;
        const id = `cs_neg_${sessionSeq}`;
        const session = {
          id,
          url: `https://checkout.stripe.com/c/pay/${id}`,
          status: "open",
          priceId: params.line_items[0]?.price ?? "",
        };
        sessions.set(id, session);
        return session;
      },
      onRetrieve(sessionId) {
        return sessions.get(sessionId) ?? null;
      },
    });
    const missingTerms = await startNegotiatedCheckout({
      clinicId: clinic.id,
      userId: admin.id,
      acceptNegotiatedTerms: false,
      successUrl: "https://app.example/account/billing/complete",
      cancelUrl: "https://app.example/account/billing/setup?checkout=cancelled",
      now: NOW,
      env: BILLING_TEST_ENV,
      stripe,
    });
    expect(missingTerms).toEqual({
      ok: false,
      code: "negotiated_terms_required",
    });
    expect(calls).toHaveLength(0);

    const started = await startNegotiatedCheckout({
      clinicId: clinic.id,
      userId: admin.id,
      acceptNegotiatedTerms: true,
      successUrl: "https://app.example/account/billing/complete",
      cancelUrl: "https://app.example/account/billing/setup?checkout=cancelled",
      now: NOW,
      env: BILLING_TEST_ENV,
      stripe,
    });
    expect(started).toMatchObject({ ok: true, reusedSession: false });
    const priced = await prisma.clinicNegotiatedOffer.findFirstOrThrow({
      where: { clinicId: clinic.id, status: "CHECKOUT_OPEN" },
    });
    expect(priced.amountCents).toBe(4900);
    expect(priced.stripePriceId).toBe("price_created_4900");
    expect(stripe.createdPrices).toEqual([4900]);
    expect(calls[0]?.subscriptionKeys).toEqual(["metadata"]);

    sessions.get("cs_neg_1")!.status = "expired";
    const retried = await startNegotiatedCheckout({
      clinicId: clinic.id,
      userId: admin.id,
      acceptNegotiatedTerms: true,
      successUrl: "https://app.example/account/billing/complete",
      cancelUrl: "https://app.example/account/billing/setup?checkout=cancelled",
      now: NOW,
      env: BILLING_TEST_ENV,
      stripe,
    });
    expect(retried).toMatchObject({ ok: true, reusedSession: false });
    expect(stripe.createdPrices).toEqual([4900]);
    expect(calls).toHaveLength(2);

    const failedStripe = fakeCheckoutStripe({
      onCreate() {
        throw Object.assign(new Error("card declined"), {
          type: "StripeCardError",
        });
      },
    });
    const withdrawn = await withdrawNegotiatedOffer({
      clinicId: clinic.id,
      actorUserId: id("operator"),
      actorPlatformRole: PlatformRole.OPERATOR,
      now: NOW,
      stripe,
    });
    expect(withdrawn).toEqual({ ok: true });
    await prepareNegotiatedOffer(offerInput(clinic.id));
    const failed = await startNegotiatedCheckout({
      clinicId: clinic.id,
      userId: admin.id,
      acceptNegotiatedTerms: true,
      successUrl: "https://app.example/account/billing/complete",
      cancelUrl: "https://app.example/account/billing/setup?checkout=cancelled",
      now: NOW,
      env: BILLING_TEST_ENV,
      stripe: failedStripe,
    });
    expect(failed).toEqual({ ok: false, code: "checkout_failed" });
    expect(
      await prisma.clinicEntitlement.findUnique({
        where: { clinicId: clinic.id },
      })
    ).toMatchObject({
      commercialArrangement: "COMPLIMENTARY",
      billingStatus: BillingStatus.NOT_BILLED,
    });
  });

  it("activates paid access from the trusted invoice and leaves clinic records in place", async () => {
    const clinic = await complimentaryClinic("convert", "ESSENTIAL");
    const site = await prisma.clinicSite.create({
      data: {
        clinicId: clinic.id,
        name: "Kept",
        slug: "neg-convert-site",
        displayName: "Kept site",
        isPrimary: true,
        primaryColor: "#abcdef",
      },
    });
    const guide = await prisma.practiceGuide.create({
      data: {
        clinicId: clinic.id,
        title: "Kept guide",
        publicSlug: "kept-guide",
        status: PracticeGuideStatus.PUBLISHED,
        isEnabled: true,
        publishedAt: NOW,
      },
    });
    const prepared = await prepareNegotiatedOffer(offerInput(clinic.id));
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) {
      return;
    }
    await prisma.clinicNegotiatedOffer.update({
      where: { id: prepared.offerId },
      data: {
        stripePriceId: "price_neg_db_49",
        stripeProductId: "prod_neg",
        status: "CHECKOUT_OPEN",
      },
    });
    const before = await prisma.clinicEntitlement.findUniqueOrThrow({
      where: { clinicId: clinic.id },
    });
    const event = negotiatedPaidEvent({
      id: "evt_neg_db_convert",
      clinicId: clinic.id,
      priceId: "price_neg_db_49",
      amountPaid: 4900,
    });
    const result = await processVerifiedStripeEvent(event, {
      prisma,
      env: BILLING_TEST_ENV,
      reader: {
        retrieveSubscription: async () =>
          negotiatedSubscription({
            clinicId: clinic.id,
            priceId: "price_neg_db_49",
            unitAmount: 4900,
          }),
      },
    });
    expect(result.outcome).toBe("processed");
    const after = await prisma.clinicEntitlement.findUniqueOrThrow({
      where: { clinicId: clinic.id },
    });
    expect(after).toMatchObject({
      commercialPlan: "ESSENTIAL",
      commercialArrangement: "PAID",
      billingInterval: "MONTHLY",
      billingStatus: BillingStatus.ACTIVE,
      entitlementStatus: EntitlementStatus.ACTIVE,
      stripePriceId: "price_neg_db_49",
      complimentaryExpiresAt: null,
    });
    expect(after.commercialReviewAt).toBeNull();
    expect(before.complimentaryExpiresAt).not.toBeNull();
    const replay = await processVerifiedStripeEvent(event, {
      prisma,
      env: BILLING_TEST_ENV,
      reader: {
        retrieveSubscription: async () =>
          negotiatedSubscription({
            clinicId: clinic.id,
            priceId: "price_neg_db_49",
            unitAmount: 4900,
          }),
      },
    });
    expect(replay.outcome).toBe("duplicate");
    expect(
      await prisma.clinic.findUnique({ where: { id: clinic.id } })
    ).toMatchObject({
      id: clinic.id,
      slug: clinic.slug,
    });
    expect(
      await prisma.clinicSite.findUnique({ where: { id: site.id } })
    ).toMatchObject({
      displayName: "Kept site",
      primaryColor: "#abcdef",
    });
    expect(
      await prisma.practiceGuide.findUnique({ where: { id: guide.id } })
    ).toMatchObject({
      title: "Kept guide",
      status: PracticeGuideStatus.PUBLISHED,
    });
    expect(
      await prisma.clinicNegotiatedOffer.findUnique({
        where: { id: prepared.offerId },
      })
    ).toMatchObject({ status: "CONVERTED" });
    expect(
      await prisma.clinicComplimentaryAccessEvent.count({
        where: { clinicId: clinic.id },
      })
    ).toBe(1);

    const untouched = await complimentaryClinic("untouched", "PRACTICE");
    const ignored = await processVerifiedStripeEvent(
      negotiatedPaidEvent({
        id: "evt_neg_db_untouched",
        clinicId: untouched.id,
        priceId: "price_test_practice_monthly",
        amountPaid: 14900,
      }),
      {
        prisma,
        env: BILLING_TEST_ENV,
        reader: {
          retrieveSubscription: async () =>
            negotiatedSubscription({
              clinicId: untouched.id,
              priceId: "price_test_practice_monthly",
              unitAmount: 14900,
              subscriptionId: id("sub-untouched"),
            }),
        },
      }
    );
    expect(ignored.outcome).toBe("ignored");
    expect(
      await prisma.clinicEntitlement.findUnique({
        where: { clinicId: untouched.id },
      })
    ).toMatchObject({
      commercialArrangement: "COMPLIMENTARY",
      commercialPlan: "PRACTICE",
      billingStatus: BillingStatus.NOT_BILLED,
    });
  });

  it("withdraws a remembered subscription that does not match the offer", async () => {
    const clinic = await complimentaryClinic("recover", "ESSENTIAL");
    const prepared = await prepareNegotiatedOffer(offerInput(clinic.id));
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) {
      return;
    }
    await prisma.clinicNegotiatedOffer.update({
      where: { id: prepared.offerId },
      data: {
        status: "CHECKOUT_OPEN",
        stripePriceId: "price_neg_49",
        stripeProductId: "prod_neg",
      },
    });
    await prisma.clinicBillingProfile.create({
      data: {
        clinicId: clinic.id,
        stripeSubscriptionId: id("sub-recover"),
      },
    });
    const canceled: string[] = [];
    const matchingHold = await withdrawNegotiatedOffer({
      clinicId: clinic.id,
      actorUserId: id("operator"),
      actorPlatformRole: PlatformRole.OPERATOR,
      now: NOW,
      stripe: subscriptionPort({
        priceId: "price_neg_49",
        unitAmount: 4900,
        onCancel(subscriptionId) {
          canceled.push(subscriptionId);
        },
      }),
    });
    expect(matchingHold).toEqual({
      ok: false,
      error:
        "This subscription matches the negotiated price. Wait for payment confirmation before withdrawing the offer.",
    });
    expect(canceled).toEqual([]);

    const withdrawn = await withdrawNegotiatedOffer({
      clinicId: clinic.id,
      actorUserId: id("operator"),
      actorPlatformRole: PlatformRole.OPERATOR,
      now: NOW,
      stripe: subscriptionPort({
        priceId: "price_other",
        unitAmount: 7900,
        onCancel(subscriptionId) {
          canceled.push(subscriptionId);
        },
      }),
    });
    expect(withdrawn).toEqual({ ok: true });
    expect(canceled).toEqual([id("sub-recover")]);
    expect(
      await prisma.clinicNegotiatedOffer.findUnique({
        where: { id: prepared.offerId },
      })
    ).toMatchObject({ status: "WITHDRAWN" });
    expect(
      await prisma.clinicBillingProfile.findUnique({
        where: { clinicId: clinic.id },
      })
    ).toMatchObject({ stripeSubscriptionId: null });
    const extended = await extendComplimentaryAccess({
      actorUserId: id("operator"),
      actorPlatformRole: PlatformRole.OPERATOR,
      clinicId: clinic.id,
      duration: "TWELVE_MONTHS",
      reason: "Continue after the unused offer",
      now: NOW,
    });
    expect(extended.ok).toBe(true);
    expect(
      await prisma.clinicEntitlement.findUnique({
        where: { clinicId: clinic.id },
      })
    ).toMatchObject({
      commercialArrangement: "COMPLIMENTARY",
      billingStatus: BillingStatus.NOT_BILLED,
    });
  });
});

function negotiatedPaidEvent(input: {
  id: string;
  clinicId: string;
  priceId: string;
  amountPaid: number;
}): Stripe.Event {
  return {
    id: input.id,
    object: "event",
    api_version: null,
    created: 1_747_000_000,
    type: "invoice.paid",
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    data: {
      object: {
        id: `in_${input.id}`,
        object: "invoice",
        status: "paid",
        amount_paid: input.amountPaid,
        customer: `cus_${input.clinicId}`,
        metadata: { clinicId: input.clinicId },
        parent: {
          type: "subscription_details",
          quote_details: null,
          subscription_details: {
            subscription: `sub_${input.clinicId}`,
            metadata: { clinicId: input.clinicId },
          },
        },
        lines: {
          object: "list",
          data: [
            {
              id: "il_1",
              object: "line_item",
              pricing: {
                type: "price_details",
                price_details: { price: input.priceId, product: "prod_1" },
                unit_amount_decimal: String(input.amountPaid),
              },
            },
          ],
          has_more: false,
          url: "/v1/invoices/lines",
        },
      },
    },
  } as unknown as Stripe.Event;
}

function negotiatedSubscription(input: {
  clinicId: string;
  priceId: string;
  unitAmount: number;
  subscriptionId?: string;
}): Stripe.Subscription {
  return {
    id: input.subscriptionId ?? `sub_${input.clinicId}`,
    object: "subscription",
    status: "active",
    customer: `cus_${input.clinicId}`,
    cancel_at_period_end: false,
    metadata: { clinicId: input.clinicId },
    items: {
      object: "list",
      data: [
        {
          id: "si_1",
          quantity: 1,
          price: {
            id: input.priceId,
            unit_amount: input.unitAmount,
            currency: "aud",
            product: "prod_neg",
            recurring: { interval: "month" },
          },
          current_period_start: 1_746_000_000,
          current_period_end: 1_748_600_000,
        },
      ],
      has_more: false,
      url: "/v1/subscription_items",
    },
  } as unknown as Stripe.Subscription;
}

function subscriptionPort(input: {
  priceId: string;
  unitAmount: number;
  onCancel: (subscriptionId: string) => void;
}): NegotiatedStripePort {
  return {
    prices: {
      retrieve: async () => {
        throw new Error("price retrieve was not expected");
      },
      list: async () => ({ data: [] }),
      create: async () => {
        throw new Error("price create was not expected");
      },
    },
    customers: {
      create: async () => ({ id: "cus_recover", metadata: {} }),
      update: async () => ({ id: "cus_recover", metadata: {} }),
    },
    checkout: {
      sessions: {
        create: async () => {
          throw new Error("checkout create was not expected");
        },
        retrieve: async (sessionId) => ({
          id: sessionId,
          url: null,
          status: "expired",
          line_items: { data: [] },
        }),
        expire: async () => ({}),
      },
    },
    subscriptions: {
      retrieve: async (subscriptionId) => ({
        id: subscriptionId,
        status: "active",
        items: {
          data: [
            {
              quantity: 1,
              price: {
                id: input.priceId,
                unit_amount: input.unitAmount,
                currency: "aud",
                product: "prod_neg",
                recurring: { interval: "month" },
              },
            },
          ],
        },
      }),
      cancel: async (subscriptionId) => {
        input.onCancel(subscriptionId);
        return { id: subscriptionId, status: "canceled" };
      },
    },
  };
}

function fakeCheckoutStripe(input: {
  onCreate?: (
    params: {
      line_items: Array<{ price: string; quantity: number }>;
      subscription_data: { metadata: Record<string, string> };
    },
    options?: { idempotencyKey?: string }
  ) => { id: string; url: string; status: string; priceId: string };
  onRetrieve?: (
    id: string
  ) => { id: string; url: string; status: string; priceId: string } | null;
}): NegotiatedStripePort & { createdPrices: number[] } {
  const createdPrices: number[] = [];
  const price = {
    id: "price_created_4900",
    active: true,
    currency: "aud",
    unit_amount: 4900,
    product: "prod_essential",
    recurring: { interval: "month" as const },
  };
  return {
    createdPrices,
    prices: {
      retrieve: async () => ({
        id: "price_test_essential_monthly",
        active: true,
        currency: "aud",
        unit_amount: 7900,
        product: "prod_essential",
        recurring: { interval: "month" },
      }),
      list: async () => ({
        data: createdPrices.length === 0 ? [] : [price],
      }),
      create: async (params) => {
        createdPrices.push(params.unit_amount);
        return { ...price, unit_amount: params.unit_amount };
      },
    },
    customers: {
      create: async () => ({ id: "cus_neg", metadata: {} }),
      update: async () => ({ id: "cus_neg", metadata: {} }),
    },
    checkout: {
      sessions: {
        create: async (params, options) => {
          if (!input.onCreate) {
            throw new Error("checkout create was not expected");
          }
          return input.onCreate(params, options);
        },
        retrieve: async (sessionId) => {
          const found = input.onRetrieve?.(sessionId);
          if (!found) {
            return {
              id: sessionId,
              url: null,
              status: "expired",
              line_items: { data: [] },
            };
          }
          return {
            id: found.id,
            url: found.url,
            status: found.status,
            line_items: {
              data: [{ price: { id: found.priceId }, quantity: 1 }],
            },
          };
        },
        expire: async () => ({}),
      },
    },
  };
}
