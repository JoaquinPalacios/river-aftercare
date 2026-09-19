import "server-only";

export type PasswordLifecycleLogEvent =
  | { event: "password_changed"; userId: string }
  | { event: "password_reset_requested"; userId: string }
  | {
      event: "password_reset_email_failed";
      userId: string;
      reason: "not_configured" | "delivery_failed" | "invalid_message";
    }
  | { event: "password_reset_completed"; userId: string };

export function logPasswordLifecycle(entry: PasswordLifecycleLogEvent): void {
  if (entry.event === "password_reset_email_failed") {
    console.error(entry);
    return;
  }

  console.info(entry);
}
