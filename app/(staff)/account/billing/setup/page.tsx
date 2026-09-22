import type { Metadata } from "next";
import Link from "next/link";

import { BillingSetupForm } from "@/app/(staff)/account/billing/setup/billing-setup-form";
import { loadBillingPageContext } from "@/app/(staff)/account/billing/billing-context";
import {
  BILLING_COMPLETE_PATH,
  BILLING_STATUS_PATH,
} from "@/lib/billing/activation-gate";
import { AU_REGION_OPTIONS } from "@/lib/billing/billing-identity";
import { billingSetupCancelMessage } from "@/lib/billing/billing-presentation";
import { PRODUCT_NAME } from "@/lib/branding/product-name";

export const metadata: Metadata = {
  title: `Billing setup · ${PRODUCT_NAME}`,
};

export default async function BillingSetupPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string }>;
}) {
  const context = await loadBillingPageContext();
  const params = await searchParams;
  const cancelMessage = billingSetupCancelMessage(params.checkout);
  const membership = context.membership;
  const view = context.view;

  return (
    <div className="staffBillingSetup mx-auto flex w-full min-w-0 max-w-xl flex-col gap-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-staff-muted">
          Account
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Billing setup
        </h1>
      </header>

      {!membership || membership.source === "operator_support" ? (
        <p className="text-sm text-staff-muted" role="status">
          Clinic administrators complete payment after River Aftercare prepares
          the clinic.
        </p>
      ) : !view || view.presentation.kind === "support" ? (
        <p className="text-sm text-staff-muted" role="status">
          Billing for this clinic is arranged with River Aftercare. No online
          payment is required from this page.
        </p>
      ) : view.presentation.kind === "active" ? (
        <ActiveBilling view={view} />
      ) : view.presentation.kind === "inactive" ? (
        <InactiveBilling contactHref={context.contactHref} />
      ) : view.presentation.kind === "processing" ||
        view.presentation.kind === "retry" ? (
        <ProcessingBilling view={view} />
      ) : membership.role !== "ADMIN" ? (
        <section className="rounded-xl border border-staff-line bg-staff-panel p-5">
          <PlanSummary view={view} />
          <p className="mt-4 text-sm text-staff-muted" role="status">
            A clinic administrator needs to complete billing before the clinic
            can use River Aftercare.
          </p>
        </section>
      ) : view.summary ? (
        <BillingSetupForm
          clinicName={view.clinicName}
          planName={view.summary.planName}
          priceLabel={view.summary.priceLabel}
          annualNote={view.summary.annualNote}
          contactHref={context.contactHref}
          termsHref={context.termsHref}
          privacyHref={context.privacyHref}
          regions={AU_REGION_OPTIONS}
          cancelMessage={cancelMessage}
          defaults={{
            legalEntityName: view.identity?.legalEntityName ?? "",
            tradingName: view.identity?.tradingName ?? view.clinicName,
            billingContactName: view.identity?.billingContactName ?? "",
            billingEmail: view.identity?.billingEmail ?? "",
            addressLine1: view.identity?.addressLine1 ?? "",
            addressLine2: view.identity?.addressLine2 ?? "",
            city: view.identity?.city ?? "",
            region: view.identity?.region ?? "",
            postalCode: view.identity?.postalCode ?? "",
            country: view.identity?.country || "AU",
            businessNumberKind: view.identity?.businessNumberKind ?? "abn",
            abn: view.identity?.abn ?? "",
            acn: view.identity?.acn ?? "",
          }}
        />
      ) : (
        <p className="text-sm text-staff-muted" role="status">
          This clinic’s plan can’t be paid online. Contact River Aftercare.
        </p>
      )}
    </div>
  );
}

function PlanSummary({
  view,
}: {
  view: NonNullable<Awaited<ReturnType<typeof loadBillingPageContext>>["view"]>;
}) {
  return (
    <>
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-staff-muted">
        {view.clinicName}
      </p>
      <h2 className="mt-3 text-lg font-semibold">Your River Aftercare plan</h2>
      <p className="mt-3 text-xl font-semibold">
        {view.summary?.planName ?? view.planLabel}
      </p>
      <p className="mt-1 text-sm">{view.summary?.priceLabel}</p>
      {view.summary?.annualNote ? (
        <p className="mt-1 text-sm text-staff-muted">
          {view.summary.annualNote}
        </p>
      ) : null}
    </>
  );
}

function ProcessingBilling({
  view,
}: {
  view: NonNullable<Awaited<ReturnType<typeof loadBillingPageContext>>["view"]>;
}) {
  return (
    <section
      className="rounded-xl border border-staff-line bg-staff-panel p-5"
      role="status"
    >
      <PlanSummary view={view} />
      <p className="mt-4 text-sm">
        {view.presentation.kind === "retry"
          ? "We haven’t confirmed payment yet. If you already submitted payment, you can leave this page and we’ll keep processing it."
          : "Payment processing. Your payment details have been received. We’ll activate your River Aftercare subscription once payment is confirmed."}
      </p>
      <Link
        href={BILLING_COMPLETE_PATH}
        className="staffBtn staffBtnSecondary mt-4 inline-flex h-11 items-center"
      >
        View payment status
      </Link>
    </section>
  );
}

function InactiveBilling({ contactHref }: { contactHref: string }) {
  return (
    <section
      className="rounded-xl border border-staff-line bg-staff-panel p-5"
      role="status"
    >
      <p className="staffStatusPill" data-tone="inactive">
        Not active
      </p>
      <h2 className="mt-4 text-lg font-semibold">
        Your River Aftercare subscription is not active.
      </h2>
      <p className="mt-2 text-sm text-staff-muted">
        Clinic access stays closed until a subscription is active. Contact River
        Aftercare if you need help continuing.
      </p>
      <a
        href={contactHref}
        className="staffBtn staffBtnSecondary mt-4 inline-flex h-11 items-center"
      >
        Contact River Aftercare
      </a>
    </section>
  );
}

function ActiveBilling({
  view,
}: {
  view: NonNullable<Awaited<ReturnType<typeof loadBillingPageContext>>["view"]>;
}) {
  const assisted =
    view.presentation.kind === "active" && view.presentation.assistedSetup;
  return (
    <section
      className="rounded-xl border border-staff-line bg-staff-panel p-5"
      role="status"
    >
      <p className="text-sm font-medium">
        Your River Aftercare subscription is active.
      </p>
      {assisted ? (
        <p className="mt-2 text-sm text-staff-muted">
          Your Practice plan is active. We’ll help you get your River Aftercare
          setup ready.
        </p>
      ) : null}
      <Link
        href="/dashboard"
        className="staffBtn staffBtnPrimary mt-4 inline-flex h-11 items-center"
      >
        Continue
      </Link>
      <Link
        href={BILLING_STATUS_PATH}
        className="mt-3 block text-sm font-medium text-staff-brand"
      >
        Billing status
      </Link>
    </section>
  );
}
