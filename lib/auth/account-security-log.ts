import "server-only";

export type AccountSecurityLogEvent =
  | { event: "profile_name_changed"; userId: string }
  | { event: "email_changed"; userId: string };

export function logAccountSecurity(entry: AccountSecurityLogEvent): void {
  console.info(entry);
}
