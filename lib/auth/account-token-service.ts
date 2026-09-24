import "server-only";

import {
  AccountTokenType,
  ClinicMembershipRole,
  PlatformRole,
  Prisma,
  type PrismaClient,
} from "@prisma/client";

import {
  emailChangeExpiresAt,
  generateAccountToken,
  hashAccountToken,
  invitationExpiresAt,
  passwordResetCooldownSince,
  passwordResetExpiresAt,
} from "@/lib/auth/account-token";
import { LOGIN_EMAIL_MAX_LENGTH } from "@/lib/auth/login-input";
import { lockClinicTeamCapacity } from "@/lib/entitlements/locks";
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

export type PasswordResetTokenCreateResult =
  | { created: true; rawToken: string; token: AccountTokenRecord }
  | { created: false; reason: "cooldown" };

export type CompletePasswordResetResult =
  | { ok: true; userId: string; tokenId: string }
  | { ok: false; reason: AccountTokenLookupFailureReason };

export type CompleteInvitationResult =
  | {
      ok: true;
      userId: string;
      tokenId: string;
      clinicId: string;
      role: ClinicMembershipRole;
    }
  | {
      ok: false;
      reason: AccountTokenLookupFailureReason | "stale_user";
    };

export type CreateEmailChangeTokenResult =
  | { created: true; rawToken: string; token: AccountTokenRecord }
  | { created: false; reason: "email_taken" };

