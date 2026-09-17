import { PRODUCT_NAME } from "@/lib/branding/product-name";

import type { ClinicVerticalPath } from "@/lib/marketing/clinic-verticals";

export type VerticalHeroAtmosphere = "pricing" | "contact";

export type VerticalSecondaryCta =
  | { kind: "demo"; label: string }
  | { kind: "anchor"; label: string; href: "#workflow" };

export interface VerticalCard {
  title: string;
  body: string;
}

export interface VerticalStep {
  title: string;
  body: string;
}

export interface VerticalFaq {
  question: string;
  answer: string;
}

export type VerticalExtraSection =
  | {
      kind: "demo";
      h2: string;
      body: string;
      ctaLabel: string;
    }
  | {
      kind: "copy";
      h2: string;
      body: string;
    };

export interface VerticalLandingContent {
  path: ClinicVerticalPath;
  heroAtmosphere: VerticalHeroAtmosphere;
  hero: {
    eyebrow: string;
    h1: string;
    body: string;
    primaryCtaLabel: string;
    secondaryCta: VerticalSecondaryCta;
  };
  problem: {
    eyebrow?: string;
    h2: string;
    cards: readonly [VerticalCard, VerticalCard, VerticalCard];
  };
  solution: {
    h2: string;
    body: string;
    benefits: readonly VerticalCard[];
  };
  guidance: {
    h2: string;
    body: string;
    items?: readonly string[];
    note?: string;
    boundary?: string;
  };
  workflow: {
    h2: string;
    steps: readonly [VerticalStep, VerticalStep, VerticalStep, VerticalStep];
  };
  extras: readonly VerticalExtraSection[];
  faq: {
    h2: string;
    items: readonly VerticalFaq[];
  };
  cta: {
    h2: string;
    body: string;
    label: string;
  };
}

export const DENTAL_LANDING: VerticalLandingContent = {
  path: "/dental",
  heroAtmosphere: "pricing",
  hero: {
    eyebrow: `${PRODUCT_NAME} for dental practices`,
    h1: "Make post-treatment instructions part of your dental experience.",
    body: "Give patients clear, practice-branded guidance they can reopen after treatment — by link or QR code, with no app or patient login.",
    primaryCtaLabel: "Request a demo",
    secondaryCta: { kind: "demo", label: "View the dental demo" },
  },
  problem: {
    eyebrow: "After the appointment",
    h2: "The treatment ends. The questions often don't.",
    cards: [
      {
        title: "Instructions are easy to forget",
        body: "Patients may remember only part of what was explained once they leave the chair.",
      },
      {
        title: "Paper doesn't always make it home",
        body: "Printed instructions can be misplaced, while old attachments and PDFs can be awkward to find again on a phone.",
      },
      {
        title: "Generic handouts break the experience",
        body: "Aftercare should still feel connected to the dental practice that provided the treatment.",
      },
    ],
  },
  solution: {
    h2: "One branded place for post-treatment guidance",
    body: `${PRODUCT_NAME} turns practice-approved instructions into clear web pages patients can revisit after treatment. Your practice identity, contact details and guidance stay together in one durable experience.`,
    benefits: [
      {
        title: "Practice-branded",
        body: "Keep your name, colours and terminology visible after the patient leaves.",
      },
      {
        title: "Easy to revisit",
        body: "Patients return through the same durable link or QR code without creating an account.",
      },
      {
        title: "Consistent for the team",
        body: "Use structured guidance instead of recreating the same handout for every appointment.",
      },
      {
        title: "Clinic controlled",
        body: "Your practice decides what it publishes and remains responsible for its clinical instructions.",
      },
    ],
  },
  guidance: {
    h2: `Use ${PRODUCT_NAME} for the dental guidance your practice needs`,
    body: `Start with an available ${PRODUCT_NAME} template where one exists, or prepare clinic-approved guidance during onboarding. Published pages can be adapted with your local instructions and practice terminology.`,
    note: "Tooth Extraction is currently the reviewed starting template. The library is expanding, and template availability is confirmed during onboarding.",
  },
  workflow: {
    h2: "From approved instructions to a page patients can keep",
    steps: [
      {
        title: "Choose or prepare the guide",
        body: "Use an available template or clinic-approved instructions.",
      },
      {
        title: "Adapt it to your practice",
        body: "Add clinic terminology, local instructions and supported section overrides.",
      },
      {
        title: "Publish it under your brand",
        body: `${PRODUCT_NAME} creates a durable patient-facing page.`,
      },
      {
        title: "Share it after treatment",
        body: "Give patients the link directly or through a QR code.",
      },
    ],
  },
  extras: [
    {
      kind: "demo",
      h2: `See a real ${PRODUCT_NAME} dental example`,
      body: "Riverside Dental Demo shows the current patient experience using a published Tooth Extraction guide.",
      ctaLabel: "Open Riverside Dental Demo",
    },
  ],
  faq: {
    h2: "Questions dental practices ask",
    items: [
      {
        question: "Do patients need to download an app?",
        answer: `No. ${PRODUCT_NAME} patient pages open in the browser from a link or QR code.`,
      },
      {
        question: "Do patients need an account?",
        answer:
          "No. The current public guide experience does not require a patient login.",
      },
      {
        question: "Can our practice change the instructions?",
        answer: `Yes. ${PRODUCT_NAME} supports clinic-controlled guidance and supported local overrides. The dental practice remains responsible for approving the clinical information it publishes.`,
      },
      {
        question: `Does ${PRODUCT_NAME} replace our practice-management system?`,
        answer: `No. ${PRODUCT_NAME} is a patient aftercare publishing platform. It is not currently a PMS, CRM, patient record or messaging platform.`,
      },
      {
        question: "What dental templates are available?",
        answer:
          "Tooth Extraction is the current reviewed starting template. The library is expanding, and template availability is confirmed during onboarding.",
      },
    ],
  },
  cta: {
    h2: "Bring your dental aftercare online.",
    body: `Show us how your practice shares post-treatment instructions today and we'll walk you through a branded ${PRODUCT_NAME} experience.`,
    label: "Request a demo",
  },
};

