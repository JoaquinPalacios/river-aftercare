import "server-only";

import { isWellFormedRawAccountToken } from "@/lib/auth/account-token-format";
import { completePasswordReset } from "@/lib/auth/account-token-service";
import { hashPassword } from "@/lib/auth/password";
import { logPasswordLifecycle } from "@/lib/auth/password-lifecycle-log";
import {
  PASSWORD_RESET_INVALID_LINK_MESSAGE,
  confirmNewPasswordError,
} from "@/lib/auth/password-policy";

export type ResetPasswordResult =
  | { ok: true }
  | {
      ok: false;
      code: "validation" | "invalid_token";
      error: string;
      fieldErrors?: {
        newPassword?: string;
        confirmPassword?: string;
        token?: string;
      };
    };

export async function resetPasswordWithToken(input: {
  rawToken: string;
  newPassword: string;
  confirmPassword: string;
  now?: Date;
}): Promise<ResetPasswordResult> {
  const newPasswordError = confirmNewPasswordError(
    input.newPassword,
    input.confirmPassword
  );
  if (newPasswordError) {
    const confirmMismatch = input.newPassword !== input.confirmPassword;
    return {
      ok: false,
      code: "validation",
      error: newPasswordError,
      fieldErrors: confirmMismatch
        ? { confirmPassword: newPasswordError }
        : { newPassword: newPasswordError },
    };
  }

  if (!isWellFormedRawAccountToken(input.rawToken)) {
    return {
      ok: false,
      code: "invalid_token",
      error: PASSWORD_RESET_INVALID_LINK_MESSAGE,
      fieldErrors: { token: PASSWORD_RESET_INVALID_LINK_MESSAGE },
    };
  }

  const passwordHash = hashPassword(input.newPassword);
  const completed = await completePasswordReset({
    rawToken: input.rawToken,
    passwordHash,
    now: input.now,
  });

  if (!completed.ok) {
    return {
      ok: false,
      code: "invalid_token",
      error: PASSWORD_RESET_INVALID_LINK_MESSAGE,
      fieldErrors: { token: PASSWORD_RESET_INVALID_LINK_MESSAGE },
    };
  }

  logPasswordLifecycle({
    event: "password_reset_completed",
    userId: completed.userId,
  });

  return { ok: true };
}
