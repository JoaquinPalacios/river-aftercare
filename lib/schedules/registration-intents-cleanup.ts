import { handleSchedule } from "@vercel/schedules";

import { runRegistrationIntentCleanup } from "@/lib/auth/registration-cleanup";

/**
 * Private Vercel Schedule target for `registration-intents-cleanup`.
 * Git tracks `api/registration-intents-cleanup.js`, which requires the
 * bundle `pnpm build` writes from this file.
 * `schedule/v1beta` is that function's only trigger, so it has no public URL.
 * `handleSchedule` awaits the callback. A throw leaves the run failed.
 * The log has the schedule name, execution id, revoked count, and backlog
 * flag. It never includes a password, hash, token, secret, or email.
 */
export const POST = handleSchedule(async (metadata) => {
  try {
    const result = await runRegistrationIntentCleanup();
    console.info({
      event: "registration_intent_cleanup_completed",
      schedule: metadata.name,
      executionId: metadata.executionId,
      revoked: result.revoked,
      backlog: result.backlog,
    });
  } catch (error) {
    console.error({
      event: "registration_intent_cleanup_failed",
      schedule: metadata.name,
      executionId: metadata.executionId,
      name: error instanceof Error ? error.name : "Error",
    });
    throw error;
  }
});
