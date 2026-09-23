import type { GovernedCommercialPlan } from "@/lib/entitlements/plan-policy";

export const ENTITLEMENT_CODES = {
  TEAM_MEMBER_LIMIT_REACHED: "TEAM_MEMBER_LIMIT_REACHED",
  CUSTOM_GUIDE_LIMIT_REACHED: "CUSTOM_GUIDE_LIMIT_REACHED",
  TEMPLATE_ADAPTATION_NOT_AVAILABLE: "TEMPLATE_ADAPTATION_NOT_AVAILABLE",
  TEMPLATE_ADAPTATION_REQUIRED: "TEMPLATE_ADAPTATION_REQUIRED",
  OPERATOR_OVERRIDE_REQUIRED: "OPERATOR_OVERRIDE_REQUIRED",
} as const;

export type EntitlementCode =
  (typeof ENTITLEMENT_CODES)[keyof typeof ENTITLEMENT_CODES];

export function teamMemberLimitMessage(limit: number): string {
  return `This clinic is using all ${limit} included team members. Pending invitations reserve a team-member place.`;
}

export function operatorOverrideRequiredMessage(): string {
  return "This exceeds the clinic’s included team-member allowance. Confirm an operator override to continue. No billing change will be made.";
}

export function customGuideLimitMessage(
  plan: GovernedCommercialPlan,
  limit: number
): string {
  if (plan === "ESSENTIAL") {
    return `Essential includes up to ${limit} custom clinic guides.`;
  }
  return `Practice includes up to ${limit} custom clinic guides.`;
}

export function templateAdaptationUnavailableMessage(): string {
  return "Essential uses River Aftercare templates as supplied. Adapting a template into a clinic-specific guide is not included. Custom clinic guides keep the normal editor.";
}

export function templateAdaptationRequiredMessage(): string {
  return "Adapt this River Aftercare template before editing it. Adapting keeps the canonical template unchanged and creates a clinic-owned custom guide that uses one custom-guide place.";
}

export function teamUsageLabel(occupied: number, limit: number): string {
  return `${occupied} of ${limit} team members used`;
}

export function teamUsageDetail(
  active: number,
  pending: number
): string | null {
  if (pending <= 0) {
    return null;
  }
  const members = active === 1 ? "1 active member" : `${active} active members`;
  const invitations =
    pending === 1 ? "1 pending invitation" : `${pending} pending invitations`;
  return `${members} · ${invitations}`;
}

export function customGuideUsageLabel(used: number, limit: number): string {
  return `${used} of ${limit} custom guides used`;
}

export const PENDING_INVITATION_RESERVATION_NOTE =
  "Pending invitations reserve a team-member place.";

export const OPERATOR_OVERRIDE_NOTE =
  "This exceeds the clinic’s included plan allowance. No automatic billing change will be made.";
