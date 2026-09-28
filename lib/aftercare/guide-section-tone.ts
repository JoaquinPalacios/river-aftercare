import type { GuideSectionKind } from "@/lib/aftercare/types";

export type GuideSectionTone =
  "lead" | "default" | "warning" | "emergency" | "reassurance" | "contact";

export function guideSectionTone(kind: GuideSectionKind): GuideSectionTone {
  switch (kind) {
    case "WARNING_SIGNS":
      return "warning";
    case "EMERGENCY":
      return "emergency";
    case "WHAT_IS_NORMAL":
      return "reassurance";
    case "CONTACT_PRACTICE":
      return "contact";
    case "INTRODUCTION":
    case "IMMEDIATE_CARE":
      return "lead";
    default:
      return "default";
  }
}
