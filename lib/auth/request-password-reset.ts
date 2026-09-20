import "server-only";

import {
  AccountTokenError,
  createPasswordResetTokenIfAllowed,
  normalizeAccountTokenEmail,
  revokeAccountToken,
} from "@/lib/auth/account-token-service";
import { logPasswordLifecycle } from "@/lib/auth/password-lifecycle-log";
import {
  getAuthEmailDeliveryConfig,
  sendAuthTransactionalEmail,
} from "@/lib/email/auth-email";
import { reportAuthEmailFailure } from "@/lib/observability/report-server-exception";
import { composePasswordResetEmail } from "@/lib/email/password-reset-mail";
import { getPrisma } from "@/lib/prisma";
import { buildPasswordResetUrl } from "@/lib/tenancy/staff-app-origin";

async function revokeCreatedTokenBestEffort(
  tokenId: string,
  now?: Date
): Promise<void> {
  try {
    await revokeAccountToken(tokenId, { now });
  } catch {
    // Best-effort: cooldown should not stick if we cannot revoke.
  }
}

export async function requestPasswordReset(input: {
  email: string;
  now?: Date;
}): Promise<void> {
  let email: string;
  try {
    email = normalizeAccountTokenEmail(input.email);
  } catch (error) {
    if (error instanceof AccountTokenError) {
      return;
    }
    throw error;
  }

  const user = await getPrisma().user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      passwordHash: true,
    },
  });

  if (!user?.passwordHash) {
    return;
  }

  const config = getAuthEmailDeliveryConfig();
  if (!config.ready) {
    logPasswordLifecycle({
      event: "password_reset_email_failed",
      userId: user.id,
      reason: "not_configured",
    });
    reportAuthEmailFailure("not_configured");
    return;
  }

  const created = await createPasswordResetTokenIfAllowed({
    userId: user.id,
    email: user.email,
    now: input.now,
  });

  if (!created.created) {
    return;
  }

  try {
    const message = composePasswordResetEmail({
      resetUrl: buildPasswordResetUrl(created.rawToken),
      replyTo: config.replyTo,
    });

    const sent = await sendAuthTransactionalEmail(
      {
        to: user.email,
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
      logPasswordLifecycle({
        event: "password_reset_email_failed",
        userId: user.id,
        reason,
      });
      reportAuthEmailFailure(reason);
      return;
    }
  } catch {
    await revokeCreatedTokenBestEffort(created.token.id, input.now);
    logPasswordLifecycle({
      event: "password_reset_email_failed",
      userId: user.id,
      reason: "delivery_failed",
    });
    reportAuthEmailFailure("delivery_failed");
    return;
  }

  logPasswordLifecycle({
    event: "password_reset_requested",
    userId: user.id,
  });
}
