import Link from "next/link";
import type { ReactNode } from "react";

import {
  MarketingRevealGroup,
  MarketingRevealItem,
} from "@/app/(marketing)/components/marketing-experience";
import { MarketingPageHeroEdge } from "@/app/(marketing)/components/marketing-page-hero-edge";
import { MarketingPrimaryLink } from "@/app/(marketing)/components/marketing-primary-link";
import { editorialRevealDelay } from "@/lib/marketing/reveal-timing";
import type { VerticalLandingContent } from "@/lib/marketing/vertical-landing";

import styles from "../marketing.module.css";

export function MarketingVerticalHero({
  content,
  secondary,
}: {
  content: VerticalLandingContent;
  secondary: ReactNode;
}) {
  const titleId = `${content.themeId}-hero`;

  return (
    <section
      className={`${styles.verticalHero} ${styles.marketingBase}`}
      aria-labelledby={titleId}
      data-mk-vertical-hero=""
    >
      <div className={`${styles.inner} ${styles.verticalHeroInner}`}>
        <MarketingRevealGroup>
          <div className={styles.verticalHeroCopy}>
            <MarketingRevealItem delay={0}>
              <p className={styles.eyebrow}>{content.hero.eyebrow}</p>
            </MarketingRevealItem>
            <MarketingRevealItem delay={editorialRevealDelay(1)}>
              <h1 id={titleId} className={styles.verticalHeroTitle}>
                {content.hero.h1}
              </h1>
            </MarketingRevealItem>
            <MarketingRevealItem delay={editorialRevealDelay(2)}>
              <p className={`${styles.copy} ${styles.verticalHeroLede}`}>
                {content.hero.body}
              </p>
            </MarketingRevealItem>
            <MarketingRevealItem delay={editorialRevealDelay(3)}>
              <div
                className={`${styles.actions} ${styles.heroActions}`}
                data-mk-hero-actions=""
              >
                <MarketingPrimaryLink href="/contact">
                  {content.hero.primaryCtaLabel}
                </MarketingPrimaryLink>
                {secondary}
              </div>
            </MarketingRevealItem>
          </div>
          <MarketingRevealItem
            delay={editorialRevealDelay(2)}
            className={styles.verticalHeroPanelSlot}
          >
            <aside
              className={styles.verticalHeroPanel}
              aria-label={content.hero.panel.label}
            >
              <ol className={styles.verticalHeroPathway}>
                {content.hero.panel.items.map((item, index) => (
                  <li key={item.title} className={styles.verticalHeroPathStep}>
                    <span
                      className={styles.verticalHeroPathIndex}
                      aria-hidden="true"
                    >
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div className={styles.verticalHeroPathCopy}>
                      <p className={styles.verticalHeroPathTitle}>
                        {item.title}
                      </p>
                      <p className={styles.verticalHeroPathBody}>{item.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </aside>
          </MarketingRevealItem>
        </MarketingRevealGroup>
      </div>
      <MarketingPageHeroEdge />
    </section>
  );
}

export function verticalHeroSecondary(
  content: VerticalLandingContent,
  demoHref: string
) {
  if (content.hero.secondaryCta.kind === "demo") {
    return (
      <a className={`${styles.button} ${styles.secondary}`} href={demoHref}>
        {content.hero.secondaryCta.label}
      </a>
    );
  }

  return (
    <Link
      className={`${styles.button} ${styles.secondary}`}
      href={content.hero.secondaryCta.href}
    >
      {content.hero.secondaryCta.label}
    </Link>
  );
}
