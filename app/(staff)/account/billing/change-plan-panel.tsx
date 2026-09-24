"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { useActionState } from "react";

import {
  beginClinicPlanDowngradeAction,
  cancelClinicPlanChangeAction,
  keepPracticeAction,
  scheduleClinicPlanDowngradeAction,
  type PlanChangeActionState,
} from "@/app/(staff)/account/billing/actions";
import { PendingSubmitButton } from "@/app/(staff)/components/pending-submit-button";
import { TransientNotice } from "@/app/(staff)/components/transient-notice";

export const KEEP_PRACTICE_NOTICE =
  "Your downgrade was cancelled. Your clinic will stay on Practice.";

export const CANCEL_PLAN_CHANGE_NOTICE =
  "Plan change cancelled. Your clinic will stay on Practice.";

export function scheduledDowngradeNotice(effectiveLabel: string): string {
  return `Downgrade scheduled. Practice stays active until ${effectiveLabel}.`;
}

type PlanChangeFeedback = PlanChangeActionState & { generation: number };

const initialFeedback: PlanChangeFeedback = { generation: 0 };

async function planChangeFeedbackAction(
  previous: PlanChangeFeedback,
  formData: FormData
): Promise<PlanChangeFeedback> {
  const intent = String(formData.get("intent") ?? "");
  const result =
    intent === "begin"
      ? await beginClinicPlanDowngradeAction(previous, formData)
      : intent === "keep"
        ? await keepPracticeAction(previous, formData)
        : intent === "cancel"
          ? await cancelClinicPlanChangeAction(previous, formData)
          : await scheduleClinicPlanDowngradeAction(previous, formData);
  return {
    error: result.error,
    notice: result.notice,
    effectiveLabel: result.effectiveLabel,
    generation: previous.generation + 1,
  };
}

export type ChangePlanPhase = "entry" | "review" | "scheduled";

