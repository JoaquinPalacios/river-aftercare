"use client";

import { useActionState } from "react";

import {
  upgradeClinicPlanAction,
  type PlanUpgradeActionState,
} from "@/app/(staff)/(operator)/operator/billing-actions";

const initial: PlanUpgradeActionState = {};

export function UpgradePlanForm({
  clinicId,
  canUpgradeToPractice,
  downgradeDeferred,
}: {
  clinicId: string;
  canUpgradeToPractice: boolean;
  downgradeDeferred: boolean;
}) {
  const [state, action, pending] = useActionState(
    upgradeClinicPlanAction,
    initial
  );

  if (!canUpgradeToPractice && !downgradeDeferred) {
    return null;
  }

  return (
    <section className="rounded-xl border border-staff-line bg-staff-panel p-5">
      <h2 className="text-base font-semibold">Plan change</h2>
      {canUpgradeToPractice ? (
        <>
          <p className="mt-2 text-sm text-staff-muted">
            Essential can move to Practice now. Stripe prorates the change and
            collects the difference. The clinic stays on the same billing
            period, and the existing subscription is updated.
          </p>
          <form action={action} className="mt-4">
            <input type="hidden" name="clinicId" value={clinicId} />
            <input type="hidden" name="targetPlan" value="PRACTICE" />
            <button
              type="submit"
              className="staffBtn staffBtnPrimary h-11"
              disabled={pending}
            >
              {pending ? "Sending upgrade…" : "Upgrade to Practice"}
            </button>
          </form>
        </>
      ) : null}
      {downgradeDeferred ? (
        <p className="mt-2 text-sm text-staff-muted" role="status">
          Practice to Essential is not available here yet. Guide and team limits
          have to be checked before a downgrade can be scheduled. Monthly and
          annual billing are not switched from this page.
        </p>
      ) : null}
      {state.error ? (
        <p className="mt-3 text-sm text-red-600" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p className="staffFormStatus mt-3" role="status">
          {state.success}
        </p>
      ) : null}
    </section>
  );
}
