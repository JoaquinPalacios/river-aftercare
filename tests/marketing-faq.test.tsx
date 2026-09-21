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
      "Do patients need an app?",
      "Can our practice publish its own instructions?",
      "Does River Aftercare provide chiropractic treatment advice?",
      "Does it replace our practice-management software?",
      "Is there already a chiropractic template library?",
    ],
    answers: [
      "No. Patient guidance opens in the browser from a link or QR code.",
      "No pre-built chiropractic template library is currently being advertised.",
    ],
  },
  "/cosmetic-clinics": {
    questions: [
      "Do patients or clients need to install an app?",
      "Can our clinic use its own aftercare instructions?",
      "Does River Aftercare monitor patients after treatment?",
      "Does River Aftercare replace our clinic-management software?",
      "Are cosmetic treatment templates already available?",
    ],
    answers: [
      "it does not provide live clinical monitoring or emergency triage",
      "rather than from a pre-built treatment library",
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
