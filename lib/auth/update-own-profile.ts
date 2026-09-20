import "server-only";

import { requestEmailChange } from "@/lib/auth/request-email-change";
import { logAccountSecurity } from "@/lib/auth/account-security-log";
import {
  PROFILE_EMAIL_INVALID_MESSAGE,
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
      pendingEmail: string | null;
    }
  | {
      ok: false;
      code:
        | "validation"
        | "current_incorrect"
        | "email_taken"
        | "delivery_failed"
        | "unauthenticated";
      error: string;
      fieldErrors?: {
        name?: string;
        email?: string;
        currentPassword?: string;
      };
    };

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
      email: user.email,
      nameChanged: false,
      emailChanged: false,
      pendingEmail: null,
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

  if (nameChanged) {
    await getPrisma().user.update({
      where: { id: user.id },
      data: { name },
    });
    logAccountSecurity({ event: "profile_name_changed", userId: user.id });
  }

  let pendingEmail: string | null = null;
  if (emailChanged) {
    const requested = await requestEmailChange({
      userId: user.id,
      email,
    });
    if (!requested.ok) {
      return {
        ok: false,
        code: requested.code,
        error: requested.error,
        fieldErrors:
          requested.code === "email_taken"
            ? { email: requested.error }
            : requested.code === "validation"
              ? { email: requested.error }
              : undefined,
      };
    }
    pendingEmail = requested.pendingEmail;
  }

  return {
    ok: true,
    name,
    email: user.email,
    nameChanged,
    emailChanged,
    pendingEmail,
  };
}
