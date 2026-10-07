import type { Metadata } from "next";

import { HelpFeedbackForm } from "@/app/(staff)/account/help/help-feedback-form";
import { requireStaffSession } from "@/lib/auth/require-staff-session";
import { PRODUCT_NAME } from "@/lib/branding/product-name";
import { PRIVATE_ROBOTS } from "@/lib/seo/robots-policy";
import { sanitizeHelpOriginPath } from "@/lib/support/help-feedback-fields";

export const metadata: Metadata = {
  title: `Help & feedback · ${PRODUCT_NAME}`,
  description: `Report a problem, ask a question, or suggest a feature for ${PRODUCT_NAME}.`,
  robots: PRIVATE_ROBOTS,
};

export default async function HelpFeedbackPage({
  searchParams,
}: {
  searchParams?: Promise<{ from?: string | string[] }>;
}) {
  await requireStaffSession();
  const params = searchParams ? await searchParams : {};
  const fromParam = Array.isArray(params.from) ? params.from[0] : params.from;

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-3xl flex-col gap-8">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-staff-muted">
          Account
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-staff-ink">
          Help & feedback
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-6 text-staff-muted">
          Report a problem, ask a question, or suggest a feature. Your message
          goes to the {PRODUCT_NAME} team by email.
        </p>
      </header>
      <HelpFeedbackForm originPath={sanitizeHelpOriginPath(fromParam)} />
    </div>
  );
}
