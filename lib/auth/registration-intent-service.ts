import "server-only";

import { AccountTokenType, Prisma, type PrismaClient } from "@prisma/client";

import {
  PASSWORD_RESET_REQUEST_COOLDOWN_MINUTES,
  generateAccountToken,
  hashAccountToken,
} from "@/lib/auth/account-token";
import { isWellFormedRawAccountToken } from "@/lib/auth/account-token-format";
import {
  AccountTokenError,
  normalizeAccountTokenEmail,
} from "@/lib/auth/account-token-service";
import { DUMMY_PASSWORD_HASH, hashPassword } from "@/lib/auth/password";
import {
  REGISTRATION_INTENT_GENERIC_MESSAGE,
  REGISTRATION_INTENT_TTL_MS,
  REGISTRATION_SLUG_TAKEN_MESSAGE,
  registrationIntentExpiresAt,
  registrationIntentLockKey,
  registrationSlugPolicyMessage,
  registrationTokenFailure,
  validateRegistrationInput,
  type RegistrationIntentSecret,
  type RegistrationIntentView,
  type RegistrationSlugUnavailable,
  type RegistrationTokenFailure,
  type ValidRegistrationInput,
} from "@/lib/auth/registration-intent";
import {
  lockTenantSlugs,
  RETIRED_TENANT_SLUG_MESSAGE,
  tenantSlugIsRetired,
} from "@/lib/clinics/retired-tenant-slug";
import { getPrisma } from "@/lib/prisma";

type RegistrationDb = PrismaClient | Prisma.TransactionClient;

export type CreateRegistrationIntentResult =
  | {
      status: "accepted";
      delivery: "send";
      message: typeof REGISTRATION_INTENT_GENERIC_MESSAGE;
      rawToken: string;
      intentId: string;
      expiresAt: Date;
    }
  | {
      status: "accepted";
      delivery: "suppress";
      message: typeof REGISTRATION_INTENT_GENERIC_MESSAGE;
    }
  | RegistrationSlugUnavailable
  | {
      status: "invalid";
      field: string;
      message: string;
    };

export type ValidateRegistrationIntentResult =
  | { ok: true; intent: RegistrationIntentView }
  | { ok: false; reason: RegistrationTokenFailure };

export type ConsumeRegistrationIntentResult<T> =
  | { ok: true; value: T; intentId: string }
  | {
      ok: false;
      reason: RegistrationTokenFailure | "account_exists" | "slug_unavailable";
      message?: string;
    };

export type RecoverRegistrationSlugResult =
  | { ok: true; intent: RegistrationIntentView }
  | {
      ok: false;
      reason: RegistrationTokenFailure | "account_exists" | "slug_unavailable";
      message?: string;
    };

/**
 * Create or replace the live intent for an email.
 *
 * Existing users, pending invitations, operator accounts, and outstanding
 * email-change claims all return the same accepted suppress result. Callers
 * that speak to a visitor must show `message` and must not branch on
 * `delivery`. `rawToken` is for a later mailer only. This function does not
 * send mail and does not create a clinic, user, membership, or subscription.
 *
 * Replacing a live intent revokes the previous token inside the same
 * transaction. The proposed slug is checked, then the lock is released at
 * commit. It is not reserved.
 */
export async function createOrReplaceRegistrationIntent(input: {
  email: string;
  password: string;
  ownerName: string;
  practiceName: string;
  slug: string;
  serviceCategories: readonly string[];
  commercialPlan: string;
  billingInterval: string;
  now?: Date;
}): Promise<CreateRegistrationIntentResult> {
  const validated = validateRegistrationInput(input);
  if (!validated.ok) {
    return validated.error;
  }

  const passwordHash = hashPassword(validated.value.password);
  const rawToken = generateAccountToken();
  const tokenHash = hashAccountToken(rawToken);
  const now = input.now ?? new Date();
  const expiresAt = registrationIntentExpiresAt(now);

  return getPrisma().$transaction(async (tx) => {
    await lockRegistrationEmail(tx, validated.value.email);
    if (await registrationEmailIsClaimed(tx, validated.value.email)) {
      await revokeLiveRegistrationIntents(tx, validated.value.email, now);
      return {
        status: "accepted" as const,
        delivery: "suppress" as const,
        message: REGISTRATION_INTENT_GENERIC_MESSAGE,
      };
    }

    const slugMessage = await registrationSlugBlock(tx, validated.value.slug);
    if (slugMessage) {
      return { status: "slug_unavailable" as const, message: slugMessage };
    }

    await revokeLiveRegistrationIntents(tx, validated.value.email, now);
    const created = await tx.clinicRegistrationIntent.create({
      data: intentCreateData(validated.value, {
        passwordHash,
        tokenHash,
        expiresAt,
      }),
    });

    return {
      status: "accepted" as const,
      delivery: "send" as const,
      message: REGISTRATION_INTENT_GENERIC_MESSAGE,
      rawToken,
      intentId: created.id,
      expiresAt,
    };
  });
}

