import { GuideContent } from "@/app/(aftercare)/components/guide-content";
import { formatHomeCareInstructionSummary } from "@/lib/aftercare/home-care-instruction";
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
      <GuideContent text={section.body} idPrefix={`${section.key}-intro`} />
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
              <GuideContent
                text={item.body ?? ""}
                idPrefix={`${section.key}-${item.key}`}
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
