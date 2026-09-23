import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { MarketingFaq } from "@/app/(marketing)/components/marketing-faq";
import { VERTICAL_LANDINGS } from "@/lib/marketing/vertical-landing";

const FAQ_EXPECTATIONS = {
  "/dental": {
    questions: [
      "Do patients need an app or account?",
      "Can our dental practice change or create the instructions?",
      "What dental templates are available?",
      "Can River Aftercare match our dental practice branding?",
      "Does River Aftercare replace our practice-management system?",
      "How many custom aftercare guides can we publish?",
    ],
    answers: [
      "No. Patients open their aftercare page in the browser from a durable link or QR code. No River Aftercare app or patient login is required.",
      "Essential includes available River Aftercare templates and up to 2 active custom clinic guides.",
      "Riverside Dental Demo currently uses a Tooth Extraction sample guide. It is not clinically reviewed.",
      "Patient pages can carry your logo, colours, curated typography, terminology and clinic contact details",
      "It is not currently a practice-management system, CRM, patient health record, messaging platform or clinical monitoring system.",
      "Essential supports up to 2 active custom clinic guides. Practice supports up to 30 active custom clinic guides with broader creation and adaptation.",
    ],
  },
  "/physiotherapy": {
    questions: [
      "Is River Aftercare a home exercise programme or exercise-tracking app?",
      "Do patients need an app or account?",
      "Can our clinic create or adapt its own recovery guidance?",
      "What physiotherapy templates are available?",
      "Can River Aftercare match our physiotherapy clinic branding?",
      "Does River Aftercare replace our practice-management system or store patient health records?",
    ],
    answers: [
      "It can publish clinic-approved written exercise, recovery and home-care guidance, but it does not currently track exercise completion, adherence or patient progress.",
      "No. Patients open their aftercare page in the browser from a durable link or QR code. No River Aftercare app or patient login is required.",
      "Essential includes available River Aftercare templates and up to 2 active custom clinic guides. Practice supports up to 30 active custom guides",
      "Physiotherapy template availability is confirmed during onboarding. If no suitable River Aftercare template is available, your clinic can publish its own approved guidance within its plan.",
      "Patient pages can carry your logo, colours, curated typography, terminology and clinic contact details",
      "It does not currently replace a practice-management system, store patient health records, provide patient messaging or monitor exercise adherence.",
    ],
  },
  "/chiropractic": {
    questions: [
      "Do patients need an app or account?",
      "Can our practice create or adapt its own home-care guidance?",
      "Does River Aftercare provide chiropractic treatment advice?",
      "What chiropractic templates are available?",
      "Can River Aftercare match our chiropractic practice branding?",
      "Does River Aftercare replace our practice-management system or patient health record?",
    ],
    answers: [
      "No. Patients open their aftercare page in the browser from a durable link or QR code. No River Aftercare app or patient login is required.",
      "Essential includes available River Aftercare templates and up to 2 active custom clinic guides. Practice supports up to 30 active custom guides",
      "No. River Aftercare provides patient aftercare publishing technology. The treating practice remains responsible for the clinical information and instructions it chooses to publish.",
      "Chiropractic template availability is confirmed during onboarding. If no suitable River Aftercare template is available, your practice can publish its own approved guidance within its plan.",
      "Patient pages can carry your logo, colours, curated typography, terminology and practice contact details",
      "It does not currently replace a practice-management system, patient health record, messaging platform or clinical monitoring system.",
    ],
  },
  "/cosmetic-clinics": {
    questions: [
      "Do patients or clients need an app or account?",
      "Can our clinic create or adapt its own aftercare instructions?",
      "Does River Aftercare monitor patients after treatment?",
      "What cosmetic and aesthetic templates are available?",
      "Can River Aftercare match our clinic branding?",
      "Does River Aftercare replace our clinic-management software or patient health record?",
    ],
    answers: [
      "No. Aftercare opens in the browser from a durable link or QR code. No River Aftercare app or patient login is required.",
      "Essential includes available River Aftercare templates and up to 2 active custom clinic guides. Practice supports up to 30 active custom guides",
      "No. River Aftercare publishes post-treatment guidance. It does not currently provide live clinical monitoring, treatment monitoring or emergency triage.",
      "Cosmetic and aesthetic template availability is confirmed during onboarding. If no suitable River Aftercare template is available, your clinic can publish its own approved aftercare within its plan.",
      "Patient or client pages can carry your logo, colours, curated typography, terminology and clinic contact details",
      "It does not currently replace clinic-management software, a patient health record, CRM, messaging platform or clinical monitoring system.",
    ],
  },
} as const;

describe("marketing FAQ accordion", () => {
  it("server-renders native details rows with questions and answers in the HTML", () => {
    const html = renderToStaticMarkup(
      <MarketingFaq
        headingId="dental-faq"
        items={VERTICAL_LANDINGS["/dental"].faq.items}
      />
    );

    expect(html.match(/<details\b/g)).toHaveLength(6);
    expect(html.match(/<summary\b/g)).toHaveLength(6);
    expect(html).not.toMatch(/<details[^>]*\sopen\b/);
    expect(html).toContain("aria-controls");
    expect(html).toContain('data-faq-position="first"');
    expect(html).toContain('data-faq-position="middle"');
    expect(html).toContain('data-faq-position="last"');
    expect(html).toContain("Do patients need an app or account?");
    expect(html).toContain(
      "No. Patients open their aftercare page in the browser from a durable link or QR code. No River Aftercare app or patient login is required."
    );
  });

  it.each(Object.entries(FAQ_EXPECTATIONS))(
    "keeps the current %s FAQ questions and representative answers in the content model",
    (path, expected) => {
      const items =
        VERTICAL_LANDINGS[path as keyof typeof VERTICAL_LANDINGS].faq.items;
      expect(items).toHaveLength(expected.questions.length);
      expect(items.map((item) => item.question)).toEqual(expected.questions);
      const rendered = items
        .map((item) => `${item.question} ${item.answer}`)
        .join("\n");
      for (const answer of expected.answers) {
        expect(rendered).toContain(answer);
      }
    }
  );
});
