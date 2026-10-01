import "server-only";

export const BUSINESS_NUMBER_KINDS = ["abn", "acn", "none"] as const;

export type BusinessNumberKind = (typeof BUSINESS_NUMBER_KINDS)[number];

export function isBusinessNumberKind(
  value: string
): value is BusinessNumberKind {
  return (BUSINESS_NUMBER_KINDS as readonly string[]).includes(value);
}

/**
 * Billing setup shows one choice. A saved ABN selects ABN, including when an
 * older row also has an ACN. A saved ACN with no ABN selects ACN. Neither
 * selects None. `parseAustralianBusinessIdentity` still allows both values
 * for other callers; this helper does not change that rule.
 */
export function businessNumberKindFromSaved(input: {
  abn?: string | null;
  acn?: string | null;
}): BusinessNumberKind {
  if (input.abn?.trim()) {
    return "abn";
  }
  if (input.acn?.trim()) {
    return "acn";
  }
  return "none";
}
