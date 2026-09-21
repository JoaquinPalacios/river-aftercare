import { describe, expect, it } from "vitest";

import { PRODUCT_NAME } from "@/lib/branding/product-name";
import type { LegalDocument } from "@/lib/legal/document";
import { parseLegalInline } from "@/lib/legal/inline-markup";
import {
  PRIVACY_DOCUMENT,
  STRIPE_PRIVACY_POLICY_URL,
} from "@/lib/legal/privacy";
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

const FORBIDDEN_COMMERCIAL_LANGUAGE = [
  "All prices include GST",
  "includes GST",
  "GST included",
  "10% GST",
  "Tax Invoice",
  "GST registered",
  "GST credits",
  "NO REFUNDS",
  "All payments are final",
  "cancel immediately",
  "immediate cancellation",
  "immediate self-service cancellation",
  "Smart Retries",
  "Checkout Session",
  "webhook",
  "24/7",
  "24/7 support",
  "support SLA",
  "guaranteed response time",
  "dedicated account manager",
  "per-seat",
  "per seat",
  "extra seat",
  "additional-location",
  "additional location pricing",
  "guideTemplateId",
  "account@riveraftercare.com.au",
  "reviewed by counsel",
  "legally approved",
  "HIPAA compliance",
];

function flattenLegalDocument(document: LegalDocument): string {
  return JSON.stringify(document);
}

function sectionText(document: LegalDocument, id: string): string {
  const section = document.sections.find((entry) => entry.id === id);
  if (!section) {
    throw new Error(`Missing legal section ${id}`);
  }

  return section.blocks
    .map((block) => {
      if (block.type === "p" || block.type === "placeholder") {
        return block.text;
      }
      if (block.type === "ul") {
        return block.items.join(" ");
      }
      return block.lines.join(" ");
    })
    .join(" ");
}

