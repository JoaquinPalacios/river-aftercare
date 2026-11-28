import type { Metadata } from "next";
import Link from "next/link";

import { loadBillingPageContext } from "@/app/(staff)/account/billing/billing-context";
import { PaymentStatusRefresh } from "@/app/(staff)/account/billing/complete/payment-status-refresh";
import {
  BILLING_COMPLETE_PATH,
  BILLING_SETUP_PATH,
  BILLING_STATUS_PATH,
} from "@/lib/billing/activation-gate";
import {
  customerBillingStatusLabel,
  customerBillingStatusPillTone,
  customerBillingStatusTone,
  paymentConfirmationHeading,
  processingFollowUp,
  RESTRICTED_BILLING_MESSAGE,
} from "@/lib/billing/billing-presentation";
import { canViewCommercialBillingNotices } from "@/lib/billing/notices/permissions";
import { PRODUCT_NAME } from "@/lib/branding/product-name";

export const metadata: Metadata = {
  title: `Payment · ${PRODUCT_NAME}`,
};

export default async function BillingCompletePage() {
  const context = await loadBillingPageContext();
  const view = context.view;
  const presentation = view?.presentation;

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-xl flex-col gap-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-staff-muted">
          Account
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Payment</h1>
      </header>

      {!view || !presentation || presentation.kind === "support" ? (
        <p className="text-sm text-staff-muted" role="status">
          We couldn’t show a billing status for this account. Contact River
          Aftercare and we’ll help you continue.
        </p>
      ) : presentation.kind === "active" ? (
        <section
          className="rounded-xl border border-staff-line bg-staff-panel p-5 sm:p-6"
          role="status"
        >
          <ActivePaymentConfirmation
            view={view}
            presentation={presentation}
            showCommercialDetail={canViewCommercialBillingNotices({
              role: context.membership?.role ?? null,
              source: context.membership?.source,
            })}
          />
        </section>
      ) : presentation.kind === "processing" ? (
        <section
          className="rounded-xl border border-staff-line bg-staff-panel p-5 sm:p-6"
          role="status"
          aria-live="polite"
        >
          <p className="staffStatusPill" data-tone="warning">
            {processingFollowUp(presentation.phase).label}
          </p>
          <h2 className="mt-4 text-lg font-semibold">
            {processingFollowUp(presentation.phase).label}
          </h2>
          <p className="mt-2 text-sm text-staff-muted">
            {processingFollowUp(presentation.phase).message}
          </p>
          {presentation.phase === "complete_payment" ? (
            <Link
              href={BILLING_SETUP_PATH}
              className="staffBtn staffBtnPrimary mt-5 inline-flex h-11 items-center"
            >
              Continue to secure payment
            </Link>
          ) : (
            <>
              <div className="mt-4">
                <PaymentStatusRefresh enabled />
              </div>
              <Link
                href={BILLING_COMPLETE_PATH}
                className="staffBtn staffBtnSecondary mt-4 inline-flex h-11 items-center"
              >
                Refresh status
              </Link>
            </>
          )}
        </section>
      ) : presentation.kind === "inactive" ? (
        <section
          className="rounded-xl border border-staff-line bg-staff-panel p-5 sm:p-6"
          role="status"
        >
          <p className="staffStatusPill" data-tone="inactive">
            Ended
          </p>
          <h2 className="mt-4 text-lg font-semibold">
            Your River Aftercare subscription is not active.
          </h2>
          <p className="mt-2 text-sm text-staff-muted">
            Clinic access stays closed until a subscription is active. Contact
            River Aftercare if you need help continuing.
          </p>
          <a
            href={context.contactHref}
            className="staffBtn staffBtnSecondary mt-5 inline-flex h-11 items-center"
          >
            Contact River Aftercare
          </a>
        </section>
      ) : presentation.kind === "restricted" ? (
        <section
          className="rounded-xl border border-staff-line bg-staff-panel p-5 sm:p-6"
          role="status"
        >
          <p className="staffStatusPill" data-tone="error">
            Payment required
          </p>
          <h2 className="mt-4 text-lg font-semibold">
            Payment needs attention
          </h2>
          <p className="mt-2 text-sm text-staff-muted">
            {RESTRICTED_BILLING_MESSAGE}
          </p>
          <Link
            href={BILLING_STATUS_PATH}
            className="staffBtn staffBtnPrimary mt-5 inline-flex h-11 items-center"
          >
            Review billing
          </Link>
        </section>
      ) : presentation.kind === "retry" ? (
        <section
          className="rounded-xl border border-staff-line bg-staff-panel p-5 sm:p-6"
          role="status"
        >
          <h2 className="text-lg font-semibold">Payment needs another look</h2>
          <p className="mt-2 text-sm text-staff-muted">
            We haven’t confirmed payment yet. If you closed Stripe before
            finishing, return to billing setup. If you already submitted
            payment, you can leave this page and we’ll keep processing it.
          </p>
          {presentation.canRestartCheckout ? (
            <Link
              href={BILLING_SETUP_PATH}
              className="staffBtn staffBtnPrimary mt-5 inline-flex h-11 items-center"
            >
              Return to billing setup
            </Link>
          ) : (
            <a
              href={context.contactHref}
              className="staffBtn staffBtnSecondary mt-5 inline-flex h-11 items-center"
            >
              Contact River Aftercare
            </a>
          )}
        </section>
      ) : (
        <section
          className="rounded-xl border border-staff-line bg-staff-panel p-5"
          role="status"
        >
          <p className="text-sm">
            Payment setup wasn’t completed. Your details have been saved.
          </p>
          <Link
            href={BILLING_SETUP_PATH}
            className="staffBtn staffBtnPrimary mt-4 inline-flex h-11 items-center"
          >
            Return to billing setup
          </Link>
        </section>
      )}

      <Link
        href={BILLING_STATUS_PATH}
        className="text-sm font-medium text-staff-brand"
      >
        Billing status
      </Link>
    </div>
  );
}

