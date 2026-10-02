"use client";

import {
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import styles from "../patient.module.css";

export interface PatientDemoView {
  id: string;
  label: string;
  content: ReactNode;
}

export function PatientDemoExperience({
  views,
  printHref,
}: {
  views: readonly PatientDemoView[];
  printHref: string;
}) {
  const [view, setView] = useState(views[0]?.id ?? "guide");
  const baseId = useId();
  const tabRefs = useRef<Partial<Record<string, HTMLButtonElement | null>>>({});
  const selected = views.some((item) => item.id === view)
    ? view
    : (views[0]?.id ?? "guide");

  function selectView(next: string) {
    setView(next);
    tabRefs.current[next]?.focus();
  }

  function onTabKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    index: number
  ) {
    if (
      event.key !== "ArrowRight" &&
      event.key !== "ArrowLeft" &&
      event.key !== "Home" &&
      event.key !== "End"
    ) {
      return;
    }

    event.preventDefault();
    const last = views.length - 1;
    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? last
          : event.key === "ArrowRight"
            ? (index + 1) % views.length
            : (index - 1 + views.length) % views.length;
    const next = views[nextIndex];
    if (next) {
      selectView(next.id);
    }
  }

  if (views.length < 2) {
    return (
      <div className={styles.demoExperience} data-demo-view={selected}>
        <div className={styles.demoNav}>
          <a
            className={styles.demoPrint}
            href={printHref}
            aria-label="Print / Save PDF"
          >
            Print / Save PDF
          </a>
        </div>
        {views[0]?.content}
      </div>
    );
  }

  return (
    <div className={styles.demoExperience} data-demo-view={selected}>
      <div className={styles.demoNav}>
        <div
          role="tablist"
          aria-label="Guide views"
          className={styles.demoTabs}
        >
          {views.map((tab, index) => {
            const isSelected = selected === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                id={`${baseId}-${tab.id}`}
                aria-controls={`${baseId}-${tab.id}-panel`}
                aria-selected={isSelected}
                tabIndex={isSelected ? 0 : -1}
                className={styles.demoTab}
                ref={(node) => {
                  tabRefs.current[tab.id] = node;
                }}
                onClick={() => setView(tab.id)}
                onKeyDown={(event) => onTabKeyDown(event, index)}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
        <a
          className={styles.demoPrint}
          href={printHref}
          aria-label="Print / Save PDF"
        >
          Print / Save PDF
        </a>
      </div>

      {views.map((tab) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={`${baseId}-${tab.id}-panel`}
          aria-labelledby={`${baseId}-${tab.id}`}
          hidden={selected !== tab.id}
        >
          {tab.content}
        </div>
      ))}
    </div>
  );
}
