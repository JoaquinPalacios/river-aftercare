import { homeCareInstructionSignature } from "@/lib/aftercare/home-care-instruction";
import { practiceRevisionSectionsFromComposed } from "@/lib/aftercare/practice-revision-document";
import type { ComposedGuideSection } from "@/lib/aftercare/types";

export function sameComposedSections(
  left: readonly ComposedGuideSection[],
  right: readonly ComposedGuideSection[]
): boolean {
  const leftSignature = practiceRevisionSectionsFromComposed([...left]).map(
    sectionSignature
  );
  const rightSignature = practiceRevisionSectionsFromComposed([...right]).map(
    sectionSignature
  );
  return (
    leftSignature.length === rightSignature.length &&
    leftSignature.every(
      (signature, index) => signature === rightSignature[index]
    )
  );
}

function sectionSignature(section: {
  key: string;
  kind: string;
  title: string;
  body: string;
  periodLabel: string | null;
  startDay: number | null;
  endDay: number | null;
  sortOrder: number;
  provenance: string;
  homeCareInstructions?: Parameters<typeof homeCareInstructionSignature>[0];
}): string {
  return JSON.stringify({
    key: section.key,
    kind: section.kind,
    title: section.title.trim(),
    body: section.body,
    periodLabel: blankToNull(section.periodLabel),
    startDay: section.startDay,
    endDay: section.endDay,
    sortOrder: section.sortOrder,
    provenance: section.provenance,
    homeCareInstructions: homeCareInstructionSignature(
      section.homeCareInstructions
    ),
  });
}

export function blankToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

export function sameText(
  left: string | null | undefined,
  right: string | null | undefined
): boolean {
  return (left?.trim() ?? "") === (right?.trim() ?? "");
}

export function demoCustomisationBlocker(input: {
  canonicalSectionKeys: ReadonlySet<string>;
  overrides: readonly { sectionKey: string }[];
  additions: readonly {
    key: string;
    insertAfterSectionKey: string | null;
  }[];
}): string | null {
  const missingOverrides = input.overrides
    .filter((override) => !input.canonicalSectionKeys.has(override.sectionKey))
    .map((override) => override.sectionKey);
  if (missingOverrides.length > 0) {
    const keys = missingOverrides.join(", ");
    return `The clinic override for ${keys} does not match a section in the selected sample revision. Update or remove that override before updating the live demo.`;
  }

  const collidingAdditions = input.additions
    .filter((addition) => input.canonicalSectionKeys.has(addition.key))
    .map((addition) => addition.key);
  if (collidingAdditions.length > 0) {
    return `The additional section ${collidingAdditions.join(", ")} uses a key that already belongs to the sample. It was not applied.`;
  }

  const missingTargets = input.additions.filter(
    (addition) =>
      addition.insertAfterSectionKey !== null &&
      !input.canonicalSectionKeys.has(addition.insertAfterSectionKey)
  );
  if (missingTargets.length > 0) {
    return missingTargets
      .map(
        (addition) =>
          `The additional section ${addition.key} is placed after ${addition.insertAfterSectionKey}, which is not in the selected sample revision.`
      )
      .join(" ");
  }

  return null;
}
