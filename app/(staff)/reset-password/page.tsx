import type { Metadata } from "next";

import { StaffAuthShell } from "@/app/(staff)/components/staff-auth-shell";
import { ResetPasswordForm } from "@/app/(staff)/reset-password/reset-password-form";
import { PRODUCT_NAME } from "@/lib/branding/product-name";
import { PRIVATE_ROBOTS } from "@/lib/seo/robots-policy";

export const metadata: Metadata = {
  title: `Reset password · ${PRODUCT_NAME}`,
  description: `Choose a new ${PRODUCT_NAME} password.`,
  robots: PRIVATE_ROBOTS,
};

export default function ResetPasswordPage() {
  return (
    <StaffAuthShell
      title="Reset your password"
      description="Choose a new password for your account. This link can be used once."
      backHref="/login"
      backLabel="Back to sign in"
    >
      <ResetPasswordForm />
    </StaffAuthShell>
  );
}
