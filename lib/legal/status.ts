/**
 * Shared launch legal status. `/terms` remains a production-facing draft.
 * `/privacy` public copy is published without a draft banner; the operator
 * legal-approval flag is separate and still false.
 */
export const LEGAL_DOCUMENT_STATUS = "DRAFT_FOR_LEGAL_REVIEW";

export const LEGAL_LAST_UPDATED_ISO = "2026-09-17";

export const PRIVACY_LAST_UPDATED_ISO = "2026-09-19";

export const LEGAL_ABN = "32 671 297 130";

export const LEGAL_PUBLIC_LOCATION =
  "Tweed Heads South, New South Wales, Australia";

export const LEGAL_GOVERNING_LAW = "New South Wales, Australia";

export const LEGAL_OPERATOR_PERSON_NAME = "Pedro Joaquin Palacios";

export const LEGAL_PRIVACY_EMAIL = "admin@riveraftercare.com.au";

export const LEGAL_PLACEHOLDERS = {
  legalEntityName: "[FULL LEGAL NAME]",
  privacyEmail: "[PRIVACY EMAIL]",
} as const;

export function legalOperatorIdentity(productName: string): string {
  return `${LEGAL_PLACEHOLDERS.legalEntityName}, an Australian sole trader trading as ${productName}, ABN ${LEGAL_ABN}, based in ${LEGAL_PUBLIC_LOCATION}`;
}

export function formatLegalLastUpdated(
  isoDate: string = LEGAL_LAST_UPDATED_ISO
): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  if (!year || !month || !day) {
    return isoDate;
  }

  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}
