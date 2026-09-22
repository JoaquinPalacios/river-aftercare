"use client";

import { useActionState } from "react";

import {
  prepareClinicBillingAction,
  type PrepareBillingActionState,
} from "@/app/(staff)/(operator)/operator/billing-actions";

const initial: PrepareBillingActionState = {};

export function PrepareBillingForm({
  clinicId,
  plan,
  interval,
  canRevise,
  blockedReason,
  planLabel,
  intervalLabel,
  entitlementLabel,
  billingLabel,
  customerLinked,
  subscriptionLinked,
  paidThroughLabel,
  cancellationScheduled,
  cancellationDateLabel,
}: {
  clinicId: string;
  plan: "ESSENTIAL" | "PRACTICE" | null;
  interval: "MONTHLY" | "YEARLY" | null;
  canRevise: boolean;
  blockedReason: string | null;
  planLabel: string;
  intervalLabel: string;
  entitlementLabel: string;
  billingLabel: string;
  customerLinked: "Yes" | "No";
  subscriptionLinked: "Yes" | "No";
  paidThroughLabel: string | null;
  cancellationScheduled: "Yes" | "No";
  cancellationDateLabel: string | null;
}) {
  const [state, action, pending] = useActionState(
    prepareClinicBillingAction,
    initial
  );

  return (
    <section className="rounded-xl border border-staff-line bg-staff-panel p-5">
      <h2 className="text-base font-semibold">Billing setup</h2>
      <p className="mt-2 text-sm text-staff-muted">
        Choose the plan agreed after the demo. The clinic administrator
        completes payment. Group is arranged directly with River Aftercare.
      </p>

      <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-staff-muted">Plan</dt>
          <dd>{planLabel}</dd>
        </div>
        <div>
          <dt className="text-staff-muted">Billing</dt>
          <dd>{intervalLabel}</dd>
        </div>
        <div>
          <dt className="text-staff-muted">Entitlement</dt>
          <dd>{entitlementLabel}</dd>
        </div>
        <div>
          <dt className="text-staff-muted">Billing state</dt>
          <dd>{billingLabel}</dd>
        </div>
        <div>
          <dt className="text-staff-muted">Stripe customer</dt>
          <dd>{customerLinked}</dd>
        </div>
        <div>
          <dt className="text-staff-muted">Stripe subscription</dt>
          <dd>{subscriptionLinked}</dd>
        </div>
        <div>
          <dt className="text-staff-muted">Paid through</dt>
          <dd>{paidThroughLabel ?? "Not available"}</dd>
        </div>
        <div>
          <dt className="text-staff-muted">Cancellation scheduled</dt>
          <dd>
            {cancellationScheduled}
            {cancellationDateLabel ? ` · ${cancellationDateLabel}` : ""}
          </dd>
        </div>
      </dl>

      {canRevise ? (
        <form action={action} className="mt-5 flex max-w-lg flex-col gap-4">
          <input type="hidden" name="clinicId" value={clinicId} />
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium" htmlFor="commercialPlan">
              Plan
            </label>
            <select
              id="commercialPlan"
              name="commercialPlan"
              defaultValue={plan ?? "ESSENTIAL"}
              className="staffField staffSelect"
              aria-invalid={
                state.fieldErrors?.commercialPlan ? "true" : "false"
              }
            >
              <option value="ESSENTIAL">Essential</option>
              <option value="PRACTICE">Practice</option>
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium" htmlFor="billingInterval">
              Billing
            </label>
            <select
              id="billingInterval"
              name="billingInterval"
              defaultValue={interval ?? "MONTHLY"}
              className="staffField staffSelect"
              aria-invalid={
                state.fieldErrors?.billingInterval ? "true" : "false"
              }
            >
              <option value="MONTHLY">Monthly</option>
              <option value="YEARLY">Annual</option>
            </select>
          </div>
          {state.error ? (
            <p className="text-sm text-red-600" role="alert">
              {state.error}
            </p>
          ) : null}
          {state.success ? (
            <p className="staffFormStatus" role="status">
              {state.success}
            </p>
          ) : null}
          <button
            type="submit"
            className="staffBtn staffBtnPrimary h-11 w-fit"
            disabled={pending}
          >
            {pending ? "Preparing…" : "Prepare billing"}
          </button>
        </form>
      ) : (
        <p className="mt-4 text-sm text-staff-muted" role="status">
          {blockedReason}
        </p>
      )}
    </section>
  );
}
