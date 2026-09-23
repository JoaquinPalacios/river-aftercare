"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useActionState } from "react";

import {
  keepPracticePlanAction,
  prepareClinicDowngradeAction,
  scheduleClinicPlanDowngradeAction,
  upgradeClinicPlanAction,
  type PlanDowngradeActionState,
  type PlanUpgradeActionState,
} from "@/app/(staff)/(operator)/operator/billing-actions";
import { TransientNotice } from "@/app/(staff)/components/transient-notice";

type UpgradeFeedback = PlanUpgradeActionState & { generation: number };
type DowngradeFeedback = {
  error?: string;
  notice?: "scheduled" | "kept";
  generation: number;
};

const upgradeInitial: UpgradeFeedback = { generation: 0 };
const downgradeInitial: DowngradeFeedback = { generation: 0 };

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

async function planChangeFeedbackAction(
  previous: DowngradeFeedback,
  formData: FormData
): Promise<DowngradeFeedback> {
  const intent = String(formData.get("intent") ?? "");
  const result: PlanDowngradeActionState =
    intent === "keep"
      ? await keepPracticePlanAction(previous, formData)
      : await scheduleClinicPlanDowngradeAction(previous, formData);
  return {
    error: result.error,
    notice: result.accepted
      ? intent === "keep"
        ? "kept"
        : "scheduled"
      : undefined,
    generation: previous.generation + 1,
  };
}

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

export const DOWNGRADE_PREPARED_MESSAGE =
  "Downgrade preparation started. The clinic administrator can choose guides.";

export const TEAM_DOWNGRADE_BLOCK_MESSAGE =
  "Team usage must be resolved before downgrade.";

export const GUIDE_SELECTION_REQUIRED_MESSAGE =
  "Clinic guide selection required.";

export const GUIDE_SELECTION_WAITING_MESSAGE =
  "Waiting for clinic administrator to choose guides.";

export const GUIDE_SELECTION_COMPLETE_MESSAGE = "Guide selection complete.";

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
  canPrepareDowngrade = false,
  guidePreparation = null,
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
  canPrepareDowngrade?: boolean;
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
  const [planChange, planChangeAction, planChangePending] = useActionState(
    planChangeFeedbackAction,
    downgradeInitial
  );
  const [prepareState, prepareAction, preparePending] = useActionState(
    prepareClinicDowngradeAction,
    downgradeInitial
  );
  const [dismissedPlanChange, setDismissedPlanChange] = useState(0);
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
              <DowngradeReadinessCopy
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
          {canPrepareDowngrade ? (
            <form action={prepareAction} className="mt-4">
              <input type="hidden" name="clinicId" value={clinicId} />
              <button
                type="submit"
                className="staffBtn staffBtnSecondary h-11"
                disabled={preparePending}
              >
                {preparePending ? "Preparing…" : "Prepare downgrade"}
              </button>
            </form>
          ) : null}
          {prepareState.error ? (
            <TransientNotice variant="error" noticeKey={prepareState.error}>
              {prepareState.error}
            </TransientNotice>
          ) : null}
          {canScheduleDowngrade ? (
            <form action={planChangeAction} className="mt-4">
              <input type="hidden" name="clinicId" value={clinicId} />
              <input type="hidden" name="intent" value="schedule" />
              <button
                type="submit"
                className="staffBtn staffBtnPrimary h-11"
                disabled={planChangePending}
              >
                {planChangePending ? "Scheduling…" : "Schedule downgrade"}
              </button>
            </form>
          ) : null}
          {canKeepPractice ? (
            <form action={planChangeAction} className="mt-4">
              <input type="hidden" name="clinicId" value={clinicId} />
              <input type="hidden" name="intent" value="keep" />
              <button
                type="submit"
                className="staffBtn staffBtnSecondary h-11"
                disabled={planChangePending}
              >
                {planChangePending ? "Updating…" : "Keep Practice"}
              </button>
            </form>
          ) : null}
          {planChange.generation > dismissedPlanChange && planChange.error ? (
            <TransientNotice
              variant="error"
              noticeKey={`plan-change-${planChange.generation}`}
              onDismiss={() => setDismissedPlanChange(planChange.generation)}
            >
              {planChange.error}
            </TransientNotice>
          ) : null}
          {planChange.generation > dismissedPlanChange &&
          !planChange.error &&
          planChange.notice === "scheduled" ? (
            <TransientNotice
              variant="success"
              noticeKey={`plan-change-${planChange.generation}`}
              onDismiss={() => setDismissedPlanChange(planChange.generation)}
            >
              {DOWNGRADE_SCHEDULED_MESSAGE}
            </TransientNotice>
          ) : null}
          {planChange.generation > dismissedPlanChange &&
          !planChange.error &&
          planChange.notice === "kept" ? (
            <TransientNotice
              variant="success"
              noticeKey={`plan-change-${planChange.generation}`}
              onDismiss={() => setDismissedPlanChange(planChange.generation)}
            >
              {DOWNGRADE_KEPT_MESSAGE}
            </TransientNotice>
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

function DowngradeReadinessCopy({
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
  const guidesOver =
    readiness.guideCurrent > readiness.guideLimit ||
    readiness.adaptedCurrent > readiness.adaptedLimit ||
    readiness.combinedCurrent > readiness.combinedLimit;
  const status = preparation?.status ?? "none";
  return (
    <>
      {readiness.ready ? <p>Usage is within Essential limits.</p> : null}
      {teamBlocked ? <p>{TEAM_DOWNGRADE_BLOCK_MESSAGE}</p> : null}
      {guidesOver && status === "none" ? (
        <p>{GUIDE_SELECTION_REQUIRED_MESSAGE}</p>
      ) : null}
      {guidesOver && status === "awaiting" ? (
        <p>{GUIDE_SELECTION_WAITING_MESSAGE}</p>
      ) : null}
      {guidesOver && status === "confirmed" ? (
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
      {!teamBlocked && !guidesOver && effectiveLabel ? (
        <>
          <p>
            Downgrade will take effect at the end of the current paid period:{" "}
            {effectiveLabel}
          </p>
          <p>
            Practice remains active until that date. There is no refund and no
            immediate billing change. Essential begins at the next renewal.
          </p>
        </>
      ) : null}
    </>
  );
}
