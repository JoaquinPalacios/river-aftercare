"use client";

import { MarketingRevealCard } from "@/app/(marketing)/components/marketing-reveal";

import styles from "../marketing.module.css";

const PILLARS = [
  {
    key: "clinic",
    title: "Looks like your clinic",
    copy: "Your clinic name, colours and terminology stay front and centre.",
    points: ["Controlled brand choices", "Clinic-first presentation"],
  },
  {
    key: "patients",
    title: "Easy for patients to revisit",
    copy: "Give patients one clear place to return to instead of relying on memory, paper or an old attachment.",
    points: ["Durable link", "Readable on a phone", "Clinic contact nearby"],
  },
  {
    key: "operate",
    title: "Simple for your team",
    copy: "Publish approved guidance without rebuilding a page every time.",
    points: ["Reusable guides", "Consistent presentation", "Assisted setup"],
  },
] as const;

export function MarketingPillars() {
  return (
    <div className={styles.pillarStack} data-mk-pillars="">
      <div className={styles.pillarGrid}>
        {PILLARS.map((pillar, index) => (
          <MarketingRevealCard
            key={pillar.key}
            index={index}
            className={styles.pillarRevealSlot}
          >
            <article className={styles.pillarCard} data-mk-pillar="">
              <PillarVisual kind={pillar.key} />
              <h3>{pillar.title}</h3>
              <p>{pillar.copy}</p>
              <ul className={styles.pillarPoints}>
                {pillar.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </article>
          </MarketingRevealCard>
        ))}
      </div>
      <MarketingRevealCard index={PILLARS.length}>
        <div className={styles.customStrip} data-mk-custom-strip="">
          <div className={styles.customCopy}>
            <h3>Controlled publishing</h3>
            <p>
              Adapt guidance to the clinic while keeping the patient experience
              structured and readable.
            </p>
          </div>
          <div className={styles.customGroup} aria-hidden="true">
            <p className={styles.customLabel}>Brand</p>
            <div className={styles.customSwatches}>
              <span className={styles.customSwatchItem}>
                <span className={`${styles.swatch} ${styles.swatchPrimary}`} />
                Primary
              </span>
              <span className={styles.customSwatchItem}>
                <span className={`${styles.swatch} ${styles.swatchAccent}`} />
                Accent
              </span>
            </div>
          </div>
          <div className={styles.customGroup} aria-hidden="true">
            <p className={styles.customLabel}>Corners</p>
            <div className={styles.radiusRow}>
              <span className={`${styles.radiusChip} ${styles.radiusSharp}`}>
                Sharp
              </span>
              <span className={`${styles.radiusChip} ${styles.radiusMedium}`}>
                Medium
              </span>
              <span className={`${styles.radiusChip} ${styles.radiusSoft}`}>
                Soft
              </span>
            </div>
          </div>
          <div className={styles.customGroup} aria-hidden="true">
            <p className={styles.customLabel}>Appearance</p>
            <div className={styles.themeChips}>
              <span className={styles.themeChip}>Light</span>
              <span className={styles.themeChip}>Dark</span>
              <span
                className={`${styles.themeChip} ${styles.themeChipCurrent}`}
              >
                System
              </span>
            </div>
          </div>
        </div>
      </MarketingRevealCard>
    </div>
  );
}

function PillarVisual({ kind }: { kind: (typeof PILLARS)[number]["key"] }) {
  if (kind === "clinic") {
    return (
      <div className={styles.pillarVisual} aria-hidden="true">
        <div className={styles.clinicMarkRow}>
          <span className={styles.clinicMark} />
          <span className={styles.clinicName} translate="no">
            Riverside Dental
          </span>
        </div>
        <div className={styles.microBrand}>
          <span className={`${styles.swatch} ${styles.swatchTeal}`} />
          <span className={`${styles.swatch} ${styles.swatchNavy}`} />
          <span className={`${styles.swatch} ${styles.swatchWarm}`} />
        </div>
        <p className={styles.termHint}>Post-treatment instructions</p>
        <div className={styles.radiusExamples}>
          <span className={styles.radiusSharp} />
          <span className={styles.radiusMedium} />
          <span className={styles.radiusSoft} />
        </div>
      </div>
    );
  }

  if (kind === "patients") {
    return (
      <div
        className={`${styles.pillarVisual} ${styles.patientPreview}`}
        aria-hidden="true"
      >
        <span className={styles.phoneOutline}>
          <span className={styles.typeLine} />
          <span className={`${styles.typeLine} ${styles.typeLineMid}`} />
          <span className={`${styles.microTimeline} ${styles.previewTimeline}`}>
            <span
              className={`${styles.timelineDot} ${styles.timelineDotCurrent}`}
            />
            <span className={styles.timelineRule} />
            <span className={styles.timelineDot} />
            <span className={styles.timelineRule} />
            <span
              className={`${styles.timelineDot} ${styles.timelineDotDone}`}
            />
          </span>
        </span>
        <div className={styles.patientHints}>
          <span className={styles.urlStrip} translate="no">
            riverside.[your-domain]/extraction
          </span>
          <span className={styles.contactChip}>Call the practice →</span>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.pillarVisual} aria-hidden="true">
      <span className={styles.guideRow}>
        <span className={styles.guideCheck} />
        Tooth Extraction
      </span>
      <span className={`${styles.guideRow} ${styles.guideRowQuiet}`}>
        More templates at onboarding
      </span>
      <span className={`${styles.guideRow} ${styles.guideRowQuiet}`}>
        Custom clinic guides
      </span>
    </div>
  );
}
