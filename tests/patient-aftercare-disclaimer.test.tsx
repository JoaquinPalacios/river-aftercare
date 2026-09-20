import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { PatientAftercareDisclaimer } from "@/app/(aftercare)/components/patient-aftercare-disclaimer";
import { PatientPage } from "@/app/(aftercare)/components/patient-page";
import { PrintableGuide } from "@/app/(aftercare)/components/print-care-plan";
import {
  PATIENT_AFTERCARE_DISCLAIMER_CONTACT_FOLLOW_UP,
  PATIENT_AFTERCARE_DISCLAIMER_HEADING,
  canRenderPatientAftercareDisclaimer,
  patientAftercareDisclaimerBody,
} from "@/lib/aftercare/patient-aftercare-disclaimer";
import { resolvePracticeChrome } from "@/lib/aftercare/practice-chrome";

const REAL_PROFILE = {
  displayName: "Harbor Family Dental",
  logoUrl: null,
  phone: "03 5550 0199",
  bookingUrl: "https://www.example.com/harbor-family-dental/book",
  contactUrl: "https://www.example.com/harbor-family-dental/contact",
  emergencyInstructions: "Call the clinic during hours.",
  showCareGuideAttribution: false,
};

const DEMO_PROFILE = {
  displayName: "Riverside Dental Demo",
  logoUrl: "/demo/riverside-mark.svg",
  phone: "02 5550 0100",
  bookingUrl: "https://www.example.com/riverside-dental-demo/book",
  contactUrl: "https://www.example.com/riverside-dental-demo/contact",
  emergencyInstructions: "Call the demo clinic during hours.",
  showCareGuideAttribution: true,
};

const GUIDE_SECTIONS = [
  {
    key: "introduction",
    kind: "INTRODUCTION" as const,
    title: "After your extraction",
    body: "Follow the stages in order.",
    periodLabel: null,
    provenance: "canonical" as const,
  },
];

function realChrome(
  profile: Partial<typeof REAL_PROFILE> | null = REAL_PROFILE
) {
  return resolvePracticeChrome({
    slug: "harbordental",
    name: "Harbor Family Dental Clinic",
    profile: profile
      ? {
          ...REAL_PROFILE,
          ...profile,
        }
      : null,
  });
}

function demoChrome() {
  return resolvePracticeChrome({
    slug: "demodental",
    name: "Rivers Care Demo Clinic",
    profile: DEMO_PROFILE,
  });
}

const EXPECTED_WITH_CONTACT = patientAftercareDisclaimerBody(
  "Harbor Family Dental",
  { includeContactFollowUp: true }
);
const EXPECTED_WITHOUT_CONTACT = patientAftercareDisclaimerBody(
  "Harbor Family Dental",
  { includeContactFollowUp: false }
);

describe("patient aftercare disclaimer copy", () => {
  it("keeps the approved heading and body, including the contact sentence", () => {
    expect(PATIENT_AFTERCARE_DISCLAIMER_HEADING).toBe("About this guide");
    expect(EXPECTED_WITH_CONTACT).toBe(
      "This aftercare information is provided by Harbor Family Dental for its patients. It does not replace advice from your treating practitioner. Follow any instructions given directly to you by your practitioner. If you are unsure about your recovery or need help, contact the practice using the details below."
    );
    expect(EXPECTED_WITHOUT_CONTACT).toBe(
      "This aftercare information is provided by Harbor Family Dental for its patients. It does not replace advice from your treating practitioner. Follow any instructions given directly to you by your practitioner."
    );
    expect(EXPECTED_WITHOUT_CONTACT).not.toContain(
      PATIENT_AFTERCARE_DISCLAIMER_CONTACT_FOLLOW_UP
    );
  });

  it("does not render for the interactive demo or an empty practice name", () => {
    expect(
      canRenderPatientAftercareDisclaimer({
        isDemoTenant: true,
        practiceName: "Riverside Dental Demo",
      })
    ).toBe(false);
    expect(
      canRenderPatientAftercareDisclaimer({
        isDemoTenant: false,
        practiceName: "   ",
      })
    ).toBe(false);
    expect(
      canRenderPatientAftercareDisclaimer({
        isDemoTenant: false,
        practiceName: "Harbor Family Dental",
      })
    ).toBe(true);
  });
});

describe("PatientAftercareDisclaimer", () => {
  it("renders the exact approved copy with a dynamic practice name", () => {
    const html = renderToStaticMarkup(
      <PatientAftercareDisclaimer
        practiceName="Harbor Family Dental"
        showContactFollowUp
      />
    );

    expect(html).toContain("<h2");
    expect(html).toContain(PATIENT_AFTERCARE_DISCLAIMER_HEADING);
    expect(html).toContain(EXPECTED_WITH_CONTACT);
    expect(html).not.toContain("reviewedBy");
    expect(html).not.toContain("reviewAttestedBy");
    expect(html).not.toContain("MedicalWebPage");
    expect(html).not.toContain("000");
    expect(html).not.toContain("seek urgent");
  });

  it("omits the contact follow-up when no usable PracticeContact details exist", () => {
    const html = renderToStaticMarkup(
      <PatientAftercareDisclaimer
        practiceName="Harbor Family Dental"
        showContactFollowUp={false}
      />
    );

    expect(html).toContain(EXPECTED_WITHOUT_CONTACT);
    expect(html).not.toContain(PATIENT_AFTERCARE_DISCLAIMER_CONTACT_FOLLOW_UP);
  });

  it("renders nothing when the practice name is empty", () => {
    const html = renderToStaticMarkup(
      <PatientAftercareDisclaimer practiceName="   " showContactFollowUp />
    );

    expect(html).toBe("");
  });
});

