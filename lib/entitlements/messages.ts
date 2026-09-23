import type { GovernedCommercialPlan } from "@/lib/entitlements/plan-policy";

export const ENTITLEMENT_CODES = {
  TEAM_MEMBER_LIMIT_REACHED: "TEAM_MEMBER_LIMIT_REACHED",
  CUSTOM_GUIDE_LIMIT_REACHED: "CUSTOM_GUIDE_LIMIT_REACHED",
  ADAPTED_TEMPLATE_LIMIT_REACHED: "ADAPTED_TEMPLATE_LIMIT_REACHED",
  COMBINED_GUIDE_LIMIT_REACHED: "COMBINED_GUIDE_LIMIT_REACHED",
  TEMPLATE_ADAPTATION_NOT_AVAILABLE: "TEMPLATE_ADAPTATION_NOT_AVAILABLE",
  TEMPLATE_ADAPTATION_REQUIRED: "TEMPLATE_ADAPTATION_REQUIRED",
} as const;

export type EntitlementCode =
  (typeof ENTITLEMENT_CODES)[keyof typeof ENTITLEMENT_CODES];

export function teamMemberLimitMessage(limit: number): string {
  return `This clinic is using all ${limit} included team members. Pending invitations reserve a team-member place.`;
}

export function customGuideLimitMessage(
  plan: GovernedCommercialPlan,
  limit: number
): string {
  const planName = plan === "ESSENTIAL" ? "Essential" : "Practice";
  return `${planName} includes up to ${limit} original custom clinic guides.`;
}

export function adaptedTemplateLimitMessage(
  plan: GovernedCommercialPlan,
  limit: number
): string {
  const planName = plan === "ESSENTIAL" ? "Essential" : "Practice";
  return `${planName} includes up to ${limit} editable River templates.`;
}

export function combinedGuideLimitMessage(
  plan: GovernedCommercialPlan,
  limit: number
): string {
  const planName = plan === "ESSENTIAL" ? "Essential" : "Practice";
  return `${planName} includes up to ${limit} clinic-owned guides in total.`;
}

export function templateAdaptationUnavailableMessage(): string {
  return "This clinic does not use a fixed editable-template allowance.";
}

export function templateAdaptationRequiredMessage(): string {
  return "Editing this River template creates your clinic’s own copy and uses one of your editable template allowances.";
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

export function adaptedTemplateUsageLabel(used: number, limit: number): string {
  return `${used} of ${limit} editable River templates used`;
}

export function combinedGuideUsageLabel(used: number, limit: number): string {
  return `${used} of ${limit} clinic-owned guides used`;
}

export const PENDING_INVITATION_RESERVATION_NOTE =
  "Pending invitations reserve a team-member place.";

export const TEMPLATE_EDIT_NOTE =
  "Editing this River template creates your clinic’s own copy and uses one of your editable template allowances.";
