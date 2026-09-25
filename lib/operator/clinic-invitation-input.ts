import "server-only";

import { z } from "zod";

import { CLINIC_MEMBERSHIP_ROLES } from "@/lib/clinic-portal/membership-role";
import {
  INVITED_EMAIL_INVALID_MESSAGE,
  INVITED_EMAIL_MAX_MESSAGE,
  INVITED_EMAIL_REQUIRED_MESSAGE,
  INVITED_NAME_HTML_MESSAGE,
  INVITED_NAME_MAX_LENGTH,
  INVITED_NAME_MAX_MESSAGE,
  INVITED_NAME_REQUIRED_MESSAGE,
  INVITED_ROLE_INVALID_MESSAGE,
  invitedNameError,
  normalizeInvitedName,
} from "@/lib/operator/clinic-invitation-fields";

export {
  CLINIC_MEMBERSHIP_ROLES,
  INVITED_EMAIL_INVALID_MESSAGE,
  INVITED_EMAIL_MAX_MESSAGE,
  INVITED_EMAIL_REQUIRED_MESSAGE,
  INVITED_NAME_HTML_MESSAGE,
  INVITED_NAME_MAX_LENGTH,
  INVITED_NAME_MAX_MESSAGE,
  INVITED_NAME_REQUIRED_MESSAGE,
  INVITED_ROLE_INVALID_MESSAGE,
  invitedNameError,
  normalizeInvitedName,
};
export type { InvitedClinicRole } from "@/lib/operator/clinic-invitation-fields";

export const inviteClinicUserFormSchema = z.object({
  name: z.string(),
  email: z.string(),
  role: z.enum(CLINIC_MEMBERSHIP_ROLES),
});