describe("PatientPage disclaimer placement", () => {
  it("places the real-clinic disclaimer after guide content and before PracticeContact", () => {
    const html = renderToStaticMarkup(
      <PatientPage chrome={realChrome()} showAftercareDisclaimer>
        <p>Guide body from the clinic.</p>
      </PatientPage>
    );

    const guideIndex = html.indexOf("Guide body from the clinic.");
    const headingIndex = html.indexOf(PATIENT_AFTERCARE_DISCLAIMER_HEADING);
    const bodyIndex = html.indexOf(EXPECTED_WITH_CONTACT);
    const contactIndex = html.indexOf("Contact Harbor Family Dental");

    expect(guideIndex).toBeGreaterThan(-1);
    expect(headingIndex).toBeGreaterThan(guideIndex);
    expect(bodyIndex).toBeGreaterThan(headingIndex);
    expect(contactIndex).toBeGreaterThan(bodyIndex);
    expect(html).toContain("Call Harbor Family Dental");
    expect(html).not.toContain("Interactive demo");
    expect(html).not.toContain("Sample content only");
    expect(html).not.toContain("reviewedBy");
    expect(html).not.toContain("reviewAttestedBy");
    expect(html).not.toContain("MedicalWebPage");
  });

  it("omits the contact follow-up when a real clinic has no usable contact details", () => {
    const html = renderToStaticMarkup(
      <PatientPage
        chrome={realChrome({
          phone: null,
          contactUrl: null,
          emergencyInstructions: null,
        })}
        showAftercareDisclaimer
      >
        <p>Guide body from the clinic.</p>
      </PatientPage>
    );

    expect(html).toContain(EXPECTED_WITHOUT_CONTACT);
    expect(html).not.toContain(PATIENT_AFTERCARE_DISCLAIMER_CONTACT_FOLLOW_UP);
    expect(html).not.toContain("Contact Harbor Family Dental");
    expect(html).not.toContain("Questions about your recovery?");
  });

  it("does not stack the real-clinic disclaimer on demodental sample messaging", () => {
    const html = renderToStaticMarkup(
      <PatientPage chrome={demoChrome()} showAftercareDisclaimer>
        <p>Demo guide body.</p>
      </PatientPage>
    );

    expect(html).toContain("Interactive demo");
    expect(html).toContain("Sample content only");
    expect(html).toContain("Not clinical advice");
    expect(html).not.toContain(PATIENT_AFTERCARE_DISCLAIMER_HEADING);
    expect(html).not.toContain("This aftercare information is provided by");
    expect(html).toContain("Contact Riverside Dental Demo");
  });

  it("does not render the disclaimer on tenant home-style pages that omit the flag", () => {
    const html = renderToStaticMarkup(
      <PatientPage chrome={realChrome()}>
        <p>Published guide list.</p>
      </PatientPage>
    );

    expect(html).not.toContain(PATIENT_AFTERCARE_DISCLAIMER_HEADING);
    expect(html).not.toContain("This aftercare information is provided by");
    expect(html).toContain("Contact Harbor Family Dental");
  });
});

describe("printable guide disclaimer", () => {
  it("includes the real-clinic disclaimer before print contact details", () => {
    const html = renderToStaticMarkup(
      <PrintableGuide
        chrome={realChrome()}
        procedureTitle="Tooth Extraction"
        instructionsLabel="Aftercare instructions"
        sections={GUIDE_SECTIONS}
        showDemoSample={false}
        guideHref="/extraction"
      />
    );

    const guideIndex = html.indexOf("Follow the stages in order.");
    const headingIndex = html.indexOf(PATIENT_AFTERCARE_DISCLAIMER_HEADING);
    const bodyIndex = html.indexOf(EXPECTED_WITH_CONTACT);
    const contactIndex = html.indexOf("Contact Harbor Family Dental");

    expect(guideIndex).toBeGreaterThan(-1);
    expect(headingIndex).toBeGreaterThan(guideIndex);
    expect(bodyIndex).toBeGreaterThan(headingIndex);
    expect(contactIndex).toBeGreaterThan(bodyIndex);
    expect(html).toContain("Phone 03 5550 0199");
    expect(html).not.toContain("SAMPLE / NOT CLINICAL ADVICE");
    expect(html).not.toContain("reviewedBy");
    expect(html).not.toContain("reviewAttestedBy");
    expect(html).not.toContain("MedicalWebPage");
  });

  it("keeps demo print on SAMPLE / NOT CLINICAL ADVICE without the real-clinic disclaimer", () => {
    const html = renderToStaticMarkup(
      <PrintableGuide
        chrome={demoChrome()}
        procedureTitle="Tooth Extraction"
        instructionsLabel="Post-treatment instructions"
        sections={GUIDE_SECTIONS}
        showDemoSample
        guideHref="/extraction"
      />
    );

    expect(html).toContain("SAMPLE / NOT CLINICAL ADVICE");
    expect(html).not.toContain(PATIENT_AFTERCARE_DISCLAIMER_HEADING);
    expect(html).not.toContain("This aftercare information is provided by");
    expect(html).toContain("Contact Riverside Dental Demo");
  });
});
