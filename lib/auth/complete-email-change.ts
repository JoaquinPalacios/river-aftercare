import "server-only";

import { AccountTokenType } from "@prisma/client";

import { isWellFormedRawAccountToken } from "@/lib/auth/account-token-format";
import {
  completeEmailChange as consumeEmailChangeToken,
  lookupAccountToken,
} from "@/lib/auth/account-token-service";
import { logAccountSecurity } from "@/lib/auth/account-security-log";
import {
  EMAIL_CHANGE_INVALID_LINK_MESSAGE,
  PROFILE_EMAIL_TAKEN_MESSAGE,
} from "@/lib/auth/account-profile-schema";

export type CompleteEmailChangeWithTokenResult =
  | { ok: true; userId: string; email: string }
  | {
      ok: false;
      code: "invalid_token" | "email_taken";
      error: string;
    };

export async function getEmailChangeStatus(input: {
  rawToken: string;
  now?: Date;
}): Promise<{ valid: boolean }> {
  if (!isWellFormedRawAccountToken(input.rawToken)) {
    return { valid: false };
  }

  const lookedUp = await lookupAccountToken(
    input.rawToken,
    AccountTokenType.EMAIL_CHANGE,
    { now: input.now }
  );
  return { valid: lookedUp.ok };
}

export async function completeEmailChangeWithToken(input: {
  rawToken: string;
  now?: Date;
}): Promise<CompleteEmailChangeWithTokenResult> {
  if (!isWellFormedRawAccountToken(input.rawToken)) {
    return {
      ok: false,
      code: "invalid_token",
      error: EMAIL_CHANGE_INVALID_LINK_MESSAGE,
    };
  }

  const completed = await consumeEmailChangeToken({
    rawToken: input.rawToken,
    now: input.now,
  });

  if (!completed.ok) {
    if (completed.reason === "email_taken") {
      return {
        ok: false,
        code: "email_taken",
        error: PROFILE_EMAIL_TAKEN_MESSAGE,
      };
    }
    return {
      ok: false,
      code: "invalid_token",
      error: EMAIL_CHANGE_INVALID_LINK_MESSAGE,
    };
  }

  logAccountSecurity({
    event: "email_change_completed",
    userId: completed.userId,
  });

  return {
    ok: true,
    userId: completed.userId,
    email: completed.email,
  };
}
