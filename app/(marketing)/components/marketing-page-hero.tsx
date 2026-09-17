import type { ReactNode } from "react";

import {
  MarketingRevealGroup,
  MarketingRevealItem,
} from "@/app/(marketing)/components/marketing-experience";
import { MarketingPageHeroEdge } from "@/app/(marketing)/components/marketing-page-hero-edge";
import { editorialRevealDelay } from "@/lib/marketing/reveal-timing";

import styles from "../marketing.module.css";

export type MarketingPageHeroVariant =
  | "pricing"
  | "contact"
  | "about"
  | "legal"
  | "dental"
  | "physiotherapy"
  | "chiropractic"
  | "cosmetic";

export function MarketingPageHero({
  variant,
  eyebrow,
  titleId,
  title,
  intro,
  actions,
  wideTitle = false,
}: {
  variant: MarketingPageHeroVariant;
  eyebrow: string;
  titleId: string;
  title: string;
  intro: string;
  actions?: ReactNode;
  wideTitle?: boolean;
}) {
  const heroClass =
    variant === "pricing" || variant === "dental" || variant === "cosmetic"
      ? styles.pageHeroPricing
      : styles.pageHeroContact;

  return (
    <section
      className={`${styles.pageHero} ${heroClass} ${styles.marketingBase}`}
      aria-labelledby={titleId}
      data-mk-page-hero={variant}
    >
      <div className={`${styles.inner} ${styles.pageHeroInner}`}>
        <MarketingRevealGroup>
          {variant === "dental" ? (
            <MarketingRevealItem delay={0}>
              <div className={styles.dentalHeroKicker} aria-hidden="true">
                <span className={styles.dentalHeroKickerDot} />
                <span>THE PATIENT JOURNEY, CONTINUED</span>
              </div>
            </MarketingRevealItem>
          ) : null}
          <MarketingRevealItem delay={0}>
            <p className={styles.eyebrow}>{eyebrow}</p>
          </MarketingRevealItem>
          <MarketingRevealItem delay={editorialRevealDelay(1)}>
            <h1
              id={titleId}
              className={
                wideTitle
                  ? `${styles.pageTitle} ${styles.pageTitleWide}`
                  : styles.pageTitle
              }
            >
              {title}
            </h1>
          </MarketingRevealItem>
          <MarketingRevealItem delay={editorialRevealDelay(2)}>
            <p className={`${styles.copy} ${styles.pageLede}`}>{intro}</p>
          </MarketingRevealItem>
          {actions ? (
            <MarketingRevealItem delay={editorialRevealDelay(3)}>
              <div className={styles.actions}>{actions}</div>
            </MarketingRevealItem>
          ) : null}
        </MarketingRevealGroup>
        {variant === "dental" ? (
          <div className={styles.dentalHeroVisual} aria-hidden="true">
            <div className={styles.dentalHeroCard}>
              <div className={styles.dentalHeroCardTop}>
                <span className={styles.dentalHeroBrandMark}>R</span>
                <span>Riverside Dental</span>
                <span className={styles.dentalHeroCardStatus}>LIVE</span>
              </div>
              <div className={styles.dentalHeroCardRule} />
              <p className={styles.dentalHeroCardEyebrow}>YOUR RECOVERY PLAN</p>
              <h2>Tooth extraction</h2>
              <p className={styles.dentalHeroCardIntro}>
                A calm, clear guide for the days ahead.
              </p>
              <div className={styles.dentalHeroTimeline}>
                <div className={styles.dentalHeroTimelineItem}>
                  <span>01</span>
                  <div>
                    <strong>Today</strong>
                    <small>Immediate care</small>
                  </div>
                </div>
                <div className={styles.dentalHeroTimelineItem}>
                  <span>02</span>
                  <div>
                    <strong>Days 2–3</strong>
                    <small>Early recovery</small>
                  </div>
                </div>
                <div className={styles.dentalHeroTimelineItem}>
                  <span>03</span>
                  <div>
                    <strong>Days 4–7</strong>
                    <small>Healing check</small>
                  </div>
                </div>
              </div>
              <div className={styles.dentalHeroCardFooter}>
                Open your care guide <span>↗</span>
              </div>
            </div>
          </div>
        ) : null}
      </div>
      <MarketingPageHeroEdge />
    </section>
  );
}