export async function validateRegistrationIntent(input: {
  rawToken: string;
  now?: Date;
}): Promise<ValidateRegistrationIntentResult> {
  const tokenHash = hashRawTokenOrNull(input.rawToken);
  if (!tokenHash) {
    return { ok: false, reason: "missing" };
  }
  const now = input.now ?? new Date();
  const row = await getPrisma().clinicRegistrationIntent.findUnique({
    where: { tokenHash },
  });
  const reason = registrationTokenFailure(row, now);
  if (reason || !row) {
    return { ok: false, reason: reason ?? "missing" };
  }
  return { ok: true, intent: toView(row) };
}

/**
 * Revoke live intents whose verification window has ended and redact the
 * stored password hash. An optional email limits the sweep to one address.
 */
export async function expireRegistrationIntents(input?: {
  now?: Date;
  email?: string;
}): Promise<{ revoked: number }> {
  const now = input?.now ?? new Date();
  const result = await getPrisma().clinicRegistrationIntent.updateMany({
    where: {
      consumedAt: null,
      revokedAt: null,
      expiresAt: { lte: now },
      ...(input?.email ? { email: input.email } : {}),
    },
    data: { revokedAt: now, passwordHash: DUMMY_PASSWORD_HASH },
  });
  return { revoked: result.count };
}

/**
 * Single-use consumption. `provision` runs in the same transaction, after the
 * tenant-slug lock is held and before `consumedAt` is set. If `provision`
 * throws, the transaction rolls back and the intent stays usable.
 * A slug collision or a failed provision does not consume the row.
 * The slug lock is held only until this transaction ends. It does not
 * reserve the hostname after rollback or after a collision return.
 */
export async function consumeRegistrationIntent<T>(input: {
  rawToken: string;
  now?: Date;
  provision: (
    tx: Prisma.TransactionClient,
    intent: RegistrationIntentSecret
  ) => Promise<T>;
}): Promise<ConsumeRegistrationIntentResult<T>> {
  const tokenHash = hashRawTokenOrNull(input.rawToken);
  if (!tokenHash) {
    return { ok: false, reason: "missing" };
  }
  const now = input.now ?? new Date();

  return getPrisma().$transaction(async (tx) => {
    const located = await tx.clinicRegistrationIntent.findUnique({
      where: { tokenHash },
      select: { id: true, email: true },
    });
    if (!located) {
      return { ok: false as const, reason: "missing" as const };
    }

    await lockRegistrationEmail(tx, located.email);
    const row = await tx.clinicRegistrationIntent.findUnique({
      where: { id: located.id },
    });
    const reason = registrationTokenFailure(row, now);
    if (reason || !row) {
      return { ok: false as const, reason: reason ?? "missing" };
    }

    if (await registrationEmailIsClaimed(tx, row.email)) {
      await revokeLiveRegistrationIntents(tx, row.email, now);
      return { ok: false as const, reason: "account_exists" as const };
    }

    const slugMessage = await registrationSlugBlock(tx, row.slug);
    if (slugMessage) {
      return {
        ok: false as const,
        reason: "slug_unavailable" as const,
        message: slugMessage,
      };
    }

    const secret = toSecret(row);
    const value = await input.provision(tx, secret);
    const updated = await tx.clinicRegistrationIntent.updateMany({
      where: { id: row.id, consumedAt: null, revokedAt: null },
      data: { consumedAt: now, passwordHash: DUMMY_PASSWORD_HASH },
    });
    if (updated.count !== 1) {
      throw new Error("registration_intent_consume_conflict");
    }
    return { ok: true as const, value, intentId: row.id };
  });
}

/**
 * Point a still-live intent at another slug after a collision.
 * Does not consume the token and does not reserve the new slug.
 */
