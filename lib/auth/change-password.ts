import "server-only";

import { LOGIN_PASSWORD_MAX_LENGTH } from "@/lib/auth/login-input";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { logPasswordLifecycle } from "@/lib/auth/password-lifecycle-log";
import {
  CURRENT_PASSWORD_INCORRECT_MESSAGE,
  CURRENT_PASSWORD_REQUIRED_MESSAGE,
  CURRENT_PASSWORD_TOO_LONG_MESSAGE,
  confirmNewPasswordError,
} from "@/lib/auth/password-policy";
import {
  createDatabaseSession,
  deleteDatabaseSessionsForUser,
  type DatabaseSessionRecord,
} from "@/lib/auth/session";
import { getPrisma } from "@/lib/prisma";

export type ChangePasswordResult =
  | { ok: true; session: DatabaseSessionRecord }
  | {
      ok: false;
      code: "validation" | "current_incorrect" | "unauthenticated";
      error: string;
      fieldErrors?: {
        currentPassword?: string;
        newPassword?: string;
        confirmPassword?: string;
      };
    };

export async function changeAuthenticatedUserPassword(input: {
  userId: string;
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}): Promise<ChangePasswordResult> {
  const currentPassword = input.currentPassword;
  const newPassword = input.newPassword;
  const confirmPassword = input.confirmPassword;

  if (!currentPassword) {
    return {
      ok: false,
      code: "validation",
      error: CURRENT_PASSWORD_REQUIRED_MESSAGE,
      fieldErrors: { currentPassword: CURRENT_PASSWORD_REQUIRED_MESSAGE },
    };
  }

  if (currentPassword.length > LOGIN_PASSWORD_MAX_LENGTH) {
    return {
      ok: false,
      code: "validation",
      error: CURRENT_PASSWORD_TOO_LONG_MESSAGE,
      fieldErrors: { currentPassword: CURRENT_PASSWORD_TOO_LONG_MESSAGE },
    };
  }

  const newPasswordError = confirmNewPasswordError(
    newPassword,
    confirmPassword
  );
  if (newPasswordError) {
    const confirmMismatch = newPassword !== confirmPassword;
    return {
      ok: false,
      code: "validation",
      error: newPasswordError,
      fieldErrors: confirmMismatch
        ? { confirmPassword: newPasswordError }
        : { newPassword: newPasswordError },
    };
  }

  const user = await getPrisma().user.findUnique({
    where: { id: input.userId },
    select: {
      id: true,
      passwordHash: true,
    },
  });

  if (!user) {
    return {
      ok: false,
      code: "unauthenticated",
      error: "Sign in to change your password.",
    };
  }

  if (!verifyPassword(currentPassword, user.passwordHash)) {
    return {
      ok: false,
      code: "current_incorrect",
      error: CURRENT_PASSWORD_INCORRECT_MESSAGE,
      fieldErrors: { currentPassword: CURRENT_PASSWORD_INCORRECT_MESSAGE },
    };
  }

  const passwordHash = hashPassword(newPassword);

  const session = await getPrisma().$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });
    await deleteDatabaseSessionsForUser(user.id, tx);
    return createDatabaseSession(user.id, tx);
  });

  logPasswordLifecycle({ event: "password_changed", userId: user.id });

  return { ok: true, session };
}