export type CompleteEmailChangeResult =
  | { ok: true; userId: string; tokenId: string; email: string }
  | {
      ok: false;
      reason: AccountTokenLookupFailureReason | "email_taken" | "stale_user";
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

function invitationAcceptanceIsStale(input: {
  user: {
    email: string;
    passwordHash: string | null;
    platformRole: PlatformRole;
  } | null;
  clinic: { id: string } | null;
  tokenEmail: string;
  membershipCount: number;
}): boolean {
  return (
    !input.user ||
    !input.clinic ||
    input.user.email !== input.tokenEmail ||
    input.user.passwordHash !== null ||
    input.user.platformRole !== PlatformRole.NONE ||
    input.membershipCount !== 0
  );
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

async function revokeOutstandingEmailChangeTokens(
  client: AccountTokenClient,
  userId: string,
  now: Date,
  exceptTokenId?: string
): Promise<void> {
  await client.accountToken.updateMany({
    where: {
      userId,
      type: AccountTokenType.EMAIL_CHANGE,
      consumedAt: null,
      revokedAt: null,
      ...(exceptTokenId ? { id: { not: exceptTokenId } } : {}),
    },
    data: { revokedAt: now },
  });
}

async function revokeAllOutstandingInvitationTokens(
  client: AccountTokenClient,
  userId: string,
  now: Date,
  exceptTokenId?: string
): Promise<void> {
  await client.accountToken.updateMany({
    where: {
      userId,
      type: AccountTokenType.INVITATION,
      consumedAt: null,
      revokedAt: null,
      ...(exceptTokenId ? { id: { not: exceptTokenId } } : {}),
    },
    data: { revokedAt: now },
  });
}

function hasTransaction(client: AccountTokenClient): client is PrismaClient {
  return typeof (client as PrismaClient).$transaction === "function";
}

async function runInvitationMutation<T>(
  client: AccountTokenClient,
  userId: string,
  clinicId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  if (hasTransaction(client)) {
    return client.$transaction(async (tx) => {
      await lockOutstandingScope(
        tx,
        `account-token:${AccountTokenType.INVITATION}:${userId}:${clinicId}`
      );
      return fn(tx);
    });
  }

  await lockOutstandingScope(
    client,
    `account-token:${AccountTokenType.INVITATION}:${userId}:${clinicId}`
  );
  return fn(client);
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

export async function createPasswordResetTokenIfAllowed(input: {
  userId: string;
  email: string;
  now?: Date;
  prisma?: PrismaClient;
}): Promise<PasswordResetTokenCreateResult> {
  const now = input.now ?? new Date();
  const email = normalizeAccountTokenEmail(input.email);
  const prisma = input.prisma ?? getPrisma();
  const cooldownSince = passwordResetCooldownSince(now);

  return prisma.$transaction(async (tx) => {
    await lockOutstandingScope(
      tx,
      `account-token:${AccountTokenType.PASSWORD_RESET}:${input.userId}`
    );

    const recentOutstanding = await tx.accountToken.findFirst({
      where: {
        userId: input.userId,
        type: AccountTokenType.PASSWORD_RESET,
        consumedAt: null,
        revokedAt: null,
        createdAt: { gt: cooldownSince },
      },
      select: { id: true },
    });

    if (recentOutstanding) {
      return { created: false, reason: "cooldown" };
    }

    await revokeOutstandingPasswordResetTokens(tx, input.userId, now);
    const rawToken = generateAccountToken();
    const tokenHash = hashAccountToken(rawToken);
    const row = await tx.accountToken.create({
      data: {
        type: AccountTokenType.PASSWORD_RESET,
        tokenHash,
        userId: input.userId,
        email,
        expiresAt: passwordResetExpiresAt(now),
        createdAt: now,
      },
    });

    return { created: true, rawToken, token: toRecord(row) };
  });
}

export async function completePasswordReset(input: {
  rawToken: string;
  passwordHash: string;
  now?: Date;
  prisma?: PrismaClient;
}): Promise<CompletePasswordResetResult> {
  const tokenHash = hashRawTokenOrMissing(input.rawToken);
  if (!tokenHash) {
    return { ok: false, reason: "missing" };
  }

  const now = input.now ?? new Date();
  const prisma = input.prisma ?? getPrisma();

  return prisma.$transaction(async (tx) => {
    const existing = await tx.accountToken.findUnique({
      where: { tokenHash },
    });
    const failure = evaluateToken(
      existing,
      AccountTokenType.PASSWORD_RESET,
      now
    );
    if (failure || !existing) {
      return { ok: false, reason: failure ?? "missing" };
    }

    await lockOutstandingScope(
      tx,
      `account-token:${AccountTokenType.PASSWORD_RESET}:${existing.userId}`
    );

    const consumed = await tx.accountToken.updateMany({
      where: {
        id: existing.id,
        type: AccountTokenType.PASSWORD_RESET,
        consumedAt: null,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      data: { consumedAt: now },
    });

    if (consumed.count !== 1) {
      const latest = await tx.accountToken.findUnique({
        where: { id: existing.id },
      });
      const latestFailure = evaluateToken(
        latest,
        AccountTokenType.PASSWORD_RESET,
        now
      );
      return { ok: false, reason: latestFailure ?? "missing" };
    }

    await tx.user.update({
      where: { id: existing.userId },
      data: { passwordHash: input.passwordHash },
    });
    await tx.session.deleteMany({
      where: { userId: existing.userId },
    });
    await revokeOutstandingPasswordResetTokens(tx, existing.userId, now);

    return {
      ok: true,
      userId: existing.userId,
      tokenId: existing.id,
    };
  });
}

export async function createInvitationToken(input: {
  userId: string;
  clinicId: string;
  role: ClinicMembershipRole;
  email: string;
  invitedByUserId: string;
  now?: Date;
  prisma?: AccountTokenClient;
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

  const row = await runInvitationMutation(
    prisma,
    input.userId,
    input.clinicId,
    async (tx) => {
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
    }
  );

  return { rawToken, token: toRecord(row) };
}

export async function completeInvitation(input: {
  rawToken: string;
  passwordHash: string;
  now?: Date;
  prisma?: PrismaClient;
}): Promise<CompleteInvitationResult> {
  const tokenHash = hashRawTokenOrMissing(input.rawToken);
  if (!tokenHash) {
    return { ok: false, reason: "missing" };
  }

  const now = input.now ?? new Date();
  const prisma = input.prisma ?? getPrisma();

  return prisma.$transaction(async (tx) => {
    const existing = await tx.accountToken.findUnique({
      where: { tokenHash },
    });
    const failure = evaluateToken(existing, AccountTokenType.INVITATION, now);
    if (failure || !existing) {
      return { ok: false, reason: failure ?? "missing" };
    }

    if (!existing.clinicId || !existing.role) {
      return { ok: false, reason: "stale_user" };
    }

    // Hold the team-capacity lock across token consumption and membership
    // creation so a concurrent invite cannot observe a gap where neither
    // the reservation nor the membership occupies the place. Acceptance
    // does not take a second place.
    await lockClinicTeamCapacity(tx, existing.clinicId);
    await lockOutstandingScope(tx, `clinic-access:${existing.userId}`);
    await lockOutstandingScope(
      tx,
      `account-token:${AccountTokenType.INVITATION}:${existing.userId}:${existing.clinicId}`
    );

    const latest = await tx.accountToken.findUnique({
      where: { id: existing.id },
    });
    const latestFailure = evaluateToken(
      latest,
      AccountTokenType.INVITATION,
      now
    );
    if (latestFailure || !latest || !latest.clinicId || !latest.role) {
      return { ok: false, reason: latestFailure ?? "missing" };
    }

    const [user, clinic, membershipCount] = await Promise.all([
      tx.user.findUnique({
        where: { id: latest.userId },
        select: {
          id: true,
          email: true,
          passwordHash: true,
          platformRole: true,
        },
      }),
      tx.clinic.findUnique({
        where: { id: latest.clinicId },
        select: { id: true },
      }),
      tx.clinicMembership.count({
        where: { userId: latest.userId },
      }),
    ]);

    if (
      invitationAcceptanceIsStale({
        user,
        clinic,
        tokenEmail: latest.email,
        membershipCount,
      }) ||
      !user ||
      !clinic
    ) {
      return { ok: false, reason: "stale_user" };
    }

    const consumed = await tx.accountToken.updateMany({
      where: {
        id: latest.id,
        type: AccountTokenType.INVITATION,
        consumedAt: null,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      data: { consumedAt: now },
    });

    if (consumed.count !== 1) {
      const after = await tx.accountToken.findUnique({
        where: { id: latest.id },
      });
      const afterFailure = evaluateToken(
        after,
        AccountTokenType.INVITATION,
        now
      );
      return { ok: false, reason: afterFailure ?? "missing" };
    }

    await tx.user.update({
      where: { id: user.id },
      data: {
        passwordHash: input.passwordHash,
        emailVerified: now,
      },
    });
    await tx.clinicMembership.create({
      data: {
        clinicId: latest.clinicId,
        userId: user.id,
        role: latest.role,
      },
    });
    await revokeAllOutstandingInvitationTokens(tx, user.id, now, latest.id);

    return {
      ok: true,
      userId: user.id,
      tokenId: latest.id,
      clinicId: latest.clinicId,
      role: latest.role,
    };
  });
}

export async function inspectInvitation(
  rawToken: string,
  options?: { now?: Date; prisma?: AccountTokenClient }
): Promise<{ valid: boolean }> {
  const lookedUp = await lookupAccountToken(
    rawToken,
    AccountTokenType.INVITATION,
    options
  );
  if (!lookedUp.ok || !lookedUp.token.clinicId || !lookedUp.token.role) {
    return { valid: false };
  }

  const prisma = options?.prisma ?? getPrisma();
  const [user, clinic, membershipCount] = await Promise.all([
    prisma.user.findUnique({
      where: { id: lookedUp.token.userId },
      select: {
        email: true,
        passwordHash: true,
        platformRole: true,
      },
    }),
    prisma.clinic.findUnique({
      where: { id: lookedUp.token.clinicId },
      select: { id: true },
    }),
    prisma.clinicMembership.count({
      where: { userId: lookedUp.token.userId },
    }),
  ]);

  if (
    invitationAcceptanceIsStale({
      user,
      clinic,
      tokenEmail: lookedUp.token.email,
      membershipCount,
    })
  ) {
    return { valid: false };
  }

  return { valid: true };
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

export async function revokeOutstandingEmailChanges(input: {
  userId: string;
  now?: Date;
  prisma?: AccountTokenClient;
}): Promise<void> {
  await revokeOutstandingEmailChangeTokens(
    input.prisma ?? getPrisma(),
    input.userId,
    input.now ?? new Date()
  );
}

export async function findOutstandingEmailChange(input: {
  userId: string;
  now?: Date;
  prisma?: AccountTokenClient;
}): Promise<AccountTokenRecord | null> {
  const now = input.now ?? new Date();
  const prisma = input.prisma ?? getPrisma();
  const row = await prisma.accountToken.findFirst({
    where: {
      userId: input.userId,
      type: AccountTokenType.EMAIL_CHANGE,
      consumedAt: null,
      revokedAt: null,
      expiresAt: { gt: now },
    },
    orderBy: { createdAt: "desc" },
  });
  return row ? toRecord(row) : null;
}

/**
 * Another account already owns this address, or has an outstanding
 * email-change token for it. Matches the uniqueness check inside
 * createEmailChangeToken so a taken address can be refused before mail
 * delivery is attempted.
 */
export async function emailChangeTargetIsTaken(input: {
  userId: string;
  email: string;
  prisma?: PrismaClient;
}): Promise<boolean> {
  const email = normalizeAccountTokenEmail(input.email);
  const prisma = input.prisma ?? getPrisma();
  const takenUser = await prisma.user.findFirst({
    where: { email, NOT: { id: input.userId } },
    select: { id: true },
  });
  if (takenUser) {
    return true;
  }

  const takenPending = await prisma.accountToken.findFirst({
    where: {
      email,
      type: AccountTokenType.EMAIL_CHANGE,
      consumedAt: null,
      revokedAt: null,
      NOT: { userId: input.userId },
    },
    select: { id: true },
  });
  return takenPending !== null;
}

export async function createEmailChangeToken(input: {
  userId: string;
  email: string;
  now?: Date;
  prisma?: PrismaClient;
}): Promise<CreateEmailChangeTokenResult> {
  const now = input.now ?? new Date();
  const email = normalizeAccountTokenEmail(input.email);
  const prisma = input.prisma ?? getPrisma();
  const rawToken = generateAccountToken();
  const tokenHash = hashAccountToken(rawToken);

  return prisma.$transaction(async (tx) => {
    await lockOutstandingScope(tx, `user-email:${email}`);
    await lockOutstandingScope(
      tx,
      `account-token:${AccountTokenType.EMAIL_CHANGE}:${input.userId}`
    );

    const takenUser = await tx.user.findFirst({
      where: { email, NOT: { id: input.userId } },
      select: { id: true },
    });
    if (takenUser) {
      return { created: false, reason: "email_taken" as const };
    }

    const takenPending = await tx.accountToken.findFirst({
      where: {
        email,
        type: AccountTokenType.EMAIL_CHANGE,
        consumedAt: null,
        revokedAt: null,
        NOT: { userId: input.userId },
      },
      select: { id: true },
    });
    if (takenPending) {
      return { created: false, reason: "email_taken" as const };
    }

    await revokeOutstandingEmailChangeTokens(tx, input.userId, now);
    const row = await tx.accountToken.create({
      data: {
        type: AccountTokenType.EMAIL_CHANGE,
        tokenHash,
        userId: input.userId,
        email,
        expiresAt: emailChangeExpiresAt(now),
        createdAt: now,
      },
    });

    return { created: true, rawToken, token: toRecord(row) };
  });
}

export async function completeEmailChange(input: {
  rawToken: string;
  now?: Date;
  prisma?: PrismaClient;
}): Promise<CompleteEmailChangeResult> {
  const tokenHash = hashRawTokenOrMissing(input.rawToken);
  if (!tokenHash) {
    return { ok: false, reason: "missing" };
  }

  const now = input.now ?? new Date();
  const prisma = input.prisma ?? getPrisma();

  return prisma.$transaction(async (tx) => {
    const existing = await tx.accountToken.findUnique({
      where: { tokenHash },
    });
    const failure = evaluateToken(existing, AccountTokenType.EMAIL_CHANGE, now);
    if (failure || !existing) {
      return { ok: false, reason: failure ?? "missing" };
    }

    await lockOutstandingScope(tx, `user-email:${existing.email}`);
    await lockOutstandingScope(
      tx,
      `account-token:${AccountTokenType.EMAIL_CHANGE}:${existing.userId}`
    );

    const latest = await tx.accountToken.findUnique({
      where: { id: existing.id },
    });
    const latestFailure = evaluateToken(
      latest,
      AccountTokenType.EMAIL_CHANGE,
      now
    );
    if (latestFailure || !latest) {
      return { ok: false, reason: latestFailure ?? "missing" };
    }

    const user = await tx.user.findUnique({
      where: { id: latest.userId },
      select: { id: true, email: true },
    });
    if (!user) {
      return { ok: false, reason: "stale_user" };
    }

    const taken = await tx.user.findFirst({
      where: { email: latest.email, NOT: { id: user.id } },
      select: { id: true },
    });
    if (taken) {
      await tx.accountToken.updateMany({
        where: {
          id: latest.id,
          revokedAt: null,
        },
        data: { revokedAt: now },
      });
      return { ok: false, reason: "email_taken" };
    }

    const consumed = await tx.accountToken.updateMany({
      where: {
        id: latest.id,
        type: AccountTokenType.EMAIL_CHANGE,
        consumedAt: null,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      data: { consumedAt: now },
    });

    if (consumed.count !== 1) {
      const after = await tx.accountToken.findUnique({
        where: { id: latest.id },
      });
      const afterFailure = evaluateToken(
        after,
        AccountTokenType.EMAIL_CHANGE,
        now
      );
      return { ok: false, reason: afterFailure ?? "missing" };
    }

    await tx.user.update({
      where: { id: user.id },
      data: {
        email: latest.email,
        emailVerified: now,
      },
    });
    await revokeOutstandingPasswordResetTokens(tx, user.id, now);
    await revokeOutstandingEmailChangeTokens(tx, user.id, now, latest.id);

    return {
      ok: true,
      userId: user.id,
      tokenId: latest.id,
      email: latest.email,
    };
  });
}
