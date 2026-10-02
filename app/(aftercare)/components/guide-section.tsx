import { GuideContent } from "@/app/(aftercare)/components/guide-content";
import {
  guideSectionTone,
  type GuideSectionTone,
} from "@/lib/aftercare/guide-section-tone";
import { patientGuidePrintFlow } from "@/lib/aftercare/patient-print-flow";
import type { ComposedGuideSection } from "@/lib/aftercare/types";

import styles from "../patient.module.css";

const TONE_CLASS: Record<GuideSectionTone, string | undefined> = {
  lead: undefined,
  default: undefined,
  warning: styles.warning,
  emergency: styles.emergency,
  reassurance: styles.reassurance,
  contact: styles.contact,
};

function sectionClassName(tone: GuideSectionTone): string {
  const toneClass = TONE_CLASS[tone];
  return toneClass ? `${styles.section} ${toneClass}` : styles.section;
}

function visuallyHiddenPrefix(tone: GuideSectionTone): string | null {
  if (tone === "warning") {
    return "Important. ";
  }
  if (tone === "emergency") {
    return "Urgent. ";
  }
  return null;
}

export function GuideSection({ section }: { section: ComposedGuideSection }) {
  const tone = guideSectionTone(section.kind);
  const headingId = `section-${section.key}`;
  const prefix = visuallyHiddenPrefix(tone);

  return (
    <section
      className={sectionClassName(tone)}
      data-guide-tone={tone}
      data-print-flow={patientGuidePrintFlow(section.body)}
      aria-labelledby={headingId}
    >
      <h2 id={headingId} className={styles.sectionTitle}>
        {prefix ? <span className={styles.vh}>{prefix}</span> : null}
        {section.title}
      </h2>
      <GuideContent text={section.body} idPrefix={section.key} />
    </section>
  );
}
