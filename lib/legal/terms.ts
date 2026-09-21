import { PRODUCT_NAME } from "@/lib/branding/product-name";
import { legalDocumentMeta, type LegalSection } from "@/lib/legal/document";
import {
  LEGAL_ABN,
  LEGAL_GOVERNING_LAW,
  LEGAL_OPERATOR_PERSON_NAME,
  LEGAL_PRIVACY_EMAIL,
  LEGAL_PUBLIC_LOCATION,
  TERMS_LAST_UPDATED_ISO,
} from "@/lib/legal/status";

const PRIVACY_EMAIL_MARKDOWN = `**[${LEGAL_PRIVACY_EMAIL}](mailto:${LEGAL_PRIVACY_EMAIL})**`;

const SECTIONS: readonly LegalSection[] = [
  {
    id: "about",
    title: "1. About River Aftercare",
    blocks: [
      {
        type: "p",
        text: `${PRODUCT_NAME} is operated by **${LEGAL_OPERATOR_PERSON_NAME}**, an Australian sole trader trading as **${PRODUCT_NAME}**, ABN **${LEGAL_ABN}**, based in ${LEGAL_PUBLIC_LOCATION}.`,
      },
      {
        type: "p",
        text: `${PRODUCT_NAME} is a business-to-business software service for healthcare practices. It enables clinics to create and publish clinic-branded treatment, recovery, home-care and post-treatment guidance as web pages that can be reopened without a patient app or patient account.`,
      },
      {
        type: "p",
        text: `${PRODUCT_NAME} provides publishing and content-management technology. It is not a healthcare provider, patient health record, live clinical-monitoring service, patient-messaging service or emergency-care service.`,
      },
    ],
  },
  {
    id: "definitions",
    title: "2. Definitions",
    blocks: [
      {
        type: "p",
        text: `In these Terms, **Authorised User** means a person authorised by a Customer to access the staff functions of the Service.`,
      },
      {
        type: "p",
        text: `**Customer** means the healthcare practice or other organisation that subscribes to or otherwise enters into an agreement to use the Service.`,
      },
      {
        type: "p",
        text: `**Customer Content** means branding, logos, clinic information, clinic-created or clinic-adapted copy, published instructions and other material supplied or created by or for the Customer through the Service.`,
      },
      {
        type: "p",
        text: `**Customer Commercial Terms** means an accepted quote, proposal, order form, written onboarding agreement or other written commercial arrangement between ${PRODUCT_NAME} and the Customer identifying matters such as the applicable plan, price, subscription period, allowances or onboarding arrangements.`,
      },
      {
        type: "p",
        text: `**Plan** means the applicable ${PRODUCT_NAME} subscription plan for the Customer, as shown in ${PRODUCT_NAME}'s published pricing or as identified in Customer Commercial Terms.`,
      },
      {
        type: "p",
        text: "**Billing period** means the monthly or annual period for which the Customer's subscription is charged, as established by the selected plan or Customer Commercial Terms.",
      },
      {
        type: "p",
        text: `**Service** means the ${PRODUCT_NAME} software and related services, including the staff portal, clinic configuration, template functionality made available by ${PRODUCT_NAME}, and public clinic-branded aftercare pages.`,
      },
    ],
  },
  {
    id: "agreement",
    title: "3. Agreement and authority",
    blocks: [
      {
        type: "p",
        text: `These Terms form part of the agreement between ${PRODUCT_NAME} and each Customer.`,
      },
      {
        type: "p",
        text: `A Customer accepts these Terms by accepting Customer Commercial Terms that incorporate or refer to them, expressly accepting them during onboarding or account creation, or otherwise expressly agreeing to subscribe to the Service on these Terms.`,
      },
      {
        type: "p",
        text: "A person accepting these Terms on behalf of a Customer represents that they have authority to bind that Customer.",
      },
      {
        type: "p",
        text: "If there is an inconsistency between these Terms and Customer Commercial Terms, the Customer Commercial Terms prevail to the extent of that inconsistency.",
      },
    ],
  },
  {
    id: "customers",
    title: "4. Customers and Authorised Users",
    blocks: [
      {
        type: "p",
        text: `${PRODUCT_NAME} is offered to healthcare practices and their authorised personnel. It is a business product and does not provide patient accounts.`,
      },
      {
        type: "p",
        text: "The number of Authorised Users included with a Customer's subscription is determined by the applicable plan and any Customer Commercial Terms.",
      },
      {
        type: "p",
        text: "The Customer is responsible for determining which people may act as Authorised Users and for removing access when it is no longer appropriate.",
      },
      {
        type: "p",
        text: "Authorised Users must use their own credentials and must not share passwords or other authentication credentials.",
      },
      {
        type: "p",
        text: `The Customer must promptly tell ${PRODUCT_NAME} if it reasonably believes an account or credential has been compromised.`,
      },
    ],
  },
  {
    id: "service",
    title: "5. The Service",
    blocks: [
      {
        type: "p",
        text: `${PRODUCT_NAME} provides technology through which Customers can manage clinic configuration and publish clinic-branded aftercare information.`,
      },
      {
        type: "p",
        text: "The Customer's included allowances are determined by the applicable plan and any Customer Commercial Terms. Those allowances may include matters such as the number of custom clinic guides the Customer may create or edit, the number of Authorised Users, rights to adapt templates, locations, onboarding or support level, and other capabilities shown in the applicable published pricing or Customer Commercial Terms.",
      },
      {
        type: "p",
        text: `Unless Customer Commercial Terms expressly provide otherwise, ${PRODUCT_NAME} does not provide a numerical uptime service level, managed clinical review, patient monitoring or patient-specific healthcare advice.`,
      },
      {
        type: "p",
        text: `Support entitlements may vary by plan. Where a plan includes Priority support, that means the Customer's support requests are handled with priority relative to standard support. Unless Customer Commercial Terms expressly provide otherwise, ${PRODUCT_NAME} does not commit to a particular response time.`,
      },
      {
        type: "p",
        text: `${PRODUCT_NAME} may release improvements, fixes and reasonable changes to the Service as it develops.`,
      },
    ],
  },
  {
    id: "clinic-responsibilities",
    title: "6. Customer responsibilities",
    blocks: [
      {
        type: "p",
        text: "The Customer remains responsible for the Customer Content it creates, approves and publishes.",
      },
      {
        type: "p",
        text: "The Customer must ensure that appropriately qualified personnel review clinical instructions before publication; keep clinic identity, contact information and emergency information reasonably accurate; promptly update or unpublish information that is no longer appropriate; ensure it has the rights required to use any content or branding it provides; and use the Service in accordance with applicable law and these Terms.",
      },
      {
        type: "p",
        text: "Publishing or continuing to publish a guide is a decision of the Customer.",
      },
    ],
  },
  {
    id: "clinical-responsibility",
    title: "7. Clinical responsibility",
    blocks: [
      {
        type: "p",
        text: `${PRODUCT_NAME} is not a healthcare provider and does not practise medicine, dentistry, physiotherapy, chiropractic or another regulated health profession.`,
      },
      {
        type: "p",
        text: `Use of ${PRODUCT_NAME} does not create a practitioner-patient relationship between ${PRODUCT_NAME} and a reader or patient.`,
      },
      {
        type: "p",
        text: `${PRODUCT_NAME} does not diagnose, prescribe, triage or make patient-specific clinical decisions.`,
      },
      {
        type: "p",
        text: `Templates, examples and demo content supplied through the Service are general starting points unless ${PRODUCT_NAME} expressly states otherwise in writing. The Customer must determine whether any material is appropriate for its practice, procedures and patients before publishing it.`,
      },
      {
        type: "p",
        text: `Nothing in the Service constitutes a representation that a guide is suitable for every patient or circumstance, that a particular clinical outcome will occur, or that ${PRODUCT_NAME} has obtained medical-device approval or clinical accreditation.`,
      },
    ],
  },
  {
    id: "patient-pages",
    title: "8. Public aftercare pages",
    blocks: [
      {
        type: "p",
        text: "A clinic's public aftercare pages are informational web pages published under that clinic's brand.",
      },
      {
        type: "p",
        text: "Public guide URLs identify a clinic and procedure or guide. The Service is not designed to use those URLs to identify a named patient.",
      },
      {
        type: "p",
        text: "Generic public guides do not require a patient account.",
      },
      {
        type: "p",
        text: "A public guide does not replace practitioner judgement, an appropriate clinical review or emergency care. The Customer is responsible for providing appropriate clinic contact and emergency information for its published guides.",
      },
    ],
  },
  {
    id: "patient-health",
    title: "9. Patient and health information",
    blocks: [
      {
        type: "p",
        text: "The current Service is not designed to collect or manage identifiable patient health records or personalised patient information.",
      },
      {
        type: "p",
        text: "The Customer and its Authorised Users must not enter into or transmit through the current Service patient names linked to clinical information, dates of birth, Medicare numbers, medical record numbers, diagnoses, clinical histories, treatment records, patient-specific instructions or other identifiable patient health information.",
      },
      {
        type: "p",
        text: "Free-text fields are intended for business information and generic clinic-approved aftercare content, not patient records.",
      },
      {
        type: "p",
        text: `If ${PRODUCT_NAME} becomes aware that patient information has been submitted contrary to this clause, ${PRODUCT_NAME} may restrict, remove or, where reasonably practicable and lawful, delete or de-identify that information.`,
      },
      {
        type: "p",
        text: `If ${PRODUCT_NAME} later introduces functionality specifically designed to process identifiable patient information, that functionality may be subject to additional privacy, security and contractual terms and must not be treated as available until ${PRODUCT_NAME} expressly says so.`,
      },
    ],
  },
  {
    id: "prohibited-use",
    title: "10. Prohibited use",
    blocks: [
      {
        type: "p",
        text: `The Customer and its Authorised Users must not use the Service unlawfully; infringe another person's rights; upload malware or malicious code; attempt to bypass access controls or gain unauthorised access; interfere materially with the operation or security of the Service; conduct abusive automated scraping or probing; impersonate ${PRODUCT_NAME} or another person; represent ${PRODUCT_NAME} as the treating healthcare provider or an emergency service; publish material they do not have the right to use; or use the Service as a patient health record contrary to clause 9.`,
      },
      {
        type: "p",
        text: `${PRODUCT_NAME} may take proportionate steps to prevent or stop prohibited use, including restricting affected content or access in accordance with clause 20.`,
      },
    ],
  },
  {
    id: "ip",
    title: "11. River Aftercare intellectual property",
    blocks: [
      {
        type: "p",
        text: `${PRODUCT_NAME} and its licensors retain all rights in the ${PRODUCT_NAME} software, platform design, branding, generic documentation, system functionality and ${PRODUCT_NAME}-created templates, subject to applicable third-party licences.`,
      },
      {
        type: "p",
        text: `These Terms do not transfer ownership of the Service or ${PRODUCT_NAME} intellectual property to the Customer.`,
      },
      {
        type: "p",
        text: "The Customer receives a non-exclusive, non-transferable right to use the Service for its authorised internal business purposes during its subscription.",
      },
    ],
  },
  {
    id: "customer-licence",
    title: "12. Customer Content and branding",
    blocks: [
      {
        type: "p",
        text: "The Customer retains its rights in its own branding, logos, clinic-created material, clinic-specific additions and Customer Content.",
      },
      {
        type: "p",
        text: `The Customer grants ${PRODUCT_NAME} a non-exclusive licence to host, store, process, reproduce, transmit and display Customer Content only to the extent reasonably necessary to provide, secure and support the Service.`,
      },
      {
        type: "p",
        text: "That licence ends when it is no longer reasonably required following termination, subject to limited backup retention, legal obligations and other retention described in the Privacy Policy or these Terms.",
      },
      {
        type: "p",
        text: `The Customer represents that it has the rights and permissions reasonably required for ${PRODUCT_NAME} to use Customer Content in this way.`,
      },
    ],
  },
  {
    id: "platform-templates",
    title: "13. River Aftercare templates",
    blocks: [
      {
        type: "p",
        text: `${PRODUCT_NAME} may make template or sample aftercare content available as part of the Service. Available template access, and whether the Customer may adapt those templates, may depend on the Customer's plan and any Customer Commercial Terms.`,
      },
      {
        type: "p",
        text: `Unless Customer Commercial Terms provide otherwise, a Customer on the Essential plan may use available ${PRODUCT_NAME} templates as supplied. A Customer on the Practice plan may adapt available ${PRODUCT_NAME} templates to suit its clinic where that plan permits. Group or other agreed arrangements have the template capabilities set out in the relevant Customer Commercial Terms.`,
      },
      {
        type: "p",
        text: "A Customer may still create and fully edit its own clinic-authored custom guides, subject to the applicable plan allowances.",
      },
      {
        type: "p",
        text: "Unless expressly stated otherwise in writing, templates and demo content are provided as starting material rather than patient-specific clinical advice.",
      },
      {
        type: "p",
        text: "The Customer remains responsible for reviewing and approving all material it ultimately publishes, including templates used as supplied, clinic-authored custom guides, and any clinic-specific adaptation of a template.",
      },
      {
        type: "p",
        text: `Clinic-authored custom guides, and clinic-specific material or adaptation of a ${PRODUCT_NAME} template, are Customer Content to the extent of that clinic-created or clinic-specific material. ${PRODUCT_NAME} retains its rights in the underlying ${PRODUCT_NAME} template from which an adaptation was made.`,
      },
    ],
  },
  {
    id: "confidentiality",
    title: "14. Confidentiality",
    blocks: [
      {
        type: "p",
        text: "Each party may receive non-public information relating to the other party's business, technology, security, customers, commercial arrangements or operations.",
      },
      {
        type: "p",
        text: "A receiving party must use the other party's confidential information only as reasonably necessary for the relationship under these Terms and must take reasonable measures to protect it from unauthorised use or disclosure.",
      },
      {
        type: "p",
        text: "Information is not confidential to the extent it is already lawfully known without a duty of confidence, becomes public other than through a breach of these Terms, is independently developed without use of the confidential information, or is lawfully received from another person without a confidentiality obligation.",
      },
      {
        type: "p",
        text: "A party may disclose confidential information where required by law, provided it gives reasonable notice to the other party where lawful and practicable.",
      },
      {
        type: "p",
        text: `Customer Content intentionally published as a public clinic guide is not confidential merely because it was created through ${PRODUCT_NAME}.`,
      },
    ],
  },
  {
    id: "privacy-data",
    title: "15. Privacy and data",
    blocks: [
      {
        type: "p",
        text: `${PRODUCT_NAME}'s handling of personal information is described in the ${PRODUCT_NAME} Privacy Policy.`,
      },
      {
        type: "p",
        text: "The Customer is responsible for ensuring that its own use of the Service complies with privacy, health-record and professional obligations applicable to that Customer.",
      },
      {
        type: "p",
        text: `The Privacy Policy forms part of ${PRODUCT_NAME}'s information-handling arrangements but does not expand the Service into a patient health-record system.`,
      },
    ],
  },
  {
    id: "third-parties",
    title: "16. Third-party services",
    blocks: [
      {
        type: "p",
        text: `${PRODUCT_NAME} relies on third-party infrastructure, communications and payment providers to operate the Service, including hosting, database, storage, security, network, email and payment or billing providers.`,
      },
      {
        type: "p",
        text: `${PRODUCT_NAME} intends to use Stripe as its payment and billing processor for subscription payments. Stripe-hosted payment and billing pages are operated by Stripe. Further information about Stripe's handling of personal information is set out in the Privacy Policy.`,
      },
      {
        type: "p",
        text: `The availability and performance of parts of the Service can therefore depend on systems outside ${PRODUCT_NAME}'s direct control.`,
      },
      {
        type: "p",
        text: `${PRODUCT_NAME} selects and manages providers using reasonable care but does not control every act, omission or outage of an independent third-party provider.`,
      },
      {
        type: "p",
        text: "The Privacy Policy provides further information about providers involved in the handling of personal information.",
      },
    ],
  },
  {
    id: "availability",
    title: "17. Availability, maintenance and security",
    blocks: [
      {
        type: "p",
        text: `${PRODUCT_NAME} will use reasonable care and skill in providing the Service.`,
      },
      {
        type: "p",
        text: "Maintenance, security work, software changes and infrastructure incidents may occasionally interrupt or affect availability.",
      },
      {
        type: "p",
        text: `Unless Customer Commercial Terms expressly provide otherwise, ${PRODUCT_NAME} does not guarantee uninterrupted or error-free operation or a particular numerical uptime level.`,
      },
      {
        type: "p",
        text: `${PRODUCT_NAME} may perform emergency work or temporarily restrict functionality where reasonably necessary to address a material security, legal or operational risk.`,
      },
      {
        type: "p",
        text: "Each party is responsible for taking reasonable security measures within its own control. The Customer is responsible for its users, devices, credentials and the accuracy and legality of material it publishes.",
      },
    ],
  },
  {
    id: "fees",
    title: "18. Fees, billing and GST",
    blocks: [
      {
        type: "p",
        text: "Fees are stated in Australian dollars unless Customer Commercial Terms say otherwise. GST will be charged where applicable.",
      },
      {
        type: "p",
        text: "Unless Customer Commercial Terms provide otherwise, subscriptions may be monthly or annual. Fees are normally charged in advance for the applicable billing period using the payment method authorised during billing setup.",
      },
      {
        type: "p",
        text: `${PRODUCT_NAME} intends to collect subscription payments using Stripe-hosted payment and billing services. Supported methods may include card and Australian BECS Direct Debit. Other methods may be made available from time to time. Customer Commercial Terms may specify a different agreed payment arrangement.`,
      },
      {
        type: "p",
        text: `Payment credentials, including card details and bank-account details used for Direct Debit, are supplied to Stripe through Stripe-hosted payment surfaces. ${PRODUCT_NAME} itself does not receive or store full card numbers or full bank-account credentials. ${PRODUCT_NAME} may receive billing and payment status information and transaction or invoice references reasonably necessary to administer the subscription.`,
      },
      {
        type: "p",
        text: `Completing a payment-method setup, including a BECS Direct Debit mandate, does not itself mean that a payment has settled. ${PRODUCT_NAME} may treat a Direct Debit or other payment as pending until settlement is confirmed. Paid-plan entitlements activate only once the first invoice or payment is confirmed as paid, unless Customer Commercial Terms provide otherwise.`,
      },
      {
        type: "p",
        text: "The amount payable is the amount shown in the applicable published pricing or Customer Commercial Terms.",
      },
      {
        type: "p",
        text: "The Customer remains responsible for undisputed fees incurred before the effective end of its subscription.",
      },
      {
        type: "p",
        text: "There are no routine refunds for change of mind. Duplicate charges and billing or payment errors may be refunded. Refunds are ordinarily returned to the original payment method. Nothing in this clause limits rights under the Australian Consumer Law or other non-excludable rights.",
      },
    ],
  },
  {
    id: "term",
    title: "19. Subscription term, renewal and cancellation",
    blocks: [
      {
        type: "p",
        text: "Unless Customer Commercial Terms provide otherwise, a subscription may be monthly or annual. The applicable billing period is established by the selected plan or Customer Commercial Terms.",
      },
      {
        type: "p",
        text: "Subscriptions renew automatically for the same billing period unless cancelled before renewal. Cancelling a monthly subscription stops the next monthly renewal. Cancelling an annual subscription stops the next annual renewal.",
      },
      {
        type: "p",
        text: `The Customer may cancel using a cancellation method ${PRODUCT_NAME} makes available, including the billing portal where available.`,
      },
      {
        type: "p",
        text: "Cancellation takes effect at the end of the current paid billing period. There is no cancellation fee. Access continues through the paid-through date, subject to these Terms, including the security, legal and other restrictions in these Terms.",
      },
      {
        type: "p",
        text: "Amounts already paid for a voluntary cancellation are not refunded on a pro-rata basis, except where required by law or expressly agreed otherwise.",
      },
      {
        type: "p",
        text: "An upgrade to a higher plan may take effect immediately. Higher-plan entitlements may begin immediately, and an appropriate prorated adjustment may be charged for the remainder of the current billing period. The next renewal is then charged at the upgraded plan rate, unless Customer Commercial Terms provide otherwise.",
      },
      {
        type: "p",
        text: "A downgrade to a lower plan takes effect at the next renewal or the end of the current paid billing period, unless Customer Commercial Terms provide otherwise. The current plan's access continues until then. There is no automatic pro-rata refund for a scheduled downgrade. Content is not automatically deleted merely because a downgrade is scheduled.",
      },
      {
        type: "p",
        text: "Completing a downgrade may require the Customer to bring its use within the destination plan's allowances before the lower plan takes effect. That may include custom clinic guides, adapted-template content or Authorised Users beyond the destination plan.",
      },
    ],
  },
  {
    id: "suspension",
    title: "20. Suspension",
    blocks: [
      {
        type: "p",
        text: `If a recurring payment fails or is temporarily overdue while reasonable payment retries or recovery are occurring, normal product access continues. ${PRODUCT_NAME} will not, for that reason alone, immediately suspend the clinic or remove already-published public guides.`,
      },
      {
        type: "p",
        text: `If those retries are exhausted or the account is genuinely unpaid, ${PRODUCT_NAME} may restrict staff authoring, including the creation, editing or publishing of new content, and may require the payment to be resolved before restoring full authoring capability. Already-published patient-facing guides ordinarily remain accessible under clause 22, unless another basis in these Terms applies.`,
      },
      {
        type: "p",
        text: `${PRODUCT_NAME} may still suspend affected access or public pages where reasonably necessary because of a material security risk, unlawful or prohibited use, fraud, a legal requirement, a material breach of these Terms other than a temporary payment failure, or similar material harm.`,
      },
      {
        type: "p",
        text: `Where practicable, ${PRODUCT_NAME} will limit a suspension to the functionality or account reasonably affected by the relevant issue and will notify the Customer before suspension. Prior notice may not be practicable where immediate action is reasonably necessary to address security, illegality or material harm.`,
      },
      {
        type: "p",
        text: `${PRODUCT_NAME} will restore access within a reasonable period after the reason for suspension has been resolved, provided there is no separate lawful basis for continuing the suspension.`,
      },
    ],
  },
  {
    id: "termination",
    title: "21. Termination",
    blocks: [
      {
        type: "p",
        text: "Either party may terminate the agreement if the other party materially breaches it and, where the breach is capable of remedy, does not remedy the breach within 14 days after written notice describing the breach.",
      },
      {
        type: "p",
        text: "A party may terminate immediately where a material breach is not reasonably capable of remedy, or where continued performance would require unlawful conduct.",
      },
      {
        type: "p",
        text: `${PRODUCT_NAME} may also terminate an ongoing subscription for convenience by giving at least 30 days' written notice. If ${PRODUCT_NAME} terminates for convenience before the end of a period for which the Customer has prepaid, ${PRODUCT_NAME} will refund the portion of the prepaid subscription attributable to the period after termination.`,
      },
      {
        type: "p",
        text: "Termination does not affect rights and liabilities accrued before termination.",
      },
    ],
  },
  {
    id: "data-after-termination",
    title: "22. Data after termination",
    blocks: [
      {
        type: "p",
        text: "When a paid subscription ends, full product functionality continues until the paid-through date. After that date, the former Customer does not have normal paid authoring or publishing rights.",
      },
      {
        type: "p",
        text: `Already-published patient-facing guide URLs, referred to in the Service as durable patient guide URLs, may remain available for up to **60 days** after the paid subscription ends. This is an ordinary maximum availability period, not a promise that ${PRODUCT_NAME} will continue hosting particular content. ${PRODUCT_NAME} may take public guides offline earlier where reasonably necessary because of law, security, prohibited content or use, material harm, a Customer request, account deletion, or another lawful basis. After that period, ${PRODUCT_NAME} may take those public guides offline.`,
      },
      {
        type: "p",
        text: "Cancellation or expiry of a subscription is not itself a request to delete the Customer's account or data. Account deletion and personal-information deletion requests are separate matters, subject to retention requirements, these Terms, security, accounting and legal requirements, and the Privacy Policy.",
      },
      {
        type: "p",
        text: "For **30 days** after the subscription ends, the Customer may request a reasonable export of available Customer-owned content and clinic configuration in a commonly usable form where technically practicable.",
      },
      {
        type: "p",
        text: `The export obligation does not require ${PRODUCT_NAME} to provide its proprietary software, internal system data or ${PRODUCT_NAME}-owned templates separately from Customer Content.`,
      },
      {
        type: "p",
        text: `After that 30-day export period, ${PRODUCT_NAME} may delete active clinic account and operational data that is no longer reasonably required, subject to the public-guide availability described above and to backup, legal, accounting and security retention.`,
      },
      {
        type: "p",
        text: "Deleted information may remain temporarily in provider backup or recovery systems until it expires or is overwritten through normal retention cycles. Information required for legal, accounting, security or dispute-related reasons may be retained for the relevant period.",
      },
    ],
  },
  {
    id: "changes",
    title: "23. Changes to the Service, Terms and pricing",
    blocks: [
      {
        type: "p",
        text: `${PRODUCT_NAME} may improve and update the Service over time.`,
      },
      {
        type: "p",
        text: `${PRODUCT_NAME} will not intentionally make a material adverse reduction to core paid functionality during a current paid billing period without reasonable notice, except where a change is reasonably necessary for security, legal compliance, prevention of abuse or a third-party infrastructure change outside ${PRODUCT_NAME}'s reasonable control.`,
      },
      {
        type: "p",
        text: `${PRODUCT_NAME} may update these Terms. Material changes affecting an existing Customer will be notified with reasonable advance notice and will ordinarily take effect from a subsequent renewal period rather than retrospectively.`,
      },
      {
        type: "p",
        text: `Where a change must take effect sooner because of law, security or an urgent operational requirement, ${PRODUCT_NAME} may apply it sooner to the extent reasonably necessary.`,
      },
      {
        type: "p",
        text: `For a material increase to recurring subscription fees, ${PRODUCT_NAME} will give at least 30 days' advance notice. The changed price will apply from the first renewal or billing period commencing after that notice period.`,
      },
      {
        type: "p",
        text: "A Customer that does not accept a material change or price increase may cancel before the change takes effect.",
      },
    ],
  },
  {
    id: "acl",
    title: "24. Australian Consumer Law and non-excludable rights",
    blocks: [
      {
        type: "p",
        text: "Nothing in these Terms excludes, restricts or modifies a guarantee, right, liability or remedy that cannot lawfully be excluded, restricted or modified, including rights under the **Australian Consumer Law** where they apply.",
      },
      {
        type: "p",
        text: "A Customer may have rights under the Australian Consumer Law even where it acquires the Service for business purposes.",
      },
      {
        type: "p",
        text: `Where ${PRODUCT_NAME} supplies services to a Customer as a “consumer” under the Australian Consumer Law, and a statutory guarantee applies that may lawfully be limited under section 64A of that law, ${PRODUCT_NAME}'s liability for a failure to comply with that guarantee is, to the extent permitted and where it is fair and reasonable to do so, limited at ${PRODUCT_NAME}'s option to supplying the relevant services again or paying the reasonable cost of having those services supplied again.`,
      },
      {
        type: "p",
        text: "This clause takes priority over any inconsistent exclusion or limitation elsewhere in these Terms.",
      },
    ],
  },
  {
    id: "disclaimers",
    title: "25. Disclaimers",
    blocks: [
      {
        type: "p",
        text: `Subject to clause 24 and any other right or liability that cannot lawfully be excluded, ${PRODUCT_NAME} does not warrant that the Service will operate without interruption or defects, that every feature will meet every Customer workflow, or that clinic-published aftercare information will be clinically suitable for every patient or circumstance.`,
      },
      {
        type: "p",
        text: "The Service does not replace professional clinical judgement.",
      },
      {
        type: "p",
        text: `${PRODUCT_NAME} does not represent that the Service is a medical device, a patient health-record system, an emergency-care system, clinically accredited, or certified as compliant with a regulatory or security framework unless ${PRODUCT_NAME} expressly states that certification in writing.`,
      },
    ],
  },
  {
    id: "liability",
    title: "26. Liability",
    blocks: [
      {
        type: "p",
        text: "This clause is subject to clause 24.",
      },
      {
        type: "p",
        text: "To the extent permitted by law, neither party is liable to the other for indirect, special or consequential loss arising out of or in connection with the Service.",
      },
      {
        type: "p",
        text: "Loss of profit, revenue, opportunity or goodwill is excluded only to the extent that the relevant loss is indirect or consequential and the exclusion is legally permissible.",
      },
      {
        type: "p",
        text: `${PRODUCT_NAME} is not responsible for a clinical outcome to the extent that the outcome arises from the Customer's clinical judgement, Customer Content or clinic-published instructions. This does not exclude liability to the extent ${PRODUCT_NAME} itself caused or contributed to the relevant loss through conduct for which liability cannot lawfully be excluded or through a breach for which ${PRODUCT_NAME} remains liable under these Terms.`,
      },
      {
        type: "p",
        text: `Subject to the exclusions below, the aggregate liability of either party arising out of or in connection with the Service is capped at the greater of **AUD $1,000** or the fees paid or payable by the Customer to ${PRODUCT_NAME} in the 12 months immediately preceding the event giving rise to the claim.`,
      },
      {
        type: "p",
        text: "The liability cap does not limit the Customer's obligation to pay properly due fees, liability for fraud or deliberate or wilful misconduct, or liability that cannot lawfully be excluded or limited.",
      },
    ],
  },
  {
    id: "indemnity",
    title: "27. Third-party claims and indemnities",
    blocks: [
      {
        type: "p",
        text: `The Customer will indemnify ${PRODUCT_NAME} against a third-party claim to the extent the claim is caused by Customer Content or branding infringing that third party's rights, clinical instructions published by the Customer in breach of the Customer's obligations under these Terms, or the Customer's unlawful or deliberately unauthorised use of the Service.`,
      },
      {
        type: "p",
        text: `${PRODUCT_NAME} will indemnify the Customer against a third-party claim that the Customer's authorised use of the unmodified ${PRODUCT_NAME} Service infringes that third party's Australian intellectual-property rights, except to the extent the claim arises from Customer Content, modifications not made by ${PRODUCT_NAME}, use contrary to these Terms, or combination with material not supplied or approved by ${PRODUCT_NAME} where the claim would otherwise have been avoided.`,
      },
      {
        type: "p",
        text: "An indemnified party must notify the other party within a reasonable period after becoming aware of a claim and provide reasonable cooperation. The indemnifying party may control the defence and settlement of the claim, but must not agree to a settlement that admits wrongdoing by or imposes a non-monetary obligation on the indemnified party without that party's reasonable consent.",
      },
      {
        type: "p",
        text: "The indemnities in this clause are subject to clause 26 except to the extent applicable law does not permit the relevant liability to be limited.",
      },
    ],
  },
  {
    id: "force-majeure",
    title: "28. Events beyond reasonable control",
    blocks: [
      {
        type: "p",
        text: "Neither party is liable for delay or failure to perform an obligation, other than an obligation to pay money already due, to the extent the delay or failure results from circumstances beyond that party's reasonable control.",
      },
      {
        type: "p",
        text: "The affected party must take reasonable steps to minimise the effect of the event and resume performance when reasonably practicable.",
      },
    ],
  },
  {
    id: "notices",
    title: "29. Notices and communications",
    blocks: [
      {
        type: "p",
        text: "Operational communications may be sent electronically to the email address associated with the Customer's account.",
      },
      {
        type: "p",
        text: "Formal notices under these Terms may be sent by email to an address nominated by the receiving party for contractual notices.",
      },
      {
        type: "p",
        text: `${PRODUCT_NAME}'s legal contact address is ${PRIVACY_EMAIL_MARKDOWN}.`,
      },
      {
        type: "p",
        text: "A notice sent by email is treated as received when it is capable of being retrieved by the recipient, unless the sender receives an automated notice that delivery failed.",
      },
    ],
  },
  {
    id: "governing-law",
    title: "30. Governing law",
    blocks: [
      {
        type: "p",
        text: `These Terms and the agreement between ${PRODUCT_NAME} and the Customer are governed by the laws of **${LEGAL_GOVERNING_LAW}**.`,
      },
      {
        type: "p",
        text: "Each party submits to the non-exclusive jurisdiction of the courts of New South Wales and courts entitled to hear appeals from those courts.",
      },
    ],
  },
  {
    id: "general",
    title: "31. General",
    blocks: [
      {
        type: "p",
        text: `These Terms, the applicable Customer Commercial Terms and any expressly agreed written addendum form the agreement between ${PRODUCT_NAME} and the Customer about the Service.`,
      },
      {
        type: "p",
        text: "Customer Commercial Terms prevail over these Terms to the extent of an inconsistency.",
      },
      {
        type: "p",
        text: "If a provision is invalid or unenforceable, it is to be read down to the minimum extent necessary or, if that is not possible, severed without affecting the remaining provisions.",
      },
      {
        type: "p",
        text: "A failure or delay in exercising a contractual right does not waive that right.",
      },
      {
        type: "p",
        text: `The Customer may not assign its agreement without ${PRODUCT_NAME}'s prior reasonable consent. ${PRODUCT_NAME} may assign the agreement as part of a genuine sale, transfer or restructuring of its business, provided doing so does not materially reduce the Customer's rights under the agreement.`,
      },
      {
        type: "p",
        text: `Nothing in these Terms creates a partnership, employment relationship, fiduciary relationship or agency between ${PRODUCT_NAME} and the Customer.`,
      },
      {
        type: "p",
        text: "Clauses that by their nature are intended to survive termination, including provisions relating to confidentiality, intellectual property, payment obligations, liability, disputes and retained data, continue after termination to the extent necessary to give them effect.",
      },
    ],
  },
  {
    id: "contact",
    title: "32. Contact",
    blocks: [
      {
        type: "p",
        text: "Questions about these Terms can be sent to:",
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
        text: "Please do not send patient records or patient clinical information in legal or general enquiries.",
      },
    ],
  },
];

export const TERMS_DOCUMENT = legalDocumentMeta({
  slug: "/terms",
  title: "Terms & Conditions",
  intro: `These Terms govern subscriptions to the ${PRODUCT_NAME} business-to-business aftercare publishing platform.`,
  preamble: [
    "People who only read a clinic's public aftercare page are not Customers merely because they view that page.",
  ],
  lastUpdatedIso: TERMS_LAST_UPDATED_ISO,
  sections: SECTIONS,
});
