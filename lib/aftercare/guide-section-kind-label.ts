import type { GuideSectionKind } from "@/lib/aftercare/types";

export const GUIDE_SECTION_KIND_LABELS: Record<GuideSectionKind, string> = {
  INTRODUCTION: "Introduction",
  IMMEDIATE_CARE: "Immediate care",
  FIRST_24_HOURS: "First 24 hours",
  RECOVERY_TIMELINE: "Recovery timeline",
  WHAT_IS_NORMAL: "What's normal",
  PAIN: "Pain",
  RESTRICTIONS: "Restrictions",
  MEDICATIONS: "Medications",
  SITE_CARE: "Site care",
  WHAT_TO_AVOID: "What to avoid",
  WARNING_SIGNS: "Warning signs",
  CONTACT_PRACTICE: "Contact practice",
  EMERGENCY: "Emergency",
  CUSTOM: "Custom",
  HOME_CARE_PLAN: "Home care plan",
};

export function guideSectionKindLabel(kind: GuideSectionKind): string {
  return GUIDE_SECTION_KIND_LABELS[kind];
}
