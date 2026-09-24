"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useActionState } from "react";

import {
  upgradeClinicPlanAction,
  type PlanUpgradeActionState,
} from "@/app/(staff)/(operator)/operator/billing-actions";
import { TransientNotice } from "@/app/(staff)/components/transient-notice";

type UpgradeFeedback = PlanUpgradeActionState & { generation: number };

const upgradeInitial: UpgradeFeedback = { generation: 0 };

async function upgradeFeedbackAction(
  previous: UpgradeFeedback,
  formData: FormData
): Promise<UpgradeFeedback> {
  const result = await upgradeClinicPlanAction(previous, formData);
  return {
    ...result,
    generation: previous.generation + 1,
  };
}

export const UPGRADE_POLL_INTERVAL_MS = 2_000;
export const UPGRADE_POLL_ATTEMPTS = 15;

export const UPGRADE_PROCESSING_MESSAGE =
  "Upgrade started. Stripe is applying Practice to the existing subscription. River will update when payment is confirmed.";

export const UPGRADE_STILL_PROCESSING_MESSAGE =
  "Stripe is still processing the upgrade. Refresh to check again.";

export const TEAM_DOWNGRADE_BLOCK_MESSAGE =
  "Team usage must be resolved by the clinic before the downgrade can be scheduled.";

export const GUIDE_SELECTION_WAITING_MESSAGE =
  "Waiting for clinic administrator to complete guide selection.";

export const GUIDE_SELECTION_COMPLETE_MESSAGE = "Guide selection complete.";

export const NO_DOWNGRADE_IN_PROGRESS_MESSAGE = "No downgrade in progress.";

export const CUSTOMER_PREPARING_DOWNGRADE_MESSAGE =
  "Customer is preparing a move to Essential.";

export function UpgradePlanForm({
  clinicId,
  canUpgradeToPractice,
  showDowngrade = false,
  downgradeEffectiveLabel = null,
  downgradeBlockedReason = null,
  openDowngradeAttemptId = null,
  scheduledPlanChange = null,
  downgradeReadiness = null,
  guidePreparation = null,
}: {
  clinicId: string;
  canUpgradeToPractice: boolean;
  showDowngrade?: boolean;
  downgradeEffectiveLabel?: string | null;
  downgradeBlockedReason?: string | null;
  openDowngradeAttemptId?: string | null;
  scheduledPlanChange?: {
    effectiveLabel: string;
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
  guidePreparation?: {
    status: "none" | "awaiting" | "confirmed";
    selectedCustom: number;
    selectedAdapted: number;
    selectedCombined: number;
  } | null;
}) {
  const router = useRouter();
  const refresh = router.refresh;
  const [state, action, pending] = useActionState(
    upgradeFeedbackAction,
    upgradeInitial
  );
  const [dismissedUpgrade, setDismissedUpgrade] = useState(0);
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
              <p>
                Essential scheduled for {scheduledPlanChange.effectiveLabel}.
              </p>
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
              <DowngradeStatusCopy
                readiness={downgradeReadiness}
                preparation={guidePreparation}
                effectiveLabel={downgradeEffectiveLabel}
              />
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
          {openDowngradeAttemptId ? (
            <p className="mt-2" role="status">
              A scheduling attempt is still open ({openDowngradeAttemptId}). The
              clinic administrator can schedule or cancel the plan change from
              Billing.
            </p>
          ) : null}
        </div>
      ) : null}
      {state.generation > dismissedUpgrade && state.error ? (
        <TransientNotice
          variant="error"
          noticeKey={`upgrade-${state.generation}`}
          onDismiss={() => setDismissedUpgrade(state.generation)}
        >
          {state.error}
        </TransientNotice>
      ) : null}
      {state.generation > dismissedUpgrade && waitingForProjection ? (
        <TransientNotice
          variant="info"
          noticeKey={`upgrade-${state.generation}`}
          onDismiss={() => setDismissedUpgrade(state.generation)}
        >
          {UPGRADE_PROCESSING_MESSAGE}
        </TransientNotice>
      ) : null}
      {state.generation > dismissedUpgrade &&
      state.accepted &&
      canUpgradeToPractice &&
      timedOut ? (
        <TransientNotice
          variant="info"
          noticeKey={`upgrade-${state.generation}-waiting`}
          onDismiss={() => setDismissedUpgrade(state.generation)}
        >
          {UPGRADE_STILL_PROCESSING_MESSAGE}
        </TransientNotice>
      ) : null}
    </section>
  );
}

function DowngradeStatusCopy({
  readiness,
  preparation,
  effectiveLabel,
}: {
  readiness: {
    ready: boolean;
    teamCurrent: number;
    teamLimit: number;
    guideCurrent: number;
    guideLimit: number;
    adaptedCurrent: number;
    adaptedLimit: number;
    combinedCurrent: number;
    combinedLimit: number;
  };
  preparation: {
    status: "none" | "awaiting" | "confirmed";
    selectedCustom: number;
    selectedAdapted: number;
    selectedCombined: number;
  } | null;
  effectiveLabel: string | null;
}) {
  const teamBlocked = readiness.teamCurrent > readiness.teamLimit;
  const status = preparation?.status ?? "none";
  return (
    <>
      {status === "none" ? <p>{NO_DOWNGRADE_IN_PROGRESS_MESSAGE}</p> : null}
      {status === "awaiting" ? (
        <>
          <p>{CUSTOMER_PREPARING_DOWNGRADE_MESSAGE}</p>
          <p>{GUIDE_SELECTION_WAITING_MESSAGE}</p>
        </>
      ) : null}
      {status === "confirmed" ? (
        <>
          <p>{GUIDE_SELECTION_COMPLETE_MESSAGE}</p>
          <p>Selected custom guides: {preparation?.selectedCustom ?? 0}</p>
          <p>
            Selected editable River templates:{" "}
            {preparation?.selectedAdapted ?? 0}
          </p>
          <p>
            Selected clinic-owned guides: {preparation?.selectedCombined ?? 0}
          </p>
        </>
      ) : null}
      {teamBlocked ? <p>{TEAM_DOWNGRADE_BLOCK_MESSAGE}</p> : null}
      <p>
        Team members: {readiness.teamCurrent} used / {readiness.teamLimit}{" "}
        allowed
      </p>
      <p>
        Custom guides: {readiness.guideCurrent} used / {readiness.guideLimit}{" "}
        allowed
      </p>
      <p>
        Editable River templates: {readiness.adaptedCurrent} used /{" "}
        {readiness.adaptedLimit} allowed
      </p>
      <p>
        Total clinic-owned guides: {readiness.combinedCurrent} used /{" "}
        {readiness.combinedLimit} allowed
      </p>
      {effectiveLabel ? <p>Paid period ends {effectiveLabel}.</p> : null}
    </>
  );
}
