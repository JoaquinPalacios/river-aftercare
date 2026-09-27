import { formatHomeCareInstructionSummary } from "@/lib/aftercare/home-care-instruction";
import { sectionBodyParagraphs } from "@/lib/aftercare/section-body";
import type { ComposedGuideSection } from "@/lib/aftercare/types";

import styles from "../patient.module.css";

export function HomeCarePlan({ section }: { section: ComposedGuideSection }) {
  const headingId = `section-${section.key}`;
  const instructions = section.homeCareInstructions ?? [];

  return (
    <section className={styles.section} aria-labelledby={headingId}>
      <h2 id={headingId} className={styles.sectionTitle}>
        {section.title}
      </h2>
      {sectionBodyParagraphs(section.body).map((paragraph, index) => (
        <p key={`${section.key}-intro-${index}`} className={styles.body}>
          {paragraph}
        </p>
      ))}
      <ul className={styles.planList}>
        {instructions.map((item) => {
          const summary = formatHomeCareInstructionSummary(item);
          const detailId = `plan-${section.key}-${item.key}`;
          return (
            <li key={item.key} className={styles.planItem}>
              <h3 id={detailId} className={styles.planTitle}>
                {item.title}
              </h3>
              {summary ? <p className={styles.planMeta}>{summary}</p> : null}
              {sectionBodyParagraphs(item.body ?? "").map(
                (paragraph, index) => (
                  <p key={`${item.key}-body-${index}`} className={styles.body}>
                    {paragraph}
                  </p>
                )
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
