/**
 * Shared launch legal status. Public `/privacy` and `/terms` copy is published
 * without a draft banner. Operator legal-approval flags remain separate and
 * still false.
 */
export const LEGAL_DOCUMENT_STATUS = "DRAFT_FOR_LEGAL_REVIEW";

export const LEGAL_LAST_UPDATED_ISO = "2026-09-17";

export const PRIVACY_LAST_UPDATED_ISO = "2026-09-21";

export const TERMS_LAST_UPDATED_ISO = "2026-09-21";

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
