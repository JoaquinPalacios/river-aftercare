/**
 * Sample / non-clinical Tooth Extraction canonical payload.
 *
 * This is demo content for the interactive `demodental` tenant only.
 * It is not clinically reviewed or approved.
 *
 * The introduction names Riverside Dental Demo. There is no equivalent
 * clinic-neutral intro in the repo, so this copy stays demo-only and must
 * never be enabled for a real clinic.
 *
 * Do not copy practice overrides or weekend-contact additions here.
 * Do not invent replacement clinical wording.
 */
export const DEMO_EXTRACTION_TEMPLATE_SLUG = "extraction";
export const DEMO_EXTRACTION_TEMPLATE_TITLE = "Tooth Extraction";
export const DEMO_EXTRACTION_TEMPLATE_SPECIALTY = "DENTAL";
export const DEMO_EXTRACTION_TEMPLATE_VERSION = 1;

export const DEMO_EXTRACTION_CANONICAL_SECTIONS = [
  {
    key: "introduction",
    kind: "INTRODUCTION",
    title: "After your extraction",
    periodLabel: null,
    startDay: null,
    endDay: null,
    sortOrder: 1,
    body: "This page is your recovery information from Riverside Dental Demo. Follow the stages in order, and contact the practice if you are unsure or need help.",
  },
  {
    key: "immediate-care",
    kind: "RECOVERY_TIMELINE",
    title: "Immediate care",
    periodLabel: "First few hours",
    startDay: 0,
    endDay: 0,
    sortOrder: 2,
    body: "Bite gently on the gauze the clinic placed and keep the site still so a clot can form. Rest, keep your head up, and avoid rinsing, spitting, or using a straw during this first period.",
  },
  {
    key: "first-24-hours",
    kind: "RECOVERY_TIMELINE",
    title: "Protect the healing site",
    periodLabel: "Today / first 24 hours",
    startDay: 1,
    endDay: 1,
    sortOrder: 3,
    body: "Leave the site undisturbed. Choose soft, cool foods and take any pain relief only as the clinic advised. Do not smoke, drink alcohol, or poke the area today.",
  },
  {
    key: "days-2-3",
    kind: "RECOVERY_TIMELINE",
    title: "Early recovery",
    periodLabel: "Days 2–3",
    startDay: 2,
    endDay: 3,
    sortOrder: 4,
    body: "Swelling often peaks, then eases. If the clinic recommended a gentle salt-water rinse, start it now. Keep meals soft and avoid strenuous exercise until you feel steady.",
  },
  {
    key: "days-4-7",
    kind: "RECOVERY_TIMELINE",
    title: "Healing check",
    periodLabel: "Days 4–7",
    startDay: 4,
    endDay: 7,
    sortOrder: 5,
    body: "Discomfort should continue to settle. Return to usual food only as comfort allows. Contact the practice if pain increases, the site feels worse, or you are unsure.",
  },
  {
    key: "what-is-normal",
    kind: "WHAT_IS_NORMAL",
    title: "What's normal",
    periodLabel: null,
    startDay: null,
    endDay: null,
    sortOrder: 6,
    body: "Mild swelling, a dull ache, and a little oozing can be expected in the first days. Recovery varies; contact the practice if you are unsure.",
  },
  {
    key: "warning-signs",
    kind: "WARNING_SIGNS",
    title: "When to contact us",
    periodLabel: null,
    startDay: null,
    endDay: null,
    sortOrder: 7,
    body: "Call the practice if bleeding will not slow, swelling spreads, swallowing becomes difficult, or pain gets worse after the first few days. For trouble breathing, use emergency services.",
  },
  {
    key: "contact-practice",
    kind: "CONTACT_PRACTICE",
    title: "Contact the practice",
    periodLabel: null,
    startDay: null,
    endDay: null,
    sortOrder: 8,
    body: "Use the practice phone on this page if you have a question about recovery.",
  },
];
