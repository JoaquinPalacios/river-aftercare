"use client";

import type {
  HomeCareDurationUnit,
  HomeCareFrequencyPeriod,
} from "@/lib/aftercare/home-care-instruction";
import type { ReactNode } from "react";

import type { EditorHomeCareInstruction } from "@/app/(staff)/(clinic-portal)/guides/timeline-accordion";
import { AutosizeTextarea } from "@/app/(staff)/components/autosize-textarea";

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium" htmlFor={htmlFor}>
        {label}
      </label>
      {hint ? <p className="text-sm text-staff-muted">{hint}</p> : null}
      {children}
    </div>
  );
}

export function HomeCareInstructionFields({
  item,
  index,
  count,
  disabled,
  onChange,
  onMove,
  onRemove,
}: {
  item: EditorHomeCareInstruction;
  index: number;
  count: number;
  disabled: boolean;
  onChange: (item: EditorHomeCareInstruction) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}) {
  const onlyInstruction = count <= 1;
  const removeHintId = `${item.key}-remove-hint`;

  return (
    <fieldset
      className="grid gap-3 rounded-md border border-staff-line p-3"
      data-instruction-key={item.key}
    >
      <legend className="px-1 text-sm font-medium">
        Instruction {index + 1}
      </legend>
      <Field
        label="Instruction"
        htmlFor={`${item.key}-title`}
        hint="The action for this step, not the whole plan."
      >
        <input
          id={`${item.key}-title`}
          value={item.title}
          onChange={(event) => onChange({ ...item, title: event.target.value })}
          disabled={disabled}
          placeholder="Example instruction"
          className="staffField"
        />
      </Field>
      <Field label="Details" htmlFor={`${item.key}-body`}>
        <AutosizeTextarea
          id={`${item.key}-body`}
          value={item.body}
          onChange={(event) => onChange({ ...item, body: event.target.value })}
          disabled={disabled}
          placeholder="Enter details..."
        />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <p className="text-sm text-staff-muted sm:col-span-2">
          Optional schedule — leave blank when the clinic should set this when
          adapting the template.
        </p>
        <Field label="Times" htmlFor={`${item.key}-count`}>
          <input
            id={`${item.key}-count`}
            type="number"
            inputMode="numeric"
            min={1}
            max={99}
            step={1}
            value={item.frequencyCount}
            onChange={(event) =>
              onChange({ ...item, frequencyCount: event.target.value })
            }
            disabled={disabled}
            className="staffField"
          />
        </Field>
        <Field label="Per" htmlFor={`${item.key}-period`}>
          <select
            id={`${item.key}-period`}
            value={item.frequencyPeriod}
            onChange={(event) =>
              onChange({
                ...item,
                frequencyPeriod: event.target.value as
                  HomeCareFrequencyPeriod | "",
              })
            }
            disabled={disabled}
            className="staffSelect"
          >
            <option value="">Not specified</option>
            <option value="DAY">Day</option>
            <option value="WEEK">Week</option>
          </select>
        </Field>
        <Field label="Timing" htmlFor={`${item.key}-timing`}>
          <input
            id={`${item.key}-timing`}
            value={item.timingLabel}
            onChange={(event) =>
              onChange({ ...item, timingLabel: event.target.value })
            }
            disabled={disabled}
            placeholder="Evening"
            className="staffField"
          />
        </Field>
        <Field label="Duration" htmlFor={`${item.key}-duration`}>
          <input
            id={`${item.key}-duration`}
            type="number"
            inputMode="numeric"
            min={1}
            max={520}
            step={1}
            value={item.durationValue}
            onChange={(event) =>
              onChange({ ...item, durationValue: event.target.value })
            }
            disabled={disabled}
            className="staffField"
          />
        </Field>
        <Field label="Duration unit" htmlFor={`${item.key}-unit`}>
          <select
            id={`${item.key}-unit`}
            value={item.durationUnit}
            onChange={(event) =>
              onChange({
                ...item,
                durationUnit: event.target.value as HomeCareDurationUnit | "",
              })
            }
            disabled={disabled}
            className="staffSelect"
          >
            <option value="">Not specified</option>
            <option value="DAYS">Days</option>
            <option value="WEEKS">Weeks</option>
          </select>
        </Field>
      </div>
      {disabled ? null : (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="staffBtn staffBtnSecondary"
            onClick={() => onMove(-1)}
            disabled={index === 0}
          >
            Move up
          </button>
          <button
            type="button"
            className="staffBtn staffBtnSecondary"
            onClick={() => onMove(1)}
            disabled={index >= count - 1}
          >
            Move down
          </button>
          <button
            type="button"
            className="staffBtn staffBtnSecondary"
            onClick={onRemove}
            disabled={onlyInstruction}
            aria-describedby={onlyInstruction ? removeHintId : undefined}
          >
            Remove instruction
          </button>
        </div>
      )}
      {disabled || !onlyInstruction ? null : (
        <p id={removeHintId} className="text-sm text-staff-muted">
          A plan needs at least one instruction. Clear these fields to replace
          it, or remove the whole plan.
        </p>
      )}
    </fieldset>
  );
}
