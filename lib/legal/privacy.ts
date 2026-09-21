import { PRODUCT_NAME } from "@/lib/branding/product-name";
import { legalDocumentMeta, type LegalSection } from "@/lib/legal/document";
import {
  LEGAL_ABN,
  LEGAL_OPERATOR_PERSON_NAME,
  LEGAL_PRIVACY_EMAIL,
  LEGAL_PUBLIC_LOCATION,
  PRIVACY_LAST_UPDATED_ISO,
} from "@/lib/legal/status";

const PRIVACY_EMAIL_MARKDOWN = `**[${LEGAL_PRIVACY_EMAIL}](mailto:${LEGAL_PRIVACY_EMAIL})**`;

export const STRIPE_PRIVACY_POLICY_URL = "https://stripe.com/privacy";

const STRIPE_PRIVACY_POLICY_MARKDOWN = `[Stripe's privacy policy](${STRIPE_PRIVACY_POLICY_URL})`;

const SECTIONS: readonly LegalSection[] = [
  {
    id: "who",
    title: "1. Who we are",
    blocks: [
      {
        type: "p",
        text: `${PRODUCT_NAME} is operated by **${LEGAL_OPERATOR_PERSON_NAME}**, an Australian sole trader trading as **${PRODUCT_NAME}**, ABN **${LEGAL_ABN}**, based in ${LEGAL_PUBLIC_LOCATION}.`,
      },
      {
        type: "p",
        text: `For privacy questions, requests or complaints, contact ${PRIVACY_EMAIL_MARKDOWN}.`,
      },
    ],
  },
  {
    id: "scope",
    title: "2. Scope of this policy",
    blocks: [
      {
        type: "p",
        text: `This Privacy Policy applies to personal information handled through the public ${PRODUCT_NAME} website, clinic enquiries and other business communications, clinic and staff accounts, subscription and billing administration, clinic configuration and branding, clinic-published aftercare content, public clinic-branded aftercare pages, and the technical systems used to operate and secure the Service.`,
      },
      {
        type: "p",
        text: "We handle personal information in accordance with applicable Australian privacy laws. Where the Privacy Act 1988 (Cth), the Australian Privacy Principles, the Health Records and Information Privacy Act 2002 (NSW), or another privacy law applies to particular information or conduct, those requirements apply in addition to this Policy.",
      },
    ],
  },
  {
    id: "personal-information",
    title: "3. Personal information we collect",
    blocks: [
      {
        type: "p",
        text: `The information we collect depends on how a person interacts with ${PRODUCT_NAME}.`,
      },
      {
        type: "p",
        text: "For clinic enquiries and business contacts, we may collect a person's name, work email address, clinic or practice name, optional telephone number, the contents of their message, and subsequent business correspondence.",
      },
      {
        type: "p",
        text: "For clinic and staff accounts, we may collect a person's name, email address, password in hashed form, clinic membership, account role, authentication and session information, and records reasonably required to administer access to the Service.",
      },
      {
        type: "p",
        text: "For subscription and billing administration, we may collect, where relevant, a legal entity name, trading or practice name, billing contact name, billing email, billing address, Australian Business Number (ABN), Australian Company Number (ACN) where used instead of an ABN, subscription and plan information, invoice and payment status, and transaction or reference information. An ABN is the usual Australian business identifier. If a customer has no ABN, an ACN may be used instead. Unusual cases may be handled manually.",
      },
      {
        type: "p",
        text: `Subscription payment setup and billing are handled using Stripe. Card details and Australian BECS Direct Debit details are entered on Stripe-hosted payment or billing pages. ${PRODUCT_NAME} does not receive or store full card numbers, and does not receive or store full bank-account credentials such as a complete BSB and account-number combination used for payment. Stripe handles those payment credentials. ${PRODUCT_NAME} may receive limited billing metadata, such as payment or subscription status, payment-method type, limited masked or payment-method identifiers where Stripe provides them, invoice identifiers or references, and transaction references.`,
      },
      {
        type: "p",
        text: "A clinic may store business and operational information including its display name, clinic contact details, emergency instructions, branding, colours, presentation settings, logos and other assets, and aftercare guides or other content created or adapted by the clinic.",
      },
      {
        type: "p",
        text: "Our application, hosting and security systems may also process technical information such as IP address, browser or user-agent information, requested URL, timestamps, HTTP response information, authentication events and similar operational or security information.",
      },
      {
        type: "p",
        text: "The Contact form uses Cloudflare Turnstile to help distinguish legitimate visitors from automated traffic. Turnstile processes technical browser, device and network signals necessary for that security purpose. River Aftercare does not provide the text entered into the Contact form to Turnstile as part of that verification.",
      },
      {
        type: "p",
        text: `Email systems used by ${PRODUCT_NAME} may process email addresses, delivery information, message metadata and the contents of business or service emails.`,
      },
    ],
  },
  {
    id: "patient-health",
    title: "4. Patient and health information",
    blocks: [
      {
        type: "p",
        text: `${PRODUCT_NAME} is not currently designed to collect, store or manage identifiable patient health records or personalised patient information.`,
      },
      {
        type: "p",
        text: "Customers and other users must not enter or send through the Service patient names linked to clinical information, dates of birth, Medicare numbers, medical record numbers, diagnoses, clinical histories, treatment records, patient-specific clinical instructions or other identifiable health information.",
      },
      {
        type: "p",
        text: "Free-text fields, including the Contact form and clinic-authored guide fields, are intended for business communications and generic clinic-approved aftercare information. They must not be used for patient records.",
      },
      {
        type: "p",
        text: `If identifiable patient or health information is submitted to ${PRODUCT_NAME} contrary to these requirements, we may restrict access to or remove that information. Where reasonably practicable and lawful, we may also delete or de-identify it. Limited information may need to be retained where required by law or reasonably necessary to investigate a security incident, resolve a dispute or preserve relevant evidence.`,
      },
      {
        type: "p",
        text: `A clinic that requires software to store patient-specific or identifiable health information must not use the current ${PRODUCT_NAME} product for that purpose. Any future ${PRODUCT_NAME} functionality designed to handle patient information would require appropriate changes to the product, security controls, privacy arrangements and contractual terms before it is made available.`,
      },
    ],
  },
  {
    id: "how-collected",
    title: "5. How we collect information",
    blocks: [
      {
        type: "p",
        text: `We collect personal information directly from people when they contact us, correspond with us, create or use an authorised account, configure a clinic, set up billing or a subscription, or otherwise deal with ${PRODUCT_NAME}.`,
      },
      {
        type: "p",
        text: "We may receive staff, clinic or business contact information from an authorised representative of the relevant clinic.",
      },
      {
        type: "p",
        text: "Technical and security information may be generated automatically when a person accesses or uses the Service.",
      },
      {
        type: "p",
        text: `${PRODUCT_NAME} does not purchase consumer marketing databases or sell personal information.`,
      },
    ],
  },
  {
    id: "how-used",
    title: "6. How we use personal information",
    blocks: [
      {
        type: "p",
        text: "We use personal information to respond to enquiries; onboard and administer customers; create and manage clinic and staff accounts; authenticate authorised users; provide, host and maintain clinic-branded aftercare pages; provide support and service communications; prevent abuse and protect the security of the Service; diagnose technical problems; measure and improve reliability and performance; maintain business and accounting records; establish, exercise or defend legal rights; and comply with applicable legal obligations.",
      },
      {
        type: "p",
        text: "We also use billing information to set up and administer subscriptions; create and maintain the relevant payment-provider customer record; process recurring payments; administer monthly and annual billing; follow up failed or pending payments; provide billing-portal access; issue and maintain invoice or payment records; and maintain tax or accounting records where applicable.",
      },
      {
        type: "p",
        text: "We do not sell personal information or provide it to third parties for their own behavioural advertising.",
      },
    ],
  },
  {
    id: "browsing",
    title: "7. Browsing without identifying yourself",
    blocks: [
      {
        type: "p",
        text: `The ${PRODUCT_NAME} marketing website and generic public clinic aftercare pages can generally be viewed without creating an account or identifying yourself to ${PRODUCT_NAME}.`,
      },
      {
        type: "p",
        text: "Public aftercare guides do not require a patient login or patient account.",
      },
      {
        type: "p",
        text: `Where a person contacts ${PRODUCT_NAME} or requests support, sufficient contact information may be required so that we can respond to and administer the request.`,
      },
    ],
  },
  {
    id: "public-guides",
    title: "8. Public clinic aftercare pages",
    blocks: [
      {
        type: "p",
        text: "Public aftercare pages are published by the relevant clinic under that clinic's brand. Their URLs identify a clinic and a procedure or guide; they are not designed to identify a named patient.",
      },
      {
        type: "p",
        text: "Anyone who has the URL may be able to access a published guide, in the same way that they can access another public clinic webpage.",
      },
      {
        type: "p",
        text: `${PRODUCT_NAME} does not use public guide access to create patient profiles or patient health records.`,
      },
    ],
  },
  {
    id: "cookies",
    title: "9. Cookies, browser storage, analytics and anti-abuse technology",
    blocks: [
      {
        type: "p",
        text: "The staff portal uses an authentication session cookie necessary to keep an authorised user signed in and to protect access to clinic functions. This is an operational cookie, not an advertising cookie.",
      },
      {
        type: "p",
        text: `Appearance preferences, such as Light, Dark or System theme, may be stored locally in the browser on ${PRODUCT_NAME} websites and clinic pages. These preferences are used to remember the display choice on that device.`,
      },
      {
        type: "p",
        text: `${PRODUCT_NAME} uses privacy-focused, aggregated web analytics and performance measurement provided through its application-hosting infrastructure. These tools are used to understand matters such as page views and application performance. ${PRODUCT_NAME} does not use this information to build behavioural advertising profiles.`,
      },
      {
        type: "p",
        text: "The Contact form uses Cloudflare Turnstile for bot and abuse prevention as described above.",
      },
      {
        type: "p",
        text: `${PRODUCT_NAME} does not currently use behavioural advertising pixels or cookie-based advertising trackers. If this changes, we will update this Policy and implement any consent or notification mechanisms required by applicable law.`,
      },
      {
        type: "p",
        text: `When a Customer follows a link to a Stripe-hosted Checkout or billing portal, that Stripe-hosted page is operated by Stripe and may use cookies or similar technologies under Stripe's own policies. ${PRODUCT_NAME} does not place Stripe advertising cookies on public patient guide pages.`,
      },
    ],
  },
  {
    id: "providers",
    title: "10. Service providers and disclosures",
    blocks: [
      {
        type: "p",
        text: `${PRODUCT_NAME} uses service providers to operate the Service. Current production providers include Vercel for application hosting, deployment, network delivery and related website measurement; Neon for the production PostgreSQL database; Cloudflare for object storage and Turnstile security services; Resend for application and contact email delivery; and business email providers including Hostinger and Google for email routing, forwarding and mailbox functions. ${PRODUCT_NAME} uses Stripe as the payment and billing processor for subscription payments and billing management. Stripe's handling of personal information is described in ${STRIPE_PRIVACY_POLICY_MARKDOWN}.`,
      },
      {
        type: "p",
        text: "We provide these service providers only with information reasonably necessary for the relevant service. They may in turn use authorised subprocessors in operating their infrastructure.",
      },
      {
        type: "p",
        text: "We may also disclose information where reasonably necessary to professional advisers such as accountants, insurers, lawyers or security specialists; to enforce or protect legal rights; in connection with a proposed sale or restructuring of the business where appropriate confidentiality protections apply; or where disclosure is required or authorised by law, court order or a competent regulator.",
      },
      {
        type: "p",
        text: "We do not sell personal information.",
      },
    ],
  },
  {
    id: "overseas",
    title: "11. Storage and overseas processing",
    blocks: [
      {
        type: "p",
        text: `${PRODUCT_NAME} is operated from Australia and primarily serves Australian healthcare practices.`,
      },
      {
        type: "p",
        text: "The main River Aftercare application database is hosted using Neon's Sydney, Australia region.",
      },
      {
        type: "p",
        text: "Some other providers operate internationally. In particular, information processed through Vercel, Cloudflare, Resend, Google, Stripe and other infrastructure or payment providers may be processed outside Australia.",
      },
      {
        type: "p",
        text: "Likely overseas locations include the **United States** and countries within **Europe**. Global network providers may also process transient network or security information in other countries through distributed infrastructure. Where a provider operates a large global network or changes subprocessors over time, a complete country-by-country list may not be practicable.",
      },
      {
        type: "p",
        text: "We review our service-provider arrangements as the Service changes and will update this Policy where there is a material change to our usual overseas-disclosure practices.",
      },
    ],
  },
  {
    id: "security",
    title: "12. Security",
    blocks: [
      {
        type: "p",
        text: `${PRODUCT_NAME} takes reasonable technical and organisational measures designed to protect personal information and customer information against misuse, interference, loss and unauthorised access, modification or disclosure.`,
      },
      {
        type: "p",
        text: "Our current controls include password hashing; authenticated and role-based staff access; clinic-level authorisation boundaries; secure production transport using HTTPS; separation between public, staff and clinic-facing functions; restricted access to production systems and credentials; and security controls provided by our infrastructure providers.",
      },
      {
        type: "p",
        text: "No internet service or storage system can be guaranteed to be completely secure. Customers are also responsible for protecting their own user accounts, devices and credentials.",
      },
    ],
  },
  {
    id: "retention",
    title: "13. Retention and deletion",
    blocks: [
      {
        type: "p",
        text: "We retain information only for as long as it is reasonably required for the purposes for which it was collected, for legitimate business administration, or to meet legal obligations.",
      },
      {
        type: "p",
        text: "Contact and prospective-customer information is normally retained for up to 12 months after the last meaningful interaction where no ongoing commercial relationship develops, unless it is reasonably required for longer.",
      },
      {
        type: "p",
        text: `Active clinic, staff and operational information is generally retained while the relevant clinic has an active relationship with ${PRODUCT_NAME}.`,
      },
      {
        type: "p",
        text: "Already-published public patient guides may remain accessible for up to 60 days after the relevant subscription ends, subject to earlier removal where reasonably necessary for legal, security, prohibited-use, harm-prevention, customer-request, account-deletion or other lawful reasons.",
      },
      {
        type: "p",
        text: `Following the end of a subscription, ${PRODUCT_NAME} ordinarily provides a 30-day period during which the Customer may request an export of available Customer-owned content, after which ${PRODUCT_NAME} may delete active clinic account and operational information that is no longer required. Cancellation or expiry of a subscription is not itself a request to delete an account. Information may be retained for longer where reasonably required for legal, security, accounting or dispute-related purposes.`,
      },
      {
        type: "p",
        text: "Operational and security logs are normally retained only for the period reasonably required for security, troubleshooting and infrastructure operations. Longer retention may occur where an incident is being investigated.",
      },
      {
        type: "p",
        text: `Deleted information may remain for a limited period in infrastructure-provider backups or recovery systems until those copies expire or are overwritten through normal provider retention and rotation processes. ${PRODUCT_NAME} does not use those backup copies as an active archive of deleted customer information.`,
      },
      {
        type: "p",
        text: "Billing, accounting and taxation records are retained for the period required under Australian law, commonly at least five years depending on the type of record and relevant circumstances.",
      },
    ],
  },
  {
    id: "data-breach",
    title: "14. Data breaches and security incidents",
    blocks: [
      {
        type: "p",
        text: `If ${PRODUCT_NAME} becomes aware of a suspected security incident involving personal information, we will investigate the circumstances and take reasonable containment and remediation measures.`,
      },
      {
        type: "p",
        text: `Where applicable law requires notification to affected individuals, the Office of the Australian Information Commissioner, another privacy regulator or another authority, ${PRODUCT_NAME} will make the required notification.`,
      },
    ],
  },
  {
    id: "communications",
    title: "15. Service communications and direct marketing",
    blocks: [
      {
        type: "p",
        text: "We distinguish service communications from promotional marketing.",
      },
      {
        type: "p",
        text: `Service communications include messages reasonably necessary to respond to an enquiry, administer an account or subscription, communicate security information, or provide support. Billing communications, including invoices, payment receipts, payment-failure messages and payment-method or billing actions, may be sent by ${PRODUCT_NAME} or by Stripe on ${PRODUCT_NAME}'s behalf or as ${PRODUCT_NAME}'s billing provider.`,
      },
      {
        type: "p",
        text: `Where ${PRODUCT_NAME} sends commercial electronic marketing, we will comply with applicable Australian spam and privacy requirements. Marketing messages will identify the sender and provide a functional way to unsubscribe where required. We will action valid electronic unsubscribe requests within the period required by law.`,
      },
      {
        type: "p",
        text: `Unsubscribing from marketing does not prevent ${PRODUCT_NAME} from sending messages reasonably necessary to operate an active account, administer a subscription, address security issues or respond to a request.`,
      },
    ],
  },
  {
    id: "access",
    title: "16. Access, correction and deletion requests",
    blocks: [
      {
        type: "p",
        text: `You may ask ${PRODUCT_NAME} for access to personal information we hold about you or ask us to correct information that is inaccurate, out of date, incomplete, irrelevant or misleading, where applicable.`,
      },
      {
        type: "p",
        text: "You may also request deletion of personal information. We will consider deletion requests having regard to applicable law, our contractual obligations, security requirements and any legitimate need to retain the information.",
      },
      {
        type: "p",
        text: "We may need to verify your identity before providing access to or changing personal information.",
      },
      {
        type: "p",
        text: "Clinic administrators can update much of their own clinic and staff information directly through the Service.",
      },
      {
        type: "p",
        text: `Please do not include patient records or patient clinical information in a privacy request sent to ${PRODUCT_NAME}.`,
      },
    ],
  },
  {
    id: "complaints",
    title: "17. Privacy complaints",
    blocks: [
      {
        type: "p",
        text: `If you believe ${PRODUCT_NAME} has mishandled your personal information, please contact ${PRIVACY_EMAIL_MARKDOWN} and provide enough information for us to understand and investigate the issue.`,
      },
      {
        type: "p",
        text: "We will acknowledge and investigate privacy complaints and aim to provide a substantive response within 30 days.",
      },
      {
        type: "p",
        text: `Depending on the circumstances and the law that applies, a person may also be able to complain to the **Office of the Australian Information Commissioner (OAIC)** or the **Information and Privacy Commission NSW / NSW Privacy Commissioner**. Ordinarily, the relevant regulator will expect the person to first give ${PRODUCT_NAME} a reasonable opportunity to address the complaint.`,
      },
    ],
  },
  {
    id: "children",
    title: "18. Children",
    blocks: [
      {
        type: "p",
        text: `${PRODUCT_NAME} is a business platform and does not provide patient or child accounts.`,
      },
      {
        type: "p",
        text: "Public clinic aftercare guides may be viewed by any person with access to the relevant URL, including parents, guardians or younger people. Those generic pages are not designed to collect a reader's personal or health information.",
      },
    ],
  },
  {
    id: "automated-decisions",
    title: "19. Automated decision-making",
    blocks: [
      {
        type: "p",
        text: `${PRODUCT_NAME} does not currently arrange for personal information to be used by an automated system to make decisions that could reasonably be expected to significantly affect an individual's rights or interests.`,
      },
      {
        type: "p",
        text: "If this changes, we will review our privacy obligations and update this Policy where required.",
      },
    ],
  },
  {
    id: "changes",
    title: "20. Changes to this Policy",
    blocks: [
      {
        type: "p",
        text: "We may update this Privacy Policy where our product, service providers, information-handling practices or legal obligations change.",
      },
      {
        type: "p",
        text: "The “Last updated” date will identify the current version. Material changes will be published on this page and, where appropriate, communicated directly to affected customers.",
      },
    ],
  },
  {
    id: "contact",
    title: "21. Contact",
    blocks: [
      {
        type: "p",
        text: "Privacy questions, requests and complaints can be sent to:",
      },
      {
        type: "address",
        lines: [
          `**${LEGAL_OPERATOR_PERSON_NAME}**`,
          `Sole trader trading as **${PRODUCT_NAME}**`,
          `ABN **${LEGAL_ABN}**`,
          LEGAL_PUBLIC_LOCATION,
          PRIVACY_EMAIL_MARKDOWN,
        ],
      },
      {
        type: "p",
        text: "Please do not send patient records or patient clinical information to this address.",
      },
    ],
  },
];

export const PRIVACY_DOCUMENT = legalDocumentMeta({
  slug: "/privacy",
  title: "Privacy Policy",
  intro: `This Privacy Policy explains how ${PRODUCT_NAME} handles personal information in connection with the ${PRODUCT_NAME} website, clinic and staff accounts, business communications, and clinic-branded public aftercare pages.`,
  preamble: [
    `${PRODUCT_NAME} is a business-to-business publishing platform for healthcare practices. The current product is not a patient health record and is not designed to collect identifiable patient health information.`,
  ],
  lastUpdatedIso: PRIVACY_LAST_UPDATED_ISO,
  sections: SECTIONS,
});
