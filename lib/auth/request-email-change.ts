import "server-only";

import {
  AccountTokenError,
  createEmailChangeToken,
  normalizeAccountTokenEmail,
  revokeAccountToken,
} from "@/lib/auth/account-token-service";
import { logAccountSecurity } from "@/lib/auth/account-security-log";
import { PROFILE_EMAIL_TAKEN_MESSAGE } from "@/lib/auth/account-profile-schema";
import {
  getAuthEmailDeliveryConfig,
  sendAuthTransactionalEmail,
} from "@/lib/email/auth-email";
import { composeEmailChangeEmail } from "@/lib/email/email-change-mail";
import { reportAuthEmailFailure } from "@/lib/observability/report-server-exception";
import { buildEmailChangeUrl } from "@/lib/tenancy/staff-app-origin";

export const EMAIL_CHANGE_DELIVERY_FAILED_MESSAGE =
  "Unable to send the confirmation email. Try again.";

export type RequestEmailChangeResult =
  | { ok: true; pendingEmail: string }
  | {
      ok: false;
      code: "email_taken" | "delivery_failed" | "validation";
      error: string;
    };

async function revokeCreatedTokenBestEffort(
  tokenId: string,
  now?: Date
): Promise<void> {
  try {
    await revokeAccountToken(tokenId, { now });
  } catch {
    // Best-effort: a leftover token expires and cannot change identity until used.
  }
}

export async function requestEmailChange(input: {
  userId: string;
  email: string;
  now?: Date;
}): Promise<RequestEmailChangeResult> {
  let email: string;
  try {
    email = normalizeAccountTokenEmail(input.email);
  } catch (error) {
    if (error instanceof AccountTokenError) {
      return {
        ok: false,
        code: "validation",
        error: "Enter a valid email address.",
      };
    }
    throw error;
  }

  const config = getAuthEmailDeliveryConfig();
  if (!config.ready) {
    logAccountSecurity({
      event: "email_change_email_failed",
      userId: input.userId,
      reason: "not_configured",
    });
    reportAuthEmailFailure("not_configured");
    return {
      ok: false,
      code: "delivery_failed",
      error: EMAIL_CHANGE_DELIVERY_FAILED_MESSAGE,
    };
  }

  const created = await createEmailChangeToken({
    userId: input.userId,
    email,
    now: input.now,
  });

  if (!created.created) {
    return {
      ok: false,
      code: "email_taken",
      error: PROFILE_EMAIL_TAKEN_MESSAGE,
    };
  }

  try {
    const message = composeEmailChangeEmail({
      confirmUrl: buildEmailChangeUrl(created.rawToken),
      replyTo: config.replyTo,
    });

    const sent = await sendAuthTransactionalEmail(
      {
        to: email,
        subject: message.subject,
        text: message.text,
        html: message.html,
      },
      config
    );

    if (!sent.ok) {
      await revokeCreatedTokenBestEffort(created.token.id, input.now);
      const reason =
        sent.code === "not_configured" || sent.code === "invalid_message"
          ? sent.code
          : "delivery_failed";
      logAccountSecurity({
        event: "email_change_email_failed",
        userId: input.userId,
        reason,
      });
      reportAuthEmailFailure(reason);
      return {
        ok: false,
        code: "delivery_failed",
        error: EMAIL_CHANGE_DELIVERY_FAILED_MESSAGE,
      };
    }
  } catch {
    await revokeCreatedTokenBestEffort(created.token.id, input.now);
    logAccountSecurity({
      event: "email_change_email_failed",
      userId: input.userId,
      reason: "delivery_failed",
    });
    reportAuthEmailFailure("delivery_failed");
    return {
      ok: false,
      code: "delivery_failed",
      error: EMAIL_CHANGE_DELIVERY_FAILED_MESSAGE,
    };
  }

  logAccountSecurity({
    event: "email_change_requested",
    userId: input.userId,
  });

  return { ok: true, pendingEmail: email };
}
