import "server-only";

import {
  AccountTokenType,
  ClinicMembershipRole,
  Prisma,
  type PrismaClient,
} from "@prisma/client";

import {
  generateAccountToken,
  hashAccountToken,
  invitationExpiresAt,
  passwordResetExpiresAt,
} from "@/lib/auth/account-token";
import { LOGIN_EMAIL_MAX_LENGTH } from "@/lib/auth/login-input";
import { parseEmailAddress } from "@/lib/email/mailbox";
import { getPrisma } from "@/lib/prisma";

type AccountTokenClient = PrismaClient | Prisma.TransactionClient;

export type AccountTokenRecord = {
  id: string;
  type: AccountTokenType;
  userId: string;
  clinicId: string | null;
  role: ClinicMembershipRole | null;
  email: string;
  invitedByUserId: string | null;
  expiresAt: Date;
  consumedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
};

export type AccountTokenLookupFailureReason =
  "missing" | "wrong_type" | "expired" | "consumed" | "revoked";

export type AccountTokenLookupResult =
  | { ok: true; token: AccountTokenRecord }
  | { ok: false; reason: AccountTokenLookupFailureReason };

export type CreatedAccountToken = {
  rawToken: string;
  token: AccountTokenRecord;
};

export class AccountTokenError extends Error {
  constructor(readonly code: "invalid_email" | "invalid_invitation") {
    super(code);
    this.name = "AccountTokenError";
  }
}

function toRecord(row: {
  id: string;
  type: AccountTokenType;
  userId: string;
  clinicId: string | null;
  role: ClinicMembershipRole | null;
  email: string;
  invitedByUserId: string | null;
  expiresAt: Date;
  consumedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}): AccountTokenRecord {
  return {
    id: row.id,
    type: row.type,
    userId: row.userId,
    clinicId: row.clinicId,
    role: row.role,
    email: row.email,
    invitedByUserId: row.invitedByUserId,
    expiresAt: row.expiresAt,
    consumedAt: row.consumedAt,
    revokedAt: row.revokedAt,
    createdAt: row.createdAt,
  };
}

export function normalizeAccountTokenEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  if (
    !normalized ||
    normalized.length > LOGIN_EMAIL_MAX_LENGTH ||
    !parseEmailAddress(normalized)
  ) {
    throw new AccountTokenError("invalid_email");
  }
  return normalized;
}

function evaluateToken(
  row: {
    type: AccountTokenType;
    expiresAt: Date;
    consumedAt: Date | null;
    revokedAt: Date | null;
  } | null,
  expectedType: AccountTokenType,
  now: Date
): AccountTokenLookupFailureReason | null {
  if (!row) {
    return "missing";
  }
  if (row.type !== expectedType) {
    return "wrong_type";
  }
  if (row.revokedAt) {
    return "revoked";
  }
  if (row.consumedAt) {
    return "consumed";
  }
  if (row.expiresAt.getTime() <= now.getTime()) {
    return "expired";
  }
  return null;
}

function hashRawTokenOrMissing(rawToken: string): string | null {
  try {
    return hashAccountToken(rawToken);
  } catch {
    return null;
  }
}

async function lockOutstandingScope(
  tx: Prisma.TransactionClient,
  key: string
): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
}

async function revokeOutstandingPasswordResetTokens(
  client: AccountTokenClient,
  userId: string,
  now: Date
): Promise<void> {
  await client.accountToken.updateMany({
    where: {
      userId,
      type: AccountTokenType.PASSWORD_RESET,
      consumedAt: null,
      revokedAt: null,
    },
    data: { revokedAt: now },
  });
}

async function revokeOutstandingInvitationTokens(
  client: AccountTokenClient,
  userId: string,
  clinicId: string,
  now: Date
): Promise<void> {
  await client.accountToken.updateMany({
    where: {
      userId,
      clinicId,
      type: AccountTokenType.INVITATION,
      consumedAt: null,
      revokedAt: null,
    },
    data: { revokedAt: now },
  });
}

export async function createPasswordResetToken(input: {
  userId: string;
  email: string;
  now?: Date;
  prisma?: PrismaClient;
}): Promise<CreatedAccountToken> {
  const now = input.now ?? new Date();
  const email = normalizeAccountTokenEmail(input.email);
  const prisma = input.prisma ?? getPrisma();
  const rawToken = generateAccountToken();
  const tokenHash = hashAccountToken(rawToken);
  const expiresAt = passwordResetExpiresAt(now);

  const row = await prisma.$transaction(async (tx) => {
    await lockOutstandingScope(
      tx,
      `account-token:${AccountTokenType.PASSWORD_RESET}:${input.userId}`
    );
    await revokeOutstandingPasswordResetTokens(tx, input.userId, now);
    return tx.accountToken.create({
      data: {
        type: AccountTokenType.PASSWORD_RESET,
        tokenHash,
        userId: input.userId,
        email,
        expiresAt,
        createdAt: now,
      },
    });
  });

  return { rawToken, token: toRecord(row) };
}

