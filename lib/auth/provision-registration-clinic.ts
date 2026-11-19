import "server-only";

import {
  ClinicMembershipRole,
  LegalAcceptanceSource,
  PlatformRole,
  Prisma,
} from "@prisma/client";

import { logRegistrationLifecycle } from "@/lib/auth/registration-lifecycle-log";
import {
  REGISTRATION_SLUG_TAKEN_MESSAGE,
  type RegistrationIntentSecret,
  type RegistrationInterval,
  type RegistrationPlan,
} from "@/lib/auth/registration-intent";
import {
  consumeRegistrationIntent,
  recoverRegistrationIntentSlug,
  validateRegistrationIntent,
} from "@/lib/auth/registration-intent-service";
import { createDatabaseSession } from "@/lib/auth/session";
import type { DatabaseSessionRecord } from "@/lib/auth/session";
import { prepareClinicCommercialOffer } from "@/lib/billing/prepare-offer";
import { BILLING_SETUP_PATH } from "@/lib/billing/activation-gate";
import { insertLegalAcceptance } from "@/lib/billing/legal-acceptance";
import { insertAssistedClinicGraph } from "@/lib/clinics/assisted-clinic-graph";
import { ClinicPortalError } from "@/lib/clinic-portal/errors";

export class RegistrationProvisionError extends Error {
  constructor(
    readonly code: "slug_unavailable" | "account_exists" | "rejected"
  ) {
    super(code);
    this.name = "RegistrationProvisionError";
  }
}

export type RegistrationProvisionOutcome =
  | {
      status: "provisioned";
      redirectTo: typeof BILLING_SETUP_PATH;
      session: DatabaseSessionRecord;
      intentId: string;
      clinicId: string;
      userId: string;
      commercialPlan: RegistrationPlan;
      billingInterval: RegistrationInterval;
    }
  | {
      status: "slug_unavailable";
      message: string;
      slug: string;
    }
  | { status: "expired" }
  | { status: "sign_in" }
  | { status: "invalid" }
  | { status: "retry" };

type ProvisionedClinic = {
  intentId: string;
  clinicId: string;
  userId: string;
  commercialPlan: RegistrationPlan;
  billingInterval: RegistrationInterval;
};

/**
 * Consume a verification token and create the clinic, owner, membership,
 * catalogue offer, and registration legal audit row in that same transaction.
 * The session is created only after the transaction commits. Stripe is not
 * called. An already-consumed token does not create a session. The owner
 * signs in with the password they chose.
 */
export async function provisionRegisteredClinic(input: {
  rawToken: string;
  now?: Date;
}): Promise<RegistrationProvisionOutcome> {
  const now = input.now ?? new Date();
  try {
    const consumed = await consumeRegistrationIntent({
      rawToken: input.rawToken,
      now,
      provision: (tx, intent) =>
        provisionRegisteredClinicGraph(tx, intent, now),
    });
    if (consumed.ok) {
      return finishProvisionedClinic(consumed.intentId, consumed.value);
    }
    if (consumed.reason === "consumed") {
      return { status: "sign_in" };
    }
    if (consumed.reason === "expired") {
      return { status: "expired" };
    }
    if (consumed.reason === "slug_unavailable") {
      return {
        status: "slug_unavailable",
        message: consumed.message ?? REGISTRATION_SLUG_TAKEN_MESSAGE,
        slug: await liveRegistrationSlug(input.rawToken, now),
      };
    }
    return { status: "invalid" };
  } catch (error) {
    if (error instanceof RegistrationProvisionError) {
      if (error.code === "slug_unavailable") {
        return {
          status: "slug_unavailable",
          message: REGISTRATION_SLUG_TAKEN_MESSAGE,
          slug: await liveRegistrationSlug(input.rawToken, now),
        };
      }
      if (error.code === "account_exists") {
        return { status: "invalid" };
      }
      return { status: "retry" };
    }
    throw error;
  }
}

/**
 * Point a still-live intent at another slug, then provision it.
 * A rejected slug leaves the previous registration unconsumed.
 */
export async function recoverAndProvisionRegisteredClinic(input: {
  rawToken: string;
  slug: string;
  now?: Date;
}): Promise<RegistrationProvisionOutcome> {
  const now = input.now ?? new Date();
  const recovered = await recoverRegistrationIntentSlug({
    rawToken: input.rawToken,
    slug: input.slug,
    now,
  });
  if (!recovered.ok) {
    if (recovered.reason === "slug_unavailable") {
      return {
        status: "slug_unavailable",
        message: recovered.message ?? REGISTRATION_SLUG_TAKEN_MESSAGE,
        slug: input.slug.trim().toLowerCase(),
      };
    }
    if (recovered.reason === "expired") {
      return { status: "expired" };
    }
    return { status: "invalid" };
  }
  return provisionRegisteredClinic({ rawToken: input.rawToken, now });
}

