"use client";

import { useState } from "react";

import {
  PLAN_COMPARISON_COLUMNS,
  PLAN_COMPARISON_CONTROL_LABEL,
  PLAN_COMPARISON_PANEL_ID,
  PLAN_COMPARISON_ROWS,
  type PlanComparisonValue,
} from "@/lib/marketing/plans";

import styles from "../marketing.module.css";

const COMPARISON_TRIGGER_ID = "plan-comparison-trigger";

function ComparisonCheck() {
  return (
    <svg
      className={styles.planCompareCheck}
      viewBox="0 0 16 16"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M3.2 8.3 6.4 11.4 12.8 4.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ComparisonValue({
  planName,
  value,
}: {
  planName: string;
  value: PlanComparisonValue;
}) {
  return (
    <>
      <span className={styles.planComparePlanLabel} data-plan-label={planName}>
        {planName}
      </span>
      {value.kind === "included" ? (
        <span className={styles.planCompareValueIncluded}>
          <ComparisonCheck />
          {value.label}
        </span>
      ) : value.kind === "dash" ? (
        <span className={styles.planCompareValueMuted}>
          <span aria-hidden="true">{value.label}</span>
          <span className={styles.srOnly}>Not included</span>
        </span>
      ) : (
        <span
          className={
            value.kind === "not-included"
              ? styles.planCompareValueMuted
              : styles.planCompareValue
          }
        >
          {value.label}
        </span>
      )}
    </>
  );
}

export function MarketingPlanComparison() {
  const [open, setOpen] = useState(false);

  return (
    <div className={styles.planCompare} data-mk-plan-comparison="">
      <button
        id={COMPARISON_TRIGGER_ID}
        type="button"
        className={styles.planCompareTrigger}
        aria-expanded={open}
        aria-controls={PLAN_COMPARISON_PANEL_ID}
        onClick={() => setOpen((current) => !current)}
      >
        <span className={styles.planCompareTriggerLabel}>
          {PLAN_COMPARISON_CONTROL_LABEL}
        </span>
        <span className={styles.planCompareChevron} aria-hidden="true" />
      </button>
      <div
        id={PLAN_COMPARISON_PANEL_ID}
        className={styles.planComparePanel}
        hidden={!open}
        role="region"
        aria-labelledby={COMPARISON_TRIGGER_ID}
      >
        <table className={styles.planCompareTable}>
          <caption className={styles.srOnly}>
            {PLAN_COMPARISON_CONTROL_LABEL} across Essential, Practice and Group
          </caption>
          <thead>
            <tr>
              <th scope="col">Feature</th>
              {PLAN_COMPARISON_COLUMNS.map((column) => (
                <th
                  key={column.id}
                  scope="col"
                  className={
                    column.recommended ? styles.planComparePractice : undefined
                  }
                >
                  {column.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PLAN_COMPARISON_ROWS.map((row) => (
              <tr key={row.id} data-comparison-row={row.id}>
                <th scope="row">{row.feature}</th>
                {PLAN_COMPARISON_COLUMNS.map((column) => (
                  <td
                    key={column.id}
                    className={
                      column.recommended
                        ? styles.planComparePractice
                        : undefined
                    }
                    data-plan={column.id}
                  >
                    <ComparisonValue
                      planName={column.name}
                      value={row[column.id]}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
