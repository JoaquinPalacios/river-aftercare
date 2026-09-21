import {
  CLINIC_VERTICAL_NAV,
  type ClinicVerticalPath,
} from "@/lib/marketing/clinic-verticals";
import type { VerticalThemeId } from "@/lib/marketing/vertical-landing";

export const CLINICS_HUB_COPY = {
  hero: {
    eyebrow: "For clinics & practices",
    h1: "Aftercare built around the way your clinic works.",
    body: "River Aftercare is patient aftercare software for treatment-based clinics. Publish clear, branded guidance patients can return to after appointments, procedures and between visits.",
    primaryCta: "Request a demo",
    secondaryCta: "Explore clinic types",
  },
  platform: {
    eyebrow: "One platform",
    h2: "Different kinds of care. The same need for clear aftercare.",
    body: "The language and guidance vary by profession. The workflow stays the same: your clinic publishes approved aftercare in its own brand, and patients reopen it whenever they need it from a durable link or QR code.",
  },
  discovery: {
    eyebrow: "For different clinic workflows",
    h2: "Find River Aftercare for your practice",
  },
  foundation: {
    eyebrow: "Shared foundation",
    h2: "What stays consistent across every clinic",
    items: [
      {
        title: "Clinic controlled",
        body: "Your clinic decides what guidance it publishes and remains responsible for its clinical content.",
      },
      {
        title: "Clinic branded",
        body: "Your logo, colours, terminology and contact details remain part of the patient experience.",
      },
      {
        title: "Easy to revisit",
        body: "Patients return through a durable link or QR code whenever they need the guidance again.",
      },
      {
        title: "No patient account",
        body: "Published guidance opens in the browser without another app or patient login.",
      },
    ],
  },
  other: {
    eyebrow: "Beyond these four",
    h2: "Another treatment-based practice?",
    body: "If your clinic sends patients home with guidance they may need to revisit, River Aftercare may fit your workflow.",
    cta: "Tell us about your clinic",
    fitLabel: "A good fit when",
    fitItems: [
      "Guidance continues after the appointment",
      "Your clinic wants to keep its own brand and terminology",
      "Patients need a simple way to revisit guidance without an account",
    ],
  },
  cta: {
    h2: "Give your aftercare a place patients can return to.",
    body: "Tell us how your clinic shares guidance today and we'll show you how River Aftercare could fit your workflow.",
    primary: "Request a demo",
    secondary: "View pricing",
  },
  visual: {
    label:
      "Four clinic workflows sharing one branded patient-aftercare foundation",
    coreTitle: "Branded patient aftercare",
    coreFacts: ["Link or QR", "No patient app or login"],
    paths: [
      {
        themeId: "dental",
        label: "Dental",
        detail: "Post-treatment instructions",
      },
      {
        themeId: "physiotherapy",
        label: "Physiotherapy",
        detail: "Recovery",
      },
      { themeId: "chiropractic", label: "Chiropractic", detail: "Home-care" },
      { themeId: "cosmetic", label: "Cosmetic", detail: "Aftercare" },
    ],
  },
} as const;

export interface ClinicsHubCard {
  path: ClinicVerticalPath;
  themeId: VerticalThemeId;
  label: string;
  body: string;
  cta: string;
}

export const CLINICS_HUB_CARDS: readonly ClinicsHubCard[] = [
  {
    path: "/dental",
    themeId: "dental",
    label: CLINIC_VERTICAL_NAV[0].cardTitle,
    body: CLINIC_VERTICAL_NAV[0].cardCopy,
    cta: "Explore dental aftercare",
  },
  {
    path: "/physiotherapy",
    themeId: "physiotherapy",
    label: CLINIC_VERTICAL_NAV[1].cardTitle,
    body: CLINIC_VERTICAL_NAV[1].cardCopy,
    cta: "Explore physiotherapy aftercare",
  },
  {
    path: "/chiropractic",
    themeId: "chiropractic",
    label: CLINIC_VERTICAL_NAV[2].cardTitle,
    body: CLINIC_VERTICAL_NAV[2].cardCopy,
    cta: "Explore chiropractic aftercare",
  },
  {
    path: "/cosmetic-clinics",
    themeId: "cosmetic",
    label: CLINIC_VERTICAL_NAV[3].cardTitle,
    body: CLINIC_VERTICAL_NAV[3].cardCopy,
    cta: "Explore cosmetic & aesthetic aftercare",
  },
] as const;
