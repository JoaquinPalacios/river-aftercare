"use client";

import { useMemo, useState } from "react";
import { useActionState } from "react";

import {
  confirmDowngradeGuideSelectionAction,
  type GuideSelectionActionState,
} from "@/app/(staff)/account/billing/actions";
import type { ClinicGuideSelectionPanel } from "@/lib/entitlements/downgrade-selection";

const initial: GuideSelectionActionState = {};

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

export function DowngradeGuideSelectionForm({
  panel,
  canConfirm,
}: {
  panel: ClinicGuideSelectionPanel;
  canConfirm: boolean;
}) {
  const [state, action, pending] = useActionState(
    confirmDowngradeGuideSelectionAction,
    initial
  );
  const [selected, setSelected] = useState<string[]>(panel.selectedIds);
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

  return (
    <form action={action} className="mt-4 flex flex-col gap-4">
      <p className="text-sm leading-6">
        Your Practice subscription includes more clinic-owned guides than
        Essential. Choose which guides you want to keep active when Essential
        begins. Other guides will be retained for 60 days.
      </p>
      <div className="grid gap-1 text-sm" aria-live="polite">
        <p>
          Custom guides {customSelected} of {panel.limits.custom} selected
        </p>
        <p>
          Editable River templates {adaptedSelected} of {panel.limits.adapted}{" "}
          selected
        </p>
        <p>
          Total clinic-owned guides {combinedSelected} of{" "}
          {panel.limits.combined} selected
        </p>
        {limitNote ? <p id={LIMIT_NOTE_ID}>{limitNote}</p> : null}
      </div>
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
                      disabled={blocked}
                      aria-describedby={blocked ? LIMIT_NOTE_ID : undefined}
                      onChange={(event) =>
                        toggle(guide.id, event.target.checked)
                      }
                    />
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
      {state.accepted ? (
        <p className="text-sm" role="status">
          Guide selection complete.
        </p>
      ) : null}
      {canConfirm ? (
        <button
          type="submit"
          className="staffBtn staffBtnPrimary h-11"
          disabled={pending || !withinLimits}
        >
          {pending ? "Saving…" : "Confirm guide selection"}
        </button>
      ) : (
        <p className="text-sm text-staff-muted">
          A clinic administrator needs to choose which guides to keep.
        </p>
      )}
    </form>
  );
}