function ActivePaymentConfirmation({
  view,
  presentation,
  showCommercialDetail,
}: {
  view: NonNullable<Awaited<ReturnType<typeof loadBillingPageContext>>["view"]>;
  presentation: Extract<
    NonNullable<
      Awaited<ReturnType<typeof loadBillingPageContext>>["view"]
    >["presentation"],
    { kind: "active" }
  >;
  showCommercialDetail: boolean;
}) {
  const label = customerBillingStatusLabel({
    presentation,
    complimentaryLabel: view.complimentary?.accessLabel ?? null,
    showCommercialDetail,
    billingLabel: view.billingLabel,
  });
  const tone = customerBillingStatusPillTone(
    customerBillingStatusTone({ label, presentation })
  );
  const trialCopy =
    presentation.trial?.message && presentation.attention !== "cancel_scheduled"
      ? presentation.trial.message
      : null;

  return (
    <>
      <p className="staffStatusPill" data-tone={tone}>
        {label}
      </p>
      <h2 className="mt-4 text-lg font-semibold">
        {paymentConfirmationHeading(presentation)}
      </h2>
      <p className="mt-2 text-sm text-staff-muted">
        {presentation.planName} · {presentation.intervalLabel}
      </p>
      {trialCopy ? <p className="mt-3 text-sm">{trialCopy}</p> : null}
      {presentation.attentionMessage ? (
        <p className="mt-3 text-sm">{presentation.attentionMessage}</p>
      ) : trialCopy ? null : presentation.assistedSetup ? (
        <p className="mt-3 text-sm">
          Your Practice plan is active. We’ll help you get your River Aftercare
          setup ready.
        </p>
      ) : (
        <p className="mt-3 text-sm text-staff-muted">
          You can continue into your clinic and start setup.
        </p>
      )}
      <Link
        href="/dashboard"
        className="staffBtn staffBtnPrimary mt-5 inline-flex h-11 items-center"
      >
        Go to dashboard
      </Link>
    </>
  );
}
