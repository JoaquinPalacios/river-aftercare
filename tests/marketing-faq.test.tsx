import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { MarketingFaq } from "@/app/(marketing)/components/marketing-faq";
import { VERTICAL_LANDINGS } from "@/lib/marketing/vertical-landing";

const FAQ_EXPECTATIONS = {
  "/dental": {
    questions: [
      "Do patients need to download an app?",
      "Do patients need an account?",
      "Can our practice change the instructions?",
      "Does River Aftercare replace our practice-management system?",
      "What dental templates are available?",
    ],
    answers: [
      "No. River Aftercare patient pages open in the browser from a link or QR code.",
      "Riverside Dental Demo currently uses a Tooth Extraction sample template.",
    ],
  },
  "/physiotherapy": {
    questions: [
      "Is River Aftercare a home exercise programme app?",
      "Do patients need another app?",
      "Can our clinic use its own recovery guidance?",
      "Does it store patient health records?",
      "Are physiotherapy templates already available?",
    ],
    answers: [
      "it does not currently track exercise completion or adherence",
      "Physiotherapy template availability is confirmed during onboarding. Where no suitable River Aftercare template exists, the clinic can publish its own approved guidance.",
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

    expect(html.match(/<details\b/g)).toHaveLength(5);
    expect(html.match(/<summary\b/g)).toHaveLength(5);
    expect(html).not.toMatch(/<details[^>]*\sopen\b/);
    expect(html).toContain("aria-controls");
    expect(html).toContain('data-faq-position="first"');
    expect(html).toContain('data-faq-position="middle"');
    expect(html).toContain('data-faq-position="last"');
    expect(html).toContain("Do patients need to download an app?");
    expect(html).toContain(
      "No. River Aftercare patient pages open in the browser from a link or QR code."
    );
  });

  it.each(Object.entries(FAQ_EXPECTATIONS))(
    "keeps five %s FAQ questions and representative answers in the content model",
    (path, expected) => {
      const items =
        VERTICAL_LANDINGS[path as keyof typeof VERTICAL_LANDINGS].faq.items;
      expect(items).toHaveLength(5);
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
