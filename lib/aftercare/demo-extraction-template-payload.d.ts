declare module "@/lib/aftercare/demo-extraction-template-payload.mjs" {
  export const DEMO_EXTRACTION_TEMPLATE_SLUG: string;
  export const DEMO_EXTRACTION_TEMPLATE_TITLE: string;
  export const DEMO_EXTRACTION_TEMPLATE_SPECIALTY: "DENTAL";
  export const DEMO_EXTRACTION_TEMPLATE_VERSION: number;
  export const DEMO_EXTRACTION_CANONICAL_SECTIONS: ReadonlyArray<{
    key: string;
    kind: string;
    title: string;
    body: string;
    periodLabel: string | null;
    startDay: number | null;
    endDay: number | null;
    sortOrder: number;
  }>;
}
