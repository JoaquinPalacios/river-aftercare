import "server-only";

import type { GuideSectionKind, Prisma } from "@prisma/client";
import { z } from "zod";

import { guideSectionDraftSchema } from "@/lib/clinic-portal/guide-schemas";
import { normalizePeriodLabel } from "@/lib/aftercare/period-label";
import {
  normalizeDayRange,
  validateTimelineRanges,
} from "@/lib/aftercare/timeline-range";
import type { CanonicalContentSection } from "@/lib/canonical-templates/content";
import { CanonicalTemplateError } from "@/lib/canonical-templates/errors";

const canonicalDraftSectionsSchema = z
  .array(guideSectionDraftSchema)
  .max(40, "A canonical draft can have at most 40 sections.");

export interface CanonicalDraftSection extends CanonicalContentSection {
  kind: GuideSectionKind;
}

function withDraftDefaults(input: unknown): unknown {
  if (!Array.isArray(input)) {
    return input;
  }
  return input.map((section) => {
    if (!section || typeof section !== "object") {
      return section;
    }
    const value = section as Record<string, unknown>;
    const instructions = Array.isArray(value.homeCareInstructions)
      ? value.homeCareInstructions
      : [];
    return {
      periodLabel: null,
      startDay: null,
      endDay: null,
      ...value,
      homeCareInstructions: instructions.map((item) => {
        if (!item || typeof item !== "object") {
          return item;
        }
        return {
          body: null,
          frequencyCount: null,
          frequencyPeriod: null,
          timingLabel: null,
          durationValue: null,
          durationUnit: null,
          ...(item as Record<string, unknown>),
        };
      }),
    };
  });
}

export function parseCanonicalDraftSections(
  input: unknown
): CanonicalDraftSection[] {
  const parsed = canonicalDraftSectionsSchema.safeParse(
    withDraftDefaults(input)
  );
  if (!parsed.success) {
    throw new CanonicalTemplateError(
      parsed.error.issues[0]?.message ?? "That draft content is invalid.",
      "invalid"
    );
  }

  const keys = parsed.data.map((section) => section.key);
  if (new Set(keys).size !== keys.length) {
    throw new CanonicalTemplateError("Section keys must be unique.", "invalid");
  }

  const sections: CanonicalDraftSection[] = parsed.data.map(
    (section, index) => {
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
        homeCareInstructions: section.homeCareInstructions.map(
          (item, instructionIndex) => ({
            key: item.key,
            title: item.title,
            body: item.body,
            frequencyCount: item.frequencyCount,
            frequencyPeriod: item.frequencyPeriod,
            timingLabel: item.timingLabel,
            durationValue: item.durationValue,
            durationUnit: item.durationUnit,
            sortOrder: instructionIndex + 1,
          })
        ),
      };
    }
  );

  const timelineIssues = validateTimelineRanges(
    sections
      .filter((section) => section.kind === "RECOVERY_TIMELINE")
      .map((section) => ({
        key: section.key,
        periodLabel: section.periodLabel,
        startDay: section.startDay,
        endDay: section.endDay,
      }))
  );
  if (timelineIssues.length > 0) {
    throw new CanonicalTemplateError(timelineIssues[0].message, "invalid");
  }

  return sections;
}

export function assertPublishableCanonicalSections(
  sections: readonly CanonicalDraftSection[]
): void {
  if (sections.length === 0) {
    throw new CanonicalTemplateError(
      "Add at least one section before publishing.",
      "invalid"
    );
  }
  parseCanonicalDraftSections(
    sections.map((section) => ({
      key: section.key,
      kind: section.kind,
      title: section.title,
      body: section.body,
      periodLabel: section.periodLabel,
      startDay: section.startDay,
      endDay: section.endDay,
      homeCareInstructions: section.homeCareInstructions.map((item) => ({
        key: item.key,
        title: item.title,
        body: item.body,
        frequencyCount: item.frequencyCount,
        frequencyPeriod: item.frequencyPeriod,
        timingLabel: item.timingLabel,
        durationValue: item.durationValue,
        durationUnit: item.durationUnit,
      })),
    }))
  );
}

export function canonicalSectionCreateData(
  section: CanonicalDraftSection
): Prisma.GuideTemplateSectionCreateWithoutRevisionInput {
  return {
    key: section.key,
    kind: section.kind,
    title: section.title,
    body: section.body,
    periodLabel: section.periodLabel,
    startDay: section.startDay,
    endDay: section.endDay,
    sortOrder: section.sortOrder,
    homeCareInstructions: {
      create: section.homeCareInstructions.map((item) => ({
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
    },
  };
}
