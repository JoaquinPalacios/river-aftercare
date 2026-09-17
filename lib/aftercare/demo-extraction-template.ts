import {
  DEMO_EXTRACTION_CANONICAL_SECTIONS,
  DEMO_EXTRACTION_TEMPLATE_SLUG,
  DEMO_EXTRACTION_TEMPLATE_SPECIALTY,
  DEMO_EXTRACTION_TEMPLATE_TITLE,
  DEMO_EXTRACTION_TEMPLATE_VERSION,
} from "@/lib/aftercare/demo-extraction-template-payload.mjs";
import type { GuideSectionKind } from "@/lib/aftercare/types";

export {
  DEMO_EXTRACTION_CANONICAL_SECTIONS,
  DEMO_EXTRACTION_TEMPLATE_SLUG,
  DEMO_EXTRACTION_TEMPLATE_SPECIALTY,
  DEMO_EXTRACTION_TEMPLATE_TITLE,
  DEMO_EXTRACTION_TEMPLATE_VERSION,
};

export interface DemoExtractionCanonicalSection {
  key: string;
  kind: GuideSectionKind;
  title: string;
  body: string;
  periodLabel: string | null;
  startDay: number | null;
  endDay: number | null;
  sortOrder: number;
}

export const DEMO_EXTRACTION_SECTIONS =
  DEMO_EXTRACTION_CANONICAL_SECTIONS as DemoExtractionCanonicalSection[];

export function isDemoExtractionTemplateSlug(slug: string): boolean {
  return slug === DEMO_EXTRACTION_TEMPLATE_SLUG;
}
