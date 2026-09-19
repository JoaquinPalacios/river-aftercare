import type { Metadata } from "next";

import { AcceptInvitationForm } from "@/app/(staff)/accept-invitation/accept-invitation-form";
import { StaffAuthShell } from "@/app/(staff)/components/staff-auth-shell";
import { PRODUCT_NAME } from "@/lib/branding/product-name";
import { PRIVATE_ROBOTS } from "@/lib/seo/robots-policy";

export const metadata: Metadata = {
  title: `Set up your account · ${PRODUCT_NAME}`,
  description: `Create a password to finish setting up your ${PRODUCT_NAME} account.`,
  robots: PRIVATE_ROBOTS,
};

export default function AcceptInvitationPage() {
  return (
    <StaffAuthShell
      title={`Set up your ${PRODUCT_NAME} account`}
      description={`You've been invited to ${PRODUCT_NAME}. Create a password to finish setting up your account.`}
      backHref="/login"
      backLabel="Back to sign in"
    >
      <AcceptInvitationForm />
    </StaffAuthShell>
  );
}
