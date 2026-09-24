"use client";

import { useEffect, useMemo, useState } from "react";
import { useActionState } from "react";

import {
  confirmDowngradeGuideSelectionAction,
  type GuideSelectionActionState,
} from "@/app/(staff)/account/billing/actions";
import { PendingSubmitButton } from "@/app/(staff)/components/pending-submit-button";
import { TransientNotice } from "@/app/(staff)/components/transient-notice";
import type {
  ClinicGuideSelectionGuide,
  ClinicGuideSelectionPanel,
} from "@/lib/entitlements/downgrade-selection";

export const GUIDE_SELECTION_SAVED_MESSAGE = "Guide selection saved.";

const FUTURE_RETENTION_EXPLANATION =
  "These guides will remain available on Practice until Essential begins. When the downgrade takes effect, they will be retained for 60 days.";

type SelectionFeedback = GuideSelectionActionState & {
  submittedIds: string[];
  generation: number;
};

const initialFeedback: SelectionFeedback = {
  submittedIds: [],
  generation: 0,
};

async function selectionFeedbackAction(
  previous: SelectionFeedback,
  formData: FormData
): Promise<SelectionFeedback> {
  const submittedIds = formData
    .getAll("guideId")
    .filter(
      (value): value is string => typeof value === "string" && value.length > 0
    );
  const result = await confirmDowngradeGuideSelectionAction(previous, formData);
  return {
    error: result.error,
    accepted: result.accepted,
    submittedIds: result.accepted ? submittedIds : previous.submittedIds,
    generation: previous.generation + 1,
  };
}

function selectionKey(ids: readonly string[]): string {
  return [...ids].sort().join("\0");
}

const LIMIT_NOTE_ID = "downgrade-guide-limit-note";

export function uncheckedGuideExceedsEssentialAllowance(input: {
  kind: "custom" | "adapted";
  customSelected: number;
  adaptedSelected: number;
  limits: ClinicGuideSelectionPanel["limits"];
}): boolean {
  const combined = input.customSelected + input.adaptedSelected;
  if (combined + 1 > input.limits.combined) {
    return true;
  }
  if (input.kind === "custom") {
    return input.customSelected + 1 > input.limits.custom;
  }
  return input.adaptedSelected + 1 > input.limits.adapted;
}

function limitReachedNote(input: {
  customSelected: number;
  adaptedSelected: number;
  limits: ClinicGuideSelectionPanel["limits"];
  hasBlockedChoice: boolean;
}): string | null {
  if (!input.hasBlockedChoice) {
    return null;
  }
  const combined = input.customSelected + input.adaptedSelected;
  if (
    combined >= input.limits.combined ||
    (input.customSelected >= input.limits.custom &&
      input.adaptedSelected >= input.limits.adapted)
  ) {
    return "Guide limit reached";
  }
  if (input.customSelected >= input.limits.custom) {
    return "Custom guide limit reached";
  }
  if (input.adaptedSelected >= input.limits.adapted) {
    return "Editable River template limit reached";
  }
  return "Guide limit reached";
}

function GuideChoiceDetails({ guide }: { guide: ClinicGuideSelectionGuide }) {
  return (
    <span>
      <span className="font-medium">{guide.title}</span>
      <span className="mt-1 block text-staff-muted">
        {guide.kindLabel}
        <span aria-hidden="true"> · </span>
        {guide.publicationLabel}
        <span aria-hidden="true"> · </span>
        Updated {guide.updatedLabel}
      </span>
    </span>
  );
}

function SelectionCounts({
  customSelected,
  adaptedSelected,
  combinedSelected,
  limits,
  limitNote,
}: {
  customSelected: number;
  adaptedSelected: number;
  combinedSelected: number;
  limits: ClinicGuideSelectionPanel["limits"];
  limitNote: string | null;
}) {
  return (
    <div className="grid gap-1 text-sm" aria-live="polite">
      <p>
        Custom guides {customSelected} of {limits.custom} selected
      </p>
      <p>
        Editable River templates {adaptedSelected} of {limits.adapted} selected
      </p>
      <p>
        Total clinic-owned guides {combinedSelected} of {limits.combined}{" "}
        selected
      </p>
      {limitNote ? (
        <p id={LIMIT_NOTE_ID} className="staffConstraintNote">
          {limitNote}
        </p>
      ) : null}
    </div>
  );
}

