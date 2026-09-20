import "server-only";

export type AccountSecurityLogEvent =
  | { event: "profile_name_changed"; userId: string }
  | { event: "email_change_requested"; userId: string }
  | { event: "email_change_completed"; userId: string }
  | {
      event: "email_change_email_failed";
      userId: string;
      reason: "not_configured" | "invalid_message" | "delivery_failed";
    };

export function logAccountSecurity(entry: AccountSecurityLogEvent): void {
  console.info(entry);
}
