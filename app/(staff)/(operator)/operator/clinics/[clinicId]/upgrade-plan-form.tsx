"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useActionState } from "react";

import {
  keepPracticePlanAction,
  scheduleClinicPlanDowngradeAction,
  upgradeClinicPlanAction,
  type PlanDowngradeActionState,
  type PlanUpgradeActionState,
} from "@/app/(staff)/(operator)/operator/billing-actions";

const initial: PlanUpgradeActionState = {};
const downgradeInitial: PlanDowngradeActionState = {};

export const DOWNGRADE_SCHEDULED_MESSAGE =
  "Downgrade scheduled. Practice stays active until the date below.";

export const DOWNGRADE_KEPT_MESSAGE =
  "Scheduled downgrade removed. This clinic stays on Practice.";

export const UPGRADE_POLL_INTERVAL_MS = 2_000;
export const UPGRADE_POLL_ATTEMPTS = 15;

export const UPGRADE_PROCESSING_MESSAGE =
  "Upgrade started. Stripe is applying Practice to the existing subscription. River will update when payment is confirmed.";

export const UPGRADE_STILL_PROCESSING_MESSAGE =
  "Stripe is still processing the upgrade. Refresh to check again.";

export function UpgradePlanForm({
  clinicId,
  canUpgradeToPractice,
  showDowngrade = false,
  canScheduleDowngrade = false,
  canKeepPractice = false,
  downgradeEffectiveLabel = null,
  downgradeBlockedReason = null,
  scheduledPlanChange = null,
  downgradeReadiness = null,
}: {
  clinicId: string;
  canUpgradeToPractice: boolean;
  showDowngrade?: boolean;
  canScheduleDowngrade?: boolean;
  canKeepPractice?: boolean;
  downgradeEffectiveLabel?: string | null;
  downgradeBlockedReason?: string | null;
  scheduledPlanChange?: {
    operatorLines: {
      plan: string;
      scheduledChange: string;
      currentAccess: string;
    };
  } | null;
  downgradeReadiness?: {
    ready: boolean;
    teamCurrent: number;
    teamLimit: number;
    guideCurrent: number;
    guideLimit: number;
    adaptedCurrent: number;
    adaptedLimit: number;
    combinedCurrent: number;
    combinedLimit: number;
  } | null;
}) {
  const router = useRouter();
  const refresh = router.refresh;
  const [state, action, pending] = useActionState(
    upgradeClinicPlanAction,
    initial
  );
  const [downgradeState, downgradeAction, downgradePending] = useActionState(
    scheduleClinicPlanDowngradeAction,
    downgradeInitial
  );
  const [keepState, keepAction, keepPending] = useActionState(
    keepPracticePlanAction,
    downgradeInitial
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

  if (!canUpgradeToPractice && !showDowngrade) {
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
      {showDowngrade ? (
        <div className="mt-4 text-sm leading-6 text-staff-muted">
          <p className="font-medium text-staff-ink">Practice → Essential</p>
          {scheduledPlanChange ? (
            <div role="status">
              <p>Plan: {scheduledPlanChange.operatorLines.plan}</p>
              <p>
                Scheduled change:{" "}
                {scheduledPlanChange.operatorLines.scheduledChange}
              </p>
              <p>
                Current access:{" "}
                {scheduledPlanChange.operatorLines.currentAccess}
              </p>
              <p>
                Practice remains active until that date. Essential has not
                started.
              </p>
            </div>
          ) : downgradeReadiness ? (
            <div role="status">
              <p>
                {downgradeReadiness.ready
                  ? "Usage is within Essential limits."
                  : "Not ready to schedule."}
              </p>
              <p>
                Team members: {downgradeReadiness.teamCurrent} used /{" "}
                {downgradeReadiness.teamLimit} allowed
              </p>
              <p>
                Custom guides: {downgradeReadiness.guideCurrent} used /{" "}
                {downgradeReadiness.guideLimit} allowed
              </p>
              <p>
                Editable River templates: {downgradeReadiness.adaptedCurrent}{" "}
                used / {downgradeReadiness.adaptedLimit} allowed
              </p>
              <p>
                Total clinic-owned guides: {downgradeReadiness.combinedCurrent}{" "}
                used / {downgradeReadiness.combinedLimit} allowed
              </p>
              {downgradeReadiness.ready && downgradeEffectiveLabel ? (
                <>
                  <p>
                    Downgrade will take effect at the end of the current paid
                    period: {downgradeEffectiveLabel}
                  </p>
                  <p>
                    Practice remains active until that date. There is no refund
                    and no immediate billing change. Essential begins at the
                    next renewal.
                  </p>
                </>
              ) : null}
              {!downgradeReadiness.ready ? (
                <p>
                  Reduce usage or grant a persistent extra before scheduling.
                  Nothing is removed automatically.
                </p>
              ) : null}
            </div>
          ) : (
            <p>
              Guide and team limits have to be checked before a downgrade can be
              scheduled.
            </p>
          )}
          {downgradeBlockedReason ? (
            <p className="mt-2" role="status">
              {downgradeBlockedReason}
            </p>
          ) : null}
          {canScheduleDowngrade ? (
            <form action={downgradeAction} className="mt-4">
              <input type="hidden" name="clinicId" value={clinicId} />
              <button
                type="submit"
                className="staffBtn staffBtnPrimary h-11"
                disabled={downgradePending}
              >
                {downgradePending ? "Scheduling…" : "Schedule downgrade"}
              </button>
            </form>
          ) : null}
          {canKeepPractice ? (
            <form action={keepAction} className="mt-4">
              <input type="hidden" name="clinicId" value={clinicId} />
              <button
                type="submit"
                className="staffBtn staffBtnSecondary h-11"
                disabled={keepPending}
              >
                {keepPending ? "Updating…" : "Keep Practice"}
              </button>
            </form>
          ) : null}
          {downgradeState.error ? (
            <p className="mt-3 text-sm text-red-600" role="alert">
              {downgradeState.error}
            </p>
          ) : null}
          {downgradeState.accepted ? (
            <p className="staffFormStatus mt-3" role="status">
              {DOWNGRADE_SCHEDULED_MESSAGE}
            </p>
          ) : null}
          {keepState.error ? (
            <p className="mt-3 text-sm text-red-600" role="alert">
              {keepState.error}
            </p>
          ) : null}
          {keepState.accepted ? (
            <p className="staffFormStatus mt-3" role="status">
              {DOWNGRADE_KEPT_MESSAGE}
            </p>
          ) : null}
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
