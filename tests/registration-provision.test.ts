import "dotenv/config";

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-auth", () => ({
  default: () => ({
    auth: vi.fn(),
    handlers: { GET: vi.fn(), POST: vi.fn() },
    signIn: vi.fn(),
    signOut: vi.fn(),
  }),
}));

vi.mock("@auth/prisma-adapter", () => ({
  PrismaAdapter: vi.fn(() => ({})),
}));

import {
  BillingStatus,
  ClinicMembershipRole,
  EntitlementStatus,
  LegalAcceptanceSource,
  PlatformRole,
} from "@prisma/client";

import {
  DUMMY_PASSWORD_HASH,
  hashPassword,
  verifyPassword,
} from "@/lib/auth/password";
import { loadClinicAccess } from "@/lib/auth/clinic-authorization";
import {
  provisionRegisteredClinic,
  recoverAndProvisionRegisteredClinic,
  REGISTRATION_PROVISION_RETRY_MS,
} from "@/lib/auth/provision-registration-clinic";
import {
  createOrReplaceRegistrationIntent,
  expireRegistrationIntents,
  reissueRegistrationIntentToken,
} from "@/lib/auth/registration-intent-service";
import {
  REGISTRATION_INTENT_TTL_MS,
  validateRegistrationInput,
} from "@/lib/auth/registration-intent";
import { readClinicBillingAccess } from "@/lib/billing/activation-gate";
import { hasCurrentBillingLegalAcceptance } from "@/lib/billing/legal-acceptance";
import { catalogueTrialDaysForState } from "@/lib/billing/trial";
import * as stripeClient from "@/lib/billing/stripe-client";
import {
  PRIVACY_ACKNOWLEDGEMENT_VERSION,
  TERMS_ACCEPTANCE_VERSION,
} from "@/lib/legal/status";
import { getPrisma } from "@/lib/prisma";

const prisma = getPrisma();
const PASSWORD = "registration-secret-1";
const stripeSpy = vi
  .spyOn(stripeClient, "getStripeClient")
  .mockImplementation(() => {
    throw new Error("stripe_called");
  });

function input(overrides: Record<string, unknown> = {}) {
  return {
    email: "regprov-owner@example.test",
    password: PASSWORD,
    ownerName: "River Owner",
    practiceName: "River Practice",
    slug: "regprov-owner",
    serviceCategories: ["DENTAL"],
    commercialPlan: "ESSENTIAL",
    billingInterval: "MONTHLY",
    now: new Date("2026-11-19T00:00:00.000Z"),
    ...overrides,
  };
}

async function cleanup() {
  await prisma.session.deleteMany({
    where: { user: { email: { startsWith: "regprov-" } } },
  });
  await prisma.clinic.deleteMany({
    where: { slug: { startsWith: "regprov-" } },
  });
  await prisma.user.deleteMany({
    where: { email: { startsWith: "regprov-" } },
  });
  await prisma.clinicRegistrationIntent.deleteMany({
    where: { email: { startsWith: "regprov-" } },
  });
}

async function acceptedIntent(overrides: Record<string, unknown> = {}) {
  const created = await createOrReplaceRegistrationIntent(input(overrides));
  if (created.status !== "accepted" || created.delivery !== "send") {
    throw new Error(
      `expected a verification token, received ${created.status}`
    );
  }
  return created;
}

beforeEach(async () => {
  stripeSpy.mockClear();
  await cleanup();
});

afterAll(async () => {
  stripeSpy.mockRestore();
  await cleanup();
  await prisma.$disconnect();
});

