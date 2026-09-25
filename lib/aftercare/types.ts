export const GUIDE_SECTION_KINDS = [
  "INTRODUCTION",
  "IMMEDIATE_CARE",
  "FIRST_24_HOURS",
  "RECOVERY_TIMELINE",
  "WHAT_IS_NORMAL",
  "PAIN",
  "RESTRICTIONS",
  "MEDICATIONS",
  "SITE_CARE",
  "WHAT_TO_AVOID",
  "WARNING_SIGNS",
  "CONTACT_PRACTICE",
  "EMERGENCY",
  "CUSTOM",
] as const;

export type GuideSectionKind = (typeof GUIDE_SECTION_KINDS)[number];

export type GuideSectionProvenance =
  "canonical" | "practice_override" | "practice_addition" | "practice_custom";

export interface CanonicalGuideSection {
  key: string;
  kind: GuideSectionKind;
  title: string;
  body: string;
  periodLabel?: string | null;
  startDay?: number | null;
  endDay?: number | null;
  sortOrder: number;
}

export interface PracticeGuideOverrideInput {
  sectionKey: string;
  title: string;
  body: string;
}

export interface PracticeGuideAdditionInput {
  key: string;
  kind: GuideSectionKind;
  title: string;
  body: string;
  periodLabel?: string | null;
  startDay?: number | null;
  endDay?: number | null;
  sortOrder: number;
  insertAfterSectionKey: string | null;
}

export interface ComposeGuideDocumentInput {
  canonicalSections: CanonicalGuideSection[];
  overrides: PracticeGuideOverrideInput[];
  additions: PracticeGuideAdditionInput[];
}

export interface ComposedGuideSection {
  key: string;
  kind: GuideSectionKind;
  title: string;
  body: string;
  periodLabel: string | null;
  startDay?: number | null;
  endDay?: number | null;
  provenance: GuideSectionProvenance;
}

export interface ComposedGuideDocument {
  sections: ComposedGuideSection[];
}

export interface PublishedPracticeGuideSummary {
  id: string;
  publicSlug: string;
  title: string;
  sortOrder: number;
  publishedAt: Date | null;
  href?: string;
}
