import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { ProductMark } from "@/lib/branding/product-mark";
import { LoginForm } from "@/app/(staff)/login/login-form";
import { getAuthContext } from "@/lib/auth/session";
import { signedInHomePath } from "@/lib/auth/signed-in-home";
import { PRODUCT_NAME } from "@/lib/branding/product-name";
import { resolveLocalLoginSeed } from "@/lib/dev/local-login-accounts";
import { marketingPublicLinks } from "@/lib/marketing/public-links";
import { PRIVATE_ROBOTS } from "@/lib/seo/robots-policy";

export const metadata: Metadata = {
  title: `Sign in · ${PRODUCT_NAME}`,
  description: `Sign in to ${PRODUCT_NAME}.`,
  robots: PRIVATE_ROBOTS,
};

export default async function LoginPage() {
  const authContext = await getAuthContext().catch(() => ({
    user: null,
    clinicMembership: null,
  }));
  const home = signedInHomePath(authContext);
  if (home) {
    redirect(home);
  }

  const localLogin =
    process.env.NODE_ENV === "development"
      ? resolveLocalLoginSeed(process.env)
      : null;
  const { homeHref } = await marketingPublicLinks();

  return (
    <main className="flex flex-1 items-center justify-center bg-staff-canvas px-6 py-16">
      <div className="w-full max-w-md">
        <a
          href={homeHref}
          className="staffBackLink"
          aria-label={`Back to ${PRODUCT_NAME}`}
        >
          ← Back to {PRODUCT_NAME}
        </a>
        <div className="mt-6 w-full rounded-2xl border border-staff-line bg-staff-panel p-8 shadow-sm">
          <div className="mb-8 flex flex-col gap-2">
            <p className="flex items-center gap-2 text-sm font-semibold text-staff-brand">
              <ProductMark className="h-5 w-5" />
              {PRODUCT_NAME}
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-staff-ink">
              Sign in
            </h1>
            <p className="text-sm leading-6 text-staff-muted">
              Use your email and password to continue to {PRODUCT_NAME}.
            </p>
          </div>

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
        </div>
      </div>
    </main>
  );
}
