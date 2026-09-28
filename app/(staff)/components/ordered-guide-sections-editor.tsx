"use client";

import { guideSectionKindLabel } from "@/lib/aftercare/guide-section-kind-label";
import {
  GUIDE_SECTION_KINDS,
  type GuideSectionKind,
} from "@/lib/aftercare/types";
import type { EditorSection } from "@/app/(staff)/(clinic-portal)/guides/timeline-accordion";
import { AutosizeTextarea } from "@/app/(staff)/components/autosize-textarea";
import { GuideSectionKindIcon } from "@/app/(staff)/components/guide-section-kind-icon";
import { HomeCareInstructionFields } from "@/app/(staff)/components/home-care-instruction-fields";
import { SectionOrderControls } from "@/app/(staff)/components/section-order-controls";
import {
  blankHomeCareInstruction,
  Field,
  newGuideContentKey,
} from "@/app/(staff)/components/guide-section-editors";

const PLACEHOLDER = {
  title: "Example section title",
  guidance: "Enter guidance...",
  stageTitle: "Example stage title",
  period: "Example period label",
  instructions: "Enter instructions...",
  planTitle: "Example plan title",
  introduction: "Enter an introduction...",
} as const;

function blankSection(kind: GuideSectionKind): EditorSection {
  return {
    key: newGuideContentKey(
      kind === "HOME_CARE_PLAN"
        ? "plan"
        : kind === "RECOVERY_TIMELINE"
          ? "stage"
          : "section"
    ),
    kind,
    title: "",
    body: "",
    periodLabel: "",
    startDay: "",
    endDay: "",
    homeCareInstructions:
      kind === "HOME_CARE_PLAN" ? [blankHomeCareInstruction()] : [],
  };
}

function titlePlaceholder(kind: GuideSectionKind): string {
  if (kind === "RECOVERY_TIMELINE") {
    return PLACEHOLDER.stageTitle;
  }
  if (kind === "HOME_CARE_PLAN") {
    return PLACEHOLDER.planTitle;
  }
  return PLACEHOLDER.title;
}

function bodyPlaceholder(kind: GuideSectionKind): string {
  if (kind === "RECOVERY_TIMELINE") {
    return PLACEHOLDER.instructions;
  }
  if (kind === "HOME_CARE_PLAN") {
    return PLACEHOLDER.introduction;
  }
  return PLACEHOLDER.guidance;
}

export function OrderedGuideSectionsEditor({
  sections,
  disabled,
  onChange,
}: {
  sections: EditorSection[];
  disabled: boolean;
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
      {sections.map((section, index) => {
        const label = guideSectionKindLabel(section.kind);
        return (
          <article
            key={section.key}
            className="flex flex-col gap-3 rounded-lg border border-staff-line p-4"
            data-section-key={section.key}
            data-section-kind={section.kind}
          >
            <header className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="flex min-w-0 items-center gap-2 text-sm font-semibold tracking-tight">
                <span className="text-staff-muted">
                  <GuideSectionKindIcon kind={section.kind} />
                </span>
                {label}
              </h3>
              {disabled ? null : (
                <SectionOrderControls
                  label={label}
                  index={index}
                  count={sections.length}
                  onMove={(direction) => move(index, direction)}
                  onRemove={() =>
                    onChange(sections.filter((_, current) => current !== index))
                  }
                />
              )}
            </header>
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
                            : [blankHomeCareInstruction()]
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
                label={
                  section.kind === "HOME_CARE_PLAN" ? "Plan title" : "Title"
                }
                htmlFor={`${section.key}-title`}
              >
                <input
                  id={`${section.key}-title`}
                  value={section.title}
                  disabled={disabled}
                  placeholder={titlePlaceholder(section.kind)}
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
                    placeholder={PLACEHOLDER.period}
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
                    placeholder="0"
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
                    placeholder="0"
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
              <AutosizeTextarea
                id={`${section.key}-body`}
                value={section.body}
                disabled={disabled}
                placeholder={bodyPlaceholder(section.kind)}
                onChange={(event) =>
                  update(index, { body: event.target.value })
                }
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
                        homeCareInstructions:
                          section.homeCareInstructions.filter(
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
                          blankHomeCareInstruction(),
                        ],
                      })
                    }
                  >
                    Add instruction
                  </button>
                )}
              </div>
            ) : null}
          </article>
        );
      })}
      {disabled ? null : (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="staffBtn staffBtnSecondary gap-2"
            onClick={() =>
              onChange([...sections, blankSection("INTRODUCTION")])
            }
          >
            <GuideSectionKindIcon kind="INTRODUCTION" />
            Add section
          </button>
          <button
            type="button"
            className="staffBtn staffBtnSecondary gap-2"
            onClick={() =>
              onChange([...sections, blankSection("RECOVERY_TIMELINE")])
            }
          >
            <GuideSectionKindIcon kind="RECOVERY_TIMELINE" />
            Add timeline stage
          </button>
          <button
            type="button"
            className="staffBtn staffBtnSecondary gap-2"
            onClick={() =>
              onChange([...sections, blankSection("HOME_CARE_PLAN")])
            }
          >
            <GuideSectionKindIcon kind="HOME_CARE_PLAN" />
            Add home-care plan
          </button>
        </div>
      )}
    </div>
  );
}
