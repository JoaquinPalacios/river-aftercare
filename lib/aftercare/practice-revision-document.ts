import { PracticeSectionProvenance } from "@prisma/client";

import type { HomeCareInstruction } from "@/lib/aftercare/home-care-instruction";
import { mapHomeCareInstructions } from "@/lib/aftercare/revision-sections";
import { normalizePeriodLabel } from "@/lib/aftercare/period-label";
import { normalizeDayRange } from "@/lib/aftercare/timeline-range";
import type {
  ComposedGuideSection,
  GuideSectionKind,
  GuideSectionProvenance,
} from "@/lib/aftercare/types";

export const WORKING_DRAFT_VERSION = 0;

export const PRACTICE_PROVENANCE_TO_COMPOSED: Record<
  PracticeSectionProvenance,
  GuideSectionProvenance
> = {
  CANONICAL: "canonical",
  PRACTICE_OVERRIDE: "practice_override",
  PRACTICE_ADDITION: "practice_addition",
  PRACTICE_CUSTOM: "practice_custom",
};

export const COMPOSED_PROVENANCE_TO_PRACTICE: Record<
  GuideSectionProvenance,
  PracticeSectionProvenance
> = {
  canonical: "CANONICAL",
  practice_override: "PRACTICE_OVERRIDE",
  practice_addition: "PRACTICE_ADDITION",
  practice_custom: "PRACTICE_CUSTOM",
};

export interface PracticeRevisionSectionRecord {
  key: string;
  kind: GuideSectionKind;
  title: string;
  body: string;
  periodLabel: string | null;
  startDay: number | null;
  endDay: number | null;
  sortOrder: number;
  provenance: PracticeSectionProvenance;
  homeCareInstructions?: HomeCareInstruction[];
}

export function composedSectionsFromPracticeRevision(
  sections: PracticeRevisionSectionRecord[]
): ComposedGuideSection[] {
  return sections
    .toSorted((left, right) => left.sortOrder - right.sortOrder)
    .map((section) => {
      const range = normalizeDayRange(section.startDay, section.endDay);
      return {
        key: section.key,
        kind: section.kind,
        title: section.title,
        body: section.body,
        periodLabel: normalizePeriodLabel(section.periodLabel),
        startDay: range.startDay,
        endDay: range.endDay,
        provenance: PRACTICE_PROVENANCE_TO_COMPOSED[section.provenance],
        homeCareInstructions: mapHomeCareInstructions(
          section.homeCareInstructions
        ),
      };
    });
}

export function practiceRevisionSectionsFromComposed(
  sections: ComposedGuideSection[]
): PracticeRevisionSectionRecord[] {
  return sections.map((section, index) => {
    const range = normalizeDayRange(section.startDay, section.endDay);
    return {
      key: section.key,
      kind: section.kind,
      title: section.title,
      body: section.body,
      periodLabel: normalizePeriodLabel(section.periodLabel),
      startDay: range.startDay,
      endDay: range.endDay,
      sortOrder: index + 1,
      provenance: COMPOSED_PROVENANCE_TO_PRACTICE[section.provenance],
      homeCareInstructions: mapHomeCareInstructions(
        section.homeCareInstructions
      ),
    };
  });
}
