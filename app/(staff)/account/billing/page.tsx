import type { Metadata } from "next";
import Link from "next/link";

import { loadBillingPageContext } from "@/app/(staff)/account/billing/billing-context";
import { ManageBillingForm } from "@/app/(staff)/account/billing/manage-billing-form";
import {
  BILLING_COMPLETE_PATH,
  BILLING_SETUP_PATH,
} from "@/lib/billing/activation-gate";
import {
  ENDED_BILLING_MESSAGE,
  RESTRICTED_BILLING_MESSAGE,
} from "@/lib/billing/billing-presentation";
import { PRODUCT_NAME } from "@/lib/branding/product-name";

export const metadata: Metadata = {
  title: `Billing · ${PRODUCT_NAME}`,
};

export default async function BillingStatusPage() {
  const context = await loadBillingPageContext();
  const view = context.view;
  const presentation = view?.presentation;
  const canManageBilling =
    view?.portalEligible === true &&
    context.membership?.role === "ADMIN" &&
    context.membership.source !== "operator_support";

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
                    presentation.kind === "active" && !presentation.attention
                      ? "success"
                      : presentation.kind === "inactive"
                        ? "inactive"
                        : "warning"
                  }
                >
                  {presentation.kind === "active" &&
                  presentation.attention === "cancel_scheduled"
                    ? "Scheduled to end"
                    : presentation.kind === "active" &&
                        presentation.attention === "past_due"
                      ? "Payment issue"
                      : presentation.kind === "active"
                        ? "Active"
                        : presentation.kind === "processing"
                          ? "Payment processing"
                          : presentation.kind === "restricted"
                            ? "Unpaid"
                            : presentation.kind === "inactive"
                              ? "Ended"
                              : view.billingLabel}
                </span>
              </dd>
            </div>
            {view.paidThroughLabel &&
            (presentation.kind === "active" ||
              presentation.kind === "restricted" ||
              presentation.kind === "inactive") ? (
              <div>
                <dt className="text-staff-muted">{view.periodLabel}</dt>
                <dd className="font-medium">{view.paidThroughLabel}</dd>
              </div>
            ) : null}
          </dl>
          {presentation.kind === "active" && presentation.attentionMessage ? (
            <p className="mt-4 text-sm" role="status">
              {presentation.attentionMessage}
            </p>
          ) : null}
          {view.scheduledPlanChange ? (
            <p className="mt-4 text-sm" role="status">
              Scheduled change:{" "}
              {view.scheduledPlanChange.operatorLines.scheduledChange}.{" "}
              {view.scheduledPlanChange.customerMessage}
            </p>
          ) : null}
          {presentation.kind === "active" &&
          !presentation.attention &&
          presentation.assistedSetup ? (
            <p className="mt-4 text-sm" role="status">
              Your Practice plan is active. We’ll help you get your River
              Aftercare setup ready.
            </p>
          ) : null}
          {presentation.kind === "restricted" ? (
            <p className="mt-4 text-sm text-staff-muted" role="status">
              {RESTRICTED_BILLING_MESSAGE}
            </p>
          ) : null}
          {presentation.kind === "inactive" ? (
            <p className="mt-4 text-sm text-staff-muted" role="status">
              {ENDED_BILLING_MESSAGE}
              {view.publicGuideRetentionLabel
                ? ` Published patient guides remain available until ${view.publicGuideRetentionLabel}.`
                : ""}
            </p>
          ) : null}
          {presentation.kind === "setup" &&
          context.membership?.role === "ADMIN" &&
          context.membership.source !== "operator_support" ? (
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
          {presentation.kind === "retry" && presentation.canRestartCheckout ? (
            <Link
              href={BILLING_SETUP_PATH}
              className="staffBtn staffBtnPrimary mt-5 inline-flex h-11 items-center"
            >
              Return to billing setup
            </Link>
          ) : null}
          {canManageBilling ? <ManageBillingForm /> : null}
          {view.portalEligible && !canManageBilling ? (
            <p className="mt-4 text-sm text-staff-muted">
              A clinic administrator can manage payment methods, invoices, and
              cancellation.
            </p>
          ) : null}
          {canManageBilling ? (
            <p className="mt-3 text-sm text-staff-muted">
              Payment methods, invoices, and cancellation are managed in Stripe.
              This page updates after Stripe confirms a change.
            </p>
          ) : null}
          {presentation.kind === "active" ||
          presentation.kind === "restricted" ||
          presentation.kind === "inactive" ||
          presentation.kind === "retry" ? (
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
              className={
                canManageBilling || presentation.attention
                  ? "staffBtn staffBtnSecondary mt-5 inline-flex h-11 items-center"
                  : "staffBtn staffBtnPrimary mt-5 inline-flex h-11 items-center"
              }
            >
              Continue
            </Link>
          ) : null}
        </section>
      )}
    </div>
  );
}
