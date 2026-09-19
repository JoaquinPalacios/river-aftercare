import "server-only";

import {
  completeInvitation,
  inspectInvitation,
} from "@/lib/auth/account-token-service";
import { isWellFormedRawAccountToken } from "@/lib/auth/account-token-format";
import { logInvitationLifecycle } from "@/lib/auth/invitation-lifecycle-log";
import { hashPassword } from "@/lib/auth/password";
import {
  INVITATION_INVALID_LINK_MESSAGE,
  confirmNewPasswordError,
} from "@/lib/auth/password-policy";

export type AcceptInvitationResult =
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

export async function getInvitationAcceptanceStatus(input: {
  rawToken: string;
  now?: Date;
}): Promise<{ valid: boolean }> {
  if (!isWellFormedRawAccountToken(input.rawToken)) {
    return { valid: false };
  }

  return inspectInvitation(input.rawToken, { now: input.now });
}

export async function acceptInvitationWithToken(input: {
  rawToken: string;
  newPassword: string;
  confirmPassword: string;
  now?: Date;
}): Promise<AcceptInvitationResult> {
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
      error: INVITATION_INVALID_LINK_MESSAGE,
      fieldErrors: { token: INVITATION_INVALID_LINK_MESSAGE },
    };
  }

  const passwordHash = hashPassword(input.newPassword);
  const completed = await completeInvitation({
    rawToken: input.rawToken,
    passwordHash,
    now: input.now,
  });

  if (!completed.ok) {
    return {
      ok: false,
      code: "invalid_token",
      error: INVITATION_INVALID_LINK_MESSAGE,
      fieldErrors: { token: INVITATION_INVALID_LINK_MESSAGE },
    };
  }

  logInvitationLifecycle({
    event: "invitation_accepted",
    userId: completed.userId,
    clinicId: completed.clinicId,
  });

  return { ok: true };
}
