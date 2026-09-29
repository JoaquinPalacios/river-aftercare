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

function sameVisibleLabel(left: string, right: string): boolean {
  return (
    left.trim().toLocaleLowerCase("en") === right.trim().toLocaleLowerCase("en")
  );
}

/**
 * Text beside the family badge. The badge already says Section, Timeline, or
 * Home care, so this summary does not repeat that family. A kind label that
 * matches the title is shown once.
 */
export function guideEditorBlockSummary(section: {
  kind: GuideSectionKind;
  title: string;
  periodLabel: string;
}): string {
  const title = section.title.trim();
  const kindLabel = guideSectionKindLabel(section.kind);

  if (section.kind === "RECOVERY_TIMELINE") {
    const period = section.periodLabel.trim();
    if (period && title && !sameVisibleLabel(period, title)) {
      return `${period} — ${title}`;
    }
    return period || title || "Untitled";
  }

  if (section.kind === "HOME_CARE_PLAN") {
    return title || "Untitled";
  }

  if (!title || sameVisibleLabel(title, kindLabel)) {
    return kindLabel;
  }
  return `${kindLabel} — ${title}`;
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
