import { PRODUCT_NAME } from "@/lib/branding/product-name";

export const PRICING_CURRENCY = "AUD";

/**
 * Canonical advertised Australian dollar amounts. Do not copy these literals
 * elsewhere. These amounts are not a GST-inclusive claim: GST registration is
 * pending accountant confirmation, and public copy must not say prices include
 * GST.
 */
export const PLAN_PRICES = {
  essential: {
    monthlyAudInclGst: 79,
    annualAudInclGst: 790,
    includedLocations: 1,
    customGuides: 2,
    clinicTeamMembers: 2,
  },
  practice: {
    monthlyAudInclGst: 149,
    annualAudInclGst: 1490,
    includedLocations: 1,
    customGuides: 30,
    clinicTeamMembers: 5,
    /**
     * Internal commercial reference only. There is no Location model yet.
     * Do not format these amounts into public UI, metadata, or JSON-LD.
     */
    secondLocation: {
      monthlyAudInclGst: 79,
      annualAudInclGst: 790,
    },
    additionalLocation: {
      monthlyAudInclGst: 59,
      annualAudInclGst: 590,
    },
  },
} as const;

export function formatAudInclGst(amount: number): string {
  return `A$${amount.toLocaleString("en-AU")}`;
}

const essentialMonthly = formatAudInclGst(
  PLAN_PRICES.essential.monthlyAudInclGst
);
const essentialAnnual = formatAudInclGst(
  PLAN_PRICES.essential.annualAudInclGst
);
const practiceMonthly = formatAudInclGst(
  PLAN_PRICES.practice.monthlyAudInclGst
);
const practiceAnnual = formatAudInclGst(PLAN_PRICES.practice.annualAudInclGst);

export const PRICING_CURRENCY_LABEL = "All prices are in Australian dollars.";

export const PRICING_TYPOGRAPHY_FEATURE_LABEL =
  "Clinic branding and curated typography";

export const PRICING_SHARING_FEATURE_LABEL =
  "QR sharing, PDF and durable patient guide URLs";

export const PRICING_TYPOGRAPHY_FOOTNOTE_ID = "pricing-typography-note";

export const PRICING_TYPOGRAPHY_NOTE =
  "* Choose from six curated professional typefaces. Need another? Ask us — additional options can be reviewed subject to availability.";

export const PLAN_COMPARISON_CONTROL_LABEL = "Compare all plan features";

export const PLAN_COMPARISON_PANEL_ID = "plan-comparison-panel";

const ESSENTIAL_CARD_FEATURES = [
  `${PLAN_PRICES.essential.includedLocations} practice / location`,
  `${PRODUCT_NAME} guide templates`,
  `Create and edit up to ${PLAN_PRICES.essential.customGuides} custom clinic guides`,
  `Up to ${PLAN_PRICES.essential.clinicTeamMembers} clinic team members`,
  PRICING_TYPOGRAPHY_FEATURE_LABEL,
  PRICING_SHARING_FEATURE_LABEL,
] as const;

const PRACTICE_CARD_FEATURES = [
  "Everything in Essential",
  `Up to ${PLAN_PRICES.practice.customGuides} custom clinic guides`,
  `Adapt ${PRODUCT_NAME} templates to suit your clinic`,
  `Up to ${PLAN_PRICES.practice.clinicTeamMembers} clinic team members`,
  "Assisted setup",
] as const;

export const LAUNCH_PLANS = [
  {
    id: "essential",
    name: "Essential",
    monthlyPrice: essentialMonthly,
    annualPrice: essentialAnnual,
    annualNote: "2 months free",
    cadence: "per month",
    position:
      "For practices that want professional branded digital aftercare without extensive content management.",
    recommended: false,
    ctaLabel: "Request a demo",
    ctaHref: "/contact",
    features: ESSENTIAL_CARD_FEATURES,
    setupNotes: null,
  },
  {
    id: "practice",
    name: "Practice",
    monthlyPrice: practiceMonthly,
    annualPrice: practiceAnnual,
    annualNote: "2 months free",
    cadence: "per month",
    position:
      "For practices that want to create, adapt and manage their aftercare under their own brand.",
    recommended: true,
    ctaLabel: "Request a demo",
    ctaHref: "/contact",
    features: PRACTICE_CARD_FEATURES,
    setupNotes: ["Multi-location practice? Talk to us about your setup."],
  },
  {
    id: "group",
    name: "Group",
    monthlyPrice: null,
    annualPrice: null,
    annualNote: null,
    cadence: null,
    price: "Custom pricing",
    position:
      "For organisations that need coordinated rollout, central management and tailored support across their practices.",
    recommended: false,
    ctaLabel: "Talk to us",
    ctaHref: "/contact",
    features: [
      "Coordinated rollout across practices",
      "Custom onboarding",
      "Priority support",
      "Tailored account setup",
    ],
    setupNotes: null,
  },
] as const;

