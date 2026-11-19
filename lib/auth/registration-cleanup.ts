import "server-only";

import { REGISTRATION_INTENT_CRON_PATH } from "@/lib/auth/registration-cron-path";
import { expireRegistrationIntents } from "@/lib/auth/registration-intent-service";

export { REGISTRATION_INTENT_CRON_PATH };

/** One daily pass. A larger backlog continues on the next run. */
export const REGISTRATION_INTENT_EXPIRE_BATCH = 500;

/**
 * Redact expired, still-unused registration passwords.
 * Does not delete rows and does not touch a consumed or unexpired registration.
 */
export async function runRegistrationIntentCleanup(
  now: Date = new Date()
): Promise<{ revoked: number }> {
  return expireRegistrationIntents({
    now,
    limit: REGISTRATION_INTENT_EXPIRE_BATCH,
  });
}
