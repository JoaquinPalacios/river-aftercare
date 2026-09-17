import { PRODUCT_NAME } from "@/lib/branding/product-name";

export const PRICING_DISCLAIMER =
  "Working Australian pricing. Provisional, and not a final commercial contract.";

export const LAUNCH_PLANS = [
  {
    id: "essential",
    name: "Essential",
    price: "A$79",
    cadence: "per month",
    position: "For a clinic getting started with branded digital aftercare.",
    recommended: false,
    ctaLabel: "Request a demo",
    ctaHref: "/contact",
    features: [
      "1 practice / location",
      "Branded patient aftercare pages",
      "Controlled clinic branding",
      "Available River Aftercare guide templates",
      "Permanent guide URLs",
      "QR-ready sharing",
      "Print / Save PDF",
      "Clinic contact and emergency information",
      "Light, Dark and System patient presentation",
    ],
  },
  {
    id: "practice",
    name: "Practice",
    price: "A$149",
    cadence: "per month",
    position:
      "For an established clinic that needs more control over content and presentation.",
    recommended: true,
    ctaLabel: "Request a demo",
    ctaHref: "/contact",
    features: [
      "Everything in Essential",
      "Expanded guide and setup options, confirmed during onboarding",
      "Clinic section overrides",
      "Local instructions and clinic additions",
      "Custom clinic guides prepared during onboarding",
      "Richer branding controls",
      "Operator-led clinic setup for launch",
      `Option to hide ${PRODUCT_NAME} attribution`,
    ],
  },
  {
    id: "group",
    name: "Group",
    price: "Custom pricing",
    cadence: null,
    position: "For multi-location groups that need a tailored rollout.",
    recommended: false,
    ctaLabel: "Talk to us",
    ctaHref: "/contact",
    features: [
      "Multiple locations",
      "Coordinated rollout and operator-led setup",
      "Custom onboarding",
      "Priority support",
    ],
  },
] as const;

export const COMING_AFTER_LAUNCH = [
  "Patient check-ins",
  "Advanced follow-up",
  "Connected aftercare plans",
  "Messaging and integrations",
] as const;

export const PRICING_NOTES = [
  {
    title: "Assisted onboarding",
    body: "Assisted onboarding is available. Setup is handled with you rather than as a self-serve wizard.",
  },
  {
    title: "Billing",
    body: "These are working monthly prices in Australian dollars. Self-serve billing and an annual option are not published yet.",
  },
  {
    title: "Launch scope",
    body: "Active plans describe aftercare pages, branding, templates, and clinic-controlled publishing. They do not include live clinical monitoring, persisted patient check-ins, CRM, messaging, or PMS integrations.",
  },
] as const;

export const GUIDE_AVAILABILITY_NOTE = `The ${PRODUCT_NAME} template library is still expanding. Template availability depends on the care area and is confirmed during onboarding. Clinics remain responsible for approving the clinical guidance they publish.`;
