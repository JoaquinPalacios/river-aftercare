"use client";

import { guideSectionKindLabel } from "@/lib/aftercare/guide-section-kind-label";
import {
  GUIDE_SECTION_KINDS,
  type GuideSectionKind,
} from "@/lib/aftercare/types";
import type { EditorSection } from "@/app/(staff)/(clinic-portal)/guides/timeline-accordion";
import { HomeCareInstructionFields } from "@/app/(staff)/components/home-care-instruction-fields";
import {
  blankHomeCareInstruction,
  Field,
  newGuideContentKey,
} from "@/app/(staff)/components/guide-section-editors";

function blankSection(
  kind: GuideSectionKind,
  copy: { title: string; body: string; instructionTitle: string }
): EditorSection {
  if (kind === "RECOVERY_TIMELINE") {
    return {
      key: newGuideContentKey("stage"),
      kind,
      title: copy.title,
      body: copy.body,
      periodLabel: "",
      startDay: "",
      endDay: "",
      homeCareInstructions: [],
    };
  }
  if (kind === "HOME_CARE_PLAN") {
    return {
      key: newGuideContentKey("plan"),
      kind,
      title: "Home care plan",
      body: "",
      periodLabel: "",
      startDay: "",
      endDay: "",
      homeCareInstructions: [blankHomeCareInstruction(copy.instructionTitle)],
    };
  }
  return {
    key: newGuideContentKey("section"),
    kind,
    title: copy.title,
    body: copy.body,
    periodLabel: "",
    startDay: "",
    endDay: "",
    homeCareInstructions: [],
  };
}

