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
      description="This confirms the address for a registration. It does not create the clinic."
      backHref="/register"
      backLabel="Back to registration"
    >
      <VerifyRegistrationPanel
        turnstileSiteKey={getTurnstileSiteKey()}
        contactHref={marketingContactHref(links)}
      />
    </StaffAuthShell>
  );
}
