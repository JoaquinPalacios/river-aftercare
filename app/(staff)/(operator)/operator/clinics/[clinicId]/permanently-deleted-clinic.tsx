"use client";

import { useActionState } from "react";
import Link from "next/link";

import { BackArrowIcon } from "@/app/(staff)/components/icons";
import { PortalBreadcrumb } from "@/app/(staff)/components/portal-breadcrumb";
import {
  retryPermanentDeletionBrandingAction,
  type ClinicStatusActionState,
} from "@/app/(staff)/(operator)/operator/clinics/[clinicId]/clinic-lifecycle-actions";

const initialState: ClinicStatusActionState = {};

export function PermanentlyDeletedClinic({
  clinicId,
  clinicName,
  clinicSlug,
  deletedLabel,
  deletedByLabel,
  billingStatus,
  commercialPlan,
  stripeCustomerRetained,
  legalAcceptanceCount,
  complimentaryEventCount,
  negotiatedOfferCount,
  cleanupRetry,
}: {
  clinicId: string;
  clinicName: string;
  clinicSlug: string;
  deletedLabel: string;
  deletedByLabel: string | null;
  billingStatus: string | null;
  commercialPlan: string | null;
  stripeCustomerRetained: boolean;
  legalAcceptanceCount: number;
  complimentaryEventCount: number;
  negotiatedOfferCount: number;
  cleanupRetry: boolean;
}) {
  const [state, action, pending] = useActionState(
    retryPermanentDeletionBrandingAction,
    initialState
  );

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-5xl flex-col gap-6">
      <header>
        <PortalBreadcrumb
          items={[
            {
              href: "/operator/clinics?activity=retired",
              label: "All Clinics",
            },
            { label: clinicName },
          ]}
        />
        <p className="mt-4 text-xs font-semibold uppercase tracking-[0.14em] text-staff-muted">
          Platform
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          {clinicName}
        </h1>
        <p className="mt-2 text-sm text-staff-muted">
          {clinicName} · {clinicSlug}
        </p>
      </header>

      <section className="rounded-xl border border-staff-line bg-staff-panel p-5">
        <h2 className="text-base font-semibold">Permanently deleted</h2>
        <p className="mt-3 text-sm">Deleted {deletedLabel}</p>
        {deletedByLabel ? (
          <p className="mt-1 text-sm text-staff-muted">By {deletedByLabel}</p>
        ) : null}
        <div className="mt-3 max-w-2xl space-y-2 text-sm text-staff-muted">
          <p>This clinic cannot be reactivated.</p>
          <p>Customer and staff access has been removed.</p>
          <p>Operational clinic content has been removed.</p>
          <p>Billing and legal audit records are retained.</p>
          <p>
            The tenant address {clinicSlug} is permanently retired and cannot be
            reused.
          </p>
        </div>
      </section>

      <section className="rounded-xl border border-staff-line bg-staff-panel p-5">
        <h2 className="text-base font-semibold">Retained history</h2>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-staff-muted">Billing status</dt>
            <dd>{billingStatus ?? "None"}</dd>
          </div>
          <div>
            <dt className="text-staff-muted">Plan</dt>
            <dd>{commercialPlan ?? "None"}</dd>
          </div>
          <div>
            <dt className="text-staff-muted">Stripe customer</dt>
            <dd>{stripeCustomerRetained ? "Retained" : "None"}</dd>
          </div>
          <div>
            <dt className="text-staff-muted">Legal acceptances</dt>
            <dd>{legalAcceptanceCount}</dd>
          </div>
          <div>
            <dt className="text-staff-muted">Complimentary history</dt>
            <dd>{complimentaryEventCount}</dd>
          </div>
          <div>
            <dt className="text-staff-muted">Negotiated offers</dt>
            <dd>{negotiatedOfferCount}</dd>
          </div>
        </dl>
      </section>

      <section className="rounded-xl border border-staff-line bg-staff-panel p-5">
        <h2 className="text-base font-semibold">Branding files</h2>
        <p className="mt-2 max-w-2xl text-sm text-staff-muted">
          Owned branding files are removed after the clinic is retired. Patient
          pages no longer serve them.
        </p>
        {cleanupRetry ? (
          <p className="mt-3 text-sm text-red-800" role="alert">
            Some branding files could not be removed. Retry branding cleanup.
          </p>
        ) : null}
        <form action={action} className="mt-4">
          <input type="hidden" name="clinicId" value={clinicId} />
          <button
            type="submit"
            className="staffBtn staffBtnSecondary"
            disabled={pending}
          >
            {pending ? "Removing branding files…" : "Retry branding cleanup"}
          </button>
          {state.error ? (
            <p className="mt-2 text-sm text-red-700" role="alert">
              {state.error}
            </p>
          ) : null}
          {state.success ? (
            <p className="mt-2 text-sm text-staff-muted" role="status">
              {state.success}
            </p>
          ) : null}
        </form>
      </section>

      <p>
        <Link
          href="/operator/clinics?activity=retired"
          className="staffBtn staffBtnQuiet gap-1 px-0"
          aria-label="Back to all clinics"
        >
          <BackArrowIcon />
          All clinics
        </Link>
      </p>
    </div>
  );
}
