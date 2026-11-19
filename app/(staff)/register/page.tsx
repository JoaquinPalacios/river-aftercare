import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { OnboardingAssistance } from "@/app/(staff)/components/onboarding-assistance";
import { StaffAuthShell } from "@/app/(staff)/components/staff-auth-shell";
import { RegisterForm } from "@/app/(staff)/register/register-form";
import { PRODUCT_NAME } from "@/lib/branding/product-name";
import { CATALOGUE_TRIAL_DISCLOSURE } from "@/lib/billing/trial";
import { isRegistrationEnabled } from "@/lib/auth/registration-flag";
import { getTurnstileSiteKey } from "@/lib/marketing/contact-config";
import {
  marketingContactHref,
  marketingPublicLinks,
} from "@/lib/marketing/public-links";
import { PRIVATE_ROBOTS } from "@/lib/seo/robots-policy";
import { getRootDomain } from "@/lib/tenancy/root-domain";

export const metadata: Metadata = {
  title: `Register · ${PRODUCT_NAME}`,
  description: `Register a clinic on ${PRODUCT_NAME}.`,
  robots: PRIVATE_ROBOTS,
};

function documentHref(homeHref: string, path: "terms" | "privacy"): string {
  const home = homeHref.endsWith("/") ? homeHref : `${homeHref}/`;
  return new URL(path, home).href;
}

export default async function RegisterPage() {
  if (!isRegistrationEnabled()) {
    notFound();
  }

  const links = await marketingPublicLinks();
  const contactHref = marketingContactHref(links);

  return (
    <StaffAuthShell
      width="wide"
      title="Register your practice"
      description={`Create the owner account for your clinic. We'll email a confirmation link before any clinic is created.`}
      backHref="/login"
      backLabel="Back to sign in"
    >
      <RegisterForm
        turnstileSiteKey={getTurnstileSiteKey()}
        trialDisclosure={CATALOGUE_TRIAL_DISCLOSURE}
        termsHref={documentHref(links.homeHref, "terms")}
        privacyHref={documentHref(links.homeHref, "privacy")}
        slugHost={getRootDomain()}
      />
      <OnboardingAssistance stage="registration" contactHref={contactHref} />
    </StaffAuthShell>
  );
}