export function ChangePlanPanel({
  phase,
  canAct,
  intervalLabel,
  essentialPriceLabel,
  effectiveLabel,
  teamCurrent,
  teamLimit,
  guidesFit,
  combinedCurrent,
  combinedLimit,
  preparationStatus,
  selectedCombined,
  scheduleReady,
  blockedMessage,
  canCancelPreparation,
  scheduledEffectiveLabel,
  guideEditor,
}: {
  phase: ChangePlanPhase;
  canAct: boolean;
  intervalLabel: string;
  essentialPriceLabel: string;
  effectiveLabel: string | null;
  teamCurrent: number;
  teamLimit: number;
  guidesFit: boolean;
  combinedCurrent: number;
  combinedLimit: number;
  preparationStatus: "none" | "awaiting" | "confirmed";
  selectedCombined: number;
  scheduleReady: boolean;
  blockedMessage: string | null;
  canCancelPreparation: boolean;
  scheduledEffectiveLabel?: string | null;
  guideEditor?: ReactNode;
}) {
  const [feedback, action, pending] = useActionState(
    planChangeFeedbackAction,
    initialFeedback
  );
  const [dismissed, setDismissed] = useState(0);
  const notice = feedback.generation > dismissed ? noticeCopy(feedback) : null;
  const teamBlocked = teamCurrent > teamLimit;
  const selectionConfirmed = preparationStatus === "confirmed";
  const retainedCombined = selectionConfirmed
    ? Math.max(0, combinedCurrent - selectedCombined)
    : 0;
  const activeCombined = guidesFit
    ? combinedCurrent
    : selectionConfirmed
      ? selectedCombined
      : null;
  const dateLabel = scheduledEffectiveLabel ?? effectiveLabel;

  return (
    <div className="mt-5 border-t border-staff-line pt-5" data-phase={phase}>
      <h3 className="text-sm font-semibold">
        {phase === "scheduled" ? "Essential scheduled" : "Change plan"}
      </h3>
      {phase === "entry" ? (
        <div className="mt-3 max-w-xl text-sm leading-6">
          <p>Current: Practice</p>
          <p>
            Essential · {essentialPriceLabel} · {intervalLabel}
          </p>
          {canAct ? (
            <form
              action={action}
              className="mt-4"
              aria-busy={pending || undefined}
            >
              <input type="hidden" name="intent" value="begin" />
              <PendingSubmitButton
                label="Review downgrade"
                pendingLabel="Preparing…"
                className="staffBtn staffBtnPrimary h-11 w-full sm:w-auto"
                disabled={pending}
              />
            </form>
          ) : null}
        </div>
      ) : null}
      {phase === "scheduled" ? (
        <div className="mt-3 max-w-xl text-sm leading-6" role="status">
          <p>
            Your Practice plan remains active until{" "}
            {dateLabel ?? "the end of this paid period"}.
          </p>
          <p>Essential begins at your next renewal.</p>
          <dl className="mt-4 grid gap-3">
            <div>
              <dt className="text-staff-muted">Current plan</dt>
              <dd className="font-medium">Practice</dd>
            </div>
            <div>
              <dt className="text-staff-muted">Scheduled plan</dt>
              <dd className="font-medium">Essential</dd>
            </div>
            <div>
              <dt className="text-staff-muted">Effective</dt>
              <dd className="font-medium">{dateLabel ?? "Next renewal"}</dd>
            </div>
          </dl>
          {canAct ? (
            <form
              action={action}
              className="mt-4"
              aria-busy={pending || undefined}
            >
              <input type="hidden" name="intent" value="keep" />
              <PendingSubmitButton
                label="Keep Practice"
                pendingLabel="Keeping Practice…"
                className="staffBtn staffBtnSecondary h-11 w-full sm:w-auto"
                disabled={pending}
              />
            </form>
          ) : null}
        </div>
      ) : null}
      {phase === "review" ? (
        <div className="mt-3 max-w-xl text-sm leading-6">
          <p className="font-medium text-staff-ink">Practice → Essential</p>
          {dateLabel ? (
            <>
              <p>Essential will begin on {dateLabel}.</p>
              <p>Your Practice plan remains active until then.</p>
            </>
          ) : (
            <p>Essential will begin at the end of the current paid period.</p>
          )}
          <p>There is no immediate refund or billing change.</p>
          <ol className="mt-4 grid gap-4">
            <li>
              <p className="font-medium text-staff-ink">Team</p>
              {teamBlocked ? (
                <>
                  <p>Team changes required</p>
                  <p>
                    Essential includes {teamLimit} team places. Your clinic
                    currently uses {teamCurrent}.
                  </p>
                  <p>
                    Deactivate team members or cancel pending invitations before
                    scheduling the downgrade.
                  </p>
                  <Link
                    href="/practice"
                    className="staffBtn staffBtnSecondary mt-2 inline-flex h-11 items-center"
                  >
                    Manage team
                  </Link>
                </>
              ) : (
                <p>
                  {teamCurrent} of {teamLimit} places
                </p>
              )}
            </li>
            <li>
              <p className="font-medium text-staff-ink">Guides</p>
              {guidesFit ? (
                <>
                  <p>Guides ready</p>
                  <p>All current clinic-owned guides fit within Essential.</p>
                </>
              ) : selectionConfirmed ? (
                <>
                  <p>Guide selection confirmed</p>
                  <p>
                    {selectedCombined} of {combinedLimit} clinic-owned guides
                    will stay active
                  </p>
                  <p>{retainedCombined} will be retained for 60 days</p>
                </>
              ) : (
                <p>Choose which guides will stay active on Essential.</p>
              )}
              {guideEditor}
            </li>
            <li>
              <p className="font-medium text-staff-ink">Review</p>
              <p>
                {dateLabel
                  ? `Essential begins ${dateLabel}`
                  : "Essential begins at the next renewal"}
              </p>
              <p>No immediate billing change</p>
            </li>
          </ol>
          <dl className="mt-4 grid gap-3">
            <div>
              <dt className="text-staff-muted">Current plan</dt>
              <dd className="font-medium">Practice</dd>
            </div>
            <div>
              <dt className="text-staff-muted">New plan</dt>
              <dd className="font-medium">Essential</dd>
            </div>
            <div>
              <dt className="text-staff-muted">Billing</dt>
              <dd className="font-medium">{intervalLabel}</dd>
            </div>
            <div>
              <dt className="text-staff-muted">Effective</dt>
              <dd className="font-medium">{dateLabel ?? "Next renewal"}</dd>
            </div>
            <div>
              <dt className="text-staff-muted">Price from next renewal</dt>
              <dd className="font-medium">{essentialPriceLabel}</dd>
            </div>
            <div>
              <dt className="text-staff-muted">Immediate charge</dt>
              <dd className="font-medium">None</dd>
            </div>
            <div>
              <dt className="text-staff-muted">Immediate refund</dt>
              <dd className="font-medium">None</dd>
            </div>
            <div>
              <dt className="text-staff-muted">
                Current Practice features remain until
              </dt>
              <dd className="font-medium">
                {dateLabel ?? "the effective date"}
              </dd>
            </div>
            <div>
              <dt className="text-staff-muted">Guide outcome</dt>
              <dd className="font-medium">
                {guidesFit
                  ? `${combinedCurrent} clinic-owned guides stay active. None are retained.`
                  : activeCombined == null
                    ? "Choose the guides that stay active. The others are retained for 60 days once Essential begins."
                    : `${activeCombined} clinic-owned guides stay active. ${retainedCombined} will be retained for 60 days once Essential begins.`}
              </dd>
            </div>
          </dl>
          {blockedMessage ? (
            <p className="mt-4" role="status">
              {blockedMessage}
            </p>
          ) : null}
          {canAct ? (
            <div
              className="mt-4 flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center"
              data-action-row="downgrade"
              aria-busy={pending || undefined}
            >
              <form action={action} className="min-w-0 w-full sm:w-auto">
                <input type="hidden" name="intent" value="schedule" />
                <PendingSubmitButton
                  label="Schedule downgrade"
                  pendingLabel="Scheduling…"
                  className="staffBtn staffBtnPrimary h-11 w-full sm:w-auto"
                  disabled={pending || !scheduleReady}
                />
              </form>
              {canCancelPreparation ? (
                <form action={action} className="min-w-0 w-full sm:w-auto">
                  <input type="hidden" name="intent" value="cancel" />
                  <PendingSubmitButton
                    label="Cancel plan change"
                    pendingLabel="Cancelling…"
                    className="staffBtn staffBtnSecondary h-11 w-full sm:w-auto"
                    disabled={pending}
                  />
                </form>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
      {notice ? (
        <TransientNotice
          variant={feedback.error ? "error" : "success"}
          noticeKey={`plan-change-${feedback.generation}`}
          onDismiss={() => setDismissed(feedback.generation)}
        >
          {notice}
        </TransientNotice>
      ) : null}
    </div>
  );
}

function noticeCopy(feedback: PlanChangeFeedback): string | null {
  if (feedback.error) {
    return feedback.error;
  }
  if (feedback.notice === "scheduled") {
    return feedback.effectiveLabel
      ? scheduledDowngradeNotice(feedback.effectiveLabel)
      : "Downgrade scheduled. Practice stays active until the date below.";
  }
  if (feedback.notice === "kept") {
    return KEEP_PRACTICE_NOTICE;
  }
  if (feedback.notice === "cancelled") {
    return CANCEL_PLAN_CHANGE_NOTICE;
  }
  return null;
}
