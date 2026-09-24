import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { StaffAuthShell } from "@/app/(staff)/components/staff-auth-shell";
import { TransientNotice } from "@/app/(staff)/components/transient-notice";
import { LoginForm } from "@/app/(staff)/login/login-form";
import {
  INVITATION_READY_MESSAGE,
  PASSWORD_RESET_SUCCESS_MESSAGE,
} from "@/lib/auth/password-policy";
import { EMAIL_CHANGE_CONFIRMED_MESSAGE } from "@/lib/auth/account-profile-schema";
import { getAuthContext } from "@/lib/auth/session";
import { signedInHomePath } from "@/lib/auth/signed-in-home";
import { PRODUCT_NAME } from "@/lib/branding/product-name";
import { resolveLocalLoginSeed } from "@/lib/dev/local-login-accounts";
import { PRIVATE_ROBOTS } from "@/lib/seo/robots-policy";

export const metadata: Metadata = {
  title: `Sign in · ${PRODUCT_NAME}`,
  description: `Sign in to ${PRODUCT_NAME}.`,
  robots: PRIVATE_ROBOTS,
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<{
    reset?: string | string[];
    invite?: string | string[];
    email?: string | string[];
  }>;
}) {
  const authContext = await getAuthContext().catch(() => ({
    user: null,
    clinicMembership: null,
  }));
  const home = signedInHomePath(authContext);
  if (home) {
    redirect(home);
  }

  const params = searchParams ? await searchParams : {};
  const resetParam = Array.isArray(params.reset)
    ? params.reset[0]
    : params.reset;
  const inviteParam = Array.isArray(params.invite)
    ? params.invite[0]
    : params.invite;
  const emailParam = Array.isArray(params.email)
    ? params.email[0]
    : params.email;
  const resetSuccess = resetParam === "success";
  const inviteSuccess = inviteParam === "success";
  const emailSuccess = emailParam === "updated";

  const localLogin =
    process.env.NODE_ENV === "development"
      ? resolveLocalLoginSeed(process.env)
      : null;

  return (
    <StaffAuthShell
      title="Sign in"
      description={`Use your email and password to continue to ${PRODUCT_NAME}.`}
    >
      {resetSuccess ? (
        <TransientNotice variant="success">
          {PASSWORD_RESET_SUCCESS_MESSAGE}
        </TransientNotice>
      ) : null}
      {inviteSuccess ? (
        <TransientNotice variant="success">
          {INVITATION_READY_MESSAGE}
        </TransientNotice>
      ) : null}
      {emailSuccess ? (
        <TransientNotice variant="success">
          {EMAIL_CHANGE_CONFIRMED_MESSAGE}
        </TransientNotice>
      ) : null}
      <LoginForm />
      {localLogin?.status === "seed" ? (
        <div className="mt-6 rounded-md border border-staff-line bg-staff-canvas px-3 py-3 text-sm text-staff-muted">
          <p className="font-medium text-staff-ink">
            Local development account
          </p>
          <ul className="mt-2 flex flex-col gap-1">
            {localLogin.accounts.map((account) => (
              <li key={account.role}>
                {account.role}: {account.email}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </StaffAuthShell>
  );
}