export const PHYSIOTHERAPY_LANDING: VerticalLandingContent = {
  path: "/physiotherapy",
  heroAtmosphere: "contact",
  hero: {
    eyebrow: `${PRODUCT_NAME} for physiotherapy`,
    h1: "Keep recovery guidance clear between appointments.",
    body: "Turn clinic-approved recovery, home-care and written exercise guidance into branded pages patients can reopen on their phone — without another app or patient account.",
    primaryCtaLabel: "Request a demo",
    secondaryCta: {
      kind: "anchor",
      label: "See how River Aftercare works",
      href: "#workflow",
    },
  },
  problem: {
    h2: "Patients leave the clinic with a plan. Remembering it later is harder.",
    cards: [
      {
        title: "Verbal guidance fades",
        body: "Movement cues, recovery advice and home-care instructions can be difficult to remember once the appointment is over.",
      },
      {
        title: "Printouts get separated from the care",
        body: "Paper and PDFs can be misplaced or difficult to find when the patient actually wants to check something.",
      },
      {
        title: "Between-visit guidance can feel fragmented",
        body: "Patients should be able to return to clear information from the clinic that is managing their recovery.",
      },
    ],
  },
  solution: {
    h2: "A branded home for between-visit guidance",
    body: `${PRODUCT_NAME} gives physiotherapy clinics a simple place to publish the written guidance patients may need between appointments. The clinic controls the content and presentation; patients return through a durable link without creating another account.`,
    benefits: [
      {
        title: "Recovery guidance in one place",
        body: "Keep relevant written instructions together in an experience patients can revisit.",
      },
      {
        title: "Your clinic stays visible",
        body: "Use your clinic identity, terminology and contact details throughout the patient page.",
      },
      {
        title: "Easy access between visits",
        body: "Patients reopen the same link when they need to check the guidance again.",
      },
      {
        title: "Clinic-controlled content",
        body: "Your clinicians remain responsible for the treatment and guidance they approve for publication.",
      },
    ],
  },
  guidance: {
    h2: "Support the guidance that happens outside the treatment room",
    body: `Depending on your clinic's services and approved content, ${PRODUCT_NAME} can provide a branded home for guidance such as:`,
    items: [
      "post-appointment home-care information",
      "written recovery instructions",
      "written exercise reminders or instructions",
      "self-management guidance",
      "return-to-activity information",
      "clinic contact and escalation information",
    ],
    boundary: `${PRODUCT_NAME} is designed for publishing guidance, not for tracking whether a patient completes an exercise programme.`,
    note: "Physiotherapy template availability is confirmed during onboarding. Where no suitable River Aftercare template exists, the clinic can publish its own approved guidance.",
  },
  workflow: {
    h2: "Fit aftercare into the workflow you already have",
    steps: [
      {
        title: "Prepare the guidance",
        body: "Start with clinic-approved recovery or home-care content.",
      },
      {
        title: "Brand the experience",
        body: "Apply the physiotherapy clinic's identity and terminology.",
      },
      {
        title: "Publish a durable page",
        body: "Keep the guidance accessible at a stable URL.",
      },
      {
        title: "Share it with the patient",
        body: "Send the link or provide a QR code after the appointment.",
      },
    ],
  },
  extras: [
    {
      kind: "copy",
      h2: "Designed to complement clinical software, not replace it",
      body: `${PRODUCT_NAME} focuses on clear patient-facing guidance. It is not currently a practice-management system, clinical record, messaging platform or exercise-adherence tracker.`,
    },
  ],
  faq: {
    h2: "Questions physiotherapy clinics ask",
    items: [
      {
        question: `Is ${PRODUCT_NAME} a home exercise programme app?`,
        answer: `No. ${PRODUCT_NAME} is a branded guidance-publishing platform. It can present clinic-approved written home-care or exercise guidance, but it does not currently track exercise completion or adherence.`,
      },
      {
        question: "Do patients need another app?",
        answer:
          "No. Published guidance opens in the browser from a link or QR code.",
      },
      {
        question: "Can our clinic use its own recovery guidance?",
        answer: `Yes. ${PRODUCT_NAME} is designed around clinic-approved content and supported clinic customisation. The treating clinic remains responsible for the clinical information it publishes.`,
      },
      {
        question: "Does it store patient health records?",
        answer:
          "No. The current product is not designed to store identifiable patient health records or personalised patient clinical information.",
      },
      {
        question: "Are physiotherapy templates already available?",
        answer:
          "Physiotherapy template availability is confirmed during onboarding. Where no suitable River Aftercare template exists, the clinic can publish its own approved guidance.",
      },
    ],
  },
  cta: {
    h2: "Give recovery guidance a clearer place to live.",
    body: `Tell us how your physiotherapy clinic currently shares between-visit guidance and we'll show you how ${PRODUCT_NAME} could fit your workflow.`,
    label: "Request a demo",
  },
};

