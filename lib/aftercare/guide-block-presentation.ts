import { guideSectionKindLabel } from "@/lib/aftercare/guide-section-kind-label";
import {
  GUIDE_SECTION_KINDS,
  type GuideSectionKind,
} from "@/lib/aftercare/types";

export type GuideBlockFamily = "section" | "timeline" | "home-care";

export type GuideBlockAccent =
  "section" | "timeline" | "home-care" | "warning" | "emergency";

const FAMILY_LABEL: Record<GuideBlockFamily, string> = {
  section: "Section",
  timeline: "Timeline",
  "home-care": "Home care",
};

export function guideBlockFamily(kind: GuideSectionKind): GuideBlockFamily {
  if (kind === "RECOVERY_TIMELINE") {
    return "timeline";
  }
  if (kind === "HOME_CARE_PLAN") {
    return "home-care";
  }
  return "section";
}

export function guideBlockFamilyLabel(kind: GuideSectionKind): string {
  return FAMILY_LABEL[guideBlockFamily(kind)];
}

/**
 * Family colour, with warning and emergency overriding the standard section
 * accent. Icon and text stay the identifiers; colour is only a reinforcement.
 */
export function guideBlockAccent(kind: GuideSectionKind): GuideBlockAccent {
  if (kind === "WARNING_SIGNS") {
    return "warning";
  }
  if (kind === "EMERGENCY") {
    return "emergency";
  }
  return guideBlockFamily(kind);
}

/** Section type choices, ordered by the shared human label. */
export function guideSectionKindsByLabel(): GuideSectionKind[] {
  return [...GUIDE_SECTION_KINDS].sort((left, right) =>
    guideSectionKindLabel(left).localeCompare(
      guideSectionKindLabel(right),
      "en",
      { sensitivity: "base" }
    )
  );
}

export function guideEditorBlockSummary(section: {
  kind: GuideSectionKind;
  title: string;
  periodLabel: string;
}): string {
  const title = section.title.trim() || "Untitled";
  if (section.kind === "RECOVERY_TIMELINE") {
    const period = section.periodLabel.trim();
    return period ? `Timeline · ${period} — ${title}` : `Timeline · ${title}`;
  }
  if (section.kind === "HOME_CARE_PLAN") {
    return `Home care · ${title}`;
  }
  return `${guideSectionKindLabel(section.kind)} · ${title}`;
}

export function guideOutlineEntry(section: {
  kind: GuideSectionKind;
  title: string;
  periodLabel: string;
}): { title: string; detail: string | null } {
  const title = section.title.trim() || guideSectionKindLabel(section.kind);
  if (section.kind === "RECOVERY_TIMELINE") {
    const period = section.periodLabel.trim();
    return { title, detail: period || null };
  }
  return { title, detail: null };
}
