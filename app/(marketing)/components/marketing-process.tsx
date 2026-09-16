"use client";

import { MarketingRevealCard } from "@/app/(marketing)/components/marketing-reveal";
import { PRODUCT_NAME } from "@/lib/branding/product-name";
import { railRevealVariants } from "@/lib/marketing/reveal-variants";

import styles from "../marketing.module.css";

const STEPS = [
  {
    index: "Step 1",
    node: "01",
    title: "Prepare the right guidance",
    copy: `Start with an available ${PRODUCT_NAME} template or clinic-approved guidance for the treatments and care your practice provides.`,
    visual: "guides",
  },
  {
    index: "Step 2",
    node: "02",
    title: "Apply your clinic brand",
    copy: "Use your clinic name, colours, terminology and controlled presentation settings so the guidance feels like part of your practice.",
    visual: "brand",
  },
  {
    index: "Step 3",
    node: "03",
    title: "Share by link or QR code",
    copy: "Give patients a stable URL they can save, scan or reopen after the appointment.",
    visual: "link",
  },
  {
    index: "Step 4",
    node: "04",
    title: "Patients return when they need it",
    copy: "The same guidance stays available whenever patients need to check it again, with the clinic still easy to contact.",
    visual: "revisit",
  },
] as const;

export function MarketingProcess() {
  return (
    <div className={styles.processJourney} data-mk-process="">
      <MarketingRevealCard
        as="span"
        index={0}
        variants={railRevealVariants}
        className={styles.processRail}
        rail
      >
        <span className={styles.processRailMark} />
        <span className={styles.processRailMark} />
        <span className={styles.processRailMark} />
      </MarketingRevealCard>
      <ol className={styles.processList}>
        {STEPS.map((step, index) => (
          <MarketingRevealCard
            key={step.node}
            as="li"
            index={index}
            className={styles.processStep}
            processCard
          >
            <div className={styles.processTrack} aria-hidden="true">
              <span className={styles.processNode}>{step.node}</span>
            </div>
            <div className={styles.processCard}>
              <div className={styles.processVisual}>
                <ProcessVisual kind={step.visual} />
              </div>
              <span className={styles.processIndex}>{step.index}</span>
              <h3>{step.title}</h3>
              <p>{step.copy}</p>
            </div>
            {index < STEPS.length - 1 ? (
              <span
                className={styles.processConnector}
                data-mk-process-connector=""
                aria-hidden="true"
              >
                <span className={styles.processConnectorLine} />
                <span className={styles.processConnectorArrow} />
              </span>
            ) : null}
          </MarketingRevealCard>
        ))}
      </ol>
    </div>
  );
}

function ProcessVisual({ kind }: { kind: (typeof STEPS)[number]["visual"] }) {
  if (kind === "guides") {
    return (
      <div className={styles.microVisual} aria-hidden="true">
        <span className={styles.guideBar} />
        <span className={`${styles.guideBar} ${styles.guideBarMid}`} />
        <span className={`${styles.guideBar} ${styles.guideBarShort}`} />
      </div>
    );
  }

  if (kind === "brand") {
    return (
      <div
        className={`${styles.microVisual} ${styles.microBrand}`}
        aria-hidden="true"
      >
        <span className={`${styles.swatch} ${styles.swatchTeal}`} />
        <span className={`${styles.swatch} ${styles.swatchNavy}`} />
        <span className={`${styles.swatch} ${styles.swatchWarm}`} />
        <span className={styles.radiusSample} />
      </div>
    );
  }

  if (kind === "link") {
    return (
      <div className={styles.microVisual} aria-hidden="true">
        <span className={styles.urlStrip} translate="no">
          riverside.[your-domain]/extraction
        </span>
      </div>
    );
  }

  return (
    <div
      className={`${styles.microVisual} ${styles.microTimeline}`}
      aria-hidden="true"
    >
      <span className={`${styles.timelineDot} ${styles.timelineDotCurrent}`} />
      <span className={styles.timelineRule} />
      <span className={styles.timelineDot} />
      <span className={styles.timelineRule} />
      <span className={`${styles.timelineDot} ${styles.timelineDotDone}`} />
    </div>
  );
}
