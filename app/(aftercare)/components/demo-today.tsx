import type {
  DemoTodayContent,
  ResolvedRecoveryState,
} from "@/lib/aftercare/demo-recovery-state";
import {
  firstSectionParagraph,
  sectionBodyParagraphs,
} from "@/lib/aftercare/section-body";

import styles from "../patient.module.css";

export function DemoToday({
  recovery,
  today,
  clinicName,
  phoneHref,
  phoneDisplay,
}: {
  recovery: ResolvedRecoveryState;
  today: DemoTodayContent;
  clinicName: string;
  phoneHref: string | null;
  phoneDisplay: string | null;
}) {
  const progressPercent =
    recovery.progress === null ? null : Math.round(recovery.progress * 100);
  const comingNextLabel = today.comingNext
    ? [today.comingNext.periodLabel, today.comingNext.title]
        .filter(Boolean)
        .join(" · ")
    : null;

  return (
    <div className={styles.today}>
      <section
        className={styles.todayFocus}
        aria-labelledby="today-focus-heading"
      >
        <p className={styles.kicker}>Today's focus</p>
        <h2 id="today-focus-heading" className={styles.todayDay}>
          Day {recovery.simulatedDay} of {recovery.windowDays}
        </h2>
        {recovery.currentStage ? (
          <p className={styles.todayStage}>{recovery.currentStage.title}</p>
        ) : null}
        {progressPercent !== null ? (
          <div
            className={styles.progress}
            role="progressbar"
            aria-label={`Recovery day ${recovery.simulatedDay} of ${recovery.windowDays}`}
            aria-valuemin={0}
            aria-valuemax={recovery.windowDays}
            aria-valuenow={recovery.simulatedDay}
          >
            <span
              className={styles.progressFill}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        ) : null}
      </section>

      {today.whatToDo ? (
        <section
          className={styles.todayBlock}
          aria-labelledby="today-do-heading"
        >
          <h2 id="today-do-heading" className={styles.sectionTitle}>
            What to do today
          </h2>
          {sectionBodyParagraphs(today.whatToDo.body).map(
            (paragraph, index) => (
              <p key={`do-${index}`} className={styles.body}>
                {paragraph}
              </p>
            )
          )}
        </section>
      ) : null}

      {today.whatIsNormal ? (
        <section
          className={styles.todayBlock}
          aria-labelledby="today-normal-heading"
        >
          <h2 id="today-normal-heading" className={styles.sectionTitle}>
            What's normal today
          </h2>
          <p className={styles.body}>
            {firstSectionParagraph(today.whatIsNormal.body)}
          </p>
        </section>
      ) : null}

      {comingNextLabel ? (
        <section
          className={styles.todayBlock}
          aria-labelledby="today-next-heading"
        >
          <h2 id="today-next-heading" className={styles.sectionTitle}>
            Coming next
          </h2>
          <p className={styles.body}>{comingNextLabel}</p>
        </section>
      ) : null}

      <section
        className={styles.todayBlock}
        aria-labelledby="today-help-heading"
      >
        <h2 id="today-help-heading" className={styles.sectionTitle}>
          Need help?
        </h2>
        {phoneHref ? (
          <p className={styles.body}>
            Call{" "}
            <a className={styles.inlineLink} href={phoneHref}>
              {clinicName}
              {phoneDisplay ? ` on ${phoneDisplay}` : ""}
            </a>
            .
          </p>
        ) : (
          <p className={styles.body}>Contact {clinicName} if you are unsure.</p>
        )}
      </section>

      {today.alerts.map((alert) => (
        <section
          key={alert.key}
          className={`${styles.section} ${
            alert.tone === "emergency" ? styles.emergency : styles.warning
          }`}
          data-today-alert={alert.key}
          data-tone={alert.tone}
          aria-labelledby={`today-alert-${alert.key}`}
        >
          <h2 id={`today-alert-${alert.key}`} className={styles.sectionTitle}>
            <span className={styles.vh}>Important. </span>
            {alert.title}
          </h2>
          {sectionBodyParagraphs(alert.body).map((paragraph, index) => (
            <p key={`${alert.key}-${index}`} className={styles.body}>
              {paragraph}
            </p>
          ))}
        </section>
      ))}
    </div>
  );
}
