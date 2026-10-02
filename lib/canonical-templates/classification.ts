export const CANONICAL_TEMPLATE_CLASSIFICATIONS = [
  "PRODUCTION",
  "SAMPLE",
] as const;

export type CanonicalTemplateClassification =
  (typeof CANONICAL_TEMPLATE_CLASSIFICATIONS)[number];

export function isCanonicalTemplateClassification(
  value: string
): value is CanonicalTemplateClassification {
  return (CANONICAL_TEMPLATE_CLASSIFICATIONS as readonly string[]).includes(
    value
  );
}

export function classificationFromIsSample(
  isSample: boolean
): CanonicalTemplateClassification {
  return isSample ? "SAMPLE" : "PRODUCTION";
}

export function isSampleClassification(
  classification: CanonicalTemplateClassification
): boolean {
  return classification === "SAMPLE";
}

export function activeSampleConflictMessage(
  categoryLabel: string,
  title: string
): string {
  return `${categoryLabel} already has an active sample: ${title}.`;
}