export async function createInvitationToken(input: {
  userId: string;
  clinicId: string;
  role: ClinicMembershipRole;
  email: string;
  invitedByUserId: string;
  now?: Date;
  prisma?: PrismaClient;
}): Promise<CreatedAccountToken> {
  if (!input.clinicId || !input.role || !input.invitedByUserId) {
    throw new AccountTokenError("invalid_invitation");
  }

  const now = input.now ?? new Date();
  const email = normalizeAccountTokenEmail(input.email);
  const prisma = input.prisma ?? getPrisma();
  const rawToken = generateAccountToken();
  const tokenHash = hashAccountToken(rawToken);
  const expiresAt = invitationExpiresAt(now);

  const row = await prisma.$transaction(async (tx) => {
    await lockOutstandingScope(
      tx,
      `account-token:${AccountTokenType.INVITATION}:${input.userId}:${input.clinicId}`
    );
    await revokeOutstandingInvitationTokens(
      tx,
      input.userId,
      input.clinicId,
      now
    );
    return tx.accountToken.create({
      data: {
        type: AccountTokenType.INVITATION,
        tokenHash,
        userId: input.userId,
        clinicId: input.clinicId,
        role: input.role,
        email,
        invitedByUserId: input.invitedByUserId,
        expiresAt,
        createdAt: now,
      },
    });
  });

  return { rawToken, token: toRecord(row) };
}

export async function lookupAccountToken(
  rawToken: string,
  expectedType: AccountTokenType,
  options?: { now?: Date; prisma?: AccountTokenClient }
): Promise<AccountTokenLookupResult> {
  const tokenHash = hashRawTokenOrMissing(rawToken);
  if (!tokenHash) {
    return { ok: false, reason: "missing" };
  }

  const now = options?.now ?? new Date();
  const prisma = options?.prisma ?? getPrisma();
  const row = await prisma.accountToken.findUnique({
    where: { tokenHash },
  });
  const failure = evaluateToken(row, expectedType, now);
  if (failure) {
    return { ok: false, reason: failure };
  }
  if (!row) {
    return { ok: false, reason: "missing" };
  }
  return { ok: true, token: toRecord(row) };
}

export async function consumeAccountToken(
  id: string,
  options: {
    expectedType: AccountTokenType;
    now?: Date;
    prisma?: AccountTokenClient;
  }
): Promise<AccountTokenLookupResult> {
  const now = options.now ?? new Date();
  const prisma = options.prisma ?? getPrisma();
  const existing = await prisma.accountToken.findUnique({
    where: { id },
  });
  const failure = evaluateToken(existing, options.expectedType, now);
  if (failure) {
    return { ok: false, reason: failure };
  }

  const updated = await prisma.accountToken.updateMany({
    where: {
      id,
      type: options.expectedType,
      consumedAt: null,
      revokedAt: null,
      expiresAt: { gt: now },
    },
    data: { consumedAt: now },
  });

  if (updated.count !== 1) {
    const latest = await prisma.accountToken.findUnique({ where: { id } });
    const latestFailure = evaluateToken(latest, options.expectedType, now);
    return { ok: false, reason: latestFailure ?? "missing" };
  }

  const consumed = await prisma.accountToken.findUnique({ where: { id } });
  if (!consumed) {
    return { ok: false, reason: "missing" };
  }
  return { ok: true, token: toRecord(consumed) };
}

export async function revokeAccountToken(
  id: string,
  options?: { now?: Date; prisma?: AccountTokenClient }
): Promise<void> {
  const now = options?.now ?? new Date();
  const prisma = options?.prisma ?? getPrisma();
  await prisma.accountToken.updateMany({
    where: {
      id,
      revokedAt: null,
    },
    data: { revokedAt: now },
  });
}

export async function revokeOutstandingPasswordResets(input: {
  userId: string;
  now?: Date;
  prisma?: AccountTokenClient;
}): Promise<void> {
  await revokeOutstandingPasswordResetTokens(
    input.prisma ?? getPrisma(),
    input.userId,
    input.now ?? new Date()
  );
}

export async function revokeOutstandingInvitations(input: {
  userId: string;
  clinicId: string;
  now?: Date;
  prisma?: AccountTokenClient;
}): Promise<void> {
  await revokeOutstandingInvitationTokens(
    input.prisma ?? getPrisma(),
    input.userId,
    input.clinicId,
    input.now ?? new Date()
  );
}
