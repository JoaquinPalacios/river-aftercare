import { DEMO_EXTRACTION_CANONICAL_SECTIONS } from "@/lib/aftercare/demo-extraction-template-payload.mjs";
import { instructionLabel } from "@/lib/aftercare/instruction-terminology";
import {
  AFTERCARE_THEME_SCOPE,
  resolveAftercareTheme,
  serializeAftercareThemeCss,
} from "@/lib/branding/aftercare-theme";

export const MARKETING_DEMO_CLINIC_NAME = "Riverside Dental Demo";
export const MARKETING_DEMO_PRIMARY_COLOR = "#0f766e";
export const MARKETING_DEMO_ACCENT_COLOR = "#f59e0b";
export const MARKETING_DEMO_TERMINOLOGY = "POST_TREATMENT";
export const MARKETING_DEMO_GUIDE_TITLE = "Tooth Extraction";
export const MARKETING_DEMO_RECOVERY_HEADING = "Recovery overview";
export const MARKETING_DEMO_TODAY_LABEL = "Today";
export const MARKETING_DEMO_TIMELINE_LABEL = "Timeline";
export const MARKETING_DEMO_CURRENT_LABEL = "Current";
export const MARKETING_DEMO_COMING_NEXT_LABEL = "Coming next";
export const MARKETING_DEMO_TODAY_DO_HEADING = "What to do today";

/**
 * Canonical Tooth Extraction sample sections for the marketing phone
 * illustration. Period, title, and upcoming summaries are read from the
 * demo payload — do not author replacement clinical wording here.
 */
function demoExtractionSection(key: string) {
  const section = DEMO_EXTRACTION_CANONICAL_SECTIONS.find(
    (entry) => entry.key === key
  );
  if (!section?.periodLabel) {
    throw new Error(
      `Missing Tooth Extraction sample section "${key}" for the marketing phone preview.`
    );
  }
  return {
    key: section.key,
    period: section.periodLabel,
    title: section.title,
    body: section.body,
  };
}

const DEMO_IMMEDIATE_CARE = demoExtractionSection("immediate-care");
const DEMO_EARLY_RECOVERY = demoExtractionSection("days-2-3");
const DEMO_HEALING_CHECK = demoExtractionSection("days-4-7");

function firstSampleSentence(body: string): string {
  const trimmed = body.trim();
  const match = trimmed.match(/^.+?[.](?:\s|$)/);
  return (match?.[0] ?? trimmed).trim();
}

export const MARKETING_DEMO_TODAY_DO_BODY = DEMO_IMMEDIATE_CARE.body;

export const MARKETING_DEMO_INSTRUCTIONS_LABEL = instructionLabel(
  MARKETING_DEMO_TERMINOLOGY
);

export const MARKETING_DEMO_CALL_LABEL = `Call ${MARKETING_DEMO_CLINIC_NAME}`;

export const MARKETING_DEMO_THEME_SCOPE = AFTERCARE_THEME_SCOPE;
export const MARKETING_DEMO_THEME_APPEARANCE = "portal";

/**
 * Current-stage summary stays the existing short marketing preview line.
 * The full Immediate care body is already shown under “What to do today”.
 * Upcoming summaries are the first sentence of each canonical sample
 * body, used as a compact preview rather than the full stage copy.
 */
export const MARKETING_DEMO_CURRENT_STAGE_SUMMARY =
  "Follow the clinic's immediate care notes and take it easy.";

export const MARKETING_DEMO_TIMELINE = [
  {
    key: DEMO_IMMEDIATE_CARE.key,
    period: DEMO_IMMEDIATE_CARE.period,
    title: DEMO_IMMEDIATE_CARE.title,
    summary: MARKETING_DEMO_CURRENT_STAGE_SUMMARY,
    status: "current",
  },
  {
    key: DEMO_EARLY_RECOVERY.key,
    period: DEMO_EARLY_RECOVERY.period,
    title: DEMO_EARLY_RECOVERY.title,
    summary: firstSampleSentence(DEMO_EARLY_RECOVERY.body),
    status: "upcoming",
  },
  {
    key: DEMO_HEALING_CHECK.key,
    period: DEMO_HEALING_CHECK.period,
    title: DEMO_HEALING_CHECK.title,
    summary: firstSampleSentence(DEMO_HEALING_CHECK.body),
    status: "upcoming",
  },
] as const;

export const MARKETING_DEMO_PATIENT_THEME_CSS = serializeAftercareThemeCss(
  resolveAftercareTheme({
    primaryColor: MARKETING_DEMO_PRIMARY_COLOR,
    accentColor: MARKETING_DEMO_ACCENT_COLOR,
  }),
  { colorSchemeSelector: "scope" }
);
