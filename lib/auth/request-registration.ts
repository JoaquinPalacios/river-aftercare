import "server-only";

import { hashAccountToken } from "@/lib/auth/account-token";
import { normalizeAccountTokenEmail } from "@/lib/auth/account-token-service";
import { REGISTRATION_INTENT_GENERIC_MESSAGE } from "@/lib/auth/registration-copy";
import { logRegistrationLifecycle } from "@/lib/auth/registration-lifecycle-log";
import {
  createOrReplaceRegistrationIntent,
  reissueRegistrationIntentToken,
  restoreRegistrationIntentToken,
  revokeUnconsumedRegistrationIntent,
  type CreateRegistrationIntentResult,
} from "@/lib/auth/registration-intent-service";
import {
  getAuthEmailDeliveryConfig,
  sendAuthTransactionalEmail,
} from "@/lib/email/auth-email";
import { composeRegistrationVerificationEmail } from "@/lib/email/registration-verification-mail";
import { reportAuthEmailFailure } from "@/lib/observability/report-server-exception";
import { buildRegistrationVerificationUrl } from "@/lib/tenancy/staff-app-origin";

export type RegistrationRequestResult =
  | { status: "accepted"; message: typeof REGISTRATION_INTENT_GENERIC_MESSAGE }
  | Exclude<CreateRegistrationIntentResult, { status: "accepted" }>;

async function deliverVerificationEmail(input: {
  intentId: string;
  to: string;
  practiceName: string;
  rawToken: string;
  event:
    | "registration_verification_requested"
    | "registration_verification_replaced";
}): Promise<boolean> {
  const config = getAuthEmailDeliveryConfig();
  if (!config.ready) {
    logRegistrationLifecycle({
      event: "registration_verification_email_failed",
      intentId: input.intentId,
      reason: "not_configured",
    });
    reportAuthEmailFailure("not_configured");
    return false;
  }

  const message = composeRegistrationVerificationEmail({
    practiceName: input.practiceName,
    verificationUrl: buildRegistrationVerificationUrl(input.rawToken),
    replyTo: config.replyTo,
  });

  try {
    const sent = await sendAuthTransactionalEmail(
      {
        to: input.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      },
      config
    );
    if (!sent.ok) {
      const reason =
        sent.code === "not_configured" || sent.code === "invalid_message"
          ? sent.code
          : "delivery_failed";
      logRegistrationLifecycle({
        event: "registration_verification_email_failed",
        intentId: input.intentId,
        reason,
      });
      reportAuthEmailFailure(reason);
      return false;
    }
  } catch {
    logRegistrationLifecycle({
      event: "registration_verification_email_failed",
      intentId: input.intentId,
      reason: "delivery_failed",
    });
    reportAuthEmailFailure("delivery_failed");
    return false;
  }

  logRegistrationLifecycle({ event: input.event, intentId: input.intentId });
  return true;
}

/**
 * Create or replace an intent and email the verification link.
 * The returned value never includes the raw token. A failed send revokes the
 * new intent. This does not consume the intent or create a clinic.
 */
export async function requestRegistrationVerification(input: {
  email: string;
  password: string;
  ownerName: string;
  practiceName: string;
  slug: string;
  serviceCategories: readonly string[];
  commercialPlan: string;
  billingInterval: string;
  now?: Date;
}): Promise<RegistrationRequestResult> {
  const created = await createOrReplaceRegistrationIntent(input);
  if (created.status !== "accepted") {
    return created;
  }
  if (created.delivery === "suppress") {
    return {
      status: "accepted",
      message: REGISTRATION_INTENT_GENERIC_MESSAGE,
    };
  }

  const sent = await deliverVerificationEmail({
    intentId: created.intentId,
    to: normalizeAccountTokenEmail(input.email),
    practiceName: input.practiceName.trim(),
    rawToken: created.rawToken,
    event: "registration_verification_requested",
  });
  if (!sent) {
    await revokeUnconsumedRegistrationIntent({
      intentId: created.intentId,
      now: input.now,
    });
  }

  return {
    status: "accepted",
    message: REGISTRATION_INTENT_GENERIC_MESSAGE,
  };
}

/**
 * Email a replacement link for an existing live intent.
 * The public result is the same whether or not a message was sent.
 */
export async function requestRegistrationReplacement(input: {
  email: string;
  now?: Date;
}): Promise<
  | { status: "accepted"; message: typeof REGISTRATION_INTENT_GENERIC_MESSAGE }
  | { status: "invalid"; field: "email"; message: string }
> {
  const reissued = await reissueRegistrationIntentToken(input);
  if (reissued.status === "invalid_email") {
    return {
      status: "invalid",
      field: "email",
      message: "Enter a valid email address.",
    };
  }
  if (reissued.status === "send") {
    const sent = await deliverVerificationEmail({
      intentId: reissued.intentId,
      to: normalizeAccountTokenEmail(input.email),
      practiceName: reissued.practiceName,
      rawToken: reissued.rawToken,
      event: "registration_verification_replaced",
    });
    if (!sent) {
      await restoreRegistrationIntentToken({
        intentId: reissued.intentId,
        tokenHash: reissued.previous.tokenHash,
        expiresAt: reissued.previous.expiresAt,
        replacementTokenHash: hashAccountToken(reissued.rawToken),
      });
    }
  }

  return {
    status: "accepted",
    message: REGISTRATION_INTENT_GENERIC_MESSAGE,
  };
}