export function OrderedGuideSectionsEditor({
  sections,
  disabled,
  blankTitle = "Example section",
  blankBody = "Example section",
  blankInstructionTitle = "Example home-care item",
  onChange,
}: {
  sections: EditorSection[];
  disabled: boolean;
  blankTitle?: string;
  blankBody?: string;
  blankInstructionTitle?: string;
  onChange: (sections: EditorSection[]) => void;
}) {
  const copy = {
    title: blankTitle,
    body: blankBody,
    instructionTitle: blankInstructionTitle,
  };

  function update(index: number, patch: Partial<EditorSection>) {
    onChange(
      sections.map((section, current) =>
        current === index ? { ...section, ...patch } : section
      )
    );
  }

  function move(index: number, direction: -1 | 1) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= sections.length) {
      return;
    }
    const next = [...sections];
    const [removed] = next.splice(index, 1);
    next.splice(nextIndex, 0, removed);
    onChange(next);
  }

  return (
    <div className="flex flex-col gap-4">
      {sections.map((section, index) => (
        <article
          key={section.key}
          className="flex flex-col gap-3 rounded-lg border border-staff-line p-4"
          data-section-key={section.key}
          data-section-kind={section.kind}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Section type" htmlFor={`${section.key}-kind`}>
              <select
                id={`${section.key}-kind`}
                value={section.kind}
                disabled={disabled}
                className="staffSelect"
                onChange={(event) => {
                  const kind = event.target.value as GuideSectionKind;
                  update(index, {
                    kind,
                    homeCareInstructions:
                      kind === "HOME_CARE_PLAN"
                        ? section.homeCareInstructions.length > 0
                          ? section.homeCareInstructions
                          : [blankHomeCareInstruction(blankInstructionTitle)]
                        : [],
                  });
                }}
              >
                {GUIDE_SECTION_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {guideSectionKindLabel(kind)}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label={section.kind === "HOME_CARE_PLAN" ? "Plan title" : "Title"}
              htmlFor={`${section.key}-title`}
            >
              <input
                id={`${section.key}-title`}
                value={section.title}
                disabled={disabled}
                className="staffField"
                onChange={(event) =>
                  update(index, { title: event.target.value })
                }
              />
            </Field>
          </div>
          {section.kind === "RECOVERY_TIMELINE" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Period label" htmlFor={`${section.key}-period`}>
                <input
                  id={`${section.key}-period`}
                  value={section.periodLabel}
                  disabled={disabled}
                  className="staffField"
                  onChange={(event) =>
                    update(index, { periodLabel: event.target.value })
                  }
                />
              </Field>
              <Field label="Start day" htmlFor={`${section.key}-start`}>
                <input
                  id={`${section.key}-start`}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1}
                  value={section.startDay}
                  disabled={disabled}
                  className="staffField staffFieldNarrow"
                  onChange={(event) =>
                    update(index, { startDay: event.target.value })
                  }
                />
              </Field>
              <Field label="End day" htmlFor={`${section.key}-end`}>
                <input
                  id={`${section.key}-end`}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1}
                  value={section.endDay}
                  disabled={disabled}
                  className="staffField staffFieldNarrow"
                  onChange={(event) =>
                    update(index, { endDay: event.target.value })
                  }
                />
              </Field>
            </div>
          ) : null}
          <Field
            label={
              section.kind === "HOME_CARE_PLAN"
                ? "Optional introduction"
                : section.kind === "RECOVERY_TIMELINE"
                  ? "Instructions"
                  : "Guidance"
            }
            htmlFor={`${section.key}-body`}
          >
            <textarea
              id={`${section.key}-body`}
              value={section.body}
              disabled={disabled}
              rows={4}
              className="staffField"
              onChange={(event) => update(index, { body: event.target.value })}
            />
          </Field>
          {section.kind === "HOME_CARE_PLAN" ? (
            <div className="flex flex-col gap-3">
              {section.homeCareInstructions.map((item, itemIndex) => (
                <HomeCareInstructionFields
                  key={item.key}
                  item={item}
                  index={itemIndex}
                  count={section.homeCareInstructions.length}
                  disabled={disabled}
                  onChange={(next) =>
                    update(index, {
                      homeCareInstructions: section.homeCareInstructions.map(
                        (current, position) =>
                          position === itemIndex ? next : current
                      ),
                    })
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
                    update(index, { homeCareInstructions: next });
                  }}
                  onRemove={() =>
                    update(index, {
                      homeCareInstructions: section.homeCareInstructions.filter(
                        (_, position) => position !== itemIndex
                      ),
                    })
                  }
                />
              ))}
              {disabled ? null : (
                <button
                  type="button"
                  className="staffBtn staffBtnSecondary self-start"
                  onClick={() =>
                    update(index, {
                      homeCareInstructions: [
                        ...section.homeCareInstructions,
                        blankHomeCareInstruction(blankInstructionTitle),
                      ],
                    })
                  }
                >
                  Add instruction
                </button>
              )}
            </div>
          ) : null}
          {disabled ? null : (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="staffBtn staffBtnSecondary"
                onClick={() => move(index, -1)}
                disabled={index === 0}
              >
                Move up
              </button>
              <button
                type="button"
                className="staffBtn staffBtnSecondary"
                onClick={() => move(index, 1)}
                disabled={index === sections.length - 1}
              >
                Move down
              </button>
              <button
                type="button"
                className="staffBtn staffBtnSecondary"
                onClick={() =>
                  onChange(sections.filter((_, current) => current !== index))
                }
              >
                Remove
              </button>
            </div>
          )}
        </article>
      ))}
      {disabled ? null : (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="staffBtn staffBtnSecondary"
            onClick={() =>
              onChange([...sections, blankSection("INTRODUCTION", copy)])
            }
          >
            Add section
          </button>
          <button
            type="button"
            className="staffBtn staffBtnSecondary"
            onClick={() =>
              onChange([
                ...sections,
                blankSection("RECOVERY_TIMELINE", {
                  ...copy,
                  title: "Example timeline instruction",
                  body: "Example timeline instruction",
                }),
              ])
            }
          >
            Add timeline stage
          </button>
          <button
            type="button"
            className="staffBtn staffBtnSecondary"
            onClick={() =>
              onChange([...sections, blankSection("HOME_CARE_PLAN", copy)])
            }
          >
            Add home-care plan
          </button>
        </div>
      )}
    </div>
  );
}
