import { canonicalContentSignature } from "@/lib/canonical-templates/content";
import type { CanonicalContentSection } from "@/lib/canonical-templates/content";
import { normalizePeriodLabel } from "@/lib/aftercare/period-label";
import type {
  HomeCareDurationUnit,
  HomeCareFrequencyPeriod,
} from "@/lib/aftercare/home-care-instruction";
import {
  GUIDE_SECTION_KINDS,
  type GuideSectionKind,
} from "@/lib/aftercare/types";

export const CANONICAL_TIMELINE_KIND = "RECOVERY_TIMELINE" as const;
export const CANONICAL_HOME_CARE_KIND = "HOME_CARE_PLAN" as const;

const WARNING_KINDS = new Set<GuideSectionKind>([
  "WARNING_SIGNS",
  "CONTACT_PRACTICE",
  "EMERGENCY",
]);

export const CANONICAL_WARNING_KINDS: GuideSectionKind[] = [
  "WARNING_SIGNS",
  "CONTACT_PRACTICE",
  "EMERGENCY",
];

export const CANONICAL_GENERAL_KINDS: GuideSectionKind[] =
  GUIDE_SECTION_KINDS.filter(
    (kind) =>
      kind !== CANONICAL_TIMELINE_KIND &&
      kind !== CANONICAL_HOME_CARE_KIND &&
      !WARNING_KINDS.has(kind)
  );

export interface CanonicalEditorInstruction {
  key: string;
  title: string;
  body: string;
  frequencyCount: string;
  frequencyPeriod: HomeCareFrequencyPeriod | "";
  timingLabel: string;
  durationValue: string;
  durationUnit: HomeCareDurationUnit | "";
}

export interface CanonicalEditorSection {
  key: string;
  kind: GuideSectionKind;
  title: string;
  body: string;
  periodLabel: string;
  startDay: string;
  endDay: string;
  homeCareInstructions: CanonicalEditorInstruction[];
}

function optionalCount(value: string): number | null {
  if (value.trim() === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

export function partitionCanonicalDraftSections<
  T extends { kind: GuideSectionKind },
>(sections: readonly T[]) {
  return {
    general: sections.filter((section) =>
      CANONICAL_GENERAL_KINDS.includes(section.kind)
    ),
    timeline: sections.filter(
      (section) => section.kind === CANONICAL_TIMELINE_KIND
    ),
    homeCare: sections.filter(
      (section) => section.kind === CANONICAL_HOME_CARE_KIND
    ),
    warnings: sections.filter((section) => WARNING_KINDS.has(section.kind)),
  };
}

export function flattenCanonicalDraftSections<
  T extends { kind: GuideSectionKind },
>(groups: {
  general: readonly T[];
  timeline: readonly T[];
  homeCare: readonly T[];
  warnings: readonly T[];
}): T[] {
  return [
    ...groups.general,
    ...groups.timeline,
    ...groups.homeCare,
    ...groups.warnings,
  ];
}

export function canonicalSectionsFromEditor(
  sections: readonly CanonicalEditorSection[]
): CanonicalContentSection[] {
  return sections.map((section, index) => ({
    key: section.key.trim(),
    kind: section.kind,
    title: section.title.trim(),
    body: section.body.trim(),
    periodLabel: normalizePeriodLabel(section.periodLabel),
    startDay: optionalCount(section.startDay),
    endDay: optionalCount(section.endDay),
    sortOrder: index + 1,
    homeCareInstructions:
      section.kind === CANONICAL_HOME_CARE_KIND
        ? section.homeCareInstructions.map((item, instructionIndex) => ({
            key: item.key.trim(),
            title: item.title.trim(),
            body: item.body.trim() ? item.body.trim() : null,
            frequencyCount: optionalCount(item.frequencyCount),
            frequencyPeriod: item.frequencyPeriod || null,
            timingLabel: item.timingLabel.trim()
              ? item.timingLabel.trim()
              : null,
            durationValue: optionalCount(item.durationValue),
            durationUnit: item.durationUnit || null,
            sortOrder: instructionIndex + 1,
          }))
        : [],
  }));
}

export function canonicalEditorContentSignature(
  sections: readonly CanonicalEditorSection[]
): string {
  return canonicalContentSignature(canonicalSectionsFromEditor(sections));
}

export function canonicalDraftContentChanged(
  savedSignature: string,
  sections: readonly CanonicalEditorSection[]
): boolean {
  return canonicalEditorContentSignature(sections) !== savedSignature;
}
