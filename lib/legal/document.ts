import { PRODUCT_NAME } from "@/lib/branding/product-name";
import {
  formatLegalLastUpdated,
  LEGAL_DOCUMENT_STATUS,
  LEGAL_LAST_UPDATED_ISO,
  LEGAL_PLACEHOLDERS,
} from "@/lib/legal/status";

export type LegalBlock =
  | { type: "p"; text: string }
  | { type: "ul"; items: readonly string[] }
  | { type: "placeholder"; text: string }
  | { type: "address"; lines: readonly string[] };

export interface LegalSection {
  id: string;
  title: string;
  blocks: readonly LegalBlock[];
}

export interface LegalDocument {
  slug: "/privacy" | "/terms";
  eyebrow: string;
  title: string;
  intro: string;
  preamble: readonly string[];
  draftBanner: string | null;
  status: typeof LEGAL_DOCUMENT_STATUS;
  lastUpdatedIso: string;
  lastUpdatedLabel: string;
  sections: readonly LegalSection[];
}

export const TERMS_DRAFT_BANNER = `DRAFT FOR LEGAL REVIEW. These terms are being prepared for ${PRODUCT_NAME}'s production launch and have not yet received final legal approval.`;

export function legalDocumentMeta(input: {
  slug: LegalDocument["slug"];
  title: string;
  intro: string;
  preamble?: readonly string[];
  draftBanner?: string | null;
  lastUpdatedIso?: string;
  sections: readonly LegalSection[];
}): LegalDocument {
  const lastUpdatedIso = input.lastUpdatedIso ?? LEGAL_LAST_UPDATED_ISO;
  return {
    slug: input.slug,
    eyebrow: "Legal",
    title: input.title,
    intro: input.intro,
    preamble: input.preamble ?? [],
    draftBanner: input.draftBanner ?? null,
    status: LEGAL_DOCUMENT_STATUS,
    lastUpdatedIso,
    lastUpdatedLabel: formatLegalLastUpdated(lastUpdatedIso),
    sections: input.sections,
  };
}

export { LEGAL_PLACEHOLDERS, PRODUCT_NAME };