describe("legal documents", () => {
  it("publishes terms copy without a draft banner", () => {
    expect(TERMS_DOCUMENT.title).toBe("Terms & Conditions");
    expect(TERMS_DOCUMENT.status).toBe(LEGAL_DOCUMENT_STATUS);
    expect(TERMS_DOCUMENT.draftBanner).toBeNull();
    expect(TERMS_DOCUMENT.lastUpdatedIso).toBe(TERMS_LAST_UPDATED_ISO);
    expect(TERMS_DOCUMENT.lastUpdatedIso).toBe("2026-09-21");
    expect(TERMS_DOCUMENT.lastUpdatedLabel).toBe("21 September 2026");
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
      "18. Fees, billing and GST",
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
    const body = flattenLegalDocument(TERMS_DOCUMENT);
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
    expect(body).toContain("AUD $1,000");
    expect(body).toContain("Australian Consumer Law");
    expect(body).toContain(
      "People who only read a clinic's public aftercare page are not Customers"
    );
    expect(body).not.toContain(LEGAL_PLACEHOLDERS.legalEntityName);
    expect(body).not.toContain(LEGAL_PLACEHOLDERS.privacyEmail);
    expect(body).not.toContain("DRAFT FOR LEGAL REVIEW");
    expect(body).not.toContain("ACN");
    expect(body).not.toMatch(/(?<!non-)exclusive jurisdiction/);
    for (const phrase of FORBIDDEN_DEV_COMMENTARY) {
      expect(body.toLowerCase()).not.toContain(phrase.toLowerCase());
    }
    for (const phrase of FORBIDDEN_COMMERCIAL_LANGUAGE) {
      expect(body.toLowerCase()).not.toContain(phrase.toLowerCase());
    }
  });

  it("encodes the approved Stripe billing, plan and retention model in the Terms", () => {
    const fees = sectionText(TERMS_DOCUMENT, "fees");
    expect(fees).toContain("monthly or annual");
    expect(fees).toContain("charged in advance");
    expect(fees).toContain("Stripe-hosted payment and billing services");
    expect(fees).toContain("card");
    expect(fees).toContain("Australian BECS Direct Debit");
    expect(fees).toContain(
      "does not receive or store full card numbers or full bank-account credentials"
    );
    expect(fees).toContain("does not itself mean that a payment has settled");
    expect(fees).toContain("pending until settlement is confirmed");
    expect(fees).toContain(
      "Paid-plan entitlements activate only once the first invoice or payment is confirmed as paid"
    );
    expect(fees).toContain("GST will be charged where applicable");
    expect(fees).toContain("no routine refunds for change of mind");
    expect(fees).toContain("Duplicate charges");
    expect(fees).toContain("original payment method");
    expect(fees).toContain("Australian Consumer Law");
    expect(fees).not.toContain("14 calendar days");
    expect(fees).not.toContain("bank transfer");
    expect(fees).not.toContain("month-to-month");

    const term = sectionText(TERMS_DOCUMENT, "term");
    expect(term).toContain("monthly or annual");
    expect(term).toContain("renew automatically");
    expect(term).toContain("billing portal where available");
    expect(term).toContain(
      "Cancellation takes effect at the end of the current paid billing period"
    );
    expect(term).toContain("paid-through date");
    expect(term).toContain(
      "not refunded on a pro-rata basis, except where required by law"
    );
    expect(term).toContain(
      "upgrade to a higher plan may take effect immediately"
    );
    expect(term).toContain("appropriate prorated adjustment");
    expect(term).toContain(
      "downgrade to a lower plan takes effect at the next renewal"
    );
    expect(term).toContain(
      "Content is not automatically deleted merely because a downgrade is scheduled."
    );

    const templates = sectionText(TERMS_DOCUMENT, "platform-templates");
    expect(templates).toContain("Essential plan may use available");
    expect(templates).toContain("templates as supplied");
    expect(templates).toContain("Practice plan may adapt available");
    expect(templates).toContain(
      "Group or other agreed arrangements have the template capabilities"
    );
    expect(templates).toContain(
      "create and fully edit its own clinic-authored custom guides"
    );
    expect(templates).toContain("Customer Content to the extent");
    expect(templates).toContain("retains its rights in the underlying");
    expect(templates).not.toContain(
      "The Customer may adapt available templates for its practice."
    );

    const service = sectionText(TERMS_DOCUMENT, "service");
    expect(service).toContain(
      "included allowances are determined by the applicable plan"
    );
    expect(service).toContain("custom clinic guides");
    expect(service).toContain("Authorised Users");
    expect(service).toContain("Priority support");
    expect(service).toContain("does not commit to a particular response time");

    const customers = sectionText(TERMS_DOCUMENT, "customers");
    expect(customers).toContain(
      "number of Authorised Users included with a Customer's subscription is determined by the applicable plan"
    );

    const thirdParties = sectionText(TERMS_DOCUMENT, "third-parties");
    expect(thirdParties).toContain("payment or billing providers");
    expect(thirdParties).toContain(
      "Stripe as its payment and billing processor"
    );

    const suspension = sectionText(TERMS_DOCUMENT, "suspension");
    expect(suspension).toContain("reasonable payment retries");
    expect(suspension).toContain("normal product access continues");
    expect(suspension).toContain("restrict staff authoring");
    expect(suspension).toContain(
      "Already-published patient-facing guides ordinarily remain"
    );
    expect(suspension).toContain("material security risk");
    expect(suspension).not.toContain("14 days after its due date");

    const afterEnd = sectionText(TERMS_DOCUMENT, "data-after-termination");
    expect(afterEnd).toContain("up to **60 days**");
    expect(afterEnd).toContain("durable patient guide URLs");
    expect(afterEnd).toContain("For **30 days** after the subscription ends");
    expect(afterEnd).toContain("export of available Customer-owned content");
    expect(afterEnd).toContain(
      "Cancellation or expiry of a subscription is not itself a request to delete"
    );
    expect(afterEnd).not.toContain("permanent");

    const acl = sectionText(TERMS_DOCUMENT, "acl");
    expect(acl).toContain(
      "Nothing in these Terms excludes, restricts or modifies"
    );
    expect(acl).toContain("Australian Consumer Law");
    expect(acl).toContain("section 64A");

    const clinical = sectionText(TERMS_DOCUMENT, "clinical-responsibility");
    expect(clinical).toContain("is not a healthcare provider");
    expect(clinical).toContain("general starting points");
    expect(clinical).toContain(
      "The Customer must determine whether any material is appropriate"
    );
  });

  it("publishes privacy copy without a draft banner and with named processing facts", () => {
    expect(PRIVACY_DOCUMENT.title).toBe("Privacy Policy");
    expect(PRIVACY_DOCUMENT.status).toBe(LEGAL_DOCUMENT_STATUS);
    expect(PRIVACY_DOCUMENT.draftBanner).toBeNull();
    expect(PRIVACY_DOCUMENT.lastUpdatedIso).toBe(PRIVACY_LAST_UPDATED_ISO);
    expect(PRIVACY_DOCUMENT.lastUpdatedIso).toBe("2026-09-21");
    expect(PRIVACY_DOCUMENT.lastUpdatedLabel).toBe("21 September 2026");
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
    const body = flattenLegalDocument(PRIVACY_DOCUMENT);
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
    expect(body).toContain("Google");
    expect(body).toContain("Stripe");
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
    expect(body).not.toContain("appropriate to a small B2B web application");
    expect(body).not.toContain("manual invoicing");
    expect(body).not.toContain(
      "does not require customers to provide payment-card details"
    );
    for (const phrase of FORBIDDEN_DEV_COMMENTARY) {
      expect(body.toLowerCase()).not.toContain(phrase.toLowerCase());
    }
    for (const phrase of FORBIDDEN_COMMERCIAL_LANGUAGE) {
      expect(body.toLowerCase()).not.toContain(phrase.toLowerCase());
    }
  });

  it("encodes Stripe billing identity, hosted credentials and distinct retention windows in Privacy", () => {
    const collected = sectionText(PRIVACY_DOCUMENT, "personal-information");
    expect(collected).toContain("legal entity name");
    expect(collected).toContain("trading or practice name");
    expect(collected).toContain("billing contact name");
    expect(collected).toContain("billing email");
    expect(collected).toContain("billing address");
    expect(collected).toContain("Australian Business Number (ABN)");
    expect(collected).toContain(
      "Australian Company Number (ACN) where used instead of an ABN"
    );
    expect(collected).toContain(
      "If a customer has no ABN, an ACN may be used instead"
    );
    expect(collected).toContain("Stripe-hosted payment or billing pages");
    expect(collected).toContain("does not receive or store full card numbers");
    expect(collected).toContain("full bank-account credentials");
    expect(collected).toContain("limited billing metadata");
    expect(collected).not.toContain("both ABN and ACN are required");

    const providers = sectionText(PRIVACY_DOCUMENT, "providers");
    expect(providers).toContain("Vercel");
    expect(providers).toContain("Neon");
    expect(providers).toContain("Cloudflare");
    expect(providers).toContain("Resend");
    expect(providers).toContain("Hostinger");
    expect(providers).toContain("Google");
    expect(providers).toContain(
      "Stripe as the payment and billing processor for subscription payments and billing management"
    );
    expect(providers).toContain(STRIPE_PRIVACY_POLICY_URL);

    const overseas = sectionText(PRIVACY_DOCUMENT, "overseas");
    expect(overseas).toContain("Stripe");
    expect(overseas).toContain("United States");
    expect(overseas).toContain("Europe");
    expect(overseas).toContain(
      "a complete country-by-country list may not be practicable"
    );
    expect(overseas).not.toContain("stored exclusively");

    const cookies = sectionText(PRIVACY_DOCUMENT, "cookies");
    expect(cookies).toContain("Stripe-hosted Checkout or billing portal");
    expect(cookies).toContain("operated by Stripe");
    expect(cookies).toContain(
      "does not place Stripe advertising cookies on public patient guide pages"
    );

    const uses = sectionText(PRIVACY_DOCUMENT, "how-used");
    expect(uses).toContain("set up and administer subscriptions");
    expect(uses).toContain("payment-provider customer record");
    expect(uses).toContain("recurring payments");
    expect(uses).toContain("failed or pending payments");
    expect(uses).toContain("billing-portal access");
    expect(uses).toContain("tax or accounting records where applicable");
    expect(uses).not.toContain("Tax Invoice");

    const communications = sectionText(PRIVACY_DOCUMENT, "communications");
    expect(communications).toContain("may be sent by");
    expect(communications).toContain("Stripe");
    expect(communications).toContain("payment receipts");
    expect(communications).toContain("payment-failure messages");

    const retention = sectionText(PRIVACY_DOCUMENT, "retention");
    expect(retention).toContain(
      "up to 60 days after the relevant subscription ends"
    );
    expect(retention).toContain(
      "30-day period during which the Customer may request an export"
    );
    expect(retention).toContain(
      "Cancellation or expiry of a subscription is not itself a request to delete an account"
    );
    expect(retention).toContain("Billing, accounting and taxation records");
    expect(retention).not.toContain("automatically deleted on day 31");
    expect(retention).not.toContain("automatically deleted on day 61");

    const patientHealth = sectionText(PRIVACY_DOCUMENT, "patient-health");
    expect(patientHealth).toContain(
      "not currently designed to collect, store or manage identifiable patient health records"
    );
    expect(patientHealth).toContain("identifiable health information");
    expect(PRIVACY_DOCUMENT.preamble.join(" ")).toContain(
      "not a patient health record"
    );
  });

  it("parses legal inline emphasis, mailto links and Stripe privacy links", () => {
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

    expect(
      parseLegalInline(
        `described in [Stripe's privacy policy](${STRIPE_PRIVACY_POLICY_URL}).`
      )
    ).toEqual([
      { type: "text", value: "described in " },
      {
        type: "link",
        href: STRIPE_PRIVACY_POLICY_URL,
        children: [{ type: "text", value: "Stripe's privacy policy" }],
      },
      { type: "text", value: "." },
    ]);
  });
});