export function DowngradeGuideSelectionForm({
  panel,
  canConfirm,
  placement = "standalone",
}: {
  panel: ClinicGuideSelectionPanel;
  canConfirm: boolean;
  placement?: "standalone" | "review";
}) {
  const [state, action, pending] = useActionState(
    selectionFeedbackAction,
    initialFeedback
  );
  const [editing, setEditing] = useState(panel.status !== "confirmed");
  const [dismissedNotice, setDismissedNotice] = useState(0);
  const [selected, setSelected] = useState<string[]>(panel.selectedIds);
  const savedKey = selectionKey(panel.selectedIds);
  const submittedKey = selectionKey(state.submittedIds);
  const summaryIds =
    state.accepted && state.generation > 0 && submittedKey !== savedKey
      ? state.submittedIds
      : panel.status === "confirmed"
        ? panel.selectedIds
        : state.submittedIds;

  useEffect(() => {
    if (!state.accepted || state.generation === 0) {
      return;
    }
    setEditing(false);
  }, [state.accepted, state.generation]);
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const customSelected = panel.guides.filter(
    (guide) => guide.kind === "custom" && selectedSet.has(guide.id)
  ).length;
  const adaptedSelected = panel.guides.filter(
    (guide) => guide.kind === "adapted" && selectedSet.has(guide.id)
  ).length;
  const combinedSelected = customSelected + adaptedSelected;
  const withinLimits =
    customSelected <= panel.limits.custom &&
    adaptedSelected <= panel.limits.adapted &&
    combinedSelected <= panel.limits.combined;
  const blockedIds = new Set(
    panel.guides
      .filter(
        (guide) =>
          !selectedSet.has(guide.id) &&
          uncheckedGuideExceedsEssentialAllowance({
            kind: guide.kind,
            customSelected,
            adaptedSelected,
            limits: panel.limits,
          })
      )
      .map((guide) => guide.id)
  );
  const limitNote = limitReachedNote({
    customSelected,
    adaptedSelected,
    limits: panel.limits,
    hasBlockedChoice: blockedIds.size > 0,
  });

  function toggle(id: string, checked: boolean) {
    setSelected((current) => {
      if (!checked) {
        return current.filter((value) => value !== id);
      }
      if (current.includes(id) || blockedIds.has(id)) {
        return current;
      }
      return [...current, id];
    });
  }

  function beginEdit() {
    setSelected(summaryIds);
    setEditing(true);
  }

  const showSummary =
    !editing && (panel.status === "confirmed" || Boolean(state.accepted));
  const previouslyConfirmed =
    panel.status === "confirmed" || Boolean(state.accepted);
  const notice =
    state.generation > dismissedNotice && state.accepted ? (
      <TransientNotice
        variant="success"
        noticeKey={`guide-selection-${state.generation}`}
        onDismiss={() => setDismissedNotice(state.generation)}
      >
        {GUIDE_SELECTION_SAVED_MESSAGE}
      </TransientNotice>
    ) : null;

  if (showSummary) {
    if (placement === "review" && canConfirm) {
      return (
        <div className="mt-3 flex flex-col gap-3">
          {notice}
          <button
            type="button"
            className="staffBtn staffBtnSecondary h-11 w-full sm:w-auto"
            onClick={beginEdit}
          >
            Edit guide selection
          </button>
        </div>
      );
    }
    const summarySet = new Set(summaryIds);
    const kept = panel.guides.filter((guide) => summarySet.has(guide.id));
    const futureRetained = panel.guides.filter(
      (guide) => !summarySet.has(guide.id)
    );
    const summaryCustom = kept.filter(
      (guide) => guide.kind === "custom"
    ).length;
    const summaryAdapted = kept.filter(
      (guide) => guide.kind === "adapted"
    ).length;
    return (
      <div
        className={
          placement === "review"
            ? "mt-3 flex flex-col gap-4"
            : "mt-4 flex flex-col gap-4"
        }
      >
        {notice}
        {placement === "review" ? null : (
          <>
            <p className="text-sm font-medium" role="status">
              Guide selection confirmed
            </p>
            <SelectionCounts
              customSelected={summaryCustom}
              adaptedSelected={summaryAdapted}
              combinedSelected={summaryCustom + summaryAdapted}
              limits={panel.limits}
              limitNote={null}
            />
          </>
        )}
        <section className="flex flex-col gap-2">
          <h4 className="text-sm font-medium">Will stay active on Essential</h4>
          {kept.length === 0 ? (
            <p className="text-sm text-staff-muted">
              No clinic-owned guides are selected to stay active.
            </p>
          ) : (
            <ul className="grid min-w-0 gap-2 md:grid-cols-2">
              {kept.map((guide) => (
                <li
                  key={guide.id}
                  className="min-w-0 rounded-lg border border-staff-line px-3 py-2 text-sm"
                >
                  <GuideChoiceDetails guide={guide} />
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="flex flex-col gap-2">
          <h4 className="text-sm font-medium">Will be retained for 60 days</h4>
          <p className="text-sm leading-6 text-staff-muted">
            {FUTURE_RETENTION_EXPLANATION}
          </p>
          {futureRetained.length === 0 ? (
            <p className="text-sm text-staff-muted">
              No clinic-owned guides are set aside for that retention period.
            </p>
          ) : (
            <ul className="grid min-w-0 gap-2 md:grid-cols-2">
              {futureRetained.map((guide) => (
                <li
                  key={guide.id}
                  className="min-w-0 rounded-lg border border-staff-line px-3 py-2 text-sm"
                >
                  <GuideChoiceDetails guide={guide} />
                </li>
              ))}
            </ul>
          )}
        </section>
        {canConfirm ? (
          <button
            type="button"
            className="staffBtn staffBtnSecondary h-11"
            onClick={beginEdit}
          >
            Edit guide selection
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <form
      action={action}
      className={
        placement === "review"
          ? "mt-3 flex flex-col gap-4"
          : "mt-4 flex flex-col gap-4"
      }
      aria-busy={pending || undefined}
      onReset={(event) => event.preventDefault()}
    >
      {notice}
      <p className="text-sm leading-6">
        Your Practice subscription includes more clinic-owned guides than
        Essential. Choose which guides you want to keep active when Essential
        begins. Other guides will be retained for 60 days.
      </p>
      <SelectionCounts
        customSelected={customSelected}
        adaptedSelected={adaptedSelected}
        combinedSelected={combinedSelected}
        limits={panel.limits}
        limitNote={limitNote}
      />
      <fieldset className="grid gap-3" disabled={!canConfirm || pending}>
        <legend className="text-sm font-medium">Clinic-owned guides</legend>
        {panel.guides.length === 0 ? (
          <p className="text-sm text-staff-muted">
            There are no active clinic-owned guides to choose.
          </p>
        ) : (
          <ul className="grid min-w-0 gap-2 md:grid-cols-2">
            {panel.guides.map((guide) => {
              const checked = selectedSet.has(guide.id);
              const blocked = blockedIds.has(guide.id);
              return (
                <li key={guide.id} className="min-w-0">
                  <label
                    className={`flex min-w-0 items-start gap-3 rounded-lg border border-staff-line px-3 py-2 text-sm ${
                      blocked ? "text-staff-muted" : ""
                    }`}
                  >
                    <input
                      type="checkbox"
                      name="guideId"
                      value={guide.id}
                      className="mt-1"
                      checked={checked}
                      disabled={blocked || pending}
                      aria-describedby={blocked ? LIMIT_NOTE_ID : undefined}
                      onChange={(event) =>
                        toggle(guide.id, event.target.checked)
                      }
                    />
                    <GuideChoiceDetails guide={guide} />
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </fieldset>
      {!withinLimits ? (
        <p className="text-sm" role="status">
          That selection is above the Essential guide allowance.
        </p>
      ) : null}
      {state.error ? (
        <p className="text-sm text-red-700" role="alert">
          {state.error}
        </p>
      ) : null}
      {canConfirm ? (
        <PendingSubmitButton
          label={
            previouslyConfirmed
              ? "Update guide selection"
              : "Confirm guide selection"
          }
          pendingLabel={
            previouslyConfirmed ? "Updating selection…" : "Saving selection…"
          }
          className="staffBtn staffBtnPrimary h-11 w-full sm:w-auto"
          disabled={pending || !withinLimits}
        />
      ) : (
        <p className="text-sm text-staff-muted">
          A clinic administrator needs to choose which guides to keep.
        </p>
      )}
    </form>
  );
}
