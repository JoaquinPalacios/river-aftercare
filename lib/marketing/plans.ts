import { PRODUCT_NAME } from "@/lib/branding/product-name";

export const PRICING_CURRENCY = "AUD";

/** Canonical GST-inclusive Australian dollar amounts. Do not copy these literals elsewhere. */
export const PLAN_PRICES = {
  essential: {
    monthlyAudInclGst: 79,
    annualAudInclGst: 790,
    includedLocations: 1,
    customGuides: 2,
  },
  practice: {
    monthlyAudInclGst: 149,
    annualAudInclGst: 1490,
    includedLocations: 1,
    customGuides: 30,
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

export const PRICING_GST_LABEL = "All prices include GST.";

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
    features: [
      "1 practice / location",
      `${PRODUCT_NAME} guide templates`,
      `Up to ${PLAN_PRICES.essential.customGuides} custom clinic guides`,
      "Branded patient aftercare pages",
      "Logo, colours and curated typography",
      "Permanent guide URLs",
      "QR-ready sharing",
      "Print / Save PDF",
      "Clinic contact and emergency information",
      "Light, Dark and System patient presentation",
    ],
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
    features: [
      "Everything in Essential",
      `Up to ${PLAN_PRICES.practice.customGuides} custom clinic guides`,
      "Create and adapt clinic aftercare",
      "Guide and section controls",
      "Local clinic instructions",
      "Assisted setup",
    ],
    setupNotes: [
      "Multi-location practice? Talk to us about your setup.",
      "Need a larger guide library? Talk to us.",
    ],
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
    title: "GST included",
    body: "All advertised prices are in Australian dollars and include GST.",
  },
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

export const PRICING_TYPOGRAPHY_NOTE =
  "Choose from a curated set of professional typefaces. Need another? Ask us — additional options can be reviewed subject to availability.";

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
