import type { Prisma, PracticeSectionProvenance } from "@prisma/client";

import type { HomeCareInstruction } from "@/lib/aftercare/home-care-instruction";
import type { GuideSectionKind } from "@/lib/aftercare/types";

export const homeCareInstructionOrder = {
  orderBy: { sortOrder: "asc" as const },
};

export const practiceRevisionSectionInclude = {
  orderBy: { sortOrder: "asc" as const },
  include: {
    homeCareInstructions: homeCareInstructionOrder,
  },
} satisfies Prisma.PracticeGuideRevisionSectionFindManyArgs;

export interface HomeCareInstructionRow {
  key: string;
  title: string;
  body: string | null;
  frequencyCount: number | null;
  frequencyPeriod: HomeCareInstruction["frequencyPeriod"];
  timingLabel: string | null;
  durationValue: number | null;
  durationUnit: HomeCareInstruction["durationUnit"];
  sortOrder: number;
}

export function mapHomeCareInstructions(
  rows: readonly HomeCareInstructionRow[] | null | undefined
): HomeCareInstruction[] {
  return (rows ?? [])
    .toSorted((left, right) => left.sortOrder - right.sortOrder)
    .map((row, index) => ({
      key: row.key,
      title: row.title,
      body: row.body,
      frequencyCount: row.frequencyCount,
      frequencyPeriod: row.frequencyPeriod,
      timingLabel: row.timingLabel,
      durationValue: row.durationValue,
      durationUnit: row.durationUnit,
      sortOrder: index + 1,
    }));
}

export interface PracticeSectionWrite {
  key: string;
  kind: GuideSectionKind;
  title: string;
  body: string;
  periodLabel: string | null;
  startDay: number | null;
  endDay: number | null;
  sortOrder: number;
  provenance: PracticeSectionProvenance;
  homeCareInstructions?: readonly HomeCareInstruction[];
}

export function practiceSectionCreateData(
  section: PracticeSectionWrite
): Prisma.PracticeGuideRevisionSectionCreateWithoutRevisionInput {
  return {
    key: section.key,
    kind: section.kind,
    title: section.title,
    body: section.body,
    periodLabel: section.periodLabel,
    startDay: section.startDay,
    endDay: section.endDay,
    sortOrder: section.sortOrder,
    provenance: section.provenance,
    homeCareInstructions: {
      create: (section.homeCareInstructions ?? []).map((item, index) => ({
        key: item.key,
        title: item.title,
        body: item.body,
        frequencyCount: item.frequencyCount,
        frequencyPeriod: item.frequencyPeriod,
        timingLabel: item.timingLabel,
        durationValue: item.durationValue,
        durationUnit: item.durationUnit,
        sortOrder: index + 1,
      })),
    },
  };
}

export async function createPracticeRevisionSections(
  tx: Prisma.TransactionClient,
  revisionId: string,
  sections: readonly PracticeSectionWrite[]
): Promise<void> {
  for (const section of sections) {
    await tx.practiceGuideRevisionSection.create({
      data: {
        revisionId,
        ...practiceSectionCreateData(section),
      },
    });
  }
}
