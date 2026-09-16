import { PRODUCT_NAME } from "@/lib/branding/product-name";
import {
  LEGAL_PLACEHOLDERS,
  TERMS_DRAFT_BANNER,
  legalDocumentMeta,
  type LegalSection,
} from "@/lib/legal/document";
import { LEGAL_GOVERNING_LAW, legalOperatorIdentity } from "@/lib/legal/status";

const P = LEGAL_PLACEHOLDERS;
const OPERATOR = legalOperatorIdentity(PRODUCT_NAME);

const SECTIONS: readonly LegalSection[] = [
  {
    id: "about",
    title: "1. About River Aftercare",
    blocks: [
      {
        type: "placeholder",
        text: `${PRODUCT_NAME} is operated by ${OPERATOR}.`,
      },
      {
        type: "p",
        text: `${PRODUCT_NAME} is an Australian B2B SaaS publishing platform for healthcare practices. Clinics use it to publish clinic-approved treatment, recovery, home-care and post-treatment guidance as branded web pages patients can reopen without an app or patient account.`,
      },
      {
        type: "p",
        text: "The platform is designed for treatment-based practices including dental, cosmetic and aesthetic clinics, physiotherapy, chiropractic and allied health. The product is a structured publishing platform. It is not live clinical monitoring, a patient health record, a messaging product or emergency care.",
      },
    ],
  },
  {
    id: "agreement",
    title: "2. Agreement and authority",
    blocks: [
      {
        type: "p",
        text: `These Terms govern ${PRODUCT_NAME}'s provision of the Service to a healthcare practice or other organisation that creates a clinic account, accepts an Order Form, accepts a quote or proposal, or otherwise subscribes to the Service (“Customer”).`,
      },
      {
        type: "p",
        text: "The person accepting these Terms for a Customer represents that they have authority to bind that Customer.",
      },
      {
        type: "p",
        text: "People who view clinic-published public aftercare pages are not Customers merely because they view a guide.",
      },
      {
        type: "p",
        text: "If you do not agree to these Terms, you must not create an account or subscribe to the Service.",
      },
    ],
  },
  {
    id: "customers",
    title: "3. Customers and authorised users",
    blocks: [
      {
        type: "p",
        text: `${PRODUCT_NAME} is offered to healthcare practices and their authorised personnel. It is a business customer product. It is not a consumer health app and does not provide child or patient accounts.`,
      },
      {
        type: "p",
        text: "“Authorised Users” are people the Customer permits to manage aftercare content, clinic settings or related staff functions. The Customer is responsible for its Authorised Users and for activity under its accounts.",
      },
    ],
  },
  {
    id: "accounts",
    title: "4. Accounts and security",
    blocks: [
      {
        type: "p",
        text: "Staff accounts are issued for clinic personnel. The Customer must keep credentials confidential, ensure only authorised people have access, and tell us promptly if it believes an account has been compromised.",
      },
      {
        type: "ul",
        items: [
          "Do not share login credentials.",
          "Use accounts only for the Customer’s authorised business purposes.",
          "Keep clinic identity, contact details and emergency instructions reasonably accurate.",
        ],
      },
    ],
  },
  {
    id: "service",
    title: "5. River Aftercare service",
    blocks: [
      {
        type: "p",
        text: `The “Service” is the ${PRODUCT_NAME} publishing and content-management technology, including the staff portal, clinic configuration, aftercare templates where made available, and the public clinic-branded pages the Customer publishes.`,
      },
      {
        type: "p",
        text: `${PRODUCT_NAME} does not currently provide self-service checkout. Commercial details for a Customer may be set in an Order Form, an accepted quote or proposal, an invoice accepted as part of onboarding, or another written agreement (together, “Customer Commercial Terms”).`,
      },
      {
        type: "p",
        text: "If there is a conflict between Customer Commercial Terms and these public Terms, the Customer Commercial Terms prevail to the extent of the inconsistency.",
      },
    ],
  },
  {
    id: "clinic-responsibilities",
    title: "6. Customer and clinic responsibilities",
    blocks: [
      {
        type: "p",
        text: "The Customer remains responsible for the aftercare information it publishes, including any edits, local instructions and clinic additions. Publishing a guide is a clinic decision.",
      },
      {
        type: "ul",
        items: [
          "Have appropriately qualified people review and approve clinical instructions before publication.",
          "Keep clinic identity, contact details and emergency instructions accurate.",
          "Unpublish or update content that is no longer appropriate.",
          `Do not use ${PRODUCT_NAME} to submit identifiable patient health records or personalised patient information through the current product.`,
        ],
      },
    ],
  },
  {
    id: "clinical-responsibility",
    title: "7. Clinical responsibility",
    blocks: [
      {
        type: "p",
        text: `${PRODUCT_NAME} provides publishing and content-management technology. It is not a healthcare provider. It does not practise medicine, dentistry, physiotherapy, chiropractic or other healthcare. It does not create a practitioner–patient relationship, and it does not diagnose, prescribe, triage or make patient-specific clinical decisions.`,
      },
      {
        type: "p",
        text: "Platform templates are general starting points only. Clinics must determine whether published guidance is appropriate for their practice, procedures and patients. Nothing in the Service is a claim of regulatory clinical accreditation, medical-device approval or guaranteed health outcomes.",
      },
    ],
  },
  {
    id: "patient-pages",
    title: "8. Public patient pages",
    blocks: [
      {
        type: "p",
        text: "Public aftercare pages are informational web pages published by the clinic under the clinic’s brand. URLs identify a clinic and a procedure or guide, not a named patient. They do not replace emergency care, an in-person review or practitioner judgement. If a person needs urgent help, they should use the clinic’s published emergency instructions or local emergency services.",
      },
      {
        type: "p",
        text: "Generic public guides do not require a patient account. Sharing a guide URL is like sharing a practice webpage.",
      },
    ],
  },
  {
    id: "prohibited-use",
    title: "9. Prohibited use",
    blocks: [
      {
        type: "p",
        text: "The Customer and its Authorised Users must not use the Service to:",
      },
      {
        type: "ul",
        items: [
          "break the law or infringe anyone’s rights;",
          "upload malware, scrape in an abusive way, or attempt unauthorised access;",
          `misrepresent ${PRODUCT_NAME} as the treating clinic or as emergency care;`,
          "publish content they do not have the right to publish; or",
          "submit identifiable patient health records or other personalised patient information that the current product is not designed to support.",
        ],
      },
    ],
  },
  {
    id: "ip",
    title: "10. Intellectual property",
    blocks: [
      {
        type: "p",
        text: `${PRODUCT_NAME} and its licensors own or licence the platform software, ${PRODUCT_NAME} branding, generic platform documentation, and canonical ${PRODUCT_NAME} templates, subject to any third-party licences. These Terms do not transfer ownership of the platform to the Customer.`,
      },
      {
        type: "p",
        text: "The Customer owns or retains its branding, logos, customer-created copy, and customer-specific additions and configuration.",
      },
    ],
  },
  {
    id: "customer-licence",
    title: "11. Customer content and branding licence",
    blocks: [
      {
        type: "p",
        text: `The Customer grants ${PRODUCT_NAME} a limited licence to host, process, display, transmit and reproduce Customer content and branding solely as reasonably necessary to provide the Service, including patient pages on the clinic’s tenant hostname.`,
      },
      {
        type: "p",
        text: "That licence ends when it is no longer reasonably needed following termination, subject to backups and any legal retention described in these Terms or the Privacy Policy. The Customer represents that it has the rights needed to use that branding and content.",
      },
    ],
  },
  {
    id: "platform-templates",
    title: "12. River Aftercare templates and content",
    blocks: [
      {
        type: "p",
        text: `${PRODUCT_NAME} may provide canonical templates, such as a reviewed Tooth Extraction starting guide. Clinics may adapt templates. Additional procedure templates may be enabled during onboarding when they exist.`,
      },
      {
        type: "p",
        text: `${PRODUCT_NAME} does not claim ownership of the Customer’s adaptations more broadly than needed to operate the Service. Templates remain starting points. The clinic remains responsible for published clinical instructions.`,
      },
    ],
  },
  {
    id: "privacy-data",
    title: "13. Privacy and data",
    blocks: [
      {
        type: "p",
        text: `How ${PRODUCT_NAME} handles personal information is described in the Privacy Policy. In summary, marketing visitors, clinic enquiries and clinic staff accounts are in scope. Generic public patient guides are not designed to collect patient personal information.`,
      },
      {
        type: "p",
        text: `${PRODUCT_NAME} is not currently designed for users to enter identifiable patient health records or personalised patient information. Clinics must not submit patient names attached to clinical data, dates of birth, Medicare numbers, medical record numbers, diagnoses, clinical histories, treatment records or other identifiable patient health information unless ${PRODUCT_NAME} later introduces functionality designed for that purpose and updates its privacy, security and contractual arrangements.`,
      },
      {
        type: "p",
        text: "Some fields are free text. They are intended for business contact details and generic aftercare instructions, not for patient records.",
      },
    ],
  },
  {
    id: "third-parties",
    title: "14. Third-party services",
    blocks: [
      {
        type: "p",
        text: "The Service may depend on infrastructure and communications providers, including application hosting, database hosting, object or file storage, DNS and network services, email delivery, and monitoring or security services. The Privacy Policy describes these categories. Named production providers will be identified there once arrangements are finalised.",
      },
    ],
  },
  {
    id: "availability",
    title: "15. Availability and maintenance",
    blocks: [
      {
        type: "p",
        text: `We will use reasonable efforts to operate the Service. Maintenance and updates may occur. We do not guarantee uninterrupted or error-free operation, and we do not currently offer a numerical uptime service level. We may suspend access where needed to address urgent security or legal risk.`,
      },
    ],
  },
  {
    id: "fees",
    title: "16. Fees, invoices and GST",
    blocks: [
      {
        type: "p",
        text: "Fees are in Australian dollars. GST will be charged where applicable.",
      },
      {
        type: "p",
        text: "Unless Customer Commercial Terms say otherwise, the Service is a monthly subscription billed monthly in advance. The Customer is invoiced before or at the beginning of each subscription period. Payment is due 14 calendar days from the invoice date.",
      },
      {
        type: "p",
        text: "The initial payment method is bank transfer or other manual invoice payment. Additional payment methods may be offered later.",
      },
      {
        type: "p",
        text: "The fees payable by a Customer are those set out in the applicable Customer Commercial Terms.",
      },
    ],
  },
  {
    id: "term",
    title: "17. Subscription term and renewal",
    blocks: [
      {
        type: "p",
        text: "Unless Customer Commercial Terms say otherwise, the subscription is month-to-month and renews monthly until cancelled in accordance with these Terms.",
      },
    ],
  },
  {
    id: "pilots",
    title: "18. Pilots and evaluations",
    blocks: [
      {
        type: "p",
        text: `${PRODUCT_NAME} does not offer a universal free trial. We may offer an assisted pilot, design-partner arrangement, evaluation period or other trial only where agreed in writing. If no such arrangement is agreed, normal fees apply.`,
      },
    ],
  },
  {
    id: "cancellation",
    title: "19. Cancellation",
    blocks: [
      {
        type: "p",
        text: "The Customer may cancel at any time. Cancellation takes effect at the end of the current paid billing period. There is no cancellation fee.",
      },
      {
        type: "p",
        text: "There is no pro-rata refund for voluntary cancellation of an already-paid period, except where required by law or explicitly agreed in Customer Commercial Terms.",
      },
    ],
  },
  {
    id: "suspension",
    title: "20. Suspension",
    blocks: [
      {
        type: "p",
        text: `${PRODUCT_NAME} may send reminders once an invoice becomes overdue. If an invoice remains unpaid 14 days after its due date, ${PRODUCT_NAME} may suspend the clinic’s staff access and/or public pages after reasonable notice. Suspension is not automatic.`,
      },
      {
        type: "p",
        text: "Access can be restored once overdue amounts are paid and there is no other reason for suspension.",
      },
      {
        type: "p",
        text: `We may also suspend accounts or published pages to address security issues, legal risk, or material breach. We will aim to notify the clinic when it is reasonable and lawful to do so.`,
      },
    ],
  },
  {
    id: "termination-breach",
    title: "21. Termination for breach",
    blocks: [
      {
        type: "p",
        text: "Either party may terminate the Service if the other party materially breaches these Terms and does not remedy the breach within a reasonable time after notice, or immediately if the breach is not reasonably remediable. We may also terminate for unlawful use or risk to the Service or other customers.",
      },
    ],
  },
  {
    id: "data-after-termination",
    title: "22. Data after termination",
    blocks: [
      {
        type: "p",
        text: "When a subscription ends, public clinic pages may be unpublished.",
      },
      {
        type: "p",
        text: `During a 30-day exit period, the Customer may request a reasonable export of available clinic-owned content and configuration. After 30 days, ${PRODUCT_NAME} may delete the active clinic account and operational data where it is no longer required.`,
      },
      {
        type: "p",
        text: "Backups may retain deleted data for a limited further period before normal rotation or overwrite. Information that must be retained for legal or accounting purposes may be retained for the required period.",
      },
    ],
  },
  {
    id: "security",
    title: "23. Security responsibilities",
    blocks: [
      {
        type: "p",
        text: `We take reasonable technical and organisational measures designed to protect the Service. No method of transmission or storage is completely secure. The Customer must protect its own accounts, devices and the accuracy of the content it publishes.`,
      },
    ],
  },
  {
    id: "disclaimers",
    title: "24. Disclaimers",
    blocks: [
      {
        type: "p",
        text: `To the extent permitted by law, the Service is provided on an “as is” and “as available” basis. We do not warrant that published aftercare content is clinically complete or suitable for every patient, or that the Service will be free of defects or meet every operational requirement.`,
      },
      {
        type: "p",
        text: `${PRODUCT_NAME} does not represent that the product is HIPAA certified, certified under the Australian Privacy Act, a medical device, or clinically accredited.`,
      },
      {
        type: "p",
        text: "Nothing in these Terms excludes, restricts or modifies any right, liability or remedy that cannot lawfully be excluded, restricted or limited, including rights under the Australian Consumer Law where they apply.",
      },
    ],
  },
  {
    id: "liability",
    title: "25. Liability",
    blocks: [
      {
        type: "p",
        text: "Subject to liability that cannot lawfully be excluded or limited, including under the Australian Consumer Law where it applies:",
      },
      {
        type: "ul",
        items: [
          "neither party is liable for indirect or consequential loss;",
          "neither party is liable for loss of profit, revenue, opportunity or goodwill to the extent legally permissible;",
          `${PRODUCT_NAME} is not responsible for clinical outcomes arising from a clinic’s clinical decisions or clinic-published instructions, except to the extent ${PRODUCT_NAME} itself caused or contributed to the relevant loss through conduct for which liability cannot lawfully be excluded; and`,
          `the aggregate direct liability of ${PRODUCT_NAME} arising from the Service is capped at the greater of (a) AUD $1,000 or (b) the fees paid or payable by the relevant Customer to ${PRODUCT_NAME} in the 12 months immediately preceding the event giving rise to the claim.`,
        ],
      },
      {
        type: "p",
        text: "This clause does not exclude liability for fraud, or for deliberate or wilful misconduct where exclusion would be inappropriate. It does not exclude any liability that cannot legally be excluded or limited.",
      },
    ],
  },
  {
    id: "indemnity",
    title: "26. Indemnity",
    blocks: [
      {
        type: "p",
        text: `The Customer will indemnify ${PRODUCT_NAME} against third-party claims, to the extent those claims arise from:`,
      },
      {
        type: "ul",
        items: [
          "clinic-supplied content or branding that infringes someone else’s rights;",
          "clinical instructions published by the clinic contrary to the clinic’s responsibilities under these Terms; or",
          `the clinic’s unlawful or deliberately unauthorised use of ${PRODUCT_NAME}.`,
        ],
      },
      {
        type: "p",
        text: `The indemnity does not apply to the extent the relevant claim was caused or contributed to by ${PRODUCT_NAME}’s breach of these Terms, negligence, unlawful conduct, fraud or wilful misconduct.`,
      },
    ],
  },
  {
    id: "changes",
    title: "27. Changes to the service and these Terms",
    blocks: [
      {
        type: "p",
        text: `We may update the Service and these Terms. Material changes to these Terms will be indicated by updating the “Last updated” date on this page. Where a change is material to an existing Customer, we will give reasonable notice.`,
      },
      {
        type: "p",
        text: "For a material change to recurring fees, we will give at least 30 days’ advance notice. The new price applies from the next renewal or billing period after that notice period. The Customer may cancel before the changed price takes effect.",
      },
    ],
  },
  {
    id: "notices",
    title: "28. Notices and communications",
    blocks: [
      {
        type: "p",
        text: "Notices under these Terms may be given electronically, including by email to the address associated with the Customer’s account or by publishing an update on this website where that is reasonable for the type of notice.",
      },
    ],
  },
  {
    id: "governing-law",
    title: "29. Governing law",
    blocks: [
      {
        type: "p",
        text: `These Terms are governed by the laws of ${LEGAL_GOVERNING_LAW}.`,
      },
      {
        type: "p",
        text: "Each party submits to the non-exclusive jurisdiction of the courts of New South Wales and courts entitled to hear appeals from those courts.",
      },
    ],
  },
  {
    id: "general",
    title: "30. General",
    blocks: [
      {
        type: "p",
        text: "These Terms, together with any Customer Commercial Terms and the Privacy Policy, are the entire agreement between the parties about their subject matter. Customer Commercial Terms prevail over these public Terms to the extent of any inconsistency.",
      },
      {
        type: "ul",
        items: [
          "If a provision is unenforceable, it is to be read down or severed so that the rest of the Terms continue in effect.",
          "A delay in enforcing a right is not a waiver of that right.",
          `The Customer must not assign these Terms without ${PRODUCT_NAME}’s reasonable consent. ${PRODUCT_NAME} may assign these Terms as part of a restructuring or sale of the business, subject to applicable law.`,
          "Neither party is liable for failure or delay caused by events beyond its reasonable control.",
        ],
      },
    ],
  },
  {
    id: "contact",
    title: "31. Contact",
    blocks: [
      {
        type: "p",
        text: `Questions about these Terms can be sent through the public Contact page on this website. Please do not include patient or clinical information in an enquiry.`,
      },
      {
        type: "placeholder",
        text: `Legal correspondence: ${P.privacyEmail}. ${OPERATOR}.`,
      },
    ],
  },
];

export const TERMS_DOCUMENT = legalDocumentMeta({
  slug: "/terms",
  title: "Terms & Conditions",
  intro: `${PRODUCT_NAME} is a B2B aftercare publishing platform for healthcare practices. These Terms apply to Customers who subscribe to or otherwise take up the Service. People who only view a clinic’s public aftercare page are not Customers merely because they read that page.`,
  draftBanner: TERMS_DRAFT_BANNER,
  sections: SECTIONS,
});
