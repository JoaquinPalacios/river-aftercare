"use client";

import { useLayoutEffect, useRef, useState } from "react";

import type { EditorHomeCareInstruction } from "@/app/(staff)/(clinic-portal)/guides/timeline-accordion";
import { HomeCareInstructionFields } from "@/app/(staff)/components/home-care-instruction-fields";
import { DisclosureChevron } from "@/app/(staff)/components/icons";
import { homeCareInstructionAccordionLabel } from "@/lib/aftercare/home-care-instruction";

export function homeCareInstructionDisclosureName(input: {
  open: boolean;
  summary: string;
  title: string;
  index: number;
}): string {
  const verb = input.open ? "Collapse" : "Expand";
  const trimmed = input.title.trim();
  const numbered = `Instruction ${input.index + 1}`;
  const subject =
    trimmed && trimmed.toLowerCase() !== numbered.toLowerCase()
      ? trimmed
      : numbered;
  const schedule = input.summary.startsWith(`${subject} · `)
    ? input.summary.slice(subject.length)
    : "";
  return `${verb} ${subject}${schedule}`;
}

function blankInstruction(title: string): EditorHomeCareInstruction {
  return {
    key: `item-${Math.random().toString(36).slice(2, 8)}`,
    title,
    body: "",
    frequencyCount: "",
    frequencyPeriod: "",
    timingLabel: "",
    durationValue: "",
    durationUnit: "",
  };
}

export function HomeCareInstructionAccordions({
  instructions,
  disabled,
  blankTitle = "",
  onChange,
}: {
  instructions: EditorHomeCareInstruction[];
  disabled: boolean;
  blankTitle?: string;
  onChange: (instructions: EditorHomeCareInstruction[]) => void;
}) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(
    () => new Set()
  );
  const [scrollKey, setScrollKey] = useState<string | null>(null);
  const itemRefs = useRef(new Map<string, HTMLElement>());

  useLayoutEffect(() => {
    if (!scrollKey) {
      return;
    }
    const node = itemRefs.current.get(scrollKey);
    if (!node) {
      return;
    }
    const key = scrollKey;
    setScrollKey(null);
    node.scrollIntoView({ behavior: "smooth", block: "start" });
    node.querySelector<HTMLInputElement>(`[id="${key}-title"]`)?.focus({
      preventScroll: true,
    });
  }, [scrollKey, expanded]);

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

  function updateItem(index: number, next: EditorHomeCareInstruction) {
    onChange(
      instructions.map((item, position) => (position === index ? next : item))
    );
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= instructions.length) {
      return;
    }
    const next = [...instructions];
    const [removed] = next.splice(index, 1);
    next.splice(target, 0, removed);
    onChange(next);
  }

  function remove(index: number) {
    onChange(instructions.filter((_, position) => position !== index));
  }

  function add() {
    const item = blankInstruction(blankTitle);
    setExpanded((current) => {
      const next = new Set(current);
      next.add(item.key);
      return next;
    });
    setScrollKey(item.key);
    onChange([...instructions, item]);
  }

  const onlyInstruction = instructions.length <= 1;

  return (
    <div className="flex flex-col gap-3">
      {instructions.length > 1 ? (
        <div className="homeCareInstructionTools">
          <button
            type="button"
            className="staffBtn staffBtnQuiet"
            onClick={() =>
              setExpanded(new Set(instructions.map((item) => item.key)))
            }
          >
            Expand instructions
          </button>
          <button
            type="button"
            className="staffBtn staffBtnQuiet"
            onClick={() => setExpanded(new Set())}
          >
            Collapse instructions
          </button>
        </div>
      ) : null}
      {instructions.map((item, index) => {
        const open = expanded.has(item.key);
        const panelId = `${item.key}-instruction-panel`;
        const headerId = `${item.key}-instruction-header`;
        const removeHintId = `${item.key}-remove-hint`;
        const summary = homeCareInstructionAccordionLabel({
          index,
          title: item.title,
          frequencyCount: item.frequencyCount,
          frequencyPeriod: item.frequencyPeriod,
          timingLabel: item.timingLabel,
          durationValue: item.durationValue,
          durationUnit: item.durationUnit,
        });
        return (
          <div
            key={item.key}
            ref={(node) => {
              if (node) {
                itemRefs.current.set(item.key, node);
              } else {
                itemRefs.current.delete(item.key);
              }
            }}
            className="homeCareInstruction"
            data-instruction-key={item.key}
            data-expanded={open ? "true" : "false"}
          >
            <header className="homeCareInstructionHeader">
              <h4 className="homeCareInstructionHeading">
                <button
                  type="button"
                  id={headerId}
                  className="homeCareInstructionToggle"
                  aria-expanded={open}
                  aria-controls={panelId}
                  aria-label={homeCareInstructionDisclosureName({
                    open,
                    summary,
                    title: item.title,
                    index,
                  })}
                  onClick={() => toggle(item.key)}
                >
                  <DisclosureChevron
                    className="homeCareInstructionChevron"
                    direction={open ? "down" : "right"}
                  />
                  <span className="homeCareInstructionSummary">{summary}</span>
                </button>
              </h4>
              {disabled ? null : (
                <div className="homeCareInstructionActions">
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
                    disabled={index >= instructions.length - 1}
                  >
                    Move down
                  </button>
                  <button
                    type="button"
                    className="staffBtn staffBtnSecondary"
                    onClick={() => remove(index)}
                    disabled={onlyInstruction}
                    aria-describedby={
                      onlyInstruction ? removeHintId : undefined
                    }
                  >
                    Remove instruction
                  </button>
                </div>
              )}
            </header>
            {disabled || !onlyInstruction ? null : (
              <p id={removeHintId} className="homeCareInstructionHint">
                A plan needs at least one instruction. Clear these fields to
                replace it, or remove the whole plan.
              </p>
            )}
            <div
              id={panelId}
              role="region"
              aria-labelledby={headerId}
              className="staffAccordionPanel"
              data-open={open ? "true" : "false"}
              inert={!open || undefined}
            >
              <div className="staffAccordionPanelInner">
                <HomeCareInstructionFields
                  item={item}
                  index={index}
                  disabled={disabled}
                  onChange={(next) => updateItem(index, next)}
                />
              </div>
            </div>
          </div>
        );
      })}
      {disabled ? null : (
        <button
          type="button"
          className="staffBtn staffBtnSecondary self-start"
          onClick={add}
        >
          Add instruction
        </button>
      )}
    </div>
  );
}
