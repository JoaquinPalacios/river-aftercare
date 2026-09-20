import "server-only";

import { AccountTokenType, Prisma } from "@prisma/client";

import { logAccountSecurity } from "@/lib/auth/account-security-log";
import {
  PROFILE_EMAIL_INVALID_MESSAGE,
  PROFILE_EMAIL_TAKEN_MESSAGE,
  PROFILE_NAME_REQUIRED_MESSAGE,
  normalizeProfileName,
  profileEmailError,
  profileNameError,
} from "@/lib/auth/account-profile-schema";
import {
  AccountTokenError,
  normalizeAccountTokenEmail,
} from "@/lib/auth/account-token-service";
import { LOGIN_PASSWORD_MAX_LENGTH } from "@/lib/auth/login-input";
import { verifyPassword } from "@/lib/auth/password";
import {
  CURRENT_PASSWORD_INCORRECT_MESSAGE,
  CURRENT_PASSWORD_REQUIRED_MESSAGE,
  CURRENT_PASSWORD_TOO_LONG_MESSAGE,
} from "@/lib/auth/password-policy";
import { getPrisma } from "@/lib/prisma";

export type UpdateOwnProfileResult =
  | {
      ok: true;
      name: string;
      email: string;
      nameChanged: boolean;
      emailChanged: boolean;
    }
  | {
      ok: false;
      code:
        "validation" | "current_incorrect" | "email_taken" | "unauthenticated";
      error: string;
      fieldErrors?: {
        name?: string;
        email?: string;
        currentPassword?: string;
      };
    };

function isUniqueEmailConflict(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002" &&
    Array.isArray(error.meta?.target) &&
    error.meta.target.includes("email")
  );
}

export async function updateOwnProfile(input: {
  userId: string;
  name: string;
  email: string;
  currentPassword: string;
}): Promise<UpdateOwnProfileResult> {
  const nameError = profileNameError(input.name);
  if (nameError) {
    return {
      ok: false,
      code: "validation",
      error: nameError,
      fieldErrors: { name: nameError },
    };
  }

  const name = normalizeProfileName(input.name);
  if (!name) {
    return {
      ok: false,
      code: "validation",
      error: PROFILE_NAME_REQUIRED_MESSAGE,
      fieldErrors: { name: PROFILE_NAME_REQUIRED_MESSAGE },
    };
  }

  const emailFormatError = profileEmailError(input.email);
  if (emailFormatError) {
    return {
      ok: false,
      code: "validation",
      error: emailFormatError,
      fieldErrors: { email: emailFormatError },
    };
  }

  let email: string;
  try {
    email = normalizeAccountTokenEmail(input.email);
  } catch (error) {
    if (error instanceof AccountTokenError) {
      return {
        ok: false,
        code: "validation",
        error: PROFILE_EMAIL_INVALID_MESSAGE,
        fieldErrors: { email: PROFILE_EMAIL_INVALID_MESSAGE },
      };
    }
    throw error;
  }

  const user = await getPrisma().user.findUnique({
    where: { id: input.userId },
    select: {
      id: true,
      name: true,
      email: true,
      passwordHash: true,
    },
  });

  if (!user) {
    return {
      ok: false,
      code: "unauthenticated",
      error: "Sign in to update your account.",
    };
  }

  const nameChanged = (user.name ?? "") !== name;
  const emailChanged = user.email !== email;

  if (!nameChanged && !emailChanged) {
    return {
      ok: true,
      name,
      email,
      nameChanged: false,
      emailChanged: false,
    };
  }

  if (emailChanged) {
    if (!input.currentPassword) {
      return {
        ok: false,
        code: "validation",
        error: CURRENT_PASSWORD_REQUIRED_MESSAGE,
        fieldErrors: { currentPassword: CURRENT_PASSWORD_REQUIRED_MESSAGE },
      };
    }
    if (input.currentPassword.length > LOGIN_PASSWORD_MAX_LENGTH) {
      return {
        ok: false,
        code: "validation",
        error: CURRENT_PASSWORD_TOO_LONG_MESSAGE,
        fieldErrors: { currentPassword: CURRENT_PASSWORD_TOO_LONG_MESSAGE },
      };
    }
    if (!verifyPassword(input.currentPassword, user.passwordHash)) {
      return {
        ok: false,
        code: "current_incorrect",
        error: CURRENT_PASSWORD_INCORRECT_MESSAGE,
        fieldErrors: { currentPassword: CURRENT_PASSWORD_INCORRECT_MESSAGE },
      };
    }
  }

  try {
    await getPrisma().$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`user-email:${email}`}))`;

      if (emailChanged) {
        const taken = await tx.user.findFirst({
          where: { email, NOT: { id: user.id } },
          select: { id: true },
        });
        if (taken) {
          throw new EmailTakenError();
        }
      }

      await tx.user.update({
        where: { id: user.id },
        data: {
          name,
          ...(emailChanged ? { email, emailVerified: null } : {}),
        },
      });

      if (emailChanged) {
        await tx.accountToken.updateMany({
          where: {
            userId: user.id,
            type: AccountTokenType.PASSWORD_RESET,
            consumedAt: null,
            revokedAt: null,
          },
          data: { revokedAt: new Date() },
        });
      }
    });
  } catch (error) {
    if (error instanceof EmailTakenError || isUniqueEmailConflict(error)) {
      return {
        ok: false,
        code: "email_taken",
        error: PROFILE_EMAIL_TAKEN_MESSAGE,
        fieldErrors: { email: PROFILE_EMAIL_TAKEN_MESSAGE },
      };
    }
    throw error;
  }

  if (nameChanged) {
    logAccountSecurity({ event: "profile_name_changed", userId: user.id });
  }
  if (emailChanged) {
    logAccountSecurity({ event: "email_changed", userId: user.id });
  }

  return {
    ok: true,
    name,
    email,
    nameChanged,
    emailChanged,
  };
}

class EmailTakenError extends Error {
  constructor() {
    super(PROFILE_EMAIL_TAKEN_MESSAGE);
    this.name = "EmailTakenError";
  }
}
