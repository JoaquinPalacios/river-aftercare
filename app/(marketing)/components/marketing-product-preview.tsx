import type { ReactNode } from "react";

import {
  MARKETING_DEMO_CALL_LABEL,
  MARKETING_DEMO_CLINIC_NAME,
  MARKETING_DEMO_COMING_NEXT_LABEL,
  MARKETING_DEMO_CURRENT_LABEL,
  MARKETING_DEMO_GUIDE_TITLE,
  MARKETING_DEMO_INSTRUCTIONS_LABEL,
  MARKETING_DEMO_RECOVERY_HEADING,
  MARKETING_DEMO_THEME_APPEARANCE,
  MARKETING_DEMO_THEME_SCOPE,
  MARKETING_DEMO_TIMELINE,
  MARKETING_DEMO_TIMELINE_LABEL,
  MARKETING_DEMO_TODAY_LABEL,
} from "@/lib/marketing/demo-patient-preview";

import styles from "../marketing.module.css";

const IPHONE_FRAME = {
  src: "/marketing/iphone-frame.webp",
  width: 800,
  height: 1620,
} as const;

const PHONE_TODAY_ID = "mk-phone-today";
const PHONE_TIMELINE_ID = "mk-phone-timeline";
const PHONE_VIEW_NAME = "mk-phone-preview-view";

const CURRENT_STAGE = MARKETING_DEMO_TIMELINE.find(
  (stage) => stage.status === "current"
);
const UPCOMING_STAGES = MARKETING_DEMO_TIMELINE.filter(
  (stage) => stage.status === "upcoming"
);

/**
 * Marketing product proof.
 *
 * Architecture (server-rendered; no video yet):
 *   PhoneShell → PhoneScreen → ProductPreviewScreen
 *
 * Device frame: Rivers Digital Catión case-study iPhone mockup
 * (Sanity `cationBlue.png`, 1450×2936 PNG with alpha). The screen
 * opening is transparent so this preview stays live HTML/CSS.
 *
 * Today / Timeline is a CSS-only local toggle that mirrors the real
 * demodental patient demo. It does not call a product API.
 *
 * Patient light/dark follows the active marketing appearance via
 * shared aftercare tokens (`data-patient-theme="portal"`). This does
 * not change ClinicProfile.themeMode.
 *
 * Later, compose a short WebM + MP4 loop inside PhoneScreen
 * (autoplay, muted, loop, playsInline, poster). Do not use GIF.
 * See docs/product/WORKING-MEMORY.md (Phase 1F.9).
 */
export function MarketingProductPreview() {
  return (
    <div className={styles.deviceStage}>
      <div className={styles.deviceProof}>
        <PhoneShell>
          <PhoneScreen>
            <ProductPreviewScreen />
          </PhoneScreen>
        </PhoneShell>
      </div>
      <div className={styles.deviceNote}>
        <p className={styles.deviceNoteKicker}>Patient aftercare view</p>
        <ul className={styles.deviceNotePoints}>
          <li>No login</li>
          <li>No app to install</li>
          <li>Practice one tap away</li>
        </ul>
      </div>
    </div>
  );
}