export async function recoverRegistrationIntentSlug(input: {
  rawToken: string;
  slug: string;
  now?: Date;
}): Promise<RecoverRegistrationSlugResult> {
  const policy = registrationSlugPolicyMessage(input.slug);
  if (policy) {
    return { ok: false, reason: "slug_unavailable", message: policy };
  }
  const tokenHash = hashRawTokenOrNull(input.rawToken);
  if (!tokenHash) {
    return { ok: false, reason: "missing" };
  }
  const now = input.now ?? new Date();

  return getPrisma().$transaction(async (tx) => {
    const located = await tx.clinicRegistrationIntent.findUnique({
      where: { tokenHash },
      select: { id: true, email: true },
    });
    if (!located) {
      return { ok: false as const, reason: "missing" as const };
    }
    await lockRegistrationEmail(tx, located.email);
    const row = await tx.clinicRegistrationIntent.findUnique({
      where: { id: located.id },
    });
    const reason = registrationTokenFailure(row, now);
    if (reason || !row) {
      return { ok: false as const, reason: reason ?? "missing" };
    }
    if (await registrationEmailIsClaimed(tx, row.email)) {
      await revokeLiveRegistrationIntents(tx, row.email, now);
      return { ok: false as const, reason: "account_exists" as const };
    }
    const slugMessage = await registrationSlugBlock(tx, input.slug);
    if (slugMessage) {
      return {
        ok: false as const,
        reason: "slug_unavailable" as const,
        message: slugMessage,
      };
    }
    const updated = await tx.clinicRegistrationIntent.update({
      where: { id: row.id },
      data: { slug: input.slug },
    });
    return { ok: true as const, intent: toView(updated) };
  });
}

const REGISTRATION_REISSUE_COOLDOWN_MS =
  PASSWORD_RESET_REQUEST_COOLDOWN_MINUTES * 60 * 1000;

export type ReissueRegistrationIntentResult =
  | {
      status: "send";
      rawToken: string;
      intentId: string;
      expiresAt: Date;
      practiceName: string;
      previous: { tokenHash: string; expiresAt: Date };
    }
  | { status: "suppress" }
  | { status: "invalid_email" };

/**
 * Rotate the verification token for an existing live intent.
 * Does not change the stored password and does not consume the intent.
 * A recent token is left in place so a replacement request cannot mail-bomb
 * the address. Callers must not return `rawToken` to a browser.
 */
export async function reissueRegistrationIntentToken(input: {
  email: string;
  now?: Date;
}): Promise<ReissueRegistrationIntentResult> {
  let email: string;
  try {
    email = normalizeAccountTokenEmail(input.email);
  } catch (error) {
    if (error instanceof AccountTokenError) {
      return { status: "invalid_email" };
    }
    throw error;
  }

  const now = input.now ?? new Date();
  return getPrisma().$transaction(async (tx) => {
    await lockRegistrationEmail(tx, email);
    if (await registrationEmailIsClaimed(tx, email)) {
      await revokeLiveRegistrationIntents(tx, email, now);
      return { status: "suppress" as const };
    }

    const row = await tx.clinicRegistrationIntent.findFirst({
      where: { email, consumedAt: null, revokedAt: null },
    });
    if (!row) {
      return { status: "suppress" as const };
    }

    const issuedAt = row.expiresAt.getTime() - REGISTRATION_INTENT_TTL_MS;
    if (now.getTime() - issuedAt < REGISTRATION_REISSUE_COOLDOWN_MS) {
      return { status: "suppress" as const };
    }

    const rawToken = generateAccountToken();
    const tokenHash = hashAccountToken(rawToken);
    const expiresAt = registrationIntentExpiresAt(now);
    const updated = await tx.clinicRegistrationIntent.updateMany({
      where: {
        id: row.id,
        tokenHash: row.tokenHash,
        consumedAt: null,
        revokedAt: null,
      },
      data: { tokenHash, expiresAt },
    });
    if (updated.count !== 1) {
      return { status: "suppress" as const };
    }

    return {
      status: "send" as const,
      rawToken,
      intentId: row.id,
      expiresAt,
      practiceName: row.practiceName,
      previous: { tokenHash: row.tokenHash, expiresAt: row.expiresAt },
    };
  });
}

export async function revokeUnconsumedRegistrationIntent(input: {
  intentId: string;
  now?: Date;
}): Promise<void> {
  const now = input.now ?? new Date();
  await getPrisma().clinicRegistrationIntent.updateMany({
    where: { id: input.intentId, consumedAt: null, revokedAt: null },
    data: { revokedAt: now, passwordHash: DUMMY_PASSWORD_HASH },
  });
}

