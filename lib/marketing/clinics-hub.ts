import {
  CLINIC_VERTICAL_NAV,
  type ClinicVerticalPath,
} from "@/lib/marketing/clinic-verticals";
import type { VerticalThemeId } from "@/lib/marketing/vertical-landing";

export const CLINICS_HUB_COPY = {
  hero: {
    eyebrow: "For clinics & practices",
    h1: "Aftercare built around the way your clinic works.",
    body: "River Aftercare gives treatment-based clinics a branded place for the guidance patients need after appointments, procedures and between visits.",
    primaryCta: "Request a demo",
    secondaryCta: "Explore clinic types",
  },
  platform: {
    eyebrow: "One platform",
    h2: "Different kinds of care. The same need for clarity afterwards.",
    body: "The language changes between professions. Dental practices publish post-treatment instructions. Physiotherapists share recovery and home-care guidance. Chiropractic practices share clinic-approved home-care and post-appointment guidance. Cosmetic clinics provide post-treatment aftercare. River Aftercare gives each of them the same underlying foundation: clear, clinic-branded guidance patients can return to.",
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
        body: "Your identity, terminology and contact details remain part of the patient experience.",
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
    h2: "Don't see your clinic type?",
    body: "River Aftercare is designed for treatment-based practices where important guidance continues after the appointment. Tell us about your workflow and we'll determine whether the platform is a good fit.",
    cta: "Talk to us",
  },
  cta: {
    h2: "Give your aftercare a place patients can return to.",
    body: "Tell us how your clinic shares guidance today and we'll show you how River Aftercare could fit your workflow.",
    primary: "Request a demo",
    secondary: "View pricing",
  },
  visual: {
    label:
      "Four clinic workflows sharing one branded patient-guidance foundation",
    coreTitle: "Branded patient guidance",
    coreFacts: ["Link or QR", "No app or login"],
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
    cta: "Explore physiotherapy",
  },
  {
    path: "/chiropractic",
    themeId: "chiropractic",
    label: CLINIC_VERTICAL_NAV[2].cardTitle,
    body: CLINIC_VERTICAL_NAV[2].cardCopy,
    cta: "Explore chiropractic",
  },
  {
    path: "/cosmetic-clinics",
    themeId: "cosmetic",
    label: CLINIC_VERTICAL_NAV[3].cardTitle,
    body: CLINIC_VERTICAL_NAV[3].cardCopy,
    cta: "Explore cosmetic & aesthetic",
  },
] as const;
