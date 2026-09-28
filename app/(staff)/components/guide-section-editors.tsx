"use client";

import type { ReactNode } from "react";

import { guideSectionKindLabel } from "@/lib/aftercare/guide-section-kind-label";
import type { GuideSectionKind } from "@/lib/aftercare/types";
import { HomeCareInstructionFields } from "@/app/(staff)/components/home-care-instruction-fields";
import type {
  EditorHomeCareInstruction,
  EditorSection,
} from "@/app/(staff)/(clinic-portal)/guides/timeline-accordion";

export function newGuideContentKey(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

export function blankHomeCareInstruction(
  title = ""
): EditorHomeCareInstruction {
  return {
    key: newGuideContentKey("item"),
    title,
    body: "",
    frequencyCount: "",
    frequencyPeriod: "",
    timingLabel: "",
    durationValue: "",
    durationUnit: "",
  };
}

export function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
    </div>
  );
}

export function FieldError({ message }: { message?: string }) {
  if (!message) {
    return null;
  }
  return <p className="text-sm text-red-600">{message}</p>;
}

export function EditorSectionHeading({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4 rounded-xl border border-staff-line bg-staff-panel p-5">
      <h2 className="text-base font-semibold tracking-tight">{title}</h2>
      {children}
    </section>
  );
}