/** Put the previous token back when a replacement email was not sent. */
export async function restoreRegistrationIntentToken(input: {
  intentId: string;
  tokenHash: string;
  expiresAt: Date;
  replacementTokenHash: string;
}): Promise<void> {
  await getPrisma().clinicRegistrationIntent.updateMany({
    where: {
      id: input.intentId,
      tokenHash: input.replacementTokenHash,
      consumedAt: null,
      revokedAt: null,
    },
    data: {
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
    },
  });
}

async function lockRegistrationEmail(
  tx: Prisma.TransactionClient,
  email: string
): Promise<void> {
  const key = registrationIntentLockKey(email);
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
}

async function registrationEmailIsClaimed(
  db: RegistrationDb,
  email: string
): Promise<boolean> {
  const user = await db.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (user) {
    return true;
  }
  const emailChange = await db.accountToken.findFirst({
    where: {
      type: AccountTokenType.EMAIL_CHANGE,
      email,
      consumedAt: null,
      revokedAt: null,
    },
    select: { id: true },
  });
  return emailChange !== null;
}

/**
 * Recheck hostname issuance under the existing tenant-slug advisory lock.
 * Callers keep that lock until their transaction commits. Returning a message
 * does not write a reservation.
 */
export async function registrationSlugBlock(
  tx: Prisma.TransactionClient,
  slug: string
): Promise<string | null> {
  const policy = registrationSlugPolicyMessage(slug);
  if (policy) {
    return policy;
  }
  await lockTenantSlugs(tx, [slug]);
  if (await tenantSlugIsRetired(tx, slug)) {
    return RETIRED_TENANT_SLUG_MESSAGE;
  }
  const clinic = await tx.clinic.findUnique({
    where: { slug },
    select: { id: true },
  });
  const site = await tx.clinicSite.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (clinic || site) {
    return REGISTRATION_SLUG_TAKEN_MESSAGE;
  }
  return null;
}

async function revokeLiveRegistrationIntents(
  tx: Prisma.TransactionClient,
  email: string,
  now: Date
): Promise<void> {
  await tx.clinicRegistrationIntent.updateMany({
    where: { email, consumedAt: null, revokedAt: null },
    data: { revokedAt: now, passwordHash: DUMMY_PASSWORD_HASH },
  });
}

function intentCreateData(
  value: ValidRegistrationInput,
  secrets: { passwordHash: string; tokenHash: string; expiresAt: Date }
) {
  return {
    email: value.email,
    ownerName: value.ownerName,
    passwordHash: secrets.passwordHash,
    practiceName: value.practiceName,
    slug: value.slug,
    serviceCategories: value.serviceCategories,
    commercialPlan: value.commercialPlan,
    billingInterval: value.billingInterval,
    termsVersion: value.termsVersion,
    privacyVersionAcknowledged: value.privacyVersionAcknowledged,
    tokenHash: secrets.tokenHash,
    expiresAt: secrets.expiresAt,
  };
}

function toView(row: {
  id: string;
  email: string;
  ownerName: string;
  practiceName: string;
  slug: string;
  serviceCategories: RegistrationIntentView["serviceCategories"];
  commercialPlan: string;
  billingInterval: string;
  termsVersion: string;
  privacyVersionAcknowledged: string;
  expiresAt: Date;
}): RegistrationIntentView {
  if (row.commercialPlan !== "ESSENTIAL" && row.commercialPlan !== "PRACTICE") {
    throw new Error("registration_intent_plan_invalid");
  }
  if (row.billingInterval !== "MONTHLY" && row.billingInterval !== "YEARLY") {
    throw new Error("registration_intent_interval_invalid");
  }
  return {
    id: row.id,
    email: row.email,
    ownerName: row.ownerName,
    practiceName: row.practiceName,
    slug: row.slug,
    serviceCategories: row.serviceCategories,
    commercialPlan: row.commercialPlan,
    billingInterval: row.billingInterval,
    termsVersion: row.termsVersion,
    privacyVersionAcknowledged: row.privacyVersionAcknowledged,
    expiresAt: row.expiresAt,
  };
}

function toSecret(row: {
  id: string;
  email: string;
  ownerName: string;
  passwordHash: string;
  practiceName: string;
  slug: string;
  serviceCategories: RegistrationIntentView["serviceCategories"];
  commercialPlan: string;
  billingInterval: string;
  termsVersion: string;
  privacyVersionAcknowledged: string;
  expiresAt: Date;
}): RegistrationIntentSecret {
  return { ...toView(row), passwordHash: row.passwordHash };
}

function hashRawTokenOrNull(rawToken: string): string | null {
  if (!isWellFormedRawAccountToken(rawToken)) {
    return null;
  }
  return hashAccountToken(rawToken);
}
