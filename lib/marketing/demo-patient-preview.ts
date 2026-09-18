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
export const MARKETING_DEMO_TODAY_DO_BODY =
  DEMO_EXTRACTION_CANONICAL_SECTIONS.find(
    (section) => section.key === "immediate-care"
  )?.body ?? "";

export const MARKETING_DEMO_INSTRUCTIONS_LABEL = instructionLabel(
  MARKETING_DEMO_TERMINOLOGY
);

export const MARKETING_DEMO_GUIDE_HINT = `View ${MARKETING_DEMO_INSTRUCTIONS_LABEL.toLowerCase()}`;

export const MARKETING_DEMO_CALL_LABEL = `Call ${MARKETING_DEMO_CLINIC_NAME}`;

export const MARKETING_DEMO_THEME_SCOPE = AFTERCARE_THEME_SCOPE;
export const MARKETING_DEMO_THEME_APPEARANCE = "portal";

export const MARKETING_DEMO_TIMELINE = [
  {
    period: "First few hours",
    title: "Immediate care",
    summary: "Follow the clinic's immediate care notes and take it easy.",
    status: "current",
  },
  {
    period: "Days 2–3",
    title: "Early recovery",
    status: "upcoming",
  },
  {
    period: "Days 4–7",
    title: "Healing check",
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
