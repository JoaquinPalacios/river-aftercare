"use client";

import { useActionState, useState } from "react";

import {
  updateAllowanceExtrasAction,
  type AllowanceExtrasActionState,
} from "@/app/(staff)/(operator)/operator/clinics/[clinicId]/allowance-actions";

const initial: AllowanceExtrasActionState = {};

type Dimension = {
  label: string;
  includedLabel: string;
  used: number;
  base: number;
  extra: number;
  field: string;
};

export function AllowanceExtrasForm({
  clinicId,
  planName,
  team,
  customGuides,
  adaptedTemplates,
}: {
  clinicId: string;
  planName: string;
  team: { used: number; base: number; extra: number };
  customGuides: { used: number; base: number; extra: number };
  adaptedTemplates: { used: number; base: number; extra: number };
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

  const dimensions: Array<
    Dimension & { value: string; setValue: (value: string) => void }
  > = [
    {
      label: "Team members",
      includedLabel: `Included with ${planName}`,
      used: team.used,
      base: team.base,
      extra: team.extra,
      field: "extraTeamMembers",
      value: teamExtra,
      setValue: setTeamExtra,
    },
    {
      label: "Custom guides",
      includedLabel: "Included",
      used: customGuides.used,
      base: customGuides.base,
      extra: customGuides.extra,
      field: "extraCustomGuides",
      value: customExtra,
      setValue: setCustomExtra,
    },
    {
      label: "Adapted River templates",
      includedLabel: "Included",
      used: adaptedTemplates.used,
      base: adaptedTemplates.base,
      extra: adaptedTemplates.extra,
      field: "extraTemplateAdaptations",
      value: adaptedExtra,
      setValue: setAdaptedExtra,
    },
  ];

  const overLimitWarnings = dimensions.flatMap((dimension) => {
    if (!/^\d+$/.test(dimension.value)) {
      return [];
    }
    const nextExtra = Number(dimension.value);
    const effective = dimension.base + nextExtra;
    if (dimension.used > effective) {
      return [
        `${dimension.label} usage is ${dimension.used}. The new effective allowance would be ${effective}. Existing resources stay in place, and new ones stay blocked until usage drops.`,
      ];
    }
    return [];
  });

  return (
    <section className="rounded-xl border border-staff-line bg-staff-panel p-5">
      <h2 className="text-base font-semibold">Allowances</h2>
      <p className="mt-2 text-sm leading-6 text-staff-muted">
        Operator extras are added to the {planName} base. They do not change the
        plan or Stripe billing.
      </p>
      <form action={action} className="mt-4 flex flex-col gap-5">
        <input type="hidden" name="clinicId" value={clinicId} />
        {dimensions.map((dimension) => {
          const parsed = /^\d+$/.test(dimension.value)
            ? Number(dimension.value)
            : null;
          const effective = parsed === null ? null : dimension.base + parsed;
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
                inputMode="numeric"
                value={dimension.value}
                onChange={(event) => dimension.setValue(event.target.value)}
                disabled={pending}
                className="h-11 max-w-40 rounded-md border border-staff-line bg-staff-panel px-3 text-sm"
              />
              <p className="text-sm text-staff-ink">
                Effective allowance: {effective === null ? "—" : effective}
              </p>
              <p className="text-sm text-staff-muted">
                Current usage: {dimension.used}
              </p>
            </fieldset>
          );
        })}
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
          disabled={pending}
        >
          {pending ? "Saving…" : "Save extra allowances"}
        </button>
      </form>
    </section>
  );
}
