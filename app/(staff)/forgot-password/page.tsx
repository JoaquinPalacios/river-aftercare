import type { Metadata } from "next";

import { StaffAuthShell } from "@/app/(staff)/components/staff-auth-shell";
import { ForgotPasswordForm } from "@/app/(staff)/forgot-password/forgot-password-form";
import { PRODUCT_NAME } from "@/lib/branding/product-name";
import { PRIVATE_ROBOTS } from "@/lib/seo/robots-policy";

export const metadata: Metadata = {
  title: `Forgot password · ${PRODUCT_NAME}`,
  description: `Reset your ${PRODUCT_NAME} password.`,
  robots: PRIVATE_ROBOTS,
};

export default function ForgotPasswordPage() {
  return (
    <StaffAuthShell
      title="Forgot your password?"
      description={`Enter your email address and, if an eligible account exists, ${PRODUCT_NAME} will send password-reset instructions.`}
      backHref="/login"
      backLabel="Back to sign in"
    >
      <ForgotPasswordForm />
    </StaffAuthShell>
  );
}
