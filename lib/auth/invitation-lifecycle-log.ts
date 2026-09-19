import "server-only";

export type InvitationLifecycleLogEvent =
  | {
      event: "invitation_created";
      userId: string;
      clinicId: string;
    }
  | {
      event: "invitation_email_failed";
      userId: string;
      clinicId: string;
      reason: "not_configured" | "delivery_failed" | "invalid_message";
    }
  | {
      event: "invitation_resent";
      userId: string;
      clinicId: string;
    }
  | {
      event: "invitation_cancelled";
      userId: string;
      clinicId: string;
    }
  | {
      event: "invitation_accepted";
      userId: string;
      clinicId: string;
    }
  | {
      event: "clinic_access_removed";
      userId: string;
      clinicId: string;
    }
  | {
      event: "clinic_access_restored";
      userId: string;
      clinicId: string;
    };

export function logInvitationLifecycle(
  entry: InvitationLifecycleLogEvent
): void {
  if (entry.event === "invitation_email_failed") {
    console.error(entry);
    return;
  }

  console.info(entry);
}
