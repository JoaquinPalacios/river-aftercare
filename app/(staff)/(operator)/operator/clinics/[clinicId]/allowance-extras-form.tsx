"use client";

import { useActionState, useState } from "react";

import {
  updateAllowanceExtrasAction,
  type AllowanceExtrasActionState,
} from "@/app/(staff)/(operator)/operator/clinics/[clinicId]/allowance-actions";
import { operatorExtraAllowanceError } from "@/lib/entitlements/allowance-input";

const initial: AllowanceExtrasActionState = {};

type Dimension = {
  label: string;
  includedLabel: string;
  used: number;
  base: number;
  field: string;
  value: string;
  setValue: (value: string) => void;
};

export function AllowanceExtrasForm({
  clinicId,
  planName,
  team,
  customGuides,
  adaptedTemplates,
  combinedGuides,
}: {
  clinicId: string;
  planName: string;
  team: { used: number; base: number; extra: number };
  customGuides: { used: number; base: number; extra: number };
  adaptedTemplates: { used: number; base: number; extra: number };
  combinedGuides: { used: number; base: number };
}) {
  const [state, action, pending] = useActionState(
    updateAllowanceExtrasAction,
    initial
  );
  const [teamExtra, setTeamExtra] = useState(String(team.extra));
  const [customExtra, setCustomExtra] = useState(String(customGuides.extra));
  const [adaptedExtra, setAdaptedExtra] = useState(
    String(adaptedTemplates.extra)
  );

  const dimensions: Dimension[] = [
    {
      label: "Team members",
      includedLabel: `Included with ${planName}`,
      used: team.used,
      base: team.base,
      field: "extraTeamMembers",
      value: teamExtra,
      setValue: setTeamExtra,
    },
    {
      label: "Custom guides",
      includedLabel: "Included",
      used: customGuides.used,
      base: customGuides.base,
      field: "extraCustomGuides",
      value: customExtra,
      setValue: setCustomExtra,
    },
    {
      label: "Editable River templates",
      includedLabel: "Included",
      used: adaptedTemplates.used,
      base: adaptedTemplates.base,
      field: "extraTemplateAdaptations",
      value: adaptedExtra,
      setValue: setAdaptedExtra,
    },
  ];

  const fieldErrors = dimensions.map((dimension) =>
    operatorExtraAllowanceError(dimension.value)
  );
  const formInvalid = fieldErrors.some((error) => error !== null);
  const customParsed = operatorExtraAllowanceError(customExtra)
    ? null
    : Number(customExtra.trim());
  const adaptedParsed = operatorExtraAllowanceError(adaptedExtra)
    ? null
    : Number(adaptedExtra.trim());
  const guideExtrasValid = customParsed !== null && adaptedParsed !== null;
  const combinedExtra = guideExtrasValid ? customParsed + adaptedParsed : null;
  const combinedEffective =
    combinedExtra === null ? null : combinedGuides.base + combinedExtra;

  const overLimitWarnings = dimensions.flatMap((dimension, index) => {
    if (fieldErrors[index]) {
      return [];
    }
    const nextExtra = Number(dimension.value.trim());
    const effective = dimension.base + nextExtra;
    if (dimension.used > effective) {
      return [
        `${dimension.label} usage is ${dimension.used}. The new effective allowance would be ${effective}. Existing resources stay in place, and new ones stay blocked until usage drops.`,
      ];
    }
    return [];
  });
  if (
    guideExtrasValid &&
    combinedEffective !== null &&
    combinedGuides.used > combinedEffective
  ) {
    overLimitWarnings.push(
      `Total clinic-owned guide usage is ${combinedGuides.used}. The new effective combined allowance would be ${combinedEffective}. Existing guides stay in place.`
    );
  }

  return (
    <section className="rounded-xl border border-staff-line bg-staff-panel p-5">
      <h2 className="text-base font-semibold">Allowances</h2>
      <p className="mt-2 text-sm leading-6 text-staff-muted">
        Operator extras are added to the {planName} base. Each custom-guide or
        editable-template extra also adds one clinic-owned guide to the combined
        allowance. They do not change the plan or Stripe billing.
      </p>
      <form action={action} className="mt-4 flex flex-col gap-5">
        <input type="hidden" name="clinicId" value={clinicId} />
        {dimensions.map((dimension, index) => {
          const error = fieldErrors[index];
          const errorId = `${dimension.field}-error`;
          const effective = error
            ? null
            : dimension.base + Number(dimension.value.trim());
          return (
            <fieldset
              key={dimension.field}
              className="flex flex-col gap-2 border-0 p-0"
            >
              <legend className="text-sm font-medium">{dimension.label}</legend>
              <p className="text-sm text-staff-muted">
                {dimension.includedLabel}: {dimension.base}
              </p>
              <label
                className="text-sm text-staff-muted"
                htmlFor={dimension.field}
              >
                Operator extras
              </label>
              <input
                id={dimension.field}
                name={dimension.field}
                type="number"
                min={0}
                step={1}
                inputMode="numeric"
                value={dimension.value}
                onChange={(event) => dimension.setValue(event.target.value)}
                disabled={pending}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? errorId : undefined}
                className="h-11 max-w-40 rounded-md border border-staff-line bg-staff-panel px-3 text-sm"
              />
              {error ? (
                <p id={errorId} className="text-sm text-red-600" role="alert">
                  {error}
                </p>
              ) : null}
              <p className="text-sm text-staff-ink">
                {effective === null
                  ? "Effective allowance is not calculated until this is a whole number of zero or more."
                  : `Effective allowance: ${effective}`}
              </p>
              <p className="text-sm text-staff-muted">
                Current usage: {dimension.used}
              </p>
            </fieldset>
          );
        })}
        <fieldset className="flex flex-col gap-2 border-0 p-0">
          <legend className="text-sm font-medium">
            Total clinic-owned guides
          </legend>
          <p className="text-sm text-staff-muted">
            Included combined allowance: {combinedGuides.base}
          </p>
          <p className="text-sm text-staff-muted">
            {guideExtrasValid
              ? `Extras from guide allowances: ${customParsed} + ${adaptedParsed}`
              : "Extras from guide allowances are not calculated until both guide extras are whole numbers of zero or more."}
          </p>
          <p className="text-sm text-staff-ink">
            {combinedEffective === null
              ? "Effective combined allowance is not calculated until both guide extras are whole numbers of zero or more."
              : `Effective combined allowance: ${combinedEffective}`}
          </p>
          <p className="text-sm text-staff-muted">
            Current combined usage: {combinedGuides.used}
          </p>
        </fieldset>
        {overLimitWarnings.length > 0 ? (
          <div className="text-sm leading-6 text-staff-ink" role="status">
            {overLimitWarnings.map((warning) => (
              <p key={warning}>{warning}</p>
            ))}
          </div>
        ) : null}
        {state.error ? (
          <p className="text-sm text-red-600" role="alert">
            {state.error}
          </p>
        ) : null}
        {state.success ? (
          <p className="text-sm text-staff-ink" role="status">
            {state.success}
          </p>
        ) : null}
        <button
          type="submit"
          className="staffBtn staffBtnPrimary h-11 w-fit"
          disabled={pending || formInvalid}
        >
          {pending ? "Saving…" : "Save extra allowances"}
        </button>
      </form>
    </section>
  );
}
