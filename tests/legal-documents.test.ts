import { describe, expect, it } from "vitest";

import { PRODUCT_NAME } from "@/lib/branding/product-name";
import { parseLegalInline } from "@/lib/legal/inline-markup";
import { PRIVACY_DOCUMENT } from "@/lib/legal/privacy";
import {
  LEGAL_ABN,
  LEGAL_DOCUMENT_STATUS,
  LEGAL_GOVERNING_LAW,
  LEGAL_LAST_UPDATED_ISO,
  LEGAL_OPERATOR_PERSON_NAME,
  LEGAL_PLACEHOLDERS,
  LEGAL_PRIVACY_EMAIL,
  LEGAL_PUBLIC_LOCATION,
  PRIVACY_LAST_UPDATED_ISO,
  TERMS_LAST_UPDATED_ISO,
} from "@/lib/legal/status";
import { TERMS_DOCUMENT } from "@/lib/legal/terms";
import {
  PRIVACY_PAGE_LEGALLY_APPROVED,
  TERMS_PAGE_LEGALLY_APPROVED,
} from "@/lib/seo/diagnostics";

const FORBIDDEN_DEV_COMMENTARY = [
  "This repository does not define",
  "Counsel should set",
  "Production is not provisioned",
  "Do not assume",
  "Desired production direction",
  "this page is published so reviewers",
  "production launch gate",
  "counsel should",
  "This is cautious draft language for counsel",
];

