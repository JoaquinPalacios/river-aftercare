import { MarketingRevealCard } from "@/app/(marketing)/components/marketing-experience";

import styles from "../marketing.module.css";

export type MarketingNumberedStep =
  | string
  | {
      title: string;
      body: string;
    };

function stepKey(item: MarketingNumberedStep, index: number): string {
  return typeof item === "string" ? item : `${index}-${item.title}`;
}

function stepBody(item: MarketingNumberedStep): string {
  return typeof item === "string" ? item : item.body;
}

export function MarketingNumberedSteps({
  items,
  className,
}: {
  items: readonly MarketingNumberedStep[];
  className?: string;
}) {
  return (
    <ol
      className={
        className
          ? `${styles.numberedSteps} ${className}`
          : styles.numberedSteps
      }
      data-mk-numbered-steps=""
    >
      {items.map((item, index) => (
        <MarketingRevealCard
          key={stepKey(item, index)}
          as="li"
          index={index}
          className={styles.numberedStep}
        >
          <span className={styles.numberedStepIndex} aria-hidden="true">
            {String(index + 1).padStart(2, "0")}
          </span>
          <span className={styles.numberedStepRule} aria-hidden="true" />
          {typeof item === "string" ? (
            <p className={styles.numberedStepCopy}>{item}</p>
          ) : (
            <div className={styles.numberedStepCopyBlock}>
              <p className={styles.numberedStepTitle}>{item.title}</p>
              <p className={styles.numberedStepCopy}>{stepBody(item)}</p>
            </div>
          )}
        </MarketingRevealCard>
      ))}
    </ol>
  );
}