export const CHIROPRACTIC_LANDING: VerticalLandingContent = {
  path: "/chiropractic",
  heroAtmosphere: "contact",
  hero: {
    eyebrow: `${PRODUCT_NAME} for chiropractic practices`,
    h1: "Give patients clearer guidance between chiropractic visits.",
    body: "Publish practice-branded home-care and post-appointment guidance patients can revisit when they need it — by link or QR code, without an app or patient login.",
    primaryCtaLabel: "Request a demo",
    secondaryCta: {
      kind: "anchor",
      label: "See how it works",
      href: "#workflow",
    },
  },
  problem: {
    h2: "Important guidance shouldn't disappear when the appointment ends.",
    cards: [
      {
        title: "Details are easy to forget",
        body: "Patients may leave with several pieces of home-care or self-management guidance to remember.",
      },
      {
        title: "Handouts are easy to lose",
        body: "Printed sheets and saved files are not always where the patient needs them later.",
      },
      {
        title: "Generic resources lose the clinic context",
        body: "Guidance is clearer when it remains visibly connected to the practice that provided it.",
      },
    ],
  },
  solution: {
    h2: "A consistent home for your practice's guidance",
    body: `${PRODUCT_NAME} turns clinic-approved home-care and post-appointment information into branded web pages patients can return to between visits.`,
    benefits: [
      {
        title: "Practice branded",
        body: "Keep your identity and contact details visible throughout the guidance.",
      },
      {
        title: "Easy to revisit",
        body: "A stable URL gives patients one familiar place to return to.",
      },
      {
        title: "Consistent presentation",
        body: "Use structured pages rather than rebuilding or resending the same instructions.",
      },
      {
        title: "Clinician controlled",
        body: "The practice remains responsible for reviewing and approving the clinical information it publishes.",
      },
    ],
  },
  guidance: {
    h2: "Publish the guidance that supports your care",
    body: `Depending on the services your practice provides and the content your clinicians approve, ${PRODUCT_NAME} can provide a branded place for written guidance such as:`,
    items: [
      "post-appointment care",
      "home-care instructions",
      "written movement or mobility reminders",
      "self-management guidance",
      "posture or everyday activity information",
      "clinic contact and escalation information",
    ],
    note: "These are examples of guidance a practice may choose to publish, not a pre-built chiropractic template library. Clinical content remains clinic-approved.",
  },
  workflow: {
    h2: "From clinic-approved notes to a page patients can keep",
    steps: [
      {
        title: "Prepare clinic-approved guidance",
        body: "Start with the home-care and post-appointment information your clinicians already use.",
      },
      {
        title: "Apply the practice brand",
        body: "Carry your identity, terminology and contact details into the patient page.",
      },
      {
        title: "Publish a durable patient page",
        body: "Keep the guidance available at a stable URL between visits.",
      },
      {
        title: "Share the link or QR code",
        body: "Give patients a way to reopen the same guidance after they leave.",
      },
    ],
  },
  extras: [
    {
      kind: "copy",
      h2: "A publishing layer for patient guidance",
      body: `${PRODUCT_NAME} does not replace your clinical record, practice-management system or practitioner judgement. It provides a simple patient-facing place for guidance the clinic has chosen to publish.`,
    },
  ],
  faq: {
    h2: "Questions chiropractic practices ask",
    items: [
      {
        question: "Do patients need an app?",
        answer:
          "No. Patient guidance opens in the browser from a link or QR code.",
      },
      {
        question: "Can our practice publish its own instructions?",
        answer: `Yes. ${PRODUCT_NAME} supports clinic-approved guidance within the platform's publishing controls. The practice remains responsible for the clinical information it publishes.`,
      },
      {
        question: `Does ${PRODUCT_NAME} provide chiropractic treatment advice?`,
        answer: `No. ${PRODUCT_NAME} provides publishing technology. The treating practice remains responsible for the clinical information and instructions it publishes.`,
      },
      {
        question: "Does it replace our practice-management software?",
        answer: `No. ${PRODUCT_NAME} is a patient-facing publishing layer, not a practice-management system or clinical record.`,
      },
      {
        question: "Is there already a chiropractic template library?",
        answer:
          "No pre-built chiropractic template library is currently being advertised. Content and setup requirements are confirmed during onboarding.",
      },
    ],
  },
  cta: {
    h2: "Keep your guidance connected to your practice.",
    body: `Tell us how you currently share home-care and post-appointment information and we'll show you what a ${PRODUCT_NAME} experience could look like for your practice.`,
    label: "Request a demo",
  },
};

