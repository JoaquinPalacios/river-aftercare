import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { StaffAuthShell } from "@/app/(staff)/components/staff-auth-shell";
import { VerifyRegistrationPanel } from "@/app/(staff)/verify-registration/verify-registration-panel";
import { PRODUCT_NAME } from "@/lib/branding/product-name";
import { isRegistrationEnabled } from "@/lib/auth/registration-flag";
import { getTurnstileSiteKey } from "@/lib/marketing/contact-config";
import {
  marketingContactHref,
  marketingPublicLinks,
} from "@/lib/marketing/public-links";
import { PRIVATE_ROBOTS } from "@/lib/seo/robots-policy";
import { getRootDomain } from "@/lib/tenancy/root-domain";

export const metadata: Metadata = {
  title: `Confirm your email · ${PRODUCT_NAME}`,
  description: `Confirm the email address for a ${PRODUCT_NAME} registration.`,
  robots: PRIVATE_ROBOTS,
};

export default async function VerifyRegistrationPage() {
  if (!isRegistrationEnabled()) {
    notFound();
  }

  const links = await marketingPublicLinks();

  return (
    <StaffAuthShell
      title="Confirm your email"
      description="Confirm your email to create the clinic. Payment is the next step and is not taken on this page."
      backHref="/register"
      backLabel="Back to registration"
    >
      <VerifyRegistrationPanel
        turnstileSiteKey={getTurnstileSiteKey()}
        contactHref={marketingContactHref(links)}
        slugHost={getRootDomain()}
      />
    </StaffAuthShell>
  );
}
