import "server-only";

export type RegistrationLifecycleLogEvent = {
  event:
    | "registration_verification_requested"
    | "registration_verification_email_failed"
    | "registration_verification_replaced";
  intentId: string;
  reason?: "not_configured" | "delivery_failed" | "invalid_message";
};

/** Intent id only. Never email, password, token, or URL. */
export function logRegistrationLifecycle(
  entry: RegistrationLifecycleLogEvent
): void {
  if (entry.event === "registration_verification_email_failed") {
    console.error({
      event: entry.event,
      intentId: entry.intentId,
      reason: entry.reason,
    });
    return;
  }

  console.info({ event: entry.event, intentId: entry.intentId });
}
