"use client";

import { useActionState, useState } from "react";

import {
  prepareClinicBillingAction,
  type PrepareBillingActionState,
} from "@/app/(staff)/(operator)/operator/billing-actions";
import {
  groupOfferQuote,
  parseOfferedAdditionalSiteQuantity,
} from "@/lib/clinics/group-commercial";

const initial: PrepareBillingActionState = {};

export function PrepareBillingForm({
  clinicId,
  plan,
  interval,
  offeredAdditionalSiteQuantity,
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
  plan: "ESSENTIAL" | "PRACTICE" | "GROUP" | null;
  interval: "MONTHLY" | "YEARLY" | null;
  offeredAdditionalSiteQuantity: number | null;
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
  const [selectedPlan, setSelectedPlan] = useState(plan ?? "ESSENTIAL");
  const [selectedInterval, setSelectedInterval] = useState(
    interval ?? "MONTHLY"
  );
  const [additionalSites, setAdditionalSites] = useState(
    offeredAdditionalSiteQuantity === null
      ? "0"
      : String(offeredAdditionalSiteQuantity)
  );
  const parsedSites = parseOfferedAdditionalSiteQuantity(additionalSites);
  const groupQuote =
    selectedPlan === "GROUP" && parsedSites !== null
      ? groupOfferQuote({
          interval: selectedInterval,
          additionalSiteQuantity: parsedSites,
        })
      : null;

  return (
    <section className="rounded-xl border border-staff-line bg-staff-panel p-5">
      <h2 className="text-base font-semibold">Billing setup</h2>
      <p className="mt-2 text-sm text-staff-muted">
        Choose the plan agreed after the demo. The clinic administrator accepts
        the Terms and completes payment. A Group offer does not grant capacity
        until payment succeeds.
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
        <form
          key={`${plan ?? "none"}-${interval ?? "none"}-${offeredAdditionalSiteQuantity ?? "none"}`}
          action={action}
          className="mt-5 flex max-w-lg flex-col gap-4"
        >
          <input type="hidden" name="clinicId" value={clinicId} />
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium" htmlFor="commercialPlan">
              Plan
            </label>
            <select
              id="commercialPlan"
              name="commercialPlan"
              value={selectedPlan}
              onChange={(event) =>
                setSelectedPlan(
                  event.target.value as "ESSENTIAL" | "PRACTICE" | "GROUP"
                )
              }
              className="staffField staffSelect"
              aria-invalid={
                state.fieldErrors?.commercialPlan ? "true" : "false"
              }
            >
              <option value="ESSENTIAL">Essential</option>
              <option value="PRACTICE">Practice</option>
              <option value="GROUP">Group</option>
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium" htmlFor="billingInterval">
              Billing
            </label>
            <select
              id="billingInterval"
              name="billingInterval"
              value={selectedInterval}
              onChange={(event) =>
                setSelectedInterval(event.target.value as "MONTHLY" | "YEARLY")
              }
              className="staffField staffSelect"
              aria-invalid={
                state.fieldErrors?.billingInterval ? "true" : "false"
              }
            >
              <option value="MONTHLY">Monthly</option>
              <option value="YEARLY">Annual</option>
            </select>
          </div>
          {selectedPlan === "GROUP" ? (
            <div className="flex flex-col gap-1.5">
              <label
                className="text-sm font-medium"
                htmlFor="offeredAdditionalSiteQuantity"
              >
                Additional Sites
              </label>
              <input
                id="offeredAdditionalSiteQuantity"
                name="offeredAdditionalSiteQuantity"
                inputMode="numeric"
                value={additionalSites}
                onChange={(event) => setAdditionalSites(event.target.value)}
                className="staffField"
                aria-invalid={
                  state.fieldErrors?.offeredAdditionalSiteQuantity
                    ? "true"
                    : "false"
                }
              />
              <p className="text-sm text-staff-muted">
                Zero is the base Group offer. This does not change purchased
                capacity.
              </p>
            </div>
          ) : null}
          {groupQuote ? (
            <div className="rounded-lg border border-staff-line bg-staff-canvas p-4 text-sm">
              <p className="font-medium">
                {groupQuote.planName} · {groupQuote.intervalLabel}
              </p>
              <ul className="mt-2 space-y-1">
                {groupQuote.detailLines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              <p className="mt-2 text-staff-muted">{groupQuote.capacityNote}</p>
            </div>
          ) : null}
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
