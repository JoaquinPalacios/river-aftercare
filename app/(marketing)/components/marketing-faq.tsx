import type { VerticalFaq } from "@/lib/marketing/vertical-landing";

import styles from "../marketing.module.css";

export function MarketingFaq({
  headingId,
  items,
}: {
  headingId: string;
  items: readonly VerticalFaq[];
}) {
  return (
    <div className={styles.verticalFaq}>
      {items.map((item, index) => {
        const questionId = `${headingId}-q-${index}`;
        const panelId = `${headingId}-a-${index}`;

        return (
          <details key={item.question} className={styles.verticalFaqItem}>
            <summary
              className={styles.verticalFaqQuestion}
              id={questionId}
              aria-controls={panelId}
            >
              <span className={styles.verticalFaqQuestionText}>
                {item.question}
              </span>
              <span className={styles.verticalFaqIcon} aria-hidden="true" />
            </summary>
            <div id={panelId} className={styles.verticalFaqPanel}>
              <p>{item.answer}</p>
            </div>
          </details>
        );
      })}
    </div>
  );
}
