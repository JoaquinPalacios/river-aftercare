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
    }
  | {
      event: "clinic_role_updated";
      userId: string;
      clinicId: string;
    }
  | {
      event: "clinic_membership_deactivated";
      userId: string;
      clinicId: string;
      actorUserId: string;
    }
  | {
      event: "clinic_membership_reactivated";
      userId: string;
      clinicId: string;
      actorUserId: string;
    }
  | {
      event: "operator_clinic_settings_updated";
      userId: string;
      clinicId: string;
    }
  | {
      event: "operator_team_allowance_override";
      actorUserId: string;
      clinicId: string;
      action: "invitation" | "access_restored" | "reactivation";
      occupiedPlaces: number;
      planLimit: number;
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