async function finishProvisionedClinic(
  intentId: string,
  value: ProvisionedClinic
): Promise<RegistrationProvisionOutcome> {
  const session = await createDatabaseSession(value.userId);
  logRegistrationLifecycle({
    event: "registration_clinic_provisioned",
    intentId,
  });
  return {
    status: "provisioned",
    redirectTo: BILLING_SETUP_PATH,
    session,
    intentId,
    clinicId: value.clinicId,
    userId: value.userId,
    commercialPlan: value.commercialPlan,
    billingInterval: value.billingInterval,
  };
}

async function provisionRegisteredClinicGraph(
  tx: Prisma.TransactionClient,
  intent: RegistrationIntentSecret,
  now: Date
): Promise<ProvisionedClinic> {
  if (
    intent.commercialPlan !== "ESSENTIAL" &&
    intent.commercialPlan !== "PRACTICE"
  ) {
    throw new RegistrationProvisionError("rejected");
  }
  if (
    intent.billingInterval !== "MONTHLY" &&
    intent.billingInterval !== "YEARLY"
  ) {
    throw new RegistrationProvisionError("rejected");
  }
  if (!isAuditDocumentVersion(intent.termsVersion)) {
    throw new RegistrationProvisionError("rejected");
  }
  if (!isAuditDocumentVersion(intent.privacyVersionAcknowledged)) {
    throw new RegistrationProvisionError("rejected");
  }
  if (intent.serviceCategories.length === 0) {
    throw new RegistrationProvisionError("rejected");
  }

  let clinic: { id: string };
  try {
    clinic = await insertAssistedClinicGraph(tx, {
      name: intent.practiceName,
      slug: intent.slug,
      serviceCategories: intent.serviceCategories,
    });
  } catch (error) {
    throw registrationGraphError(error);
  }

  let user: { id: string };
  try {
    user = await tx.user.create({
      data: {
        name: intent.ownerName,
        email: intent.email,
        emailVerified: now,
        passwordHash: intent.passwordHash,
        platformRole: PlatformRole.NONE,
      },
      select: { id: true },
    });
  } catch (error) {
    throw registrationGraphError(error);
  }

  await tx.clinicMembership.create({
    data: {
      clinicId: clinic.id,
      userId: user.id,
      role: ClinicMembershipRole.ADMIN,
      active: true,
    },
  });

  const prepared = await prepareClinicCommercialOffer(
    {
      clinicId: clinic.id,
      commercialPlan: intent.commercialPlan,
      billingInterval: intent.billingInterval,
    },
    tx
  );
  if (!prepared.ok) {
    throw new RegistrationProvisionError("rejected");
  }

  await insertLegalAcceptance(tx, {
    clinicId: clinic.id,
    userId: user.id,
    termsVersion: intent.termsVersion,
    privacyVersionAcknowledged: intent.privacyVersionAcknowledged,
    source: LegalAcceptanceSource.REGISTRATION,
    acceptedAt: now,
  });

  return {
    intentId: intent.id,
    clinicId: clinic.id,
    userId: user.id,
    commercialPlan: intent.commercialPlan,
    billingInterval: intent.billingInterval,
  };
}

function registrationGraphError(error: unknown): Error {
  if (error instanceof ClinicPortalError && error.code === "conflict") {
    return new RegistrationProvisionError("slug_unavailable");
  }
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  ) {
    const target = Array.isArray(error.meta?.target)
      ? error.meta.target.join(",")
      : String(error.meta?.target ?? "");
    if (target.toLowerCase().includes("email")) {
      return new RegistrationProvisionError("account_exists");
    }
    return new RegistrationProvisionError("slug_unavailable");
  }
  return error instanceof Error
    ? error
    : new Error("registration_provision_failed");
}

function isAuditDocumentVersion(value: string): boolean {
  return /^[A-Za-z0-9._:-]{4,64}$/.test(value);
}

async function liveRegistrationSlug(
  rawToken: string,
  now: Date
): Promise<string> {
  const validated = await validateRegistrationIntent({ rawToken, now });
  return validated.ok ? validated.intent.slug : "";
}