export function GenericSectionEditor({
  sections,
  kinds,
  disabled,
  addLabel,
  blankTitle = "New section",
  blankBody = "Add clinic-provided guidance.",
  onChange,
}: {
  sections: EditorSection[];
  kinds: GuideSectionKind[];
  disabled: boolean;
  addLabel: string;
  blankTitle?: string;
  blankBody?: string;
  onChange: (sections: EditorSection[]) => void;
}) {
  function update(index: number, patch: Partial<EditorSection>) {
    onChange(
      sections.map((section, current) =>
        current === index ? { ...section, ...patch } : section
      )
    );
  }

  function move(index: number, direction: -1 | 1) {
    const next = index + direction;
    if (next < 0 || next >= sections.length) {
      return;
    }
    const copy = [...sections];
    const [removed] = copy.splice(index, 1);
    copy.splice(next, 0, removed);
    onChange(copy);
  }

  return (
    <div className="flex flex-col gap-4">
      {sections.map((section, index) => (
        <article
          key={section.key}
          className="flex flex-col gap-3 rounded-lg border border-staff-line p-4"
          data-section-key={section.key}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Section type" htmlFor={`${section.key}-kind`}>
              <select
                id={`${section.key}-kind`}
                value={section.kind}
                onChange={(event) =>
                  update(index, {
                    kind: event.target.value as GuideSectionKind,
                  })
                }
                disabled={disabled}
                className="staffSelect"
              >
                {kinds.map((kind) => (
                  <option key={kind} value={kind}>
                    {guideSectionKindLabel(kind)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Title" htmlFor={`${section.key}-title`}>
              <input
                id={`${section.key}-title`}
                value={section.title}
                onChange={(event) =>
                  update(index, { title: event.target.value })
                }
                disabled={disabled}
                className="staffField"
              />
            </Field>
          </div>
          <Field label="Guidance" htmlFor={`${section.key}-body`}>
            <textarea
              id={`${section.key}-body`}
              value={section.body}
              onChange={(event) => update(index, { body: event.target.value })}
              disabled={disabled}
              rows={4}
              className="staffField"
            />
          </Field>
          {disabled ? null : (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => move(index, -1)}
                className="staffBtn staffBtnSecondary"
              >
                Move up
              </button>
              <button
                type="button"
                onClick={() => move(index, 1)}
                className="staffBtn staffBtnSecondary"
              >
                Move down
              </button>
              <button
                type="button"
                onClick={() =>
                  onChange(sections.filter((_, current) => current !== index))
                }
                className="staffBtn staffBtnSecondary"
              >
                Remove
              </button>
            </div>
          )}
        </article>
      ))}
      {disabled ? null : (
        <button
          type="button"
          onClick={() =>
            onChange([
              ...sections,
              {
                key: newGuideContentKey("section"),
                kind: kinds[0] ?? "CUSTOM",
                title: blankTitle,
                body: blankBody,
                periodLabel: "",
                startDay: "",
                endDay: "",
                homeCareInstructions: [],
              },
            ])
          }
          className="staffBtn staffBtnSecondary self-start"
        >
          {addLabel}
        </button>
      )}
    </div>
  );
}

export function HomeCarePlanEditor({
  sections,
  disabled,
  blankPlanTitle = "Home care plan",
  blankInstructionTitle = "",
  onChange,
}: {
  sections: EditorSection[];
  disabled: boolean;
  blankPlanTitle?: string;
  blankInstructionTitle?: string;
  onChange: (sections: EditorSection[]) => void;
}) {
  function updateSection(index: number, patch: Partial<EditorSection>) {
    onChange(
      sections.map((section, current) =>
        current === index ? { ...section, ...patch } : section
      )
    );
  }

  function updateInstructions(
    index: number,
    instructions: EditorHomeCareInstruction[]
  ) {
    updateSection(index, { homeCareInstructions: instructions });
  }

  return (
    <div className="flex flex-col gap-4">
      {sections.map((section, index) => (
        <article
          key={section.key}
          className="flex flex-col gap-3 rounded-lg border border-staff-line p-4"
          data-section-key={section.key}
        >
          <Field label="Plan title" htmlFor={`${section.key}-title`}>
            <input
              id={`${section.key}-title`}
              value={section.title}
              onChange={(event) =>
                updateSection(index, { title: event.target.value })
              }
              disabled={disabled}
              className="staffField"
            />
          </Field>
          <Field label="Optional introduction" htmlFor={`${section.key}-body`}>
            <textarea
              id={`${section.key}-body`}
              value={section.body}
              onChange={(event) =>
                updateSection(index, { body: event.target.value })
              }
              disabled={disabled}
              rows={4}
              className="staffField"
            />
          </Field>
          <div className="flex flex-col gap-3">
            {section.homeCareInstructions.map((item, itemIndex) => (
              <HomeCareInstructionFields
                key={item.key}
                item={item}
                index={itemIndex}
                count={section.homeCareInstructions.length}
                disabled={disabled}
                onChange={(next) =>
                  updateInstructions(
                    index,
                    section.homeCareInstructions.map((current, position) =>
                      position === itemIndex ? next : current
                    )
                  )
                }
                onMove={(direction) => {
                  const target = itemIndex + direction;
                  if (
                    target < 0 ||
                    target >= section.homeCareInstructions.length
                  ) {
                    return;
                  }
                  const next = [...section.homeCareInstructions];
                  const [removed] = next.splice(itemIndex, 1);
                  next.splice(target, 0, removed);
                  updateInstructions(index, next);
                }}
                onRemove={() =>
                  updateInstructions(
                    index,
                    section.homeCareInstructions.filter(
                      (_, position) => position !== itemIndex
                    )
                  )
                }
              />
            ))}
          </div>
          {disabled ? null : (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="staffBtn staffBtnSecondary"
                onClick={() =>
                  updateInstructions(index, [
                    ...section.homeCareInstructions,
                    blankHomeCareInstruction(blankInstructionTitle),
                  ])
                }
              >
                Add instruction
              </button>
              <button
                type="button"
                className="staffBtn staffBtnSecondary"
                onClick={() =>
                  onChange(sections.filter((_, current) => current !== index))
                }
              >
                Remove plan
              </button>
            </div>
          )}
        </article>
      ))}
      {disabled ? null : (
        <button
          type="button"
          className="staffBtn staffBtnSecondary self-start"
          onClick={() =>
            onChange([
              ...sections,
              {
                key: newGuideContentKey("plan"),
                kind: "HOME_CARE_PLAN",
                title: blankPlanTitle,
                body: "",
                periodLabel: "",
                startDay: "",
                endDay: "",
                homeCareInstructions: [
                  blankHomeCareInstruction(blankInstructionTitle),
                ],
              },
            ])
          }
        >
          Add home-care plan
        </button>
      )}
    </div>
  );
}
