import type { Metadata } from "next";

import { UpdateProfileForm } from "@/app/(staff)/account/profile-form";
import { ChangePasswordForm } from "@/app/(staff)/account/security/change-password-form";
import { requireAuthenticatedUser } from "@/lib/auth/require-authenticated-user";
import { PRODUCT_NAME } from "@/lib/branding/product-name";
import { PRIVATE_ROBOTS } from "@/lib/seo/robots-policy";

export const metadata: Metadata = {
  title: `Account · ${PRODUCT_NAME}`,
  description: `Manage your ${PRODUCT_NAME} name, email, and password.`,
  robots: PRIVATE_ROBOTS,
};

export default async function AccountPage() {
  const user = await requireAuthenticatedUser();

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-3xl flex-col gap-8">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-staff-muted">
          Account
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-staff-ink">
          Account
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-6 text-staff-muted">
          These details belong to you, not to a clinic membership.
        </p>
      </header>

      <section
        className="rounded-xl border border-staff-line bg-staff-panel p-6 shadow-sm"
        aria-labelledby="profile-heading"
      >
        <h2
          id="profile-heading"
          className="text-lg font-semibold tracking-tight text-staff-ink"
        >
          Profile
        </h2>
        <p className="mt-2 text-sm leading-6 text-staff-muted">
          Update the name and email used to sign in.
        </p>
        <div className="mt-5">
          <UpdateProfileForm name={user.name ?? ""} email={user.email} />
        </div>
      </section>

      <section
        id="security"
        className="rounded-xl border border-staff-line bg-staff-panel p-6 shadow-sm"
        aria-labelledby="change-password-heading"
      >
        <h2
          id="change-password-heading"
          className="text-lg font-semibold tracking-tight text-staff-ink"
        >
          Security
        </h2>
        <p className="mt-2 text-sm leading-6 text-staff-muted">
          Change the password for this signed-in account.
        </p>
        <div className="mt-5">
          <ChangePasswordForm />
        </div>
      </section>
    </div>
  );
}
