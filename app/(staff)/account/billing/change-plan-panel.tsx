"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";

import { PlanChangeSelectionContext } from "@/app/(staff)/account/billing/plan-change-selection-context";

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
  arrivalNotice,
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
  arrivalNotice?: "cancelled" | null;
}) {
  const [feedback, action, pending] = useActionState(
    planChangeFeedbackAction,
    initialFeedback
  );
  const [dismissed, setDismissed] = useState(0);
  const [arrivalDismissed, setArrivalDismissed] = useState(false);
  const actionNotice =
    feedback.generation > dismissed ? noticeCopy(feedback) : null;
  const notice =
    actionNotice ??
    (arrivalNotice === "cancelled" && !arrivalDismissed
      ? CANCEL_PLAN_CHANGE_NOTICE
      : null);
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
  const router = useRouter();
  const cancelled = feedback.notice === "cancelled";
  const view = cancelled ? "entry" : phase;
  const [primarySlot, setPrimarySlot] = useState<HTMLDivElement | null>(null);
  const [secondarySlot, setSecondarySlot] = useState<HTMLDivElement | null>(
    null
  );
  const [guideSelectionEditing, setGuideSelectionEditing] = useState(
    Boolean(guideEditor) && !guidesFit && preparationStatus !== "confirmed"
  );
  const reportEditing = useCallback((editing: boolean) => {
    setGuideSelectionEditing((current) =>
      current === editing ? current : editing
    );
  }, []);
  const selectionContextValue = useMemo(
    () => ({
      reportEditing,
      primarySlot,
      secondarySlot,
    }),
    [reportEditing, primarySlot, secondarySlot]
  );
  const reviewTitle = !canAct
    ? "Preparing a plan change"
    : guideSelectionEditing
      ? "Next: confirm guide selection"
      : scheduleReady
        ? "Next: schedule the downgrade"
        : "Scheduling is not available yet";

  useEffect(() => {
    if (!cancelled) {
      return;
    }
    router.replace("/account/billing?plan-change=cancelled");
  }, [cancelled, router]);

  useEffect(() => {
    if (arrivalNotice !== "cancelled") {
      return;
    }
    const url = new URL(window.location.href);
    if (url.searchParams.get("plan-change") !== "cancelled") {
      return;
    }
    url.searchParams.delete("plan-change");
    const search = url.searchParams.toString();
    window.history.replaceState(
      null,
      "",
      search ? `${url.pathname}?${search}` : url.pathname
    );
  }, [arrivalNotice]);

  function keepSingleSubmission(event: FormEvent<HTMLFormElement>) {
    if (pending) {
      event.preventDefault();
    }
  }

  function cancelPlanChangeControl() {
    if (!canAct) {
      return null;
    }
    if (!canCancelPreparation) {
      return (
        <button
          type="button"
          className="staffBtn staffBtnSecondary h-11 w-full sm:w-auto"
          disabled={pending}
          onClick={() => {
            router.replace("/account/billing");
          }}
        >
          Cancel plan change
        </button>
      );
    }
    return (
      <form
        action={action}
        className="min-w-0 w-full sm:w-auto"
        onSubmit={keepSingleSubmission}
      >
        <input type="hidden" name="intent" value="cancel" />
        <PendingSubmitButton
          label="Cancel plan change"
          pendingLabel="Cancelling…"
          className="staffBtn staffBtnSecondary h-11 w-full sm:w-auto"
          disabled={pending}
        />
      </form>
    );
  }

  return (
    <div className="mt-5 border-t border-staff-line pt-5" data-phase={view}>
      <h3 className="text-sm font-semibold">
        {view === "scheduled" ? "Essential scheduled" : "Change plan"}
      </h3>
      {view === "entry" ? (
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
              onSubmit={keepSingleSubmission}
            >
              <input type="hidden" name="intent" value="begin" />
              <PendingSubmitButton
                label="Change plan"
                pendingLabel="Preparing…"
                className="staffBtn staffBtnPrimary h-11 w-full sm:w-auto"
                disabled={pending}
              />
            </form>
          ) : null}
        </div>
      ) : null}
      {view === "scheduled" ? (
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
              onSubmit={keepSingleSubmission}
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
      {view === "review" ? (
        <PlanChangeSelectionContext.Provider value={selectionContextValue}>
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
            <section
              className="staffPlanChangeActions"
              aria-label="Plan change actions"
              data-plan-change-actions
            >
              <p className="staffPlanChangeActionTitle">{reviewTitle}</p>
              {!canAct ? (
                <p className="staffPlanChangeActionNote">
                  A clinic administrator confirms any guide selection and
                  schedules the downgrade.
                </p>
              ) : null}
              {blockedMessage ? (
                <p className="staffPlanChangeActionNote" role="status">
                  {blockedMessage}
                </p>
              ) : null}
              {canAct ? (
                <div
                  className="staffPlanChangeActionButtons"
                  data-action-row="downgrade"
                  aria-busy={pending || undefined}
                >
                  <div
                    ref={setPrimarySlot}
                    className="flex w-full min-w-0 empty:hidden sm:w-auto"
                  />
                  {guideSelectionEditing ? null : (
                    <form
                      action={action}
                      className="min-w-0 w-full sm:w-auto"
                      onSubmit={keepSingleSubmission}
                    >
                      <input type="hidden" name="intent" value="schedule" />
                      <PendingSubmitButton
                        label="Schedule downgrade"
                        pendingLabel="Scheduling…"
                        className="staffBtn staffBtnPrimary h-11 w-full sm:w-auto"
                        disabled={pending || !scheduleReady}
                      />
                    </form>
                  )}
                  <div
                    ref={setSecondarySlot}
                    className="flex max-w-full self-start empty:hidden"
                  />
                  <div data-cancel-plan-change="actions">
                    {cancelPlanChangeControl()}
                  </div>
                </div>
              ) : null}
            </section>
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
                      Deactivate team members or cancel pending invitations
                      before scheduling the downgrade.
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
          </div>
        </PlanChangeSelectionContext.Provider>
      ) : null}
      {notice ? (
        <TransientNotice
          variant={actionNotice && feedback.error ? "error" : "success"}
          noticeKey={
            actionNotice
              ? `plan-change-${feedback.generation}`
              : "plan-change-cancelled"
          }
          onDismiss={() => {
            if (actionNotice) {
              setDismissed(feedback.generation);
              return;
            }
            setArrivalDismissed(true);
          }}
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
