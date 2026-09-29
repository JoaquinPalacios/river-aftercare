"use client";

import { useLayoutEffect, useRef, useState } from "react";

import { guideSectionKindLabel } from "@/lib/aftercare/guide-section-kind-label";
import {
  guideBlockAccent,
  guideBlockFamily,
  guideBlockFamilyLabel,
  guideEditorBlockSummary,
  guideSectionKindsByLabel,
} from "@/lib/aftercare/guide-block-presentation";
import type { GuideSectionKind } from "@/lib/aftercare/types";
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
  focusRequest = null,
}: {
  sections: EditorSection[];
  disabled: boolean;
  onChange: (sections: EditorSection[]) => void;
  focusRequest?: { key: string; nonce: number } | null;
}) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(
    () => new Set()
  );
  const [scrollKey, setScrollKey] = useState<string | null>(null);
  const blockRefs = useRef(new Map<string, HTMLElement>());
  const seenFocus = useRef<number | null>(null);

  function queueReveal(key: string) {
    setExpanded((current) => {
      if (current.has(key)) {
        return current;
      }
      const next = new Set(current);
      next.add(key);
      return next;
    });
    setScrollKey(key);
  }

  useLayoutEffect(() => {
    if (!focusRequest || seenFocus.current === focusRequest.nonce) {
      return;
    }
    seenFocus.current = focusRequest.nonce;
    queueReveal(focusRequest.key);
  }, [focusRequest]);

  useLayoutEffect(() => {
    if (!scrollKey) {
      return;
    }
    const node = blockRefs.current.get(scrollKey);
    if (!node) {
      return;
    }
    const key = scrollKey;
    setScrollKey(null);
    node.scrollIntoView({ behavior: "smooth", block: "start" });
    const title = node.querySelector<HTMLInputElement>(`[id="${key}-title"]`);
    title?.focus({ preventScroll: true });
  }, [scrollKey, expanded]);

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

  function add(kind: GuideSectionKind) {
    const section = blankSection(kind);
    queueReveal(section.key);
    onChange([...sections, section]);
  }

  function toggle(key: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {sections.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="staffBtn staffBtnQuiet"
            onClick={() =>
              setExpanded(new Set(sections.map((section) => section.key)))
            }
          >
            Expand all
          </button>
          <button
            type="button"
            className="staffBtn staffBtnQuiet"
            onClick={() => setExpanded(new Set())}
          >
            Collapse all
          </button>
        </div>
      ) : null}
      {sections.map((section, index) => {
        const label = guideSectionKindLabel(section.kind);
        const family = guideBlockFamily(section.kind);
        const summary = guideEditorBlockSummary(section);
        const open = expanded.has(section.key);
        const panelId = `${section.key}-panel`;
        const headerId = `${section.key}-header`;
        return (
          <article
            key={section.key}
            id={`canonical-block-${section.key}`}
            ref={(node) => {
              if (node) {
                blockRefs.current.set(section.key, node);
              } else {
                blockRefs.current.delete(section.key);
              }
            }}
            className="canonicalEditorBlock"
            data-section-key={section.key}
            data-section-kind={section.kind}
            data-block-family={family}
            data-block-accent={guideBlockAccent(section.kind)}
            data-expanded={open ? "true" : "false"}
          >
            <header className="canonicalBlockHeader">
              <h3 className="canonicalBlockHeading">
                <button
                  type="button"
                  id={headerId}
                  className="canonicalBlockToggle"
                  aria-expanded={open}
                  aria-controls={panelId}
                  onClick={() => toggle(section.key)}
                >
                  <span className="canonicalBlockIcon">
                    <GuideSectionKindIcon kind={section.kind} />
                  </span>
                  <span className="canonicalBlockBadge">
                    {guideBlockFamilyLabel(section.kind)}
                  </span>
                  <span className="canonicalBlockSummary">{summary}</span>
                </button>
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
            <div
              id={panelId}
              role="region"
              aria-labelledby={headerId}
              className="staffAccordionPanel"
              data-open={open ? "true" : "false"}
              inert={!open || undefined}
            >
              <div className="staffAccordionPanelInner">
                <div className="canonicalBlockFields">
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
                        {guideSectionKindsByLabel().map((kind) => (
                          <option key={kind} value={kind}>
                            {guideSectionKindLabel(kind)}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field
                      label={
                        section.kind === "HOME_CARE_PLAN"
                          ? "Plan title"
                          : "Title"
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
                      <Field
                        label="Period label"
                        htmlFor={`${section.key}-period`}
                      >
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
                              homeCareInstructions:
                                section.homeCareInstructions.map(
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
                </div>
              </div>
            </div>
          </article>
        );
      })}
      {disabled ? null : (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="staffBtn staffBtnSecondary gap-2"
            onClick={() => add("INTRODUCTION")}
          >
            <GuideSectionKindIcon kind="INTRODUCTION" />
            Add section
          </button>
          <button
            type="button"
            className="staffBtn staffBtnSecondary gap-2"
            onClick={() => add("RECOVERY_TIMELINE")}
          >
            <GuideSectionKindIcon kind="RECOVERY_TIMELINE" />
            Add timeline stage
          </button>
          <button
            type="button"
            className="staffBtn staffBtnSecondary gap-2"
            onClick={() => add("HOME_CARE_PLAN")}
          >
            <GuideSectionKindIcon kind="HOME_CARE_PLAN" />
            Add home-care plan
          </button>
        </div>
      )}
    </div>
  );
}