describe("legal documents", () => {
  it("publishes terms copy without a draft banner", () => {
    expect(TERMS_DOCUMENT.title).toBe("Terms & Conditions");
    expect(TERMS_DOCUMENT.status).toBe(LEGAL_DOCUMENT_STATUS);
    expect(TERMS_DOCUMENT.draftBanner).toBeNull();
    expect(TERMS_DOCUMENT.lastUpdatedIso).toBe(TERMS_LAST_UPDATED_ISO);
    expect(TERMS_DOCUMENT.lastUpdatedIso).not.toBe(LEGAL_LAST_UPDATED_ISO);
    expect(TERMS_PAGE_LEGALLY_APPROVED).toBe(false);
    expect(TERMS_DOCUMENT.sections.map((section) => section.id)).toEqual([
      "about",
      "definitions",
      "agreement",
      "customers",
      "service",
      "clinic-responsibilities",
      "clinical-responsibility",
      "patient-pages",
      "patient-health",
      "prohibited-use",
      "ip",
      "customer-licence",
      "platform-templates",
      "confidentiality",
      "privacy-data",
      "third-parties",
      "availability",
      "fees",
      "term",
      "suspension",
      "termination",
      "data-after-termination",
      "changes",
      "acl",
      "disclaimers",
      "liability",
      "indemnity",
      "force-majeure",
      "notices",
      "governing-law",
      "general",
      "contact",
    ]);
    expect(TERMS_DOCUMENT.sections.map((section) => section.title)).toEqual([
      "1. About River Aftercare",
      "2. Definitions",
      "3. Agreement and authority",
      "4. Customers and Authorised Users",
      "5. The Service",
      "6. Customer responsibilities",
      "7. Clinical responsibility",
      "8. Public aftercare pages",
      "9. Patient and health information",
      "10. Prohibited use",
      "11. River Aftercare intellectual property",
      "12. Customer Content and branding",
      "13. River Aftercare templates",
      "14. Confidentiality",
      "15. Privacy and data",
      "16. Third-party services",
      "17. Availability, maintenance and security",
      "18. Fees, invoices and GST",
      "19. Subscription term, renewal and cancellation",
      "20. Suspension",
      "21. Termination",
      "22. Data after termination",
      "23. Changes to the Service, Terms and pricing",
      "24. Australian Consumer Law and non-excludable rights",
      "25. Disclaimers",
      "26. Liability",
      "27. Third-party claims and indemnities",
      "28. Events beyond reasonable control",
      "29. Notices and communications",
      "30. Governing law",
      "31. General",
      "32. Contact",
    ]);
    const body = JSON.stringify(TERMS_DOCUMENT);
    expect(body).toContain(PRODUCT_NAME);
    expect(body).toContain(LEGAL_OPERATOR_PERSON_NAME);
    expect(body).toContain(LEGAL_PRIVACY_EMAIL);
    expect(body).toContain(`mailto:${LEGAL_PRIVACY_EMAIL}`);
    expect(body).toContain(LEGAL_ABN);
    expect(body).toContain(LEGAL_PUBLIC_LOCATION);
    expect(body).toContain(LEGAL_GOVERNING_LAW);
    expect(body).toContain("an Australian sole trader trading as");
    expect(body).toContain("non-exclusive jurisdiction");
    expect(body).toContain("Australian dollars");
    expect(body).toContain("GST will be charged where applicable");
    expect(body).toContain("14 calendar days");
    expect(body).toContain("bank transfer");
    expect(body).toContain("month-to-month");
    expect(body).toContain("AUD $1,000");
    expect(body).toContain("Australian Consumer Law");
    expect(body).toContain(
      "People who only read a clinic's public aftercare page are not Customers"
    );
    expect(body).not.toContain(LEGAL_PLACEHOLDERS.legalEntityName);
    expect(body).not.toContain(LEGAL_PLACEHOLDERS.privacyEmail);
    expect(body).not.toContain("DRAFT FOR LEGAL REVIEW");
    expect(body).not.toContain("HIPAA compliance");
    expect(body).not.toContain("Stripe");
    expect(body).not.toContain("ACN");
    expect(body).not.toContain("Tax Invoice");
    expect(body).not.toContain("GST registered");
    expect(body).not.toMatch(/(?<!non-)exclusive jurisdiction/);
    for (const phrase of FORBIDDEN_DEV_COMMENTARY) {
      expect(body.toLowerCase()).not.toContain(phrase.toLowerCase());
    }
  });

  it("publishes privacy copy without a draft banner and with named processing facts", () => {
    expect(PRIVACY_DOCUMENT.title).toBe("Privacy Policy");
    expect(PRIVACY_DOCUMENT.status).toBe(LEGAL_DOCUMENT_STATUS);
    expect(PRIVACY_DOCUMENT.draftBanner).toBeNull();
    expect(PRIVACY_DOCUMENT.lastUpdatedIso).toBe(PRIVACY_LAST_UPDATED_ISO);
    expect(PRIVACY_DOCUMENT.lastUpdatedIso).not.toBe(LEGAL_LAST_UPDATED_ISO);
    expect(PRIVACY_PAGE_LEGALLY_APPROVED).toBe(false);
    expect(PRIVACY_DOCUMENT.sections.map((section) => section.id)).toEqual([
      "who",
      "scope",
      "personal-information",
      "patient-health",
      "how-collected",
      "how-used",
      "browsing",
      "public-guides",
      "cookies",
      "providers",
      "overseas",
      "security",
      "retention",
      "data-breach",
      "communications",
      "access",
      "complaints",
      "children",
      "automated-decisions",
      "changes",
      "contact",
    ]);
    expect(PRIVACY_DOCUMENT.sections.map((section) => section.title)).toEqual([
      "1. Who we are",
      "2. Scope of this policy",
      "3. Personal information we collect",
      "4. Patient and health information",
      "5. How we collect information",
      "6. How we use personal information",
      "7. Browsing without identifying yourself",
      "8. Public clinic aftercare pages",
      "9. Cookies, browser storage, analytics and anti-abuse technology",
      "10. Service providers and disclosures",
      "11. Storage and overseas processing",
      "12. Security",
      "13. Retention and deletion",
      "14. Data breaches and security incidents",
      "15. Service communications and direct marketing",
      "16. Access, correction and deletion requests",
      "17. Privacy complaints",
      "18. Children",
      "19. Automated decision-making",
      "20. Changes to this Policy",
      "21. Contact",
    ]);
    const body = JSON.stringify(PRIVACY_DOCUMENT);
    expect(body).toContain(PRODUCT_NAME);
    expect(body).toContain(LEGAL_OPERATOR_PERSON_NAME);
    expect(body).toContain(LEGAL_PRIVACY_EMAIL);
    expect(body).toContain(`mailto:${LEGAL_PRIVACY_EMAIL}`);
    expect(body).toContain(LEGAL_ABN);
    expect(body).toContain(LEGAL_PUBLIC_LOCATION);
    expect(body).toContain("We do not sell personal information.");
    expect(body).toContain("Cloudflare Turnstile");
    expect(body).toContain("Vercel");
    expect(body).toContain("Neon");
    expect(body).toContain("Resend");
    expect(body).toContain("Hostinger");
    expect(body).toContain("United States");
    expect(body).toContain("Office of the Australian Information Commissioner");
    expect(body).toContain("Information and Privacy Commission NSW");
    expect(body).toContain("not a patient health record");
    expect(body).not.toContain(LEGAL_PLACEHOLDERS.privacyEmail);
    expect(body).not.toContain(LEGAL_PLACEHOLDERS.legalEntityName);
    expect(body).not.toContain("DRAFT FOR LEGAL REVIEW");
    expect(body).not.toContain("We store all information with Neon");
    expect(body).not.toContain("is not an APP entity");
    expect(body).not.toContain("Privacy Act certified");
    expect(body).not.toContain("exempt from the Privacy Act");
    expect(body).not.toContain("ACN");
    expect(body).not.toContain("appropriate to a small B2B web application");
    for (const phrase of FORBIDDEN_DEV_COMMENTARY) {
      expect(body.toLowerCase()).not.toContain(phrase.toLowerCase());
    }
  });

  it("parses legal inline emphasis and mailto links", () => {
    expect(
      parseLegalInline(
        `contact **[${LEGAL_PRIVACY_EMAIL}](mailto:${LEGAL_PRIVACY_EMAIL})**.`
      )
    ).toEqual([
      { type: "text", value: "contact " },
      {
        type: "strong",
        children: [
          {
            type: "link",
            href: `mailto:${LEGAL_PRIVACY_EMAIL}`,
            children: [{ type: "text", value: LEGAL_PRIVACY_EMAIL }],
          },
        ],
      },
      { type: "text", value: "." },
    ]);
  });
});
