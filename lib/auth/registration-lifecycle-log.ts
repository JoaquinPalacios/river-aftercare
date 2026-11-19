import "server-only";

export type RegistrationLifecycleLogEvent = {
  event:
    | "registration_verification_requested"
    | "registration_verification_email_failed"
    | "registration_verification_replaced"
    | "registration_clinic_provisioned"
    | "registration_clinic_provision_failed"
    | "registration_intent_expiry_failed"
    | "registration_intent_expiry_backlog";
  intentId?: string;
  name?: string;
  reason?:
    | "not_configured"
    | "delivery_failed"
    | "invalid_message"
    | "cleanup_failed"
    | "cleanup_backlog";
};

/** Intent id only. Never email, password, token, or URL. */
export function logRegistrationLifecycle(
  entry: RegistrationLifecycleLogEvent
): void {
  if (
    entry.event === "registration_verification_email_failed" ||
    entry.event === "registration_clinic_provision_failed" ||
    entry.event === "registration_intent_expiry_failed" ||
    entry.event === "registration_intent_expiry_backlog"
  ) {
    console.error({
      event: entry.event,
      ...(entry.intentId ? { intentId: entry.intentId } : {}),
      ...(entry.name ? { name: entry.name } : {}),
      ...(entry.reason ? { reason: entry.reason } : {}),
    });
    return;
  }

  console.info({
    event: entry.event,
    ...(entry.intentId ? { intentId: entry.intentId } : {}),
  });
}