function PhoneShell({ children }: { children: ReactNode }) {
  return (
    <div className={styles.phoneShell}>
      {children}
      {/* Native img keeps this Server Component JS-free and out of LCP. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className={styles.phoneFrame}
        src={IPHONE_FRAME.src}
        alt=""
        width={IPHONE_FRAME.width}
        height={IPHONE_FRAME.height}
        fetchPriority="low"
        draggable={false}
      />
    </div>
  );
}

function PhoneScreen({ children }: { children: ReactNode }) {
  return (
    <div
      className={`${styles.phoneScreen} ${MARKETING_DEMO_THEME_SCOPE}`}
      data-patient-theme={MARKETING_DEMO_THEME_APPEARANCE}
      data-mk-patient-surface="phone"
    >
      {children}
    </div>
  );
}

function ProductPreviewScreen() {
  return (
    <>
      <div className={styles.phoneBrand}>
        <span className={styles.phoneMark} />
        {MARKETING_DEMO_CLINIC_NAME}
      </div>
      <p className={styles.phoneKicker}>{MARKETING_DEMO_INSTRUCTIONS_LABEL}</p>
      <p className={styles.phoneTitle}>{MARKETING_DEMO_GUIDE_TITLE}</p>
      <div className={styles.phoneMain} data-mk-phone-preview="">
        <div
          className={styles.phoneSegments}
          role="radiogroup"
          aria-label="Recovery view"
        >
          <input
            className={`${styles.phoneViewRadio} ${styles.phoneViewToday}`}
            type="radio"
            name={PHONE_VIEW_NAME}
            id={PHONE_TODAY_ID}
            defaultChecked
          />
          <input
            className={`${styles.phoneViewRadio} ${styles.phoneViewTimeline}`}
            type="radio"
            name={PHONE_VIEW_NAME}
            id={PHONE_TIMELINE_ID}
          />
          <label className={styles.phoneSegment} htmlFor={PHONE_TODAY_ID}>
            {MARKETING_DEMO_TODAY_LABEL}
          </label>
          <label className={styles.phoneSegment} htmlFor={PHONE_TIMELINE_ID}>
            {MARKETING_DEMO_TIMELINE_LABEL}
          </label>
        </div>
        <div className={styles.phoneTodayPane}>
          <p className={styles.phoneViewKicker}>{MARKETING_DEMO_TODAY_LABEL}</p>
          {CURRENT_STAGE ? (
            <div
              className={`${styles.phoneStage} ${styles.phoneStageCurrent}`}
              data-status={CURRENT_STAGE.status}
            >
              <span className={styles.phoneStageRail} aria-hidden="true" />
              <div className={styles.phoneStageBody}>
                <p className={styles.phonePeriod}>{CURRENT_STAGE.period}</p>
                <p className={styles.phoneStageTitle}>{CURRENT_STAGE.title}</p>
                <p className={styles.phoneStageStatus}>
                  {MARKETING_DEMO_CURRENT_LABEL}
                </p>
                {"summary" in CURRENT_STAGE ? (
                  <p className={styles.phoneStageSummary}>
                    {CURRENT_STAGE.summary}
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}
          <div className={styles.phoneComingNext}>
            <p className={styles.phoneComingNextLabel}>
              {MARKETING_DEMO_COMING_NEXT_LABEL}
            </p>
            {UPCOMING_STAGES.map((stage) => (
              <p key={stage.period} className={styles.phoneComingNextItem}>
                {stage.period} — {stage.title}
              </p>
            ))}
          </div>
        </div>
        <div className={styles.phoneTimelinePane}>
          <div className={styles.phoneRecovery}>
            <p className={styles.phoneRecoveryTitle}>
              {MARKETING_DEMO_RECOVERY_HEADING}
            </p>
            <div className={styles.phoneTimeline}>
              {MARKETING_DEMO_TIMELINE.map((stage) => {
                const current = stage.status === "current";
                return (
                  <div
                    key={stage.period}
                    className={
                      current
                        ? `${styles.phoneStage} ${styles.phoneStageCurrent}`
                        : `${styles.phoneStage} ${styles.phoneStageUpcoming}`
                    }
                    data-status={stage.status}
                  >
                    <span
                      className={styles.phoneStageRail}
                      aria-hidden="true"
                    />
                    <div className={styles.phoneStageBody}>
                      <p className={styles.phonePeriod}>{stage.period}</p>
                      <p className={styles.phoneStageTitle}>{stage.title}</p>
                      {current ? (
                        <p className={styles.phoneStageStatus}>
                          {MARKETING_DEMO_CURRENT_LABEL}
                        </p>
                      ) : null}
                      {current && "summary" in stage ? (
                        <p className={styles.phoneStageSummary}>
                          {stage.summary}
                        </p>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
      <div className={styles.phoneHelp}>
        <p className={styles.phoneHelpLabel}>Questions about your recovery?</p>
        <p className={styles.phoneHelpAction}>{MARKETING_DEMO_CALL_LABEL}</p>
      </div>
    </>
  );
}
