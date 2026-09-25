import type { PublishedPracticeGuideSummary } from "@/lib/aftercare/types";

import styles from "../patient.module.css";

export function GuideList({
  guides,
  instructionsLabel,
}: {
  guides: PublishedPracticeGuideSummary[];
  instructionsLabel: string;
}) {
  if (guides.length === 0) {
    return (
      <p className={styles.empty}>
        No {instructionsLabel.toLowerCase()} are published by this practice yet.
        Contact the practice if you need recovery information after treatment.
      </p>
    );
  }

  return (
    <nav aria-label={instructionsLabel}>
      <ul className={styles.guideList}>
        {guides.map((guide) => (
          <li key={guide.id}>
            <a
              className={styles.guideLink}
              href={guide.href ?? `/${guide.publicSlug}`}
            >
              <span>
                <span className={styles.guideTitle}>{guide.title}</span>
                <span className={styles.guideHint}>
                  View {instructionsLabel.toLowerCase()}
                </span>
              </span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
