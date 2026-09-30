"use client";

import { useState, type ReactNode } from "react";

import type { EditorHomeCareInstruction } from "@/app/(staff)/(clinic-portal)/guides/timeline-accordion";
import { AutosizeTextarea } from "@/app/(staff)/components/autosize-textarea";
import {
  editableHomeCareScheduleHasValue,
  formatEditableHomeCareSchedule,
  type HomeCareDurationUnit,
  type HomeCareFrequencyPeriod,
} from "@/lib/aftercare/home-care-instruction";

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

function ScheduleChevron() {
  return (
    <svg
      className="homeCareScheduleChevron"
      viewBox="0 0 16 16"
      width="12"
      height="12"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 3.5 10.5 8 6 12.5" />
    </svg>
  );
}

export function HomeCareInstructionFields({
  item,
  index,
  disabled,
  onChange,
}: {
  item: EditorHomeCareInstruction;
  index: number;
  disabled: boolean;
  onChange: (item: EditorHomeCareInstruction) => void;
}) {
  const [scheduleOpen, setScheduleOpen] = useState(() =>
    editableHomeCareScheduleHasValue(item)
  );
  const scheduleSummary = formatEditableHomeCareSchedule(item);
  const schedulePanelId = `${item.key}-schedule-panel`;

  return (
    <fieldset className="homeCareInstructionFields">
      <legend className="sr-only">Instruction {index + 1}</legend>
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
      <div
        className="homeCareSchedule"
        data-schedule-open={scheduleOpen ? "true" : "false"}
      >
        <button
          type="button"
          className="homeCareScheduleToggle"
          aria-expanded={scheduleOpen}
          aria-controls={schedulePanelId}
          onClick={() => setScheduleOpen((open) => !open)}
        >
          <ScheduleChevron />
          <span className="homeCareScheduleText">
            <span className="homeCareScheduleLabel">Schedule (optional)</span>
            {!scheduleOpen && scheduleSummary ? (
              <span className="homeCareScheduleSummary">
                {` · ${scheduleSummary}`}
              </span>
            ) : null}
          </span>
        </button>
        <div
          id={schedulePanelId}
          className="homeCareSchedulePanel"
          hidden={!scheduleOpen}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <p className="text-sm text-staff-muted sm:col-span-2">
              Optional schedule — leave blank when the clinic should set this
              when adapting the template.
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
                    durationUnit: event.target.value as
                      HomeCareDurationUnit | "",
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
        </div>
      </div>
    </fieldset>
  );
}
