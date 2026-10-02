import { GuideContent } from "@/app/(aftercare)/components/guide-content";
import type { TimelineStageStatus } from "@/lib/aftercare/demo-recovery-state";
import { patientGuidePrintFlow } from "@/lib/aftercare/patient-print-flow";
import type { ComposedGuideSection } from "@/lib/aftercare/types";

const STATUS_LABEL: Record<TimelineStageStatus, string> = {
  earlier: "Earlier",
  current: "Current",
  upcoming: "Upcoming",
};

export interface RecoveryTimelineListClasses {
  timeline: string;
  sectionTitle: string;
  timelineList: string;
  timelineItem: string;
  timelinePeriod: string;
  timelineRail: string;
  timelineContent: string;
  body?: string;
  timelineSeparator?: string;
  timelineStatus?: string;
  vh?: string;
}

export function RecoveryTimelineList({
  sections,
  stageStatusByKey,
  heading = "Recovery guide",
  headingId = "recovery-timeline-heading",
  headingIdPrefix,
  classes,
  compact = false,
  labelledAsPreview = false,
}: {
  sections: ComposedGuideSection[];
  stageStatusByKey?: Readonly<Record<string, TimelineStageStatus>>;
  heading?: string;
  headingId?: string;
  headingIdPrefix?: string;
  classes: RecoveryTimelineListClasses;
  compact?: boolean;
  labelledAsPreview?: boolean;
}) {
  if (sections.length === 0) {
    return null;
  }

  const lastIndex = sections.length - 1;

  return (
    <section
      className={classes.timeline}
      aria-label={labelledAsPreview ? heading : undefined}
      aria-labelledby={labelledAsPreview ? undefined : headingId}
    >
      {labelledAsPreview ? (
        <h2 id={headingId} className="sr-only">
          {heading}
        </h2>
      ) : (
        <h2 id={headingId} className={classes.sectionTitle}>
          {heading}
        </h2>
      )}
      <ol className={classes.timelineList}>
        {sections.map((section, index) => {
          const headingKey = headingIdPrefix
            ? `${headingIdPrefix}-section-${section.key}`
            : `section-${section.key}`;
          const period = section.periodLabel;
          const status = stageStatusByKey?.[section.key];
          const isLast = index === lastIndex;

          return (
            <li
              key={section.key}
              className={classes.timelineItem}
              data-status={status}
              data-timeline-stage={section.key}
              data-print-flow={patientGuidePrintFlow(
                `${period ?? ""}\n${section.title}\n${section.body}`
              )}
            >
              {period ? (
                <p className={classes.timelinePeriod}>{period}</p>
              ) : (
                <p className={classes.timelinePeriod} aria-hidden="true" />
              )}
              <span className={classes.timelineRail} aria-hidden="true" />
              <div className={classes.timelineContent}>
                <h3 id={headingKey} className={classes.sectionTitle}>
                  {status && classes.vh ? (
                    <span className={classes.vh}>{STATUS_LABEL[status]}. </span>
                  ) : null}
                  {section.title}
                </h3>
                {status && classes.timelineStatus ? (
                  <p className={classes.timelineStatus}>
                    {STATUS_LABEL[status]}
                  </p>
                ) : null}
                {compact || !classes.body ? null : (
                  <GuideContent text={section.body} idPrefix={section.key} />
                )}
                {isLast || !classes.timelineSeparator ? null : (
                  <div
                    className={classes.timelineSeparator}
                    aria-hidden="true"
                    data-timeline-separator=""
                  />
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
