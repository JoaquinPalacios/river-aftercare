import { normalizePeriodLabel } from "@/lib/aftercare/period-label";
import { normalizeDayRange } from "@/lib/aftercare/timeline-range";
import type {
  CanonicalGuideSection,
  ComposedGuideDocument,
  ComposedGuideSection,
  ComposeGuideDocumentInput,
  PracticeGuideAdditionInput,
} from "@/lib/aftercare/types";

function compareBySortOrderThenKey(
  left: { key: string; sortOrder: number },
  right: { key: string; sortOrder: number }
): number {
  if (left.sortOrder !== right.sortOrder) {
    return left.sortOrder - right.sortOrder;
  }

  return left.key.localeCompare(right.key);
}

function toAdditionSection(
  addition: PracticeGuideAdditionInput
): ComposedGuideSection {
  const range = normalizeDayRange(addition.startDay, addition.endDay);
  return {
    key: addition.key,
    kind: addition.kind,
    title: addition.title,
    body: addition.body,
    periodLabel: normalizePeriodLabel(addition.periodLabel),
    startDay: range.startDay,
    endDay: range.endDay,
    provenance: "practice_addition",
    homeCareInstructions: addition.homeCareInstructions ?? [],
  };
}

function additionsForTarget(
  additionsByTarget: Map<string | null, PracticeGuideAdditionInput[]>,
  target: string | null
): PracticeGuideAdditionInput[] {
  const group = additionsByTarget.get(target) ?? [];
  return group.toSorted(compareBySortOrderThenKey);
}

/**
 * Pure composition of a patient-visible guide document.
 *
 * Resolution:
 * 1. Canonical sections ordered by sortOrder, then key.
 * 2. A matching practice override replaces title/body; kind and key stay canonical.
 * 3. Additions whose insertAfterSectionKey matches a canonical key follow that
 *    section, ordered by sortOrder then key.
 * 4. Additions with no target, or whose target is missing, append at the end
 *    in the same deterministic order. Missing targets never throw.
 * 5. Orphan overrides (no matching canonical key) are ignored.
 *
 * ClinicProfile contact/emergency chrome is out of scope for this function.
 */
export function composeGuideDocument(
  input: ComposeGuideDocumentInput
): ComposedGuideDocument {
  const canonicalSections = input.canonicalSections.toSorted(
    compareBySortOrderThenKey
  );
  const canonicalKeys = new Set(
    canonicalSections.map((section) => section.key)
  );
  const overrideByKey = new Map(
    input.overrides.map((item) => [item.sectionKey, item])
  );
  const additionsByTarget = new Map<
    string | null,
    PracticeGuideAdditionInput[]
  >();

  for (const addition of input.additions) {
    const target =
      addition.insertAfterSectionKey !== null &&
      canonicalKeys.has(addition.insertAfterSectionKey)
        ? addition.insertAfterSectionKey
        : null;
    const group = additionsByTarget.get(target) ?? [];
    group.push(addition);
    additionsByTarget.set(target, group);
  }

  const sections: ComposedGuideSection[] = [];

  for (const canonicalSection of canonicalSections) {
    const override = overrideByKey.get(canonicalSection.key);
    sections.push(composeCanonicalSection(canonicalSection, override));

    for (const addition of additionsForTarget(
      additionsByTarget,
      canonicalSection.key
    )) {
      sections.push(toAdditionSection(addition));
    }
  }

  for (const addition of additionsForTarget(additionsByTarget, null)) {
    sections.push(toAdditionSection(addition));
  }

  return { sections };
}

function composeCanonicalSection(
  canonicalSection: CanonicalGuideSection,
  override: { title: string; body: string } | undefined
): ComposedGuideSection {
  const range = normalizeDayRange(
    canonicalSection.startDay,
    canonicalSection.endDay
  );

  if (!override) {
    return {
      key: canonicalSection.key,
      kind: canonicalSection.kind,
      title: canonicalSection.title,
      body: canonicalSection.body,
      periodLabel: normalizePeriodLabel(canonicalSection.periodLabel),
      startDay: range.startDay,
      endDay: range.endDay,
      provenance: "canonical",
      homeCareInstructions: canonicalSection.homeCareInstructions ?? [],
    };
  }

  return {
    key: canonicalSection.key,
    kind: canonicalSection.kind,
    title: override.title,
    body: override.body,
    periodLabel: normalizePeriodLabel(canonicalSection.periodLabel),
    startDay: range.startDay,
    endDay: range.endDay,
    provenance: "practice_override",
    homeCareInstructions: canonicalSection.homeCareInstructions ?? [],
  };
}
