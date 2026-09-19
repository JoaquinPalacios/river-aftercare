import type { Metadata } from "next";

import { ChangePasswordForm } from "@/app/(staff)/account/security/change-password-form";
import { requireAuthenticatedUser } from "@/lib/auth/require-authenticated-user";
import { PRODUCT_NAME } from "@/lib/branding/product-name";
import { PRIVATE_ROBOTS } from "@/lib/seo/robots-policy";

export const metadata: Metadata = {
  title: `Account security · ${PRODUCT_NAME}`,
  description: `Change your ${PRODUCT_NAME} password.`,
  robots: PRIVATE_ROBOTS,
};

export default async function AccountSecurityPage() {
  await requireAuthenticatedUser();

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-3xl flex-col gap-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-staff-muted">
          Account
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-staff-ink">
          Account security
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-6 text-staff-muted">
          Change the password for this signed-in account.
        </p>
      </header>
      <section
        className="rounded-xl border border-staff-line bg-staff-panel p-6 shadow-sm"
        aria-labelledby="change-password-heading"
      >
        <h2
          id="change-password-heading"
          className="text-lg font-semibold tracking-tight text-staff-ink"
        >
          Change password
        </h2>
        <div className="mt-5">
          <ChangePasswordForm />
        </div>
      </section>
    </div>
  );
}
