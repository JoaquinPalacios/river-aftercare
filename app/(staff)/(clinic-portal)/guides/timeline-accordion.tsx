"use client";

import { firstSectionParagraph } from "@/lib/aftercare/section-body";
import { relativeStageWhenLabel } from "@/lib/aftercare/recovery-day-label";
import { validateTimelineRanges } from "@/lib/aftercare/timeline-range";
import type { GuideSectionKind } from "@/lib/aftercare/types";

export interface EditorSection {
  key: string;
  kind: GuideSectionKind;
  title: string;
  body: string;
  periodLabel: string;
  startDay: string;
  endDay: string;
}

function optionalDay(value: string): number | null {
  if (value.trim() === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

export function timelineStageErrorKeys(stages: EditorSection[]): Set<string> {
  const keys = new Set<string>();
  for (const stage of stages) {
    if (!stage.title.trim() || !stage.body.trim()) {
      keys.add(stage.key);
    }
  }

  const issues = validateTimelineRanges(
    stages.map((stage) => ({
      key: stage.key,
      periodLabel: stage.periodLabel,
      startDay: optionalDay(stage.startDay),
      endDay: optionalDay(stage.endDay),
    }))
  );
  for (const issue of issues) {
    for (const key of issue.keys) {
      keys.add(key);
    }
  }

  return keys;
}

export function TimelineAccordion({
  stages,
  disabled,
  expandedKey,
  onExpandedKeyChange,
  onChange,
}: {
  stages: EditorSection[];
  disabled: boolean;
  expandedKey: string | null;
  onExpandedKeyChange: (key: string | null) => void;
  onChange: (stages: EditorSection[]) => void;
}) {
  const errorKeys = timelineStageErrorKeys(stages);

  function update(index: number, patch: Partial<EditorSection>) {
    onChange(
      stages.map((stage, current) =>
        current === index ? { ...stage, ...patch } : stage
      )
    );
  }

  function move(index: number, direction: -1 | 1) {
    const next = index + direction;
    if (next < 0 || next >= stages.length) {
      return;
    }
    const copy = [...stages];
    const [removed] = copy.splice(index, 1);
    copy.splice(next, 0, removed);
    onChange(copy);
  }

  return (
    <div className="flex flex-col gap-3">
      {stages.map((stage, index) => {
        const expanded = expandedKey === stage.key;
        const panelId = `${stage.key}-panel`;
        const headerId = `${stage.key}-header`;
        const when = relativeStageWhenLabel({
          periodLabel: stage.periodLabel,
          startDay: optionalDay(stage.startDay),
          endDay: optionalDay(stage.endDay),
        });
        const excerpt = firstSectionParagraph(stage.body);
        const needsAttention = errorKeys.has(stage.key);

        return (
          <article
            key={stage.key}
            className="staffAccordionCard"
            data-stage-key={stage.key}
            data-expanded={expanded ? "true" : "false"}
          >
            <h3 className="m-0">
              <button
                type="button"
                id={headerId}
                className="staffAccordionTrigger"
                aria-expanded={expanded}
                aria-controls={panelId}
                onClick={() => onExpandedKeyChange(expanded ? null : stage.key)}
              >
                <span>
                  <p className="staffAccordionWhen">{when}</p>
                  <p className="staffAccordionWhat">
                    {stage.title.trim() || "Untitled stage"}
                  </p>
                  {expanded || !excerpt ? null : (
                    <p className="staffAccordionExcerpt">{excerpt}</p>
                  )}
                  {needsAttention ? (
                    <p className="staffAttention mt-1">Needs attention</p>
                  ) : null}
                </span>
              </button>
            </h3>
            <div
              id={panelId}
              role="region"
              aria-labelledby={headerId}
              className="staffAccordionPanel"
              data-open={expanded ? "true" : "false"}
              inert={!expanded || undefined}
            >
              <div className="staffAccordionPanelInner">
                <div className="staffAccordionFields">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Period label" htmlFor={`${stage.key}-period`}>
                      <input
                        id={`${stage.key}-period`}
                        value={stage.periodLabel}
                        onChange={(event) =>
                          update(index, { periodLabel: event.target.value })
                        }
                        disabled={disabled}
                        className="staffField"
                      />
                    </Field>
                    <Field label="Title" htmlFor={`${stage.key}-title`}>
                      <input
                        id={`${stage.key}-title`}
                        value={stage.title}
                        onChange={(event) =>
                          update(index, { title: event.target.value })
                        }
                        disabled={disabled}
                        className="staffField"
                      />
                    </Field>
                    <Field label="Start day" htmlFor={`${stage.key}-start`}>
                      <input
                        id={`${stage.key}-start`}
                        type="number"
                        inputMode="numeric"
                        min={0}
                        step={1}
                        value={stage.startDay}
                        onChange={(event) =>
                          update(index, { startDay: event.target.value })
                        }
                        disabled={disabled}
                        className="staffField staffFieldNarrow"
                      />
                    </Field>
                    <Field label="End day" htmlFor={`${stage.key}-end`}>
                      <input
                        id={`${stage.key}-end`}
                        type="number"
                        inputMode="numeric"
                        min={0}
                        step={1}
                        value={stage.endDay}
                        onChange={(event) =>
                          update(index, { endDay: event.target.value })
                        }
                        disabled={disabled}
                        className="staffField staffFieldNarrow"
                      />
                    </Field>
                  </div>
                  <Field label="Instructions" htmlFor={`${stage.key}-body`}>
                    <textarea
                      id={`${stage.key}-body`}
                      value={stage.body}
                      onChange={(event) =>
                        update(index, { body: event.target.value })
                      }
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
                        onClick={() => {
                          const next = stages.filter(
                            (_, current) => current !== index
                          );
                          onChange(next);
                          if (expandedKey === stage.key) {
                            onExpandedKeyChange(next[0]?.key ?? null);
                          }
                        }}
                        className="staffBtn staffBtnSecondary"
                      >
                        Remove stage
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
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
