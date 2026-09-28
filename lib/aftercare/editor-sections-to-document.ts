import { relativeStageWhenLabel } from "@/lib/aftercare/recovery-day-label";
import type { HomeCareInstruction } from "@/lib/aftercare/home-care-instruction";
import type {
  ComposedGuideSection,
  GuideSectionKind,
} from "@/lib/aftercare/types";
import {
  canonicalSectionsFromEditor,
  type CanonicalEditorSection,
} from "@/lib/aftercare/canonical-editor-content";

function optionalDay(value: string): number | null {
  if (value.trim() === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

/**
 * Full patient-document sections for the Operator preview.
 * Provenance stays canonical. There is no clinic override or branding.
 */
export function editorSectionsToComposedGuide(
  sections: readonly CanonicalEditorSection[]
): ComposedGuideSection[] {
  const content = canonicalSectionsFromEditor(sections);
  return content.map((section, index) => {
    const source = sections[index];
    const startDay = optionalDay(source?.startDay ?? "");
    const endDay = optionalDay(source?.endDay ?? "");
    const homeCareInstructions: HomeCareInstruction[] =
      section.homeCareInstructions.map((item) => ({
        key: item.key,
        title: item.title,
        body: item.body,
        frequencyCount: item.frequencyCount,
        frequencyPeriod: item.frequencyPeriod,
        timingLabel: item.timingLabel,
        durationValue: item.durationValue,
        durationUnit: item.durationUnit,
        sortOrder: item.sortOrder,
      }));
    return {
      key: section.key,
      kind: section.kind as GuideSectionKind,
      title: section.title || "Untitled section",
      body: section.body,
      periodLabel:
        section.kind === "RECOVERY_TIMELINE"
          ? relativeStageWhenLabel({
              periodLabel: section.periodLabel,
              startDay,
              endDay,
            })
          : section.periodLabel,
      startDay: section.startDay,
      endDay: section.endDay,
      provenance: "canonical",
      homeCareInstructions,
    };
  });
}
