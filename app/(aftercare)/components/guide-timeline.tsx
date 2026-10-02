import { RecoveryTimelineList } from "@/app/(aftercare)/components/recovery-timeline-list";
import type { TimelineStageStatus } from "@/lib/aftercare/demo-recovery-state";
import type { ComposedGuideSection } from "@/lib/aftercare/types";

import styles from "../patient.module.css";

export function GuideTimeline({
  sections,
  stageStatusByKey,
  heading = "Recovery guide",
  headingId = "recovery-timeline-heading",
  headingIdPrefix,
}: {
  sections: ComposedGuideSection[];
  stageStatusByKey?: Readonly<Record<string, TimelineStageStatus>>;
  heading?: string;
  headingId?: string;
  headingIdPrefix?: string;
}) {
  return (
    <RecoveryTimelineList
      sections={sections}
      stageStatusByKey={stageStatusByKey}
      heading={heading}
      headingId={headingId}
      headingIdPrefix={headingIdPrefix}
      classes={{
        timeline: styles.timeline,
        sectionTitle: styles.sectionTitle,
        timelineList: styles.timelineList,
        timelineItem: styles.timelineItem,
        timelinePeriod: styles.timelinePeriod,
        timelineRail: styles.timelineRail,
        timelineContent: styles.timelineContent,
        body: styles.body,
        timelineSeparator: styles.timelineSeparator,
        timelineStatus: styles.timelineStatus,
        vh: styles.vh,
      }}
    />
  );
}
