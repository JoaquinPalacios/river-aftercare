"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useActionState } from "react";

import {
  upgradeClinicPlanAction,
  type PlanUpgradeActionState,
} from "@/app/(staff)/(operator)/operator/billing-actions";

const initial: PlanUpgradeActionState = {};

export const UPGRADE_POLL_INTERVAL_MS = 2_000;
export const UPGRADE_POLL_ATTEMPTS = 15;

export const UPGRADE_PROCESSING_MESSAGE =
  "Upgrade started. Stripe is applying Practice to the existing subscription. River will update when payment is confirmed.";

export const UPGRADE_STILL_PROCESSING_MESSAGE =
  "Stripe is still processing the upgrade. Refresh to check again.";

export function UpgradePlanForm({
  clinicId,
  canUpgradeToPractice,
  downgradeDeferred,
  downgradeReadiness = null,
}: {
  clinicId: string;
  canUpgradeToPractice: boolean;
  downgradeDeferred: boolean;
  downgradeReadiness?: {
    ready: boolean;
    teamCurrent: number;
    teamLimit: number;
    guideCurrent: number;
    guideLimit: number;
  } | null;
}) {
  const router = useRouter();
  const refresh = router.refresh;
  const [state, action, pending] = useActionState(
    upgradeClinicPlanAction,
    initial
  );
  const [timeoutFor, setTimeoutFor] = useState<number | null>(null);
  const timedOut = state.startedAt != null && timeoutFor === state.startedAt;
  const waitingForProjection =
    Boolean(state.accepted) && canUpgradeToPractice && !timedOut;

  useEffect(() => {
    if (!state.accepted || !canUpgradeToPractice || state.startedAt == null) {
      return;
    }

    let attempts = 0;
    let timer = 0;
    let cancelled = false;
    const startedAt = state.startedAt;

    const tick = () => {
      if (cancelled) {
        return;
      }
      attempts += 1;
      refresh();
      if (attempts >= UPGRADE_POLL_ATTEMPTS) {
        setTimeoutFor(startedAt);
        return;
      }
      timer = window.setTimeout(tick, UPGRADE_POLL_INTERVAL_MS);
    };

    timer = window.setTimeout(tick, UPGRADE_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [state.accepted, state.startedAt, canUpgradeToPractice, refresh]);

  if (!canUpgradeToPractice && !downgradeDeferred) {
    return null;
  }

  const upgrading = pending || waitingForProjection;

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
              disabled={upgrading}
            >
              {upgrading ? "Upgrading…" : "Upgrade to Practice"}
            </button>
          </form>
        </>
      ) : null}
      {downgradeDeferred ? (
        <div className="mt-4 text-sm leading-6 text-staff-muted" role="status">
          <p className="font-medium text-staff-ink">Practice → Essential</p>
          {downgradeReadiness ? (
            <>
              <p>
                {downgradeReadiness.ready
                  ? "Usage is within Essential limits."
                  : "Not ready"}
              </p>
              <p>
                Custom guides: {downgradeReadiness.guideCurrent} /{" "}
                {downgradeReadiness.guideLimit}
              </p>
              <p>
                Team members: {downgradeReadiness.teamCurrent} /{" "}
                {downgradeReadiness.teamLimit}
              </p>
            </>
          ) : (
            <p>
              Guide and team limits have to be checked before a downgrade can be
              scheduled.
            </p>
          )}
          <p>Downgrade scheduling is not available yet.</p>
        </div>
      ) : null}
      {state.error ? (
        <p className="mt-3 text-sm text-red-600" role="alert">
          {state.error}
        </p>
      ) : null}
      {waitingForProjection ? (
        <p className="staffFormStatus mt-3" role="status">
          {UPGRADE_PROCESSING_MESSAGE}
        </p>
      ) : null}
      {state.accepted && canUpgradeToPractice && timedOut ? (
        <p className="staffFormStatus mt-3" role="status">
          {UPGRADE_STILL_PROCESSING_MESSAGE}
        </p>
      ) : null}
    </section>
  );
}