describe("registration clinic provisioning", () => {
  it.each([
    ["ESSENTIAL", "MONTHLY"],
    ["PRACTICE", "YEARLY"],
  ] as const)(
    "creates one %s %s clinic and sends the owner to billing setup",
    async (commercialPlan, billingInterval) => {
      const email = `regprov-${commercialPlan.toLowerCase()}@example.test`;
      const slug = `regprov-${commercialPlan.toLowerCase().slice(0, 3)}`;
      const created = await acceptedIntent({
        email,
        slug,
        commercialPlan,
        billingInterval,
        serviceCategories: ["DENTAL", "PHYSIOTHERAPY"],
      });

      const result = await provisionRegisteredClinic({
        rawToken: created.rawToken,
        now: input().now,
      });

      expect(result).toMatchObject({
        status: "provisioned",
        redirectTo: "/account/billing/setup",
        commercialPlan,
        billingInterval,
        intentId: created.intentId,
      });
      if (result.status !== "provisioned") {
        throw new Error("expected a provisioned clinic");
      }
      expect(stripeSpy).not.toHaveBeenCalled();

      const clinic = await prisma.clinic.findUniqueOrThrow({
        where: { id: result.clinicId },
        include: {
          profile: true,
          sites: { include: { serviceCategories: true, locations: true } },
          entitlement: true,
          billingProfile: true,
          legalAcceptances: true,
          promotionalOffers: true,
          complimentaryAccessEvents: true,
          memberships: { include: { user: true } },
        },
      });
      expect(clinic).toMatchObject({
        name: "River Practice",
        slug,
        assistedOnboarding: true,
        profile: { displayName: "River Practice" },
      });
      expect(clinic.sites).toHaveLength(1);
      expect(clinic.sites[0]).toMatchObject({
        slug,
        isPrimary: true,
        active: true,
      });
      expect(
        clinic.sites[0]?.serviceCategories
          .map((row) => row.serviceCategory)
          .sort()
      ).toEqual(["DENTAL", "PHYSIOTHERAPY"]);
      expect(clinic.sites[0]?.locations).toHaveLength(1);
      expect(clinic.sites[0]?.locations[0]).toMatchObject({
        servesSiteRoot: true,
        isPrimary: true,
        active: true,
      });
      expect(clinic.entitlement).toMatchObject({
        commercialPlan,
        billingInterval,
        billingStatus: BillingStatus.OFFER_PREPARED,
        entitlementStatus: EntitlementStatus.PENDING,
        commercialArrangement: "PAID",
        offeredAdditionalSiteQuantity: null,
        trialEndsAt: null,
      });
      expect(clinic.billingProfile?.stripeCustomerId ?? null).toBeNull();
      expect(clinic.billingProfile?.stripeSubscriptionId ?? null).toBeNull();
      expect(clinic.promotionalOffers).toHaveLength(0);
      expect(clinic.complimentaryAccessEvents).toHaveLength(0);
      expect(clinic.memberships).toHaveLength(1);
      expect(clinic.memberships[0]).toMatchObject({
        role: ClinicMembershipRole.ADMIN,
        active: true,
      });
      const owner = clinic.memberships[0]?.user;
      expect(owner).toMatchObject({
        email,
        name: "River Owner",
        platformRole: PlatformRole.NONE,
      });
      expect(owner?.emailVerified).toEqual(input().now);
      expect(verifyPassword(PASSWORD, owner?.passwordHash)).toBe(true);
      expect(owner?.passwordHash).not.toBe(DUMMY_PASSWORD_HASH);
      expect(clinic.legalAcceptances).toEqual([
        expect.objectContaining({
          userId: owner?.id,
          termsVersion: TERMS_ACCEPTANCE_VERSION,
          privacyVersionAcknowledged: PRIVACY_ACKNOWLEDGEMENT_VERSION,
          source: LegalAcceptanceSource.REGISTRATION,
          acceptedAt: input().now,
        }),
      ]);
      expect(
        await hasCurrentBillingLegalAcceptance({
          clinicId: clinic.id,
          userId: owner?.id ?? "",
        })
      ).toBe(false);

      const intent = await prisma.clinicRegistrationIntent.findUniqueOrThrow({
        where: { id: created.intentId },
      });
      expect(intent.consumedAt).toEqual(input().now);
      expect(intent.passwordHash).toBe(DUMMY_PASSWORD_HASH);

      expect(
        catalogueTrialDaysForState({
          commercialArrangement: clinic.entitlement?.commercialArrangement,
          commercialPlan: clinic.entitlement?.commercialPlan ?? null,
          billingInterval: clinic.entitlement?.billingInterval ?? null,
          billingStatus: clinic.entitlement?.billingStatus ?? null,
          entitlementStatus: clinic.entitlement?.entitlementStatus ?? null,
          stripeSubscriptionId: null,
          trialEndsAt: clinic.entitlement?.trialEndsAt,
        })
      ).toBe(14);
      expect(
        catalogueTrialDaysForState({
          commercialPlan: "GROUP",
          billingInterval: "MONTHLY",
          billingStatus: BillingStatus.OFFER_PREPARED,
          entitlementStatus: EntitlementStatus.PENDING,
          stripeSubscriptionId: null,
        })
      ).toBeNull();
      expect(
        catalogueTrialDaysForState({
          commercialArrangement: "COMPLIMENTARY",
          commercialPlan,
          billingInterval,
          billingStatus: BillingStatus.NOT_BILLED,
          entitlementStatus: EntitlementStatus.ACTIVE,
          stripeSubscriptionId: null,
        })
      ).toBeNull();

      const ownAccess = await loadClinicAccess(
        { id: owner?.id ?? "", platformRole: PlatformRole.NONE },
        clinic.id
      );
      expect(ownAccess.activeMembership?.role).toBe(ClinicMembershipRole.ADMIN);
      const other = await prisma.clinic.create({
        data: { name: "Other", slug: "regprov-other" },
      });
      const otherAccess = await loadClinicAccess(
        { id: owner?.id ?? "", platformRole: PlatformRole.NONE },
        other.id
      );
      expect(otherAccess.activeMembership).toBeNull();

      const gate = await readClinicBillingAccess({
        source: "membership",
        clinic: { id: clinic.id, name: clinic.name },
      });
      expect(gate).toMatchObject({
        kind: "billing_required",
        href: "/account/billing/setup",
      });

      const session = await prisma.session.findUniqueOrThrow({
        where: { sessionToken: result.session.sessionToken },
      });
      expect(session.userId).toBe(owner?.id);
    }
  );

  it("rolls back the clinic when offer preparation fails and then retries", async () => {
    const created = await acceptedIntent({
      email: "regprov-rollback@example.test",
      slug: "regprov-rollback",
    });
    const offer = await import("@/lib/billing/prepare-offer");
    const spy = vi
      .spyOn(offer, "prepareClinicCommercialOffer")
      .mockRejectedValueOnce(new Error("offer failed"));

    await expect(
      provisionRegisteredClinic({
        rawToken: created.rawToken,
        now: input().now,
      })
    ).rejects.toThrow("offer failed");
    spy.mockRestore();

    const intent = await prisma.clinicRegistrationIntent.findUniqueOrThrow({
      where: { id: created.intentId },
    });
    expect(intent.consumedAt).toBeNull();
    expect(intent.passwordHash).not.toBe(DUMMY_PASSWORD_HASH);
    expect(
      await prisma.clinic.count({ where: { slug: "regprov-rollback" } })
    ).toBe(0);
    expect(
      await prisma.user.count({
        where: { email: "regprov-rollback@example.test" },
      })
    ).toBe(0);

    const retried = await provisionRegisteredClinic({
      rawToken: created.rawToken,
      now: input().now,
    });
    expect(retried.status).toBe("provisioned");
    expect(stripeSpy).not.toHaveBeenCalled();
  });

  it("treats a repeated and a concurrent verification as one clinic", async () => {
    const created = await acceptedIntent({
      email: "regprov-repeat@example.test",
      slug: "regprov-repeat",
    });
    const now = input().now;
    const [first, second] = await Promise.all([
      provisionRegisteredClinic({ rawToken: created.rawToken, now }),
      provisionRegisteredClinic({ rawToken: created.rawToken, now }),
    ]);
    expect(first.status).toBe("provisioned");
    expect(second.status).toBe("provisioned");
    if (first.status !== "provisioned" || second.status !== "provisioned") {
      throw new Error("expected both verifications to finish");
    }
    expect(first.clinicId).toBe(second.clinicId);
    expect(
      await prisma.clinic.count({ where: { slug: "regprov-repeat" } })
    ).toBe(1);
    expect(
      await prisma.clinicMembership.count({
        where: { clinicId: first.clinicId },
      })
    ).toBe(1);
    expect(
      await prisma.session.count({ where: { userId: first.userId } })
    ).toBe(2);

    const aged = await prisma.clinicRegistrationIntent.update({
      where: { id: created.intentId },
      data: {
        consumedAt: new Date(
          now.getTime() - REGISTRATION_PROVISION_RETRY_MS - 1
        ),
      },
    });
    const stale = await provisionRegisteredClinic({
      rawToken: created.rawToken,
      now,
    });
    expect(stale.status).toBe("invalid");
    expect(aged.consumedAt).not.toBeNull();
    expect(
      await prisma.session.count({ where: { userId: first.userId } })
    ).toBe(2);
  });

  it("does not provision when the email is already a user", async () => {
    const email = "regprov-taken-email@example.test";
    const created = await acceptedIntent({
      email,
      slug: "regprov-email",
    });
    await prisma.user.create({
      data: {
        email,
        name: "Existing",
        passwordHash: hashPassword(PASSWORD),
      },
    });

    const result = await provisionRegisteredClinic({
      rawToken: created.rawToken,
      now: input().now,
    });
    expect(result.status).toBe("invalid");
    expect(
      await prisma.clinic.count({ where: { slug: "regprov-email" } })
    ).toBe(0);
    const intent = await prisma.clinicRegistrationIntent.findUniqueOrThrow({
      where: { id: created.intentId },
    });
    expect(intent.revokedAt).toEqual(input().now);
    expect(intent.consumedAt).toBeNull();
    expect(intent.passwordHash).toBe(DUMMY_PASSWORD_HASH);
  });

  it("keeps the registration when the slug is taken and continues after a new one", async () => {
    const created = await acceptedIntent({
      email: "regprov-slug@example.test",
      slug: "regprov-slug",
      commercialPlan: "PRACTICE",
      billingInterval: "YEARLY",
    });
    await prisma.clinic.create({
      data: { name: "Already there", slug: "regprov-slug" },
    });

    const blocked = await provisionRegisteredClinic({
      rawToken: created.rawToken,
      now: input().now,
    });
    expect(blocked).toMatchObject({
      status: "slug_unavailable",
      slug: "regprov-slug",
    });
    const waiting = await prisma.clinicRegistrationIntent.findUniqueOrThrow({
      where: { id: created.intentId },
    });
    expect(waiting.consumedAt).toBeNull();
    expect(waiting.passwordHash).not.toBe(DUMMY_PASSWORD_HASH);

    const recovered = await recoverAndProvisionRegisteredClinic({
      rawToken: created.rawToken,
      slug: "regprov-slug-b",
      now: input().now,
    });
    expect(recovered).toMatchObject({
      status: "provisioned",
      commercialPlan: "PRACTICE",
      billingInterval: "YEARLY",
    });
    if (recovered.status !== "provisioned") {
      throw new Error("expected the recovered clinic");
    }
    const clinic = await prisma.clinic.findUniqueOrThrow({
      where: { id: recovered.clinicId },
      include: { entitlement: true },
    });
    expect(clinic.slug).toBe("regprov-slug-b");
    expect(clinic.entitlement).toMatchObject({
      commercialPlan: "PRACTICE",
      billingInterval: "YEARLY",
      billingStatus: BillingStatus.OFFER_PREPARED,
      entitlementStatus: EntitlementStatus.PENDING,
    });
  });

  it("refuses an expired token and a token that was replaced", async () => {
    const issued = input().now;
    const created = await acceptedIntent({
      email: "regprov-expired@example.test",
      slug: "regprov-expired",
      now: issued,
    });
    const expired = await provisionRegisteredClinic({
      rawToken: created.rawToken,
      now: new Date(issued.getTime() + REGISTRATION_INTENT_TTL_MS),
    });
    expect(expired.status).toBe("expired");
    expect(
      await prisma.clinic.count({ where: { slug: "regprov-expired" } })
    ).toBe(0);

    const replaced = await acceptedIntent({
      email: "regprov-replaced@example.test",
      slug: "regprov-replaced",
      now: issued,
    });
    const reissued = await reissueRegistrationIntentToken({
      email: "regprov-replaced@example.test",
      now: new Date(issued.getTime() + 11 * 60 * 1000),
    });
    expect(reissued.status).toBe("send");
    if (reissued.status !== "send") {
      throw new Error("expected a replacement token");
    }
    const stale = await provisionRegisteredClinic({
      rawToken: replaced.rawToken,
      now: new Date(issued.getTime() + 11 * 60 * 1000),
    });
    expect(stale.status).toBe("invalid");
    const current = await provisionRegisteredClinic({
      rawToken: reissued.rawToken,
      now: new Date(issued.getTime() + 11 * 60 * 1000),
    });
    expect(current.status).toBe("provisioned");
  });

  it("does not store a Group plan or provision a revoked token", async () => {
    const grouped = await acceptedIntent({
      email: "regprov-group@example.test",
      slug: "regprov-group",
    });
    const rejectedPlan = validateRegistrationInput({
      ...input(),
      commercialPlan: "GROUP",
    });
    expect(rejectedPlan.ok).toBe(false);
    await expect(
      prisma.clinicRegistrationIntent.update({
        where: { id: grouped.intentId },
        data: { commercialPlan: "GROUP" },
      })
    ).rejects.toThrow(/ClinicRegistrationIntent_shape_check/);
    expect(
      await prisma.clinic.count({ where: { slug: "regprov-group" } })
    ).toBe(0);
    const stillThere = await prisma.clinicRegistrationIntent.findUniqueOrThrow({
      where: { id: grouped.intentId },
    });
    expect(stillThere.commercialPlan).toBe("ESSENTIAL");
    expect(stillThere.consumedAt).toBeNull();

    const revoked = await acceptedIntent({
      email: "regprov-revoked@example.test",
      slug: "regprov-revoked",
    });
    await prisma.clinicRegistrationIntent.update({
      where: { id: revoked.intentId },
      data: { revokedAt: input().now, passwordHash: DUMMY_PASSWORD_HASH },
    });
    const result = await provisionRegisteredClinic({
      rawToken: revoked.rawToken,
      now: input().now,
    });
    expect(result.status).toBe("invalid");
    expect(
      await prisma.user.count({
        where: { email: "regprov-revoked@example.test" },
      })
    ).toBe(0);
  });

  it("redacts only a bounded set of expired registrations", async () => {
    const now = new Date("2026-11-19T12:00:00.000Z");
    const live = await acceptedIntent({
      email: "regprov-live@example.test",
      slug: "regprov-live",
      now,
    });
    const first = await acceptedIntent({
      email: "regprov-old-a@example.test",
      slug: "regprov-old-a",
      now: new Date("2026-11-17T00:00:00.000Z"),
    });
    const second = await acceptedIntent({
      email: "regprov-old-b@example.test",
      slug: "regprov-old-b",
      now: new Date("2026-11-17T01:00:00.000Z"),
    });
    const consumed = await acceptedIntent({
      email: "regprov-kept@example.test",
      slug: "regprov-kept",
      now,
    });
    await provisionRegisteredClinic({ rawToken: consumed.rawToken, now });

    const swept = await expireRegistrationIntents({ now, limit: 1 });
    expect(swept.revoked).toBe(1);
    const rows = await prisma.clinicRegistrationIntent.findMany({
      where: { email: { startsWith: "regprov-old-" } },
      orderBy: { expiresAt: "asc" },
    });
    expect(rows.filter((row) => row.revokedAt)).toHaveLength(1);
    expect(rows.filter((row) => !row.revokedAt)).toHaveLength(1);
    expect(rows.find((row) => row.revokedAt)?.passwordHash).toBe(
      DUMMY_PASSWORD_HASH
    );
    const untouched = await prisma.clinicRegistrationIntent.findUniqueOrThrow({
      where: { id: live.intentId },
    });
    expect(untouched.revokedAt).toBeNull();
    expect(untouched.consumedAt).toBeNull();
    expect(untouched.passwordHash).not.toBe(DUMMY_PASSWORD_HASH);
    const kept = await prisma.clinicRegistrationIntent.findUniqueOrThrow({
      where: { id: consumed.intentId },
    });
    expect(kept.consumedAt).toEqual(now);
    expect(kept.revokedAt).toBeNull();
    expect(await prisma.clinic.count({ where: { slug: "regprov-kept" } })).toBe(
      1
    );

    const rest = await expireRegistrationIntents({ now, limit: 1 });
    expect(rest.revoked).toBe(1);
    const finished = await prisma.clinicRegistrationIntent.findMany({
      where: { id: { in: [first.intentId, second.intentId] } },
    });
    expect(
      finished.every(
        (row) => row.revokedAt && row.passwordHash === DUMMY_PASSWORD_HASH
      )
    ).toBe(true);
    expect(finished.every((row) => row.consumedAt === null)).toBe(true);
  });
});
