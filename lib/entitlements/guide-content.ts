export type ComparableGuideSection = {
  key: string;
  kind: string;
  title: string;
  body: string;
  periodLabel: string | null;
  startDay: number | null;
  endDay: number | null;
  sortOrder: number;
};

function blankToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function sectionSignature(section: ComparableGuideSection): string {
  return JSON.stringify({
    key: section.key,
    kind: section.kind,
    title: section.title.trim(),
    body: section.body,
    periodLabel: blankToNull(section.periodLabel),
    startDay: section.startDay,
    endDay: section.endDay,
    sortOrder: section.sortOrder,
  });
}

/**
 * Clinic-specific template content. A public-slug change is not adaptation.
 * Comparison uses the stored draft and the submitted draft, not a guess
 * about whether the text still equals the canonical library.
 */
export function suppliedTemplateContentChanged(input: {
  currentTitle: string;
  nextTitle: string;
  currentIntroduction: string | null;
  nextIntroduction: string;
  currentSections: ComparableGuideSection[];
  nextSections: ComparableGuideSection[];
}): boolean {
  if (input.currentTitle.trim() !== input.nextTitle.trim()) {
    return true;
  }
  if (
    blankToNull(input.currentIntroduction) !==
    blankToNull(input.nextIntroduction)
  ) {
    return true;
  }

  const current = input.currentSections.map(sectionSignature);
  const next = input.nextSections.map(sectionSignature);
  if (current.length !== next.length) {
    return true;
  }
  return current.some((signature, index) => signature !== next[index]);
}