export const PRICING_NOTES = [
  {
    title: "Annual billing",
    body: "Annual plans include 12 months for the price of 10.",
  },
  {
    title: "Assisted onboarding",
    body: `${PRODUCT_NAME} helps practices configure their branding, guidance and patient-facing setup for launch.`,
  },
  {
    title: "Current product scope",
    body: `${PRODUCT_NAME}'s current plans cover branded aftercare publishing, guide management and clinic presentation according to plan. They do not currently include monitoring, persisted patient check-ins, CRM, messaging, or PMS integrations.`,
  },
] as const;

export const GUIDE_AVAILABILITY_NOTE = `Where an appropriate ${PRODUCT_NAME} template exists, the clinic can use it as a starting point. Clinic-specific content remains subject to the clinic's approval. Clinics remain responsible for approving the clinical guidance they publish.`;

export const ONBOARDING_STEPS = [
  {
    title: "Choose",
    body: `Choose an available ${PRODUCT_NAME} guide or provide clinic-approved aftercare content.`,
  },
  {
    title: "Adapt",
    body: "Apply your branding and, where your plan allows, adapt the guide with your clinic's approved instructions.",
  },
  {
    title: "Publish",
    body: "Publish a durable branded page patients can reopen after the appointment.",
  },
] as const;

export type PlanComparisonValueKind =
  "text" | "included" | "not-included" | "dash";

export type PlanComparisonValue = {
  kind: PlanComparisonValueKind;
  label: string;
};

export type PlanComparisonPlanId = "essential" | "practice" | "group";

export type PlanComparisonRow = {
  id: string;
  feature: string;
  essential: PlanComparisonValue;
  practice: PlanComparisonValue;
  group: PlanComparisonValue;
};

const included: PlanComparisonValue = {
  kind: "included",
  label: "Included",
};

const notIncluded: PlanComparisonValue = {
  kind: "not-included",
  label: "Not included",
};

const dash: PlanComparisonValue = {
  kind: "dash",
  label: "—",
};

function textValue(label: string): PlanComparisonValue {
  return { kind: "text", label };
}

function upTo(count: number): PlanComparisonValue {
  return textValue(`Up to ${count}`);
}

export const PLAN_COMPARISON_COLUMNS = [
  { id: "essential", name: "Essential", recommended: false },
  { id: "practice", name: "Practice", recommended: true },
  { id: "group", name: "Group", recommended: false },
] as const;

export const PLAN_COMPARISON_ROWS: readonly PlanComparisonRow[] = [
  {
    id: "locations",
    feature: "Practice / location",
    essential: textValue(String(PLAN_PRICES.essential.includedLocations)),
    practice: textValue(String(PLAN_PRICES.practice.includedLocations)),
    group: textValue("Tailored"),
  },
  {
    id: "custom-guides",
    feature: "Custom clinic guides",
    essential: upTo(PLAN_PRICES.essential.customGuides),
    practice: upTo(PLAN_PRICES.practice.customGuides),
    group: textValue("Tailored"),
  },
  {
    id: "clinic-team-members",
    feature: "Clinic team members",
    essential: upTo(PLAN_PRICES.essential.clinicTeamMembers),
    practice: upTo(PLAN_PRICES.practice.clinicTeamMembers),
    group: textValue("Tailored"),
  },
  {
    id: "templates",
    feature: `${PRODUCT_NAME} templates`,
    essential: included,
    practice: included,
    group: included,
  },
  {
    id: "create-edit-guides",
    feature: "Create and edit clinic-owned guides",
    essential: included,
    practice: included,
    group: included,
  },
  {
    id: "adapt-templates",
    feature: `Adapt ${PRODUCT_NAME} templates`,
    essential: notIncluded,
    practice: included,
    group: textValue("Tailored"),
  },
  {
    id: "branded-pages",
    feature: "Branded patient aftercare pages",
    essential: included,
    practice: included,
    group: included,
  },
  {
    id: "clinic-branding",
    feature: "Clinic branding",
    essential: included,
    practice: included,
    group: included,
  },
  {
    id: "curated-typography",
    feature: "Curated typography",
    essential: included,
    practice: included,
    group: included,
  },
  {
    id: "durable-urls",
    feature: "Durable patient guide URLs",
    essential: included,
    practice: included,
    group: included,
  },
  {
    id: "qr-sharing",
    feature: "QR sharing",
    essential: included,
    practice: included,
    group: included,
  },
  {
    id: "print-pdf",
    feature: "Print / Save PDF",
    essential: included,
    practice: included,
    group: included,
  },
  {
    id: "clinic-contact",
    feature: "Clinic contact and emergency information",
    essential: included,
    practice: included,
    group: included,
  },
  {
    id: "patient-presentation",
    feature: "Light / Dark / System patient presentation",
    essential: included,
    practice: included,
    group: included,
  },
  {
    id: "assisted-setup",
    feature: "Assisted setup",
    essential: included,
    practice: included,
    group: textValue("Custom onboarding"),
  },
  {
    id: "multi-location",
    feature: "Multi-location",
    essential: dash,
    practice: textValue("Talk to us"),
    group: textValue("Coordinated rollout"),
  },
  {
    id: "priority-support",
    feature: "Priority support",
    essential: dash,
    practice: dash,
    group: included,
  },
];
