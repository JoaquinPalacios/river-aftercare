import type { Metadata } from "next";

import { ConfirmEmailChangeForm } from "@/app/(staff)/confirm-email-change/confirm-email-change-form";
import { StaffAuthShell } from "@/app/(staff)/components/staff-auth-shell";
import { PRODUCT_NAME } from "@/lib/branding/product-name";
import { PRIVATE_ROBOTS } from "@/lib/seo/robots-policy";

export const metadata: Metadata = {
  title: `Confirm email · ${PRODUCT_NAME}`,
  description: `Confirm a new ${PRODUCT_NAME} email address.`,
  robots: PRIVATE_ROBOTS,
};

export default function ConfirmEmailChangePage() {
  return (
    <StaffAuthShell
      title="Confirm your email"
      description="This link can be used once. Your current sign-in email stays the same until you confirm."
      backHref="/login"
      backLabel="Back to sign in"
    >
      <ConfirmEmailChangeForm />
    </StaffAuthShell>
  );
}
