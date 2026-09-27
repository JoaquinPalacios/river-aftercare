import type {
  HomeCareDurationUnit,
  HomeCareFrequencyPeriod,
} from "@/lib/aftercare/home-care-instruction";

export interface CanonicalContentInstruction {
  key: string;
  title: string;
  body: string | null;
  frequencyCount: number | null;
  frequencyPeriod: HomeCareFrequencyPeriod | null;
  timingLabel: string | null;
  durationValue: number | null;
  durationUnit: HomeCareDurationUnit | null;
  sortOrder: number;
}

export interface CanonicalContentSection {
  key: string;
  kind: string;
  title: string;
  body: string;
  periodLabel: string | null;
  startDay: number | null;
  endDay: number | null;
  sortOrder: number;
  homeCareInstructions: CanonicalContentInstruction[];
}

/**
 * Patient-visible canonical content. Template title, slug, and service
 * category are not part of this signature.
 */
export function canonicalContentSignature(
  sections: readonly CanonicalContentSection[]
): string {
  return JSON.stringify(
    sections
      .slice()
      .sort((left, right) => left.sortOrder - right.sortOrder)
      .map((section) => ({
        key: section.key,
        kind: section.kind,
        title: section.title,
        body: section.body,
        periodLabel: section.periodLabel,
        startDay: section.startDay,
        endDay: section.endDay,
        sortOrder: section.sortOrder,
        homeCareInstructions: section.homeCareInstructions
          .slice()
          .sort((left, right) => left.sortOrder - right.sortOrder)
          .map((item) => ({
            key: item.key,
            title: item.title,
            body: item.body,
            frequencyCount: item.frequencyCount,
            frequencyPeriod: item.frequencyPeriod,
            timingLabel: item.timingLabel,
            durationValue: item.durationValue,
            durationUnit: item.durationUnit,
            sortOrder: item.sortOrder,
          })),
      }))
  );
}
