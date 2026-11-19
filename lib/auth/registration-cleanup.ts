import "server-only";

import { REGISTRATION_INTENT_CRON_PATH } from "@/lib/auth/registration-cron-path";
import { expireRegistrationIntents } from "@/lib/auth/registration-intent-service";
import { logRegistrationLifecycle } from "@/lib/auth/registration-lifecycle-log";
import { reportServerException } from "@/lib/observability/report-server-exception";

export { REGISTRATION_INTENT_CRON_PATH };

/** Rows redacted in one statement. */
export const REGISTRATION_INTENT_EXPIRE_BATCH = 500;

/** Hard cap for one cron invocation. A full last batch is reported, not retried immediately. */
export const REGISTRATION_INTENT_EXPIRE_PASSES = 4;

/**
 * Redact expired, still-unused registration passwords.
 * Does not delete rows and does not touch a consumed or unexpired registration.
 * Stops after four batches. A saturated run is logged so a backlog is visible.
 */
export async function runRegistrationIntentCleanup(
  now: Date = new Date()
): Promise<{ revoked: number; backlog: boolean }> {
  let revoked = 0;
  let backlog = false;
  for (let pass = 0; pass < REGISTRATION_INTENT_EXPIRE_PASSES; pass += 1) {
    const batch = await expireRegistrationIntents({
      now,
      limit: REGISTRATION_INTENT_EXPIRE_BATCH,
    });
    revoked += batch.revoked;
    if (batch.revoked < REGISTRATION_INTENT_EXPIRE_BATCH) {
      backlog = false;
      break;
    }
    backlog = true;
  }
  if (backlog) {
    logRegistrationLifecycle({
      event: "registration_intent_expiry_backlog",
      reason: "cleanup_backlog",
    });
    reportServerException(new Error("registration_intent_expiry_backlog"), {
      tags: { component: "registration-intent-cleanup" },
    });
  }
  return { revoked, backlog };
}