export const COSMETIC_CLINICS_LANDING: VerticalLandingContent = {
  path: "/cosmetic-clinics",
  heroAtmosphere: "pricing",
  hero: {
    eyebrow: `${PRODUCT_NAME} for cosmetic & aesthetic clinics`,
    h1: "Make post-treatment aftercare feel as considered as the treatment.",
    body: "Give patients and clients clear, clinic-branded aftercare they can reopen after cosmetic and aesthetic treatments — by link or QR code, with no app or patient login.",
    primaryCtaLabel: "Request a demo",
    secondaryCta: {
      kind: "anchor",
      label: "See how it works",
      href: "#workflow",
    },
  },
  problem: {
    h2: "Aftercare is part of the treatment experience.",
    cards: [
      {
        title: "The important questions often come later",
        body: "Patients and clients may want to recheck aftercare once they're home and the appointment itself is over.",
      },
      {
        title: "Paper doesn't match a premium experience",
        body: "Printed sheets and generic PDFs can feel disconnected from the clinic experience you worked to create.",
      },
      {
        title: "Generic handouts lose your identity",
        body: "Post-treatment guidance should remain clearly associated with the clinic that provided the treatment.",
      },
    ],
  },
  solution: {
    h2: "A polished, branded home for post-treatment guidance",
    body: `${PRODUCT_NAME} gives cosmetic and aesthetic clinics a consistent place to publish clinic-approved aftercare under their own brand. Patients or clients return to the same page whenever they need to check the guidance again.`,
    benefits: [
      {
        title: "Keeps the clinic experience intact",
        body: "Carry your clinic name, colours and presentation into the aftercare experience.",
      },
      {
        title: "Easy to revisit",
        body: "Share one stable link or QR code instead of relying on a printed sheet.",
      },
      {
        title: "Consistent across the clinic",
        body: "Publish structured guidance in a consistent format across the treatments your clinic supports.",
      },
      {
        title: "Clinic controlled",
        body: "Your clinic remains responsible for reviewing and approving the aftercare information it publishes.",
      },
    ],
  },
  guidance: {
    h2: "Build aftercare around the treatments your clinic provides",
    body: `Use an available ${PRODUCT_NAME} template where appropriate, or prepare clinic-approved post-treatment guidance during onboarding. The published experience can carry your clinic terminology, contact information and supported local instructions.`,
    note: `Template availability is confirmed during onboarding as the ${PRODUCT_NAME} library expands. Cosmetic and aesthetic aftercare is typically prepared from clinic-approved instructions rather than from a pre-built treatment library.`,
  },
  workflow: {
    h2: "From clinic-approved guidance to branded aftercare",
    steps: [
      {
        title: "Prepare the aftercare guidance",
        body: "Start with the post-treatment information your clinic already approves.",
      },
      {
        title: "Adapt it to the clinic",
        body: "Apply your identity, terminology and supported local instructions.",
      },
      {
        title: "Publish the branded page",
        body: "Give patients or clients a durable place to return to the guidance.",
      },
      {
        title: "Share it after treatment",
        body: "Send the link or provide a QR code before they leave the clinic.",
      },
    ],
  },
  extras: [
    {
      kind: "copy",
      h2: "Keep the experience recognisably yours",
      body: `${PRODUCT_NAME} is deliberately clinic-first. Patients or clients see the clinic's identity and guidance, not a generic social feed or consumer health app.`,
    },
  ],
  faq: {
    h2: "Questions cosmetic and aesthetic clinics ask",
    items: [
      {
        question: "Do patients or clients need to install an app?",
        answer:
          "No. Published aftercare opens in the browser from a link or QR code.",
      },
      {
        question: "Can our clinic use its own aftercare instructions?",
        answer: `Yes. ${PRODUCT_NAME} is designed around clinic-approved content and supported clinic customisation. The clinic remains responsible for reviewing and approving the information it publishes.`,
      },
      {
        question: `Does ${PRODUCT_NAME} monitor patients after treatment?`,
        answer:
          "No. The current platform publishes guidance; it does not provide live clinical monitoring or emergency triage.",
      },
      {
        question: `Does ${PRODUCT_NAME} replace our clinic-management software?`,
        answer: `No. ${PRODUCT_NAME} is an aftercare publishing platform, not a CRM, clinical record or clinic-management system.`,
      },
      {
        question: "Are cosmetic treatment templates already available?",
        answer: `Template availability is confirmed during onboarding as the ${PRODUCT_NAME} library expands. Cosmetic and aesthetic aftercare is typically prepared from clinic-approved instructions rather than from a pre-built treatment library.`,
      },
    ],
  },
  cta: {
    h2: "Extend your clinic experience beyond the appointment.",
    body: `Tell us how your clinic currently delivers post-treatment aftercare and we'll show you how ${PRODUCT_NAME} can bring that guidance online under your brand.`,
    label: "Request a demo",
  },
};

export const VERTICAL_LANDINGS = {
  "/dental": DENTAL_LANDING,
  "/physiotherapy": PHYSIOTHERAPY_LANDING,
  "/chiropractic": CHIROPRACTIC_LANDING,
  "/cosmetic-clinics": COSMETIC_CLINICS_LANDING,
} as const satisfies Record<ClinicVerticalPath, VerticalLandingContent>;

export const VERTICAL_RELATED_LINKS = [
  { href: "/pricing", label: "Pricing" },
  { href: "/contact", label: "Request a demo" },
  { href: "/about", label: "About River Aftercare" },
] as const;
