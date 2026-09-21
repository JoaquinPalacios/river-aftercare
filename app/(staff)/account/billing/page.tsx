import type { Metadata } from "next";
import Link from "next/link";

import { loadBillingPageContext } from "@/app/(staff)/account/billing/billing-context";
import {
  BILLING_COMPLETE_PATH,
  BILLING_SETUP_PATH,
} from "@/lib/billing/activation-gate";
import { PRODUCT_NAME } from "@/lib/branding/product-name";

export const metadata: Metadata = {
  title: `Billing · ${PRODUCT_NAME}`,
};

export default async function BillingStatusPage() {
  const context = await loadBillingPageContext();
  const view = context.view;
  const presentation = view?.presentation;

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-xl flex-col gap-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-staff-muted">
          Account
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Billing</h1>
      </header>

      {!view || !presentation || presentation.kind === "support" ? (
        <section
          className="rounded-xl border border-staff-line bg-staff-panel p-5"
          role="status"
        >
          <p className="text-sm text-staff-muted">
            Billing for this clinic is arranged with River Aftercare.
          </p>
        </section>
      ) : (
        <section className="rounded-xl border border-staff-line bg-staff-panel p-5 sm:p-6">
          <h2 className="text-base font-semibold">{view.clinicName}</h2>
          <dl className="mt-4 grid gap-3 text-sm">
            <div>
              <dt className="text-staff-muted">Plan</dt>
              <dd className="font-medium">{view.planLabel}</dd>
            </div>
            <div>
              <dt className="text-staff-muted">Billing</dt>
              <dd className="font-medium">{view.intervalLabel}</dd>
            </div>
            <div>
              <dt className="text-staff-muted">Status</dt>
              <dd>
                <span
                  className="staffStatusPill"
                  data-tone={
                    presentation.kind === "active"
                      ? "success"
                      : presentation.kind === "inactive"
                        ? "inactive"
                        : "warning"
                  }
                >
                  {presentation.kind === "active"
                    ? "Active"
                    : presentation.kind === "processing"
                      ? "Payment processing"
                      : presentation.kind === "inactive"
                        ? "Not active"
                        : view.billingLabel}
                </span>
              </dd>
            </div>
          </dl>
          {presentation.kind === "active" && presentation.assistedSetup ? (
            <p className="mt-4 text-sm" role="status">
              Your Practice plan is active. We’ll help you get your River
              Aftercare setup ready.
            </p>
          ) : null}
          {presentation.kind === "setup" &&
          context.membership?.role === "ADMIN" ? (
            <Link
              href={BILLING_SETUP_PATH}
              className="staffBtn staffBtnPrimary mt-5 inline-flex h-11 items-center"
            >
              Continue billing setup
            </Link>
          ) : null}
          {presentation.kind === "processing" ? (
            <Link
              href={BILLING_COMPLETE_PATH}
              className="staffBtn staffBtnSecondary mt-5 inline-flex h-11 items-center"
            >
              View payment status
            </Link>
          ) : null}
          {presentation.kind === "retry" ? (
            <p className="mt-4 text-sm text-staff-muted" role="status">
              We haven’t confirmed payment yet. Clinic access stays closed until
              payment is confirmed.
            </p>
          ) : null}
          {presentation.kind === "inactive" ? (
            <p className="mt-4 text-sm text-staff-muted" role="status">
              Your River Aftercare subscription is not active. Clinic access
              stays closed until a subscription is active.
            </p>
          ) : null}
          {presentation.kind === "retry" && presentation.canRestartCheckout ? (
            <Link
              href={BILLING_SETUP_PATH}
              className="staffBtn staffBtnPrimary mt-5 inline-flex h-11 items-center"
            >
              Return to billing setup
            </Link>
          ) : null}
          {presentation.kind === "retry" || presentation.kind === "inactive" ? (
            <a
              href={context.contactHref}
              className="staffBtn staffBtnSecondary mt-5 inline-flex h-11 items-center"
            >
              Contact River Aftercare
            </a>
          ) : null}
          {presentation.kind === "active" ? (
            <Link
              href="/dashboard"
              className="staffBtn staffBtnPrimary mt-5 inline-flex h-11 items-center"
            >
              Continue
            </Link>
          ) : null}
        </section>
      )}
    </div>
  );
}
