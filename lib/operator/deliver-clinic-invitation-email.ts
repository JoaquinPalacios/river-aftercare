import "server-only";

import type { ClinicMembershipRole } from "@prisma/client";

import { logInvitationLifecycle } from "@/lib/auth/invitation-lifecycle-log";
import {
  getAuthEmailDeliveryConfig,
  sendAuthTransactionalEmail,
} from "@/lib/email/auth-email";
import { composeInvitationEmail } from "@/lib/email/invitation-mail";
import { buildInvitationUrl } from "@/lib/tenancy/staff-app-origin";

export async function deliverClinicInvitationEmail(input: {
  to: string;
  rawToken: string;
  clinicName: string;
  role: ClinicMembershipRole;
  inviteeName: string | null;
  userId: string;
  clinicId: string;
}): Promise<boolean> {
  const config = getAuthEmailDeliveryConfig();
  if (!config.ready) {
    logInvitationLifecycle({
      event: "invitation_email_failed",
      userId: input.userId,
      clinicId: input.clinicId,
      reason: "not_configured",
    });
    return false;
  }

  try {
    const message = composeInvitationEmail({
      invitationUrl: buildInvitationUrl(input.rawToken),
      clinicName: input.clinicName,
      role: input.role,
      inviteeName: input.inviteeName,
      replyTo: config.replyTo,
    });
    const sent = await sendAuthTransactionalEmail(
      {
        to: input.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      },
      config
    );
    if (!sent.ok) {
      logInvitationLifecycle({
        event: "invitation_email_failed",
        userId: input.userId,
        clinicId: input.clinicId,
        reason: sent.code === "not_configured" ? "not_configured" : sent.code,
      });
      return false;
    }
    return true;
  } catch {
    logInvitationLifecycle({
      event: "invitation_email_failed",
      userId: input.userId,
      clinicId: input.clinicId,
      reason: "delivery_failed",
    });
    return false;
  }
}
