import type { CanonicalTemplateImportMode } from "@/lib/canonical-templates/import/constants";

export interface CanonicalTemplateImportReport {
  sourceLabel: string | null;
  schemaValid: boolean;
  modeLabel: string | null;
  mode: CanonicalTemplateImportMode | null;
  title: string | null;
  slug: string | null;
  serviceCategory: string | null;
  sectionCount: number | null;
  homeCareInstructionCount: number | null;
  inspected: boolean;
  templateExists: boolean;
  openDraftExists: boolean;
  latestPublishedVersion: number | null;
  intendedDraftVersion: number | null;
  lifecycleConflicts: string[];
  validationErrors: string[];
  reviewNotice: string | null;
  outcome: "valid" | "invalid" | "applied" | "failed";
  templateId: string | null;
  draftVersion: number | null;
  reviewCleared: boolean;
  reviewKept: boolean;
  failureMessage: string | null;
  failurePersisted: boolean;
}
